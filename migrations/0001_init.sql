-- Cloudflare D1 schema. Apply with:
--   npx wrangler d1 migrations apply eclipse-onedrive --remote
-- Every user-data table is keyed by user_id; all queries filter by it on the server.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,            -- SHA-256 of the cookie value
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE microsoft_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ms_account_id TEXT NOT NULL,
  ms_email TEXT,
  access_token_enc TEXT NOT NULL,         -- AES-GCM, key = TOKEN_ENC_KEY secret
  refresh_token_enc TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  folder_path TEXT NOT NULL DEFAULT 'Music',
  created_at INTEGER NOT NULL
);

CREATE TABLE music_files (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT,
  size INTEGER,
  ext TEXT,
  mime TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  album_artist TEXT,
  artist_key TEXT NOT NULL,
  album_key TEXT NOT NULL,
  track_no INTEGER,
  disc_no INTEGER,
  genre TEXT,
  year INTEGER,
  duration INTEGER,
  modified_at TEXT,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX music_album ON music_files(user_id, album_key);
CREATE INDEX music_artist ON music_files(user_id, artist_key);

CREATE TABLE sync_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  delta_link TEXT,
  next_link TEXT,
  status TEXT NOT NULL DEFAULT 'idle',     -- idle | scanning | error
  last_sync_at INTEGER,
  last_error TEXT,
  track_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE addon_tokens (
  token_hash TEXT PRIMARY KEY,             -- SHA-256 of the token in the addon URL
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
