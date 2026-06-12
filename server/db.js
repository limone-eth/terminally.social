import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const url = process.env.LIBSQL_URL || 'http://127.0.0.1:8088'

export const db = createClient({
  url,
  authToken: process.env.LIBSQL_AUTH_TOKEN || undefined,
})

export async function init() {
  const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql')
  const statements = readFileSync(schemaPath, 'utf8')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  // Retry a few times so the server can boot while the database container
  // is still coming up.
  let lastErr
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      for (const stmt of statements) await db.execute(stmt)
      return
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw lastErr
}
