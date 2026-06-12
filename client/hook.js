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
import { loadConfig, api } from './lib.js'
import { summarize } from './summarize.js'

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
}

main()
  .catch(() => {})
  .finally(() => process.exit(0))
