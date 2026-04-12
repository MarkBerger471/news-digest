import { useState } from "react";

const ICONS = {
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 0 1 5.3 2H6.7A8 8 0 0 1 12 4zM4 12a8 8 0 0 1 .5-2.8h15A8 8 0 0 1 20 12a8 8 0 0 1-.5 2.8h-15A8 8 0 0 1 4 12zm2.7 6h10.6A8 8 0 0 1 12 20a8 8 0 0 1-5.3-2z",
  car: "M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11m-14 0h14v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6zm2.5 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  cpu: "M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 7h10v10H7V7zm3 3h4v4h-4v-4z",
  chart: "M3 3v18h18M7 16l4-4 4 4 5-6",
  rocket: "M4.5 16.5l3-3m4.5 4.5l3-3M12 3s-1.5 1.5-1.5 4.5c0 2 1 4 2.5 5.5s3.5 2.5 5.5 2.5c3 0 4.5-1.5 4.5-1.5s-1 3.5-4 6.5-6.5 4-6.5 4-1-3-4-6-6-6.5-6-6.5S5 6 8.5 3z",
  leaf: "M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8.5 20c2 0 4-1 6-3s3-4.5 3-7c0-3-1-5-1-5zm-4 5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z",
  heart: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z",
  coin: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a1.5 1.5 0 0 1 1 .4c.3.3.5.6.5 1.1h2c0-1-.4-1.9-1-2.5A3.5 3.5 0 0 0 12 4v2zm-2 5c0-.8.7-1.5 2-1.8V13c-1.3-.3-2-1-2-1.8zm4 4.8V12c1.3.3 2 1 2 1.8s-.7 1.5-2 1.8zM12 18v-2c1 0 1.8-.2 2.5-.6.6-.5 1-1.2 1-2h-2c0 .5-.7 1-1.5 1.2V11c-1-.2-1.8-.6-2.3-1.1A2.6 2.6 0 0 1 9 8c0-.8.3-1.5.8-2 .5-.6 1.2-.9 2.2-1V4h1v1c1 0 1.8.3 2.5.8.6.5 1 1.2 1 2h-2c0-.5-.7-.8-1.5-1V10.5c1 .2 1.8.6 2.3 1 .6.5.9 1.2.9 2 0 .8-.3 1.5-.8 2-.5.6-1.3.9-2.4 1V18h-1z",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  map: "M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zm7-4v16m8-12v16",
};

function CategoryIcon({ icon, size = 20 }) {
  const d = ICONS[icon] || ICONS.globe;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

function SettingsTab({ active, label, onClick }) {
  return (
    <button
      className={`settings-tab ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function CategoriesPanel({ catalog, enabledCategories, setEnabledCategories }) {
  const toggle = (key) => {
    setEnabledCategories((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      localStorage.setItem("enabledCategories", JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="settings-panel">
      <p className="settings-description">
        Choose which categories appear in your feed tabs. Changes take effect
        immediately for display, and on the next digest generation for content.
      </p>
      <div className="category-grid">
        {Object.entries(catalog).map(([key, cat]) => {
          const enabled = enabledCategories.includes(key);
          return (
            <button
              key={key}
              className={`category-card ${enabled ? "enabled" : ""}`}
              onClick={() => toggle(key)}
            >
              <div className="category-card-icon">
                <CategoryIcon icon={cat.icon} size={24} />
              </div>
              <div className="category-card-info">
                <span className="category-card-label">{cat.label}</span>
                <span className="category-card-desc">{cat.description}</span>
              </div>
              <div className={`category-toggle ${enabled ? "on" : ""}`}>
                <div className="toggle-knob" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SourcesPanel({ catalog, enabledCategories, hiddenSources, setHiddenSources }) {
  const toggle = (source) => {
    setHiddenSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      localStorage.setItem("hiddenSources", JSON.stringify([...next]));
      return next;
    });
  };

  const enableAll = (catKey) => {
    const sources = catalog[catKey]?.sources || [];
    setHiddenSources((prev) => {
      const next = new Set(prev);
      sources.forEach((s) => next.delete(s));
      localStorage.setItem("hiddenSources", JSON.stringify([...next]));
      return next;
    });
  };

  const disableAll = (catKey) => {
    const sources = catalog[catKey]?.sources || [];
    setHiddenSources((prev) => {
      const next = new Set(prev);
      sources.forEach((s) => next.add(s));
      localStorage.setItem("hiddenSources", JSON.stringify([...next]));
      return next;
    });
  };

  const activeCats = Object.entries(catalog).filter(([key]) =>
    enabledCategories.includes(key)
  );

  return (
    <div className="settings-panel">
      <p className="settings-description">
        Show or hide specific sources within each category. Hidden sources are
        filtered from your view.
      </p>
      {activeCats.map(([key, cat]) => (
        <div key={key} className="sources-section">
          <div className="sources-section-header">
            <h3>
              <CategoryIcon icon={cat.icon} size={16} /> {cat.label}
            </h3>
            <div className="sources-bulk">
              <button onClick={() => enableAll(key)}>All</button>
              <button onClick={() => disableAll(key)}>None</button>
            </div>
          </div>
          <div className="sources-grid">
            {(cat.sources || []).map((name) => (
              <label key={name} className="source-chip">
                <input
                  type="checkbox"
                  checked={!hiddenSources.has(name)}
                  onChange={() => toggle(name)}
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FiltersPanel({ filters, setFilters }) {
  const updateFilter = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem("digestFilters", JSON.stringify(next));
      return next;
    });
  };

  const addKeyword = (field) => {
    const input = document.getElementById(`filter-${field}-input`);
    const val = input?.value?.trim();
    if (!val) return;
    const current = filters[field] || [];
    if (!current.includes(val.toLowerCase())) {
      updateFilter(field, [...current, val.toLowerCase()]);
    }
    input.value = "";
  };

  const removeKeyword = (field, keyword) => {
    updateFilter(
      field,
      (filters[field] || []).filter((k) => k !== keyword)
    );
  };

  return (
    <div className="settings-panel">
      <p className="settings-description">
        Fine-tune what articles appear in your feed. Filters are applied
        client-side for instant results.
      </p>

      <div className="filter-group">
        <h3>Exclude Keywords</h3>
        <p className="filter-hint">
          Articles containing these words in the title or summary will be hidden.
        </p>
        <div className="filter-input-row">
          <input
            id="filter-excludeKeywords-input"
            type="text"
            placeholder="e.g. crypto, nft, musk..."
            onKeyDown={(e) => e.key === "Enter" && addKeyword("excludeKeywords")}
          />
          <button onClick={() => addKeyword("excludeKeywords")}>Add</button>
        </div>
        <div className="filter-tags">
          {(filters.excludeKeywords || []).map((kw) => (
            <span key={kw} className="filter-tag">
              {kw}
              <button onClick={() => removeKeyword("excludeKeywords", kw)}>
                &times;
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h3>Require Keywords</h3>
        <p className="filter-hint">
          If set, only articles matching at least one of these words will show.
        </p>
        <div className="filter-input-row">
          <input
            id="filter-requireKeywords-input"
            type="text"
            placeholder="e.g. battery, solar..."
            onKeyDown={(e) =>
              e.key === "Enter" && addKeyword("requireKeywords")
            }
          />
          <button onClick={() => addKeyword("requireKeywords")}>Add</button>
        </div>
        <div className="filter-tags">
          {(filters.requireKeywords || []).map((kw) => (
            <span key={kw} className="filter-tag require">
              {kw}
              <button onClick={() => removeKeyword("requireKeywords", kw)}>
                &times;
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h3>Max Article Age</h3>
        <p className="filter-hint">
          Only show articles published within this time window.
        </p>
        <select
          value={filters.maxAgeHours || 0}
          onChange={(e) =>
            updateFilter("maxAgeHours", parseInt(e.target.value))
          }
        >
          <option value={0}>No limit</option>
          <option value={6}>Last 6 hours</option>
          <option value={12}>Last 12 hours</option>
          <option value={24}>Last 24 hours</option>
          <option value={48}>Last 48 hours</option>
          <option value={72}>Last 3 days</option>
          <option value={168}>Last week</option>
        </select>
      </div>

      <div className="filter-group">
        <h3>Summary Length Preference</h3>
        <p className="filter-hint">
          Choose how article summaries are displayed.
        </p>
        <select
          value={filters.summaryDisplay || "full"}
          onChange={(e) => updateFilter("summaryDisplay", e.target.value)}
        >
          <option value="full">Full summary (2-3 sentences)</option>
          <option value="short">First sentence only</option>
          <option value="title">Title only (no summary)</option>
        </select>
      </div>
    </div>
  );
}

export default function Settings({
  catalog,
  enabledCategories,
  setEnabledCategories,
  hiddenSources,
  setHiddenSources,
  filters,
  setFilters,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState("categories");

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="settings-tabs">
          <SettingsTab
            active={activeTab === "categories"}
            label="Categories"
            onClick={() => setActiveTab("categories")}
          />
          <SettingsTab
            active={activeTab === "sources"}
            label="Sources"
            onClick={() => setActiveTab("sources")}
          />
          <SettingsTab
            active={activeTab === "filters"}
            label="Filters"
            onClick={() => setActiveTab("filters")}
          />
        </div>

        {activeTab === "categories" && (
          <CategoriesPanel
            catalog={catalog}
            enabledCategories={enabledCategories}
            setEnabledCategories={setEnabledCategories}
          />
        )}
        {activeTab === "sources" && (
          <SourcesPanel
            catalog={catalog}
            enabledCategories={enabledCategories}
            hiddenSources={hiddenSources}
            setHiddenSources={setHiddenSources}
          />
        )}
        {activeTab === "filters" && (
          <FiltersPanel filters={filters} setFilters={setFilters} />
        )}
      </div>
    </div>
  );
}
