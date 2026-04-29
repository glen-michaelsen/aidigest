/**
 * Weekly digest sender.
 * Run via GitHub Actions every Monday at 07:00 UTC, or manually:
 *   npx tsx scripts/send-digest.ts
 *
 * Required env vars (set as GitHub secrets):
 *   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, RESEND_API_KEY, SITE_URL
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// ─── Config ──────────────────────────────────────────────────────────────────

const SITE = (process.env.SITE_URL ?? "https://aidigest-iota.vercel.app").replace(/\/$/, "");
const RESEND_KEY = process.env.RESEND_API_KEY ?? "";
const MAX_ARTICLES = 10;
const LOOKBACK_DAYS = 7;

// ─── Article loading ──────────────────────────────────────────────────────────

type TagAxis = "category" | "domain" | "company" | "model";
type Article = {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  brief: string;
  tags: Record<TagAxis, string[]>;
};

async function loadRecentArticles(): Promise<Article[]> {
  const dir = path.resolve("data/articles");
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - LOOKBACK_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const articles: Article[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const raw = await readFile(path.join(dir, f), "utf8");
    const a = JSON.parse(raw) as Article;
    if (a.publishedAt.slice(0, 10) >= cutoffStr) articles.push(a);
  }
  articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return articles;
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

function scoreArticle(article: Article, tagScores: Map<string, number>): number {
  let total = 0;
  for (const [axis, tags] of Object.entries(article.tags)) {
    for (const tag of tags as string[]) {
      total += tagScores.get(`${axis}:${tag}`) ?? 0;
    }
  }
  return total;
}

function selectArticles(
  pool: Article[],
  categories: string[],    // empty = all
  tagScores: Map<string, number>,
): Article[] {
  let filtered = categories.length > 0
    ? pool.filter((a) => {
        const cat = a.tags.category?.[0];
        return cat !== undefined && categories.includes(cat);
      })
    : pool;

  // Sort by preference score, recency as tiebreaker
  filtered = [...filtered].sort((a, b) => {
    const diff = scoreArticle(b, tagScores) - scoreArticle(a, tagScores);
    return diff !== 0 ? diff : b.publishedAt.localeCompare(a.publishedAt);
  });

  return filtered.slice(0, MAX_ARTICLES);
}

// ─── Email template ───────────────────────────────────────────────────────────

const PILL_BG: Record<string, string> = {
  "research":       "#ffd9c0",
  "product-launch": "#c5e8d5",
  "funding":        "#d8d4f3",
  "policy":         "#c8dcef",
  "safety":         "#fbe4a3",
  "open-source":    "#d6ecc7",
  "benchmarks":     "#b9e2d6",
  "infrastructure": "#d4d0f0",
  "incident":       "#f5c6c0",
  "opinion":        "#e3dccf",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function weekRange(): string {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);          // yesterday
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);       // 7 days back
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}, ${end.getUTCFullYear()}`;
}

function renderEmail(articles: Article[]): string {
  const range = weekRange();

  const cards = articles.map((a) => {
    const cat     = a.tags.category?.[0] ?? "";
    const pillBg  = PILL_BG[cat] ?? "#ece4d6";
    const catLabel = cat.replace(/-/g, " ");
    const date    = new Date(a.publishedAt).toLocaleDateString("en-US", {
      month: "short", day: "numeric", timeZone: "UTC",
    });
    return `
      <div style="background:#fffaf3;border:1px solid #e8ddcc;border-radius:12px;padding:1.25rem;margin-bottom:1rem;">
        <div style="margin-bottom:0.6rem;">
          <span style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;background:${pillBg};color:#4a3f33;padding:0.2rem 0.65rem;border-radius:999px;">${esc(catLabel)}</span>
        </div>
        <h2 style="font-family:Georgia,serif;font-size:1.05rem;font-weight:600;margin:0 0 0.5rem;line-height:1.3;">
          <a href="${esc(a.url)}" style="color:#1f1a17;text-decoration:none;">${esc(a.title)}</a>
        </h2>
        <p style="color:#3a3128;font-size:0.875rem;margin:0 0 0.65rem;line-height:1.55;">${esc(a.brief)}</p>
        <p style="color:#7a6f66;font-size:0.78rem;margin:0;">${esc(a.source)} · ${date}</p>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f7efe5;">
  <div style="max-width:600px;margin:0 auto;padding:2rem 1.5rem;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

    <div style="margin-bottom:2rem;">
      <div style="font-family:Georgia,serif;font-size:1.6rem;font-weight:600;color:#1f1a17;margin-bottom:0.25rem;">
        AI <em style="color:#c9603f;font-style:italic;">Digest</em>
      </div>
      <p style="color:#7a6f66;font-size:0.875rem;margin:0;">Your weekly roundup · ${range}</p>
    </div>

    ${cards}

    <div style="margin-top:2rem;padding-top:1.5rem;border-top:1px solid #e8ddcc;">
      <p style="color:#7a6f66;font-size:0.82rem;margin:0 0 0.5rem;">
        <a href="${SITE}" style="color:#c9603f;text-decoration:none;font-weight:500;">Read more on AI Digest →</a>
      </p>
      <p style="color:#aaa;font-size:0.75rem;margin:0;">
        <a href="${SITE}/settings" style="color:#aaa;text-decoration:none;">Manage email preferences</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Validate all required env vars before touching any external service
  const missing = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "RESEND_API_KEY"].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    console.error("Missing required environment variables:", missing.join(", "));
    console.error("Add them as GitHub repository secrets (Settings → Secrets → Actions).");
    process.exit(1);
  }

  // Create DB client only after env vars are confirmed present
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  console.log(`Loading articles from the last ${LOOKBACK_DAYS} days…`);
  const allArticles = await loadRecentArticles();
  console.log(`  ${allArticles.length} articles found.`);

  if (allArticles.length === 0) {
    console.log("No articles — skipping digest.");
    process.exit(0);
  }

  // Fetch all enabled subscriptions joined with user email
  const { rows: subs } = await db.execute(
    `SELECT ds.user_id, ds.categories, u.email
     FROM digest_subscriptions ds
     JOIN users u ON u.id = ds.user_id
     WHERE ds.enabled = 1`,
  );

  console.log(`Sending digest to ${subs.length} subscriber(s)…\n`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of subs) {
    const userId    = sub.user_id as string;
    const email     = sub.email as string;
    const categories: string[] = JSON.parse(sub.categories as string ?? "[]");

    // Fetch this user's learned tag preferences
    const { rows: scoreRows } = await db.execute({
      sql: "SELECT axis, tag, score FROM tag_scores WHERE user_id = ? AND score > 0",
      args: [userId],
    });
    const tagScores = new Map<string, number>();
    for (const r of scoreRows) {
      tagScores.set(`${r.axis}:${r.tag}`, r.score as number);
    }

    const selection = selectArticles(allArticles, categories, tagScores);
    if (selection.length === 0) {
      console.log(`  skip  ${email} — no articles match their topic filter`);
      skipped++;
      continue;
    }

    const html    = renderEmail(selection);
    const range   = weekRange();
    const subject = `Your AI Digest — ${selection.length} top stories · ${range}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AI Digest <onboarding@resend.dev>",
        to: [email],
        subject,
        html,
      }),
    });

    if (res.ok) {
      console.log(`  ✓  sent  ${email} (${selection.length} articles)`);
      sent++;
    } else {
      const err = await res.text();
      console.error(`  ✗  fail  ${email}: ${err}`);
      failed++;
    }
  }

  console.log(`\nDone. ✓ ${sent} sent  ↷ ${skipped} skipped  ✗ ${failed} failed`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
