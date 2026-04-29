export const config = { runtime: "edge" };
import { dbExecute, sessionCookie } from "../_lib";

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const SITE = process.env.SITE_URL ?? "https://aiwatchly.com";

export default async function handler(req: Request): Promise<Response> {
  try {
    const sid = parseCookie(req.headers.get("cookie") ?? "", "sid");
    if (sid) {
      await dbExecute("DELETE FROM sessions WHERE id = ?", [sid]);
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: SITE,
        "Set-Cookie": sessionCookie("", 0),
      },
    });
  } catch (err) {
    console.error("[auth/logout]", err);
    return Response.redirect(SITE, 302);
  }
}
