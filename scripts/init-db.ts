import "dotenv/config";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN. Add them to .env.");
  process.exit(1);
}

const db = createClient({ url, authToken });

const tables = [
  `CREATE TABLE IF NOT EXISTS likes (
    user_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, article_id)
  )`,
  `CREATE TABLE IF NOT EXISTS saved_filters (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    query TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS idx_saved_filters_user ON saved_filters(user_id)`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS magic_links (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS tag_scores (
    user_id TEXT NOT NULL,
    axis    TEXT NOT NULL,
    tag     TEXT NOT NULL,
    score   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, axis, tag)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tag_scores_user ON tag_scores(user_id)`,
];

for (const sql of tables) {
  await db.execute(sql);
}

console.log("Schema ready: likes, saved_filters, users, magic_links, sessions.");
process.exit(0);
