import type { APIRoute } from "astro";
import { allDates } from "../lib/articles";

export const GET: APIRoute = async () => {
  const dates = await allDates();
  return new Response(JSON.stringify(dates), {
    headers: { "content-type": "application/json" },
  });
};
