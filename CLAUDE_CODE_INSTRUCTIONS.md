# INSTRUCTIONS FOR CLAUDE CODE

Hey Claude Code! This is a TubeFlow project — a YouTube content planning app 
built with React + Vite. Here's what needs to happen:

## IMMEDIATE SETUP
1. Run `npm install` to install dependencies
2. Generate PWA icons (icon-192.png and icon-512.png) in the /public folder
   - Purple play button logo on gradient background matching the favicon.svg
3. Run `npm run dev` to verify it works locally

## API PROXY (REQUIRED FOR AI FEATURES)
The app calls AI (Anthropic Claude API) for generating scripts, outlines, etc.
We need a backend proxy so the API key isn't exposed in the browser:

Option A (Vercel): Create an `api/ai.js` serverless function
Option B (Express): Create a simple Express server

The proxy should:
- Accept POST requests at /api/ai
- Forward them to https://api.anthropic.com/v1/messages
- Add the x-api-key and anthropic-version headers from env vars
- Return the response

## ANDROID APP
Set up Capacitor to build an Android APK:
1. npm install @capacitor/core @capacitor/cli @capacitor/android
2. npx cap init TubeFlow com.tubeflow.app --web-dir dist
3. npx cap add android
4. npm run build && npx cap sync

## DEPLOYMENT
Deploy the web version to Vercel:
1. Connect to GitHub repo (or use Vercel CLI)
2. Set ANTHROPIC_API_KEY environment variable
3. Deploy

The user is brand new to terminal/development, so explain every step clearly.
