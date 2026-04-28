export const config = { runtime: "edge" };
import { dbExecute, sessionCookie } from "../_lib";

const SITE = process.env.SITE_URL ?? "https://aidigest-iota.vercel.app";

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const anonId = url.searchParams.get("anon_id") ?? "";

  const redirect = (path: string) =>
    Response.redirect(`${SITE}${path}`, 302);

  if (!token) return redirect("/login?error=missing_token");

  try {
    const { rows } = await dbExecute(
      "SELECT email, expires_at, used FROM magic_links WHERE token = ?",
      [token],
    );
    if (!rows.length) return redirect("/login?error=invalid_token");

    const link = rows[0];
    if (link.used || Number(link.expires_at) < Math.floor(Date.now() / 1000)) {
      return redirect("/login?error=expired_token");
    }

    await dbExecute("UPDATE magic_links SET used = 1 WHERE token = ?", [token]);

    const email = link.email as string;

    // Upsert user
    await dbExecute(
      "INSERT INTO users (id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING",
      [crypto.randomUUID(), email],
    );
    const { rows: userRows } = await dbExecute(
      "SELECT id FROM users WHERE email = ?",
      [email],
    );
    const userId = userRows[0].id as string;

    // Migrate anon data if anon_id supplied
    if (anonId && /^[a-zA-Z0-9-]{8,64}$/.test(anonId) && anonId !== userId) {
      await dbExecute(
        `INSERT OR IGNORE INTO likes (user_id, article_id, created_at)
         SELECT ?, article_id, created_at FROM likes WHERE user_id = ?`,
        [userId, anonId],
      );
      await dbExecute(
        `INSERT OR IGNORE INTO saved_filters (id, user_id, name, query, created_at)
         SELECT id, ?, name, query, created_at FROM saved_filters WHERE user_id = ?`,
        [userId, anonId],
      );
    }

    // Create session (30 days)
    const sid = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
    await dbExecute(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
      [sid, userId, expiresAt],
    );

    return new Response(null, {
      status: 302,
      headers: {
        Location: SITE,
        "Set-Cookie": sessionCookie(sid),
      },
    });
  } catch (err) {
    console.error("[auth/verify]", err);
    return redirect("/login?error=server_error");
  }
}
