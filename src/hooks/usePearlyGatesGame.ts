"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DAILY_STORAGE_KEY, MAX_QUESTION_CHARS, MAX_QUESTIONS } from "@/lib/constants";
import { todayLocalDateKey } from "@/lib/dateKey";
import { godObviousQuestionWarning, isObviousAlignmentQuestion } from "@/lib/obviousQuestionGuard";
import type { ClientGameState, GameMode, QAItem } from "@/lib/types";

type StartResponse = {
  mode: GameMode;
  dateKey: string;
  gameId: string;
  visible: {
    caseNumber: number;
    name: string;
    age: number;
    occupation: string;
    causeOfDeath: string;
    portraitUrl?: string;
  };
};

type AskResponse = { answer?: string; blocked?: boolean; godMessage?: string };
type JudgeResponse = { correct: boolean; godMessage: string };
type ErrorResponse = { error?: string };

function reviveState(raw: unknown): ClientGameState | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as any;
  if (!v.dateKey || !v.gameId || !v.visible) return null;
  if (v.mode !== "daily" && v.mode !== "debug-random") return null;
  // Migration: old saves stored a faceEmoji. We removed emojis entirely.
  if (v.visible && typeof v.visible === "object" && "faceEmoji" in v.visible) {
    try {
      delete v.visible.faceEmoji;
    } catch {
      // ignore
    }
  }
  return v as ClientGameState;
}

function makeEmptyState(mode: GameMode, dateKey: string, gameId: string): ClientGameState {
  return {
    mode,
    dateKey,
    gameId,
    startedAt: Date.now(),
    visible: {
      caseNumber: 0,
      name: "",
      age: 0,
      occupation: "",
      causeOfDeath: "",
      portraitUrl: undefined,
    },
    qa: [],
    isComplete: false,
  };
}

export function usePearlyGatesGame() {
  const todayKey = useMemo(() => todayLocalDateKey(), []);
  const [state, setState] = useState<ClientGameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [judging, setJudging] = useState(false);
  const [popup, setPopup] = useState<null | { title: string; message: string }>(null);

  // load localStorage
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DAILY_STORAGE_KEY);
      if (stored) {
        const revived = reviveState(JSON.parse(stored));
        if (revived && revived.mode === "daily" && revived.dateKey === todayKey) {
          setState(revived);
          setLoading(false);
          return;
        }
      }
    } catch {
      // ignore
    }
    // fresh daily
    setState(makeEmptyState("daily", todayKey, todayKey));
    setLoading(false);
  }, [todayKey]);

  // persist localStorage
  useEffect(() => {
    if (!state) return;
    try {
      window.localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  const hasProfile = Boolean(
    state?.visible?.name &&
      state.visible.occupation &&
      state.visible.causeOfDeath &&
      typeof (state.visible as any).caseNumber === "number" &&
      (state.visible as any).caseNumber >= 1000 &&
      (state.visible as any).caseNumber <= 9999,
  );

  const start = useCallback(
    async (mode: GameMode) => {
      const dateKey = todayKey;
      setError(null);
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, dateKey }),
      });
      if (!res.ok) {
        let msg = "Could not start today's game.";
        try {
          const data = (await res.json()) as ErrorResponse;
          if (data?.error) msg = data.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as StartResponse;
      setState((prev) => {
        const next = makeEmptyState(data.mode, data.dateKey, data.gameId);
        next.visible = { ...data.visible };
        // If we were restarting within the same mode/day, keep completion state only if it matches.
        if (prev && prev.mode === data.mode && prev.dateKey === data.dateKey && prev.isComplete) {
          return prev;
        }
        return next;
      });
    },
    [todayKey],
  );

  // Ensure the daily profile exists / is loaded
  useEffect(() => {
    if (!state) return;
    if (state.isComplete) return;
    if (hasProfile) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await start(state.mode);
      } catch (e) {
        if (!cancelled) setError("Could not start today's game. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, hasProfile, start]);

  const resetDaily = useCallback(() => {
    setState(makeEmptyState("daily", todayKey, todayKey));
  }, [todayKey]);

  const startRandom = useCallback(async () => {
    try {
      setLoading(true);
      await start("debug-random");
    } catch {
      setError("Could not start a random game. Try again.");
    } finally {
      setLoading(false);
    }
  }, [start]);

  const recoverFromMissingServerProfile = useCallback(() => {
    // This is expected in local dev if server-side caching is in-memory and the dev server
    // restarts or hot-reloads: the client has a saved run, but the server forgot the dossier.
    setPopup({
      title: "GOD",
      message:
        "THE HEAVENS HAVE MISPLACED THIS DOSSIER.\nTHY RUN IS RESET.\nASK AGAIN, BUT WITH FEELING.",
    });
    if (!state) return;
    if (state.mode === "debug-random") {
      // new random soul
      void startRandom();
    } else {
      // reset local daily state so we force a fresh /api/game/start
      resetDaily();
    }
  }, [resetDaily, startRandom, state]);

  const ask = useCallback(
    async (question: string) => {
      if (!state || state.isComplete) return;
      const trimmed = question.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_QUESTION_CHARS) {
        setError(`Question must be ${MAX_QUESTION_CHARS} characters or fewer.`);
        return;
      }
      const askedSoFar = state.qa.filter((x) => (x.from || "SOUL") === "SOUL").length;
      if (askedSoFar >= MAX_QUESTIONS) {
        setError("No questions remaining.");
        return;
      }

      setError(null);
      setAsking(true);
      try {
        // Client-side fast path so we don't spend tokens on obvious questions.
        if (isObviousAlignmentQuestion(trimmed)) {
          setPopup({ title: "GOD", message: godObviousQuestionWarning() });
          return;
        }

        const res = await fetch("/api/game/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: state.mode,
            dateKey: state.dateKey,
            gameId: state.gameId,
            question: trimmed,
            qaSoFar: state.qa.filter((x) => (x.from || "SOUL") === "SOUL"),
          }),
        });
        if (!res.ok) {
          let msg = "Could not get an answer. Try again.";
          try {
            const data = (await res.json()) as ErrorResponse;
            if (data?.error) msg = data.error;
          } catch {
            // ignore
          }
          if (res.status === 404 && /game not found/i.test(msg)) {
            recoverFromMissingServerProfile();
            return;
          }
          throw new Error(msg);
        }
        const data = (await res.json()) as AskResponse;
        if (data.blocked) {
          setPopup({
            title: "GOD",
            message: (data.godMessage || godObviousQuestionWarning()).toString(),
          });
        } else {
          const a = (data.answer || "").toString();
          const item: QAItem = { q: trimmed, a, from: "SOUL" };
          setState((prev) => (prev ? { ...prev, qa: [...prev.qa, item] } : prev));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not get an answer. Try again.");
      } finally {
        setAsking(false);
      }
    },
    [state],
  );

  const judge = useCallback(
    async (judgment: "HEAVEN" | "HELL") => {
      if (!state || state.isComplete) return;
      setJudging(true);
      setError(null);
      // lock immediately (no undo)
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, isComplete: true, judgment };
      });
      try {
        const res = await fetch("/api/game/judge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: state.mode,
            dateKey: state.dateKey,
            gameId: state.gameId,
            judgment,
            qa: state.qa,
          }),
        });
        if (!res.ok) {
          let msg = "God is busy. Try again.";
          try {
            const data = (await res.json()) as ErrorResponse;
            if (data?.error) msg = data.error;
          } catch {
            // ignore
          }
          if (res.status === 404 && /game not found/i.test(msg)) {
            recoverFromMissingServerProfile();
            return;
          }
          throw new Error(msg);
        }
        const data = (await res.json()) as JudgeResponse;
        setState((prev) => {
          if (!prev) return prev;
          return { ...prev, wasCorrect: !!data.correct, godMessage: data.godMessage || "" };
        });
        setPopup({ title: "GOD", message: data.godMessage || "" });
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Judgment recorded, but God is busy. Tap to retry the verdict.",
        );
      } finally {
        setJudging(false);
      }
    },
    [state],
  );

  const retryVerdict = useCallback(async () => {
    if (!state || !state.isComplete || !state.judgment) return;
    if (state.godMessage) return;
    setJudging(true);
    setError(null);
    try {
      const res = await fetch("/api/game/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: state.mode,
          dateKey: state.dateKey,
          gameId: state.gameId,
          judgment: state.judgment,
          qa: state.qa,
        }),
      });
      if (!res.ok) {
        let msg = "Still no verdict. Try again in a moment.";
        try {
          const data = (await res.json()) as ErrorResponse;
          if (data?.error) msg = data.error;
        } catch {
          // ignore
        }
        if (res.status === 404 && /game not found/i.test(msg)) {
          recoverFromMissingServerProfile();
          return;
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as JudgeResponse;
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, wasCorrect: !!data.correct, godMessage: data.godMessage || "" };
      });
      setPopup({ title: "GOD", message: data.godMessage || "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Still no verdict. Try again in a moment.");
    } finally {
      setJudging(false);
    }
  }, [recoverFromMissingServerProfile, state]);

  const dismissPopup = useCallback(() => setPopup(null), []);

  return {
    state,
    isLoaded: !loading && !!state,
    loading,
    error,
    asking,
    judging,
    popup,
    dismissPopup,
    resetDaily,
    startRandom,
    ask,
    judge,
    retryVerdict,
    todayKey,
  } as const;
}


