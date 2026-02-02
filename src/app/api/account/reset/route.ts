import { NextResponse } from "next/server";
import { utcHourKey } from "@/lib/hourKey";
import { getOrCreateMarketHour } from "@/lib/market";
import { computeAccountSnapshot, resetAccount, settleDelistings } from "@/lib/account";

export const runtime = "nodejs";

type ResetRequest = { playerId?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ResetRequest;
    const playerId = String(body.playerId || "").trim();
    if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });

    const hourKey = utcHourKey();
    const market = await getOrCreateMarketHour(hourKey);
    let acct = await resetAccount(playerId);
    acct = settleDelistings(acct, market);
    const snap = computeAccountSnapshot(acct, market);
    return NextResponse.json({ ok: true, account: snap });
  } catch (e) {
    console.error("Error in /api/account/reset:", e);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}


