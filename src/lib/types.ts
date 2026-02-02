export type HourKey = string; // YYYY-MM-DDTHH (UTC)

export type Company = {
  id: string; // stock ID / ticker (server-normalized to uppercase)
  name: string; // display name (fantasy concept)
  concept: string; // one-line explanation of what the company represents
  price: number; // snapped hourly price
  prevPrice: number; // previous hour price (or same on first hour)
  change: number; // price - prevPrice
  changePct: number; // (change / prevPrice) * 100
  status: "LISTED" | "DELISTED";
  logoUrl?: string;
  logoPrompt?: string; // used server-side for nano banana logo generation
};

export type NewsItem = {
  id: string;
  kind: "BIG" | "COMPANY";
  hourKey: HourKey;
  title: string;
  body: string;
  impact: string; // legible player-facing summary
  companyIds?: string[];
  imageUrl?: string;
  imagePrompt?: string; // used server-side for nano banana news image generation
};

export type MarketHourState = {
  version: 1;
  hourKey: HourKey;
  generatedAt: number; // ms epoch
  companies: Company[]; // exactly 25 LISTED
  delisted: Array<{ id: string; delistedAtHourKey: HourKey; delistPrice: number; reason: string }>;
  news: NewsItem[]; // mix of BIG + COMPANY
};

export type PlayerAccount = {
  version: 1;
  playerId: string;
  createdAt: number;
  updatedAt: number;
  cash: number;
  positions: Record<string, number>; // companyId -> shares (negative means short)
};

export type AccountSnapshot = PlayerAccount & {
  netWorth: number;
  bankrupt: boolean;
};

export type TradeSide = "BUY" | "SELL" | "SHORT";

export type TradeReceipt = {
  ok: boolean;
  error?: string;
  hourKey: HourKey;
  side: TradeSide;
  qty: number;
  companyId: string;
  price: number;
  cashDelta: number;
  positionDelta: number;
  account: AccountSnapshot;
};


