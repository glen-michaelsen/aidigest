const TURSO_URL = (process.env.TURSO_DATABASE_URL ?? "").replace("libsql://", "https://");
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN ?? "";

type Value = string | number | null;
type Row = Record<string, Value>;

export async function dbExecute(sql: string, args: Value[] = []): Promise<{ rows: Row[] }> {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TURSO_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: {
            sql,
            args: args.map((v) => {
              if (v === null) return { type: "null" };
              if (typeof v === "number") return { type: "integer", value: String(v) };
              return { type: "text", value: String(v) };
            }),
          },
        },
        { type: "close" },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Turso ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const result = data.results?.[0]?.response?.result;
  if (!result) throw new Error("Unexpected Turso response");

  const cols: string[] = result.cols.map((c: { name: string }) => c.name);
  const rows: Row[] = (result.rows as { type: string; value: string }[][]).map((row) => {
    const obj: Row = {};
    cols.forEach((col, i) => {
      const cell = row[i];
      if (!cell || cell.type === "null") obj[col] = null;
      else if (cell.type === "integer") obj[col] = Number(cell.value);
      else obj[col] = cell.value as string;
    });
    return obj;
  });

  return { rows };
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...((init.headers as Record<string, string>) ?? {}),
    },
  });
}

export function getUserId(req: Request): string | null {
  const url = new URL(req.url);
  const id = url.searchParams.get("user_id");
  return id && /^[a-zA-Z0-9-]{8,64}$/.test(id) ? id : null;
}

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getSessionUser(
  req: Request,
): Promise<{ id: string; email: string } | null> {
  const sid = parseCookie(req.headers.get("cookie") ?? "", "sid");
  if (!sid) return null;
  const { rows } = await dbExecute(
    `SELECT u.id, u.email FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > unixepoch()`,
    [sid],
  );
  if (!rows.length) return null;
  return { id: rows[0].id as string, email: rows[0].email as string };
}

export async function getEffectiveUserId(req: Request): Promise<string | null> {
  const user = await getSessionUser(req);
  if (user) return user.id;
  return getUserId(req);
}

export function sessionCookie(sid: string, maxAge = 60 * 60 * 24 * 30): string {
  return `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
