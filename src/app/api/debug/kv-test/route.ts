import { NextResponse } from "next/server";
import { kvGetJSON, kvSetJSON } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const key = `fx:debug:kv-test:${new Date().toISOString().slice(0, 13)}`; // hourly bucket
  const payload = { ok: true, at: Date.now() };

  try {
    await kvSetJSON(key, payload, { exSeconds: 120 });
    const readBack = await kvGetJSON<any>(key);
    return NextResponse.json({
      ok: true,
      wrote: true,
      readBack: Boolean(readBack),
      value: readBack ?? null,
      key,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        key,
      },
      { status: 500 },
    );
  }
}


