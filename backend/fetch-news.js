import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { ALL_CATEGORIES, DEFAULT_ENABLED } from "./categories.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DATA_DIR = path.join(__dirname, "..", "data");
const DRY_RUN = process.argv.includes("--dry-run");

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; NewsDigestBot/1.0; +https://github.com/news-digest)",
  },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: false }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: false }],
      ["enclosure", "enclosure", { keepArray: false }],
    ],
  },
});

async function fetchRSSFeed(source) {
  try {
    const feed = await parser.parseURL(source.url);
    return feed.items.slice(0, 10).map((item) => {
      let image = null;
      if (item.mediaContent?.$?.url) image = item.mediaContent.$.url;
      else if (item.mediaThumbnail?.$?.url) image = item.mediaThumbnail.$.url;
      else if (item.enclosure?.url && item.enclosure.type?.startsWith("image/"))
        image = item.enclosure.url;
      if (!image && item.content) {
        const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/);
        if (imgMatch) image = imgMatch[1];
      }
      return {
        title: safeString(item.title),
        description: safeString(item.contentSnippet || item.content).slice(0, 500),
        link: safeString(item.link),
        source: source.name,
        image,
        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
      };
    });
  } catch (err) {
    console.warn(`Failed to fetch RSS from ${source.name}: ${err.message}`);
    return [];
  }
}

async function fetchNewsAPI(category, query) {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey || !query) return [];

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=20&language=en&apiKey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsAPI HTTP ${res.status}`);
    const data = await res.json();
    return (data.articles || []).map((a) => ({
      title: a.title || "",
      description: (a.description || "").slice(0, 500),
      link: a.url || "",
      source: a.source?.name || "NewsAPI",
      image: a.urlToImage || null,
      pubDate: a.publishedAt || new Date().toISOString(),
    }));
  } catch (err) {
    console.warn(`Failed to fetch NewsAPI for ${category}: ${err.message}`);
    return [];
  }
}

function normalizeTitle(title) {
  if (!title) return "";
  if (typeof title === "object") title = title._ || title.text || JSON.stringify(title);
  return String(title).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
}

function safeString(val) {
  if (!val) return "";
  if (typeof val === "object") return val._ || val.text || "";
  return String(val);
}

async function loadPreviousTitles() {
  const seen = new Set();
  try {
    const files = await fs.readdir(DATA_DIR);
    const digestFiles = files
      .filter((f) => f.startsWith("digest-") && f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, 4);
    for (const file of digestFiles) {
      const data = JSON.parse(
        await fs.readFile(path.join(DATA_DIR, file), "utf-8")
      );
      for (const articles of Object.values(data.categories || {})) {
        for (const a of articles) {
          seen.add(normalizeTitle(a.title));
        }
      }
    }
  } catch {
    // No previous digests
  }
  console.log(`  Loaded ${seen.size} previously shown titles`);
  return seen;
}

function deduplicateArticles(articles, previousTitles) {
  const seen = new Set();
  return articles.filter((a) => {
    const key = normalizeTitle(a.title);
    if (!key || seen.has(key) || previousTitles.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Categories that get Claude-powered summaries; others get raw descriptions
const CLAUDE_CATEGORIES = [
  "world-news",
  "automotive-ev-battery",
  "tech-ai",
];

function rawSummaries(articles) {
  return articles.slice(0, 10).map((a, i) => ({
    rank: i + 1,
    title: a.title,
    summary: a.description || "No description available.",
    source: a.source,
    link: a.link,
    image: a.image || null,
    pubDate: a.pubDate,
  }));
}

// Cost tracking
let totalInputTokens = 0;
let totalOutputTokens = 0;

async function loadAudience() {
  try {
    const config = JSON.parse(await fs.readFile(path.join(DATA_DIR, "config.json"), "utf-8"));
    return config.audience || "adult";
  } catch {
    return "adult";
  }
}

async function summarizeWithClaude(categoryKey, catConfig, articles, audience) {
  if (DRY_RUN || !CLAUDE_CATEGORIES.includes(categoryKey)) {
    if (!DRY_RUN) console.log(`  Using raw summaries for ${categoryKey}`);
    else console.log(`[DRY RUN] Would summarize ${articles.length} articles for ${categoryKey}`);
    return rawSummaries(articles);
  }

  const client = new Anthropic();

  const top20 = articles.slice(0, 20);
  const imageMap = {};
  top20.forEach((a, i) => {
    if (a.image) imageMap[i + 1] = a.image;
  });

  const articleList = top20
    .map(
      (a, i) =>
        `${i + 1}. [${a.source}] ${a.title}\n   ${a.description || "No description"}`
    )
    .join("\n\n");

  const filterInstructions = catConfig.claudeFilter
    ? `\n${catConfig.claudeFilter}\n`
    : "";

  const audienceInstruction = audience === "teen"
    ? `Write summaries for teenagers aged 13-18: use simpler vocabulary, shorter sentences, relatable context, and explain any jargon. Keep it informative but accessible and engaging.`
    : `Write summaries in standard professional news language for adults.`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a news editor curating a "${catConfig.label}" digest (${catConfig.description}). Below are today's articles.

Rank the top 10 by relevance and importance. For each, write a 2-3 sentence summary.

${audienceInstruction}
${filterInstructions}
Return ONLY valid JSON in this exact format (no markdown, no code fences):
[
  {
    "rank": 1,
    "originalIndex": 1,
    "title": "Article title",
    "summary": "2-3 sentence summary.",
    "source": "Source Name",
    "link": "https://...",
    "pubDate": "ISO date string"
  }
]

IMPORTANT: Include the "originalIndex" field matching the article number from the list below.

Articles:
${articleList}

Source URLs for reference:
${top20.map((a, i) => `${i + 1}. ${a.link}`).join("\n")}`,
      },
    ],
  });

  // Track token usage
  totalInputTokens += message.usage?.input_tokens || 0;
  totalOutputTokens += message.usage?.output_tokens || 0;

  const text = message.content[0].text.trim();

  function attachImages(results) {
    return results.map((r) => {
      const idx = r.originalIndex;
      r.image = (idx && imageMap[idx]) || null;
      delete r.originalIndex;
      return r;
    });
  }

  try {
    return attachImages(JSON.parse(text));
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return attachImages(JSON.parse(match[0]));
    console.error("Failed to parse Claude response:", text.slice(0, 200));
    return articles.slice(0, 10).map((a) => ({
      title: a.title,
      summary: a.description || "No description available.",
      source: a.source,
      link: a.link,
      image: a.image || null,
      pubDate: a.pubDate,
    }));
  }
}

function getEdition() {
  const now = new Date();
  const bangkokHour = (now.getUTCHours() + 7) % 24;
  return bangkokHour < 12 ? "morning" : "evening";
}

function getDateString() {
  const now = new Date();
  const bangkokTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bangkokTime.toISOString().split("T")[0];
}

function getEnabledCategories() {
  // Always fetch all categories so data is available when users enable them
  return Object.keys(ALL_CATEGORIES);
}

async function main() {
  console.log("Starting news digest fetch...");

  await fs.mkdir(DATA_DIR, { recursive: true });

  const edition = process.env.EDITION || getEdition();
  const dateStr = getDateString();
  console.log(`Edition: ${edition}, Date: ${dateStr}`);

  const enabledCategories = getEnabledCategories();
  console.log(`Enabled categories: ${enabledCategories.join(", ")}`);

  const audience = await loadAudience();
  console.log(`Audience mode: ${audience}`);

  const digest = {
    date: dateStr,
    edition,
    audience,
    generatedAt: new Date().toISOString(),
    categories: {},
  };

  const previousTitles = await loadPreviousTitles();

  for (const categoryKey of enabledCategories) {
    const catConfig = ALL_CATEGORIES[categoryKey];
    if (!catConfig) {
      console.warn(`Unknown category: ${categoryKey}, skipping`);
      continue;
    }

    console.log(`\nFetching ${categoryKey}...`);

    const rssResults = await Promise.all(catConfig.feeds.map(fetchRSSFeed));
    const rssArticles = rssResults.flat();
    console.log(`  RSS: ${rssArticles.length} articles`);

    const newsApiArticles = await fetchNewsAPI(
      categoryKey,
      catConfig.newsApiQuery
    );
    console.log(`  NewsAPI: ${newsApiArticles.length} articles`);

    const allArticles = deduplicateArticles(
      [...rssArticles, ...newsApiArticles],
      previousTitles
    );
    console.log(`  After dedup: ${allArticles.length} articles`);

    if (allArticles.length === 0) {
      console.warn(`  No articles found for ${categoryKey}`);
      digest.categories[categoryKey] = [];
      continue;
    }

    const summarized = await summarizeWithClaude(
      categoryKey,
      catConfig,
      allArticles,
      audience
    );
    digest.categories[categoryKey] = summarized;
    console.log(`  Summarized: ${summarized.length} articles`);
  }

  // Write digest files
  const filename = `digest-${dateStr}-${edition}.json`;
  await fs.writeFile(
    path.join(DATA_DIR, filename),
    JSON.stringify(digest, null, 2)
  );
  await fs.writeFile(
    path.join(DATA_DIR, "latest.json"),
    JSON.stringify(digest, null, 2)
  );
  console.log(`\nWritten: ${filename}, latest.json`);

  // Write full catalog for the frontend settings UI
  const catalog = {};
  for (const [key, cat] of Object.entries(ALL_CATEGORIES)) {
    catalog[key] = {
      label: cat.label,
      description: cat.description,
      icon: cat.icon,
      sources: cat.feeds.map((f) => f.name),
    };
  }
  await fs.writeFile(
    path.join(DATA_DIR, "catalog.json"),
    JSON.stringify(catalog, null, 2)
  );
  console.log("Written: catalog.json");

  // Write index
  const files = await fs.readdir(DATA_DIR);
  const digestFiles = files
    .filter((f) => f.startsWith("digest-") && f.endsWith(".json"))
    .sort()
    .reverse();
  await fs.writeFile(
    path.join(DATA_DIR, "index.json"),
    JSON.stringify({ digests: digestFiles }, null, 2)
  );
  console.log("Written: index.json");

  // Calculate and save cost info
  const inputCost = totalInputTokens * 0.80 / 1_000_000;
  const outputCost = totalOutputTokens * 4.00 / 1_000_000;
  const totalCost = inputCost + outputCost;
  const costInfo = {
    date: dateStr,
    edition,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    estimatedCostUSD: Math.round(totalCost * 10000) / 10000,
    model: "claude-haiku-4-5-20251001",
  };

  // Append to cost log
  let costLog = [];
  try {
    costLog = JSON.parse(await fs.readFile(path.join(DATA_DIR, "costs.json"), "utf-8"));
  } catch {}
  costLog.push(costInfo);
  // Keep last 60 entries (2 months)
  if (costLog.length > 60) costLog = costLog.slice(-60);
  await fs.writeFile(path.join(DATA_DIR, "costs.json"), JSON.stringify(costLog, null, 2));
  console.log(`\nCost: ${totalInputTokens} in + ${totalOutputTokens} out = $${costInfo.estimatedCostUSD}`);

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
