export const config = { runtime: "edge" };
import { dbExecute, json, getSessionUser } from "./_lib";

const VALID_CATEGORIES = new Set([
  "research", "product-launch", "funding", "policy", "safety",
  "open-source", "benchmarks", "infrastructure", "incident", "opinion",
]);

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS digest_subscriptions (
  user_id    TEXT    PRIMARY KEY,
  enabled    INTEGER NOT NULL DEFAULT 1,
  categories TEXT    NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)`;

async function handle(req: Request): Promise<Response> {
  // Digest preferences are only available to signed-in users (we need their email)
  const user = await getSessionUser(req);
  if (!user) return json({ error: "not authenticated" }, { status: 401 });

  // Lazy migration — no-op after first call
  await dbExecute(CREATE_TABLE);

  if (req.method === "GET") {
    const { rows } = await dbExecute(
      "SELECT enabled, categories FROM digest_subscriptions WHERE user_id = ?",
      [user.id],
    );
    if (!rows.length) return json({ enabled: false, categories: [] });
    return json({
      enabled: rows[0].enabled === 1,
      categories: JSON.parse(rows[0].categories as string ?? "[]"),
    });
  }

  if (req.method === "POST") {
    let body: { enabled?: boolean; categories?: string[] };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, { status: 400 }); }

    const enabled = body.enabled === true ? 1 : 0;
    const rawCats = Array.isArray(body.categories) ? body.categories : [];
    const categories = JSON.stringify(rawCats.filter((c) => VALID_CATEGORIES.has(c)));

    await dbExecute(
      `INSERT INTO digest_subscriptions (user_id, enabled, categories, updated_at)
       VALUES (?, ?, ?, unixepoch())
       ON CONFLICT (user_id) DO UPDATE SET
         enabled    = excluded.enabled,
         categories = excluded.categories,
         updated_at = unixepoch()`,
      [user.id, enabled, categories],
    );
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, { status: 405 });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[digest-settings]", err);
    return json({ error: "internal error", detail: String(err) }, { status: 500 });
  }
}
