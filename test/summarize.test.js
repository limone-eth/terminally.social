import test from 'node:test'
import assert from 'node:assert/strict'
import { summarize } from '../client/summarize.js'

test('takes only the first non-empty line', () => {
  assert.equal(summarize('\n\nfix the login bug\nand here is a huge paste...'), 'fix the login bug')
})

test('strips fenced code blocks, including unterminated ones', () => {
  assert.equal(summarize('```js\nconst secret = "hunter2"\n```\nrefactor this'), 'refactor this')
  assert.equal(summarize('help me\n```\npassword=hunter2'), 'help me')
})

test('strips inline code spans', () => {
  assert.equal(summarize('why does `process.env.STRIPE_SECRET_KEY` break'), 'why does break')
})

test('redacts API-key shapes', () => {
  assert.equal(
    summarize('my key sk-ant-abc123def456ghi789 stopped working'),
    'my key [redacted] stopped working'
  )
  assert.equal(summarize('use ghp_aBcDeF123456789 for auth'), 'use [redacted] for auth')
  assert.equal(summarize('AKIAIOSFODNN7EXAMPLE is the id'), '[redacted] is the id')
})

test('redacts key=value style secrets', () => {
  assert.equal(summarize('set PASSWORD=hunter2 in env'), 'set PASSWORD=[redacted] in env')
  assert.equal(summarize('api_key: abc123 is failing'), 'api_key: [redacted] is failing')
})

test('redacts JWTs and long opaque blobs', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  assert.equal(summarize(`why is ${jwt} rejected`), 'why is [redacted] rejected')
  assert.equal(
    summarize('hash a1b2c3d4e5f6a1b2c3d4e5f6a1b2 mismatch'),
    'hash [redacted] mismatch'
  )
})

test('redacts URLs, emails, and home paths', () => {
  assert.equal(summarize('fetch https://internal.corp/x?token=1 please'), 'fetch [link] please')
  assert.equal(summarize('email simone@example.com the report'), 'email [email] the report')
  assert.equal(summarize('open /Users/limone/Documents/x.txt now'), 'open ~/Documents/x.txt now')
})

test('truncates to 80 chars with ellipsis', () => {
  const result = summarize('please refactor the entire onboarding flow so that '.repeat(5))
  assert.ok(result.length <= 80)
  assert.ok(result.endsWith('…'))
})

test('returns null for empty or non-string input', () => {
  assert.equal(summarize(''), null)
  assert.equal(summarize('```\nonly code\n```'), null)
  assert.equal(summarize(undefined), null)
})
