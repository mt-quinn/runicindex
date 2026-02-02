"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PLAYER_STORAGE_KEY } from "@/lib/constants";
import type { AccountSnapshot, MarketHourState, TradeReceipt } from "@/lib/types";

type MarketResponse = { market: MarketHourState };
type AccountGetResponse = { ok: boolean; account: AccountSnapshot } | { error: string };

function getOrCreatePlayerId(): string {
  try {
    const raw = window.localStorage.getItem(PLAYER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as any;
      if (parsed?.playerId && typeof parsed.playerId === "string") return parsed.playerId;
    }
  } catch {
    // ignore
  }
  const id = (globalThis.crypto as any)?.randomUUID?.() || `p-${Date.now()}-${Math.random()}`;
  try {
    window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ playerId: id }));
  } catch {
    // ignore
  }
  return id;
}

export function useFantasyExchange() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketHourState | null>(null);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorRaw, setErrorRaw] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<TradeReceipt | null>(null);

  useEffect(() => {
    setPlayerId(getOrCreatePlayerId());
  }, []);

  const refreshMarket = useCallback(async () => {
    const res = await fetch("/api/market/state", { method: "POST" });
    if (!res.ok) {
      try {
        const data = (await res.json()) as any;
        if (typeof data?.raw === "string") setErrorRaw(data.raw);
        throw new Error(String(data?.error || "Failed to load market"));
      } catch {
        throw new Error("Failed to load market");
      }
    }
    const data = (await res.json()) as MarketResponse;
    setErrorRaw(null);
    setMarket(data.market);
  }, []);

  const refreshAccount = useCallback(
    async (pid: string) => {
      const res = await fetch("/api/account/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: pid }),
      });
      if (!res.ok) {
        try {
          const data = (await res.json()) as any;
          throw new Error(String(data?.error || "Failed to load account"));
        } catch {
          throw new Error("Failed to load account");
        }
      }
      const data = (await res.json()) as AccountGetResponse;
      if ("error" in data) throw new Error(data.error);
      setAccount(data.account);
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    if (!playerId) return;
    setError(null);
    setErrorRaw(null);
    setLoading(true);
    try {
      await Promise.all([refreshMarket(), refreshAccount(playerId)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh.");
    } finally {
      setLoading(false);
    }
  }, [playerId, refreshAccount, refreshMarket]);

  useEffect(() => {
    if (!playerId) return;
    void refreshAll();
    const t = window.setInterval(() => void refreshMarket(), 30_000);
    return () => window.clearInterval(t);
  }, [playerId, refreshAll, refreshMarket]);

  const execute = useCallback(async () => {
    if (!playerId) return;
    const cmd = command.trim();
    if (!cmd) return;
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const res = await fetch("/api/trade/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, command: cmd }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(String(data?.error || "Trade failed"));
      setReceipt(data as TradeReceipt);
      setAccount((data as TradeReceipt).account);
      // Market could have ticked during trade; refresh quickly.
      await refreshMarket();
      setCommand("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trade failed");
    } finally {
      setBusy(false);
    }
  }, [command, playerId, refreshMarket]);

  const reset = useCallback(async () => {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(String(data?.error || "Reset failed"));
      setAccount(data.account as AccountSnapshot);
      setReceipt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }, [playerId]);

  const investedIds = useMemo(() => {
    const pos = account?.positions || {};
    return new Set(Object.keys(pos).filter((k) => Number(pos[k]) !== 0));
  }, [account?.positions]);

  const companiesSorted = useMemo(() => {
    const list = market?.companies ? [...market.companies] : [];
    list.sort((a, b) => {
      const ai = investedIds.has(a.id) ? 1 : 0;
      const bi = investedIds.has(b.id) ? 1 : 0;
      if (ai !== bi) return bi - ai;
      return b.changePct - a.changePct;
    });
    return list;
  }, [investedIds, market?.companies]);

  return {
    playerId,
    market,
    account,
    loading,
    busy,
    error,
    errorRaw,
    command,
    setCommand,
    execute,
    reset,
    refreshAll,
    receipt,
    companiesSorted,
  } as const;
}


