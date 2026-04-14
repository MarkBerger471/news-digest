import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Settings from "./Settings.jsx";
import "./index.css";

const DATA_BASE_URL = import.meta.env.VITE_DATA_URL || "/data";
const AUDIENCE = import.meta.env.VITE_AUDIENCE || "adult";

const DEFAULT_CATEGORIES = AUDIENCE === "teen"
  ? ["world-news", "asia-pacific", "tech-ai", "science-space", "nature-science", "energy-climate", "school-education", "sports", "finance-markets", "music-arts"]
  : ["world-news", "automotive-ev-battery", "tech-ai"];

// Master category order per audience
const ADULT_CATEGORY_ORDER = [
  "world-news",
  "automotive-ev-battery",
  "tech-ai",
  "finance-markets",
  "science-space",
  "energy-climate",
  "health-biotech",
  "crypto-web3",
  "startups-vc",
  "cybersecurity",
  "asia-pacific",
];

const TEEN_CATEGORY_ORDER = [
  "world-news",
  "asia-pacific",
  "tech-ai",
  "science-space",
  "nature-science",
  "energy-climate",
  "school-education",
  "sports",
  "finance-markets",
  "music-arts",
];

const CATEGORY_ORDER = AUDIENCE === "teen" ? TEEN_CATEGORY_ORDER : ADULT_CATEGORY_ORDER;

function sortByOrder(categories) {
  return CATEGORY_ORDER.filter((c) => categories.includes(c));
}

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

function formatSummary(summary, mode) {
  if (!summary) return "";
  if (mode === "title") return "";
  if (mode === "short") return summary.split(/\.\s/)[0] + ".";
  return summary;
}

let currentAudio = null;

function getPlaybackSpeed() {
  try { return parseFloat(localStorage.getItem("playbackSpeed")) || 1; } catch { return 1; }
}

function PlayButton({ text }) {
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speed, setSpeed] = useState(getPlaybackSpeed);
  const audioRef = useRef(null);

  const changeSpeed = (delta, e) => {
    e.stopPropagation();
    const next = Math.round((Math.min(2, Math.max(0.5, speed + delta))) * 10) / 10;
    setSpeed(next);
    localStorage.setItem("playbackSpeed", next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const toggle = async () => {
    // Pause
    if (playing) {
      if (audioRef.current) audioRef.current.pause();
      setPlaying(false);
      return;
    }

    // Resume existing audio
    if (started && audioRef.current && audioRef.current.currentTime > 0) {
      audioRef.current.playbackRate = speed;
      audioRef.current.play();
      currentAudio = audioRef.current;
      setPlaying(true);
      return;
    }

    // Stop any other playing audio
    if (currentAudio && currentAudio !== audioRef.current) {
      currentAudio.pause();
      currentAudio = null;
    }

    // Fetch TTS on demand
    setLoading(true);
    try {
      const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}`);
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = speed;
      audio.onended = () => { setPlaying(false); setStarted(false); audioRef.current = null; currentAudio = null; };
      audio.onerror = () => { setPlaying(false); setStarted(false); audioRef.current = null; currentAudio = null; };
      audio.play();
      audioRef.current = audio;
      currentAudio = audio;
      setPlaying(true);
      setStarted(true);
    } catch {
      // Fallback to browser TTS
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = speed;
      utterance.onend = () => { setPlaying(false); setStarted(false); };
      utterance.onerror = () => { setPlaying(false); setStarted(false); };
      speechSynthesis.speak(utterance);
      setPlaying(true);
      setStarted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="play-controls">
      <button className={`play-btn ${playing ? "playing" : ""} ${loading ? "loading" : ""}`} onClick={toggle} disabled={loading} title={loading ? "Loading..." : playing ? "Pause" : started ? "Resume" : "Listen"}>
        {loading ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin"><circle cx="12" cy="12" r="10" strokeDasharray="30 60"/></svg>
        ) : playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>
      {started && (
        <span className="speed-controls">
          <button className="speed-btn" onClick={(e) => changeSpeed(-0.1, e)} title="Slower">-</button>
          <span className="speed-label">{speed.toFixed(1)}x</span>
          <button className="speed-btn" onClick={(e) => changeSpeed(0.1, e)} title="Faster">+</button>
        </span>
      )}
    </span>
  );
}

function Article({ article, index, summaryDisplay }) {
  const [imgError, setImgError] = useState(false);
  const summary = article.summary;

  return (
    <article className="article">
      {article.image && !imgError && (
        <div className="article-image">
          <img
            src={article.image}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      )}
      <div className="article-body">
        <div className="article-rank">#{index + 1}</div>
        <h3 className="article-title">
          <a href={article.link} target="_blank" rel="noopener noreferrer">
            {article.title}
          </a>
        </h3>
        {summaryDisplay !== "title" && (
          <p className="article-summary">
            {formatSummary(summary, summaryDisplay)}
          </p>
        )}
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
            Read &rarr;
          </a>
          {summary && AUDIENCE === "teen" && (
            <>
              <span className="dot">&middot;</span>
              <PlayButton text={`${article.title}. ${summary}`} />
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function loadFromStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [edition, setEdition] = useState(null);
  const [availableDigests, setAvailableDigests] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [catalog, setCatalog] = useState({});
  const [costs, setCosts] = useState([]);

  const [enabledCategories, setEnabledCategories] = useState(() =>
    loadFromStorage("enabledCategories", DEFAULT_CATEGORIES)
  );
  const [activeTab, setActiveTab] = useState(() => enabledCategories[0] || "world-news");
  const [hiddenSources, setHiddenSources] = useState(
    () => new Set(loadFromStorage("hiddenSources", []))
  );
  const [filters, setFilters] = useState(() =>
    loadFromStorage("digestFilters", {
      excludeKeywords: [],
      requireKeywords: [],
      maxAgeHours: 0,
      summaryDisplay: "full",
    })
  );

  const fetchDigest = useCallback(async (filename) => {
    setLoading(true);
    setError(null);
    try {
      const latestFile = AUDIENCE === "teen" ? "latest-teen.json" : "latest.json";
      const url = filename
        ? `${DATA_BASE_URL}/${filename}`
        : `${DATA_BASE_URL}/${latestFile}`;
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
    } catch {}
  }, []);

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch(`${DATA_BASE_URL}/catalog.json`);
      if (res.ok) setCatalog(await res.json());
    } catch {}
  }, []);

  const fetchCosts = useCallback(async () => {
    try {
      const res = await fetch(`${DATA_BASE_URL}/costs.json`);
      if (res.ok) setCosts(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (AUDIENCE === "teen") {
      document.documentElement.setAttribute("data-theme", "teen");
    }
  }, []);

  useEffect(() => {
    fetchDigest();
    fetchIndex();
    fetchCatalog();
    fetchCosts();
  }, [fetchDigest, fetchIndex, fetchCatalog, fetchCosts]);

  // If active tab is removed from enabled, switch to first enabled
  useEffect(() => {
    if (!enabledCategories.includes(activeTab) && enabledCategories.length > 0) {
      setActiveTab(enabledCategories[0]);
    }
  }, [enabledCategories, activeTab]);

  const handleEditionToggle = (ed) => {
    if (!digest) return;
    const filename = `digest-${digest.date}-${ed}.json`;
    if (availableDigests.includes(filename)) fetchDigest(filename);
  };

  const handleRefresh = () => {
    fetchDigest();
    fetchIndex();
  };

  // Apply all client-side filters
  const articles = useMemo(() => {
    let items = digest?.categories?.[activeTab] || [];

    // Source filter
    items = items.filter((a) => !hiddenSources.has(a.source));

    // Exclude keywords
    if (filters.excludeKeywords?.length) {
      items = items.filter((a) => {
        const text = `${a.title} ${a.summary}`.toLowerCase();
        return !filters.excludeKeywords.some((kw) => text.includes(kw));
      });
    }

    // Require keywords
    if (filters.requireKeywords?.length) {
      items = items.filter((a) => {
        const text = `${a.title} ${a.summary}`.toLowerCase();
        return filters.requireKeywords.some((kw) => text.includes(kw));
      });
    }

    // Max age
    if (filters.maxAgeHours > 0) {
      const cutoff = Date.now() - filters.maxAgeHours * 3_600_000;
      items = items.filter(
        (a) => a.pubDate && new Date(a.pubDate).getTime() > cutoff
      );
    }

    return items;
  }, [digest, activeTab, hiddenSources, filters]);

  // Build tabs from enabled categories
  const tabs = sortByOrder(enabledCategories)
    .map((key) => ({
      key,
      label: catalog[key]?.label || key,
    }));

  return (
    <>
      <header className="header">
        <div className="header-top">
          <h1>{AUDIENCE === "teen" ? "News Digest Jr." : "News Digest"}</h1>
          <div className="header-actions">
            {AUDIENCE === "teen" && (
              <span className="audience-badge">Teen</span>
            )}
            <button
              className="settings-btn"
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </div>
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`tab ${activeTab === t.key ? "active" : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {digest?.date && (
          <div className="digest-date">
            {formatDate(digest.date)} &middot; Daily Edition
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
            <p>No articles match your current filters.</p>
            <button
              className="empty-settings-btn"
              onClick={() => setShowSettings(true)}
            >
              Adjust Settings
            </button>
          </div>
        )}

        {!loading && !error && articles.length > 0 && (
          <div className="article-list">
            {articles.map((article, i) => (
              <Article
                key={article.link || i}
                article={article}
                index={i}
                summaryDisplay={filters.summaryDisplay}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="footer">
        <div>AI-summarized by Claude &middot; Updated daily</div>
        {costs.length > 0 && (
          <div className="footer-cost">
            Last run: ${costs[costs.length - 1].estimatedCostUSD.toFixed(4)}
            {" "}&middot;{" "}
            This month: $
            {costs
              .reduce((sum, c) => sum + c.estimatedCostUSD, 0)
              .toFixed(4)}
          </div>
        )}
      </footer>

      {showSettings && (
        <Settings
          catalog={catalog}
          enabledCategories={enabledCategories}
          setEnabledCategories={setEnabledCategories}
          hiddenSources={hiddenSources}
          setHiddenSources={setHiddenSources}
          filters={filters}
          setFilters={setFilters}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
