// Seeds the sandbox with fake friends and rotates their activity.
//
//   node sandbox/seed.js setup   create friends + befriend you
//   node sandbox/seed.js tick    advance everyone's activity one step
//
// Requires TERMINALLY_SOCIAL_HOME to point at the sandbox home (demo.sh sets it).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, api } from '../client/lib.js'

const STATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '.state.json')

const FRIENDS = [
  {
    username: 'marco',
    emoji: '🛸',
    project: 'side-project',
    activities: [
      'refactoring the auth flow',
      'fighting a flaky test',
      'renaming everything again',
      'writing migrations',
      'arguing with TypeScript',
    ],
  },
  {
    username: 'lisa',
    emoji: '🌸',
    project: 'apartment-bot',
    activities: [
      'scraping idealista listings',
      'tuning the telegram alerts',
      'debugging the cron job',
      'adding price-drop detection',
    ],
  },
  {
    username: 'joao',
    emoji: '🐙',
    project: 'zine-gen',
    // joao mostly idles — exercises the idle/offline rendering paths
    activities: ['sketching layout ideas'],
    idle: true,
  },
]

const me = loadConfig()
if (!me?.token) {
  console.error('sandbox user not registered yet — demo.sh does this for you')
  process.exit(1)
}

const loadState = () => (fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : { users: {}, tick: 0 })
const saveState = (s) => fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + '\n')

const asUser = (token) => ({ server: me.server, token })

async function setup() {
  const state = loadState()
  for (const friend of FRIENDS) {
    if (state.users[friend.username]) continue
    const created = await api({ server: me.server }, 'POST', '/v1/users', {
      username: friend.username,
      emoji: friend.emoji,
    })
    state.users[friend.username] = created.token
    // friendship: friend invites, you accept
    const invite = await api(asUser(created.token), 'POST', '/v1/invites')
    await api(me, 'POST', '/v1/friends', { code: invite.code })
    console.log(`added friend ${friend.emoji} ${friend.username}`)
  }
  saveState(state)
}

async function tick() {
  const state = loadState()
  state.tick += 1
  for (const friend of FRIENDS) {
    const token = state.users[friend.username]
    if (!token) continue
    const idle = friend.idle ? state.tick % 4 !== 0 : state.tick % 5 === 4
    const summary = friend.activities[state.tick % friend.activities.length]
    await api(asUser(token), 'POST', '/v1/presence', {
      status: idle ? 'idle' : 'working',
      project: friend.project,
      summary: idle ? undefined : summary,
    })
  }
  saveState(state)
  console.log(`tick ${state.tick}`)
}

const command = process.argv[2]
if (command === 'setup') await setup()
else if (command === 'tick') await tick()
else {
  console.error('usage: node sandbox/seed.js <setup|tick>')
  process.exit(1)
}
