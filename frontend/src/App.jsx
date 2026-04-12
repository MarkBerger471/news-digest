import { useState, useEffect, useCallback } from "react";
import "./index.css";

const DATA_BASE_URL =
  import.meta.env.VITE_DATA_URL || "/data";

const CATEGORIES = [
  { key: "world-news", label: "World" },
  { key: "automotive-ev-battery", label: "Auto / EV" },
  { key: "tech-ai", label: "Tech / AI" },
];

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Article({ article, index }) {
  return (
    <article className="article">
      <div className="article-rank">#{index + 1}</div>
      <h3 className="article-title">
        <a href={article.link} target="_blank" rel="noopener noreferrer">
          {article.title}
        </a>
      </h3>
      <p className="article-summary">{article.summary}</p>
      <div className="article-meta">
        <span className="article-source">{article.source}</span>
        <span className="dot">&middot;</span>
        <span>{timeAgo(article.pubDate)}</span>
        <span className="dot">&middot;</span>
        <a
          className="article-link"
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Read article &rarr;
        </a>
      </div>
    </article>
  );
}

export default function App() {
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("world-news");
  const [edition, setEdition] = useState(null);
  const [availableDigests, setAvailableDigests] = useState([]);

  const fetchDigest = useCallback(async (filename) => {
    setLoading(true);
    setError(null);
    try {
      const url = filename
        ? `${DATA_BASE_URL}/${filename}`
        : `${DATA_BASE_URL}/latest.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDigest(data);
      setEdition(data.edition);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIndex = useCallback(async () => {
    try {
      const res = await fetch(`${DATA_BASE_URL}/index.json`);
      if (res.ok) {
        const data = await res.json();
        setAvailableDigests(data.digests || []);
      }
    } catch {
      // Index not critical
    }
  }, []);

  useEffect(() => {
    fetchDigest();
    fetchIndex();
  }, [fetchDigest, fetchIndex]);

  const handleEditionToggle = (ed) => {
    if (!digest) return;
    const dateStr = digest.date;
    const filename = `digest-${dateStr}-${ed}.json`;
    if (availableDigests.includes(filename)) {
      fetchDigest(filename);
    }
  };

  const handleRefresh = () => {
    fetchDigest();
    fetchIndex();
  };

  const articles =
    digest?.categories?.[activeTab] || [];

  return (
    <>
      <header className="header">
        <div className="header-top">
          <h1>News Digest</h1>
          <div className="edition-toggle">
            <button
              className={`edition-btn ${edition === "morning" ? "active" : ""}`}
              onClick={() => handleEditionToggle("morning")}
            >
              AM
            </button>
            <button
              className={`edition-btn ${edition === "evening" ? "active" : ""}`}
              onClick={() => handleEditionToggle("evening")}
            >
              PM
            </button>
          </div>
        </div>
        <nav className="tabs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              className={`tab ${activeTab === cat.key ? "active" : ""}`}
              onClick={() => setActiveTab(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {digest?.date && (
          <div className="digest-date">
            {formatDate(digest.date)} &middot;{" "}
            {edition === "morning" ? "Morning" : "Evening"} Edition
          </div>
        )}

        <div
          className="refresh-bar"
          onClick={handleRefresh}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleRefresh()}
        >
          Tap to refresh
        </div>

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <p>Loading digest...</p>
          </div>
        )}

        {error && (
          <div className="error">
            <p>Failed to load: {error}</p>
            <p style={{ marginTop: 8, fontSize: 13, color: "#94a3b8" }}>
              Make sure the backend has run at least once to generate data.
            </p>
          </div>
        )}

        {!loading && !error && articles.length === 0 && (
          <div className="empty">
            <p>No articles available for this category.</p>
          </div>
        )}

        {!loading && !error && articles.length > 0 && (
          <div className="article-list">
            {articles.map((article, i) => (
              <Article
                key={article.link || i}
                article={article}
                index={i}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="footer">
        AI-summarized by Claude &middot; Updated twice daily
      </footer>
    </>
  );
}
