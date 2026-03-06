import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '10mb' }));

/* ── Anthropic proxy ── */
const ALLOWED_MODELS = ['claude-sonnet-4-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-6', 'claude-sonnet-4-6'];
const MAX_TOKENS_LIMIT = 4000;

app.post('/api/ai', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'ANTHROPIC_API_KEY not set in .env' });
  }

  // Validate request — prevent model substitution and token abuse
  const { model, max_tokens, system, messages } = req.body;
  if (!model || !ALLOWED_MODELS.includes(model)) {
    return res.status(400).json({ error: 'Invalid model' });
  }
  if (!max_tokens || typeof max_tokens !== 'number' || max_tokens > MAX_TOKENS_LIMIT) {
    return res.status(400).json({ error: `max_tokens must be <= ${MAX_TOKENS_LIMIT}` });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages is required' });
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
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'YOUTUBE_API_KEY not set in .env' });
  }
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

function durationSecs(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0);
}

function fmtViews(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M views';
  if (n >= 1_000) return Math.round(n / 1_000) + 'K views';
  return n + ' views';
}

function fmtDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = +(m[1] || 0), min = +(m[2] || 0), s = +(m[3] || 0);
  if (h) return `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${min}:${String(s).padStart(2, '0')}`;
}

function timeAgo(str) {
  const d = Math.floor((Date.now() - new Date(str)) / 86400000);
  if (d < 1) return 'Today';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

/* ── Serve frontend in production ── */
const distPath = join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✓ TubeFlow server running on http://localhost:${PORT}`));
