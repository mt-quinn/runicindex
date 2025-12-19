import { NextResponse } from "next/server";
import { DEFAULT_MODEL_ID, getOpenAIClient } from "@/lib/openai";
import { kvGetJSON } from "@/lib/storage";
import { profileKeyFor } from "@/lib/profileKeys";
import type { CharacterProfile, GameMode, QAItem } from "@/lib/types";

export const runtime = "nodejs";

type JudgeRequest = {
  mode?: GameMode;
  gameId?: string;
  dateKey?: string; // required for daily
  judgment?: "HEAVEN" | "HELL";
  qa?: QAItem[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as JudgeRequest;
    const mode = body.mode === "debug-random" ? "debug-random" : "daily";
    const dateKey = (body.dateKey || "").trim();
    const gameId = (body.gameId || "").trim() || dateKey;
    const judgment = body.judgment;
    const qa = Array.isArray(body.qa) ? body.qa : [];

    if (!judgment || (judgment !== "HEAVEN" && judgment !== "HELL")) {
      return NextResponse.json({ error: "Missing judgment" }, { status: 400 });
    }
    if (mode === "daily" && !dateKey) {
      return NextResponse.json({ error: "Missing dateKey for daily mode" }, { status: 400 });
    }

    const key = profileKeyFor(mode, gameId, dateKey);
    const profile = await kvGetJSON<CharacterProfile>(key);
    if (!profile) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const correctJudgment = profile.alignment === "GOOD" ? "HEAVEN" : "HELL";
    const correct = judgment === correctJudgment;

    const openai = getOpenAIClient();
    const prompt = buildGodPrompt(profile, qa, judgment, correctJudgment);
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL_ID,
      messages: [{ role: "system", content: prompt }],
      max_completion_tokens: 650,
      reasoning_effort:
        DEFAULT_MODEL_ID === "gpt-5.2-2025-12-11" ? ("none" as any) : "minimal",
      verbosity: "low",
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const godMessage = parseGodResponse(raw);

    return NextResponse.json({ correct, godMessage });
  } catch (error) {
    console.error("Error in /api/game/judge:", error);
    return NextResponse.json({ error: "Failed to judge" }, { status: 500 });
  }
}

function buildGodPrompt(
  profile: CharacterProfile,
  qa: QAItem[],
  playerJudgment: "HEAVEN" | "HELL",
  correctJudgment: "HEAVEN" | "HELL",
): string {
  const { visible, hidden, alignment, faceEmoji } = profile;
  const transcript =
    qa.length === 0
      ? "(THE PLAYER ASKED NO QUESTIONS.)"
      : qa
          .slice(0, 5)
          .map((item, i) => `Q${i + 1}: ${item.q}\nA${i + 1}: ${item.a}`)
          .join("\n");

  return `YOU ARE GOD. OLD TESTAMENT THUNDER. MONTY PYTHON ENERGY. ALL CAPS ALWAYS.

YOU ARE DELIVERING THE FINAL VERDICT SCREEN FOR A MOBILE GAME CALLED "PEARLY GATES".

FACTS (DO NOT CONTRADICT):
- THE PLAYER STAMPED: ${playerJudgment}
- THE CORRECT STAMP WAS: ${correctJudgment}
- THE SOUL'S TRUE ALIGNMENT: ${alignment}

CHARACTER CARD (PLAYER SAW THIS):
- FACE: ${faceEmoji}
- NAME: ${visible.name}
- AGE: ${visible.age}
- OCCUPATION: ${visible.occupation}
- CAUSE OF DEATH: ${visible.causeOfDeath}

HIDDEN TRUTH (FOR YOU ONLY):
- BIO: ${hidden.bio}
- 3 BEST ACTS:
  1) ${hidden.bestActs[0]}
  2) ${hidden.bestActs[1]}
  3) ${hidden.bestActs[2]}
- 3 WORST ACTS:
  1) ${hidden.worstActs[0]}
  2) ${hidden.worstActs[1]}
  3) ${hidden.worstActs[2]}

PLAYER TRANSCRIPT:
${transcript}

YOUR JOB:
- WRITE A SHORT GAME-OVER MESSAGE AS GOD.
- IT MUST BE FUNNY, THUNDEROUS, AND SPECIFIC.
- IT MUST CLEARLY STATE WHETHER THE PLAYER WAS CORRECT.
- IF THE PLAYER WAS WRONG, COMEDICALLY EXPOSE WHAT THEY MISSED (REFERENCE THE HIDDEN ACTS).
- IF THE PLAYER WAS RIGHT, CONGRATULATE THEM BUT STILL ROAST THEM A LITTLE.
- DO NOT REVEAL THE ENTIRE DOSSIER AS A LIST; WEAVE IT INTO THE JOKE.
- 4–8 LINES. EACH LINE SHOULD FEEL LIKE A GODLY PRONOUNCEMENT.

CRITICAL FAIRNESS RULE (MANDATORY):
- YOU MAY ONLY CLAIM THE PLAYER "SAW", "HEARD", "KNEW", "NOTICED", OR "WITNESSED" THINGS THAT APPEAR IN THE PLAYER TRANSCRIPT OR THE CHARACTER CARD ABOVE.
- DO NOT INVENT IMPLIED EVIDENCE. DO NOT SAY "THOU SAW..." ABOUT ANY SPECIFIC ACT UNLESS IT IS IN THE TRANSCRIPT.
- YOU MAY REVEAL NEW FACTS FROM HIDDEN TRUTH, BUT YOU MUST FRAME THEM AS GOD REVEALING THEM NOW.
  - GOOD: "I REVEAL...", "BEHOLD...", "LO, THE TRUTH IS THIS..."
  - ALSO OK: "THOU DIDST NOT ASK ABOUT...", "THOU DIDST NOT DIG DEEP ENOUGH TO LEARN..."
- WHEN REFERENCING WHY THE PLAYER ERRED, SPEAK ABOUT THEIR QUESTIONS/ANSWERS/ASSUMPTIONS, NOT ABOUT THEM SEEING EVENTS YOU DID NOT STATE EARLIER.
- AVOID PHRASES LIKE "THOU SAW ONE..." / "YOU SAW..." / "YOU WATCHED..." UNLESS THE TRANSCRIPT CONTAINS IT.

RESPOND ONLY WITH STRICT JSON IN THIS SHAPE:
{"godMessage": "string"}
`.trim();
}

function parseGodResponse(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { godMessage?: unknown };
    if (typeof parsed.godMessage === "string" && parsed.godMessage.trim()) {
      return parsed.godMessage.trim();
    }
  } catch {
    // fall through
  }

  const m = raw.match(/"godMessage"\s*:\s*"([\s\S]*?)"/i);
  if (m && m[1]) return m[1].trim();

  // fallback
  return "VERDICT: INCONCLUSIVE.\nMORTAL, THE HEAVENS ARE EXPERIENCING TECHNICAL DIFFICULTIES.\nTRY AGAIN.";
}


