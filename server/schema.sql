CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🙂',
  token_hash TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by TEXT
);

-- one row per pair, normalized so user_a < user_b
CREATE TABLE IF NOT EXISTS friendships (
  user_a TEXT NOT NULL REFERENCES users(id),
  user_b TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_a, user_b)
);

-- The summary column only ever holds text that was sanitized on the
-- client before transmission. The server never receives raw prompts.
CREATE TABLE IF NOT EXISTS presence (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  status TEXT NOT NULL,
  project TEXT,
  summary TEXT,
  updated_at INTEGER NOT NULL
);

-- per-session daily token usage — tokens is that session's portion burned ON
-- this UTC day (a delta the server derives from the absolute total the client
-- re-posts each Stop), so SUM(tokens) WHERE day = today is the true daily count
-- even for a session that spans midnight (counts only, never content)
CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  day TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, session_id, day)
);
