# VidPlanner — YouTube Video Planner

AI-powered YouTube content planning app. Research, plan, script, and publish videos with built-in AI assistance.

## Features
- **Video Projects** — Full workflow from research to publish
- **Idea Vault** — Save, organize, and promote video ideas
- **Content Calendar** — Drag-and-drop scheduling
- **AI-Powered** — Generate outlines, scripts, titles, descriptions, tags
- **Creator Presets** — Persistent rules for AI (intro templates, banned words, tone)
- **PWA** — Installable as an app on any device

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173

## AI Configuration

The AI features require an Anthropic API key. For production, you should:

1. Create a backend API proxy (e.g., Express, Vercel serverless function)
2. Set your ANTHROPIC_API_KEY as an environment variable on the server
3. The app will call `/api/ai` which your proxy forwards to Anthropic

For local development/testing, you can temporarily set the API_KEY constant
in `src/App.jsx` (line with `const API_KEY = ""`), but NEVER deploy with
the key exposed in frontend code.

## Build for Production

```bash
npm run build
```

Output goes to `dist/` — deploy to Vercel, Netlify, or any static host.

## Android App (Google Play)

To wrap as an Android app:

1. Install Capacitor: `npm install @capacitor/core @capacitor/cli`
2. Initialize: `npx cap init VidPlanner com.vidplanner.app`
3. Add Android: `npx cap add android`
4. Build web: `npm run build`
5. Sync: `npx cap sync`
6. Open in Android Studio: `npx cap open android`
7. Build APK from Android Studio

## Tech Stack
- React 18 + Vite
- IndexedDB for local storage
- Anthropic Claude API for AI features
- PWA with vite-plugin-pwa

## TODO for Claude Code
- [ ] Generate PWA icons (icon-192.png, icon-512.png)
- [ ] Set up backend API proxy for Anthropic calls
- [ ] Add Capacitor for Android build
- [ ] Deploy to Vercel
