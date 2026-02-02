import { DEFAULT_MODEL_ID, getOpenAIClient } from "@/lib/openai";
import { kvGetJSON, kvSetJSON, kvTryAcquireLock } from "@/lib/storage";
import {
  LISTING_START_PRICE_MAX,
  LISTING_START_PRICE_MIN,
  MARKET_COMPANY_COUNT,
  MAX_DELISTINGS_PER_HOUR,
} from "@/lib/constants";
import { marketHourKey, marketHourLockKey } from "@/lib/profileKeys";
import { prevUtcHourKey } from "@/lib/hourKey";
import { makeSeedMarketHour } from "@/lib/marketSeed";
// NOTE: Image generation is temporarily disabled for faster iteration.
// import { generateAndStoreCompanyLogo, generateAndStoreNewsImage, imagesEnabled } from "@/lib/images";
import type { Company, MarketHourState, NewsItem } from "@/lib/types";

export const MARKET_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export class MarketGenerationError extends Error {
  raw?: string;
  constructor(message: string, opts?: { raw?: string }) {
    super(message);
    this.name = "MarketGenerationError";
    this.raw = opts?.raw;
  }
}

export async function getOrCreateMarketHour(hourKey: string): Promise<MarketHourState> {
  const key = marketHourKey(hourKey);
  const existing = await kvGetJSON<MarketHourState>(key);
  if (existing && existing.hourKey === hourKey && Array.isArray(existing.companies)) return existing;

  // Prevent stampede on the hour boundary: one generator, everyone else waits.
  // LLM calls can take 60–90s; give the lock enough TTL.
  const lock = await kvTryAcquireLock({ key: marketHourLockKey(hourKey), ttlSeconds: 180 });
  if (!lock) {
    const waited = await waitForMarketHour(key, 120_000);
    if (waited) return waited;
    throw new MarketGenerationError("Market generation in progress. Try again in a moment.");
  }

  const prevKey = prevUtcHourKey(hourKey);
  const prev = prevKey !== hourKey ? await kvGetJSON<MarketHourState>(marketHourKey(prevKey)) : null;
  // If there is no previous hour, use the baked-in seed and store it as THIS hour.
  // This avoids any LLM “first market” race and guarantees identical starting listings globally.
  const next = prev ? await generateMarketHour({ hourKey, prev }) : makeSeedMarketHour(hourKey);
  // Image generation intentionally commented out for now.
  // const withImages = await attachImages(next);
  // await kvSetJSON(key, withImages, { exSeconds: MARKET_TTL_SECONDS });
  await kvSetJSON(key, next, { exSeconds: MARKET_TTL_SECONDS });
  return next;
}

async function waitForMarketHour(key: string, timeoutMs: number): Promise<MarketHourState | null> {
  const start = Date.now();
  let delay = 400;
  while (Date.now() - start < timeoutMs) {
    const cur = await kvGetJSON<MarketHourState>(key);
    if (cur) return cur;
    await sleep(delay);
    delay = Math.min(2500, Math.round(delay * 1.35));
  }
  return null;
}

async function generateMarketHour(args: {
  hourKey: string;
  prev: MarketHourState;
}): Promise<MarketHourState> {
  const openai = getOpenAIClient();

  const prompt = buildMarketDeltaPrompt(args.hourKey, args.prev);
  const response = await openai.chat.completions.create(({
    model: DEFAULT_MODEL_ID,
    messages: [{ role: "system", content: prompt }],
    // Force JSON-only output when supported by the model.
    response_format: { type: "json_object" },
    // This response is large (25 companies + news). Give it room so we don't get truncated JSON.
    max_completion_tokens: 5200,
    reasoning_effort: DEFAULT_MODEL_ID === "gpt-5.2-2025-12-11" ? ("none" as any) : "minimal",
    verbosity: "low",
  }) as any);

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) {
    // Some model responses may omit message.content; surface it clearly so we can debug quickly.
    const msg = response.choices[0]?.message as any;
    const hint = msg ? JSON.stringify({ role: msg.role, refusal: msg.refusal, tool_calls: msg.tool_calls }) : "";
    throw new MarketGenerationError(`Market LLM returned empty content. Hint: ${hint}`.trim(), {
      raw: "",
    });
  }
  try {
    const parsed = parseMarketDeltaResponseOrThrow(raw, args.hourKey, args.prev);
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Market generation failed.";
    throw e instanceof MarketGenerationError ? e : new MarketGenerationError(msg, { raw });
  }
}

function buildMarketDeltaPrompt(hourKey: string, prev: MarketHourState): string {
  return `You are the MARKET SIMULATOR for a fictional D&D fantasy themed stock market.

Every hour, you output the next snapped market state. Players trade in real time at THIS HOUR'S snapped prices.

Core design goals:
- Emergent LLM-driven behavior that feels like a living fantasy world.
- Events should be game-y and legible: clear cause -> effect for prices.
- Maintain a coherent world narrative across hours.
- Keep it fun: rumors, guild edicts, dragon attacks, artifact discoveries, crusades, plagues.

MARKET RULES:
- Exactly ${MARKET_COMPANY_COUNT} LISTED companies must exist after your update.
- Each company represents a FANTASY CONCEPT (broad or specific): e.g. FIREBALL, ORCS, DARK PATRONS, SNEAK ATTACKS.
- KEEP THE SAME LISTED COMPANIES unless you explicitly delist one (max ${MAX_DELISTINGS_PER_HOUR}).
- If you delist a company, you MUST specify a replacement listing so we still have 25 companies.
- Occasionally delist a company and replace it with a new concept. Max delistings this hour: ${MAX_DELISTINGS_PER_HOUR}.
- Prices must be positive, readable, and not explode absurdly in one hour. Use volatility but keep it believable.
- Starting prices for NEW listings (replacement tickers) MUST be within ${LISTING_START_PRICE_MIN}..${LISTING_START_PRICE_MAX}.
- Output must be deterministic for THIS HOUR once generated (the server will cache it).

OUTPUT FORMAT (MANDATORY):
- Respond with STRICT JSON ONLY.
- No markdown fences. No commentary. No trailing text.

You must output exactly this JSON shape (DELTAS ONLY):
{
  "bigNews": [
    { "id": "string", "title": "string", "body": "string", "impact": "string", "imagePrompt": "string" }
  ],
  "updates": [
    {
      "id": "string",
      "price": number,
      "companyNewsTitle": "string",
      "companyNewsBody": "string",
      "companyNewsImpact": "string",
      "logoPrompt": "string"
    }
  ],
  "delist": [
    {
      "id": "string",
      "reason": "string",
      "replacement": {
        "id": "string",
        "name": "string",
        "concept": "string",
        "price": number,
        "logoPrompt": "string"
      }
    }
  ]
}

CONSTRAINTS:
- You MUST provide updates for every listed company id exactly once (25 updates).
- updates[].id MUST match an existing listed id in the previous hour state, except for a replacement id from delist[].
- Price rules:
  - All prices must be > 0.
  - Most hourly moves should be within -12%..+12%. A few can be bigger on major events, but keep it legible.
- Most hourly moves should be within -12%..+12%. A few can be bigger on major events, but keep it legible.
- Keep text short to avoid truncation:
  - bigNews.title <= 72 chars
  - bigNews.body <= 240 chars
  - bigNews.impact <= 120 chars
  - companyNewsTitle <= 72 chars
  - companyNewsBody <= 180 chars (optional; can be empty string)
  - companyNewsImpact <= 120 chars
  - logoPrompt <= 140 chars
  - imagePrompt <= 160 chars
- bigNews length: 2–4 items.
- company news: 1 story per company (title/body/impact) via updates[].
- logoPrompt: a short prompt for generating a square logo for that concept (no text, no watermark).
- imagePrompt: a short prompt for generating an illustration for that big news (no text, no watermark).
- delist length: 0..${MAX_DELISTINGS_PER_HOUR}

PREVIOUS HOUR STATE (authoritative):
${JSON.stringify({
    hourKey: prev.hourKey,
    companies: prev.companies.map((c) => ({ id: c.id, name: c.name, concept: c.concept, price: c.price })),
    newsHeadlines: prev.news.slice(0, 10).map((n) => ({ kind: n.kind, title: n.title })),
  })}

CURRENT HOURKEY (UTC): ${hourKey}

Remember: keep the world coherent. Move prices based on the narrative of the world.
`.trim();
}

function parseMarketDeltaResponseOrThrow(raw: string, hourKey: string, prev: MarketHourState): MarketHourState {
  const jsonText = extractJSON(raw);
  if (!jsonText) throw new MarketGenerationError("Market LLM output did not contain parseable JSON.", { raw });

  let obj: any;
  try {
    obj = JSON.parse(jsonText) as any;
  } catch {
    throw new MarketGenerationError("Market LLM JSON parse failed.", { raw });
  }

  const bigNewsRaw = Array.isArray(obj?.bigNews) ? obj.bigNews : [];
  const updatesRaw = Array.isArray(obj?.updates) ? obj.updates : [];
  const delistRaw = Array.isArray(obj?.delist) ? obj.delist : [];

  const prevById = new Map(prev.companies.map((c) => [c.id, c]));

  // Start from previous companies and apply optional delist/replacement.
  let companies: Company[] = prev.companies.map((c) => ({ ...c }));
  const delisted: MarketHourState["delisted"] = [];

  for (const d of delistRaw.slice(0, MAX_DELISTINGS_PER_HOUR)) {
    const id = String(d?.id || "").trim().toUpperCase();
    if (!prevById.has(id)) continue;

    const reason = String(d?.reason || "Delisted.").trim();
    const rep = d?.replacement;
    const repId = String(rep?.id || "").trim().toUpperCase();
    const repName = String(rep?.name || repId).trim();
    const repConcept = String(rep?.concept || repName).trim() || repName;
    const repPriceNum = Number(rep?.price);
    const repLogoPrompt = String(rep?.logoPrompt || "").trim() || undefined;

    if (!/^[A-Z]{3,6}$/.test(repId)) continue;
    if (prevById.has(repId)) continue;
    if (!Number.isFinite(repPriceNum)) continue;
    if (repPriceNum < LISTING_START_PRICE_MIN || repPriceNum > LISTING_START_PRICE_MAX) continue;

    const delistPrice = prevById.get(id)!.price;
    delisted.push({
      id,
      delistedAtHourKey: hourKey,
      delistPrice: round2(delistPrice),
      reason,
    });

    companies = companies.filter((c) => c.id !== id);
    companies.push({
      id: repId,
      name: repName,
      concept: repConcept,
      price: round2(repPriceNum),
      prevPrice: round2(repPriceNum),
      change: 0,
      changePct: 0,
      status: "LISTED",
      logoPrompt: repLogoPrompt,
    });

    // Update maps for applying updates
    prevById.delete(id);
  }

  if (companies.length !== MARKET_COMPANY_COUNT) {
    throw new MarketGenerationError("Delta application resulted in incorrect company count.", { raw });
  }

  const nextById = new Map(companies.map((c) => [c.id, c]));

  // Apply per-company updates (must cover all 25 once).
  const seen = new Set<string>();
  const companyNews: NewsItem[] = [];

  for (const u of updatesRaw) {
    const id = String(u?.id || "").trim().toUpperCase();
    if (!nextById.has(id)) continue;
    if (seen.has(id)) continue;
    const priceNum = Number(u?.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) continue;
    seen.add(id);

    const cur = nextById.get(id)!;
    const prevPrice = prevById.get(id)?.price ?? cur.price;
    cur.prevPrice = round2(prevPrice);
    cur.price = round2(priceNum);
    cur.change = round2(cur.price - cur.prevPrice);
    cur.changePct = round2(cur.prevPrice > 0 ? (cur.change / cur.prevPrice) * 100 : 0);

    const title = String(u?.companyNewsTitle || "").trim();
    const body = String(u?.companyNewsBody || "").trim();
    const impact = String(u?.companyNewsImpact || "").trim();
    const logoPrompt = String(u?.logoPrompt || "").trim() || undefined;
    if (logoPrompt) cur.logoPrompt = logoPrompt;

    companyNews.push({
      id: `co-${id}-${hourKey}`,
      kind: "COMPANY",
      hourKey,
      title: title || `${id} Update`,
      body,
      impact,
      companyIds: [id],
      imageUrl: undefined,
    });
  }

  if (seen.size !== MARKET_COMPANY_COUNT) {
    throw new MarketGenerationError(
      `Market delta missing updates for ${MARKET_COMPANY_COUNT - seen.size} companies.`,
      { raw },
    );
  }

  const bigNews: NewsItem[] = bigNewsRaw.slice(0, 6).map((n: any, idx: number) => ({
    id: String(n?.id || `big-${idx}`).trim() || `big-${idx}`,
    kind: "BIG",
    hourKey,
    title: String(n?.title || "Big News").trim(),
    body: String(n?.body || "").trim(),
    impact: String(n?.impact || "").trim(),
    companyIds: undefined,
    imageUrl: undefined,
    imagePrompt: String(n?.imagePrompt || "").trim() || undefined,
  }));

  if (bigNews.length < 1) {
    throw new MarketGenerationError("Market LLM output missing bigNews items.", { raw });
  }

  return {
    version: 1,
    hourKey,
    generatedAt: Date.now(),
    companies: Array.from(nextById.values()).sort((a, b) => a.id.localeCompare(b.id)),
    delisted,
    news: [...bigNews, ...companyNews],
  };
}

function extractJSON(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;

  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = fenced?.[1]?.trim() || s;

  if ((body.startsWith("{") && body.endsWith("}")) || (body.startsWith("[") && body.endsWith("]"))) {
    return body;
  }

  const start = body.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return body.slice(start, i + 1);
  }
  return null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}


