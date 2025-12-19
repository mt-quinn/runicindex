export type GameMode = "daily" | "debug-random";

export type Alignment = "GOOD" | "EVIL";

export type VisibleProfile = {
  caseNumber: number; // 4-digit, deterministic
  name: string;
  age: number;
  occupation: string;
  causeOfDeath: string;
  portraitUrl?: string; // public URL (Vercel Blob) for the cutout bust portrait
};

export type HiddenProfile = {
  bio: string;
  bestActs: [string, string, string];
  worstActs: [string, string, string];
};

export type CharacterProfile = {
  version: 1;
  dateKey?: string; // daily only
  gameId: string; // daily: equals dateKey; random: uuid
  mode: GameMode;
  alignment: Alignment;
  visible: VisibleProfile;
  hidden: HiddenProfile;
  // Back-compat: old cached profiles may contain faceEmoji. We ignore and strip it on read.
  faceEmoji?: string;
};

export type QAItem = { q: string; a: string; from?: "SOUL" | "GOD" };

export type ClientGameState = {
  mode: GameMode;
  dateKey: string;
  gameId: string;
  startedAt: number;
  visible: VisibleProfile;
  qa: QAItem[];
  isComplete: boolean;
  judgment?: "HEAVEN" | "HELL";
  wasCorrect?: boolean;
  godMessage?: string;
};


