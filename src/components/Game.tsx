"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { MAX_QUESTION_CHARS, MAX_QUESTIONS } from "@/lib/constants";
import { usePearlyGatesGame } from "@/hooks/usePearlyGatesGame";

type Judgment = "HEAVEN" | "HELL";

export function Game() {
  const {
    state,
    isLoaded,
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
  } = usePearlyGatesGame();

  const [question, setQuestion] = useState("");
  const [judgeDrawerOpen, setJudgeDrawerOpen] = useState(false);
  const qaScrollRef = useRef<HTMLDivElement | null>(null);
  const faceRef = useRef<HTMLDivElement | null>(null);

  const qaCount = state?.qa.filter((x) => (x.from || "SOUL") === "SOUL").length ?? 0;
  const questionsLeft = MAX_QUESTIONS - qaCount;

  useEffect(() => {
    const el = qaScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [qaCount, state?.isComplete]);

  const canAsk = useMemo(() => {
    if (!state) return false;
    if (state.isComplete) return false;
    if (asking || loading) return false;
    if (qaCount >= MAX_QUESTIONS) return false;
    return true;
  }, [state, asking, loading, qaCount]);

  const canStamp = useMemo(() => {
    if (!state) return false;
    if (state.isComplete) return false;
    if (judging) return false;
    return true;
  }, [state, judging]);

  const onSubmitQuestion = async () => {
    if (!canAsk) return;
    const trimmed = question.trim();
    if (!trimmed) return;
    await ask(trimmed);
    setQuestion("");
  };

  const handleStamp = async (judgment: Judgment) => {
    if (!canStamp) return;
    await judge(judgment);
  };

  const faceEmoji = state?.visible.faceEmoji || "🙂";
  const hasProfile = Boolean(state?.visible.name);

  // Close the judge drawer on escape
  useEffect(() => {
    if (!judgeDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setJudgeDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [judgeDrawerOpen]);

  return (
    <div className="h-full flex flex-col">
      <header className="px-5 pt-2 pb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-xl text-pg-gold drop-shadow-[0_6px_16px_rgba(0,0,0,0.7)]">
            Pearly Gates
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetDaily}
            className="rounded-full border border-white/15 px-3 py-1 bg-black/20 hover:bg-black/35 transition text-[0.7rem] text-pg-muted"
            disabled={!isLoaded}
          >
            Reset daily
          </button>
          <button
            type="button"
            onClick={startRandom}
            className="rounded-full border border-pg-cyan/40 px-3 py-1 bg-pg-cyan/15 hover:bg-pg-cyan/25 transition text-[0.7rem] text-pg-cyan"
            disabled={!isLoaded}
          >
            Random game
          </button>
        </div>
      </header>

      {!isLoaded || !state ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2 px-6">
            <div className="text-sm text-pg-muted">Spinning up…</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Top half: Gates */}
          <section className="flex-1 min-h-0 relative overflow-hidden px-4 pb-3 bg-white">
            <div className="absolute inset-0 pointer-events-none">
              {/* clouds */}
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[140%] h-40 bg-white/10 blur-2xl rounded-full" />
              <div className="absolute -bottom-16 left-1/3 w-[90%] h-40 bg-white/10 blur-2xl rounded-full" />
              <div className="absolute top-10 left-8 w-32 h-32 bg-pg-cyan/15 blur-2xl rounded-full" />
              <div className="absolute top-8 right-10 w-36 h-36 bg-pg-gold/15 blur-2xl rounded-full" />
            </div>

            {/* Click-away backdrop for judge drawer (top half only) */}
            {!state.isComplete && judgeDrawerOpen && (
              <div
                className="absolute inset-0 z-20"
                onClick={() => setJudgeDrawerOpen(false)}
              />
            )}

            {/* Gates asset + character face */}
            <div className="absolute inset-x-0 top-8 bottom-6 flex items-center justify-center">
              <div className="relative w-[min(340px,85%)]">
                <img
                  src="/gates.webp"
                  alt="Pearly gates"
                  className="w-full h-auto select-none pointer-events-none pg-bob"
                  draggable={false}
                />
                <div
                  ref={faceRef}
                  className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 select-none text-[92px] leading-none drop-shadow-[0_10px_24px_rgba(0,0,0,0.75)]"
                  aria-label="Character face"
                >
                  {faceEmoji}
                </div>

                {state.judgment && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className={`rotate-[-12deg] text-[2.1rem] font-black tracking-[0.22em] uppercase drop-shadow-[0_10px_16px_rgba(0,0,0,0.75)] ${
                        state.judgment === "HEAVEN" ? "text-pg-green" : "text-pg-red"
                      }`}
                      style={{ WebkitTextStroke: "3px rgba(0,0,0,0.55)" }}
                    >
                      {state.judgment}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Judge drawer (left side) */}
            {!state.isComplete && (
              <JudgeDrawer
                open={judgeDrawerOpen}
                setOpen={setJudgeDrawerOpen}
                canStamp={canStamp}
                faceRef={faceRef}
                onHeaven={() => handleStamp("HEAVEN")}
                onHell={() => handleStamp("HELL")}
              />
            )}
          </section>

          {/* Bottom half: Desk */}
          <section
            className="flex-1 min-h-0 px-4 py-3 flex flex-col gap-3 bg-center bg-no-repeat bg-cover relative"
            style={{ backgroundImage: "url(/desktop.webp)" }}
          >
            {/* Desk lip (overhang) */}
            <div className="pointer-events-none absolute -top-3 left-0 right-0 h-6 z-20">
              {/* Main lip surface */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-black/0" />
              {/* Highlight edge */}
              <div className="absolute top-3 left-0 right-0 h-px bg-white/25" />
              {/* Shadow cast onto desk */}
              <div className="absolute top-4 left-0 right-0 h-4 bg-gradient-to-b from-black/35 to-transparent" />
            </div>

            {error && (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[0.75rem] text-red-200">
                {error}
              </div>
            )}

            <div className="flex-1 min-h-0 flex gap-3">
              {/* Left: interrogation */}
              <div className="flex-1 min-w-0 flex flex-col gap-3">
                {/* Legal pad transcript */}
                <div
                  ref={qaScrollRef}
                  className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-black/60 pg-legalpad text-black shadow-[0_14px_28px_rgba(0,0,0,0.30)]"
                >
                  {state.qa.length === 0 && !state.isComplete ? (
                    <div className="text-black/55 pg-legalpad-sheet">
                      Ask questions to determine where this Soul belongs.
                    </div>
                  ) : (
                    <pre
                      className="whitespace-pre-wrap pg-legalpad-sheet"
                      style={{ margin: 0 }}
                    >
                      {state.qa
                        .map((item, idx) => `${idx + 1}. ${item.q}\n“${item.a}”`)
                        .join("\n\n")}
                    </pre>
                  )}
                </div>

                {/* If complete but no verdict yet: retry */}
                {state.isComplete && !state.godMessage && (
                  <button
                    type="button"
                    onClick={retryVerdict}
                    className="w-full rounded-full bg-gradient-to-r from-pg-gold to-pg-cyan px-4 py-2 text-sm font-bold text-black shadow-pg-glow disabled:opacity-60"
                    disabled={judging}
                  >
                    {judging ? "Summoning…" : "Retry verdict"}
                  </button>
                )}

                {/* Input row */}
                {!state.isComplete && (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <input
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onSubmitQuestion();
                          }
                        }}
                        maxLength={MAX_QUESTION_CHARS}
                        placeholder="Ask a question…"
                        className="w-full rounded-2xl bg-black border border-white/35 pl-3.5 pr-16 py-2.5 text-[0.9rem] text-pg-text shadow-inner opacity-100"
                        disabled={!canAsk}
                        aria-label="Question"
                      />
                      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.7rem] text-pg-muted/70">
                        {question.length}/{MAX_QUESTION_CHARS}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={onSubmitQuestion}
                        disabled={!canAsk || !question.trim()}
                    className={`flex-1 rounded-full bg-gradient-to-r from-pg-gold to-pg-cyan px-4 py-2 text-[0.85rem] font-bold text-black shadow-pg-glow opacity-100 disabled:cursor-not-allowed disabled:brightness-75 disabled:saturate-75 ${
                      asking ? "brightness-75 saturate-75" : ""
                    }`}
                      >
                        {asking ? "Asking…" : `Ask (${qaCount + 1}/${MAX_QUESTIONS})`}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: character info panel */}
              <aside className="w-[40%] max-w-[14.5rem] min-w-[10.5rem] flex flex-col">
                <div
                  className="flex-1 min-h-0 relative overflow-hidden overflow-x-hidden border border-black/80 bg-[#f7e9b9] text-black shadow-[0_18px_40px_rgba(0,0,0,0.45)] font-body"
                  style={{
                    // Toe-tag-ish clipped corners (45° cuts on top left + top right)
                    clipPath:
                      "polygon(40px 0%, calc(100% - 40px) 0%, 100% 40px, 100% 100%, 0% 100%, 0% 40px)",
                    // Square bottom corners
                    borderRadius: "0px",
                  }}
                >
                  {/* Form content */}
                  <div className="relative z-10 h-full px-3 pt-2 pb-2 overflow-y-auto overflow-x-hidden">
                    {/* Grommet + string (scrolls with content) */}
                    <div className="relative flex items-start justify-center pt-1 pb-2">
                      <div className="relative w-8 h-8 opacity-90">
                        <div className="absolute inset-0 rounded-full bg-[#c77a2f] border border-black/70" />
                        <div className="absolute inset-[8px] rounded-full bg-[#12041f] border border-black/60" />
                      </div>
                      <div className="absolute left-1/2 top-10 -translate-x-1/2 w-[200px] h-[120px] pointer-events-none opacity-70">
                        <div className="absolute left-0 top-4 w-[240px] h-[2px] bg-black/12 rotate-[18deg] origin-left" />
                        <div className="absolute left-0 top-14 w-[260px] h-[2px] bg-black/10 rotate-[10deg] origin-left" />
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[0.55rem] tracking-[0.22em] font-black uppercase text-black/75">
                        Soul intake
                      </div>
                      <div className="text-[0.55rem] tracking-[0.22em] font-black uppercase text-black/45">
                        Case No.{" "}
                        {typeof (state.visible as any).caseNumber === "number"
                          ? String((state.visible as any).caseNumber).padStart(4, "0")
                          : "----"}
                      </div>
                    </div>

                    <div className="mt-1.5 border-t border-black/70" />

                    <div className="pt-1.5 space-y-2">
                      {/* Two-column layout with independent vertical flow:
                          left = Name -> Occupation, right = Age -> Cause */}
                      <div className="grid grid-cols-2 gap-2 items-start">
                        <div className="flex flex-col gap-2 min-w-0">
                          <FieldRow
                            label="Deceased Name"
                            value={hasProfile ? state.visible.name : "Loading…"}
                            multiline
                          />
                          <FieldRow
                            label="Occupation"
                            value={hasProfile ? state.visible.occupation : ""}
                            multiline
                          />
                        </div>
                        <div className="flex flex-col gap-2 min-w-0">
                          <div className="w-14">
                            <FieldRow
                              label="Age"
                              value={hasProfile ? String(state.visible.age) : ""}
                              small
                            />
                          </div>
                          <FieldRow
                            label="Cause of death"
                            value={hasProfile ? state.visible.causeOfDeath : ""}
                            multiline
                            small
                          />
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </aside>
            </div>
          </section>
        </div>
      )}

      {popup && (
        <Modal
          title={popup.title}
          message={popup.message}
          onClose={dismissPopup}
        />
      )}
    </div>
  );
}

function JudgeDrawer({
  open,
  setOpen,
  canStamp,
  faceRef,
  onHeaven,
  onHell,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  canStamp: boolean;
  faceRef: React.RefObject<HTMLDivElement | null>;
  onHeaven: () => void;
  onHell: () => void;
}) {
  const drawerWidth = 150;
  const tabWidth = 44;

  return (
    <div
      className="absolute left-0 top-1/2 -translate-y-1/2 z-30 select-none"
      style={{
        width: drawerWidth + tabWidth,
        transform: open ? "translateX(0px) translateY(-50%)" : `translateX(-${drawerWidth}px) translateY(-50%)`,
        transition: "transform 240ms cubic-bezier(0.2, 0.9, 0.2, 1)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-stretch">
        {/* Drawer panel */}
        <div
          className="h-44 rounded-r-2xl border border-white/15 bg-black/45 backdrop-blur shadow-pg-card px-3 py-3 flex flex-col justify-center gap-3"
          style={{ width: drawerWidth }}
        >
          <DraggableStamp
            label="HEAVEN"
            colorClass="text-emerald-800"
            disabled={!canStamp}
            faceRef={faceRef}
            onStamp={onHeaven}
          />
          <DraggableStamp
            label="HELL"
            colorClass="text-pg-red"
            disabled={!canStamp}
            faceRef={faceRef}
            onStamp={onHell}
          />
        </div>

        {/* Tab */}
        <button
          type="button"
          className="h-44 rounded-r-[999px] border border-white/15 bg-black/55 backdrop-blur shadow-pg-card flex items-center justify-center px-2"
          style={{ width: tabWidth }}
          onClick={() => setOpen(!open)}
        >
          <span
            className="text-[0.62rem] font-black tracking-[0.25em] text-pg-gold uppercase"
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              lineHeight: 1,
            }}
          >
            OPEN TO JUDGE
          </span>
        </button>
      </div>
    </div>
  );
}

function Modal({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/70">
      <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-black/70 backdrop-blur shadow-pg-card px-4 py-3">
        <div className="text-[0.65rem] tracking-[0.25em] uppercase text-pg-gold font-black">
          {title}
        </div>
        <pre className="mt-2 whitespace-pre-wrap text-[0.9rem] leading-snug font-semibold text-pg-text">
          {message}
        </pre>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gradient-to-r from-pg-gold to-pg-cyan px-4 py-2 text-[0.85rem] font-bold text-black shadow-pg-glow"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  multiline = false,
  small = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  small?: boolean;
}) {
  return (
    <div className={small ? "space-y-0.5" : "space-y-1"}>
      <div
        className={`tracking-[0.22em] font-black uppercase text-black/75 ${
          small ? "text-[0.5rem]" : "text-[0.54rem]"
        } font-body`}
      >
        {label}
      </div>
      <div className={small ? "pb-0.5" : "pb-1"}>
        <div
          className={`min-w-0 font-semibold text-black break-words font-typewriter ${
            small ? "text-[0.7rem] leading-snug" : "text-[0.74rem] leading-snug"
          }`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function DraggableStamp({
  label,
  colorClass,
  disabled,
  faceRef,
  onStamp,
}: {
  label: Judgment;
  colorClass: string;
  disabled: boolean;
  faceRef: React.RefObject<HTMLDivElement | null>;
  onStamp: () => void;
}) {
  const [drag, setDrag] = useState<null | { x: number; y: number; active: boolean }>(null);
  const isDragging = !!drag?.active;
  const pointerIdRef = useRef<number | null>(null);

  const finish = useCallback((x: number, y: number) => {
    const face = faceRef.current;
    if (!face) return;
    const r = face.getBoundingClientRect();
    const hit = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    if (hit) onStamp();
  }, [faceRef, onStamp]);

  // Track drag globally so the ghost always follows the pointer (even on mobile Safari).
  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: PointerEvent) => {
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      setDrag({ x: e.clientX, y: e.clientY, active: true });
    };

    const onUp = (e: PointerEvent) => {
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      const x = e.clientX;
      const y = e.clientY;
      pointerIdRef.current = null;
      setDrag(null);
      finish(x, y);
    };

    const onCancel = (e: PointerEvent) => {
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      pointerIdRef.current = null;
      setDrag(null);
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      setDrag({ x: t.clientX, y: t.clientY, active: true });
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const x = t?.clientX ?? drag?.x ?? 0;
      const y = t?.clientY ?? drag?.y ?? 0;
      pointerIdRef.current = null;
      setDrag(null);
      finish(x, y);
    };
    const onTouchCancel = () => {
      pointerIdRef.current = null;
      setDrag(null);
    };

    // Use document + capture so we still receive events under various stacking contexts.
    document.addEventListener("pointermove", onMove, { passive: true, capture: true });
    document.addEventListener("pointerup", onUp, { passive: true, capture: true });
    document.addEventListener("pointercancel", onCancel, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true, capture: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true, capture: true });

    return () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onCancel, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchCancel, true);
    };
  }, [drag?.x, drag?.y, finish, isDragging]);

  return (
    <>
      <button
        type="button"
        className={`relative select-none rounded-md border-4 border-current bg-white/90 px-4 py-2 text-[0.85rem] font-black tracking-[0.22em] uppercase ${
          colorClass
        } shadow-[inset_0_0_0_2px_rgba(0,0,0,0.08),0_10px_22px_rgba(0,0,0,0.25)] ${
          disabled ? "opacity-60 cursor-not-allowed" : "active:scale-[0.98]"
        } ${isDragging ? "opacity-0" : "opacity-100"}`}
        disabled={disabled}
        onPointerDown={(e) => {
          if (disabled) return;
          try {
            (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
          } catch {
            // some browsers may not support pointer capture here
          }
          pointerIdRef.current = e.pointerId;
          setDrag({ x: e.clientX, y: e.clientY, active: true });
        }}
        onTouchStart={(e) => {
          if (disabled) return;
          const t = e.touches[0];
          if (!t) return;
          setDrag({ x: t.clientX, y: t.clientY, active: true });
        }}
      >
        {label}
      </button>

      {drag?.active &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`fixed left-0 top-0 pointer-events-none z-[9999] select-none rounded-md border-4 border-current bg-white/95 px-4 py-2 text-[0.85rem] font-black tracking-[0.22em] uppercase ${colorClass} shadow-[inset_0_0_0_2px_rgba(0,0,0,0.08),0_18px_40px_rgba(0,0,0,0.65)]`}
            style={{
              transform: `translate(${drag.x}px, ${drag.y}px) translate(-50%, -50%)`,
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}


