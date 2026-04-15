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

// All categories now get Claude summaries

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

// TTS generation
// Cost tracking
let totalInputTokens = 0;
let totalOutputTokens = 0;

// Timeout wrapper — skip to raw summaries if Claude takes too long
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function summarizeWithClaude(categoryKey, catConfig, articles, audience) {
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would summarize ${articles.length} articles for ${categoryKey}`);
    return rawSummaries(articles);
  }

  try {
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
    ? `YOUR MOST IMPORTANT RULE: Each summary MUST be 80-120 words (5-7 sentences). Short summaries are NOT acceptable.

You are writing for teenagers aged 13-18 who know NOTHING about this topic. Do NOT just report what happened. Instead, write a mini-explainer that answers:
1. WHO are the people/organizations involved? Give background (e.g. "Viktor Orbán, who has been Hungary's Prime Minister for 14 years and is known for...")
2. WHY is this happening? What led to this moment?
3. WHAT does it mean? Why does it matter to the world or to a teenager's life?
4. DEFINE every term a teenager might not know (e.g. tariffs, GDP, sanctions, coalition).

Tone: like a smart older friend explaining the news — conversational but informative. NEVER assume prior knowledge.`
    : `For each article, write a 2-3 sentence summary in standard professional news language for adults.`;

  const message = await withTimeout(client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: audience === "teen" ? 8192 : 4096,
    messages: [
      {
        role: "user",
        content: `You are a news editor curating a "${catConfig.label}" digest (${catConfig.description}). Below are today's articles.

Rank the top 10 by relevance and importance.

${audienceInstruction}
${filterInstructions}
Return ONLY valid JSON in this exact format (no markdown, no code fences):
[
  {
    "rank": 1,
    "originalIndex": 1,
    "title": "Article title",
    "summary": "Summary text.",
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
  }), 60000);

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
  } catch (err) {
    console.error(`  Claude failed for ${categoryKey} (${audience}): ${err.message}`);
    return rawSummaries(articles);
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

async function getEnabledCategories() {
  try {
    const config = JSON.parse(await fs.readFile(path.join(DATA_DIR, "config.json"), "utf-8"));
    const adultCats = (config.adultCategories || config.enabledCategories || []).filter(c => ALL_CATEGORIES[c]);
    const teenCats = (config.teenCategories || config.enabledCategories || []).filter(c => ALL_CATEGORIES[c]);
    if (adultCats.length > 0 || teenCats.length > 0) {
      return { adult: adultCats, teen: teenCats };
    }
  } catch {}
  const all = Object.keys(ALL_CATEGORIES);
  return { adult: all, teen: all };
}

async function main() {
  console.log("Starting news digest fetch...");

  await fs.mkdir(DATA_DIR, { recursive: true });

  const edition = process.env.EDITION || getEdition();
  const dateStr = getDateString();
  console.log(`Edition: ${edition}, Date: ${dateStr}`);

  const { adult: adultCategories, teen: teenCategories } = await getEnabledCategories();
  // Union of both lists — fetch articles once, summarize per audience
  const allCategoryKeys = [...new Set([...adultCategories, ...teenCategories])];
  console.log(`Adult categories: ${adultCategories.join(", ")}`);
  console.log(`Teen categories: ${teenCategories.join(", ")}`);

  const adultDigest = {
    date: dateStr,
    edition,
    audience: "adult",
    generatedAt: new Date().toISOString(),
    categories: {},
  };

  const teenDigest = {
    date: dateStr,
    edition,
    audience: "teen",
    generatedAt: new Date().toISOString(),
    categories: {},
  };

  const previousTitles = await loadPreviousTitles();

  // Process all categories in parallel
  async function processCategory(categoryKey) {
    const catConfig = ALL_CATEGORIES[categoryKey];
    if (!catConfig) {
      console.warn(`Unknown category: ${categoryKey}, skipping`);
      return;
    }

    const forAdult = adultCategories.includes(categoryKey);
    const forTeen = teenCategories.includes(categoryKey);

    console.log(`\nFetching ${categoryKey}... (adult: ${forAdult}, teen: ${forTeen})`);

    const rssResults = await Promise.all(catConfig.feeds.map(fetchRSSFeed));
    const rssArticles = rssResults.flat();
    console.log(`  [${categoryKey}] RSS: ${rssArticles.length} articles`);

    const newsApiArticles = await fetchNewsAPI(
      categoryKey,
      catConfig.newsApiQuery
    );
    console.log(`  [${categoryKey}] NewsAPI: ${newsApiArticles.length} articles`);

    const allArticles = deduplicateArticles(
      [...rssArticles, ...newsApiArticles],
      previousTitles
    );
    console.log(`  [${categoryKey}] After dedup: ${allArticles.length} articles`);

    if (allArticles.length === 0) {
      console.warn(`  [${categoryKey}] No articles found`);
      if (forAdult) adultDigest.categories[categoryKey] = [];
      if (forTeen) teenDigest.categories[categoryKey] = [];
      return;
    }

    // Only summarize for audiences that need this category
    const promises = [];
    if (forAdult) promises.push(summarizeWithClaude(categoryKey, catConfig, allArticles, "adult"));
    if (forTeen) promises.push(summarizeWithClaude(categoryKey, catConfig, allArticles, "teen"));
    const results = await Promise.all(promises);

    let idx = 0;
    if (forAdult) { adultDigest.categories[categoryKey] = results[idx++]; }
    if (forTeen) { teenDigest.categories[categoryKey] = results[idx++]; }
    console.log(`  [${categoryKey}] Done`);
  }

  // Process in batches of 5 to avoid Claude rate limits
  for (let i = 0; i < allCategoryKeys.length; i += 5) {
    const batch = allCategoryKeys.slice(i, i + 5);
    await Promise.all(batch.map(processCategory));
  }

  // Write adult digest files
  const filename = `digest-${dateStr}-${edition}.json`;
  await fs.writeFile(
    path.join(DATA_DIR, filename),
    JSON.stringify(adultDigest, null, 2)
  );
  await fs.writeFile(
    path.join(DATA_DIR, "latest.json"),
    JSON.stringify(adultDigest, null, 2)
  );

  // Write teen digest files
  const teenFilename = `digest-${dateStr}-${edition}-teen.json`;
  await fs.writeFile(
    path.join(DATA_DIR, teenFilename),
    JSON.stringify(teenDigest, null, 2)
  );
  await fs.writeFile(
    path.join(DATA_DIR, "latest-teen.json"),
    JSON.stringify(teenDigest, null, 2)
  );
  console.log(`\nWritten: ${filename}, ${teenFilename}, latest.json, latest-teen.json`);

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
