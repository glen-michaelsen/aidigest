import { db, json, getUserId } from "./_lib";

async function handle(req: Request): Promise<Response> {
  const userId = getUserId(req);

  if (req.method === "GET") {
    if (!userId) return json({ error: "user_id required" }, { status: 400 });
    const result = await db.execute({
      sql: "SELECT id, name, query FROM saved_filters WHERE user_id = ? ORDER BY created_at DESC",
      args: [userId],
    });
    const filters = result.rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      query: JSON.parse(r.query as string),
    }));
    return json({ filters });
  }

  if (req.method === "POST") {
    let body: { user_id?: string; name?: string; query?: unknown };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, { status: 400 }); }
    const { user_id, name, query } = body;
    if (!user_id || !name || !query) return json({ error: "missing fields" }, { status: 400 });
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(user_id)) return json({ error: "bad user_id" }, { status: 400 });
    if (name.length > 80) return json({ error: "name too long" }, { status: 400 });

    const id = crypto.randomUUID();
    await db.execute({
      sql: "INSERT INTO saved_filters (id, user_id, name, query) VALUES (?, ?, ?, ?)",
      args: [id, user_id, name, JSON.stringify(query)],
    });
    return json({ id, name, query });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!userId || !id) return json({ error: "missing fields" }, { status: 400 });
    await db.execute({
      sql: "DELETE FROM saved_filters WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, { status: 405 });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[filters]", err);
    return new Response(JSON.stringify({ error: "internal error", detail: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
