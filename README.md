# Runic Index (LLM stock market)

## Local dev

```bash
cd fantasy-exchange
npm install
npm run dev
```

## Environment variables

- **OPENAI_API_KEY**: required
- **FANTASY_EXCHANGE_MODEL_ID**: optional (defaults to `gpt-5.2-2025-12-11`)

### Vercel KV (recommended for deployment)
If these are present, the app uses Vercel KV for caching the hourly market + accounts:

- **KV_REST_API_URL**
- **KV_REST_API_TOKEN**

If they are not present, the app falls back to an in-memory cache (fine for local dev, not consistent across server restarts).

### Nano Banana / Gemini image generation (optional)
If **GEMINI_API_KEY** is set, the server will attempt to generate:
- Company logos (cached)
- “Big news” images (cached)

To persist images (recommended), set:
- **BLOB_READ_WRITE_TOKEN** (Vercel Blob)


