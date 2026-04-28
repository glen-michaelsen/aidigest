import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export type TagAxis = "category" | "domain" | "company" | "model";

export type Article = {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  ingestedAt: string;
  brief: string;
  tags: Record<TagAxis, string[]>;
};

const DIR = path.resolve("data/articles");

let cache: Article[] | null = null;

export async function loadArticles(): Promise<Article[]> {
  if (cache) return cache;
  let files: string[];
  try {
    files = await readdir(DIR);
  } catch {
    cache = [];
    return cache;
  }
  const articles: Article[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const raw = await readFile(path.join(DIR, f), "utf8");
    articles.push(JSON.parse(raw) as Article);
  }
  articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  cache = articles;
  return cache;
}

export async function allTags(): Promise<{ axis: TagAxis; tag: string; count: number }[]> {
  const articles = await loadArticles();
  const counts = new Map<string, number>();
  const axes: TagAxis[] = ["category", "domain", "company", "model"];
  for (const a of articles) {
    for (const axis of axes) {
      for (const tag of a.tags[axis] ?? []) {
        const key = `${axis}:${tag}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [axis, tag] = key.split(":") as [TagAxis, string];
      return { axis, tag, count };
    })
    .sort((a, b) => b.count - a.count);
}

export async function articlesByTag(axis: TagAxis, tag: string): Promise<Article[]> {
  const articles = await loadArticles();
  return articles.filter((a) => (a.tags[axis] ?? []).includes(tag));
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
