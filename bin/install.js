#!/usr/bin/env node
// Wires terminally.social into your real Claude Code setup (~/.claude/settings.json).
//
// - Backs up settings.json first (settings.json.terminally-social-backup-<ts>)
// - Moves your current statusLine command into terminally.social's config as
//   `base_statusline`, so your existing statusline (e.g. claude-hud) still
//   renders — the friends line is appended below it.
// - Adds hooks for UserPromptSubmit / Stop / SessionStart / SessionEnd that
//   call client/hook.js. Existing hooks are preserved.
//
// Run manually with: npm run install-client
// Undo with the printed backup file, or: node bin/install.js --uninstall

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, saveConfig } from '../client/lib.js'

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json')
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const HOOK_CMD = `"${process.execPath}" "${path.join(ROOT, 'client', 'hook.js')}"`
const STATUSLINE_CMD = `"${process.execPath}" "${path.join(ROOT, 'client', 'statusline.js')}"`
const HOOK_EVENTS = ['UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd']

const uninstall = process.argv.includes('--uninstall')

const config = loadConfig()
if (!uninstall && !config?.token) {
  console.error('register first: node client/presence.js register <username> --server <url>')
  process.exit(1)
}

const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
const backupPath = `${SETTINGS_PATH}.terminally-social-backup-${Date.now()}`
fs.copyFileSync(SETTINGS_PATH, backupPath)
console.log(`backup: ${backupPath}`)

if (uninstall) {
  if (settings.statusLine?.command === STATUSLINE_CMD && config?.base_statusline) {
    settings.statusLine.command = config.base_statusline
  }
  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(settings.hooks?.[event])) continue
    settings.hooks[event] = settings.hooks[event]
      .map((entry) => ({
        ...entry,
        hooks: (entry.hooks || []).filter((h) => h.command !== HOOK_CMD),
      }))
      .filter((entry) => entry.hooks.length > 0)
    if (settings.hooks[event].length === 0) delete settings.hooks[event]
  }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
  console.log('terminally.social hooks and statusline removed')
  process.exit(0)
}

// statusline: preserve the existing command as the base
// NEVER capture our own statusline as the base (even from a different/old
// install path) — that would make statusline.js shell into itself and loop,
// blanking the line.
const current = settings.statusLine?.command
const currentIsOurs = current && /statusline\.js/.test(current)
if (current && !currentIsOurs) {
  saveConfig({ ...config, base_statusline: current })
  console.log('existing statusline preserved as base_statusline')
}
settings.statusLine = { type: 'command', command: STATUSLINE_CMD }

// hooks: append ours, keep everything already there
settings.hooks ||= {}
for (const event of HOOK_EVENTS) {
  settings.hooks[event] ||= []
  const exists = settings.hooks[event].some((entry) =>
    (entry.hooks || []).some((h) => h.command === HOOK_CMD)
  )
  if (!exists) settings.hooks[event].push({ hooks: [{ type: 'command', command: HOOK_CMD }] })
}

fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
console.log('installed. restart Claude Code (or start a new session) to see the friends line.')
