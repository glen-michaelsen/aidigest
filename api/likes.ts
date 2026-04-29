export const config = { runtime: "edge" };
import { dbExecute, dbBatch, json, getEffectiveUserId } from "./_lib";

const CREATE_TAG_SCORES = `CREATE TABLE IF NOT EXISTS tag_scores (
  user_id TEXT NOT NULL,
  axis    TEXT NOT NULL,
  tag     TEXT NOT NULL,
  score   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, axis, tag)
)`;

async function applyTagScores(
  userId: string,
  tags: Record<string, string[]>,
  liked: boolean,
): Promise<void> {
  const stmts: { sql: string; args: (string | number)[] }[] = [
    { sql: CREATE_TAG_SCORES, args: [] },
  ];
  const axes = ["category", "domain", "company", "model"] as const;
  for (const axis of axes) {
    for (const tag of tags[axis] ?? []) {
      if (liked) {
        stmts.push({
          sql: `INSERT INTO tag_scores (user_id, axis, tag, score) VALUES (?, ?, ?, 1)
                ON CONFLICT (user_id, axis, tag)
                DO UPDATE SET score = score + 1`,
          args: [userId, axis, tag],
        });
      } else {
        stmts.push({
          sql: `INSERT INTO tag_scores (user_id, axis, tag, score) VALUES (?, ?, ?, 0)
                ON CONFLICT (user_id, axis, tag)
                DO UPDATE SET score = MAX(0, score - 1)`,
          args: [userId, axis, tag],
        });
      }
    }
  }
  if (stmts.length > 1) await dbBatch(stmts);
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "GET") {
    const userId = await getEffectiveUserId(req);
    if (!userId) return json({ error: "user_id required" }, { status: 400 });
    const { rows } = await dbExecute(
      "SELECT article_id FROM likes WHERE user_id = ? ORDER BY created_at DESC",
      [userId],
    );
    return json({ articles: rows.map((r) => r.article_id) });
  }

  if (req.method === "POST") {
    let body: { user_id?: string; article_id?: string; tags?: Record<string, string[]> };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, { status: 400 }); }
    const { user_id, article_id, tags = {} } = body;
    if (!user_id || !article_id) return json({ error: "missing fields" }, { status: 400 });
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(user_id)) return json({ error: "bad user_id" }, { status: 400 });
    if (article_id.length > 64) return json({ error: "bad article_id" }, { status: 400 });

    // Prefer session user so scores follow the real account
    const effectiveId = (await getEffectiveUserId(req)) ?? user_id;

    const { rows } = await dbExecute(
      "SELECT 1 FROM likes WHERE user_id = ? AND article_id = ?",
      [effectiveId, article_id],
    );
    let liked: boolean;
    if (rows.length) {
      await dbExecute("DELETE FROM likes WHERE user_id = ? AND article_id = ?", [effectiveId, article_id]);
      liked = false;
    } else {
      await dbExecute("INSERT INTO likes (user_id, article_id) VALUES (?, ?)", [effectiveId, article_id]);
      liked = true;
    }

    // Fire-and-forget score update (don't block the response)
    applyTagScores(effectiveId, tags, liked).catch(console.error);

    return json({ liked });
  }

  return json({ error: "method not allowed" }, { status: 405 });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[likes]", err);
    return json({ error: "internal error", detail: String(err) }, { status: 500 });
  }
}
