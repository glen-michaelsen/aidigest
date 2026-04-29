import type { APIRoute } from "astro";
import { loadArticles } from "../lib/articles";

export const GET: APIRoute = async () => {
  const articles = await loadArticles();
  const index = articles.map((a) => ({
    id: a.id,
    title: a.title,
    brief: a.brief,
    source: a.source,
    publishedAt: a.publishedAt,
    category: a.tags.category?.[0] ?? "default",
    url: a.url,
    tags: a.tags,
  }));
  return new Response(JSON.stringify(index), {
    headers: { "Content-Type": "application/json" },
  });
};
