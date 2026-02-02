import { NextResponse } from "next/server";
import { utcHourKey } from "@/lib/hourKey";
import { marketHourKey } from "@/lib/profileKeys";

export const runtime = "nodejs";

function redactUrl(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    // If it's not a URL, just redact most of it.
    return u.length <= 12 ? "[set]" : `${u.slice(0, 6)}…${u.slice(-4)}`;
  }
}

function redactToken(t: string | undefined): string | null {
  if (!t) return null;
  if (t.length <= 8) return "[set]";
  return `${t.slice(0, 3)}…${t.slice(-3)}`;
}

function hasKvEnv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function hasUpstashEnv(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function hasRedisUrlEnv(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export async function GET() {
  const hourKey = utcHourKey();
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    hourKey,
    marketKey: marketHourKey(hourKey),
    vercel: {
      VERCEL: process.env.VERCEL || null,
      VERCEL_ENV: process.env.VERCEL_ENV || null,
      VERCEL_REGION: process.env.VERCEL_REGION || null,
    },
    env: {
      hasKV: hasKvEnv(),
      hasUpstash: hasUpstashEnv(),
      hasRedisUrl: hasRedisUrlEnv(),
      KV_REST_API_URL: redactUrl(process.env.KV_REST_API_URL),
      KV_REST_API_TOKEN: redactToken(process.env.KV_REST_API_TOKEN),
      UPSTASH_REDIS_REST_URL: redactUrl(process.env.UPSTASH_REDIS_REST_URL),
      UPSTASH_REDIS_REST_TOKEN: redactToken(process.env.UPSTASH_REDIS_REST_TOKEN),
      REDIS_URL: redactUrl(process.env.REDIS_URL),
    },
  });
}


