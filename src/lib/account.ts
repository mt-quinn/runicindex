import { STARTING_CASH } from "@/lib/constants";
import { kvGetJSON, kvSetJSON } from "@/lib/storage";
import { playerAccountKey } from "@/lib/profileKeys";
import type { AccountSnapshot, MarketHourState, PlayerAccount } from "@/lib/types";

export const ACCOUNT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days since last write

export async function getOrCreateAccount(playerId: string): Promise<PlayerAccount> {
  const key = playerAccountKey(playerId);
  const existing = await kvGetJSON<PlayerAccount>(key);
  if (existing && existing.playerId === playerId) return existing;

  const created: PlayerAccount = {
    version: 1,
    playerId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cash: STARTING_CASH,
    positions: {},
  };
  await kvSetJSON(key, created, { exSeconds: ACCOUNT_TTL_SECONDS });
  return created;
}

export async function saveAccount(acct: PlayerAccount): Promise<void> {
  acct.updatedAt = Date.now();
  await kvSetJSON(playerAccountKey(acct.playerId), acct, { exSeconds: ACCOUNT_TTL_SECONDS });
}

export async function resetAccount(playerId: string): Promise<PlayerAccount> {
  const acct: PlayerAccount = {
    version: 1,
    playerId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cash: STARTING_CASH,
    positions: {},
  };
  await kvSetJSON(playerAccountKey(playerId), acct, { exSeconds: ACCOUNT_TTL_SECONDS });
  return acct;
}

/**
 * Apply delist compensation / forced closeouts for any positions in delisted tickers.
 * Settlement: cash += shares * delistPrice (shares may be negative), then position is removed.
 */
export function settleDelistings(acct: PlayerAccount, market: MarketHourState): PlayerAccount {
  if (!market.delisted?.length) return acct;
  for (const d of market.delisted) {
    const shares = Number(acct.positions?.[d.id] ?? 0);
    if (!shares) continue;
    acct.cash += shares * d.delistPrice;
    delete acct.positions[d.id];
  }
  return acct;
}

export function computeAccountSnapshot(acct: PlayerAccount, market: MarketHourState): AccountSnapshot {
  const priceById = new Map(market.companies.map((c) => [c.id, c.price]));
  let positionsValue = 0;
  for (const [id, shares] of Object.entries(acct.positions || {})) {
    const px = priceById.get(id);
    if (!px) continue; // if missing, treat as 0 until next settlement tick
    positionsValue += Number(shares) * px;
  }
  const netWorth = acct.cash + positionsValue;
  const bankrupt = netWorth <= 0;
  return {
    ...acct,
    netWorth: Math.round(netWorth * 100) / 100,
    bankrupt,
  };
}


