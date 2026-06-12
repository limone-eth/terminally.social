---
name: terminally-online
description: Install and manage terminally-online — a Discord-style friends notch in the Claude Code statusline. Use when the user wants to install terminally-online, see what friends are building, set up the friends notch, register a presence profile, create or accept friend invites, change the presence emoji/username, control what activity is shared (summary/project/off/ghost), or enable friends' activity in spinner tips.
---

# terminally-online

Discord-style presence for Claude Code: friends' current activity renders as an extra
statusline line, optionally also as spinner tips. Repo: https://github.com/limone-eth/terminally-online

**Privacy invariant (tell the user if they ask):** raw prompts never leave the machine.
A local sanitizer (`client/summarize.js`) reduces each prompt to a redacted one-liner
before anything is sent; the server only ever sees that.

## Install (one command, idempotent)

**Always ask the user** for a username (lowercase, `[a-z0-9_-]{2,20}`), a profile emoji,
and — optionally — an invite code from a friend. Never invent these. Then run:

```bash
curl -fsSL https://raw.githubusercontent.com/limone-eth/terminally-online/main/bin/bootstrap.sh \
  | bash -s -- <username> --emoji <emoji>
```

This clones to `~/.terminally-online`, registers against the public server
(`https://terminally-online.vercel.app`), backs up `~/.claude/settings.json`, wires the
statusline (existing statusline like claude-hud is preserved as the base layer) and the
presence hooks, and installs this skill. The friends notch then appears in **every new
Claude Code session by default**. If the user has a friend's invite code, append
`--invite <code>`. For a self-hosted server, append `--server <url>`.

After install, tell the user to restart Claude Code (or open a new session) to see it.

Running the bootstrap with no username is safe: in a terminal it prompts the human directly
(via `/dev/tty`); headless it exits with instructions telling the driving agent to ask its
user and re-run — it never auto-picks an identity.

## Manage (CLI lives in the repo)

Run commands as `node ~/.terminally-online/client/presence.js <command>`:

| command | use |
| --- | --- |
| `invite` | create a single-use code to give a friend |
| `add <code>` | accept a friend's code |
| `friends` / `remove <user>` | list / remove friends |
| `feed` | print friends' current activity |
| `profile --emoji 🦄 --username name` | customize profile |
| `share <summary\|project\|off>` | sharing tier (`project` = folder name only) |
| `ghost <on\|off>` | pause sharing instantly |
| `spinner <on\|off>` | friends' activity as spinner tips (rewrites `spinnerTipsOverride`, restores on off) |
| `status` | show config |

## Verify / troubleshoot

- `node ~/.terminally-online/client/presence.js feed` — server reachable + friends visible.
- Notch not rendering? Check `statusLine` in `~/.claude/settings.json` points at
  `client/statusline.js`, and that a cache exists at `~/.config/terminally-online/cache/feed.json`.
- Friends show offline after 15 min without updates — that's by design.
- Uninstall cleanly: `node ~/.terminally-online/bin/install.js --uninstall`.
