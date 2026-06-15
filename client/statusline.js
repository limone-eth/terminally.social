// Statusline entry point for Claude Code.
//
// Reads the statusline JSON from stdin, renders your existing statusline
// first (config.base_statusline, e.g. claude-hud), then appends one line of
// friends' presence.
//
// Robustness contract: this script must NEVER blank your statusline. Every
// section is isolated in its own try/catch, it always exits 0, and if there
// is no usable base statusline it falls back to a built-in `[model] dir`
// line — so a bug here can only ever ADD a line, never remove yours.
//
// Statuslines re-render constantly, so this never does network I/O inline:
// it renders from the cache file and, when the cache is stale, spawns a
// detached `presence pull` that refreshes it for the next render.

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, readCache, fmtTokens, HOME } from './lib.js'

const STALE_MS = 30 * 1000
const MAX_SHOWN = 4
// statuslines re-render very frequently; without this guard a single stale
// window spawns one detached `pull` per render until the cache is rewritten.
const PULL_LOCK = path.join(HOME, 'cache', 'pull.lock')
const PULL_LOCK_MS = 5000

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

// Minimal built-in statusline, used only when there is no usable base.
// Guarantees the line is never empty even on a fresh install with no base.
function renderBuiltinBase(input) {
  let data
  try { data = JSON.parse(input) } catch { return null }
  if (!data || typeof data !== 'object') return null
  const model = data.model?.display_name || data.model?.id || ''
  const dir = data.workspace?.current_dir || data.workspace?.project_dir || data.cwd || ''
  const base = dir ? path.basename(dir) : ''
  const parts = []
  if (model) parts.push(`${DIM}[${RESET}${model}${DIM}]${RESET}`)
  if (base) parts.push(base)
  return parts.length ? parts.join(' ') : null
}

async function readStdin() {
  if (process.stdin.isTTY) return ''
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function refreshInBackground() {
  // skip if a refresh was kicked off in the last few seconds (one in flight)
  try {
    const last = fs.statSync(PULL_LOCK).mtimeMs
    if (Date.now() - last < PULL_LOCK_MS) return
  } catch { /* no lock yet */ }
  try {
    fs.mkdirSync(path.dirname(PULL_LOCK), { recursive: true })
    fs.writeFileSync(PULL_LOCK, '')
  } catch { /* best effort */ }
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'presence.js')
  spawn(process.execPath, [cli, 'pull'], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  }).unref()
}

async function main() {
  const input = await readStdin().catch(() => '')
  let config = null
  try { config = loadConfig() } catch { /* loadConfig is already guarded, but be safe */ }

  // 1. Base statusline — must always produce a line. Never recurse into our
  //    own statusline (a stale or self-referential base would loop or hang).
  let baseRendered = false
  try {
    const base = config?.base_statusline
    if (base && !/statusline\.js/.test(base)) {
      const r = spawnSync('bash', ['-c', base], { input, encoding: 'utf8', timeout: 5000 })
      if (r.stdout && r.stdout.trim()) {
        process.stdout.write(r.stdout.replace(/\n$/, '') + '\n')
        baseRendered = true
      }
    }
  } catch { /* fall through to the built-in base */ }

  if (!baseRendered) {
    try {
      const builtin = renderBuiltinBase(input)
      if (builtin) process.stdout.write(builtin + '\n')
    } catch { /* nothing else we can safely do */ }
  }

  // 2. Friends line — purely additive and fully isolated.
  try {
    if (config?.token) {
      const cache = readCache()
      if (!cache || Date.now() - cache.fetched_at > STALE_MS) refreshInBackground()
      const line = renderFeed(cache?.feed)
      if (line) process.stdout.write(line + '\n')
    }
  } catch { /* a friends-line failure must never affect the base */ }
}

// Always succeed — a non-zero exit or uncaught throw blanks the statusline.
main().then(() => process.exit(0)).catch(() => process.exit(0))
