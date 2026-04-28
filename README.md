# AI Digest

A daily-updating, statically-generated AI news digest. Pulls articles from RSS feeds, summarizes each with Claude Haiku 4.5, and tags them across four axes (category, domain, company, model) so readers can filter to exactly what they care about.

## Stack

- **Astro** — static site, zero runtime cost.
- **Claude Haiku 4.5** — summary + tagging in one tool-use call (constrained to a fixed tag vocabulary for consistency).
- **rss-parser** — pulls headlines from major AI sources.
- **GitHub Actions** — runs ingest daily, commits new article JSON, triggers a redeploy.

## Local setup

```bash
npm install
cp .env.example .env
# add your ANTHROPIC_API_KEY to .env

# Pull and summarize today's articles
npm run ingest

# Preview the site
npm run dev
```

Run `npm run ingest:dry` to fetch feeds without calling the API (useful for debugging feed parsing).

## How it works

1. `scripts/feeds.ts` — list of RSS sources and the **fixed tag vocabulary**. Edit this to add sources or tags.
2. `scripts/ingest.ts` — for each feed, fetch new items (last 2 days, max 8/feed), check `data/seen.json` to skip already-processed URLs, then call Claude with a tool-use schema that forces it to return `{brief, category[], domain[], company[], model[]}` with values constrained to the vocab.
3. Each article is written as `data/articles/<id>.json`.
4. Astro reads `data/articles/` at build time and statically renders the index, plus a page per `tag/<axis>/<value>`.

## Deployment

1. Push to GitHub.
2. Add `ANTHROPIC_API_KEY` as a repo secret.
3. Connect the repo to Vercel/Netlify/Cloudflare Pages (build command: `npm run build`, output: `dist/`).
4. The daily workflow commits new articles → push triggers a fresh deploy.

## Cost

At ~40 articles/day with Haiku 4.5 + cached system prompt: **~$4/month** for the API. Hosting and GH Actions cron are free on standard tiers.

## Customizing

- **Add sources**: append to `FEEDS` in `scripts/feeds.ts`.
- **Change tags**: edit `TAG_VOCAB` in `scripts/feeds.ts` — the tool schema uses these as enums, so the model can only emit listed values.
- **Better summaries**: swap `claude-haiku-4-5-20251001` for `claude-sonnet-4-6` in `scripts/ingest.ts` (~5× cost).
- **Backfill**: bump `MAX_AGE_DAYS` in `scripts/ingest.ts` and run `npm run ingest`.
