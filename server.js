import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { durationSecs, fmtViews, fmtDuration, timeAgo } from './src/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

/* ── Security headers ── */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

/* ── CORS — API routes only ── */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001').split(',').map((o) => o.trim());
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '100kb' }));

/* ── Simple in-memory rate limiter ── */
const rateLimitMap = new Map();
function rateLimit(key, maxPerMinute) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (rateLimitMap.get(key) || []).filter((t) => t > windowStart);
  hits.push(now);
  rateLimitMap.set(key, hits);
  return hits.length > maxPerMinute;
}
// Clean up old entries every 5 minutes
const _cleanupInterval = setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, hits] of rateLimitMap) {
    const fresh = hits.filter((t) => t > cutoff);
    if (fresh.length === 0) rateLimitMap.delete(k); else rateLimitMap.set(k, fresh);
  }
}, 300_000);

/* ── Anthropic proxy ── */
const ALLOWED_MODELS = ['claude-sonnet-4-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-6', 'claude-sonnet-4-6'];
const MAX_TOKENS_LIMIT = 4000;

app.post('/api/ai', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (rateLimit(`ai:${ip}`, 20)) return res.status(429).json({ error: 'Too many requests — slow down.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured.' });

  // Validate request — prevent model substitution and token abuse
  const { model, max_tokens, system, messages } = req.body;
  if (!model || !ALLOWED_MODELS.includes(model)) {
    return res.status(400).json({ error: 'Invalid model' });
  }
  if (!max_tokens || typeof max_tokens !== 'number' || max_tokens > MAX_TOKENS_LIMIT) {
    return res.status(400).json({ error: `max_tokens must be <= ${MAX_TOKENS_LIMIT}` });
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 10) {
    return res.status(400).json({ error: 'messages is required' });
  }
  // Validate message structure
  for (const msg of messages) {
    if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') {
      return res.status(400).json({ error: 'Invalid message format' });
    }
    if (msg.content.length > 20000) return res.status(400).json({ error: 'Message too long' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Anthropic API error: ' + err.message });
  }
});

/* ── YouTube Data API proxy ── */
app.get('/api/youtube', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (rateLimit(`yt:${ip}`, 15)) return res.status(429).json({ error: 'Too many requests — slow down.' });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'YouTube service not configured.' });
  const { q, sort = 'relevance', duration = 'any', date = 'any', type = 'any' } = req.query;
  if (!q || typeof q !== 'string') return res.status(400).json({ error: 'Missing query' });
  if (q.length > 200) return res.status(400).json({ error: 'Query too long' });

  // Whitelist enum params to prevent injection
  const validSort = ['relevance', 'viewCount', 'date', 'rating'];
  const validDuration = ['any', 'short', 'medium', 'long'];
  const validDate = ['any', 'today', 'week', 'month', 'year'];
  const validType = ['any', 'video', 'shorts', 'live', 'upcoming'];
  if (!validSort.includes(sort) || !validDuration.includes(duration) || !validDate.includes(date) || !validType.includes(type)) {
    return res.status(400).json({ error: 'Invalid filter value' });
  }

  // Content type handling
  let searchQuery = q;
  let eventTypeParam = '';
  let effectiveDuration = duration;
  if (type === 'shorts')   { searchQuery = q + ' #shorts'; effectiveDuration = 'short'; }
  if (type === 'live')     { eventTypeParam = '&eventType=live'; }
  if (type === 'upcoming') { eventTypeParam = '&eventType=upcoming'; }

  // Build publishedAfter from date filter
  let publishedAfter = '';
  if (date !== 'any') {
    const now = new Date();
    if (date === 'today')  now.setHours(0, 0, 0, 0);
    if (date === 'week')   now.setDate(now.getDate() - 7);
    if (date === 'month')  now.setMonth(now.getMonth() - 1);
    if (date === 'year')   now.setFullYear(now.getFullYear() - 1);
    publishedAfter = `&publishedAfter=${now.toISOString()}`;
  }

  const durationParam = effectiveDuration !== 'any' ? `&videoDuration=${effectiveDuration}` : '';

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=12&order=${sort}${durationParam}${eventTypeParam}${publishedAfter}&key=${apiKey}`
    );
    const searchData = await searchRes.json();

    if (searchData.error) {
      return res.status(400).json({ error: searchData.error.message });
    }
    if (!searchData.items?.length) return res.json([]);

    const ids = searchData.items.map((i) => i.id.videoId).join(',');
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
      const rawDuration = stats?.contentDetails?.duration || '';
      return {
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        views: fmtViews(viewCount),
        viewCount,
        likeCount,
        duration: fmtDuration(rawDuration),
        durationSecs: durationSecs(rawDuration),
        publishedAt,
        publishedAgo: timeAgo(publishedAt),
        thumbnail: item.snippet.thumbnails?.medium?.url || '',
        url: `https://www.youtube.com/watch?v=${id}`,
      };
    }).filter((v) => {
      // When "Videos" is selected, exclude Shorts (≤ 62 seconds)
      if (type === 'video') return v.durationSecs > 62;
      // When "Shorts" is selected, keep only short-form (≤ 62 seconds)
      if (type === 'shorts') return v.durationSecs <= 62;
      return true;
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Image generation — returns Pollinations URL for client to load directly ── */
app.get('/api/generate-image', (req, res) => {
  const { prompt } = req.query;
  if (!prompt || typeof prompt !== 'string' || prompt.length > 500) {
    return res.status(400).json({ error: 'Invalid prompt' });
  }
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (rateLimit(`img:${ip}`, 10)) return res.status(429).json({ error: 'Too many requests — slow down.' });
  const seed = Math.floor(Math.random() * 999999);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&nologo=true&seed=${seed}`;
  res.json({ url });
});

/* ── Serve frontend in production ── */
const distPath = join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`✓ Vid Planner server running on http://localhost:${PORT}`));

function shutdown() {
  clearInterval(_cleanupInterval);
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
