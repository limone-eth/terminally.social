---
name: terminally-social
description: Install and manage terminally.social — a Discord-style friends notch in the Claude Code statusline. Use when the user wants to install terminally.social, see what friends are building, set up the friends notch, register a presence profile, create or accept friend invites, change the presence emoji/username, control what activity is shared (summary/project/off/ghost), or enable friends' activity in spinner tips.
---

# terminally.social

Discord-style presence for Claude Code: friends' current activity renders as an extra
statusline line, optionally also as spinner tips. Repo: https://github.com/limone-eth/terminally.social

**Privacy invariant (tell the user if they ask):** raw prompts never leave the machine.
A local sanitizer (`client/summarize.js`) reduces each prompt to a redacted one-liner
before anything is sent; the server only ever sees that.

## Install (one command, idempotent)

**Always ask the user** for a username (lowercase, `[a-z0-9_-]{2,20}`), a profile emoji,
and — optionally — an invite code from a friend. Never invent these. Then run:

```bash
curl -fsSL https://raw.githubusercontent.com/limone-eth/terminally.social/main/bin/bootstrap.sh \
  | bash -s -- <username> --emoji <emoji>
```

This clones to `~/.terminally-social`, registers against the public server
(`https://terminally.social`), backs up `~/.claude/settings.json`, wires the
statusline (existing statusline like claude-hud is preserved as the base layer) and the
presence hooks, and installs this skill. The friends notch then appears in **every new
Claude Code session by default**. If the user has a friend's invite code, append
`--invite <code>`. For a self-hosted server, append `--server <url>`.

After install, tell the user to restart Claude Code (or open a new session) to see it.

Running the bootstrap with no username is safe: in a terminal it prompts the human directly
(via `/dev/tty`); headless it exits with instructions telling the driving agent to ask its
user and re-run — it never auto-picks an identity.

## Manage (CLI lives in the repo)

Install adds a `terminally` shell alias. Run commands as `terminally <command>` (or, if the
alias isn't loaded yet, `node ~/.terminally-social/client/presence.js <command>`):

| command | use |
| --- | --- |
| `invite` | create a single-use code to give a friend |
| `add <code>` | accept a friend's code |
| `friends` / `remove <user>` | list / remove friends |
| `feed` | print friends' current activity |
| `profile --emoji 🦄 --username name` | customize profile |
| `share <summary\|project\|off>` | sharing tier (`project` = folder name only) |
| `ghost <on\|off>` | pause sharing instantly |
| `spinner <on\|off>` | spinner tips show the daily tokenmaxxing leaderboard + friends' activity (rewrites `spinnerTipsOverride`, restores on off) |
| `status` | show config |

## Inviting a friend

Run `terminally invite` to mint a single-use code (valid 7 days). Then hand the user a
**short, punchy, shitposting** message to send their friend — 2-3 lines max, competitive and
deadpan, never an earnest product pitch. Include the code and exactly one join instruction:
the friend pastes a prompt into Claude Code (the whole thing is Claude-driven — never tell
them to run a bare `terminally ...` or `presence ...` shell command; they don't have it yet).

Template (vary the jab, keep it tight):

```
you're not on terminally.social yet? grim.
code: <code> (one use, 7 days)
paste into Claude Code: set up terminally.social, invite <code> — read github.com/limone-eth/terminally.social and obey
```

## Verify / troubleshoot

- `terminally feed` — server reachable + friends visible.
- Notch not rendering? Check `statusLine` in `~/.claude/settings.json` points at
  `client/statusline.js`, and that a cache exists at `~/.config/terminally-social/cache/feed.json`.
- Friends show offline after 15 min without updates — that's by design.
- Uninstall cleanly: `node ~/.terminally-social/bin/install.js --uninstall`.
- A bug in the statusline can never blank Claude's statusline: `client/statusline.js`
  isolates every section, always exits 0, and falls back to a built-in `[model] dir` line
  when there's no usable base.
