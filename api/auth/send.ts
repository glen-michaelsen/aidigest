export const config = { runtime: "edge" };
import { dbExecute, json } from "../_lib";

const FROM = "AI Watchly <onboarding@resend.dev>";
const SITE = process.env.SITE_URL ?? "https://aiwatchly.com";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  try {
    let body: { email?: string; anon_id?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, { status: 400 }); }

    const email = (body.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "invalid email" }, { status: 400 });
    }

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 15; // 15 min

    await dbExecute(
      "INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, ?)",
      [token, email, expiresAt],
    );

    const anonParam = body.anon_id ? `&anon_id=${encodeURIComponent(body.anon_id)}` : "";
    const link = `${SITE}/api/auth/verify?token=${token}${anonParam}`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: "Your AI Watchly login link",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem">
            <h2 style="margin:0 0 1rem">Sign in to AI Watchly</h2>
            <p>Click the link below to sign in. It expires in 15 minutes.</p>
            <a href="${link}" style="display:inline-block;margin:1rem 0;padding:0.75rem 1.5rem;background:#c9603f;color:white;border-radius:8px;text-decoration:none;font-weight:600">
              Sign in
            </a>
            <p style="color:#888;font-size:0.85rem">If you didn't request this, you can ignore it.</p>
          </div>`,
      }),
    });

    if (!emailRes.ok) {
      const detail = await emailRes.text();
      console.error("[auth/send] Resend error:", detail);
      return json({ error: "failed to send email", detail }, { status: 500 });
    }

    return json({ ok: true });
  } catch (err) {
    console.error("[auth/send]", err);
    return json({ error: "internal error", detail: String(err) }, { status: 500 });
  }
}
