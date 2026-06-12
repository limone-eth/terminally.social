// Claude Code hook entry point. Wired to UserPromptSubmit / Stop /
// SessionStart / SessionEnd. Receives the hook payload on stdin, derives a
// presence update, and POSTs it to your presence server.
//
// Privacy: the raw prompt never leaves this process. If your share tier is
// 'summary', the prompt is reduced to a sanitized one-liner by
// ./summarize.js (local code, no network) before anything is sent. If the
// tier is 'project', only the project folder name is sent. 'off' or ghost
// mode sends nothing.
//
// This script must never break a Claude session: every failure path exits 0,
// and the network call has a short timeout.

import path from 'node:path'
import fs from 'node:fs'
import readline from 'node:readline'
import { loadConfig, api } from './lib.js'
import { summarize } from './summarize.js'

// Sum total tokens (input + output + cache) across the session transcript.
// Counts only — no transcript content ever leaves this process.
async function sessionTokens(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null
  let total = 0
  const rl = readline.createInterface({ input: fs.createReadStream(transcriptPath), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.includes('"usage"')) continue
    try {
      const entry = JSON.parse(line)
      const usage = entry.message?.usage
      if (entry.type === 'assistant' && usage) {
        total +=
          (usage.input_tokens || 0) +
          (usage.output_tokens || 0) +
          (usage.cache_creation_input_tokens || 0) +
          (usage.cache_read_input_tokens || 0)
      }
    } catch { /* partial line — skip */ }
  }
  return total
}

async function main() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const event = JSON.parse(Buffer.concat(chunks).toString('utf8'))

  const config = loadConfig()
  if (!config?.token || !config?.server) return
  if (config.ghost || config.share === 'off') return

  const project = event.cwd ? path.basename(event.cwd) : null
  let update = null

  switch (event.hook_event_name) {
    case 'UserPromptSubmit':
      update = {
        status: 'working',
        project,
        summary: config.share === 'project' ? null : summarize(event.prompt),
      }
      break
    case 'Stop':
      update = { status: 'idle', project } // keeps last summary server-side
      break
    case 'SessionStart':
      update = { status: 'idle', project, summary: null }
      break
    case 'SessionEnd':
      update = { status: 'idle', project, summary: null }
      break
  }

  if (update) await api(config, 'POST', '/v1/presence', update, { timeoutMs: 1500 })

  // on Stop, also report this session's token total for the daily leaderboard
  if ((event.hook_event_name === 'Stop' || event.hook_event_name === 'SessionEnd') && event.session_id) {
    const tokens = await sessionTokens(event.transcript_path)
    if (tokens !== null && tokens > 0) {
      await api(config, 'POST', '/v1/usage', { session_id: event.session_id, tokens }, { timeoutMs: 2500 })
    }
  }
}

main()
  .catch(() => {})
  .finally(() => process.exit(0))
