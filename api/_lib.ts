import { createClient } from "@libsql/client";

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

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
  const fromQuery = url.searchParams.get("user_id");
  if (fromQuery && /^[a-zA-Z0-9-]{8,64}$/.test(fromQuery)) return fromQuery;
  return null;
}
