// Social spinner tips — friends' activity rotating through Claude Code's
// spinner tips (the text next to "Pondering…").
//
// The spinner has no command/script interface like the statusline, but
// settings.json hot-reloads, so we regenerate `spinnerTipsOverride` whenever
// the feed is pulled. Rules to keep this polite:
//   - opt-in only (`presence spinner on`), previous tips are backed up to
//     presence config and restored on `presence spinner off`
//   - atomic write (tmp + rename), and only when the tips actually changed
//   - never creates settings.json — if it doesn't exist, we do nothing

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const SETTINGS_PATH =
  process.env.TERMINALLY_SOCIAL_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json')

const MAX_TIPS = 5

export function renderTips(feed) {
  return (feed || [])
    .filter((f) => f.status === 'working')
    .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
    .slice(0, MAX_TIPS)
    .map((f) => {
      const doing = f.summary || 'working'
      const project = f.project ? ` (${f.project})` : ''
      return `👥 ${f.emoji} ${f.username} · ${doing}${project}`
    })
}

function readSettings(settingsPath) {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    return null
  }
}

function writeSettings(settingsPath, settings) {
  const tmp = settingsPath + '.terminally-social-tmp'
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n')
  fs.renameSync(tmp, settingsPath)
}

// Returns true if settings.json was rewritten.
export function updateSpinnerTips(feed, { settingsPath = SETTINGS_PATH } = {}) {
  const settings = readSettings(settingsPath)
  if (!settings) return false

  const tips = renderTips(feed)
  const current = settings.spinnerTipsOverride
  if (JSON.stringify(current?.tips || []) === JSON.stringify(tips)) return false

  settings.spinnerTipsOverride = {
    excludeDefault: current?.excludeDefault ?? false,
    tips,
  }
  writeSettings(settingsPath, settings)
  return true
}

// Restores the pre-terminally.social value (or removes the key entirely).
export function clearSpinnerTips(backup, { settingsPath = SETTINGS_PATH } = {}) {
  const settings = readSettings(settingsPath)
  if (!settings) return false
  if (backup) settings.spinnerTipsOverride = backup
  else delete settings.spinnerTipsOverride
  writeSettings(settingsPath, settings)
  return true
}
