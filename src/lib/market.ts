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

  // Prevent stampede on the hour boundary.
  const lock = await kvTryAcquireLock({ key: marketHourLockKey(hourKey), ttlSeconds: 55 });
  if (!lock) {
    // Someone else is generating. Short wait + re-read.
    await sleep(650);
    const again = await kvGetJSON<MarketHourState>(key);
    if (again) return again;
    // If still missing, proceed without lock (dev/misconfig fallback).
  }

  const prevKey = prevUtcHourKey(hourKey);
  const prev = prevKey !== hourKey ? await kvGetJSON<MarketHourState>(marketHourKey(prevKey)) : null;
  const next = await generateMarketHour({ hourKey, prev });
  // Image generation intentionally commented out for now.
  // const withImages = await attachImages(next);
  // await kvSetJSON(key, withImages, { exSeconds: MARKET_TTL_SECONDS });
  await kvSetJSON(key, next, { exSeconds: MARKET_TTL_SECONDS });
  return next;
}

async function generateMarketHour(args: {
  hourKey: string;
  prev: MarketHourState | null;
}): Promise<MarketHourState> {
  const openai = getOpenAIClient();

  const prompt = buildMarketPrompt(args.hourKey, args.prev);
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
    const parsed = parseMarketResponseOrThrow(raw, args.hourKey, args.prev);
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Market generation failed.";
    throw e instanceof MarketGenerationError ? e : new MarketGenerationError(msg, { raw });
  }
}

function buildMarketPrompt(hourKey: string, prev: MarketHourState | null): string {
  const prevCompanies = prev?.companies ?? [];
  const prevNews = prev?.news ?? [];
  const prevIds = prevCompanies.map((c) => c.id);
  const hasPrev = prevIds.length > 0;

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
- If there is a previous hour, KEEP THE SAME LISTED COMPANIES unless you explicitly delist one (max ${MAX_DELISTINGS_PER_HOUR}).
- If you delist a company, it disappears from companies[] and is listed in delist[]. You MUST also introduce a new company to keep the total at ${MARKET_COMPANY_COUNT}.
- Occasionally delist a company and replace it with a new concept. Max delistings this hour: ${MAX_DELISTINGS_PER_HOUR}.
- Prices must be positive, readable, and not explode absurdly in one hour. Use volatility but keep it believable.
- Starting prices for NEW listings:
  - Any company that is NEW this hour (not present in the previous hour) MUST have price between ${LISTING_START_PRICE_MIN} and ${LISTING_START_PRICE_MAX}.
  - If there is NO previous hour (this is the first hour), then ALL ${MARKET_COMPANY_COUNT} companies are NEW, so ALL prices MUST be within ${LISTING_START_PRICE_MIN}..${LISTING_START_PRICE_MAX}.
- Output must be deterministic for THIS HOUR once generated (the server will cache it).

OUTPUT FORMAT (MANDATORY):
- Respond with STRICT JSON ONLY.
- No markdown fences. No commentary. No trailing text.

You must output exactly this JSON shape:
{
  "bigNews": [
    { "id": "string", "title": "string", "body": "string", "impact": "string", "imagePrompt": "string" }
  ],
  "companies": [
    {
      "id": "string",
      "name": "string",
      "concept": "string",
      "price": number,
      "companyNewsTitle": "string",
      "companyNewsBody": "string",
      "companyNewsImpact": "string",
      "logoPrompt": "string"
    }
  ],
  "delist": [
    { "id": "string", "reason": "string" }
  ]
}

CONSTRAINTS:
- companies[].id must be 3–6 chars, uppercase A-Z only (ticker-like), unique.
- DO NOT use placeholder ids like AAA/AAB/ABC. Prefer mnemonic tickers tied to the concept.
- companies[].name MUST be a fantasy concept name (not "Unknown", not "Mystery", not generic placeholders).
- companies[].concept should be a 1-line explanation of what the concept represents in-world.
- Provide REALISTIC price variety each hour. Do NOT output all $1.00 or near-identical prices.
- Price guidance:
  - If this is the FIRST hour (no previous), all prices must stay within ${LISTING_START_PRICE_MIN}..${LISTING_START_PRICE_MAX}.
  - Otherwise, existing tickers may drift beyond that range over time, but newly listed tickers must still start within the band.
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
- company news: 1 story per company (title/body/impact).
- logoPrompt: a short prompt for generating a square logo for that concept (no text, no watermark).
- imagePrompt: a short prompt for generating an illustration for that big news (no text, no watermark).
- delist length: 0..${MAX_DELISTINGS_PER_HOUR}

PREVIOUS HOUR (if any):
${prev ? JSON.stringify({ hourKey: prev.hourKey, companies: prevCompanies.map((c) => ({ id: c.id, name: c.name, concept: c.concept, price: c.price })), newsHeadlines: prevNews.slice(0, 8).map((n) => ({ kind: n.kind, title: n.title })) }) : "null"}

PREVIOUS LISTED IDS (if any): ${prevIds.length ? prevIds.join(", ") : "(none)"}

CURRENT HOURKEY (UTC): ${hourKey}

Remember: keep the world coherent. Move prices based on the narrative of the world.
`.trim();
}

function parseMarketResponseOrThrow(raw: string, hourKey: string, prev: MarketHourState | null): MarketHourState {
  const jsonText = extractJSON(raw);
  if (!jsonText) throw new MarketGenerationError("Market LLM output did not contain parseable JSON.", { raw });

  let obj: any;
  try {
    obj = JSON.parse(jsonText) as any;
  } catch {
    throw new MarketGenerationError("Market LLM JSON parse failed.", { raw });
  }
    const companiesRaw = Array.isArray(obj?.companies) ? obj.companies : [];
    const bigNewsRaw = Array.isArray(obj?.bigNews) ? obj.bigNews : [];
    const delistRaw = Array.isArray(obj?.delist) ? obj.delist : [];

    const prevById = new Map<string, Company>((prev?.companies ?? []).map((c) => [c.id, c]));

    const companies: Company[] = companiesRaw
      .map((c: any) => {
        const id = String(c?.id || "").trim().toUpperCase();
        const name = String(c?.name || id || "Unknown").trim();
        const concept = String(c?.concept || "").trim() || name;
        const logoPrompt = String(c?.logoPrompt || "").trim() || undefined;
        const priceNum = Number(c?.price);
        const isNewListing = !prevById.has(id);
        if (!Number.isFinite(priceNum)) return null;

        // IMPORTANT:
        // - Do NOT clamp starting prices, because clamping silently flattens values (e.g. many >$25 become $25),
        //   which makes the market look fake and can trip our "variation" checks.
        // - Instead, treat out-of-band starting prices as invalid output and fail loudly (with raw attached).
        if (isNewListing) {
          if (priceNum < LISTING_START_PRICE_MIN || priceNum > LISTING_START_PRICE_MAX) return null;
        } else {
          if (priceNum <= 0) return null;
        }

        const price = isNewListing ? priceNum : clamp(priceNum, 0.01, 999999);
        const prevPrice = prevById.get(id)?.price ?? price;
        const change = price - prevPrice;
        const changePct = prevPrice > 0 ? (change / prevPrice) * 100 : 0;
        return {
          id,
          name,
          concept,
          price: round2(price),
          prevPrice: round2(prevPrice),
          change: round2(change),
          changePct: round2(changePct),
          status: "LISTED" as const,
          logoPrompt,
        };
      })
      .filter(Boolean)
      .filter((c: Company) => /^[A-Z]{3,6}$/.test(c.id));

    // Enforce unique IDs and exact count.
    const seen = new Set<string>();
    const uniq: Company[] = [];
    for (const c of companies) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      uniq.push(c);
    }

    if (uniq.length !== MARKET_COMPANY_COUNT) {
      throw new MarketGenerationError(
        `Market LLM output had ${uniq.length} valid unique companies; expected ${MARKET_COMPANY_COUNT}.`,
        { raw },
      );
    }
    const finalCompanies = uniq;

    const uniquePrices = new Set(finalCompanies.map((c) => c.price.toFixed(2)));
    if (uniquePrices.size < 6) {
      throw new MarketGenerationError("Market LLM output prices lack variation.", { raw });
    }

    const news: NewsItem[] = [];
    for (const n of bigNewsRaw.slice(0, 6)) {
      news.push({
        id: String(n?.id || `big-${news.length}`).trim() || `big-${news.length}`,
        kind: "BIG",
        hourKey,
        title: String(n?.title || "Big News").trim(),
        body: String(n?.body || "").trim(),
        impact: String(n?.impact || "").trim(),
        companyIds: undefined,
        imageUrl: undefined,
        imagePrompt: String(n?.imagePrompt || "").trim() || undefined,
      });
    }
    if (news.filter((n) => n.kind === "BIG").length < 1) {
      throw new MarketGenerationError("Market LLM output missing bigNews items.", { raw });
    }

    // Per-company news
    const companyMap = new Map(finalCompanies.map((c) => [c.id, c]));
    for (const c of companiesRaw) {
      const id = String(c?.id || "").trim().toUpperCase();
      if (!companyMap.has(id)) continue;
      const title = String(c?.companyNewsTitle || "").trim();
      const body = String(c?.companyNewsBody || "").trim();
      const impact = String(c?.companyNewsImpact || "").trim();
      if (!title && !body) continue;
      news.push({
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

    // Delistings (metadata only; settlement is handled when accounts are loaded/traded)
    const delisted: MarketHourState["delisted"] = [];
    const prevIds = new Set((prev?.companies ?? []).map((c) => c.id));
    const curIds = new Set(finalCompanies.map((c) => c.id));
    for (const d of delistRaw.slice(0, MAX_DELISTINGS_PER_HOUR)) {
      const id = String(d?.id || "").trim().toUpperCase();
      if (!id || !prevIds.has(id) || curIds.has(id)) continue;
      const delistPrice = prevById.get(id)?.price ?? 1;
      delisted.push({
        id,
        delistedAtHourKey: hourKey,
        delistPrice: round2(delistPrice),
        reason: String(d?.reason || "Delisted.").trim(),
      });
    }

    return {
      version: 1,
      hourKey,
      generatedAt: Date.now(),
      companies: finalCompanies,
      delisted,
      news,
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


