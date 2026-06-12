# claude-presence

Discord-style presence for [Claude Code](https://claude.com/claude-code): a line in your
statusline showing what your friends are building right now — without ever sharing your prompts.

```
🟢 🛸 marco · refactoring the auth flow (side-project)  |  🟢 🌸 lisa · tuning the telegram alerts (apartment-bot)  |  ⚫ 🐙 joao · 2h
```

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
export CLAUDE_PRESENCE_HOME="$PWD/sandbox/.home"
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
| `status` | show current config |

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
