import http from 'node:http'
import crypto from 'node:crypto'
import { db, init } from './db.js'

const PORT = Number(process.env.PORT || 8787)
const MAX_BODY = 16 * 1024
const OFFLINE_AFTER_MS = 15 * 60 * 1000
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const USERNAME_RE = /^[a-z0-9_-]{2,20}$/
const STATUSES = new Set(['working', 'idle'])

// ---------- helpers ----------

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

function clean(value, maxLen) {
  if (typeof value !== 'string') return null
  const s = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, maxLen) : null
}

function validEmoji(value) {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!s || [...s].length > 4 || /[\u0000-\u001f\u007f\s]/.test(s)) return null
  return s
}

function json(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) })
  res.end(data)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('invalid JSON'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

async function authenticate(req) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(\S+)$/i)
  if (!match) return null
  const result = await db.execute({
    sql: 'SELECT id, username, emoji FROM users WHERE token_hash = ?',
    args: [sha256(match[1])],
  })
  return result.rows[0] || null
}

const pair = (a, b) => (a < b ? [a, b] : [b, a])

function inviteCode() {
  // unambiguous alphabet, 8 chars
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.randomBytes(8)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

function presenceView(row, now) {
  const updatedAt = row.updated_at ?? null
  const stale = updatedAt === null || now - updatedAt > OFFLINE_AFTER_MS
  return {
    username: row.username,
    emoji: row.emoji,
    status: stale ? 'offline' : row.status,
    project: stale ? null : row.project,
    summary: stale ? null : row.summary,
    updated_at: updatedAt,
  }
}

// ---------- route handlers ----------

async function registerUser(body) {
  const username = clean(body.username, 20)?.toLowerCase()
  if (!username || !USERNAME_RE.test(username)) {
    return [400, { error: 'username must match [a-z0-9_-]{2,20}' }]
  }
  const emoji = validEmoji(body.emoji) || '🙂'
  const token = crypto.randomBytes(24).toString('base64url')
  const id = crypto.randomUUID()
  try {
    await db.execute({
      sql: 'INSERT INTO users (id, username, emoji, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [id, username, emoji, sha256(token), Date.now()],
    })
  } catch (err) {
    if (String(err).includes('UNIQUE')) return [409, { error: 'username already taken' }]
    throw err
  }
  return [201, { id, username, emoji, token }]
}

async function updateProfile(user, body) {
  let username = user.username
  let emoji = user.emoji
  if (body.username !== undefined) {
    username = clean(body.username, 20)?.toLowerCase()
    if (!username || !USERNAME_RE.test(username)) {
      return [400, { error: 'username must match [a-z0-9_-]{2,20}' }]
    }
  }
  if (body.emoji !== undefined) {
    emoji = validEmoji(body.emoji)
    if (!emoji) return [400, { error: 'emoji must be 1-4 visible characters' }]
  }
  try {
    await db.execute({
      sql: 'UPDATE users SET username = ?, emoji = ? WHERE id = ?',
      args: [username, emoji, user.id],
    })
  } catch (err) {
    if (String(err).includes('UNIQUE')) return [409, { error: 'username already taken' }]
    throw err
  }
  return [200, { username, emoji }]
}

async function createInvite(user) {
  const code = inviteCode()
  const now = Date.now()
  await db.execute({
    sql: 'INSERT INTO invites (code, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    args: [code, user.id, now, now + INVITE_TTL_MS],
  })
  return [201, { code, expires_at: now + INVITE_TTL_MS }]
}

async function acceptInvite(user, body) {
  const code = clean(body.code, 32)?.toLowerCase()
  if (!code) return [400, { error: 'code is required' }]
  const result = await db.execute({ sql: 'SELECT * FROM invites WHERE code = ?', args: [code] })
  const invite = result.rows[0]
  if (!invite || invite.used_by || invite.expires_at < Date.now()) {
    return [404, { error: 'invite not found, expired, or already used' }]
  }
  if (invite.user_id === user.id) return [400, { error: 'cannot accept your own invite' }]

  const [a, b] = pair(user.id, invite.user_id)
  await db.execute({
    sql: 'INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)',
    args: [a, b, Date.now()],
  })
  await db.execute({ sql: 'UPDATE invites SET used_by = ? WHERE code = ?', args: [user.id, code] })
  const friend = await db.execute({
    sql: 'SELECT username, emoji FROM users WHERE id = ?',
    args: [invite.user_id],
  })
  return [201, { friend: friend.rows[0] }]
}

async function listFriends(user) {
  const result = await db.execute({
    sql: `SELECT u.username, u.emoji
          FROM friendships f
          JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
          WHERE f.user_a = ? OR f.user_b = ?
          ORDER BY u.username`,
    args: [user.id, user.id, user.id],
  })
  return [200, { friends: result.rows }]
}

async function removeFriend(user, username) {
  const result = await db.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: [username.toLowerCase()],
  })
  const other = result.rows[0]
  if (!other) return [404, { error: 'no such user' }]
  const [a, b] = pair(user.id, other.id)
  await db.execute({ sql: 'DELETE FROM friendships WHERE user_a = ? AND user_b = ?', args: [a, b] })
  return [200, { removed: username.toLowerCase() }]
}

async function updatePresence(user, body) {
  const status = body.status
  if (!STATUSES.has(status)) return [400, { error: "status must be 'working' or 'idle'" }]
  const project = clean(body.project, 40)
  const now = Date.now()

  if ('summary' in body) {
    // Summaries arrive pre-sanitized by the client (client/summarize.js).
    // Length/charset cleanup here is defense in depth, not the privacy layer.
    const summary = clean(body.summary, 100)
    await db.execute({
      sql: `INSERT INTO presence (user_id, status, project, summary, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (user_id) DO UPDATE SET
              status = excluded.status, project = excluded.project,
              summary = excluded.summary, updated_at = excluded.updated_at`,
      args: [user.id, status, project, summary, now],
    })
  } else {
    await db.execute({
      sql: `INSERT INTO presence (user_id, status, project, summary, updated_at) VALUES (?, ?, ?, NULL, ?)
            ON CONFLICT (user_id) DO UPDATE SET
              status = excluded.status, project = excluded.project, updated_at = excluded.updated_at`,
      args: [user.id, status, project, now],
    })
  }
  return [200, { ok: true }]
}

async function getFeed(user) {
  const result = await db.execute({
    sql: `SELECT u.username, u.emoji, p.status, p.project, p.summary, p.updated_at
          FROM friendships f
          JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
          LEFT JOIN presence p ON p.user_id = u.id
          WHERE f.user_a = ? OR f.user_b = ?`,
    args: [user.id, user.id, user.id],
  })
  const now = Date.now()
  return [200, { feed: result.rows.map((row) => presenceView(row, now)) }]
}

// ---------- server ----------

export async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost')
    const route = `${req.method} ${url.pathname}`
    try {
      if (route === 'GET /healthz') return json(res, 200, { ok: true })

      if (route === 'POST /v1/users') {
        const [status, body] = await registerUser(await readBody(req))
        return json(res, status, body)
      }

      const user = await authenticate(req)
      if (!user) return json(res, 401, { error: 'missing or invalid token' })

      if (route === 'GET /v1/me') return json(res, 200, user)
      if (route === 'PATCH /v1/me') return json(res, ...(await updateProfile(user, await readBody(req))))
      if (route === 'POST /v1/invites') return json(res, ...(await createInvite(user)))
      if (route === 'POST /v1/friends') return json(res, ...(await acceptInvite(user, await readBody(req))))
      if (route === 'GET /v1/friends') return json(res, ...(await listFriends(user)))
      if (req.method === 'DELETE' && url.pathname.startsWith('/v1/friends/')) {
        const username = decodeURIComponent(url.pathname.slice('/v1/friends/'.length))
        return json(res, ...(await removeFriend(user, username)))
      }
      if (route === 'POST /v1/presence') return json(res, ...(await updatePresence(user, await readBody(req))))
      if (route === 'GET /v1/feed') return json(res, ...(await getFeed(user)))

      return json(res, 404, { error: 'not found' })
    } catch (err) {
      // Log method/path/status only — request bodies are never logged.
      console.error(`${route} -> ${err.status || 500} ${err.message}`)
      return json(res, err.status || 500, { error: err.status ? err.message : 'internal error' })
    }
}

export function createApp() {
  return http.createServer(handler)
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await init()
  createApp().listen(PORT, () => console.log(`terminally-online server on :${PORT}`))
}
