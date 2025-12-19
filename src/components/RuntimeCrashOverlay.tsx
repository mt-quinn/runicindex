"use client";

import { useEffect, useState } from "react";

type Crash = {
  message: string;
  stack?: string;
  source?: string;
  time: number;
};

export function RuntimeCrashOverlay() {
  const [crash, setCrash] = useState<Crash | null>(null);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const err = event.error as any;
      setCrash({
        message: String(err?.message || event.message || "Unknown error"),
        stack: typeof err?.stack === "string" ? err.stack : undefined,
        source:
          typeof event.filename === "string"
            ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}`
            : undefined,
        time: Date.now(),
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as any;
      setCrash({
        message: String(reason?.message || reason || "Unhandled rejection"),
        stack: typeof reason?.stack === "string" ? reason.stack : undefined,
        source: "unhandledrejection",
        time: Date.now(),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!crash) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/85 text-white shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="font-display text-sm tracking-wide">RUNTIME CRASH</div>
          <button
            type="button"
            className="text-xs rounded-full border border-white/20 px-3 py-1 bg-white/10 hover:bg-white/15"
            onClick={() => setCrash(null)}
          >
            Dismiss
          </button>
        </div>

        <div className="px-4 py-3 space-y-2">
          <div className="text-xs text-white/70">Copy/paste this into chat:</div>
          <pre className="text-[11px] leading-snug whitespace-pre-wrap break-words bg-white/5 border border-white/10 rounded-xl p-3 max-h-[50vh] overflow-auto">
            {[
              crash.message,
              crash.source ? `Source: ${crash.source}` : null,
              crash.stack ? `\n${crash.stack}` : null,
            ]
              .filter(Boolean)
              .join("\n")}
          </pre>
        </div>
      </div>
    </div>
  );
}


