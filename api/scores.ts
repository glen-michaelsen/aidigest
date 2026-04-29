export const config = { runtime: "edge" };
import { dbExecute, dbBatch, json, getEffectiveUserId } from "./_lib";

async function handle(req: Request): Promise<Response> {
  if (req.method !== "GET") return json({ error: "method not allowed" }, { status: 405 });

  // Ensure table exists (lazy migration — no-op after first call)
  await dbBatch([{
    sql: `CREATE TABLE IF NOT EXISTS tag_scores (
      user_id TEXT NOT NULL,
      axis    TEXT NOT NULL,
      tag     TEXT NOT NULL,
      score   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, axis, tag)
    )`,
  }]);

  const userId = await getEffectiveUserId(req);
  if (!userId) return json({ scores: {} });

  const { rows } = await dbExecute(
    "SELECT axis, tag, score FROM tag_scores WHERE user_id = ? AND score > 0",
    [userId],
  );

  const scores: Record<string, number> = {};
  for (const row of rows) {
    scores[`${row.axis}:${row.tag}`] = row.score as number;
  }

  return json({ scores });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[scores]", err);
    return json({ scores: {} });
  }
}
