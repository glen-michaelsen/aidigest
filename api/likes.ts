import { db, json, getUserId } from "./_lib";

async function handle(req: Request): Promise<Response> {
  if (req.method === "GET") {
    const userId = getUserId(req);
    if (!userId) return json({ error: "user_id required" }, { status: 400 });
    const result = await db.execute({
      sql: "SELECT article_id FROM likes WHERE user_id = ? ORDER BY created_at DESC",
      args: [userId],
    });
    return json({ articles: result.rows.map((r) => r.article_id as string) });
  }

  if (req.method === "POST") {
    let body: { user_id?: string; article_id?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, { status: 400 }); }
    const { user_id, article_id } = body;
    if (!user_id || !article_id) return json({ error: "missing fields" }, { status: 400 });
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(user_id)) return json({ error: "bad user_id" }, { status: 400 });
    if (article_id.length > 64) return json({ error: "bad article_id" }, { status: 400 });

    const existing = await db.execute({
      sql: "SELECT 1 FROM likes WHERE user_id = ? AND article_id = ?",
      args: [user_id, article_id],
    });
    if (existing.rows.length) {
      await db.execute({
        sql: "DELETE FROM likes WHERE user_id = ? AND article_id = ?",
        args: [user_id, article_id],
      });
      return json({ liked: false });
    }
    await db.execute({
      sql: "INSERT INTO likes (user_id, article_id) VALUES (?, ?)",
      args: [user_id, article_id],
    });
    return json({ liked: true });
  }

  return json({ error: "method not allowed" }, { status: 405 });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[likes]", err);
    return new Response(JSON.stringify({ error: "internal error", detail: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
