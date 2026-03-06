# Cloudflare Pages Deployment

## Frontend environment variable

Use `VITE_KAKAO_MAP_JS_KEY` as the primary client-side Kakao Maps key.

```env
VITE_KAKAO_MAP_JS_KEY=your_kakao_javascript_key_here
```

`VITE_NEXT_PUBLIC_KAKAO_MAP_JS_KEY` is supported only as a temporary migration bridge for older setups.

## Pages settings

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`

Set the Kakao key in both:
- `Production`
- `Preview`

If the value changes:
- redeploy the site
- if the old build still appears, run `Clear build cache` and redeploy again

## Local development

Example `.env.local`:

```env
VITE_KAKAO_MAP_JS_KEY=your_kakao_javascript_key_here
```

## Kakao Developers domain registration

Kakao Maps SDK can fail even when the key exists if the domain is not registered.

Register these Web platform domains when applicable:
- `http://localhost:5173`
- `https://whatsinhere.pages.dev`
- your custom production domain

## Runtime behavior

- Missing key: the map area shows a fallback panel instead of crashing the page
- SDK failure: the map area shows a user-safe error message
- Development mode: the fallback panel includes a more specific cause for debugging
