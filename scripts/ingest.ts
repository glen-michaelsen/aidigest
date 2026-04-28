import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { FEEDS, TAG_VOCAB } from "./feeds.js";

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_AGE_DAYS = 2;
const MAX_ARTICLES_PER_FEED = 8;
const ARTICLES_DIR = path.resolve("data/articles");
const SEEN_FILE = path.resolve("data/seen.json");

type SeenIndex = Record<string, true>;

type Article = {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  ingestedAt: string;
  brief: string;
  tags: {
    category: string[];
    domain: string[];
    company: string[];
    model: string[];
  };
};

const client = new Anthropic();
const parser = new Parser({ timeout: 15000 });

function slugify(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 12);
}

async function loadSeen(): Promise<SeenIndex> {
  if (!existsSync(SEEN_FILE)) return {};
  return JSON.parse(await readFile(SEEN_FILE, "utf8"));
}

async function saveSeen(seen: SeenIndex): Promise<void> {
  await writeFile(SEEN_FILE, JSON.stringify(seen, null, 2));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

const SYSTEM_PROMPT = `You are an editor for an AI news digest.

For each article, write a 2-3 sentence brief that captures what happened and why it matters. Be factual and specific — name the company, model, dollar figure, or capability. No fluff.

Then assign tags. ONLY use tags from these vocabularies:

category: ${TAG_VOCAB.category.join(", ")}
domain: ${TAG_VOCAB.domain.join(", ")}
company: ${TAG_VOCAB.company.join(", ")}
model: ${TAG_VOCAB.model.join(", ")}

Rules:
- Multiple tags per axis allowed; pick all that genuinely apply.
- Use "other" only when no listed tag fits.
- Use "n/a" for model when no specific model is the subject.
- Return ONLY valid JSON matching the schema. No prose, no markdown fences.`;

const TOOL_SCHEMA = {
  name: "publish_article",
  description: "Publish a brief and tags for the article.",
  input_schema: {
    type: "object" as const,
    properties: {
      brief: { type: "string", description: "2-3 sentence factual summary." },
      category: { type: "array", items: { type: "string", enum: [...TAG_VOCAB.category] } },
      domain: { type: "array", items: { type: "string", enum: [...TAG_VOCAB.domain] } },
      company: { type: "array", items: { type: "string", enum: [...TAG_VOCAB.company] } },
      model: { type: "array", items: { type: "string", enum: [...TAG_VOCAB.model] } },
    },
    required: ["brief", "category", "domain", "company", "model"],
  },
};

async function summarize(title: string, content: string): Promise<{
  brief: string;
  tags: Article["tags"];
}> {
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [TOOL_SCHEMA],
    tool_choice: { type: "tool", name: "publish_article" },
    messages: [
      {
        role: "user",
        content: `Title: ${title}\n\nContent:\n${truncate(content, 6000)}`,
      },
    ],
  });

  const toolUse = resp.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not return tool_use block");
  }
  const input = toolUse.input as {
    brief: string;
    category: string[];
    domain: string[];
    company: string[];
    model: string[];
  };
  return {
    brief: input.brief,
    tags: {
      category: input.category,
      domain: input.domain,
      company: input.company,
      model: input.model,
    },
  };
}

async function processFeed(
  feed: { name: string; url: string },
  seen: SeenIndex,
): Promise<Article[]> {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  let parsed;
  try {
    parsed = await parser.parseURL(feed.url);
  } catch (err) {
    console.error(`[${feed.name}] feed error:`, (err as Error).message);
    return [];
  }

  const items = (parsed.items ?? [])
    .filter((it) => it.link && it.title)
    .filter((it) => {
      const ts = it.isoDate ? new Date(it.isoDate).getTime() : Date.now();
      return ts >= cutoff;
    })
    .slice(0, MAX_ARTICLES_PER_FEED);

  const out: Article[] = [];
  for (const it of items) {
    const url = it.link!;
    const id = slugify(url);
    if (seen[id]) continue;

    const title = it.title!.trim();
    const raw = it.contentSnippet || it.content || it.summary || title;
    const content = stripHtml(typeof raw === "string" ? raw : String(raw));

    if (DRY_RUN) {
      console.log(`[dry] would summarize: ${title}`);
      seen[id] = true;
      continue;
    }

    try {
      const { brief, tags } = await summarize(title, content);
      out.push({
        id,
        source: feed.name,
        title,
        url,
        publishedAt: it.isoDate ?? new Date().toISOString(),
        ingestedAt: new Date().toISOString(),
        brief,
        tags,
      });
      seen[id] = true;
      console.log(`  ✓ ${title}`);
    } catch (err) {
      console.error(`  ✗ ${title}:`, (err as Error).message);
    }
  }
  return out;
}

async function main(): Promise<void> {
  await mkdir(ARTICLES_DIR, { recursive: true });
  const seen = await loadSeen();
  const allNew: Article[] = [];

  for (const feed of FEEDS) {
    console.log(`\n[${feed.name}]`);
    const fresh = await processFeed(feed, seen);
    allNew.push(...fresh);
  }

  if (!DRY_RUN) {
    for (const article of allNew) {
      const file = path.join(ARTICLES_DIR, `${article.id}.json`);
      await writeFile(file, JSON.stringify(article, null, 2));
    }
    await saveSeen(seen);
  }

  console.log(`\nDone. ${allNew.length} new articles.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
