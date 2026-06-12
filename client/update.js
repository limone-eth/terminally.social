// Self-update — keeps every friend's install on the latest code.
//
// Called from `presence pull` (which the statusline triggers every ~30s):
// at most once every 10 minutes, spawn a detached fast-forward pull of the
// install repo + a dependency refresh. Best-effort by design: failures are
// silent, local changes block the ff-only pull harmlessly, and nothing here
// can slow down a statusline render or break a Claude session.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOME } from './lib.js'

const STAMP = path.join(HOME, 'cache', 'last-update-check')
const EVERY_MS = 10 * 60 * 1000

export function maybeSelfUpdate() {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    if (!fs.existsSync(path.join(root, '.git'))) return false
    let last = 0
    try { last = fs.statSync(STAMP).mtimeMs } catch { /* first run */ }
    if (Date.now() - last < EVERY_MS) return false
    fs.mkdirSync(path.dirname(STAMP), { recursive: true })
    fs.writeFileSync(STAMP, new Date().toISOString() + '\n')
    spawn('bash', ['-c', `git -C "${root}" pull --ff-only --quiet && npm --prefix "${root}" install --omit=dev --silent --no-audit --no-fund`], {
      detached: true,
      stdio: 'ignore',
    }).unref()
    return true
  } catch {
    return false
  }
}
