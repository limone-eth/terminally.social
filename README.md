# terminally.social

Discord-style presence for [Claude Code](https://claude.com/claude-code): a line in your
statusline showing what your friends are building right now — without ever sharing your prompts.

```
🟢 🛸 marco · refactoring the auth flow (side-project)  |  🟢 🌸 lisa · tuning the telegram alerts (apartment-bot)  |  ⚫ 🐙 joao · 2h
```

## Install (humans and Claude agents)

One command — pick a username and you're in:

```bash
curl -fsSL https://raw.githubusercontent.com/limone-eth/terminally.social/main/bin/bootstrap.sh \
  | bash -s -- <username> --emoji 🦊
```

This registers you on the public server, wires the Claude Code statusline + hooks
(your `settings.json` is backed up, your existing statusline keeps rendering), and installs
the `terminally.social` skill — the friends notch is then on **by default in every session**.
Got an invite code from a friend? Append `--invite <code>`. Self-hosting? `--server <url>`.

**If you are a Claude agent** setting this up for your user: read
[`skills/terminally-social/SKILL.md`](skills/terminally-social/SKILL.md) — it is the canonical,
deterministic install/manage flow. Ask the user for a username + emoji, run the bootstrap
above, then suggest `presence invite` to befriend someone.

## Privacy model (read this first)

The whole point of this project is that **your raw prompts never leave your machine**.

- The Claude Code hook (`client/hook.js`) runs locally and reduces your prompt to a short,
  sanitized one-liner using [`client/summarize.js`](client/summarize.js) — first line only,
  code blocks dropped, credentials / URLs / emails / paths redacted, hard-truncated to 80 chars.
- Only that sanitized summary (plus project folder name and a working/idle flag) is sent to
  the server. The server never receives, stores, or logs prompts.
- The summarizer is ~60 lines of dependency-free code, specifically so anyone can audit the
  single place where prompt-derived text crosses the privacy boundary.
- You choose a sharing tier: `summary` (default), `project` (folder name only), or `off`.
  `presence ghost on` pauses sharing instantly. Server-side length/charset enforcement exists
  too, but it is defense in depth — the privacy layer is local.

Heuristic redaction can't be perfect. If your prompts routinely contain sensitive prose,
run `presence share project`.

## How it works

```
your machine                                server (self-hosted)
┌─────────────────────────────┐
│ Claude Code                 │
│  hooks ──▶ hook.js          │
│            summarize.js     │──POST /v1/presence──▶ ┌──────────────┐
│            (sanitize HERE)  │                       │ node + libSQL │
│                             │                       │ (Turso)       │
│  statusline.js ◀── cache ◀──│◀──GET /v1/feed─────── └──────────────┘
│  (renders claude-hud + 👥)  │     (30s poll, never inline)
└─────────────────────────────┘
```

- **Server** (`server/`): a single plain-Node HTTP file backed by libSQL — run it anywhere
  (a Turso database + any small host works). No framework, one dependency total.
- **Client** (`client/`): zero dependencies. A CLI (`presence.js`), the hook, the summarizer,
  and a statusline wrapper that renders your existing statusline (e.g. claude-hud) and appends
  the friends line from a cache file. Network refresh happens in a detached background process,
  so statusline rendering stays instant.

## Try the sandbox (no real friends required)

```bash
npm install
npm run sandbox        # or: npm run sandbox:once
```

This starts libSQL in Docker, boots the server, registers a sandbox identity, seeds three fake
friends (marco, lisa, joao), and re-renders the statusline preview every 5 seconds as their
activity changes. Everything is isolated in `sandbox/.home` — your real config is untouched.

Poke at it with the CLI:

```bash
export TERMINALLY_SOCIAL_HOME="$PWD/sandbox/.home"
node client/presence.js feed
node client/presence.js profile --emoji 🦄
node client/presence.js share project
```

## Real setup

1. **Host the server**: deploy `server/` with `LIBSQL_URL` (+ `LIBSQL_AUTH_TOKEN`) pointing at a
   Turso database, or run it on any box you and your friends can reach.
2. **Register**: `node client/presence.js register <name> --emoji 🦊 --server https://your-server`
3. **Befriend**: you run `presence invite`, your friend runs `presence add <code>`. Invites are
   single-use and expire in 7 days.
4. **Wire into Claude Code**: `npm run install-client` — backs up `~/.claude/settings.json`,
   keeps your current statusline as the base layer, and adds the presence hooks.
   Undo anytime with `node bin/install.js --uninstall`.

## CLI reference

| command | what it does |
| --- | --- |
| `register <username> [--emoji 🦊] --server <url>` | create your identity |
| `profile [--emoji 🦊] [--username name]` | view / customize your profile |
| `invite` / `add <code>` | make friends |
| `friends` / `remove <username>` | manage friends |
| `feed` | print friends' activity |
| `share <summary\|project\|off>` | choose what you share |
| `ghost <on\|off>` | pause / resume sharing |
| `spinner <on\|off>` | friends' activity as spinner tips |
| `status` | show current config |

## Tokenmaxxing — the daily match

Every friend's notch line also shows how many tokens they have burned today
(`· 2.1M tok`), summed across their sessions. The hook counts tokens locally from the
session transcript on every Stop and sends **only the number** — never any content.
The spinner tip then becomes the daily leaderboard:

```
✻ Pondering… (👥 tokenmaxxing today: 👑 🛸 marco 2.1M · 🍋 you 1.4M · 🌸 lisa 812k)
```

Days roll over at midnight UTC. The crown is honor only. For now.

## Spinner tips

`presence spinner on` also rotates friends' activity through Claude Code's spinner tips —
the text shown while Claude is working:

```
✻ Pondering… (👥 🌸 lisa · debugging the cron job (apartment-bot))
```

Claude Code has no script interface for the spinner, so this works by rewriting
`spinnerTipsOverride` in `~/.claude/settings.json` on each feed refresh (settings hot-reload).
It is opt-in, writes atomically and only when the tips changed, never creates the file, keeps
your `excludeDefault` preference, and `presence spinner off` restores whatever tips you had
before. Default tips still rotate alongside unless you've set `excludeDefault: true`.

## Tests

```bash
npm test
```

Covers the API end-to-end (against an embedded libSQL file, no Docker needed) and the
summarizer's redaction rules — the privacy-critical part.

## v1 scope & known limits

- Presence only — no chat (deliberately, for now).
- No rate limiting or abuse protection on the server; run it for people you trust.
- Redaction is heuristic. `share project` exists for the cautious.
- Statuses: `working` (prompt submitted), `idle` (Claude finished / session start-end),
  `offline` (no update for 15 minutes).

## License

[MIT](LICENSE)
