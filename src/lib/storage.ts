import { kv as vercelKv } from "@vercel/kv";

type StoredValue = { value: string; expiresAt?: number };

type MinimalRedisClient = {
  connect: () => Promise<void>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { EX?: number }) => Promise<unknown>;
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

  const { createClient } = await import("redis");
  const client = createClient({
    url: process.env.REDIS_URL,
  }) as unknown as MinimalRedisClient;

  client.on("error", (err) => {
    console.error("Redis error:", err);
  });

  await client.connect();
  g.__PG_REDIS_CLIENT__ = client;
  return client;
}

export async function kvGetJSON<T>(key: string): Promise<T | null> {
  if (hasVercelKV()) {
    const raw = await vercelKv.get<string>(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  if (hasRedisUrl()) {
    const client = await getRedisClient();
    const raw = await client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
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
    const client = await getRedisClient();
    if (opts?.exSeconds) {
      await client.set(key, raw, { EX: opts.exSeconds });
    } else {
      await client.set(key, raw);
    }
    return;
  }

  const store = getMemoryStore();
  const expiresAt =
    typeof opts?.exSeconds === "number" ? Date.now() + opts.exSeconds * 1000 : undefined;
  store.set(key, { value: raw, expiresAt });
}


