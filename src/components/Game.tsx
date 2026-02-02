"use client";

import { useMemo, useState } from "react";
import { useFantasyExchange } from "@/hooks/useFantasyExchange";

type Tab = "market" | "news";

export function Game() {
  const {
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
    receipt,
    companiesSorted,
  } = useFantasyExchange();

  const cash = account?.cash ?? 0;
  const netWorth = account?.netWorth ?? 0;
  const bankrupt = account?.bankrupt ?? false;

  const [tab, setTab] = useState<Tab>("market");

  const positions = useMemo(() => {
    const pos = account?.positions || {};
    const rows = Object.entries(pos)
      .map(([id, shares]) => ({ id, shares: Number(shares) }))
      .filter((r) => r.shares !== 0);
    rows.sort((a, b) => Math.abs(b.shares) - Math.abs(a.shares));
    return rows;
  }, [account?.positions]);

  const tradePreview = useMemo(() => {
    if (!market || !account) return null;
    const cmd = command.trim();
    if (!cmd) return null;
    const m = cmd.match(/^(buy|sell|short)\s+(\d+)\s+([a-zA-Z]{3,6})\s*$/i);
    if (!m) return null;
    const side = m[1]!.toUpperCase() as "BUY" | "SELL" | "SHORT";
    const qty = Math.max(1, Math.min(1_000_000, Math.floor(Number(m[2]))));
    const companyId = m[3]!.toUpperCase();
    if (!Number.isFinite(qty) || qty <= 0) return null;
    const company = market.companies.find((c) => c.id === companyId);
    if (!company) return null;
    const price = company.price;
    const gross = Math.round(qty * price * 100) / 100;

    // Only show SELL preview if it's actually valid (server enforces this too).
    const curPos = Number(account.positions?.[companyId] ?? 0);
    if (side === "SELL" && curPos < qty) return null;

    const direction = side === "BUY" ? "SPEND" : "RECEIVE";
    const signed = side === "BUY" ? -gross : gross;

    return {
      side,
      qty,
      companyId,
      price,
      gross,
      direction,
      signed,
    };
  }, [account, command, market]);

  return (
    <div className="h-full flex flex-col">
      <header className="px-5 pt-2 pb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-xl text-pg-gold drop-shadow-[0_6px_16px_rgba(0,0,0,0.7)]">
            Runic Index
          </div>
          <div className="text-[0.7rem] text-pg-muted truncate">
            {market ? `Hour: ${market.hourKey} UTC` : "Loading market…"}
          </div>
        </div>

        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-white/15 px-3 py-1 bg-black/20 hover:bg-black/35 transition text-[0.7rem] text-pg-muted disabled:opacity-60"
          disabled={busy || loading}
          title="Reset account (bankruptcy escape hatch)"
        >
          Reset
        </button>
      </header>

      {loading || !market || !account ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2 px-6">
            <div className="text-sm text-pg-muted">Spinning up…</div>
            {error && <div className="text-xs text-red-200">{error}</div>}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Tabs */}
          <div className="px-4 pb-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 backdrop-blur shadow-pg-card overflow-hidden">
              <div className="px-2 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("market")}
                    className={`rounded-full px-4 py-2 text-[0.8rem] font-bold transition border ${
                      tab === "market"
                        ? "bg-white/15 border-white/20 text-pg-text"
                        : "bg-black/20 border-white/10 text-pg-muted hover:bg-black/30"
                    }`}
                  >
                    Market
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("news")}
                    className={`rounded-full px-4 py-2 text-[0.8rem] font-bold transition border ${
                      tab === "news"
                        ? "bg-white/15 border-white/20 text-pg-text"
                        : "bg-black/20 border-white/10 text-pg-muted hover:bg-black/30"
                    }`}
                  >
                    News
                  </button>
                </div>

                <div
                  className={`text-[0.8rem] font-bold tabular-nums ${
                    bankrupt ? "text-red-200" : "text-pg-text"
                  }`}
                >
                  Net: ${netWorth.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-4 mb-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[0.75rem] text-red-200">
              {error}
              {typeof errorRaw === "string" && errorRaw.trim() && (
                <details className="mt-2">
                  <summary className="cursor-pointer select-none text-red-100/90">
                    Show raw LLM output
                  </summary>
                  <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap text-[0.7rem] leading-snug text-red-50/90">
                    {errorRaw}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Main content: tabbed */}
          <section className="px-4 flex-1 min-h-0">
            {tab === "market" ? (
              <div className="h-full rounded-2xl border border-white/10 bg-black/25 backdrop-blur shadow-pg-card overflow-hidden flex flex-col">
                <div className="px-3 py-2 flex items-center justify-between">
                  <div className="text-[0.65rem] tracking-[0.22em] font-black uppercase text-pg-muted">
                    Market (25)
                  </div>
                  <div className="text-[0.7rem] text-pg-muted">Sorted: your holdings first</div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <table className="w-full text-[0.78rem]">
                    <thead className="sticky top-0 bg-black/45 backdrop-blur">
                      <tr className="text-left text-pg-muted">
                        <th className="px-3 py-1.5">ID</th>
                        <th className="px-3 py-1.5">Name</th>
                        <th className="px-3 py-1.5 text-right">Price</th>
                        <th className="px-3 py-1.5 text-right">Δ%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companiesSorted.map((c) => (
                        <tr key={c.id} className="border-t border-white/5">
                          <td className="px-3 py-1.5 font-mono text-pg-cyan">{c.id}</td>
                          <td className="px-3 py-1.5 text-pg-text truncate max-w-[10rem]">{c.name}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">${c.price.toFixed(2)}</td>
                          <td
                            className={`px-3 py-1.5 text-right tabular-nums ${
                              c.changePct > 0
                                ? "text-emerald-300"
                                : c.changePct < 0
                                  ? "text-red-300"
                                  : "text-pg-muted"
                            }`}
                          >
                            {c.changePct > 0 ? "+" : ""}
                            {c.changePct.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="h-full rounded-2xl border border-white/10 bg-black/20 shadow-pg-card overflow-hidden flex flex-col">
                <div className="px-3 py-2 flex items-center justify-between">
                  <div className="text-[0.65rem] tracking-[0.22em] font-black uppercase text-pg-muted">
                    News Wire
                  </div>
                  <div className="text-[0.7rem] text-pg-muted">Trades settle at this hour’s prices</div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
                  {market.news.map((n) => (
                    <div key={n.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[0.7rem] tracking-[0.18em] uppercase font-black text-pg-gold">
                            {n.kind === "BIG" ? "BIG" : "TICKER"}
                          </div>
                          <div className="text-[0.95rem] font-bold text-pg-text">{n.title}</div>
                        </div>
                        {n.companyIds?.length ? (
                          <div className="text-[0.7rem] text-pg-cyan font-mono whitespace-nowrap">
                            {n.companyIds.join(",")}
                          </div>
                        ) : null}
                      </div>
                      {n.body && (
                        <div className="mt-1 text-[0.85rem] text-pg-text/90 leading-snug">
                          {n.body}
                        </div>
                      )}
                      {n.impact && (
                        <div className="mt-1 text-[0.8rem] text-pg-muted leading-snug">
                          <span className="font-bold text-pg-muted">Impact:</span> {n.impact}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Bottom: portfolio + command */}
          <section className="px-4 pt-2 pb-4">
            <div className="rounded-2xl border border-white/10 bg-black/30 shadow-pg-card overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between">
                <div className="text-[0.65rem] tracking-[0.22em] font-black uppercase text-pg-muted">
                  Portfolio
                </div>
                <div className="text-[0.8rem] text-pg-text tabular-nums">
                  Cash: <span className="font-bold">${cash.toFixed(2)}</span>
                </div>
              </div>

              <div className="px-3 pb-3 space-y-2">
                {positions.length === 0 ? (
                  <div className="text-sm text-pg-muted">No positions yet.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {positions.slice(0, 8).map((p) => (
                      <div key={p.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div className="font-mono text-pg-cyan">{p.id}</div>
                          <div className={`tabular-nums font-bold ${p.shares < 0 ? "text-red-200" : "text-emerald-200"}`}>
                            {p.shares}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {tradePreview && (
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[0.8rem]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 text-pg-muted">
                        Preview: <span className="font-bold text-pg-text">{tradePreview.side}</span>{" "}
                        {tradePreview.qty}{" "}
                        <span className="font-mono text-pg-cyan">{tradePreview.companyId}</span>{" "}
                        @ ${tradePreview.price.toFixed(2)}
                      </div>
                      <div
                        className={`tabular-nums font-bold ${
                          tradePreview.direction === "SPEND" ? "text-red-200" : "text-emerald-200"
                        }`}
                      >
                        {tradePreview.direction === "SPEND" ? "-" : "+"}${tradePreview.gross.toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void execute();
                      }
                    }}
                    placeholder='Buy/Sell/Short 10 ABC'
                    className="flex-1 rounded-2xl bg-black border border-white/25 px-3 py-2 text-[0.95rem] text-pg-text shadow-inner"
                    disabled={busy}
                    aria-label="Trade command"
                  />
                  <button
                    type="button"
                    onClick={execute}
                    disabled={busy || !command.trim()}
                    className="rounded-full bg-gradient-to-r from-pg-gold to-pg-cyan px-4 py-2 text-[0.85rem] font-bold text-black shadow-pg-glow disabled:opacity-60"
                  >
                    {busy ? "Working…" : "Send"}
                  </button>
                </div>

                {receipt?.ok && (
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[0.8rem] text-pg-text">
                    Filled: <span className="font-bold">{receipt.side}</span> {receipt.qty}{" "}
                    <span className="font-mono text-pg-cyan">{receipt.companyId}</span> @ ${receipt.price.toFixed(2)}.
                  </div>
                )}

                {bankrupt && (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[0.8rem] text-red-200">
                    Bankrupt. Hit <span className="font-bold">Reset</span> to start over with $100.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
 
