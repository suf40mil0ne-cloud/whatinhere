# whatinhere

This repository is a pure static website deployed on Cloudflare Pages.

## Project Structure

- `README.md`
- `public/`
  - `index.html`
  - `about.html`
  - `privacy.html`
  - `contact.html`
- `firebase_functions/` (Firebase Functions code)

### Cloudflare Pages Deployment

Framework preset:
None

Build command:
npm run build:pages

Build output directory:
public

Production branch:
main

## Deployment (Cloudflare Pages)

This project is a static site.

Settings:

Framework preset: None  
Build command: `npm run build:pages`  
Build output directory: `public`  

Environment Variables (Cloudflare Pages > Settings > Environment variables):

- `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` (recommended)
- or `KAKAO_MAP_JS_KEY`

`npm run build:pages` writes `public/config.js` from the env var, and `public/map.js` reads that value to load Kakao Maps SDK.
