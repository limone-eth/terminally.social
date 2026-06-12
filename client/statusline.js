// Statusline entry point for Claude Code.
//
// Reads the statusline JSON from stdin, renders your existing statusline
// first (config.base_statusline, e.g. claude-hud), then appends one line of
// friends' presence.
//
// Statuslines re-render constantly, so this never does network I/O inline:
// it renders from the cache file and, when the cache is stale, spawns a
// detached `presence pull` that refreshes it for the next render.

import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, readCache, fmtTokens } from './lib.js'

const STALE_MS = 30 * 1000
const MAX_SHOWN = 4

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const STATUS_ICON = { working: '🟢', idle: '🌙', offline: '⚫' }
const STATUS_RANK = { working: 0, idle: 1, offline: 2 }

function timeAgo(ms) {
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function renderFriend(f) {
  const tokToday = fmtTokens(f.tokens_today)
  const name = `${STATUS_ICON[f.status]} ${f.emoji} ${f.username}${tokToday ? `${DIM} (${tokToday})${RESET}` : ''}`
  if (f.status === 'offline') {
    return `${name}${f.updated_at ? `${DIM} · ${timeAgo(f.updated_at)}${RESET}` : ''}`
  }
  const doing = f.summary || (f.status === 'working' ? 'working' : 'idle')
  const project = f.project ? `${DIM} (${f.project})${RESET}` : ''
  return `${name}${DIM} ·${RESET} ${doing}${project}`
}

function renderFeed(feed) {
  if (!feed || feed.length === 0) return null
  const sorted = [...feed].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (b.updated_at || 0) - (a.updated_at || 0)
  )
  const shown = sorted.slice(0, MAX_SHOWN).map(renderFriend)
  const extra = sorted.length - MAX_SHOWN
  if (extra > 0) shown.push(`${DIM}+${extra} more${RESET}`)
  return shown.join(`${DIM}  |  ${RESET}`)
}

async function readStdin() {
  if (process.stdin.isTTY) return ''
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function refreshInBackground() {
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'presence.js')
  spawn(process.execPath, [cli, 'pull'], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  }).unref()
}

const input = await readStdin()
const config = loadConfig()

// 1. render the base statusline (e.g. claude-hud) with the same stdin
if (config?.base_statusline) {
  const base = spawnSync('bash', ['-c', config.base_statusline], {
    input,
    encoding: 'utf8',
    timeout: 5000,
  })
  if (base.stdout) process.stdout.write(base.stdout.replace(/\n$/, '') + '\n')
}

// 2. append the friends line from cache
if (config?.token) {
  const cache = readCache()
  if (!cache || Date.now() - cache.fetched_at > STALE_MS) refreshInBackground()
  const line = renderFeed(cache?.feed)
  if (line) process.stdout.write(line + '\n')
}
