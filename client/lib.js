import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// TERMINALLY_SOCIAL_HOME lets the sandbox (and tests) keep a fully separate
// identity from your real one.
export const HOME =
  process.env.TERMINALLY_SOCIAL_HOME || path.join(os.homedir(), '.config', 'terminally.social')

export const CONFIG_PATH = path.join(HOME, 'config.json')
export const CACHE_PATH = path.join(HOME, 'cache', 'feed.json')

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch {
    return null
  }
}

export function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
}

export function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
  } catch {
    return null
  }
}

export function writeCache(feed) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify({ fetched_at: Date.now(), feed }) + '\n')
}

export async function api(config, method, apiPath, body, { timeoutMs = 4000 } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (config.token) headers.authorization = `Bearer ${config.token}`
  const res = await fetch(config.server + apiPath, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `${method} ${apiPath} failed (${res.status})`)
  }
  return data
}
