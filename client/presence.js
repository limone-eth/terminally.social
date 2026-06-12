#!/usr/bin/env node
// terminally-online CLI — manage your identity, friends, and sharing tier.

import fs from 'node:fs'
import { loadConfig, saveConfig, writeCache, api, CONFIG_PATH } from './lib.js'
import { updateSpinnerTips, clearSpinnerTips, SETTINGS_PATH } from './spinner.js'

const [, , command, ...rest] = process.argv

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i]
    else positional.push(argv[i])
  }
  return { positional, flags }
}

const { positional, flags } = parseArgs(rest)

function requireConfig() {
  const config = loadConfig()
  if (!config?.token) {
    console.error('not registered yet — run: presence register <username> --server <url>')
    process.exit(1)
  }
  return config
}

const STATUS_ICON = { working: '🟢', idle: '🌙', offline: '⚫' }

function timeAgo(ms) {
  if (!ms) return ''
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

async function main() {
  switch (command) {
    case 'register': {
      const username = positional[0]
      const server = flags.server || loadConfig()?.server
      if (!username || !server) {
        console.error('usage: presence register <username> [--emoji 🦊] --server <url>')
        process.exit(1)
      }
      const config = { server: server.replace(/\/+$/, ''), share: 'summary', ghost: false }
      const me = await api(config, 'POST', '/v1/users', { username, emoji: flags.emoji })
      saveConfig({ ...config, token: me.token, username: me.username, emoji: me.emoji })
      console.log(`registered as ${me.emoji} ${me.username}`)
      console.log(`config saved to ${CONFIG_PATH}`)
      break
    }

    case 'profile': {
      const config = requireConfig()
      if (flags.emoji === undefined && flags.username === undefined) {
        const me = await api(config, 'GET', '/v1/me')
        console.log(`${me.emoji} ${me.username}`)
        break
      }
      const body = {}
      if (flags.emoji !== undefined) body.emoji = flags.emoji
      if (flags.username !== undefined) body.username = flags.username
      const me = await api(config, 'PATCH', '/v1/me', body)
      saveConfig({ ...config, username: me.username, emoji: me.emoji })
      console.log(`profile updated: ${me.emoji} ${me.username}`)
      break
    }

    case 'invite': {
      const config = requireConfig()
      const invite = await api(config, 'POST', '/v1/invites')
      console.log(`invite code: ${invite.code}`)
      console.log('send it to a friend — they run: presence add ' + invite.code)
      console.log('(single use, expires in 7 days)')
      break
    }

    case 'add': {
      const config = requireConfig()
      if (!positional[0]) {
        console.error('usage: presence add <code>')
        process.exit(1)
      }
      const result = await api(config, 'POST', '/v1/friends', { code: positional[0] })
      console.log(`you are now friends with ${result.friend.emoji} ${result.friend.username}`)
      break
    }

    case 'friends': {
      const config = requireConfig()
      const { friends } = await api(config, 'GET', '/v1/friends')
      if (friends.length === 0) console.log('no friends yet — run: presence invite')
      for (const f of friends) console.log(`${f.emoji} ${f.username}`)
      break
    }

    case 'remove': {
      const config = requireConfig()
      if (!positional[0]) {
        console.error('usage: presence remove <username>')
        process.exit(1)
      }
      await api(config, 'DELETE', `/v1/friends/${encodeURIComponent(positional[0])}`)
      console.log(`removed ${positional[0]}`)
      break
    }

    case 'feed': {
      const config = requireConfig()
      const { feed } = await api(config, 'GET', '/v1/feed')
      if (feed.length === 0) console.log('no friends yet — run: presence invite')
      for (const f of feed) {
        const parts = [`${STATUS_ICON[f.status]} ${f.emoji} ${f.username}`]
        if (f.summary) parts.push(f.summary)
        if (f.project) parts.push(`(${f.project})`)
        if (f.updated_at) parts.push(`· ${timeAgo(f.updated_at)}`)
        console.log(parts.join(' '))
      }
      break
    }

    case 'pull': {
      const config = requireConfig()
      const { feed } = await api(config, 'GET', '/v1/feed')
      writeCache(feed)
      if (config.spinner_tips) {
        try {
          updateSpinnerTips(feed)
        } catch {
          // spinner tips are cosmetic — never let them fail a pull
        }
      }
      break
    }

    case 'spinner': {
      const config = requireConfig()
      if (!['on', 'off'].includes(positional[0])) {
        console.error('usage: presence spinner <on|off>')
        process.exit(1)
      }
      if (positional[0] === 'on') {
        let settings
        try {
          settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
        } catch {
          console.error(`no Claude Code settings found at ${SETTINGS_PATH}`)
          process.exit(1)
        }
        saveConfig({
          ...config,
          spinner_tips: true,
          spinner_tips_backup: settings.spinnerTipsOverride ?? null,
        })
        const { feed } = await api(config, 'GET', '/v1/feed')
        writeCache(feed)
        updateSpinnerTips(feed)
        console.log("spinner tips on — friends' activity now rotates through Claude Code's spinner tips")
        console.log(`(writes spinnerTipsOverride in ${SETTINGS_PATH} on each feed refresh)`)
      } else {
        clearSpinnerTips(config.spinner_tips_backup || null)
        const { spinner_tips_backup, ...rest } = config
        saveConfig({ ...rest, spinner_tips: false })
        console.log('spinner tips off — previous spinner settings restored')
      }
      break
    }

    case 'share': {
      const config = requireConfig()
      const tier = positional[0]
      if (!['summary', 'project', 'off'].includes(tier)) {
        console.error('usage: presence share <summary|project|off>')
        process.exit(1)
      }
      saveConfig({ ...config, share: tier })
      console.log(`share tier: ${tier}`)
      break
    }

    case 'ghost': {
      const config = requireConfig()
      const on = positional[0] === 'on'
      if (!['on', 'off'].includes(positional[0])) {
        console.error('usage: presence ghost <on|off>')
        process.exit(1)
      }
      saveConfig({ ...config, ghost: on })
      console.log(on ? 'ghost mode on — sharing paused' : 'ghost mode off — sharing resumed')
      break
    }

    case 'status': {
      const config = loadConfig()
      if (!config) {
        console.log('not configured')
        break
      }
      console.log(`user:   ${config.emoji || ''} ${config.username || '(unknown)'}`)
      console.log(`server: ${config.server}`)
      console.log(`share:  ${config.share}${config.ghost ? ' (ghost mode on)' : ''}`)
      break
    }

    default:
      console.log(`terminally-online — see what your friends are building

usage: presence <command>

  register <username> [--emoji 🦊] --server <url>   create your identity
  profile [--emoji 🦊] [--username name]            view or edit your profile
  invite                                            create a friend invite code
  add <code>                                        accept a friend's invite
  friends                                           list your friends
  remove <username>                                 remove a friend
  feed                                              show friends' activity
  share <summary|project|off>                       choose what you share
  ghost <on|off>                                    pause/resume sharing
  spinner <on|off>                                  friends' activity as spinner tips
  status                                            show your config`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
