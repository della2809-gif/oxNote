"use client";

import { useEffect, useState } from "react";

const MINIMUM_SPLASH_MS = 2300;
const SPLASH_EXIT_MS = 300;

export function SplashScreen() {
  const [phase, setPhase] = useState<"visible" | "exiting" | "hidden">("visible");

  useEffect(() => {
    const startedAt = performance.now();
    let holdTimer: number | undefined;
    let exitTimer: number | undefined;
    const hide = () => {
      const remaining = Math.max(0, MINIMUM_SPLASH_MS - (performance.now() - startedAt));
      holdTimer = window.setTimeout(() => {
        setPhase("exiting");
        exitTimer = window.setTimeout(() => setPhase("hidden"), SPLASH_EXIT_MS);
      }, remaining);
    };

    if (document.readyState === "complete") hide();
    else window.addEventListener("load", hide, { once: true });
    return () => {
      window.removeEventListener("load", hide);
      if (holdTimer) window.clearTimeout(holdTimer);
      if (exitTimer) window.clearTimeout(exitTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div className={`xo-splash${phase === "exiting" ? " xo-splash--exiting" : ""}`} role="img" aria-label="xonote, 틀려도 괜찮아. 다시 알면 되니까.">
      <div className="xo-splash-stage">
        <svg className="xo-splash-mark" viewBox="0 0 220 108" aria-hidden="true">
          <g stroke="#0E1533" strokeWidth="20" strokeLinecap="round">
            <path d="M20 18L92 90M92 18L20 90" />
          </g>
          <circle cx="168" cy="54" r="38" fill="none" stroke="#2E6BF5" strokeWidth="20" />
        </svg>
        <div className="xo-splash-wordmark">x<span>o</span>note</div>
        <div className="xo-splash-line1">틀려도 괜찮아.</div>
        <div className="xo-splash-line2">다시 알면 되니까.</div>
        <div className="xo-splash-line3">Mistakes make you better</div>
      </div>

      <div className="xo-splash-peek" aria-hidden="true">
        <svg viewBox="280 215 460 585">
          <g className="xo-splash-bob">
            <path d="M400 577L400 757q36 55 72 0q36 55 72 0q36 55 72 0L616 577Z" fill="#fff" stroke="#1A1A1A" strokeWidth="20" strokeLinejoin="round" />
            <circle cx="512" cy="447" r="205" fill="#fff" stroke="#1A1A1A" strokeWidth="22" />
            <g stroke="#1A1A1A" strokeWidth="22" strokeLinecap="round">
              <path d="M392 379L470 453M470 379L392 453" />
            </g>
            <circle cx="600" cy="419" r="44" fill="none" stroke="#1A1A1A" strokeWidth="22" />
            <ellipse cx="420" cy="511" rx="28" ry="19" fill="#E23A3A" />
            <ellipse cx="606" cy="515" rx="28" ry="19" fill="#3366E6" />
          </g>
        </svg>
      </div>
    </div>
  );
}
