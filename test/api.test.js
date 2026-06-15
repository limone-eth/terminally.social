import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// point the server at a throwaway embedded db BEFORE importing it
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'terminally.social-test-'))
process.env.LIBSQL_URL = `file:${path.join(tmp, 'test.db')}`

const { createApp } = await import('../server/index.js')
const { init, db } = await import('../server/db.js')

await init()
const server = createApp().listen(0)
const base = `http://127.0.0.1:${server.address().port}`

async function call(method, apiPath, { token, body } = {}) {
  const res = await fetch(base + apiPath, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

let alice, bob

test.after(() => server.close())

test('register users with profile', async () => {
  const a = await call('POST', '/v1/users', { body: { username: 'alice', emoji: '🦊' } })
  assert.equal(a.status, 201)
  assert.equal(a.body.emoji, '🦊')
  assert.ok(a.body.token)
  alice = a.body

  const b = await call('POST', '/v1/users', { body: { username: 'bob' } })
  assert.equal(b.status, 201)
  bob = b.body

  const dup = await call('POST', '/v1/users', { body: { username: 'alice' } })
  assert.equal(dup.status, 409)

  const bad = await call('POST', '/v1/users', { body: { username: 'Has Spaces!' } })
  assert.equal(bad.status, 400)
})

test('rejects missing token', async () => {
  const res = await call('GET', '/v1/feed')
  assert.equal(res.status, 401)
})

test('profile customization (emoji + username)', async () => {
  const res = await call('PATCH', '/v1/me', { token: bob.token, body: { emoji: '🐙', username: 'bobby' } })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { username: 'bobby', emoji: '🐙' })

  const taken = await call('PATCH', '/v1/me', { token: bob.token, body: { username: 'alice' } })
  assert.equal(taken.status, 409)
})

test('friend flow: invite -> accept -> list', async () => {
  const invite = await call('POST', '/v1/invites', { token: alice.token })
  assert.equal(invite.status, 201)

  const own = await call('POST', '/v1/friends', { token: alice.token, body: { code: invite.body.code } })
  assert.equal(own.status, 400)

  const accept = await call('POST', '/v1/friends', { token: bob.token, body: { code: invite.body.code } })
  assert.equal(accept.status, 201)
  assert.equal(accept.body.friend.username, 'alice')

  const reuse = await call('POST', '/v1/friends', { token: bob.token, body: { code: invite.body.code } })
  assert.equal(reuse.status, 404)

  const friends = await call('GET', '/v1/friends', { token: alice.token })
  assert.deepEqual(friends.body.friends, [{ username: 'bobby', emoji: '🐙' }])
})

test('presence flows to friends feed', async () => {
  const post = await call('POST', '/v1/presence', {
    token: alice.token,
    body: { status: 'working', project: 'zine-gen', summary: 'fixing the build' },
  })
  assert.equal(post.status, 200)

  const feed = await call('GET', '/v1/feed', { token: bob.token })
  assert.equal(feed.status, 200)
  const entry = feed.body.feed.find((f) => f.username === 'alice')
  assert.equal(entry.status, 'working')
  assert.equal(entry.summary, 'fixing the build')
  assert.equal(entry.project, 'zine-gen')
})

test('presence without summary keeps the previous one', async () => {
  await call('POST', '/v1/presence', { token: alice.token, body: { status: 'idle', project: 'zine-gen' } })
  const feed = await call('GET', '/v1/feed', { token: bob.token })
  const entry = feed.body.feed.find((f) => f.username === 'alice')
  assert.equal(entry.status, 'idle')
  assert.equal(entry.summary, 'fixing the build')
})

test('server enforces summary limits as defense in depth', async () => {
  await call('POST', '/v1/presence', {
    token: alice.token,
    body: { status: 'working', summary: 'x'.repeat(500) + '\nline2' },
  })
  const feed = await call('GET', '/v1/feed', { token: bob.token })
  const entry = feed.body.feed.find((f) => f.username === 'alice')
  assert.ok(entry.summary.length <= 100)
  assert.ok(!entry.summary.includes('\n'))

  const bad = await call('POST', '/v1/presence', { token: alice.token, body: { status: 'hacking' } })
  assert.equal(bad.status, 400)
})

test('usage aggregates per day into the feed', async () => {
  await call('POST', '/v1/usage', { token: alice.token, body: { session_id: 's1', tokens: 500_000 } })
  await call('POST', '/v1/usage', { token: alice.token, body: { session_id: 's1', tokens: 800_000 } }) // re-post: absolute, not additive
  await call('POST', '/v1/usage', { token: alice.token, body: { session_id: 's2', tokens: 200_000 } })
  await call('POST', '/v1/usage', { token: bob.token, body: { session_id: 's9', tokens: 50_000 } })

  const feed = await call('GET', '/v1/feed', { token: bob.token })
  const entry = feed.body.feed.find((f) => f.username === 'alice')
  assert.equal(entry.tokens_today, 1_000_000)
  assert.equal(feed.body.me.tokens_today, 50_000)

  const bad = await call('POST', '/v1/usage', { token: bob.token, body: { session_id: 's9', tokens: -5 } })
  assert.equal(bad.status, 400)
})

test('tokens_today counts only today for a session spanning midnight UTC', async () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  // alice's "overnight" session already logged 1.0M before midnight (yesterday's row)
  await db.execute({
    sql: 'INSERT INTO usage (user_id, session_id, day, tokens, updated_at) VALUES (?, ?, ?, ?, ?)',
    args: [alice.id, 'overnight', yesterday, 1_000_000, Date.now()],
  })
  // she keeps working in the SAME session past midnight; client re-posts the absolute total (1.2M)
  await call('POST', '/v1/usage', { token: alice.token, body: { session_id: 'overnight', tokens: 1_200_000 } })

  const feed = await call('GET', '/v1/feed', { token: bob.token })
  const entry = feed.body.feed.find((f) => f.username === 'alice')
  // only the 0.2M burned today is added, not the full 1.2M:
  // 800k (s1) + 200k (s2) + 200k (overnight today) = 1.2M  (the bug would give 2.2M)
  assert.equal(entry.tokens_today, 1_200_000)
})

test('unfriending removes feed access', async () => {
  const res = await call('DELETE', '/v1/friends/alice', { token: bob.token })
  assert.equal(res.status, 200)
  const feed = await call('GET', '/v1/feed', { token: bob.token })
  assert.deepEqual(feed.body.feed, [])
})

test('stats: public counts without a token, no roster', async () => {
  const res = await call('GET', '/v1/stats')
  assert.equal(res.status, 200)
  assert.equal(res.body.users, 2) // alice + bob
  assert.equal(typeof res.body.users_today, 'number')
  assert.equal(typeof res.body.presence_active, 'number')
  assert.equal(typeof res.body.tokens_today, 'number')
  // roster must NOT leak to unauthenticated callers
  assert.equal(res.body.recent, undefined)
})

test('stats: roster included only with a valid token', async () => {
  const res = await call('GET', '/v1/stats', { token: alice.token })
  assert.equal(res.status, 200)
  assert.ok(Array.isArray(res.body.recent))
  const names = res.body.recent.map((r) => r.username).sort()
  assert.deepEqual(names, ['alice', 'bobby']) // bob was renamed to bobby earlier
  // never expose token hashes or ids
  assert.ok(res.body.recent.every((r) => !('token_hash' in r) && !('id' in r)))
})
