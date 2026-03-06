import { useState, useEffect, useRef } from "react";
import { storageGet, storageSet } from "./storage.js";
import { auth, signInWithGoogle, signOutUser, loadUserKeys, saveUserKeys } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";

/* ── API key helpers (stored in localStorage) ── */
function getKey(name) { return localStorage.getItem(`tubeflow-${name}`) || ""; }
function setKey(name, val) { val ? localStorage.setItem(`tubeflow-${name}`, val) : localStorage.removeItem(`tubeflow-${name}`); }

/* ── Mobile breakpoint hook ── */
function useIsMobile() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w < 768;
}

/* ── Storage helpers ── */
async function stor(op, key, val) {
  try {
    if (op === "get") {
      const r = await storageGet(key);
      return r ? JSON.parse(r) : null;
    }
    if (op === "set") {
      await storageSet(key, JSON.stringify(val));
    }
  } catch {
    return null;
  }
}
async function savePresets(p) { await stor("set", "tubeflow-presets", p); }
async function saveIdeas(ideas) { await stor("set", "tubeflow-ideas", ideas); }

/* ── Constants ── */
const STAGES = ["Research", "Thumbnail", "Script", "Finishing", "Published"];
const SC = {
  Research:  { bg: "#0c2340", text: "#60a5fa", dot: "#3b82f6" },
  Thumbnail: { bg: "#2d1500", text: "#fb923c", dot: "#f97316" },
  Script:    { bg: "#1e1b4b", text: "#a5b4fc", dot: "#818cf8" },
  Finishing: { bg: "#0c3040", text: "#38bdf8", dot: "#0ea5e9" },
  Published: { bg: "#052e16", text: "#4ade80", dot: "#22c55e" },
};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const IDEA_COLORS = ["#2d1a00","#1e3a5f","#1e3a5f","#052e16","#2d0a3e","#0f2042","#2d1a00","#052e16"];
const IDEA_PRIORITIES = ["💡 Idea","⭐ High Priority","🔥 Hot Topic","📌 Planned"];

function blankProject() {
  return {
    id: Date.now().toString(),
    title: "Untitled Video",
    niche: "",
    keywords: [],
    competitors: [{ title: "", url: "", views: "", why: "" }],
    thumbnailConcept: "",
    thumbnailHook: "",
    thumbnailImageUrl: "",
    outlineHook: "",
    outlineSections: [],
    scriptBody: "",
    cta: "",
    metaTitles: [],
    metaDescription: "",
    metaTags: [],
    publishDate: null,
    stage: "Research",
    videoLength: 10,
    createdAt: new Date().toISOString(),
  };
}

function blankIdea() {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    title: "",
    notes: "",
    priority: "💡 Idea",
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

/* ── AI helper — calls Anthropic directly from browser ── */
async function ai(system, user, maxTokens = 1500, signal) {
  const apiKey = getKey("anthropic-key");
  if (!apiKey) return "⚠️ Add your Anthropic API key in Settings (🔑) to use AI features.";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal,
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    return d.content?.map((b) => b.text || "").join("") || "";
  } catch (e) {
    if (e.name === "AbortError") throw e;
    return "⚠️ AI unavailable — check your API key in Settings.";
  }
}
function pCtx(presets) {
  if (!presets?.length) return "";
  return "\n\nCreator presets:\n" + presets.map((p) => `[${p.label}]: ${p.content}`).join("\n");
}

/* ── Date helper ── */
function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ── Shared UI ── */
function Badge({ stage, sm }) {
  const c = SC[stage] || SC.Research;
  return (
    <span style={{ background: c.bg, color: c.text, padding: sm ? "2px 8px" : "3px 10px", borderRadius: 20, fontSize: sm ? 11 : 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, display: "inline-block" }} />
      {stage}
    </span>
  );
}

function Btn({ children, onClick, disabled, color = "purple", sm, style = {} }) {
  const bg = color === "green" ? "linear-gradient(135deg,#059669,#22c55e)" : color === "gray" ? "#1e293b" : color === "red" ? "linear-gradient(135deg,#dc2626,#ef4444)" : "linear-gradient(135deg,#2563eb,#3b82f6)";
  const clr = color === "gray" ? "#cbd5e1" : "#fff";
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: disabled ? "#334155" : bg, color: disabled ? "#64748b" : clr, border: "none", borderRadius: 8, padding: sm ? "6px 12px" : "9px 18px", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: sm ? 12 : 13, display: "inline-flex", alignItems: "center", gap: 6, ...style }}>
      {children}
    </button>
  );
}

function TInput({ value, onChange, placeholder, style = {}, onKeyDown }) {
  return <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown} style={{ width: "100%", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", fontSize: 14, boxSizing: "border-box", outline: "none", background: "#0f172a", color: "#ffffff", ...style }} />;
}
function TArea({ value, onChange, placeholder, rows = 4, style = {} }) {
  return <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ width: "100%", border: "1px solid #334155", borderRadius: 8, padding: 10, fontSize: 14, resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, outline: "none", fontFamily: "inherit", background: "#0f172a", color: "#ffffff", ...style }} />;
}
function Card({ title, icon, children, action }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span>{icon}</span>}{title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}
function Fld({ label, children, mt }) {
  return <div style={{ marginTop: mt || 0 }}>{label && <div style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}>{label}</div>}{children}</div>;
}
function AIOut({ k, loading, output, onRun, label, onUse, onStop }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Btn onClick={onRun} disabled={loading[k]} sm>{loading[k] ? "✦ Generating…" : "✦ " + label}</Btn>
        {loading[k] && <Btn sm color="gray" onClick={onStop}>■ Stop</Btn>}
      </div>
      {output[k] && (
        <div style={{ background: "#0f1e3d", border: "1px solid #1e3a8a", borderRadius: 10, padding: 16, marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#93c5fd" }}>✦ AI Suggestion</span>
            {onUse && <Btn sm onClick={() => onUse(output[k])} style={{ padding: "3px 10px", fontSize: 11 }}>Use this</Btn>}
          </div>
          <p style={{ fontSize: 13, color: "#cbd5e1", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{output[k]}</p>
        </div>
      )}
    </div>
  );
}

/* ── Sidebar ── */
const NAV_ITEMS = [
  { id: "Home",     icon: "▶",  label: "Workflow"   },
  { id: "Calendar", icon: "📅", label: "Calendar"   },
  { id: "Ideas",    icon: "💡", label: "Idea Vault" },
  { id: "Presets",  icon: "⚙️", label: "Presets"    },
  { id: "Settings", icon: "🔑", label: "API Keys"   },
];
function Sidebar({ page, setPage, projects, ideas, user }) {
  const isMobile = useIsMobile();
  const active = page === "Project" ? "Home" : page;

  if (isMobile) {
    return (
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 60, background: "#1e293b", borderTop: "1px solid #334155", display: "flex", alignItems: "stretch", zIndex: 200 }}>
        {NAV_ITEMS.map(({ id, icon, label }) => (
          <button key={id} onClick={() => setPage(id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, border: "none", background: active === id ? "#1e3a5f" : "transparent", color: active === id ? "#93c5fd" : "#64748b", cursor: "pointer", fontSize: 9, fontWeight: active === id ? 700 : 500, fontFamily: "Sora,sans-serif", padding: "6px 2px" }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", maxWidth: "100%", textOverflow: "ellipsis", paddingInline: 2 }}>{label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ width: 240, background: "#1e293b", borderRight: "1px solid #334155", position: "fixed", left: 0, top: 0, height: "100vh", display: "flex", flexDirection: "column", zIndex: 200 }}>
      {/* Logo */}
      <div style={{ padding: "22px 20px 18px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg,#2563eb,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21" /></svg>
          </div>
          <div>
            <div style={{ fontFamily: "Sora,sans-serif", fontWeight: 700, fontSize: 17, color: "#e2e8f0", lineHeight: 1.2 }}>Vid Planner</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Content Planner</div>
          </div>
        </div>
      </div>
      {/* Nav */}
      <nav style={{ padding: "14px 12px", flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#93c5fd", letterSpacing: "0.08em", padding: "0 10px", marginBottom: 8 }}>MENU</div>
        {NAV_ITEMS.map(({ id, icon, label }) => (
          <button key={id} onClick={() => setPage(id)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "11px 14px", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "Sora,sans-serif", fontWeight: active === id ? 600 : 500, fontSize: 14, background: active === id ? "#1e3a5f" : "transparent", color: active === id ? "#93c5fd" : "#94a3b8", marginBottom: 3, textAlign: "left", transition: "background .12s" }}>
            <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{icon}</span>{label}
          </button>
        ))}
      </nav>
      {/* Stats */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid #1e293b" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#93c5fd", letterSpacing: "0.08em", marginBottom: 10 }}>WORKSPACE</div>
        {[
          ["📹", `${projects.filter(p => p.stage !== "Published").length} in progress`],
          ["✅", `${projects.filter(p => p.stage === "Published").length} published`],
          ["💡", `${ideas.length} ideas saved`],
        ].map(([ico, txt]) => (
          <div key={txt} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#94a3b8", marginBottom: 7 }}>
            <span style={{ fontSize: 13 }}>{ico}</span>{txt}
          </div>
        ))}
      </div>
      {/* User */}
      {user && (
        <div style={{ padding: "14px 20px", borderTop: "1px solid #334155", display: "flex", alignItems: "center", gap: 10 }}>
          {user.photoURL
            ? <img src={user.photoURL} alt="" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
            : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{(user.displayName || user.email || "?")[0].toUpperCase()}</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.displayName || "Creator"}</div>
            <button onClick={signOutUser} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, color: "#64748b", fontFamily: "Sora,sans-serif" }}>Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Keywords Input ── */
function KwInput({ keywords, onChange }) {
  const [val, setVal] = useState("");
  function add() { if (val.trim()) { onChange([...keywords, val.trim()]); setVal(""); } }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <TInput value={val} onChange={setVal} placeholder="Add keyword + Enter" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button onClick={add} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, width: 34, cursor: "pointer", fontSize: 18 }}>+</button>
      </div>
      {keywords.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {keywords.map((kw, i) => (
            <span key={i} style={{ background: "#1e3a5f", color: "#93c5fd", padding: "4px 10px", borderRadius: 20, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              {kw}
              <button onClick={() => onChange(keywords.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", padding: 0, fontSize: 15 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── YouTube helpers ── */
function durationSecs(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0);
}
function fmtViews(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M views";
  if (n >= 1_000) return Math.round(n / 1_000) + "K views";
  return n + " views";
}
function fmtDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = +(m[1] || 0), min = +(m[2] || 0), s = +(m[3] || 0);
  if (h) return `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${min}:${String(s).padStart(2, "0")}`;
}
function timeAgo(str) {
  const d = Math.floor((Date.now() - new Date(str)) / 86400000);
  if (d < 1) return "Today";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

/* ── YouTube Search ── */
const YT_FILTERS = {
  type:     { label: "Type",     options: [{ val: "any", lbl: "All" }, { val: "video", lbl: "🎬 Videos" }, { val: "shorts", lbl: "📱 Shorts" }, { val: "live", lbl: "🔴 Live" }, { val: "upcoming", lbl: "⏰ Upcoming" }] },
  sort:     { label: "Sort",     options: [{ val: "relevance", lbl: "Relevance" }, { val: "viewCount", lbl: "Most Viewed" }, { val: "date", lbl: "Newest" }, { val: "rating", lbl: "Top Rated" }] },
  duration: { label: "Duration", options: [{ val: "any", lbl: "Any length" }, { val: "short", lbl: "Short  <4m" }, { val: "medium", lbl: "Medium  4–20m" }, { val: "long", lbl: "Long  20m+" }] },
  date:     { label: "Uploaded", options: [{ val: "any", lbl: "Any time" }, { val: "today", lbl: "Today" }, { val: "week", lbl: "This week" }, { val: "month", lbl: "This month" }, { val: "year", lbl: "This year" }] },
};

function YTSearch({ onAdd }) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [filters, setFilters] = useState({ type: "any", sort: "relevance", duration: "any", date: "any" });
  const colors = ["#1e3a5f","#2d1b69","#0f4c35","#5c1a1a","#1a3d5c","#3d1a5c","#1a4d2e","#4d1a1a","#2d3748","#1a365d","#276749","#702459"];
  function bg(t) { let h = 0; for (let i = 0; i < (t||"").length; i++) h = (h + t.charCodeAt(i)) % colors.length; return colors[h]; }

  async function searchWith(f = filters) {
    if (!q.trim()) return;
    setLoading(true); setDone(true);
    try {
      const ytKey = getKey("youtube-key");
      if (ytKey) {
        const { type, sort, duration, date } = f;
        let searchQuery = q, eventTypeParam = "", effectiveDuration = duration;
        if (type === "shorts") { searchQuery = q + " #shorts"; effectiveDuration = "short"; }
        if (type === "live") eventTypeParam = "&eventType=live";
        if (type === "upcoming") eventTypeParam = "&eventType=upcoming";
        let publishedAfter = "";
        if (date !== "any") {
          const now = new Date();
          if (date === "today") now.setHours(0, 0, 0, 0);
          if (date === "week") now.setDate(now.getDate() - 7);
          if (date === "month") now.setMonth(now.getMonth() - 1);
          if (date === "year") now.setFullYear(now.getFullYear() - 1);
          publishedAfter = `&publishedAfter=${now.toISOString()}`;
        }
        const durationParam = effectiveDuration !== "any" ? `&videoDuration=${effectiveDuration}` : "";
        const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=12&order=${sort}${durationParam}${eventTypeParam}${publishedAfter}&key=${ytKey}`);
        const searchData = await searchRes.json();
        if (!searchData.error && searchData.items?.length) {
          const ids = searchData.items.map((i) => i.id.videoId).join(",");
          const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${ids}&key=${ytKey}`);
          const statsData = await statsRes.json();
          const statsMap = Object.fromEntries((statsData.items || []).map((i) => [i.id, i]));
          const results = searchData.items.map((item) => {
            const id = item.id.videoId;
            const stats = statsMap[id];
            const viewCount = parseInt(stats?.statistics?.viewCount || 0);
            const likeCount = parseInt(stats?.statistics?.likeCount || 0);
            const publishedAt = item.snippet.publishedAt;
            const rawDuration = stats?.contentDetails?.duration || "";
            return { title: item.snippet.title, channel: item.snippet.channelTitle, views: fmtViews(viewCount), viewCount, likeCount, duration: fmtDuration(rawDuration), durationSecs: durationSecs(rawDuration), publishedAt, publishedAgo: timeAgo(publishedAt), thumbnail: item.snippet.thumbnails?.medium?.url || "", url: `https://www.youtube.com/watch?v=${id}` };
          }).filter((v) => { if (type === "video") return v.durationSecs > 62; if (type === "shorts") return v.durationSecs <= 62; return true; });
          setRes(results); setLoading(false); return;
        }
      }
      // Fallback: AI-simulated results if no YouTube key
      const raw = await ai("Return ONLY a valid JSON array, no markdown, no backticks.", `YouTube search: "${q}". Return JSON array of 12 objects: title, channel, views, duration, publishedAgo, thumbnail (visual desc), whyItWorks (1 sentence), url (youtube.com/watch?v=XXX). Real trends only.`, 2000);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setRes(Array.isArray(parsed) ? parsed : []);
    } catch { setRes([]); }
    setLoading(false);
  }

  function applyFilter(key, val) {
    const newFilters = { ...filters, [key]: val };
    setFilters(newFilters);
    if (done && q.trim()) searchWith(newFilters);
  }

  const search = () => searchWith(filters);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <TInput value={q} onChange={setQ} placeholder="Search topics, competitors, viral videos…" style={{ flex: 1 }} onKeyDown={(e) => e.key === "Enter" && search()} />
        <Btn onClick={search} disabled={loading}>{loading ? "Searching…" : "🔍 Search"}</Btn>
      </div>

      {/* Filter rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {Object.entries(YT_FILTERS).map(([key, { label, options }]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", minWidth: 52 }}>{label}</span>
            {options.map(({ val, lbl }) => (
              <button key={val} onClick={() => applyFilter(key, val)}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontWeight: filters[key] === val ? 600 : 400,
                  background: filters[key] === val ? "#1e3a5f" : "#1e293b",
                  borderColor: filters[key] === val ? "#3b82f6" : "#334155",
                  color: filters[key] === val ? "#93c5fd" : "#94a3b8" }}>
                {lbl}
              </button>
            ))}
          </div>
        ))}
      </div>

      {done && !loading && res.length === 0 && <p style={{ color: "#64748b", fontSize: 13 }}>No results — try a different query or filters.</p>}
      {res.length > 0 && (
        <div style={{ maxHeight: 560, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10 }}>
            {res.map((v, i) => {
              const hoursAgo = v.publishedAt ? (Date.now() - new Date(v.publishedAt)) / 3_600_000 : 0;
              const vph = hoursAgo > 0 && v.viewCount > 0 ? v.viewCount / hoursAgo : 0;
              const vphStr = vph >= 1_000_000 ? (vph/1_000_000).toFixed(1)+'M/hr' : vph >= 1_000 ? Math.round(vph/1_000)+'K/hr' : Math.round(vph)+'/hr';
              const likeRatio = v.viewCount > 0 && v.likeCount > 0 ? (v.likeCount / v.viewCount * 100).toFixed(1) : null;
              return (
              <div key={i} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ position: "relative", paddingBottom: "56.25%", background: bg(v.title) }}>
                  {v.thumbnail?.startsWith("http") ? (
                    <img src={v.thumbnail} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 8 }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,.6)"><polygon points="5,3 19,12 5,21" /></svg>
                      <span style={{ color: "rgba(255,255,255,.6)", fontSize: 8, marginTop: 3, textAlign: "center", lineHeight: 1.3 }}>{v.thumbnail}</span>
                    </div>
                  )}
                  <span style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(0,0,0,.8)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 3 }}>{v.duration}</span>
                </div>
                <div style={{ padding: "8px 8px 6px" }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#ffffff", margin: "0 0 2px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.title}</p>
                  <p style={{ fontSize: 10, color: "#94a3b8", margin: "0 0 3px" }}>{v.channel}</p>
                  <p style={{ fontSize: 10, color: "#64748b", margin: "0 0 4px" }}>{v.views} · {v.publishedAgo}</p>
                  {(vph > 0 || likeRatio) && (
                    <div style={{ display: "flex", gap: 4, marginBottom: 5, flexWrap: "wrap" }}>
                      {vph > 0 && <span style={{ fontSize: 9, background: vph >= 1000 ? "#2d1a00" : "#1e293b", color: vph >= 1000 ? "#fb923c" : "#94a3b8", borderRadius: 3, padding: "2px 5px", fontWeight: 600 }}>⚡ {vphStr}</span>}
                      {likeRatio && <span style={{ fontSize: 9, background: "#052e16", color: "#4ade80", borderRadius: 3, padding: "2px 5px", fontWeight: 600 }}>👍 {likeRatio}%</span>}
                    </div>
                  )}
                  {v.whyItWorks && <p style={{ fontSize: 9, color: "#93c5fd", background: "#0f1e3d", borderRadius: 3, padding: "2px 5px", margin: "0 0 5px", lineHeight: 1.4 }}>💡 {v.whyItWorks}</p>}
                  <div style={{ display: "flex", gap: 4 }}>
                    <a href={v.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#94a3b8", textDecoration: "none", background: "#1e293b", borderRadius: 3, padding: "2px 6px" }}>Watch ↗</a>
                    <button onClick={() => onAdd(v)} style={{ fontSize: 10, background: "#1e3a5f", color: "#93c5fd", border: "none", borderRadius: 3, padding: "2px 6px", cursor: "pointer", fontWeight: 600 }}>+ Add</button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tab: Research ── */
function ResearchTab({ project, update, presets }) {
  const isMobile = useIsMobile();
  const [L, setL] = useState({});
  const [O, setO] = useState({});
  const abortRef = useRef(null);
  function cancel(k) { abortRef.current?.abort(); setL((l) => ({ ...l, [k]: false })); }
  async function run(k, sys, usr) {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setL((l) => ({ ...l, [k]: true }));
    try { const r = await ai(sys + pCtx(presets), usr, 1500, abortRef.current.signal); setO((o) => ({ ...o, [k]: r })); }
    catch (e) { if (e.name !== "AbortError") setO((o) => ({ ...o, [k]: "Error — try again." })); }
    setL((l) => ({ ...l, [k]: false }));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Topic & Focus" icon="📈">
        <Fld label="Working Title"><TInput value={project.title} onChange={(v) => update("title", v)} placeholder="Untitled Video" /></Fld>
        <Fld label="Niche / Main Topic" mt={12}>
          <div style={{ display: "flex", gap: 8 }}>
            <TInput value={project.niche} onChange={(v) => update("niche", v)} placeholder="e.g., Backpacking, Tech Reviews…" style={{ flex: 1 }} />
            <Btn sm disabled={L["analyze"]} onClick={() => run("analyze", "You are a YouTube SEO and content strategy expert.", `Analyze this topic. Suggest 3 high-performing content angles.\n\nTitle: ${project.title}\nNiche: ${project.niche}`)}>{L["analyze"] ? "✦ Analyzing…" : "✦ Analyze"}</Btn>
            {L["analyze"] && <Btn sm color="gray" onClick={() => cancel("analyze")}>■ Stop</Btn>}
          </div>
          {O["analyze"] && <div style={{ background: "#0f1e3d", border: "1px solid #1e3a8a", borderRadius: 10, padding: 14, marginTop: 10 }}><p style={{ fontSize: 13, color: "#cbd5e1", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{O["analyze"]}</p></div>}
        </Fld>
        <Fld label="Target Video Length (minutes)" mt={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input type="range" min={1} max={120} step={1} value={project.videoLength || 10} onChange={(e) => update("videoLength", +e.target.value)} style={{ flex: 1, accentColor: "#2563eb" }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: "#93c5fd", minWidth: 50, textAlign: "right" }}>{project.videoLength || 10} min</span>
          </div>
        </Fld>
        <Fld label="Target Publish Date" mt={12}>
          <input type="date" value={project.publishDate || ""} onChange={(e) => update("publishDate", e.target.value)} style={{ border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", fontSize: 14, width: "100%", boxSizing: "border-box", background: "#0f172a", color: project.publishDate ? "#ffffff" : "#64748b", colorScheme: "dark" }} />
        </Fld>
      </Card>
      <Card title="Keywords" icon="🏷️">
        <KwInput keywords={project.keywords} onChange={(v) => update("keywords", v)} />
        <AIOut k="kw" label="Suggest Keywords" loading={L} output={O} onRun={() => run("kw", "YouTube SEO expert. Return only comma-separated keywords.", `10 keywords for: ${project.title} / ${project.niche}`)} onUse={(t) => update("keywords", [...project.keywords, ...t.split(",").map((k) => k.trim()).filter(Boolean)])} onStop={() => cancel("kw")} />
      </Card>
      <Card title="Competitor Videos" icon="👁️">
        {project.competitors.map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: i < project.competitors.length - 1 ? "1px solid #1e293b" : "none" }}>
            <TInput value={c.title} onChange={(v) => { const a = [...project.competitors]; a[i] = { ...a[i], title: v }; update("competitors", a); }} placeholder="Video title" />
            <TInput value={c.url} onChange={(v) => { const a = [...project.competitors]; a[i] = { ...a[i], url: v }; update("competitors", a); }} placeholder="YouTube URL" />
            <TInput value={c.views} onChange={(v) => { const a = [...project.competitors]; a[i] = { ...a[i], views: v }; update("competitors", a); }} placeholder="Views" />
            <TInput value={c.why} onChange={(v) => { const a = [...project.competitors]; a[i] = { ...a[i], why: v }; update("competitors", a); }} placeholder="Why it worked?" />
          </div>
        ))}
        <button onClick={() => update("competitors", [...project.competitors, { title: "", url: "", views: "", why: "" }])} style={{ background: "none", border: "1px dashed #64748b", borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: "#94a3b8", fontSize: 13, width: "100%" }}>+ Add Manually</button>
      </Card>
      <Card title="YouTube Search" icon="🔍" action={<span style={{ fontSize: 11, color: "#64748b" }}>AI-powered</span>}>
        <YTSearch onAdd={(v) => update("competitors", [...project.competitors, { title: v.title, url: v.url, views: v.views, why: v.whyItWorks || "" }])} />
      </Card>
    </div>
  );
}

/* ── Tab: Thumbnail ── */
function ThumbnailTab({ project, update, presets }) {
  const [L, setL] = useState({});
  const [O, setO] = useState({});
  const [imgPrompt, setImgPrompt] = useState("");
  const [genImgUrl, setGenImgUrl] = useState("");
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState("");
  const fileRef = useRef();
  const abortRef = useRef(null);
  function cancel(k) { abortRef.current?.abort(); setL((l) => ({ ...l, [k]: false })); }
  async function run(k, sys, usr) {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setL((l) => ({ ...l, [k]: true }));
    try { const r = await ai(sys + pCtx(presets), usr, 1500, abortRef.current.signal); setO((o) => ({ ...o, [k]: r })); }
    catch (e) { if (e.name !== "AbortError") setO((o) => ({ ...o, [k]: "Error." })); }
    setL((l) => ({ ...l, [k]: false }));
  }
  function generateImage() {
    if (!imgPrompt.trim()) return;
    setImgLoading(true);
    setImgError("");
    const seed = Math.floor(Math.random() * 999999);
    setGenImgUrl(`https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=1280&height=720&nologo=true&seed=${seed}`);
  }
  function upload(e) { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => update("thumbnailImageUrl", ev.target.result); r.readAsDataURL(f); }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Your Thumbnail" icon="🖼️">
        {project.thumbnailImageUrl ? (
          <div>
            <img src={project.thumbnailImageUrl} alt="" style={{ width: "100%", borderRadius: 10, border: "2px solid #334155", maxHeight: 280, objectFit: "cover" }} />
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <Btn sm color="gray" onClick={() => fileRef.current?.click()}>Replace</Btn>
              <Btn sm color="gray" onClick={() => update("thumbnailImageUrl", "")}>Remove</Btn>
            </div>
          </div>
        ) : (
          <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed #64748b", borderRadius: 12, padding: "36px 20px", textAlign: "center", cursor: "pointer", background: "#1a2234" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🖼️</div>
            <p style={{ color: "#94a3b8", fontSize: 14, margin: 0, fontWeight: 500 }}>Upload your finished thumbnail</p>
            <p style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>PNG, JPG, WEBP</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={upload} />
      </Card>
      <Card title="AI Image Generator" icon="🎨">
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px" }}>Describe a thumbnail idea and generate a visual concept to inspire your design.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <TInput value={imgPrompt} onChange={setImgPrompt} placeholder="e.g., Shocked hiker on mountain trail, dramatic sunset, bold text overlay" onKeyDown={(e) => e.key === "Enter" && generateImage()} />
          <Btn sm onClick={generateImage} disabled={imgLoading}>{imgLoading ? "Generating…" : "Generate"}</Btn>
        </div>
        {imgError && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>⚠️ {imgError}</div>}
        {genImgUrl && (
          <div>
            {imgLoading && <div style={{ textAlign: "center", padding: "28px 0", color: "#64748b", fontSize: 13 }}>⏳ Generating… can take 15–30 seconds</div>}
            {/* Image is always mounted once genImgUrl is set so onLoad/onError can fire */}
            <img
              src={genImgUrl}
              alt="Generated thumbnail concept"
              style={{ width: "100%", borderRadius: 10, border: "1px solid #334155", marginBottom: 8, display: imgLoading ? "none" : "block" }}
              onLoad={() => setImgLoading(false)}
              onError={() => { setImgLoading(false); setImgError("Image failed to load — try a different prompt"); setGenImgUrl(""); }}
            />
            {!imgLoading && (
              <div style={{ display: "flex", gap: 8 }}>
                <Btn sm onClick={generateImage}>Regenerate</Btn>
                <Btn sm color="gray" onClick={() => update("thumbnailImageUrl", genImgUrl)}>Use as thumbnail</Btn>
              </div>
            )}
          </div>
        )}
      </Card>
      <Card title="Concept Planning" icon="💡">
        <Fld label="Concept Description"><TArea value={project.thumbnailConcept} onChange={(v) => update("thumbnailConcept", v)} rows={3} placeholder="Describe your thumbnail idea…" /></Fld>
        <AIOut k="concept" label="Generate Concepts" loading={L} output={O} onRun={() => run("concept", "YouTube thumbnail design expert. Understand click psychology.", `3 thumbnail concepts for:\nTitle: ${project.title}\nNiche: ${project.niche}`)} onUse={(t) => update("thumbnailConcept", t)} onStop={() => cancel("concept")} />
      </Card>
      <Card title="Text Hook / Overlay" icon="💬">
        <Fld label="Hook Text"><TInput value={project.thumbnailHook} onChange={(v) => update("thumbnailHook", v)} placeholder="e.g., 'I WAS WRONG', 'Never Do This'" /></Fld>
        <AIOut k="hooks" label="Generate Hooks" loading={L} output={O} onRun={() => run("hooks", "YouTube CTR expert.", `5 thumbnail text hooks (1-5 words) for:\nTitle: ${project.title}`)} onUse={(t) => update("thumbnailHook", t.split("\n").find((l) => l.trim()) || "")} onStop={() => cancel("hooks")} />
      </Card>
    </div>
  );
}

/* ── Outline helpers ── */
function parseSectionsFromAI(text) {
  // AI is asked to return JSON array; fall back to a single section if parsing fails
  try {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr) && arr.length) {
        return arr.map((s) => ({ id: Math.random().toString(36).slice(2), name: s.name || 'Section', duration: s.duration || '', notes: s.notes || '' }));
      }
    }
  } catch { /* fall through */ }
  // Fallback: parse markdown headers like "## Intro (2 minutes)"
  const sections = [];
  let cur = null;
  const buf = [];
  const flush = () => { if (cur) { sections.push({ ...cur, notes: buf.join('\n').trim() }); buf.length = 0; } };
  for (const line of text.split('\n')) {
    const hm = line.match(/^#{1,3}\s+(.+?)\s*[\(\-–]\s*([^)\n]+?)\)?\s*$/);
    if (hm) { flush(); cur = { id: Math.random().toString(36).slice(2), name: hm[1].trim(), duration: hm[2].trim() }; continue; }
    if (cur) buf.push(line);
  }
  flush();
  return sections.length ? sections : [{ id: '1', name: 'Outline', duration: '', notes: text.trim() }];
}

function calcTotalMins(sections) {
  let total = 0;
  for (const s of sections) {
    const m = (s.duration || '').match(/(\d+(?:\.\d+)?)/);
    if (m) total += /sec/i.test(s.duration) ? parseFloat(m[1]) / 60 : parseFloat(m[1]);
  }
  return Math.round(total * 10) / 10;
}

const inputStyle = { border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 14, background: '#0f172a', color: '#ffffff', outline: 'none', boxSizing: 'border-box' };

/* ── Tab: Script ── */
function ScriptTab({ project, update, presets }) {
  const isMobile = useIsMobile();
  const [L, setL] = useState({});
  const [O, setO] = useState({});
  const [newSec, setNewSec] = useState({ name: '', duration: '' });
  const vidLen = project.videoLength || 10;
  const estWords = vidLen * 150;
  const sections = project.outlineSections || [];
  const [P, setP] = useState({
    tone: "Conversational", style: "Storytelling", audience: "", words: estWords, broll: true, timestamps: true,
    intro: presets.find((p) => p.type === "Intro")?.content || "",
    banned: presets.find((p) => p.type === "Avoid")?.content || "",
    extra: "",
  });
  useEffect(() => { setP((p) => ({ ...p, words: vidLen * 150 })); }, [vidLen]);
  const abortRef = useRef(null);
  function cancel(k) { abortRef.current?.abort(); setL((l) => ({ ...l, [k]: false })); }
  async function run(k, sys, usr, tok = 1500) {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setL((l) => ({ ...l, [k]: true }));
    try { const r = await ai(sys + pCtx(presets), usr, tok, abortRef.current.signal); setO((o) => ({ ...o, [k]: r })); }
    catch (e) { if (e.name !== "AbortError") setO((o) => ({ ...o, [k]: "Error." })); }
    setL((l) => ({ ...l, [k]: false }));
  }
  function addSection() {
    if (!newSec.name.trim()) return;
    update("outlineSections", [...sections, { id: Math.random().toString(36).slice(2), name: newSec.name, duration: newSec.duration, notes: '' }]);
    setNewSec({ name: '', duration: '' });
  }
  function deleteSection(id) { update("outlineSections", sections.filter((s) => s.id !== id)); }
  function updateSection(id, field, val) { update("outlineSections", sections.map((s) => s.id === id ? { ...s, [field]: val } : s)); }
  function prompt() {
    const hookPart = project.outlineHook ? `Hook (30s):\n${project.outlineHook}\n\n` : '';
    const sectionsPart = sections.map((s) => `${s.name}${s.duration ? ` (${s.duration})` : ''}:\n${s.notes}`).join('\n\n');
    const outlineText = hookPart + sectionsPart || project.scriptOutline || "(none)";
    return `Write a full YouTube script.\nTitle: ${project.title}\nNiche: ${project.niche}\nKeywords: ${project.keywords.join(", ")}\nTarget video length: ${vidLen} minutes (~${estWords} words)\nOutline:\n${outlineText}\nCTA: ${project.cta}\n\nTone: ${P.tone}\nStyle: ${P.style}\nAudience: ${P.audience || "general"}\nWords: ~${P.words}\n${P.broll ? "Include [B-ROLL] cues" : ""}\n${P.timestamps ? "Include [TIMESTAMP] markers" : ""}\n${P.intro ? `Open ALWAYS with: "${P.intro}"` : ""}${P.banned ? `\nNEVER use: ${P.banned}` : ""}\n${P.extra ? `Extra: ${P.extra}` : ""}`;
  }
  const totalMins = calcTotalMins(sections);
  const sel = (val, opts, fn) => <select value={val} onChange={(e) => fn(e.target.value)} style={{ width: "100%", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", fontSize: 14, background: "#0f172a", color: "#ffffff" }}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Script Parameters" icon="⚙️">
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <Fld label="Tone">{sel(P.tone, ["Conversational","Educational","Entertaining","Motivational","Casual","Professional"], (v) => setP((p) => ({ ...p, tone: v })))}</Fld>
          <Fld label="Style">{sel(P.style, ["Storytelling","How-To","List","Personal Essay","News Style"], (v) => setP((p) => ({ ...p, style: v })))}</Fld>
          <Fld label="Target Audience"><TInput value={P.audience} onChange={(v) => setP((p) => ({ ...p, audience: v }))} placeholder="e.g., beginner hikers 25-40" /></Fld>
          <Fld label={`Word Count: ~${P.words.toLocaleString()}`}>
            <input type="range" min={500} max={5000} step={250} value={P.words} onChange={(e) => setP((p) => ({ ...p, words: +e.target.value }))} style={{ width: "100%", accentColor: "#2563eb", marginTop: 8 }} />
          </Fld>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
          {[["broll","B-Roll cues"],["timestamps","Timestamps"]].map(([k, lbl]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={P[k]} onChange={(e) => setP((p) => ({ ...p, [k]: e.target.checked }))} style={{ accentColor: "#2563eb" }} />{lbl}
            </label>
          ))}
        </div>
        <Fld label="Intro Template" mt={12}><TInput value={P.intro} onChange={(v) => setP((p) => ({ ...p, intro: v }))} placeholder="e.g., Hey I'm Backpacker Luke, and today…" /></Fld>
        <Fld label="Banned Words" mt={12}><TInput value={P.banned} onChange={(v) => setP((p) => ({ ...p, banned: v }))} placeholder="e.g., absolutely, amazing, game-changer" /></Fld>
        <Fld label="Extra Instructions" mt={12}><TArea value={P.extra} onChange={(v) => setP((p) => ({ ...p, extra: v }))} rows={2} placeholder="Any other guidance…" /></Fld>
      </Card>
      <Card title="The Hook" icon="🎣">
        <TArea value={project.outlineHook} onChange={(v) => update("outlineHook", v)} rows={3} placeholder="What grabs attention in the first 30 seconds? Tease the payoff…" />
      </Card>
      <Card title="Script Outline" icon="📋" action={<span style={{ fontSize: 11, color: "#93c5fd", background: "#1e3a5f", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>🎯 {totalMins > 0 ? `${totalMins} min total` : `${vidLen} min target`}</span>}>
        {sections.map((s) => (
          <div key={s.id} style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input value={s.name} onChange={(e) => updateSection(s.id, "name", e.target.value)} placeholder="Section name" style={{ ...inputStyle, flex: 1 }} />
              <input value={s.duration} onChange={(e) => updateSection(s.id, "duration", e.target.value)} placeholder="e.g., 3 min" style={{ ...inputStyle, width: isMobile ? 90 : 120, fontSize: isMobile ? 12 : 14 }} />
              <button onClick={() => deleteSection(s.id)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>
            <TArea value={s.notes} onChange={(v) => updateSection(s.id, "notes", v)} rows={2} placeholder="Key points for this section…" />
          </div>
        ))}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          <input value={newSec.name} onChange={(e) => setNewSec((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addSection()} placeholder="Section name (e.g., Problem, Solution)" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
          <input value={newSec.duration} onChange={(e) => setNewSec((p) => ({ ...p, duration: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addSection()} placeholder="Duration (e.g., 3 min)" style={{ ...inputStyle, width: isMobile ? "100%" : 150 }} />
        </div>
        <button onClick={addSection} style={{ width: "100%", marginTop: 8, padding: "9px 0", background: "#0f172a", border: "1px dashed #334155", borderRadius: 8, color: "#64748b", fontSize: 13, cursor: "pointer" }}>+ Add Section</button>
        <AIOut k="outline" label="Generate Outline" loading={L} output={O}
          onRun={() => run("outline",
            `Expert YouTube scriptwriter. Return ONLY a valid JSON array (no markdown, no explanation) where each element has: "name" (section name), "duration" (e.g. "2 minutes"), "notes" (key bullet points as a string). The first item should NOT be the hook — that is handled separately. Structure sections for a ${vidLen}-minute video.`,
            `Create a script outline for a ${vidLen}-minute YouTube video.\nTitle: ${project.title}\nNiche: ${project.niche}\nKeywords: ${project.keywords.join(", ")}\n\nReturn a JSON array of sections (excluding the hook). Each section needs name, duration, and notes. Durations must add up to roughly ${vidLen} minutes. Include intro, main content sections, and outro.`
          )}
          onUse={(t) => { update("outlineSections", parseSectionsFromAI(t)); }}
          onStop={() => cancel("outline")}
        />
        <div style={{ borderTop: "1px solid #1e293b", marginTop: 16, paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 8 }}>📣 CALL TO ACTION</div>
          <TInput value={project.cta} onChange={(v) => update("cta", v)} placeholder="Your CTA… e.g., Subscribe and check out my next video on…" />
          <AIOut k="cta" label="Write CTA" loading={L} output={O} onRun={() => run("cta", "YouTube growth expert. Natural CTAs only.", `3 CTAs for: ${project.title}`)} onUse={(t) => update("cta", t.split("\n").find((l) => l.trim()) || "")} onStop={() => cancel("cta")} />
        </div>
      </Card>
      <Card title="Full Script" icon="📝" action={<div style={{ display: "flex", gap: 6 }}><Btn sm onClick={() => run("script", "Expert YouTube scriptwriter. Write complete production-ready scripts.", prompt(), 3000)} disabled={L["script"]}>{L["script"] ? "✦ Writing…" : "✦ Auto-Generate Script"}</Btn>{L["script"] && <Btn sm color="gray" onClick={() => cancel("script")}>■ Stop</Btn>}</div>}>
        <TArea value={project.scriptBody} onChange={(v) => update("scriptBody", v)} rows={14} placeholder="Type or auto-generate your script…" style={{ fontFamily: "'Courier New',monospace", fontSize: 13 }} />
        {O["script"] && (
          <div style={{ background: "#0f1e3d", border: "1px solid #1e3a8a", borderRadius: 10, padding: 14, marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#93c5fd" }}>✦ Generated Script</span>
              <Btn sm onClick={() => update("scriptBody", O["script"])}>Use this</Btn>
            </div>
            <pre style={{ fontSize: 12, color: "#cbd5e1", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7, maxHeight: 280, overflowY: "auto" }}>{O["script"]}</pre>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Tab: Finish ── */
function FinishTab({ project, update, presets }) {
  const isMobile = useIsMobile();
  const [L, setL] = useState({});
  const [O, setO] = useState({});
  const [checks, setChecks] = useState(Array(7).fill(false));
  const abortRef = useRef(null);
  function cancel(k) { abortRef.current?.abort(); setL((l) => ({ ...l, [k]: false })); }
  async function run(k, sys, usr, tok = 1200) {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setL((l) => ({ ...l, [k]: true }));
    try { const r = await ai(sys + pCtx(presets), usr, tok, abortRef.current.signal); setO((o) => ({ ...o, [k]: r })); }
    catch (e) { if (e.name !== "AbortError") setO((o) => ({ ...o, [k]: "Error." })); }
    setL((l) => ({ ...l, [k]: false }));
  }
  const items = ["Script written & reviewed","Thumbnail created & uploaded","Keywords/tags finalized","Description written","End screen set up","Cards added","Scheduled / published"];
  const titleOptions = [...new Set([project.title, ...(project.metaTitles || [])].filter(Boolean))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Video Summary" icon="📊">
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
          {[["TITLE", project.title],["NICHE", project.niche],["KEYWORDS", project.keywords.join(", ")],["CTA", project.cta],["LENGTH", `${project.videoLength || 10} minutes`]].map(([l, v]) => (
            <div key={l} style={{ background: "#0f172a", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 3 }}>{l}</div>
              <div style={{ fontSize: 13, color: "#cbd5e1" }}>{v || "—"}</div>
            </div>
          ))}
        </div>
        {project.thumbnailImageUrl && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>THUMBNAIL</div>
            <img src={project.thumbnailImageUrl} alt="" style={{ height: 80, borderRadius: 8, border: "1px solid #334155", objectFit: "cover" }} />
          </div>
        )}
      </Card>
      <Card title="Video Titles" icon="🏷️" action={<div style={{ display: "flex", gap: 6 }}><Btn sm disabled={L["titles"]} onClick={() => run("titles", "YouTube title expert. Return exactly 3 titles, one per line, no numbering. Include the original working title as the first option.", `3 clickable titles:\nWorking: ${project.title}\nNiche: ${project.niche}\nKeywords: ${project.keywords.join(", ")}\n\nIMPORTANT: The first title should be a polished version of the working title "${project.title}".`)}>{L["titles"] ? "✦ Generating…" : "✦ Generate Titles"}</Btn>{L["titles"] && <Btn sm color="gray" onClick={() => cancel("titles")}>■ Stop</Btn>}</div>}>
        {titleOptions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {titleOptions.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: i === 0 ? "#1e3a5f" : "#0f1e3d", borderRadius: 8, padding: "7px 10px" }}>
                <span style={{ flex: 1, fontSize: 13 }}>{t}</span>
                {i === 0 && <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 600, background: "#1e40af", padding: "2px 6px", borderRadius: 4 }}>Research Title</span>}
                <Btn sm color="gray" onClick={() => update("title", t)}>Use</Btn>
              </div>
            ))}
          </div>
        )}
        <TInput value={project.title} onChange={(v) => update("title", v)} placeholder="Final title" />
        {O["titles"] && (
          <div style={{ background: "#0f1e3d", border: "1px solid #1e3a8a", borderRadius: 10, padding: 12, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#93c5fd" }}>✦ Suggestions</span>
              <Btn sm onClick={() => update("metaTitles", O["titles"].split("\n").filter((l) => l.trim()))}>Use these</Btn>
            </div>
            <pre style={{ fontSize: 13, color: "#cbd5e1", margin: 0, whiteSpace: "pre-wrap" }}>{O["titles"]}</pre>
          </div>
        )}
      </Card>
      <Card title="Description" icon="📄" action={<div style={{ display: "flex", gap: 6 }}><Btn sm disabled={L["desc"]} onClick={() => run("desc", "YouTube SEO and description expert.", `Full YT description with timestamps, keywords, links, CTA.\nTitle: ${project.title}\nNiche: ${project.niche}\nKeywords: ${project.keywords.join(", ")}\nCTA: ${project.cta}\nVideo Length: ${project.videoLength || 10} minutes\nOutline: ${(project.outlineSections || []).map(s => `${s.name}: ${s.notes}`).join(' | ').slice(0, 400)}`, 1200)}>{L["desc"] ? "✦ Generating…" : "✦ Auto-Write Description"}</Btn>{L["desc"] && <Btn sm color="gray" onClick={() => cancel("desc")}>■ Stop</Btn>}</div>}>
        <TArea value={project.metaDescription} onChange={(v) => update("metaDescription", v)} rows={6} placeholder="Your YouTube description…" />
        {O["desc"] && (
          <div style={{ background: "#0f1e3d", border: "1px solid #1e3a8a", borderRadius: 10, padding: 12, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#93c5fd" }}>✦ Generated</span>
              <Btn sm onClick={() => update("metaDescription", O["desc"])}>Use this</Btn>
            </div>
            <pre style={{ fontSize: 12, color: "#cbd5e1", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7, maxHeight: 240, overflowY: "auto" }}>{O["desc"]}</pre>
          </div>
        )}
      </Card>
      <Card title="Tags" icon="🔖" action={<div style={{ display: "flex", gap: 6 }}><Btn sm disabled={L["tags"]} onClick={() => run("tags", "YouTube SEO expert. Return only comma-separated tags, no numbering.", `15-20 tags for: ${project.title} / ${project.niche} / keywords: ${project.keywords.join(", ")}`)}>{L["tags"] ? "✦ Generating…" : "✦ Generate Tags"}</Btn>{L["tags"] && <Btn sm color="gray" onClick={() => cancel("tags")}>■ Stop</Btn>}</div>}>
        {project.metaTags?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {project.metaTags.map((t, i) => (
              <span key={i} style={{ background: "#1e3a5f", color: "#93c5fd", padding: "3px 10px", borderRadius: 20, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                {t}<button onClick={() => update("metaTags", project.metaTags.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", padding: 0, fontSize: 13 }}>×</button>
              </span>
            ))}
          </div>
        )}
        {O["tags"] && (
          <div style={{ background: "#0f1e3d", border: "1px solid #1e3a8a", borderRadius: 10, padding: 10, marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#93c5fd" }}>✦ Tags</span>
              <Btn sm onClick={() => update("metaTags", O["tags"].split(",").map((t) => t.trim()).filter(Boolean))}>Use all</Btn>
            </div>
            <p style={{ fontSize: 12, color: "#cbd5e1", margin: 0 }}>{O["tags"]}</p>
          </div>
        )}
      </Card>
      <Card title="Schedule & Checklist" icon="🚀">
        <Fld label="Publish Date">
          <input type="date" value={project.publishDate || ""} onChange={(e) => update("publishDate", e.target.value)} style={{ border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", fontSize: 14, width: "100%", boxSizing: "border-box", background: "#0f172a", color: "#ffffff", colorScheme: "dark" }} />
        </Fld>
        <div style={{ marginTop: 16 }}>
          {items.map((item, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={checks[i]} onChange={(e) => { const c = [...checks]; c[i] = e.target.checked; setChecks(c); }} style={{ width: 16, height: 16, accentColor: "#2563eb" }} />
              <span style={{ fontSize: 14, color: checks[i] ? "#64748b" : "#cbd5e1", textDecoration: checks[i] ? "line-through" : "none" }}>{item}</span>
            </label>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #1e293b", paddingTop: 14, marginTop: 4 }}>
          <Btn color="green" onClick={() => update("stage", "Published")}>🎉 Mark as Published</Btn>
        </div>
      </Card>
    </div>
  );
}

/* ── Project Page ── */
function ProjectPage({ project, onUpdate, onBack, presets }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(0);
  const TABS = [{ label: "Research", icon: "🔍" }, { label: "Thumbnail", icon: "🖼️" }, { label: "Script", icon: "📝" }, { label: "Finish", icon: "🚀" }];
  function update(field, value) { onUpdate({ ...project, [field]: value }); }
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      {/* Top bar */}
      <div style={{ background: "#1e293b", borderBottom: "1px solid #334155", padding: isMobile ? "0 12px" : "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
          {!isMobile && <><span style={{ fontSize: 12, color: "#64748b" }}>Workflow</span><span style={{ color: "#475569" }}>/</span></>}
          <span style={{ fontWeight: 700, fontSize: isMobile ? 13 : 15, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.title}</span>
          <Badge stage={project.stage} sm />
        </div>
        <select value={project.stage} onChange={(e) => update("stage", e.target.value)} style={{ border: "1px solid #334155", borderRadius: 8, padding: "6px 10px", fontSize: 12, background: "#1a2234", color: "#ffffff", flexShrink: 0 }}>
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {isMobile ? (
        /* Mobile: horizontal tab strip + content */
        <div>
          <div style={{ display: "flex", background: "#1e293b", borderBottom: "1px solid #334155", overflowX: "auto" }}>
            {TABS.map((t, i) => (
              <button key={t.label} onClick={() => setTab(i)} style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 18px", border: "none", borderBottom: tab === i ? "2px solid #3b82f6" : "2px solid transparent", background: "transparent", color: tab === i ? "#93c5fd" : "#64748b", fontWeight: tab === i ? 700 : 500, fontSize: 11, cursor: "pointer", fontFamily: "Sora,sans-serif", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 18 }}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
          <div style={{ padding: "16px 14px 80px" }}>
            {tab === 0 && <ResearchTab project={project} update={update} presets={presets} />}
            {tab === 1 && <ThumbnailTab project={project} update={update} presets={presets} />}
            {tab === 2 && <ScriptTab project={project} update={update} presets={presets} />}
            {tab === 3 && <FinishTab project={project} update={update} presets={presets} />}
          </div>
        </div>
      ) : (
        /* Desktop: left sidebar + content */
        <div style={{ display: "flex", minHeight: "calc(100vh - 56px)" }}>
          <div style={{ width: 210, background: "#1e293b", borderRight: "1px solid #334155", padding: "24px 14px", flexShrink: 0, position: "sticky", top: 56, height: "calc(100vh - 56px)", overflowY: "auto" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#93c5fd", letterSpacing: "0.08em", padding: "0 10px", marginBottom: 10 }}>SECTIONS</div>
            {TABS.map((t, i) => (
              <button key={t.label} onClick={() => setTab(i)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "11px 14px", border: "none", borderRadius: 10, cursor: "pointer", background: tab === i ? "#1e3a5f" : "transparent", color: tab === i ? "#93c5fd" : "#94a3b8", fontWeight: tab === i ? 600 : 500, fontSize: 14, marginBottom: 3, textAlign: "left" }}>
                <span style={{ fontSize: 17 }}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, padding: "32px 40px", minWidth: 0, maxWidth: 1100 }}>
            {tab === 0 && <ResearchTab project={project} update={update} presets={presets} />}
            {tab === 1 && <ThumbnailTab project={project} update={update} presets={presets} />}
            {tab === 2 && <ScriptTab project={project} update={update} presets={presets} />}
            {tab === 3 && <FinishTab project={project} update={update} presets={presets} />}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Project Card ── */
function PCard({ project, onClick, onDelete }) {
  return (
    <div onClick={onClick} draggable onDragStart={(e) => { e.dataTransfer.setData("projectId", project.id); e.dataTransfer.effectAllowed = "move"; }} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 14, padding: 16, cursor: "pointer", transition: "box-shadow .15s" }} onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 14px rgba(109,40,217,.12)")} onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <Badge stage={project.stage} sm />
        <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this project?")) onDelete(); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 18, padding: 0 }}>×</button>
      </div>
      {project.thumbnailImageUrl && <img src={project.thumbnailImageUrl} alt="" style={{ width: "100%", height: 70, objectFit: "cover", borderRadius: 7, marginBottom: 7 }} />}
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 2px", color: "#ffffff", lineHeight: 1.4 }}>{project.title}</h3>
      {project.niche && <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{project.niche}</p>}
      {project.publishDate && <p style={{ fontSize: 11, color: "#94a3b8", margin: "6px 0 0" }}>📅 {parseLocalDate(project.publishDate)?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
    </div>
  );
}

/* ── Idea Vault Page ── */
function IdeasPage({ ideas, setIdeas, setPage, setEditId, projects, setProjects }) {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [L, setL] = useState({});
  const [showPrompt, setShowPrompt] = useState(false);
  const [subject, setSubject] = useState("");
  const [visibleCount, setVisibleCount] = useState(5);
  const abortRef = useRef(null);
  function cancelGen() { abortRef.current?.abort(); setL((l) => ({ ...l, gen: false })); }

  async function aiIdeas(topic) {
    setShowPrompt(false);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setL((l) => ({ ...l, gen: true }));
    try {
      const raw = await ai(
        `You are a YouTube content strategist. You ONLY generate ideas strictly about the topic the user gives you. Every single idea must be directly about that topic — no tangents, no generic ideas. Return ONLY a valid JSON array, no markdown, no explanation.`,
        `Generate 5 YouTube video ideas. Every idea MUST be specifically about: "${topic}". Do not stray from this topic for any of the 5 ideas.\n\nReturn a JSON array of exactly 5 objects, each with: title (specific catchy video title about ${topic}), notes (1-2 sentence description explaining the angle), priority (one of: "💡 Idea", "⭐ High Priority", "🔥 Hot Topic"), tags (array of 2-3 short tags related to ${topic}).`,
        1500,
        abortRef.current.signal
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed)) {
        const newIdeas = parsed.map((idea) => ({
          ...blankIdea(),
          id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          title: idea.title || "",
          notes: idea.notes || "",
          priority: idea.priority || "💡 Idea",
          tags: Array.isArray(idea.tags) ? idea.tags : [],
        }));
        const updated = [...newIdeas, ...ideas];
        setIdeas(updated);
        saveIdeas(updated);
        setVisibleCount(5);
      }
    } catch (e) { if (e.name !== "AbortError") console.error("Idea gen failed:", e); }
    setL((l) => ({ ...l, gen: false }));
  }

  function addIdea() {
    const idea = blankIdea();
    const updated = [idea, ...ideas];
    setIdeas(updated);
    saveIdeas(updated);
    setEditingId(idea.id);
  }
  function updateIdea(id, field, value) {
    const updated = ideas.map((i) => (i.id === id ? { ...i, [field]: value } : i));
    setIdeas(updated);
    saveIdeas(updated);
  }
  function deleteIdea(id) {
    const updated = ideas.filter((i) => i.id !== id);
    setIdeas(updated);
    saveIdeas(updated);
  }
  function promoteToProject(idea) {
    const p = blankProject();
    p.title = idea.title;
    p.niche = idea.tags?.join(", ") || "";
    const updated = [p, ...projects];
    setProjects(updated);
    stor("set", "tubeflow-projects", updated);
    deleteIdea(idea.id);
    setEditId(p.id);
    setPage("Project");
  }

  const filtered = ideas.filter((idea) => {
    if (filter !== "All" && idea.priority !== filter) return false;
    if (search && !idea.title.toLowerCase().includes(search.toLowerCase()) && !idea.notes.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const dragItem = useRef(null);
  const dragOver = useRef(null);
  function handleDragStart(idx) { dragItem.current = idx; }
  function handleDragEnter(idx) { dragOver.current = idx; }
  function handleDragEnd() {
    if (dragItem.current === null || dragOver.current === null) return;
    const copy = [...ideas];
    const item = copy.splice(dragItem.current, 1)[0];
    copy.splice(dragOver.current, 0, item);
    dragItem.current = null;
    dragOver.current = null;
    setIdeas(copy);
    saveIdeas(copy);
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "16px 14px 80px" : "32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: isMobile ? 20 : 26, fontWeight: 700, margin: 0, color: "#ffffff" }}>💡 Idea Vault</h1>
          <p style={{ color: "#94a3b8", margin: "3px 0 0", fontSize: 13 }}>{ideas.length} ideas saved · drag to reorder</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Btn onClick={() => { setSubject(""); setShowPrompt(true); }} disabled={L.gen} sm={isMobile}>{L.gen ? "✦ Generating…" : "✦ AI Ideas"}</Btn>
          {L.gen && <Btn color="gray" onClick={cancelGen} sm={isMobile}>■ Stop</Btn>}
          <Btn onClick={addIdea} sm={isMobile}>+ New Idea</Btn>
        </div>
      </div>

      {showPrompt && (
        <div style={{ background: "#1e293b", border: "1px solid #3b82f6", borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#93c5fd", marginBottom: 10 }}>✦ What topic should these 5 ideas be about?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <TInput
              value={subject}
              onChange={setSubject}
              placeholder="e.g., backpacking gear, budget travel, camera reviews…"
              style={{ flex: 1 }}
              onKeyDown={(e) => { if (e.key === "Enter" && subject.trim()) aiIdeas(subject.trim()); if (e.key === "Escape") setShowPrompt(false); }}
            />
            <Btn onClick={() => subject.trim() && aiIdeas(subject.trim())}>Generate</Btn>
            <Btn color="gray" onClick={() => setShowPrompt(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <TInput value={search} onChange={setSearch} placeholder="Search ideas…" style={{ width: 220 }} />
        {["All", ...IDEA_PRIORITIES].map((p) => (
          <button key={p} onClick={() => setFilter(p)} style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid #334155", cursor: "pointer", fontSize: 12, fontWeight: 500, background: filter === p ? "#1e3a5f" : "#1e293b", color: filter === p ? "#93c5fd" : "#94a3b8" }}>{p}</button>
        ))}
      </div>
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 0", color: "#64748b" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>💡</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8" }}>{ideas.length === 0 ? "No ideas yet" : "No matching ideas"}</p>
          <p style={{ fontSize: 13 }}>{ideas.length === 0 ? "Add an idea or let AI generate some" : "Try a different filter"}</p>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.slice(0, visibleCount).map((idea) => {
          const isEditing = editingId === idea.id;
          const colorIdx = ideas.indexOf(idea) % IDEA_COLORS.length;
          return (
            <div key={idea.id} draggable onDragStart={() => handleDragStart(ideas.indexOf(idea))} onDragEnter={() => handleDragEnter(ideas.indexOf(idea))} onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()}
              style={{ background: "#1e293b", borderRadius: 12, border: "1px solid #334155", borderLeft: `4px solid ${IDEA_COLORS[colorIdx].replace("fe", "80").replace("fa", "60")}`, padding: "14px 16px", cursor: "grab" }}>
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <TInput value={idea.title} onChange={(v) => updateIdea(idea.id, "title", v)} placeholder="Video idea title…" style={{ fontWeight: 600 }} />
                  <TArea value={idea.notes} onChange={(v) => updateIdea(idea.id, "notes", v)} rows={2} placeholder="Notes, angles, why this would work…" />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={idea.priority} onChange={(e) => updateIdea(idea.id, "priority", e.target.value)} style={{ border: "1px solid #334155", borderRadius: 8, padding: "5px 10px", fontSize: 12, background: "#0f172a", color: "#ffffff" }}>
                      {IDEA_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                    </select>
                    <Btn sm color="green" onClick={() => setEditingId(null)}>Done</Btn>
                    <Btn sm onClick={() => promoteToProject(idea)}>🚀 Make Project</Btn>
                    <Btn sm color="red" onClick={() => { if (confirm("Delete this idea?")) deleteIdea(idea.id); }}>Delete</Btn>
                  </div>
                </div>
              ) : (
                <div onClick={() => setEditingId(idea.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#93c5fd", background: "#1e3a5f", padding: "2px 8px", borderRadius: 20 }}>{idea.priority}</span>
                      {idea.tags?.map((t, i) => <span key={i} style={{ fontSize: 10, color: "#94a3b8", background: "#1e293b", padding: "2px 6px", borderRadius: 10 }}>{t}</span>)}
                    </div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, margin: "4px 0 2px", color: "#ffffff" }}>{idea.title || "Untitled idea"}</h4>
                    {idea.notes && <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>{idea.notes}</p>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); promoteToProject(idea); }} style={{ background: "#1e3a5f", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, color: "#93c5fd", fontWeight: 600, whiteSpace: "nowrap", marginLeft: 10 }}>🚀 Promote</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: show more or generate more */}
      {filtered.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          {visibleCount < filtered.length ? (
            <button onClick={() => setVisibleCount((v) => v + 5)} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "10px 24px", cursor: "pointer", fontSize: 13, color: "#94a3b8", fontFamily: "Sora,sans-serif" }}>
              Show 5 More ({filtered.length - visibleCount} hidden)
            </button>
          ) : (
            <button onClick={() => { setSubject(""); setShowPrompt(true); }} disabled={L.gen} style={{ background: "#1e3a5f", border: "1px solid #3b82f6", borderRadius: 10, padding: "10px 24px", cursor: L.gen ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, color: "#93c5fd", fontFamily: "Sora,sans-serif" }}>
              {L.gen ? "✦ Generating…" : "✦ Generate 5 More"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Home Page ── */
function HomePage({ projects, setProjects, setPage, setEditId, ideas }) {
  const [cm, setCm] = useState(new Date().getMonth());
  const [cy, setCy] = useState(new Date().getFullYear());
  const [rs, setRs] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const first = new Date(cy, cm, 1).getDay();
  const total = new Date(cy, cm + 1, 0).getDate();
  const cells = Array(first).fill(null).concat(Array.from({ length: total }, (_, i) => i + 1));

  function pod(day) {
    return projects.filter((p) => {
      if (!p.publishDate) return false;
      const d = parseLocalDate(p.publishDate);
      return d && d.getFullYear() === cy && d.getMonth() === cm && d.getDate() === day;
    });
  }
  function open(id) { setEditId(id); setPage("Project"); }
  function createNew() {
    const p = blankProject();
    const u = [p, ...projects];
    setProjects(u);
    stor("set", "tubeflow-projects", u);
    setEditId(p.id);
    setPage("Project");
  }
  function reschedule(id, date) {
    const u = projects.map((p) => (p.id === id ? { ...p, publishDate: date } : p));
    setProjects(u);
    stor("set", "tubeflow-projects", u);
    setRs(null);
  }
  function handleCalendarDrop(e, day) {
    e.preventDefault();
    setDragOverDay(null);
    const projectId = e.dataTransfer.getData("projectId");
    if (projectId && day) {
      reschedule(projectId, toDateStr(cy, cm, day));
    }
  }

  const isMobile = useIsMobile();
  const inProg = projects.filter((p) => p.stage !== "Published");
  const pub = projects.filter((p) => p.stage === "Published");
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "16px 14px 80px" : "32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: isMobile ? 20 : 26, fontWeight: 700, margin: 0, color: "#ffffff" }}>Video Workflow</h1>
          <p style={{ color: "#94a3b8", margin: "3px 0 0", fontSize: 13 }}>Research, plan, and launch your YouTube videos</p>
        </div>
        <Btn onClick={createNew} sm={isMobile}>+ New Project</Btn>
      </div>
      {ideas?.length > 0 && (
        <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: isMobile ? 10 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>💡</span>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#cbd5e1" }}>{ideas.length} ideas in your vault</span>
            {!isMobile && (
              <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                {ideas.slice(0, 3).map((idea) => (
                  <span key={idea.id} style={{ background: "#2d1a00", color: "#fb923c", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500 }}>{idea.title?.slice(0, 25)}{idea.title?.length > 25 ? "…" : ""}</span>
                ))}
                {ideas.length > 3 && <span style={{ color: "#64748b", fontSize: 11 }}>+{ideas.length - 3} more</span>}
              </div>
            )}
          </div>
          <button onClick={() => setPage("Ideas")} style={{ background: "none", border: "1px solid #334155", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#93c5fd" }}>View All →</button>
        </div>
      )}
      <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: 20, marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>📅 Content Calendar</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => { let m = cm - 1, y = cy; if (m < 0) { m = 11; y--; } setCm(m); setCy(y); }} style={{ background: "none", border: "1px solid #334155", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>‹</button>
            <span style={{ fontWeight: 600, minWidth: 110, textAlign: "center", fontSize: 13 }}>{MONTHS[cm]} {cy}</span>
            <button onClick={() => { let m = cm + 1, y = cy; if (m > 11) { m = 0; y++; } setCm(m); setCy(y); }} style={{ background: "none", border: "1px solid #334155", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>›</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {DAYS.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#64748b", padding: "3px 0" }}>{isMobile ? d[0] : d}</div>)}
          {cells.map((day, i) => {
            const hits = day ? pod(day) : [];
            const today = day && new Date().getDate() === day && new Date().getMonth() === cm && new Date().getFullYear() === cy;
            const isOver = dragOverDay === day;
            return (
              <div key={i} onDragOver={(e) => { if (day) { e.preventDefault(); setDragOverDay(day); } }} onDragLeave={() => setDragOverDay(null)} onDrop={(e) => day && handleCalendarDrop(e, day)}
                style={{ minHeight: 52, padding: 3, borderRadius: 5, background: isOver ? "#1e3a5f" : day ? "#1a2234" : "transparent", border: isOver ? "2px dashed #3b82f6" : "2px solid transparent", transition: "all .15s" }}>
                {day && <div style={{ fontSize: 12, fontWeight: today ? 700 : 400, color: today ? "#fff" : "#cbd5e1", background: today ? "#2563eb" : "transparent", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2 }}>{day}</div>}
                {hits.map((p) => (
                  <div key={p.id} draggable onDragStart={(e) => { e.dataTransfer.setData("projectId", p.id); e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); }} onClick={() => open(p.id)} onContextMenu={(e) => { e.preventDefault(); setRs({ id: p.id, x: e.clientX, y: e.clientY }); }}
                    style={{ background: SC[p.stage]?.bg || "#1e3a5f", color: SC[p.stage]?.text || "#93c5fd", fontSize: 9, fontWeight: 600, borderRadius: 3, padding: "1px 3px", cursor: "grab", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginBottom: 1 }}>
                    {p.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 10, color: "#64748b", margin: "6px 0 0" }}>Click to open · Drag to reschedule · Right-click for date picker</p>
      </div>
      {rs && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setRs(null)} />
          <div style={{ position: "fixed", top: Math.min(rs.y, window.innerHeight - 100), left: Math.min(rs.x, window.innerWidth - 230), background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: 14, boxShadow: "0 8px 24px rgba(0,0,0,.12)", zIndex: 999, minWidth: 200 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Reschedule</div>
            <input type="date" style={{ width: "100%", border: "1px solid #334155", borderRadius: 7, padding: "6px 10px", fontSize: 13, boxSizing: "border-box", background: "#0f172a", color: "#ffffff", colorScheme: "dark" }} onChange={(e) => reschedule(rs.id, e.target.value)} />
          </div>
        </>
      )}
      {inProg.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#cbd5e1" }}>⏳ In Progress ({inProg.length})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
            {inProg.map((p) => <PCard key={p.id} project={p} onClick={() => open(p.id)} onDelete={() => { const u = projects.filter((x) => x.id !== p.id); setProjects(u); stor("set", "tubeflow-projects", u); }} />)}
          </div>
        </div>
      )}
      {pub.length > 0 && (
        <div>
          <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#cbd5e1" }}>✅ Published ({pub.length})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
            {pub.map((p) => <PCard key={p.id} project={p} onClick={() => open(p.id)} onDelete={() => { const u = projects.filter((x) => x.id !== p.id); setProjects(u); stor("set", "tubeflow-projects", u); }} />)}
          </div>
        </div>
      )}
      {projects.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🎬</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8" }}>No projects yet</p>
          <p style={{ fontSize: 13 }}>Click "New Project" to plan your first video</p>
        </div>
      )}
    </div>
  );
}

/* ── Calendar Page ── */
function CalendarPage({ projects, setProjects, setPage, setEditId }) {
  const isMobile = useIsMobile();
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [dragOverDay, setDragOverDay] = useState(null);
  const [touchOverDay, setTouchOverDay] = useState(null);
  const touchDragRef = useRef(null);
  const calGridRef = useRef(null);
  const first = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  const cells = Array(first).fill(null).concat(Array.from({ length: total }, (_, i) => i + 1));

  // Non-passive touchmove so we can preventDefault and stop page scroll while dragging
  useEffect(() => {
    const el = calGridRef.current;
    if (!el) return;
    function onTouchMove(e) {
      if (!touchDragRef.current) return;
      e.preventDefault();
      const t = e.touches[0];
      const target = document.elementFromPoint(t.clientX, t.clientY);
      const cell = target?.closest("[data-calday]");
      setTouchOverDay(cell ? +cell.dataset.calday : null);
    }
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  function onProjectTouchStart(e, projectId) {
    e.stopPropagation();
    touchDragRef.current = projectId;
  }
  function onProjectTouchEnd() {
    if (touchDragRef.current && touchOverDay) {
      reschedule(touchDragRef.current, toDateStr(year, month, touchOverDay));
    }
    touchDragRef.current = null;
    setTouchOverDay(null);
  }

  function pod(day) {
    return projects.filter((p) => {
      if (!p.publishDate) return false;
      const d = parseLocalDate(p.publishDate);
      return d && d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }
  function reschedule(id, date) {
    const u = projects.map((p) => (p.id === id ? { ...p, publishDate: date } : p));
    setProjects(u);
    stor("set", "tubeflow-projects", u);
  }
  function handleCalendarDrop(e, day) {
    e.preventDefault();
    setDragOverDay(null);
    const projectId = e.dataTransfer.getData("projectId");
    if (projectId && day) { reschedule(projectId, toDateStr(year, month, day)); }
  }
  const upcoming = [...projects].filter((p) => p.publishDate).sort((a, b) => a.publishDate.localeCompare(b.publishDate));
  function createNew() {
    const p = blankProject();
    const u = [p, ...projects];
    setProjects(u);
    stor("set", "tubeflow-projects", u);
    setEditId(p.id);
    setPage("Project");
  }
  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: isMobile ? "16px 14px 80px" : "32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: isMobile ? 20 : 26, fontWeight: 700, margin: 0, color: "#ffffff" }}>Content Calendar</h1>
          <p style={{ color: "#94a3b8", margin: "3px 0 0", fontSize: 13 }}>{projects.filter((p) => p.publishDate).length} videos scheduled · touch &amp; drag to reschedule</p>
        </div>
        <Btn onClick={createNew} sm={isMobile}>+ New Video</Btn>
      </div>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 18 }}>
        <div style={{ flex: 1, background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: isMobile ? 14 : 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: 17 }}>{MONTHS[month]} {year}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { let m = month - 1, y = year; if (m < 0) { m = 11; y--; } setMonth(m); setYear(y); }} style={{ background: "none", border: "1px solid #334155", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 15 }}>‹</button>
              <button onClick={() => { setMonth(new Date().getMonth()); setYear(new Date().getFullYear()); }} style={{ background: "none", border: "1px solid #334155", borderRadius: 6, padding: "0 10px", cursor: "pointer", fontSize: 12 }}>Today</button>
              <button onClick={() => { let m = month + 1, y = year; if (m > 11) { m = 0; y++; } setMonth(m); setYear(y); }} style={{ background: "none", border: "1px solid #334155", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 15 }}>›</button>
            </div>
          </div>
          <div ref={calGridRef} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {DAYS.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#64748b", padding: "8px 0" }}>{isMobile ? d[0] : d}</div>)}
            {cells.map((day, i) => {
              const hits = day ? pod(day) : [];
              const today = day && new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
              const isOver = dragOverDay === day || touchOverDay === day;
              return (
                <div key={i} data-calday={day || ""} onDragOver={(e) => { if (day) { e.preventDefault(); setDragOverDay(day); } }} onDragLeave={() => setDragOverDay(null)} onDrop={(e) => day && handleCalendarDrop(e, day)}
                  style={{ minHeight: isMobile ? 50 : 130, padding: isMobile ? 3 : 6, border: isOver ? "2px dashed #3b82f6" : "1px solid #1e293b", borderRadius: 6, background: isOver ? "#1e3a5f" : day ? "#1e293b" : "#1a2234", transition: "all .15s" }}>
                  {day && <div style={{ fontSize: 13, fontWeight: today ? 700 : 400, color: today ? "#fff" : "#cbd5e1", background: today ? "#2563eb" : "transparent", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 5 }}>{day}</div>}
                  {hits.map((p) => (
                    <div key={p.id} draggable
                      onDragStart={(e) => { e.dataTransfer.setData("projectId", p.id); e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); }}
                      onTouchStart={(e) => onProjectTouchStart(e, p.id)}
                      onTouchEnd={onProjectTouchEnd}
                      onClick={() => { if (!touchDragRef.current) { setEditId(p.id); setPage("Project"); } }}
                      style={{ background: SC[p.stage]?.bg || "#1e3a5f", color: SC[p.stage]?.text || "#93c5fd", fontSize: 11, fontWeight: 600, borderRadius: 5, padding: "4px 7px", cursor: "grab", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginBottom: 3, border: `1px solid ${SC[p.stage]?.dot || "#3b82f6"}22` }}>
                      <span style={{ display: "block", fontSize: 9, opacity: 0.7, marginBottom: 1 }}>{SC[p.stage] ? p.stage : ""}</span>
                      {p.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ width: isMobile ? "100%" : 280 }}>
          <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontFamily: "Sora,sans-serif", fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>Upcoming</h3>
            {upcoming.length === 0 && <p style={{ color: "#64748b", fontSize: 12 }}>No scheduled videos</p>}
            {upcoming.slice(0, 6).map((p) => (
              <div key={p.id} onClick={() => { setEditId(p.id); setPage("Project"); }} style={{ marginBottom: 12, cursor: "pointer" }}>
                <div style={{ marginBottom: 2 }}><Badge stage={p.stage} sm /></div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#ffffff", lineHeight: 1.4 }}>{p.title}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>{parseLocalDate(p.publishDate)?.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: 16 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, margin: "0 0 10px", color: "#cbd5e1" }}>Legend</h3>
            {STAGES.map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: SC[s].dot }} />
                <span style={{ fontSize: 12, color: "#cbd5e1" }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Presets Page ── */
function PresetsPage({ presets, setPresets }) {
  const isMobile = useIsMobile();
  const [type, setType] = useState("Custom");
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");
  const TYPES = [{ id: "Intro", lbl: "Intro Template" },{ id: "Outro", lbl: "Outro Template" },{ id: "Tone", lbl: "Tone / Style" },{ id: "Avoid", lbl: "Banned Words" },{ id: "CTA", lbl: "CTA Template" },{ id: "Niche", lbl: "Niche Context" },{ id: "Custom", lbl: "Custom Instruction" }];
  async function save() {
    if (!label.trim() || !content.trim()) return;
    const u = [...presets, { id: Date.now().toString(), type, label, content }];
    setPresets(u);
    await savePresets(u);
    setLabel(""); setContent("");
  }
  async function del(id) { const u = presets.filter((p) => p.id !== id); setPresets(u); await savePresets(u); }
  const EX = [
    { type: "Intro", label: "My Intro", content: "Hey I'm Backpacker Luke, and today we're talking about" },
    { type: "Avoid", label: "No Filler Words", content: "absolutely, amazing, game-changer, leverage, dive into, delve into" },
    { type: "Tone", label: "Casual & Real", content: "Write like I'm talking to a friend. Casual, energetic, authentic. No corporate speak." },
    { type: "CTA", label: "Subscribe CTA", content: "If you found this helpful, hit subscribe and the bell so you never miss a video." },
  ];
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: isMobile ? "16px 14px 80px" : "32px 40px" }}>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: isMobile ? 20 : 26, fontWeight: 700, margin: "0 0 3px", color: "#ffffff" }}>Creator Presets</h1>
      <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 24px" }}>Persistent rules and templates applied to all AI-generated content</p>
      <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>✦ Add New Preset</h2>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>TYPE</div>
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "100%", border: "1px solid #334155", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "#1a2234" }}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.lbl}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>LABEL</div>
            <TInput value={label} onChange={setLabel} placeholder="Short name" />
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>CONTENT</div>
        <TArea value={content} onChange={setContent} rows={3} placeholder="Enter instructions…" />
        <Btn onClick={save} style={{ marginTop: 10 }}>+ Save Preset</Btn>
      </div>
      <div style={{ background: "#0f1e3d", borderRadius: 12, border: "1px solid #1e3a8a", padding: 14, marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "#93c5fd", margin: "0 0 8px" }}>💡 Quick examples</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {EX.map((ex, i) => (
            <button key={i} onClick={() => { setType(ex.type); setLabel(ex.label); setContent(ex.content); }} style={{ background: "#1e293b", border: "1px solid #1e3a8a", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontSize: 11, color: "#93c5fd", fontWeight: 500 }}>+ {ex.label}</button>
          ))}
        </div>
      </div>
      {presets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⚙️</div><p>No presets yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {presets.map((p) => (
            <div key={p.id} style={{ background: "#1e293b", borderRadius: 12, border: "1px solid #334155", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, background: "#1e3a5f", color: "#93c5fd", padding: "2px 7px", borderRadius: 20 }}>{TYPES.find((t) => t.id === p.type)?.lbl || p.type}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{p.label}</span>
                </div>
                <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, whiteSpace: "pre-wrap" }}>{p.content}</p>
              </div>
              <button onClick={() => del(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 17, padding: "0 0 0 10px", flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Settings Page ── */
function SettingsPage() {
  const isMobile = useIsMobile();
  const [anthropic, setAnthropic] = useState(getKey("anthropic-key"));
  const [youtube, setYoutube] = useState(getKey("youtube-key"));
  const [saved, setSaved] = useState(false);
  const currentUser = auth.currentUser;
  function save() {
    setKey("anthropic-key", anthropic.trim());
    setKey("youtube-key", youtube.trim());
    if (auth.currentUser) {
      saveUserKeys(auth.currentUser.uid, {
        anthropicKey: anthropic.trim(),
        youtubeKey: youtube.trim(),
      }).catch(() => {});
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: isMobile ? "20px 14px 80px" : "40px 40px" }}>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, fontWeight: 700, margin: "0 0 6px", color: "#ffffff" }}>🔑 API Keys</h1>
      <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 28px" }}>Keys are saved in your browser only — never sent to any server.</p>
      <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}>Anthropic API Key <span style={{ color: "#f87171", fontSize: 11 }}>required</span></div>
          <input
            type="password"
            value={anthropic}
            onChange={(e) => setAnthropic(e.target.value)}
            placeholder="sk-ant-api03-..."
            style={{ width: "100%", border: "1px solid #334155", borderRadius: 8, padding: "10px 12px", fontSize: 14, boxSizing: "border-box", background: "#0f172a", color: "#ffffff", outline: "none" }}
          />
          <p style={{ fontSize: 11, color: "#64748b", margin: "6px 0 0" }}>Get yours at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>console.anthropic.com</a></p>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}>YouTube Data API Key <span style={{ color: "#64748b", fontSize: 11 }}>optional</span></div>
          <input
            type="password"
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
            placeholder="AIza..."
            style={{ width: "100%", border: "1px solid #334155", borderRadius: 8, padding: "10px 12px", fontSize: 14, boxSizing: "border-box", background: "#0f172a", color: "#ffffff", outline: "none" }}
          />
          <p style={{ fontSize: 11, color: "#64748b", margin: "6px 0 0" }}>Without this, YouTube search uses AI simulation instead of real results. Get one free at <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>Google Cloud Console</a>.</p>
        </div>
        <div>
          <Btn onClick={save}>{saved ? "✓ Saved!" : "Save Keys"}</Btn>
        </div>
      </div>
      {currentUser && (
        <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: "16px 20px", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>{currentUser.displayName || "Creator"}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{currentUser.email}</div>
          </div>
          <Btn sm color="gray" onClick={signOutUser}>Sign out</Btn>
        </div>
      )}
    </div>
  );
}

/* ── Login Screen ── */
function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn() {
    setLoading(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (e) {
      setError("Sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0f172a", fontFamily: "Sora, sans-serif" }}>
      <div style={{ background: "#1e293b", borderRadius: 20, padding: "52px 48px", maxWidth: 420, width: "90%", textAlign: "center", boxShadow: "0 24px 64px rgba(0,0,0,.5)" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
        <h1 style={{ fontFamily: "Sora, sans-serif", fontSize: 28, fontWeight: 700, color: "#ffffff", margin: "0 0 8px" }}>Vid Planner</h1>
        <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 36px", lineHeight: 1.6 }}>Research, plan, and launch your YouTube videos with AI</p>
        <button
          onClick={handleSignIn}
          disabled={loading}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, width: "100%", padding: "14px 20px", background: loading ? "#1e3a5f" : "#2563eb", color: "#ffffff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", transition: "background .2s", fontFamily: "Sora, sans-serif" }}
        >
          {loading ? "Signing in…" : (
            <>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#fff"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#fff" fillOpacity=".8"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fff" fillOpacity=".6"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#fff" fillOpacity=".4"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>
        {error && <p style={{ color: "#f87171", fontSize: 12, marginTop: 12 }}>{error}</p>}
        <p style={{ color: "#475569", fontSize: 11, marginTop: 24 }}>Your data stays private and synced to your account</p>
      </div>
    </div>
  );
}

/* ── App Root ── */
export default function App() {
  const isMobile = useIsMobile();
  const [page, setPage] = useState("Home");
  const [projects, setProjects] = useState([]);
  const [presets, setPresets] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [editId, setEditId] = useState(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        try {
          const keys = await loadUserKeys(u.uid);
          if (keys.anthropicKey) setKey("anthropic-key", keys.anthropicKey);
          if (keys.youtubeKey) setKey("youtube-key", keys.youtubeKey);
        } catch { /* silent — localStorage keys still work */ }
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    Promise.all([
      stor("get", "tubeflow-projects"),
      stor("get", "tubeflow-presets"),
      stor("get", "tubeflow-ideas"),
    ]).then(([p, pr, id]) => {
      setProjects(Array.isArray(p) ? p : []);
      setPresets(Array.isArray(pr) ? pr : []);
      setIdeas(Array.isArray(id) ? id : []);
      setReady(true);
    });
  }, []);

  function updateProject(updated) {
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === updated.id ? updated : p));
      stor("set", "tubeflow-projects", next);
      return next;
    });
  }

  const editProject = editId ? projects.find((p) => p.id === editId) : null;

  useEffect(() => {
    if (page === "Project" && ready && !editProject) {
      setPage("Home");
      setEditId(null);
    }
  }, [page, ready, editProject]);

  if (!authReady || !ready) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#94a3b8", fontFamily: "Sora, sans-serif" }}>Loading Vid Planner…</div>;

  if (!user) return <LoginPage />;

  const nav = (p) => { setPage(p); setEditId(null); };

  return (
    <div style={{ fontFamily: "Sora, sans-serif", display: "flex", minHeight: "100vh", background: "#0f172a" }}>
      <Sidebar page={page} setPage={nav} projects={projects} ideas={ideas} user={user} />
      <main style={{ marginLeft: isMobile ? 0 : 240, flex: 1, background: "#0f172a", minHeight: "100vh" }}>
        {page === "Home"     && <HomePage projects={projects} setProjects={setProjects} setPage={setPage} setEditId={setEditId} ideas={ideas} />}
        {page === "Calendar" && <CalendarPage projects={projects} setProjects={setProjects} setPage={setPage} setEditId={setEditId} />}
        {page === "Ideas"    && <IdeasPage ideas={ideas} setIdeas={setIdeas} setPage={setPage} setEditId={setEditId} projects={projects} setProjects={setProjects} />}
        {page === "Presets"  && <PresetsPage presets={presets} setPresets={setPresets} />}
        {page === "Settings" && <SettingsPage />}
        {page === "Project"  && editProject && <ProjectPage project={editProject} onUpdate={updateProject} onBack={() => nav("Home")} presets={presets} />}
      </main>
    </div>
  );
}
