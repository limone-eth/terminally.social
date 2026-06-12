---
name: claude-presence
description: Install and manage claude-presence — a Discord-style friends notch in the Claude Code statusline. Use when the user wants to install claude-presence, see what friends are building, set up the friends notch, register a presence profile, create or accept friend invites, change the presence emoji/username, control what activity is shared (summary/project/off/ghost), or enable friends' activity in spinner tips.
---

# claude-presence

Discord-style presence for Claude Code: friends' current activity renders as an extra
statusline line, optionally also as spinner tips. Repo: https://github.com/limone-eth/claude-presence

**Privacy invariant (tell the user if they ask):** raw prompts never leave the machine.
A local sanitizer (`client/summarize.js`) reduces each prompt to a redacted one-liner
before anything is sent; the server only ever sees that.

## Install (one command, idempotent)

Ask the user for a username (lowercase, `[a-z0-9_-]{2,20}`) and optionally an emoji,
then run:

```bash
curl -fsSL https://raw.githubusercontent.com/limone-eth/claude-presence/main/bin/bootstrap.sh \
  | bash -s -- <username> --emoji <emoji>
```

This clones to `~/.claude-presence`, registers against the public server
(`https://claude-presence.vercel.app`), backs up `~/.claude/settings.json`, wires the
statusline (existing statusline like claude-hud is preserved as the base layer) and the
presence hooks, and installs this skill. The friends notch then appears in **every new
Claude Code session by default**. If the user has a friend's invite code, append
`--invite <code>`. For a self-hosted server, append `--server <url>`.

After install, tell the user to restart Claude Code (or open a new session) to see it.

## Manage (CLI lives in the repo)

Run commands as `node ~/.claude-presence/client/presence.js <command>`:

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

- `node ~/.claude-presence/client/presence.js feed` — server reachable + friends visible.
- Notch not rendering? Check `statusLine` in `~/.claude/settings.json` points at
  `client/statusline.js`, and that a cache exists at `~/.config/claude-presence/cache/feed.json`.
- Friends show offline after 15 min without updates — that's by design.
- Uninstall cleanly: `node ~/.claude-presence/bin/install.js --uninstall`.
