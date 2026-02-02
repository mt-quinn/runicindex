import { NextResponse } from "next/server";
import { utcHourKey } from "@/lib/hourKey";
import { getOrCreateMarketHour, MarketGenerationError } from "@/lib/market";

export const runtime = "nodejs";

export async function POST() {
  try {
    const hourKey = utcHourKey();
    const market = await getOrCreateMarketHour(hourKey);
    return NextResponse.json({ market });
  } catch (e) {
    console.error("Error in /api/market/state:", e);
    if (e instanceof MarketGenerationError) {
      // Return the raw model output so debugging doesn't require digging through server logs.
      return NextResponse.json(
        { error: e.message || "Market generation failed", raw: e.raw ?? "" },
        { status: 500 },
      );
    }
    const msg = e instanceof Error ? e.message : "Failed to load market";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


