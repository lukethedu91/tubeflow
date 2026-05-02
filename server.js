import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Initialize Firebase Admin if credentials provided
let adminAuth = null;
let db = null;
if (process.env.FIREBASE_ADMIN_KEY) {
  try {
    const adminApp = initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY)),
    });
    adminAuth = getAuth(adminApp);
    db = getFirestore(adminApp);
  } catch (e) {
    console.warn('Firebase Admin not configured:', e.message);
  }
}

async function verifyToken(req, res, next) {
  if (!adminAuth) return next(); // Skip if not configured
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (e) {
    console.warn('Token verification failed:', e.code || e.message);
    res.status(401).json({ error: 'Invalid token' });
  }
}

/* ── Security headers ── */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.googleapis.com https://apis.google.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' https: data: blob:; " +
    "connect-src 'self' https://www.googleapis.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googletagmanager.com https://www.google-analytics.com https://pagead2.googlesyndication.com; " +
    "frame-src 'self' https://accounts.google.com https://tubeflow-12775.firebaseapp.com; " +
    "frame-ancestors 'none';"
  );
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use('/api', verifyToken);

/* ── Simple in-memory rate limiter ── */
const inMemoryLimits = new Map();
function checkInMemoryLimit(key, maxPerMinute) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (inMemoryLimits.get(key) || []).filter((t) => t > windowStart);
  hits.push(now);
  inMemoryLimits.set(key, hits);
  return hits.length > maxPerMinute;
}

// Cleanup old entries
const _cleanupInterval = setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, hits] of inMemoryLimits) {
    const fresh = hits.filter((t) => t > cutoff);
    if (fresh.length === 0) inMemoryLimits.delete(k);
    else inMemoryLimits.set(k, fresh);
  }
}, 300_000);

/* ── Image generation — returns Pollinations URL for client to load directly ── */
app.get('/api/generate-image', (req, res) => {
  const { prompt } = req.query;
  if (!prompt || typeof prompt !== 'string' || prompt.length > 500) {
    return res.status(400).json({ error: 'Invalid prompt' });
  }
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (checkInMemoryLimit(`img:${ip}`, 10)) return res.status(429).json({ error: 'Too many requests — slow down.' });
  const seed = Math.floor(Math.random() * 999999);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&nologo=true&seed=${seed}`;
  res.json({ url });
});

/* ── Firebase auth handler proxy (allows custom authDomain) ── */
app.use('/__/auth', async (req, res) => {
  const target = `https://tubeflow-12775.firebaseapp.com/__/auth${req.url}`;
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: { ...req.headers, host: 'tubeflow-12775.firebaseapp.com' },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });
    upstream.headers.forEach((val, key) => {
      if (key !== 'transfer-encoding') res.setHeader(key, val);
    });
    res.status(upstream.status);
    const buf = await upstream.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch (e) {
    console.error('Auth proxy error:', e.message);
    res.status(502).send('Auth proxy error');
  }
});

/* ── Serve frontend in production ── */
const distPath = join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

/* ── Health check ── */
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`✓ Vid Planner server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`));

function shutdown() {
  clearInterval(_cleanupInterval);
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
