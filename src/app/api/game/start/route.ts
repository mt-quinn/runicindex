import { NextResponse } from "next/server";
import { randomUUID, randomInt } from "crypto";
import { DEFAULT_MODEL_ID, getOpenAIClient } from "@/lib/openai";
import { kvGetJSON, kvSetJSON } from "@/lib/storage";
import { dailyProfileKey, randomProfileKey } from "@/lib/profileKeys";
import { caseNumberFromSeed } from "@/lib/caseNumber";
import { generateAndStorePortrait, portraitsCanPersist, portraitsEnabled } from "@/lib/portrait";
import type { Alignment, CharacterProfile, GameMode, HiddenProfile, VisibleProfile } from "@/lib/types";

export const runtime = "nodejs";

type StartRequest = {
  mode?: GameMode;
  dateKey?: string; // required for daily
};

type StartResponse = {
  mode: GameMode;
  dateKey: string;
  gameId: string;
  visible: VisibleProfile;
};

const DAILY_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const RANDOM_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StartRequest;
    const mode = body.mode === "debug-random" ? "debug-random" : "daily";

    if (mode === "daily" && !body.dateKey) {
      return NextResponse.json({ error: "Missing dateKey for daily mode" }, { status: 400 });
    }

    if (mode === "daily") {
      const dateKey = body.dateKey!;
      const key = dailyProfileKey(dateKey);
      const existing = await kvGetJSON<CharacterProfile>(key);
      if (existing) {
        // Back-compat: older cached profiles may not have a caseNumber, and older names may include nicknames.
        const desiredCaseNumber = caseNumberFromSeed(dateKey);
        const currentCaseNumber = Number((existing.visible as any)?.caseNumber);
        const needsCaseNumber = !Number.isFinite(currentCaseNumber) || currentCaseNumber < 1000 || currentCaseNumber > 9999;

        const desiredName = sanitizeName(existing.visible?.name || "");
        const needsNameSanitize = desiredName && desiredName !== existing.visible?.name;

        const canPersistPortrait = portraitsCanPersist();
        const needsPortrait = portraitsEnabled() && (!existing.visible?.portraitUrl || !canPersistPortrait);
        const needsStripEmoji = typeof (existing as any).faceEmoji === "string";

        if (needsCaseNumber || needsNameSanitize || needsPortrait || needsStripEmoji) {
          let portraitUrl: string | undefined = existing.visible?.portraitUrl;
          if (needsPortrait) {
            try {
              portraitUrl = await generateAndStorePortrait({
                seed: dateKey,
                gameId: existing.gameId,
                visible: { ...existing.visible, caseNumber: desiredCaseNumber },
                hidden: existing.hidden,
              });
            } catch (e) {
              console.warn("Portrait generation failed (daily cached):", e);
              portraitUrl = existing.visible?.portraitUrl;
            }
          }

          // If we can't persist portraits (local dev), avoid stuffing a giant data URL into KV.
          // We'll still return the generated portraitUrl in the response.
          if (!canPersistPortrait && needsPortrait) {
            const visibleForResponse: VisibleProfile = {
              ...existing.visible,
              caseNumber: needsCaseNumber ? desiredCaseNumber : (existing.visible as any).caseNumber,
              name: needsNameSanitize ? desiredName : existing.visible.name,
              portraitUrl,
            };
            return NextResponse.json({
              mode: "daily",
              dateKey,
              gameId: existing.gameId,
              visible: visibleForResponse,
            } satisfies StartResponse);
          }

          const { faceEmoji: _unused, ...rest } = existing as any;
          const updated: CharacterProfile = {
            ...(rest as CharacterProfile),
            visible: {
              ...existing.visible,
              caseNumber: needsCaseNumber ? desiredCaseNumber : (existing.visible as any).caseNumber,
              name: needsNameSanitize ? desiredName : existing.visible.name,
              portraitUrl: portraitUrl || existing.visible?.portraitUrl,
            },
          };
          await kvSetJSON(key, updated, { exSeconds: DAILY_TTL_SECONDS });
          return NextResponse.json({
            mode: "daily",
            dateKey,
            gameId: updated.gameId,
            visible: updated.visible,
          } satisfies StartResponse);
        }

        const res: StartResponse = {
          mode: "daily",
          dateKey,
          gameId: existing.gameId,
          visible: existing.visible,
        };
        return NextResponse.json(res);
      }

      const alignment: Alignment = randomInt(0, 2) === 0 ? "GOOD" : "EVIL";
      const gameId = dateKey;
      const { visible, hidden } = await generateProfile({
        mode,
        seed: dateKey,
        alignment,
      });

      const canPersistPortrait = portraitsCanPersist();
      let portraitUrl: string | undefined = undefined;
      if (portraitsEnabled()) {
        try {
          portraitUrl = await generateAndStorePortrait({
            seed: dateKey,
            gameId,
            visible: { ...visible, caseNumber: caseNumberFromSeed(dateKey) },
            hidden,
          });
        } catch (e) {
          console.warn("Portrait generation failed (daily new):", e);
        }
      }

      const profile: CharacterProfile = {
        version: 1,
        dateKey,
        mode: "daily",
        gameId,
        alignment,
        visible: {
          ...visible,
          caseNumber: caseNumberFromSeed(dateKey),
          portraitUrl: canPersistPortrait ? portraitUrl : undefined,
        },
        hidden,
      };
      await kvSetJSON(key, profile, { exSeconds: DAILY_TTL_SECONDS });

      const res: StartResponse = {
        mode: "daily",
        dateKey,
        gameId,
        visible: { ...profile.visible, portraitUrl },
      };
      return NextResponse.json(res);
    }

    // debug-random mode
    const dateKey = body.dateKey || "debug";
    const gameId = randomUUID();
    const key = randomProfileKey(gameId);
    const alignment: Alignment = randomInt(0, 2) === 0 ? "GOOD" : "EVIL";
    const { visible, hidden } = await generateProfile({
      mode,
      seed: gameId,
      alignment,
    });

    const canPersistPortrait = portraitsCanPersist();
    let portraitUrl: string | undefined = undefined;
    if (portraitsEnabled()) {
      try {
        portraitUrl = await generateAndStorePortrait({
          seed: gameId,
          gameId,
          visible: { ...visible, caseNumber: caseNumberFromSeed(gameId) },
          hidden,
        });
      } catch (e) {
        console.warn("Portrait generation failed (random):", e);
      }
    }

    const profile: CharacterProfile = {
      version: 1,
      mode: "debug-random",
      gameId,
      alignment,
      visible: {
        ...visible,
        caseNumber: caseNumberFromSeed(gameId),
        portraitUrl: canPersistPortrait ? portraitUrl : undefined,
      },
      hidden,
    };
    await kvSetJSON(key, profile, { exSeconds: RANDOM_TTL_SECONDS });

    const res: StartResponse = {
      mode: "debug-random",
      dateKey,
      gameId,
      visible: { ...profile.visible, portraitUrl },
    };
    return NextResponse.json(res);
  } catch (error) {
    console.error("Error in /api/game/start:", error);
    return NextResponse.json({ error: "Failed to start game" }, { status: 500 });
  }
}

async function generateProfile(args: {
  mode: GameMode;
  seed: string;
  alignment: Alignment;
}): Promise<{ visible: VisibleProfile; hidden: HiddenProfile }> {
  const openai = getOpenAIClient();

  const prompt = buildCharacterPrompt(args.seed, args.alignment);
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL_ID,
    messages: [{ role: "system", content: prompt }],
    max_completion_tokens: 900,
    reasoning_effort:
      DEFAULT_MODEL_ID === "gpt-5.2-2025-12-11" ? ("none" as any) : "minimal",
    verbosity: "low",
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  return parseCharacterResponse(raw);
}

function buildCharacterPrompt(seed: string, alignment: Alignment): string {
  return `You are generating a daily character for a mobile web interrogation game at the Pearly Gates.

The backend has already decided the TRUE ALIGNMENT of today's soul by coinflip. You MUST build a consistent character whose life actually matches that alignment.

TRUE ALIGNMENT: ${alignment}
SEED (for determinism cues only): ${seed}

OUTPUT REQUIREMENTS:
- Respond ONLY with strict JSON (no extra text).
- The JSON MUST match this exact shape:
{
  "visible": {
    "name": string,
    "age": number,
    "occupation": string,
    "causeOfDeath": string
  },
  "hidden": {
    "bio": string,
    "bestActs": [string, string, string],
    "worstActs": [string, string, string]
  }
}

CONTENT REQUIREMENTS:
- Make the character vivid, specific, and funny/strange enough to interrogate.
- The visible section should be intriguing but NOT give away the alignment outright.
- The "name" MUST be a normal human name (first + last, optionally middle initial). NO nicknames, NO quotes, NO titles, NO epithets.
  - Bad: Douglas "Cash King" Winston
  - Good: Douglas Winston
  - Bad: Marla “Marlboro” Quince
  - Good: Marla Quince
- The hidden section MUST fully support the alignment:
  - If GOOD: bestActs should be genuinely admirable; worstActs should be minor/relatable flaws.
  - If EVIL: worstActs should be clearly damning; bestActs can exist but should not redeem them.
- "bio" should be 3–5 short sentences.
- Each act (best/worst) should be a single sentence fragment (one line).
- Keep all strings <= 160 characters when possible.

IMPORTANT WORLD RULE:
- The soul does NOT know about any "dossier" or hidden profile. That is meta. Do not reference it.
`.trim();
}

function parseCharacterResponse(
  raw: string,
): { visible: VisibleProfile; hidden: HiddenProfile } {
  try {
    const parsed = JSON.parse(raw) as any;
    const visible = parsed?.visible;
    const hidden = parsed?.hidden;
    if (!visible || !hidden) throw new Error("Missing visible/hidden");

    const cleanedVisible: VisibleProfile = {
      caseNumber: 1000, // placeholder; server overwrites deterministically
      name: sanitizeName(String(visible.name || "Unknown")),
      age: Number.isFinite(visible.age) ? Math.max(1, Math.min(120, Math.round(visible.age))) : 42,
      occupation: String(visible.occupation || "Unemployed"),
      causeOfDeath: String(visible.causeOfDeath || "Unknown"),
    };

    const to3 = (arr: any): [string, string, string] => {
      const items = Array.isArray(arr) ? arr.map((x) => String(x || "").trim()).filter(Boolean) : [];
      const padded = [...items, "…", "…", "…"].slice(0, 3);
      return [padded[0]!, padded[1]!, padded[2]!] as [string, string, string];
    };

    const cleanedHidden: HiddenProfile = {
      bio: String(hidden.bio || ""),
      bestActs: to3(hidden.bestActs),
      worstActs: to3(hidden.worstActs),
    };

    return { visible: cleanedVisible, hidden: cleanedHidden };
  } catch {
    // fallback minimal profile (should be rare)
    return {
      visible: {
        caseNumber: 1000, // placeholder; server overwrites deterministically
        name: "Mystery Soul",
        age: 42,
        occupation: "Unknown",
        causeOfDeath: "Unknown",
      },
      hidden: {
        bio: "A soul with an unclear past.",
        bestActs: ["…", "…", "…"],
        worstActs: ["…", "…", "…"],
      },
    };
  }
}

function sanitizeName(input: string): string {
  // Remove nicknames/epithets in quotes and normalize whitespace.
  // Examples:
  // - Douglas "Cash King" Winston -> Douglas Winston
  // - Marla “Marlboro” Quince -> Marla Quince
  const s = (input || "").trim();
  if (!s) return "Unknown";
  const withoutQuoted = s.replace(/["“”'‘’][^"“”'‘’]{1,60}["“”'‘’]/g, " ").trim();
  const withoutParens = withoutQuoted.replace(/\(([^)]{1,60})\)/g, " ").trim();
  const normalized = withoutParens.replace(/\s+/g, " ").trim();
  return normalized || "Unknown";
}


