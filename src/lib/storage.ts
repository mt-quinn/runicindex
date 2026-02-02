import { kv as vercelKv } from "@vercel/kv";

type StoredValue = { value: string; expiresAt?: number };

type MinimalRedisClient = {
  connect: () => Promise<void>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: any) => Promise<unknown>;
  on: (event: "error", listener: (err: unknown) => void) => unknown;
};

function getMemoryStore(): Map<string, StoredValue> {
  const g = globalThis as any;
  if (!g.__PG_MEM_KV__) {
    g.__PG_MEM_KV__ = new Map<string, StoredValue>();
  }
  return g.__PG_MEM_KV__ as Map<string, StoredValue>;
}

function hasVercelKV(): boolean {
  // Vercel KV typically provides these env vars.
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function hasRedisUrl(): boolean {
  // Some Vercel Redis integrations provide only a REDIS_URL connection string.
  return Boolean(process.env.REDIS_URL);
}

async function getRedisClient(): Promise<MinimalRedisClient> {
  const g = globalThis as any;
  if (g.__PG_REDIS_CLIENT__) return g.__PG_REDIS_CLIENT__ as MinimalRedisClient;

  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not set");
  }

  let createClient: any;
  try {
    // Optional dependency locally; if it's missing we will fall back to memory storage.
    ({ createClient } = await import("redis"));
  } catch (e) {
    throw new Error(
      "Redis client not available (missing optional dependency 'redis').",
    );
  }

  const client = createClient({ url: process.env.REDIS_URL }) as unknown as MinimalRedisClient;

  client.on("error", (err) => {
    console.error("Redis error:", err);
  });

  await client.connect();
  g.__PG_REDIS_CLIENT__ = client;
  return client;
}

export async function kvGetJSON<T>(key: string): Promise<T | null> {
  if (hasVercelKV()) {
    const raw = await vercelKv.get<any>(key);
    if (!raw) return null;
    // @vercel/kv may return either a string (common if you stored JSON as a string)
    // or a parsed object (common if you stored a JSON value directly).
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    }
    return raw as T;
  }

  if (hasRedisUrl()) {
    try {
      const client = await getRedisClient();
      const raw = await client.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    } catch (e) {
      // Local/dev fallback: if Redis isn't configured or the optional dependency isn't installed,
      // silently fall back to in-memory storage so the game still runs.
      console.warn("KV Redis fallback to memory:", e);
    }
  }

  const store = getMemoryStore();
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  try {
    return JSON.parse(entry.value) as T;
  } catch {
    return null;
  }
}

export async function kvSetJSON(
  key: string,
  value: unknown,
  opts?: { exSeconds?: number },
): Promise<void> {
  const raw = JSON.stringify(value);
  if (hasVercelKV()) {
    if (opts?.exSeconds) {
      await vercelKv.set(key, raw, { ex: opts.exSeconds });
    } else {
      await vercelKv.set(key, raw);
    }
    return;
  }

  if (hasRedisUrl()) {
    try {
      const client = await getRedisClient();
      if (opts?.exSeconds) {
        await client.set(key, raw, { EX: opts.exSeconds });
      } else {
        await client.set(key, raw);
      }
      return;
    } catch (e) {
      // Local/dev fallback: if Redis isn't configured or the optional dependency isn't installed,
      // silently fall back to in-memory storage so the game still runs.
      console.warn("KV Redis fallback to memory:", e);
    }
  }

  const store = getMemoryStore();
  const expiresAt =
    typeof opts?.exSeconds === "number" ? Date.now() + opts.exSeconds * 1000 : undefined;
  store.set(key, { value: raw, expiresAt });
}

/**
 * Best-effort distributed lock for KV-backed singletons (like hourly market generation).
 * Returns a lock token if acquired, else null.
 */
export async function kvTryAcquireLock(args: {
  key: string;
  ttlSeconds: number;
}): Promise<string | null> {
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (hasVercelKV()) {
    try {
      // @vercel/kv supports Redis options like NX/EX.
      const res = await (vercelKv as any).set(args.key, token, { nx: true, ex: args.ttlSeconds });
      // Upstash-style returns "OK" on success, null on failure; tolerate truthy.
      if (res) return token;
      return null;
    } catch (e) {
      console.warn("KV lock acquire failed (vercel):", e);
      return null;
    }
  }

  if (hasRedisUrl()) {
    try {
      const client = await getRedisClient();
      // node-redis supports NX/EX options via SET.
      const res = await (client as any).set(args.key, token, { NX: true, EX: args.ttlSeconds });
      if (res) return token;
      return null;
    } catch (e) {
      console.warn("KV lock acquire failed (redis):", e);
      // fall through to memory
    }
  }

  // Memory lock (dev only)
  const store = getMemoryStore();
  const existing = store.get(args.key);
  if (existing && (!existing.expiresAt || Date.now() <= existing.expiresAt)) return null;
  store.set(args.key, { value: token, expiresAt: Date.now() + args.ttlSeconds * 1000 });
  return token;
}


