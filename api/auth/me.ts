export const config = { runtime: "edge" };
import { getSessionUser, json } from "../_lib";

export default async function handler(req: Request): Promise<Response> {
  try {
    const user = await getSessionUser(req);
    return json({ user: user ?? null });
  } catch (err) {
    console.error("[auth/me]", err);
    return json({ user: null });
  }
}
