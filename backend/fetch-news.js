import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DATA_DIR = path.join(__dirname, "..", "data");
const DRY_RUN = process.argv.includes("--dry-run");

// RSS feed sources by category
const FEEDS = {
  "automotive-ev-battery": [
    { name: "Electrive", url: "https://www.electrive.com/feed/" },
    { name: "InsideEVs", url: "https://www.insideevs.com/rss/news/" },
    { name: "CleanTechnica", url: "https://cleantechnica.com/feed/" },
    { name: "Automotive News", url: "https://www.autonews.com/arc/outboundfeeds/rss/?outputType=xml" },
    { name: "Green Car Reports", url: "https://www.greencarreports.com/rss" },
    { name: "Charged EVs", url: "https://chargedevs.com/feed/" },
    { name: "Electrek", url: "https://electrek.co/feed/" },
  ],
  "tech-ai": [
    { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
    { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
    { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
    { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
    { name: "Wired", url: "https://www.wired.com/feed/rss" },
    { name: "The Register", url: "https://www.theregister.com/headlines.atom" },
    { name: "Hacker News", url: "https://hnrss.org/frontpage" },
  ],
  "world-news": [
    { name: "Reuters World", url: "https://www.reutersagency.com/feed/?best-topics=world&post_type=best" },
    { name: "AP News", url: "https://feedx.net/rss/ap.xml" },
    { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
    { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml" },
    { name: "The Guardian World", url: "https://www.theguardian.com/world/rss" },
    { name: "DW News", url: "https://rss.dw.com/rdf/rss-en-all" },
  ],
};

// NewsAPI category mappings
const NEWSAPI_QUERIES = {
  "automotive-ev-battery":
    "electric vehicle OR EV battery OR automotive technology OR Tesla OR charging",
  "tech-ai":
    "artificial intelligence OR AI startup OR machine learning OR tech company",
  "world-news":
    "geopolitics OR war OR economy OR climate OR summit OR election",
};

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; NewsDigestBot/1.0; +https://github.com/news-digest)",
  },
});

async function fetchRSSFeed(source) {
  try {
    const feed = await parser.parseURL(source.url);
    return feed.items.slice(0, 10).map((item) => ({
      title: item.title || "",
      description: (item.contentSnippet || item.content || "").slice(0, 500),
      link: item.link || "",
      source: source.name,
      pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
    }));
  } catch (err) {
    console.warn(`Failed to fetch RSS from ${source.name}: ${err.message}`);
    return [];
  }
}

async function fetchNewsAPI(category) {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    console.warn("NEWSAPI_KEY not set, skipping NewsAPI");
    return [];
  }

  const query = NEWSAPI_QUERIES[category];
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
      pubDate: a.publishedAt || new Date().toISOString(),
    }));
  } catch (err) {
    console.warn(`Failed to fetch NewsAPI for ${category}: ${err.message}`);
    return [];
  }
}

function deduplicateArticles(articles) {
  const seen = new Set();
  return articles.filter((a) => {
    // Normalize title for dedup
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function summarizeWithClaude(category, articles) {
  if (DRY_RUN) {
    console.log(
      `[DRY RUN] Would summarize ${articles.length} articles for ${category}`
    );
    return articles.slice(0, 10).map((a) => ({
      title: a.title,
      summary: a.description || "No description available.",
      source: a.source,
      link: a.link,
      pubDate: a.pubDate,
    }));
  }

  const client = new Anthropic();

  const articleList = articles
    .slice(0, 20)
    .map(
      (a, i) =>
        `${i + 1}. [${a.source}] ${a.title}\n   ${a.description || "No description"}`
    )
    .join("\n\n");

  const categoryLabels = {
    "automotive-ev-battery": "Automotive / EV / Battery",
    "tech-ai": "Tech / AI",
    "world-news": "Global World News — major events that shape geopolitics, economies, and societies",
  };
  const categoryLabel = categoryLabels[category] || category;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a news editor curating a "${categoryLabel}" digest. Below are today's articles.

Rank the top 10 by relevance and importance. For each, write a 2-3 sentence summary that captures the key news.

Return ONLY valid JSON in this exact format (no markdown, no code fences):
[
  {
    "rank": 1,
    "title": "Article title",
    "summary": "2-3 sentence summary.",
    "source": "Source Name",
    "link": "https://...",
    "pubDate": "ISO date string"
  }
]

Articles:
${articleList}

Source URLs for reference:
${articles
  .slice(0, 20)
  .map((a, i) => `${i + 1}. ${a.link}`)
  .join("\n")}`,
      },
    ],
  });

  const text = message.content[0].text.trim();

  try {
    return JSON.parse(text);
  } catch {
    // Try extracting JSON from response
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    console.error("Failed to parse Claude response:", text.slice(0, 200));
    // Fallback: return raw articles
    return articles.slice(0, 10).map((a) => ({
      title: a.title,
      summary: a.description || "No description available.",
      source: a.source,
      link: a.link,
      pubDate: a.pubDate,
    }));
  }
}

function getEdition() {
  // Bangkok time is UTC+7
  const now = new Date();
  const bangkokHour =
    (now.getUTCHours() + 7) % 24;
  // Morning edition: 0-12, Evening edition: 12-24
  return bangkokHour < 12 ? "morning" : "evening";
}

function getDateString() {
  const now = new Date();
  // Bangkok date
  const bangkokTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bangkokTime.toISOString().split("T")[0];
}

async function main() {
  console.log("Starting news digest fetch...");

  await fs.mkdir(DATA_DIR, { recursive: true });

  const edition = process.env.EDITION || getEdition();
  const dateStr = getDateString();
  console.log(`Edition: ${edition}, Date: ${dateStr}`);

  const digest = {
    date: dateStr,
    edition,
    generatedAt: new Date().toISOString(),
    categories: {},
  };

  for (const [category, sources] of Object.entries(FEEDS)) {
    console.log(`\nFetching ${category}...`);

    // Fetch from RSS feeds in parallel
    const rssResults = await Promise.all(sources.map(fetchRSSFeed));
    const rssArticles = rssResults.flat();
    console.log(`  RSS: ${rssArticles.length} articles`);

    // Fetch from NewsAPI as fallback/supplement
    const newsApiArticles = await fetchNewsAPI(category);
    console.log(`  NewsAPI: ${newsApiArticles.length} articles`);

    // Combine and deduplicate
    const allArticles = deduplicateArticles([
      ...rssArticles,
      ...newsApiArticles,
    ]);
    console.log(`  After dedup: ${allArticles.length} articles`);

    if (allArticles.length === 0) {
      console.warn(`  No articles found for ${category}`);
      digest.categories[category] = [];
      continue;
    }

    // Summarize with Claude
    const summarized = await summarizeWithClaude(category, allArticles);
    digest.categories[category] = summarized;
    console.log(`  Summarized: ${summarized.length} articles`);
  }

  // Write output files
  const filename = `digest-${dateStr}-${edition}.json`;
  const filepath = path.join(DATA_DIR, filename);
  await fs.writeFile(filepath, JSON.stringify(digest, null, 2));
  console.log(`\nWritten: ${filepath}`);

  // Also write a "latest.json" for the frontend to easily fetch
  const latestPath = path.join(DATA_DIR, "latest.json");
  await fs.writeFile(latestPath, JSON.stringify(digest, null, 2));
  console.log(`Written: ${latestPath}`);

  // Write an index of all available digests
  const files = await fs.readdir(DATA_DIR);
  const digestFiles = files
    .filter((f) => f.startsWith("digest-") && f.endsWith(".json"))
    .sort()
    .reverse();
  const indexPath = path.join(DATA_DIR, "index.json");
  await fs.writeFile(indexPath, JSON.stringify({ digests: digestFiles }, null, 2));
  console.log(`Written: ${indexPath}`);

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
