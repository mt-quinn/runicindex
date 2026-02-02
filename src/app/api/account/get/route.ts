import { NextResponse } from "next/server";
import { utcHourKey } from "@/lib/hourKey";
import { getOrCreateMarketHour } from "@/lib/market";
import { computeAccountSnapshot, getOrCreateAccount, saveAccount, settleDelistings } from "@/lib/account";

export const runtime = "nodejs";

type GetRequest = { playerId?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GetRequest;
    const playerId = String(body.playerId || "").trim();
    if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });

    const hourKey = utcHourKey();
    const market = await getOrCreateMarketHour(hourKey);

    let acct = await getOrCreateAccount(playerId);
    const before = JSON.stringify(acct.positions);
    acct = settleDelistings(acct, market);
    const after = JSON.stringify(acct.positions);
    if (before !== after) await saveAccount(acct);

    const snap = computeAccountSnapshot(acct, market);
    return NextResponse.json({ ok: true, account: snap });
  } catch (e) {
    console.error("Error in /api/account/get:", e);
    const msg = e instanceof Error ? e.message : "Failed to load account";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


