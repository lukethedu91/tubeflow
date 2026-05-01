import { useState, useEffect, useRef, useMemo } from "react";
import { storageGet, storageSet } from "./storage.js";
import { auth, signInWithGoogle, signOutUser, loadUserData, saveUserProjects, saveUserIdeas, saveAllUserData } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { durationSecs, fmtViews, fmtDuration, timeAgo } from "./utils.js";

/* ── Storage keys ── */
const SK = {
  PROJECTS:    "vidplanner-projects",
  PROJECTS_TS: "vidplanner-projects-ts",
  IDEAS:       "vidplanner-ideas",
  SCHEDULE:    "vidplanner-schedule",
};


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
let _currentUid = null;
function stripThumbnails(projects) {
  return projects.map(({ thumbnailImageUrl: _t, ...rest }) => rest);
}
async function saveProjectsData(p) {
  const ts = Date.now();
  await stor("set", SK.PROJECTS, p);
  await stor("set", SK.PROJECTS_TS, ts);
  if (_currentUid) saveUserProjects(_currentUid, stripThumbnails(p)).catch((e) => console.warn("Vid Planner: cloud sync failed –", e));
}

async function saveIdeas(ideas) {
  await stor("set", SK.IDEAS, ideas);
  if (_currentUid) saveUserIdeas(_currentUid, ideas).catch((e) => console.warn("Vid Planner: cloud sync failed –", e));
}

/* ── Constants ── */
const STAGES = ["Research", "Thumbnail", "Script", "Filming", "Editing", "Finishing", "Published"];
const SC = {
  Research:  { bg: "#0c2340", text: "#60a5fa", dot: "#3b82f6" },
  Thumbnail: { bg: "#2d1500", text: "#fb923c", dot: "#f97316" },
  Script:    { bg: "#1e1b4b", text: "#a5b4fc", dot: "#818cf8" },
  Filming:   { bg: "#2d1a00", text: "#fbbf24", dot: "#f59e0b" },
  Editing:   { bg: "#2d0a3e", text: "#e879f9", dot: "#d946ef" },
  Finishing: { bg: "#0c3040", text: "#38bdf8", dot: "#0ea5e9" },
  Published: { bg: "#052e16", text: "#4ade80", dot: "#22c55e" },
};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const IDEA_COLORS = ["#2d1a00","#1e3a5f","#1e3a5f","#052e16","#2d0a3e","#0f2042","#2d1a00","#052e16"];
const IDEA_PRIORITIES = ["💡 Idea","⭐ High Priority","🔥 Hot Topic","📌 Planned"];

function blankProject(contentType = "long") {
  return {
    id: crypto.randomUUID(),
    title: "Untitled Video",
    contentType,
    niche: "",
    keywords: [],
    competitors: [{ id: crypto.randomUUID(), title: "", url: "", views: "", why: "" }],
    thumbnailConcept: "",
    thumbnailHook: "",
    thumbnailImageUrl: "",
    outlineHook: "",
    outlineSections: [],
    scriptDocUrl: "",
    scriptDocContent: "",
    scriptDocName: "",
    scriptBody: "",
    cta: "",
    metaTitles: [],
    metaDescription: "",
    metaTags: [],
    notes: "",
    filmingDate: null,
    filmingLocation: "",
    filmingEquipment: "",
    filmingNotes: "",
    shotList: [],
    publishDate: null,
    stage: "Research",
    videoLength: contentType === "short" ? 1 : 10,
    createdAt: new Date().toISOString(),
  };
}

function blankIdea() {
  return {
    id: crypto.randomUUID(),
    title: "",
    notes: "",
    priority: "💡 Idea",
    tags: [],
    createdAt: new Date().toISOString(),
  };
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
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const bg = color === "green" ? "linear-gradient(135deg,#059669,#22c55e)" : color === "gray" ? "#1e293b" : color === "red" ? "linear-gradient(135deg,#dc2626,#ef4444)" : "linear-gradient(135deg,#2563eb,#3b82f6)";
  const clr = color === "gray" ? "#cbd5e1" : "#fff";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        background: disabled ? "#334155" : bg,
        color: disabled ? "#64748b" : clr,
        border: "none", borderRadius: 8,
        padding: sm ? "6px 12px" : "9px 18px",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 600, fontSize: sm ? 12 : 13,
        display: "inline-flex", alignItems: "center", gap: 6,
        opacity: !disabled && hover ? 0.82 : 1,
        transform: !disabled && active ? "scale(0.96)" : "scale(1)",
        transition: "opacity 0.12s, transform 0.08s",
        ...style
      }}>
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
  const isMobile = useIsMobile();
  return (
    <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: isMobile ? "14px 14px" : 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
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
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onCancel}>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: "24px 28px", maxWidth: 360, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <p style={{ color: "#e2e8f0", fontSize: 15, margin: "0 0 20px", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn color="gray" onClick={onCancel}>Cancel</Btn>
          <Btn color="red" onClick={onConfirm}>Delete</Btn>
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar ── */
const NAV_ITEMS = [
  { id: "Home",     icon: "🏠", label: "Workflow"   },
  { id: "Calendar", icon: "📅", label: "Calendar"   },
  { id: "Ideas",    icon: "💡", label: "Idea Vault" },
  { id: "Settings", icon: "👤", label: "Account"    },
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
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>YouTube Planner</div>
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
        <button onClick={add} aria-label="Add keyword" style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, width: 34, cursor: "pointer", fontSize: 18 }}>+</button>
      </div>
      {keywords.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {keywords.map((kw, i) => (
            <span key={i} style={{ background: "#1e3a5f", color: "#93c5fd", padding: "4px 10px", borderRadius: 20, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              {kw}
              <button onClick={() => onChange(keywords.filter((_, j) => j !== i))} aria-label={`Remove keyword ${kw}`} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", padding: 0, fontSize: 15 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── YouTube Search ── */
const YT_FILTERS = {
  type:     { label: "Type",     options: [{ val: "any", lbl: "All" }, { val: "video", lbl: "🎬 Videos" }, { val: "shorts", lbl: "📱 Shorts" }, { val: "live", lbl: "🔴 Live" }, { val: "upcoming", lbl: "⏰ Upcoming" }] },
  sort:     { label: "Sort",     options: [{ val: "relevance", lbl: "Relevance" }, { val: "viewCount", lbl: "Most Viewed" }, { val: "date", lbl: "Newest" }, { val: "rating", lbl: "Top Rated" }] },
  duration: { label: "Duration", options: [{ val: "any", lbl: "Any length" }, { val: "short", lbl: "Short  <4m" }, { val: "medium", lbl: "Medium  4–20m" }, { val: "long", lbl: "Long  20m+" }] },
  date:     { label: "Uploaded", options: [{ val: "any", lbl: "Any time" }, { val: "today", lbl: "Today" }, { val: "week", lbl: "This week" }, { val: "month", lbl: "This month" }, { val: "year", lbl: "This year" }] },
};

const YT_API_KEY = "AIzaSyBJJaw_wce_KWXlmA8M9GypkCtQ7p28iVk";

function YTSearch({ onAdd }) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [filters, setFilters] = useState({ type: "any", sort: "relevance", duration: "any", date: "any" });
  const colors = ["#1e3a5f","#2d1b69","#0f4c35","#5c1a1a","#1a3d5c","#3d1a5c","#1a4d2e","#4d1a1a","#2d3748","#1a365d","#276749","#702459"];
  function bg(t) { let h = 0; for (let i = 0; i < (t||"").length; i++) h = (h + t.charCodeAt(i)) % colors.length; return colors[h]; }

  async function searchWith(f = filters) {
    if (!q.trim()) return;
    setLoading(true); setDone(true); setSearchErr("");
    try {
      const apiKey = YT_API_KEY;
      const { type, sort, duration, date } = f;

      let searchQuery = q.trim();
      let eventTypeParam = "";
      let effectiveDuration = duration;
      if (type === "shorts")   { searchQuery += " #shorts"; effectiveDuration = "short"; }
      if (type === "live")     { eventTypeParam = "&eventType=live"; }
      if (type === "upcoming") { eventTypeParam = "&eventType=upcoming"; }

      let publishedAfter = "";
      if (date !== "any") {
        const now = new Date();
        if (date === "today") now.setHours(0, 0, 0, 0);
        if (date === "week")  now.setDate(now.getDate() - 7);
        if (date === "month") now.setMonth(now.getMonth() - 1);
        if (date === "year")  now.setFullYear(now.getFullYear() - 1);
        publishedAfter = `&publishedAfter=${now.toISOString()}`;
      }
      const durationParam = effectiveDuration !== "any" ? `&videoDuration=${effectiveDuration}` : "";

      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=12&order=${sort}${durationParam}${eventTypeParam}${publishedAfter}&key=${apiKey}`
      );
      const searchData = await searchRes.json();
      if (searchData.error) { setSearchErr(searchData.error.message); setLoading(false); return; }
      if (!searchData.items?.length) { setRes([]); setLoading(false); return; }

      const ids = searchData.items.map((i) => i.id.videoId).join(",");
      const statsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${ids}&key=${apiKey}`
      );
      const statsData = await statsRes.json();
      const statsMap = Object.fromEntries((statsData.items || []).map((i) => [i.id, i]));

      const results = searchData.items.map((item) => {
        const id = item.id.videoId;
        const stats = statsMap[id];
        const viewCount = parseInt(stats?.statistics?.viewCount || 0);
        const likeCount = parseInt(stats?.statistics?.likeCount || 0);
        const publishedAt = item.snippet.publishedAt;
        const rawDuration = stats?.contentDetails?.duration || "";
        return {
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          views: fmtViews(viewCount),
          viewCount, likeCount,
          duration: fmtDuration(rawDuration),
          durationSecs: durationSecs(rawDuration),
          publishedAt,
          publishedAgo: timeAgo(publishedAt),
          thumbnail: item.snippet.thumbnails?.medium?.url || "",
          url: `https://www.youtube.com/watch?v=${id}`,
        };
      }).filter((v) => {
        if (type === "video")  return v.durationSecs > 62;
        if (type === "shorts") return v.durationSecs <= 62;
        return true;
      });

      setRes(results);
    } catch { setSearchErr("Search failed — check your connection and try again."); }
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

      {searchErr && <p style={{ color: "#f87171", fontSize: 13, margin: "8px 0" }}>⚠ {searchErr}</p>}
      {done && !loading && !searchErr && res.length === 0 && <p style={{ color: "#64748b", fontSize: 13 }}>No results — try a different query or filters.</p>}
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
function ResearchTab({ project, update }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Topic & Focus" icon="📈">
        <Fld label="Working Title"><TInput value={project.title} onChange={(v) => update("title", v)} placeholder="Untitled Video" /></Fld>
        <Fld label="Niche / Main Topic" mt={12}>
          <TInput value={project.niche} onChange={(v) => update("niche", v)} placeholder="e.g., Backpacking, Tech Reviews…" />
        </Fld>
        {project.contentType === "short" ? (
          <Fld label="Target Duration (seconds)" mt={12}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="range" min={15} max={60} step={5} value={project.videoLength || 30} onChange={(e) => update("videoLength", +e.target.value)} style={{ flex: 1, accentColor: "#a855f7" }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: "#a855f7", minWidth: 50, textAlign: "right" }}>{project.videoLength || 30}s</span>
            </div>
          </Fld>
        ) : (
          <Fld label="Target Video Length (minutes)" mt={12}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="range" min={1} max={120} step={1} value={project.videoLength || 10} onChange={(e) => update("videoLength", +e.target.value)} style={{ flex: 1, accentColor: "#2563eb" }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: "#93c5fd", minWidth: 50, textAlign: "right" }}>{project.videoLength || 10} min</span>
            </div>
          </Fld>
        )}
        <Fld label="Notes / Angles / Handles" mt={12}>
          <TArea value={project.notes || ""} onChange={(v) => update("notes", v)} rows={3} placeholder="Notes, angles, channel handles, why this would work…" />
        </Fld>
        <Fld label="Target Publish Date" mt={12}>
          <input type="date" value={project.publishDate || ""} onChange={(e) => update("publishDate", e.target.value)} style={{ border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", fontSize: 14, width: "100%", boxSizing: "border-box", background: "#0f172a", color: project.publishDate ? "#ffffff" : "#64748b", colorScheme: "dark" }} />
        </Fld>
      </Card>
      <Card title="Keywords" icon="🏷️">
        <KwInput keywords={project.keywords} onChange={(v) => update("keywords", v)} />
      </Card>
      <Card title="Competitor Videos" icon="👁️">
        {project.competitors.map((c, i) => (
          <div key={c.id || i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < project.competitors.length - 1 ? "1px solid #1e293b" : "none" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {c.thumbnail ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                  <img src={c.thumbnail} alt="" style={{ width: 140, aspectRatio: "16/9", borderRadius: 6, objectFit: "cover", border: "1px solid #334155", display: "block" }} />
                </a>
              ) : (
                <div style={{ width: 140, aspectRatio: "16/9", borderRadius: 6, background: "#1e293b", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #334155" }}>
                  <span style={{ fontSize: 20 }}>🎬</span>
                </div>
              )}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <TInput value={c.title} onChange={(v) => { const a = [...project.competitors]; a[i] = { ...a[i], title: v }; update("competitors", a); }} placeholder="Video title" />
                <TInput value={c.url} onChange={(v) => { const a = [...project.competitors]; a[i] = { ...a[i], url: v }; update("competitors", a); }} placeholder="YouTube URL" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <TInput value={c.views} onChange={(v) => { const a = [...project.competitors]; a[i] = { ...a[i], views: v }; update("competitors", a); }} placeholder="Views" />
                  <TInput value={c.why} onChange={(v) => { const a = [...project.competitors]; a[i] = { ...a[i], why: v }; update("competitors", a); }} placeholder="Why it worked?" />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => { const a = [...project.competitors]; a.splice(i, 1); update("competitors", a); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 12, padding: "2px 6px" }}>✕ Remove</button>
                </div>
              </div>
            </div>
          </div>
        ))}
        <button onClick={() => update("competitors", [...project.competitors, { id: crypto.randomUUID(), title: "", url: "", views: "", why: "", thumbnail: "" }])} style={{ background: "none", border: "1px dashed #64748b", borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: "#94a3b8", fontSize: 13, width: "100%" }}>+ Add Manually</button>
      </Card>
    </div>
  );
}

/* ── Tab: Thumbnail ── */
function ThumbnailTab({ project, update }) {
  const fileRef = useRef();
  function upload(e) { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => update("thumbnailImageUrl", ev.target.result); r.readAsDataURL(f); }
  const competitorThumbs = (project.competitors || []).filter((c) => c.thumbnail);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Your Thumbnail" icon="🖼️">
        {project.thumbnailImageUrl ? (
          <div>
            <img src={project.thumbnailImageUrl} alt="" style={{ width: "100%", borderRadius: 10, border: "2px solid #334155", display: "block" }} />
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
      {competitorThumbs.length > 0 && (
        <Card title="Competitor Thumbnails" icon="👁️">
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px" }}>Use these as inspiration for your own thumbnail design.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {competitorThumbs.map((c, i) => (
              <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", textDecoration: "none" }}>
                <img src={c.thumbnail} alt={c.title} style={{ width: "100%", aspectRatio: "16/9", borderRadius: 8, objectFit: "cover", border: "1px solid #334155", display: "block" }} />
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{c.title}</div>
              </a>
            ))}
          </div>
        </Card>
      )}
      <Card title="Concept Planning" icon="💡">
        <Fld label="Concept Description"><TArea value={project.thumbnailConcept} onChange={(v) => update("thumbnailConcept", v)} rows={3} placeholder="Describe your thumbnail idea…" /></Fld>
      </Card>
      <Card title="Text Hook / Overlay" icon="💬">
        <Fld label="Hook Text"><TInput value={project.thumbnailHook} onChange={(v) => update("thumbnailHook", v)} placeholder="e.g., 'I WAS WRONG', 'Never Do This'" /></Fld>
      </Card>
    </div>
  );
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
function toDocPreviewUrl(url) {
  if (!url) return "";
  // Convert any Google Doc URL variant to /preview for embedding
  return url.replace(/\/(edit|view|pub)(\?.*)?$/, "/preview");
}

function ScriptTab({ project, update }) {
  const isMobile = useIsMobile();
  const [showEmbed, setShowEmbed] = useState(false);
  const [showDocContent, setShowDocContent] = useState(false);
  const [docInput, setDocInput] = useState("");
  const [docUploading, setDocUploading] = useState(false);
  const [docErr, setDocErr] = useState("");
  const docFileRef = useRef();

  async function handleDocUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setDocErr("File too large — max 10 MB."); e.target.value = ""; return; }
    setDocUploading(true);
    setDocErr("");
    try {
      if (file.name.match(/\.(txt|md)$/i)) {
        const text = await file.text();
        update("scriptDocContent", text);
        update("scriptDocName", file.name);
        setShowDocContent(true);
      } else if (file.name.match(/\.docx$/i)) {
        const mammoth = (await import("mammoth")).default;
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        update("scriptDocContent", result.value);
        update("scriptDocName", file.name);
        setShowDocContent(true);
      } else {
        setDocErr("Unsupported file type — use .txt, .md, or .docx.");
      }
    } catch (e) {
      console.warn("Vid Planner: file upload failed –", e);
      setDocErr("Failed to read file — please try again.");
    }
    setDocUploading(false);
    e.target.value = "";
  }
  const [newSec, setNewSec] = useState({ name: '', duration: '' });
  const isShort = project.contentType === "short";
  const vidLen = project.videoLength || (isShort ? 30 : 10);
  const sections = project.outlineSections || [];
  function addSection() {
    if (!newSec.name.trim()) return;
    update("outlineSections", [...sections, { id: crypto.randomUUID(), name: newSec.name, duration: newSec.duration, notes: '' }]);
    setNewSec({ name: '', duration: '' });
  }
  function deleteSection(id) { update("outlineSections", sections.filter((s) => s.id !== id)); }
  function updateSection(id, field, val) { update("outlineSections", sections.map((s) => s.id === id ? { ...s, [field]: val } : s)); }
  const totalMins = calcTotalMins(sections);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Linked Document" icon="📄">
        {/* ── URL section ── */}
        {!project.scriptDocUrl ? (
          <div
            onDrop={(e) => { e.preventDefault(); const url = (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain")).trim(); if (url) update("scriptDocUrl", url); }}
            onDragOver={(e) => e.preventDefault()}
            style={{ border: "2px dashed #334155", borderRadius: 12, padding: "20px 16px", textAlign: "center", background: "#0f172a", marginBottom: 10 }}
          >
            <div style={{ fontSize: 26, marginBottom: 6 }}>🔗</div>
            <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 10px" }}>Drag a Google Doc browser tab here, or paste the link</p>
            <div style={{ display: "flex", gap: 8 }}>
              <TInput value={docInput} onChange={setDocInput} placeholder="https://docs.google.com/document/d/…" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && docInput.trim()) { update("scriptDocUrl", docInput.trim()); setDocInput(""); } }} />
              <Btn sm onClick={() => { if (docInput.trim()) { update("scriptDocUrl", docInput.trim()); setDocInput(""); } }}>Link</Btn>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#64748b", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{project.scriptDocUrl}</span>
              <Btn sm onClick={() => window.open(project.scriptDocUrl, "_blank")}>Open ↗</Btn>
              <Btn sm color="gray" onClick={() => setShowEmbed((s) => !s)}>{showEmbed ? "Hide" : "Preview"}</Btn>
              <Btn sm color="gray" onClick={() => { update("scriptDocUrl", ""); setShowEmbed(false); }}>Remove</Btn>
            </div>
            {showEmbed && <iframe src={toDocPreviewUrl(project.scriptDocUrl)} title="Linked document" style={{ width: "100%", height: isMobile ? 400 : 600, border: "1px solid #334155", borderRadius: 10, marginTop: 10 }} allow="clipboard-read; clipboard-write" />}
          </div>
        )}

        {/* ── Upload section ── */}
        <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12, marginTop: project.scriptDocUrl ? 12 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>OR UPLOAD A FILE</div>
          {!project.scriptDocContent ? (
            <div>
              <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>Export your Google Doc as .docx or .txt, then upload it here to read it inside the app.</p>
              <input ref={docFileRef} type="file" accept=".txt,.md,.docx" style={{ display: "none" }} onChange={handleDocUpload} />
              <Btn sm color="gray" disabled={docUploading} onClick={() => docFileRef.current?.click()}>{docUploading ? "Reading…" : "📂 Upload .docx / .txt"}</Btn>
              {docErr && <p style={{ color: "#f87171", fontSize: 12, margin: "8px 0 0" }}>⚠ {docErr}</p>}
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#93c5fd", fontWeight: 600 }}>📄 {project.scriptDocName}</span>
                <Btn sm color="gray" onClick={() => setShowDocContent((s) => !s)}>{showDocContent ? "Hide" : "Read"}</Btn>
                <Btn sm color="gray" onClick={() => update("scriptBody", project.scriptDocContent)}>Use as script</Btn>
                <Btn sm color="gray" onClick={() => docFileRef.current?.click()}>Replace</Btn>
                <Btn sm color="red" onClick={() => { update("scriptDocContent", ""); update("scriptDocName", ""); setShowDocContent(false); }}>Remove</Btn>
              </div>
              <input ref={docFileRef} type="file" accept=".txt,.md,.docx" style={{ display: "none" }} onChange={handleDocUpload} />
              {showDocContent && (
                <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 16, maxHeight: 500, overflowY: "auto" }}>
                  <pre style={{ fontSize: 13, color: "#cbd5e1", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.8, fontFamily: "'Courier New', monospace" }}>{project.scriptDocContent}</pre>
                </div>
              )}
            </div>
          )}
        </div>
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
              <button onClick={() => deleteSection(s.id)} aria-label="Delete section" style={{ background: "none", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>
            <TArea value={s.notes} onChange={(v) => updateSection(s.id, "notes", v)} rows={2} placeholder="Key points for this section…" />
          </div>
        ))}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          <input value={newSec.name} onChange={(e) => setNewSec((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addSection()} placeholder="Section name (e.g., Problem, Solution)" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
          <input value={newSec.duration} onChange={(e) => setNewSec((p) => ({ ...p, duration: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addSection()} placeholder="Duration (e.g., 3 min)" style={{ ...inputStyle, width: isMobile ? "100%" : 150 }} />
        </div>
        <button onClick={addSection} style={{ width: "100%", marginTop: 8, padding: "9px 0", background: "#0f172a", border: "1px dashed #334155", borderRadius: 8, color: "#64748b", fontSize: 13, cursor: "pointer" }}>+ Add Section</button>
        <div style={{ borderTop: "1px solid #1e293b", marginTop: 16, paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 8 }}>📣 CALL TO ACTION</div>
          <TInput value={project.cta} onChange={(v) => update("cta", v)} placeholder="Your CTA… e.g., Subscribe and check out my next video on…" />
        </div>
      </Card>
      <Card title="Full Script" icon="📝">
        <TArea value={project.scriptBody} onChange={(v) => update("scriptBody", v)} rows={14} placeholder="Write your script here…" style={{ fontFamily: "'Courier New',monospace", fontSize: 13 }} />
      </Card>
    </div>
  );
}

/* ── Tab: Filming ── */
function FilmingTab({ project, update }) {
  const isMobile = useIsMobile();
  const shots = project.shotList || [];
  function addShot() { update("shotList", [...shots, { id: crypto.randomUUID(), text: "", done: false }]); }
  function updateShot(id, field, val) { update("shotList", shots.map((s) => s.id === id ? { ...s, [field]: val } : s)); }
  function deleteShot(id) { update("shotList", shots.filter((s) => s.id !== id)); }
  const doneCount = shots.filter((s) => s.done).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title="Filming Details" icon="🎬">
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <Fld label="Filming Date">
            <input type="date" value={project.filmingDate || ""} onChange={(e) => update("filmingDate", e.target.value)} style={{ border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", fontSize: 14, width: "100%", boxSizing: "border-box", background: "#0f172a", color: project.filmingDate ? "#ffffff" : "#64748b", colorScheme: "dark" }} />
          </Fld>
          <Fld label="Location">
            <TInput value={project.filmingLocation || ""} onChange={(v) => update("filmingLocation", v)} placeholder="e.g., Home studio, outdoor trail…" />
          </Fld>
        </div>
        <Fld label="Equipment" mt={12}>
          <TInput value={project.filmingEquipment || ""} onChange={(v) => update("filmingEquipment", v)} placeholder="e.g., Sony A7IV, DJI Osmo, Rode mic…" />
        </Fld>
        <Fld label="Filming Notes" mt={12}>
          <TArea value={project.filmingNotes || ""} onChange={(v) => update("filmingNotes", v)} rows={3} placeholder="Lighting setup, wardrobe, reminders for the shoot…" />
        </Fld>
      </Card>
      <Card title="Shot List" icon="🎥" action={shots.length > 0 && <span style={{ fontSize: 12, color: "#64748b" }}>{doneCount}/{shots.length} done</span>}>
        {shots.length === 0 && <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 12px" }}>No shots yet — add the key clips you need to capture.</p>}
        {shots.map((shot) => (
          <div key={shot.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <input type="checkbox" checked={shot.done} onChange={(e) => updateShot(shot.id, "done", e.target.checked)} style={{ accentColor: "#2563eb", width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
            <TInput value={shot.text} onChange={(v) => updateShot(shot.id, "text", v)} placeholder="Describe the shot…" style={{ flex: 1, textDecoration: shot.done ? "line-through" : "none", color: shot.done ? "#475569" : "#ffffff" }} />
            <button onClick={() => deleteShot(shot.id)} aria-label="Delete shot" style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16, padding: "0 2px", flexShrink: 0 }}>×</button>
          </div>
        ))}
        <button onClick={addShot} style={{ background: "none", border: "1px dashed #334155", borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: "#94a3b8", fontSize: 13, width: "100%", marginTop: 4 }}>+ Add Shot</button>
        {doneCount === shots.length && shots.length > 0 && (
          <div style={{ marginTop: 12, background: "#052e16", border: "1px solid #166534", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#4ade80", fontWeight: 600 }}>✅ All shots captured!</div>
        )}
      </Card>
    </div>
  );
}

/* ── Tab: Finish ── */
function FinishTab({ project, update }) {
  const isMobile = useIsMobile();
  const [checks, setChecks] = useState(Array(7).fill(false));
  const [justPublished, setJustPublished] = useState(false);
  function markPublished() {
    update("stage", "Published");
    setJustPublished(true);
    setTimeout(() => setJustPublished(false), 2000);
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
      <Card title="Video Titles" icon="🏷️">
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
      </Card>
      <Card title="Description" icon="📄">
        <TArea value={project.metaDescription} onChange={(v) => update("metaDescription", v)} rows={6} placeholder="Your YouTube description…" />
      </Card>
      <Card title="Tags" icon="🔖">
        {project.metaTags?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {project.metaTags.map((t, i) => (
              <span key={i} style={{ background: "#1e3a5f", color: "#93c5fd", padding: "3px 10px", borderRadius: 20, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                {t}<button onClick={() => update("metaTags", project.metaTags.filter((_, j) => j !== i))} aria-label={`Remove tag ${t}`} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", padding: 0, fontSize: 13 }}>×</button>
              </span>
            ))}
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
          <Btn color="green" onClick={justPublished ? undefined : markPublished}>
            {justPublished ? "✓ Published!" : "🎉 Mark as Published"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

/* ── Project Page ── */
function ProjectPage({ project, onUpdate, onBack, onDelete }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(0);
  const TABS = [{ label: "Research", icon: "🔍" }, { label: "Thumbnail", icon: "🖼️" }, { label: "Script", icon: "📝" }, { label: "Filming", icon: "🎬" }, { label: "Finish", icon: "🚀" }];
  function update(field, value) { onUpdate({ ...project, [field]: value, isPlaceholder: false }); }
  const [delConfirm, setDelConfirm] = useState(false);
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      {/* Top bar */}
      <div style={{ background: "#1e293b", borderBottom: "1px solid #334155", padding: isMobile ? "0 12px" : "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
          <button onClick={onBack} style={{ background: "#1a2234", border: "1px solid #334155", borderRadius: 8, color: "#93c5fd", fontSize: isMobile ? 13 : 13, cursor: "pointer", padding: "5px 10px", fontWeight: 600, flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>🏠 {!isMobile && "Home"}</button>
          {!isMobile && <span style={{ color: "#475569" }}>/</span>}
          <span style={{ fontWeight: 700, fontSize: isMobile ? 13 : 15, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.title}</span>
          <Badge stage={project.stage} sm />
          {project.contentType === "short" && <span style={{ background: "#2e1065", color: "#a855f7", borderRadius: 20, padding: "2px 7px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>📱 SHORT</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <select value={project.stage} onChange={(e) => update("stage", e.target.value)} style={{ border: "1px solid #334155", borderRadius: 8, padding: "6px 10px", fontSize: 12, background: "#1a2234", color: "#ffffff" }}>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button onClick={() => setDelConfirm(true)} aria-label="Delete project" style={{ background: "none", border: "1px solid #7f1d1d", borderRadius: 8, padding: "5px 10px", color: "#f87171", fontSize: 13, cursor: "pointer" }}>🗑</button>
          {delConfirm && <ConfirmModal message="Delete this project? This cannot be undone." onConfirm={() => { setDelConfirm(false); onDelete(); }} onCancel={() => setDelConfirm(false)} />}
        </div>
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
            {tab === 0 && <ResearchTab project={project} update={update} />}
            {tab === 1 && <ThumbnailTab project={project} update={update} />}
            {tab === 2 && <ScriptTab project={project} update={update} />}
            {tab === 3 && <FilmingTab project={project} update={update} />}
            {tab === 4 && <FinishTab project={project} update={update} />}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, paddingTop: 16, borderTop: "1px solid #1e293b" }}>
              <button onClick={() => setTab((t) => Math.max(0, t - 1))} disabled={tab === 0} style={{ background: tab === 0 ? "transparent" : "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "10px 20px", color: tab === 0 ? "#334155" : "#94a3b8", fontSize: 13, fontWeight: 600, cursor: tab === 0 ? "default" : "pointer" }}>← Previous</button>
              <span style={{ fontSize: 12, color: "#475569" }}>{tab + 1} / {TABS.length}</span>
              <button onClick={() => setTab((t) => Math.min(TABS.length - 1, t + 1))} disabled={tab === TABS.length - 1} style={{ background: tab === TABS.length - 1 ? "transparent" : "#2563eb", border: "1px solid " + (tab === TABS.length - 1 ? "#334155" : "#2563eb"), borderRadius: 10, padding: "10px 20px", color: tab === TABS.length - 1 ? "#334155" : "#ffffff", fontSize: 13, fontWeight: 600, cursor: tab === TABS.length - 1 ? "default" : "pointer" }}>Next →</button>
            </div>
          </div>
        </div>
      ) : (
        /* Desktop: left sidebar + content */
        <div style={{ display: "flex", minHeight: "calc(100vh - 56px)" }}>
          <div style={{ width: 210, background: "#1e293b", borderRight: "1px solid #334155", padding: "24px 14px", flexShrink: 0, position: "sticky", top: 56, height: "calc(100vh - 56px)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#93c5fd", letterSpacing: "0.08em", padding: "0 10px", marginBottom: 10 }}>SECTIONS</div>
            {TABS.map((t, i) => (
              <button key={t.label} onClick={() => setTab(i)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "11px 14px", border: "none", borderRadius: 10, cursor: "pointer", background: tab === i ? "#1e3a5f" : "transparent", color: tab === i ? "#93c5fd" : "#94a3b8", fontWeight: tab === i ? 600 : 500, fontSize: 14, marginBottom: 3, textAlign: "left" }}>
                <span style={{ fontSize: 17 }}>{t.icon}</span>{t.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "11px 14px", border: "none", borderRadius: 10, cursor: "pointer", background: "transparent", color: "#64748b", fontWeight: 500, fontSize: 14, textAlign: "left" }}>
              <span style={{ fontSize: 17 }}>🏠</span>Home
            </button>
          </div>
          <div style={{ flex: 1, padding: "32px 40px", minWidth: 0, maxWidth: 1100 }}>
            {tab === 0 && <ResearchTab project={project} update={update} />}
            {tab === 1 && <ThumbnailTab project={project} update={update} />}
            {tab === 2 && <ScriptTab project={project} update={update} />}
            {tab === 3 && <FilmingTab project={project} update={update} />}
            {tab === 4 && <FinishTab project={project} update={update} />}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 36, paddingTop: 20, borderTop: "1px solid #1e293b" }}>
              <button onClick={() => setTab((t) => Math.max(0, t - 1))} disabled={tab === 0} style={{ background: tab === 0 ? "transparent" : "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "10px 24px", color: tab === 0 ? "#334155" : "#94a3b8", fontSize: 14, fontWeight: 600, cursor: tab === 0 ? "default" : "pointer" }}>← Previous</button>
              <span style={{ fontSize: 12, color: "#475569" }}>{TABS[tab].icon} {TABS[tab].label} · {tab + 1} / {TABS.length}</span>
              <button onClick={() => setTab((t) => Math.min(TABS.length - 1, t + 1))} disabled={tab === TABS.length - 1} style={{ background: tab === TABS.length - 1 ? "transparent" : "#2563eb", border: "1px solid " + (tab === TABS.length - 1 ? "#334155" : "#2563eb"), borderRadius: 10, padding: "10px 24px", color: tab === TABS.length - 1 ? "#334155" : "#ffffff", fontSize: 14, fontWeight: 600, cursor: tab === TABS.length - 1 ? "default" : "pointer" }}>Next →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── New Project Type Modal ── */
function NewProjectModal({ onSelect, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 20, padding: 28, maxWidth: 420, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 18, fontWeight: 700, color: "#ffffff", margin: "0 0 6px" }}>New Project</h2>
        <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 20px" }}>What type of content are you making?</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <button onClick={() => onSelect("long")} style={{ background: "#0f172a", border: "2px solid #334155", borderRadius: 14, padding: "20px 14px", cursor: "pointer", textAlign: "center", transition: "border-color .15s" }} onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3b82f6")} onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#334155")}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#ffffff", marginBottom: 4 }}>Long Form</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>YouTube videos, tutorials, vlogs</div>
          </button>
          <button onClick={() => onSelect("short")} style={{ background: "#0f172a", border: "2px solid #334155", borderRadius: 14, padding: "20px 14px", cursor: "pointer", textAlign: "center", transition: "border-color .15s" }} onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#a855f7")} onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#334155")}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#ffffff", marginBottom: 4 }}>Short Form</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>YouTube Shorts, Reels, TikToks</div>
          </button>
        </div>
        <button onClick={onClose} style={{ marginTop: 16, width: "100%", background: "none", border: "1px solid #334155", borderRadius: 8, padding: "8px 0", color: "#64748b", fontSize: 13, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

/* ── Project Card ── */
function PCard({ project, onClick, onDelete, onMoveToIdeas }) {
  const [delConfirm, setDelConfirm] = useState(false);
  return (
    <div onClick={onClick} draggable onDragStart={(e) => { e.dataTransfer.setData("projectId", project.id); e.dataTransfer.effectAllowed = "move"; }} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 14, padding: 16, cursor: "pointer", transition: "box-shadow .15s" }} onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 14px rgba(109,40,217,.12)")} onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}>
    {delConfirm && <ConfirmModal message="Delete this project? This cannot be undone." onConfirm={() => { setDelConfirm(false); onDelete(); }} onCancel={() => setDelConfirm(false)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Badge stage={project.stage} sm />
          {project.contentType === "short" && <span style={{ background: "#2e1065", color: "#a855f7", borderRadius: 20, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>📱 SHORT</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {onMoveToIdeas && <button onClick={(e) => { e.stopPropagation(); onMoveToIdeas(); }} aria-label="Move to Idea Vault" title="Move to Idea Vault" style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 14, padding: 0 }}>💡</button>}
          <button onClick={(e) => { e.stopPropagation(); setDelConfirm(true); }} aria-label="Delete project" style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 18, padding: 0 }}>×</button>
        </div>
      </div>
      {project.thumbnailImageUrl && <div style={{ width: "100%", aspectRatio: "16/9", borderRadius: 7, marginBottom: 7, overflow: "hidden" }}><img src={project.thumbnailImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", background: "#0f172a" }} /></div>}
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
  const [deleteIdeaId, setDeleteIdeaId] = useState(null);
  const [promotePending, setPromotePending] = useState(null);
  const [visibleCount, setVisibleCount] = useState(5);

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
  function promoteToProject(idea) { setPromotePending(idea); }
  function doPromote(idea, contentType) {
    const p = blankProject(contentType);
    p.title = idea.title;
    p.niche = idea.tags?.join(", ") || "";
    p.notes = idea.notes || "";
    const updated = [p, ...projects];
    setProjects(updated);
    saveProjectsData(updated);
    deleteIdea(idea.id);
    setEditId(p.id);
    setPage("Project");
    setPromotePending(null);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ideas.filter((idea) => {
      if (filter !== "All" && idea.priority !== filter) return false;
      if (q && !idea.title.toLowerCase().includes(q) && !(idea.notes || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ideas, filter, search]);

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
      {deleteIdeaId && <ConfirmModal message="Delete this idea? This cannot be undone." onConfirm={() => { deleteIdea(deleteIdeaId); setDeleteIdeaId(null); }} onCancel={() => setDeleteIdeaId(null)} />}
      {promotePending && <NewProjectModal onSelect={(ct) => doPromote(promotePending, ct)} onClose={() => setPromotePending(null)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: isMobile ? 20 : 26, fontWeight: 700, margin: 0, color: "#ffffff" }}>💡 Idea Vault</h1>
          <p style={{ color: "#94a3b8", margin: "3px 0 0", fontSize: 13 }}>{ideas.length} ideas saved · drag to reorder</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Btn onClick={addIdea} sm={isMobile}>+ New Idea</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <TInput value={search} onChange={setSearch} placeholder="Search ideas…" style={{ width: isMobile ? "100%" : 220 }} />
        {["All", ...IDEA_PRIORITIES].map((p) => (
          <button key={p} onClick={() => setFilter(p)} style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid #334155", cursor: "pointer", fontSize: 12, fontWeight: 500, background: filter === p ? "#1e3a5f" : "#1e293b", color: filter === p ? "#93c5fd" : "#94a3b8" }}>{p}</button>
        ))}
      </div>
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 0", color: "#64748b" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>💡</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8" }}>{ideas.length === 0 ? "No ideas yet" : "No matching ideas"}</p>
          <p style={{ fontSize: 13 }}>{ideas.length === 0 ? "Click \"+ New Idea\" to add your first idea" : "Try a different filter"}</p>
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
                    <Btn sm color="red" onClick={() => setDeleteIdeaId(idea.id)}>Delete</Btn>
                  </div>
                </div>
              ) : (
                <div onClick={() => setEditingId(idea.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#93c5fd", background: "#1e3a5f", padding: "2px 8px", borderRadius: 20 }}>{idea.priority}</span>
                        {idea.tags?.map((t, i) => <span key={i} style={{ fontSize: 10, color: "#94a3b8", background: "#1e293b", padding: "2px 6px", borderRadius: 10 }}>{t}</span>)}
                      </div>
                      <h4 style={{ fontSize: 14, fontWeight: 600, margin: "4px 0 2px", color: "#ffffff" }}>{idea.title || "Untitled idea"}</h4>
                      {idea.notes && <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>{idea.notes}</p>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); promoteToProject(idea); }} style={{ background: "#1e3a5f", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, color: "#93c5fd", fontWeight: 600, whiteSpace: "nowrap", marginLeft: 10, flexShrink: 0 }}>🚀 Promote</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: show more or generate more */}
      {filtered.length > visibleCount && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button onClick={() => setVisibleCount((v) => v + 5)} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "10px 24px", cursor: "pointer", fontSize: 13, color: "#94a3b8", fontFamily: "Sora,sans-serif" }}>
            Show 5 More ({filtered.length - visibleCount} hidden)
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Home Page ── */
function HomePage({ projects, setProjects, setPage, setEditId, ideas, setIdeas }) {
  const [cm, setCm] = useState(new Date().getMonth());
  const [cy, setCy] = useState(new Date().getFullYear());
  const [rs, setRs] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState(null);
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
  function createNew(contentType) {
    const p = blankProject(contentType);
    const u = [p, ...projects];
    setProjects(u);
    saveProjectsData(u);
    setEditId(p.id);
    setPage("Project");
    setShowTypeModal(false);
  }
  function reschedule(id, date) {
    const u = projects.map((p) => (p.id === id ? { ...p, publishDate: date } : p));
    setProjects(u);
    saveProjectsData(u);
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
  const inProg = projects.filter((p) => p.stage !== "Published" && !p.isPlaceholder);
  const pub = projects.filter((p) => p.stage === "Published");
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "16px 14px 80px" : "32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: isMobile ? 20 : 26, fontWeight: 700, margin: 0, color: "#ffffff" }}>Video Workflow</h1>
          <p style={{ color: "#94a3b8", margin: "3px 0 0", fontSize: 13 }}>Research, plan, and launch your YouTube videos</p>
        </div>
        <Btn onClick={() => setShowTypeModal(true)} sm={isMobile}>+ New Project</Btn>
      </div>
      {showTypeModal && <NewProjectModal onSelect={createNew} onClose={() => setShowTypeModal(false)} />}
      {deleteProjectId && <ConfirmModal message="Delete this project? This cannot be undone." onConfirm={() => { const u = projects.filter((x) => x.id !== deleteProjectId); setProjects(u); saveProjectsData(u); if (rs?.id === deleteProjectId) setRs(null); setDeleteProjectId(null); }} onCancel={() => setDeleteProjectId(null)} />}
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
            <button onClick={() => { let m = cm - 1, y = cy; if (m < 0) { m = 11; y--; } setCm(m); setCy(y); }} aria-label="Previous month" style={{ background: "none", border: "1px solid #334155", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>‹</button>
            <span style={{ fontWeight: 600, minWidth: 110, textAlign: "center", fontSize: 13 }}>{MONTHS[cm]} {cy}</span>
            <button onClick={() => { let m = cm + 1, y = cy; if (m > 11) { m = 0; y++; } setCm(m); setCy(y); }} aria-label="Next month" style={{ background: "none", border: "1px solid #334155", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>›</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 2 }}>
          {DAYS.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "#64748b", padding: "3px 0" }}>{isMobile ? d[0] : d}</div>)}
          {cells.map((day, i) => {
            const hits = day ? pod(day) : [];
            const today = day && new Date().getDate() === day && new Date().getMonth() === cm && new Date().getFullYear() === cy;
            const isOver = dragOverDay === day;
            return (
              <div key={i} onDragOver={(e) => { if (day) { e.preventDefault(); setDragOverDay(day); } }} onDragLeave={() => setDragOverDay(null)} onDrop={(e) => day && handleCalendarDrop(e, day)}
                style={{ minHeight: 52, padding: 3, borderRadius: 5, background: isOver ? "#1e3a5f" : day ? "#1a2234" : "transparent", border: isOver ? "2px dashed #3b82f6" : "2px solid transparent", transition: "all .15s", overflow: "hidden", minWidth: 0 }}>
                {day && <div style={{ fontSize: 12, fontWeight: today ? 700 : 400, color: today ? "#fff" : "#cbd5e1", background: today ? "#2563eb" : "transparent", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2, flexShrink: 0 }}>{day}</div>}
                {hits.map((p) => (
                  <div key={p.id} draggable onDragStart={(e) => { e.dataTransfer.setData("projectId", p.id); e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); }} onClick={() => open(p.id)} onContextMenu={(e) => { e.preventDefault(); setRs({ id: p.id, x: e.clientX, y: e.clientY }); }}
                    style={{ background: SC[p.stage]?.bg || "#1e3a5f", color: SC[p.stage]?.text || "#93c5fd", fontSize: 9, fontWeight: 600, borderRadius: 3, padding: "1px 3px", cursor: "grab", overflow: "hidden", marginBottom: 1, maxWidth: "100%", display: "flex", alignItems: "center", gap: 2 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.title}</span>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteProjectId(p.id); }} aria-label={`Delete ${p.title}`} style={{ background: "none", border: "none", color: "inherit", opacity: 0.7, cursor: "pointer", fontSize: 10, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
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
            <button onClick={() => setDeleteProjectId(rs.id)} style={{ marginTop: 8, width: "100%", background: "none", border: "1px solid #7f1d1d", borderRadius: 7, padding: "6px 0", color: "#f87171", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>🗑 Delete Project</button>
          </div>
        </>
      )}
      {inProg.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#cbd5e1" }}>⏳ In Progress ({inProg.length})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
            {inProg.map((p) => <PCard key={p.id} project={p} onClick={() => open(p.id)} onDelete={() => { const u = projects.filter((x) => x.id !== p.id); setProjects(u); saveProjectsData(u); }} onMoveToIdeas={() => { const idea = { ...blankIdea(), title: p.title, notes: p.niche || "", tags: (p.keywords || []).slice(0, 3) }; const updIdeas = [idea, ...ideas]; setIdeas(updIdeas); saveIdeas(updIdeas); const updProjects = projects.filter((x) => x.id !== p.id); setProjects(updProjects); saveProjectsData(updProjects); }} />)}
          </div>
        </div>
      )}
      {pub.length > 0 && (
        <div>
          <h2 style={{ fontFamily: "Sora,sans-serif", fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "#cbd5e1" }}>✅ Published ({pub.length})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
            {pub.map((p) => <PCard key={p.id} project={p} onClick={() => open(p.id)} onDelete={() => { const u = projects.filter((x) => x.id !== p.id); setProjects(u); saveProjectsData(u); }} />)}
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
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [schedule, setSchedule] = useState(() => {
    try { const s = localStorage.getItem(SK.SCHEDULE); return s ? JSON.parse(s) : { 0:"none",1:"none",2:"none",3:"none",4:"none",5:"none",6:"none" }; }
    catch { return { 0:"none",1:"none",2:"none",3:"none",4:"none",5:"none",6:"none" }; }
  });
  const [weeksAhead, setWeeksAhead] = useState(8);
  const [fillCount, setFillCount] = useState(null);
  const [deleteProjectId, setDeleteProjectId] = useState(null);

  function updateScheduleDay(dow, val) {
    const next = { ...schedule, [dow]: val };
    setSchedule(next);
    localStorage.setItem(SK.SCHEDULE, JSON.stringify(next));
  }

  function fillSchedule() {
    const today = new Date(); today.setHours(0,0,0,0);
    const end = new Date(today); end.setDate(today.getDate() + weeksAhead * 7);
    const cur = new Date(today);
    const newProjects = [];
    while (cur <= end) {
      const dow = cur.getDay();
      const type = schedule[dow];
      if (type !== "none") {
        const dateStr = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}-${String(cur.getDate()).padStart(2,"0")}`;
        const alreadyHas = projects.some((p) => p.publishDate === dateStr);
        if (!alreadyHas) {
          const p = blankProject(type);
          p.publishDate = dateStr;
          p.title = type === "short" ? "📱 Short Placeholder" : "🎬 Long Form Placeholder";
          p.isPlaceholder = true;
          newProjects.push(p);
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
    if (newProjects.length > 0) {
      const updated = [...projects, ...newProjects];
      setProjects(updated);
      saveProjectsData(updated);
    }
    setFillCount(newProjects.length);
    setTimeout(() => setFillCount(null), 3000);
  }
  const touchDragRef = useRef(null);
  const touchOverDayRef = useRef(null);
  const touchMovedRef = useRef(false);
  // Keep current reschedule/month/year in refs so document listeners never go stale
  const rescheduleRef = useRef(null);
  const monthRef = useRef(month);
  const yearRef = useRef(year);
  rescheduleRef.current = reschedule;
  monthRef.current = month;
  yearRef.current = year;

  const first = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  const cells = Array(first).fill(null).concat(Array.from({ length: total }, (_, i) => i + 1));

  useEffect(() => {
    function onMove(e) {
      if (!touchDragRef.current) return;
      e.preventDefault(); // stop page scroll while dragging
      touchMovedRef.current = true;
      const t = e.touches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const cell = el?.closest("[data-calday]");
      const day = cell ? (+cell.dataset.calday || null) : null;
      touchOverDayRef.current = day;
      setTouchOverDay(day);
    }
    function onEnd() {
      if (touchDragRef.current && touchMovedRef.current && touchOverDayRef.current) {
        rescheduleRef.current(
          touchDragRef.current,
          toDateStr(yearRef.current, monthRef.current, touchOverDayRef.current)
        );
      }
      touchDragRef.current = null;
      touchOverDayRef.current = null;
      touchMovedRef.current = false;
      setTouchOverDay(null);
    }
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    return () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, []);

  function onProjectTouchStart(projectId) {
    touchDragRef.current = projectId;
    touchMovedRef.current = false;
    touchOverDayRef.current = null;
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
    saveProjectsData(u);
  }
  function handleCalendarDrop(e, day) {
    e.preventDefault();
    setDragOverDay(null);
    const projectId = e.dataTransfer.getData("projectId");
    if (projectId && day) { reschedule(projectId, toDateStr(year, month, day)); }
  }
  const upcoming = [...projects].filter((p) => p.publishDate).sort((a, b) => a.publishDate.localeCompare(b.publishDate));
  function createNew(contentType) {
    const p = blankProject(contentType);
    const u = [p, ...projects];
    setProjects(u);
    saveProjectsData(u);
    setEditId(p.id);
    setPage("Project");
    setShowTypeModal(false);
  }
  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: isMobile ? "16px 14px 80px" : "32px 40px" }}>
      {showTypeModal && <NewProjectModal onSelect={createNew} onClose={() => setShowTypeModal(false)} />}
      {deleteProjectId && <ConfirmModal message="Delete this project? This cannot be undone." onConfirm={() => { const u = projects.filter((x) => x.id !== deleteProjectId); setProjects(u); saveProjectsData(u); if (rs?.id === deleteProjectId) setRs(null); setDeleteProjectId(null); }} onCancel={() => setDeleteProjectId(null)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: isMobile ? 20 : 26, fontWeight: 700, margin: 0, color: "#ffffff" }}>Content Calendar</h1>
          <p style={{ color: "#94a3b8", margin: "3px 0 0", fontSize: 13 }}>{projects.filter((p) => p.publishDate).length} videos scheduled · touch &amp; drag to reschedule</p>
        </div>
        <Btn onClick={() => setShowTypeModal(true)} sm={isMobile}>+ New Video</Btn>
      </div>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 18 }}>
        <div style={{ flex: 1, background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: isMobile ? 14 : 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: 17 }}>{MONTHS[month]} {year}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { let m = month - 1, y = year; if (m < 0) { m = 11; y--; } setMonth(m); setYear(y); }} aria-label="Previous month" style={{ background: "none", border: "1px solid #334155", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 15 }}>‹</button>
              <button onClick={() => { setMonth(new Date().getMonth()); setYear(new Date().getFullYear()); }} style={{ background: "none", border: "1px solid #334155", borderRadius: 6, padding: "0 10px", cursor: "pointer", fontSize: 12 }}>Today</button>
              <button onClick={() => { let m = month + 1, y = year; if (m > 11) { m = 0; y++; } setMonth(m); setYear(y); }} aria-label="Next month" style={{ background: "none", border: "1px solid #334155", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 15 }}>›</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 2 }}>
            {DAYS.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#64748b", padding: "8px 0" }}>{isMobile ? d[0] : d}</div>)}
            {cells.map((day, i) => {
              const hits = day ? pod(day) : [];
              const today = day && new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
              const isOver = dragOverDay === day || touchOverDay === day;
              return (
                <div key={i} data-calday={day || ""} onDragOver={(e) => { if (day) { e.preventDefault(); setDragOverDay(day); } }} onDragLeave={() => setDragOverDay(null)} onDrop={(e) => day && handleCalendarDrop(e, day)}
                  style={{ minHeight: isMobile ? 50 : 130, padding: isMobile ? 3 : 6, border: isOver ? "2px dashed #3b82f6" : "1px solid #1e293b", borderRadius: 6, background: isOver ? "#1e3a5f" : day ? "#1e293b" : "#1a2234", transition: "all .15s", overflow: "hidden", minWidth: 0 }}>
                  {day && <div style={{ fontSize: 13, fontWeight: today ? 700 : 400, color: today ? "#fff" : "#cbd5e1", background: today ? "#2563eb" : "transparent", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 5, flexShrink: 0 }}>{day}</div>}
                  {hits.map((p) => (
                    <div key={p.id} draggable
                      onDragStart={(e) => { e.dataTransfer.setData("projectId", p.id); e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); }}
                      onTouchStart={() => onProjectTouchStart(p.id)}
                      onClick={() => { setEditId(p.id); setPage("Project"); }}
                      style={{ background: SC[p.stage]?.bg || "#1e3a5f", color: SC[p.stage]?.text || "#93c5fd", fontSize: 11, fontWeight: 600, borderRadius: 5, padding: "4px 7px", cursor: "grab", overflow: "hidden", marginBottom: 3, border: `1px solid ${SC[p.stage]?.dot || "#3b82f6"}22`, maxWidth: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 3, boxSizing: "border-box" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.title}</span>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteProjectId(p.id); }} aria-label={`Delete ${p.title}`} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
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
              <div key={p.id} style={{ marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
                <div onClick={() => { setEditId(p.id); setPage("Project"); }} style={{ flex: 1, cursor: "pointer" }}>
                <div style={{ marginBottom: 2 }}><Badge stage={p.stage} sm /></div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#ffffff", lineHeight: 1.4 }}>{p.title}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>{parseLocalDate(p.publishDate)?.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                </div>
                <button onClick={() => setDeleteProjectId(p.id)} aria-label={`Delete ${p.title}`} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16, padding: 0, flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>
          <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, margin: "0 0 10px", color: "#cbd5e1" }}>Legend</h3>
            {STAGES.map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: SC[s].dot }} />
                <span style={{ fontSize: 12, color: "#cbd5e1" }}>{s}</span>
              </div>
            ))}
          </div>
          <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: 16 }}>
            <button onClick={() => setShowSchedulePanel((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left", padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, margin: 0, color: "#93c5fd" }}>📅 Upload Schedule</h3>
              <span style={{ color: "#64748b", fontSize: 12 }}>{showSchedulePanel ? "▲" : "▼"}</span>
            </button>
            {showSchedulePanel && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 10px" }}>Set which days you upload and what type. We'll fill in placeholders.</p>
                {[["Sun",0],["Mon",1],["Tue",2],["Wed",3],["Thu",4],["Fri",5],["Sat",6]].map(([label, dow]) => (
                  <div key={dow} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ fontSize: 12, color: "#94a3b8", width: 32 }}>{label}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[["none","–","#334155","#64748b"],["short","📱","#2e1065","#a855f7"],["long","🎬","#1e3a5f","#93c5fd"]].map(([val, icon, bg, color]) => (
                        <button key={val} onClick={() => updateScheduleDay(dow, val)} style={{ background: schedule[dow] === val ? bg : "transparent", border: `1px solid ${schedule[dow] === val ? color : "#334155"}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12, color: schedule[dow] === val ? color : "#475569", fontWeight: schedule[dow] === val ? 700 : 400 }}>{icon}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#64748b", flexShrink: 0 }}>Fill next</span>
                  <input type="number" min={1} max={52} value={weeksAhead} onChange={(e) => setWeeksAhead(+e.target.value)} style={{ width: 48, background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "4px 6px", color: "#ffffff", fontSize: 12, textAlign: "center" }} />
                  <span style={{ fontSize: 11, color: "#64748b", flexShrink: 0 }}>weeks</span>
                </div>
                <button onClick={fillSchedule} style={{ marginTop: 10, width: "100%", background: "#2563eb", border: "none", borderRadius: 8, padding: "9px 0", color: "#ffffff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Fill Calendar</button>
                {fillCount !== null && <div style={{ marginTop: 8, fontSize: 12, color: "#4ade80", textAlign: "center" }}>{fillCount === 0 ? "All slots already filled!" : `✅ Added ${fillCount} placeholders`}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Account Page ── */
function SettingsPage({ user }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: isMobile ? "20px 14px 80px" : "40px 40px" }}>
      <h1 style={{ fontFamily: "Sora,sans-serif", fontSize: 26, fontWeight: 700, margin: "0 0 28px", color: "#ffffff" }}>👤 Account</h1>
      {user && (
        <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {user.photoURL
              ? <img src={user.photoURL} alt="" style={{ width: 56, height: 56, borderRadius: "50%", flexShrink: 0 }} />
              : <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#2563eb,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{(user.displayName || user.email || "?")[0].toUpperCase()}</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff" }}>{user.displayName || "Creator"}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{user.email}</div>
              <div style={{ fontSize: 11, color: "#22c55e", marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                Synced across devices
              </div>
            </div>
            <Btn sm color="gray" onClick={signOutUser}>Sign out</Btn>
          </div>
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
        _currentUid = u.uid;
        // Sync cloud data
        try {
          const [cloudData, localP, localId, localPts] = await Promise.all([
            loadUserData(u.uid),
            stor("get", SK.PROJECTS),
            stor("get", SK.IDEAS),
            stor("get", SK.PROJECTS_TS),
          ]);
          if (cloudData) {
            // Compare timestamps — cloud uses server timestamp (Firestore Timestamp or ms number)
            const rawCloud = cloudData.projectsSavedAt;
            const cloudTs = rawCloud?.toMillis?.() ?? rawCloud ?? 0;
            const localTs = localPts || 0;
            if (localTs > cloudTs && Array.isArray(localP) && localP.length > 0) {
              // Local is newer — push it to cloud (strip thumbnails before Firestore)
              saveUserProjects(u.uid, stripThumbnails(localP)).catch((e) => console.warn("Vid Planner: cloud sync failed –", e));
              // Keep the already-loaded local state (Effect 1 already set it)
            } else {
              // Cloud is newer (or equal) — use it, but preserve any local thumbnails
              const p  = Array.isArray(cloudData.projects) ? cloudData.projects : [];
              const id = Array.isArray(cloudData.ideas)    ? cloudData.ideas    : [];
              const localThumbs = Object.fromEntries((localP || []).filter((x) => x.thumbnailImageUrl).map((x) => [x.id, x.thumbnailImageUrl]));
              const merged = p.map((proj) => localThumbs[proj.id] ? { ...proj, thumbnailImageUrl: localThumbs[proj.id] } : proj);
              setProjects(merged);
              setIdeas(id);
              await Promise.all([
                stor("set", SK.PROJECTS, merged),
                stor("set", SK.IDEAS,    id),
              ]);
            }
          } else {
            // First-time cloud sync — upload current local data (strip thumbnails)
            const ts = Date.now();
            await stor("set", SK.PROJECTS_TS, ts);
            await saveAllUserData(u.uid, {
              projects:        stripThumbnails(Array.isArray(localP)  ? localP  : []),
              ideas:           Array.isArray(localId) ? localId : [],
              projectsSavedAt: ts,
            });
          }
        } catch (e) { console.warn("Vid Planner: cloud sync failed –", e); }
      } else {
        _currentUid = null;
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    Promise.all([
      stor("get", SK.PROJECTS),
      stor("get", SK.IDEAS),
    ]).then(([p, id]) => {
      setProjects(Array.isArray(p) ? p : []);
      setIdeas(Array.isArray(id) ? id : []);
      setReady(true);
    });
  }, []);

  function updateProject(updated) {
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === updated.id ? updated : p));
      saveProjectsData(next);
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
        {page === "Home"     && <HomePage projects={projects} setProjects={setProjects} setPage={setPage} setEditId={setEditId} ideas={ideas} setIdeas={setIdeas} />}
        {page === "Calendar" && <CalendarPage projects={projects} setProjects={setProjects} setPage={setPage} setEditId={setEditId} />}
        {page === "Ideas"    && <IdeasPage ideas={ideas} setIdeas={setIdeas} setPage={setPage} setEditId={setEditId} projects={projects} setProjects={setProjects} />}
        {page === "Settings" && <SettingsPage user={user} />}
        {page === "Project"  && editProject && <ProjectPage project={editProject} onUpdate={updateProject} onBack={() => nav("Home")} onDelete={() => { setProjects((prev) => { const u = prev.filter((p) => p.id !== editProject.id); saveProjectsData(u); return u; }); nav("Home"); }} />}
      </main>
    </div>
  );
}
