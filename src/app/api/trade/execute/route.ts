import { NextResponse } from "next/server";
import { utcHourKey } from "@/lib/hourKey";
import { getOrCreateMarketHour } from "@/lib/market";
import { computeAccountSnapshot, getOrCreateAccount, saveAccount, settleDelistings } from "@/lib/account";
import type { TradeReceipt, TradeSide } from "@/lib/types";

export const runtime = "nodejs";

type TradeRequest = {
  playerId?: string;
  command?: string; // e.g. "Buy 10 FIRE"
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TradeRequest;
    const playerId = String(body.playerId || "").trim();
    const command = String(body.command || "").trim();
    if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
    if (!command) return NextResponse.json({ error: "Missing command" }, { status: 400 });

    const hourKey = utcHourKey();
    const market = await getOrCreateMarketHour(hourKey);

    let acct = await getOrCreateAccount(playerId);
    acct = settleDelistings(acct, market);

    const parsed = parseTradeCommand(command);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid command. Use: Buy/Sell/Short [number] [stock ID]" }, { status: 400 });
    }

    const company = market.companies.find((c) => c.id === parsed.companyId);
    if (!company) return NextResponse.json({ error: `Unknown stock ID: ${parsed.companyId}` }, { status: 400 });
    const price = company.price;

    const curPos = Number(acct.positions[parsed.companyId] ?? 0);
    const qty = parsed.qty;

    let cashDelta = 0;
    let posDelta = 0;

    if (parsed.side === "BUY") {
      cashDelta = -qty * price;
      posDelta = qty;
    } else if (parsed.side === "SELL") {
      if (curPos < qty) {
        return NextResponse.json({ error: `Not enough shares to sell. You have ${curPos}.` }, { status: 400 });
      }
      cashDelta = qty * price;
      posDelta = -qty;
    } else if (parsed.side === "SHORT") {
      cashDelta = qty * price;
      posDelta = -qty;
    }

    acct.cash = round2(acct.cash + cashDelta);
    const nextPos = curPos + posDelta;
    if (nextPos === 0) {
      delete acct.positions[parsed.companyId];
    } else {
      acct.positions[parsed.companyId] = nextPos;
    }

    await saveAccount(acct);
    const snap = computeAccountSnapshot(acct, market);

    const receipt: TradeReceipt = {
      ok: true,
      hourKey,
      side: parsed.side,
      qty,
      companyId: parsed.companyId,
      price,
      cashDelta: round2(cashDelta),
      positionDelta: posDelta,
      account: snap,
    };

    return NextResponse.json(receipt);
  } catch (e) {
    console.error("Error in /api/trade/execute:", e);
    return NextResponse.json({ error: "Trade failed" }, { status: 500 });
  }
}

function parseTradeCommand(cmd: string): { side: TradeSide; qty: number; companyId: string } | null {
  const m = cmd.trim().match(/^(buy|sell|short)\s+(\d+)\s+([a-zA-Z]{3,6})\s*$/i);
  if (!m) return null;
  const side = m[1]!.toUpperCase() as TradeSide;
  const qty = Math.max(1, Math.min(1_000_000, Math.floor(Number(m[2]))));
  const companyId = m[3]!.toUpperCase();
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (!/^[A-Z]{3,6}$/.test(companyId)) return null;
  return { side, qty, companyId };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}


