import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderTips, updateSpinnerTips, clearSpinnerTips } from '../client/spinner.js'

const FEED = [
  { username: 'marco', emoji: '🛸', status: 'working', project: 'side-project', summary: 'fighting a flaky test', updated_at: 200 },
  { username: 'lisa', emoji: '🌸', status: 'working', project: 'apartment-bot', summary: null, updated_at: 300 },
  { username: 'joao', emoji: '🐙', status: 'idle', project: 'zine-gen', summary: 'sketching', updated_at: 400 },
  { username: 'ada', emoji: '🦉', status: 'offline', project: null, summary: null, updated_at: 1 },
]

function tmpSettings(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminally-online-spinner-'))
  const settingsPath = path.join(dir, 'settings.json')
  if (contents !== undefined) fs.writeFileSync(settingsPath, JSON.stringify(contents, null, 2))
  return settingsPath
}

test('renderTips shows only working friends, most recent first', () => {
  const tips = renderTips(FEED)
  assert.deepEqual(tips, [
    '👥 🌸 lisa · working (apartment-bot)',
    '👥 🛸 marco · fighting a flaky test (side-project)',
  ])
})

test('updateSpinnerTips writes tips and preserves other settings', () => {
  const settingsPath = tmpSettings({ model: 'opus', spinnerTipsOverride: { excludeDefault: true, tips: ['mine'] } })
  const changed = updateSpinnerTips(FEED, { settingsPath })
  assert.equal(changed, true)
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  assert.equal(settings.model, 'opus')
  assert.equal(settings.spinnerTipsOverride.excludeDefault, true) // user preference kept
  assert.equal(settings.spinnerTipsOverride.tips.length, 2)
})

test('updateSpinnerTips is a no-op when tips are unchanged', () => {
  const settingsPath = tmpSettings({})
  assert.equal(updateSpinnerTips(FEED, { settingsPath }), true)
  const before = fs.statSync(settingsPath).mtimeMs
  assert.equal(updateSpinnerTips(FEED, { settingsPath }), false)
  assert.equal(fs.statSync(settingsPath).mtimeMs, before)
})

test('updateSpinnerTips never creates a missing settings file', () => {
  const settingsPath = tmpSettings(undefined)
  assert.equal(updateSpinnerTips(FEED, { settingsPath }), false)
  assert.equal(fs.existsSync(settingsPath), false)
})

test('clearSpinnerTips restores a backup or removes the key', () => {
  const settingsPath = tmpSettings({ spinnerTipsOverride: { tips: ['social'] } })
  clearSpinnerTips({ excludeDefault: true, tips: ['original'] }, { settingsPath })
  let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  assert.deepEqual(settings.spinnerTipsOverride, { excludeDefault: true, tips: ['original'] })

  clearSpinnerTips(null, { settingsPath })
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  assert.equal('spinnerTipsOverride' in settings, false)
})
