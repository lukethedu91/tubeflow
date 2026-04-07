/* ── Shared YouTube / time formatting utilities ── */

export function durationSecs(iso) {
  const m = (iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0);
}

export function fmtViews(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M views";
  if (n >= 1_000) return Math.round(n / 1_000) + "K views";
  return n + " views";
}

export function fmtDuration(iso) {
  const m = (iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = +(m[1] || 0), min = +(m[2] || 0), s = +(m[3] || 0);
  if (h) return `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${min}:${String(s).padStart(2, "0")}`;
}

export function timeAgo(str) {
  const d = Math.floor((Date.now() - new Date(str)) / 86400000);
  if (d < 1) return "Today";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}
