import "dotenv/config";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN. Add them to .env.");
  process.exit(1);
}

const db = createClient({ url, authToken });

await db.execute(`
  CREATE TABLE IF NOT EXISTS likes (
    user_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, article_id)
  )
`);

await db.execute(`
  CREATE TABLE IF NOT EXISTS saved_filters (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    query TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

await db.execute(`
  CREATE INDEX IF NOT EXISTS idx_saved_filters_user ON saved_filters(user_id)
`);

console.log("Schema ready: likes, saved_filters.");
process.exit(0);
