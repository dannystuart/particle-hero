"use client";

import type { Portrait } from "../portraits";

type Props = {
  portraits: Portrait[];
  activeId: string;
  onSelect: (id: string) => void;
  /** True while the phone control sheet is expanded over this spot. */
  obscured?: boolean;
};

export default function PortraitNav({ portraits, activeId, onSelect, obscured }: Props) {
  if (portraits.length <= 1) return null;

  return (
    <nav
      aria-label="Portrait experiments"
      // Phone: sits above the collapsed control sheet, and gets out of the way
      // entirely once that sheet is expanded. Desktop: always bottom-centre.
      className={`fixed bottom-[max(4.75rem,calc(env(safe-area-inset-bottom)+4rem))] left-1/2 z-30 -translate-x-1/2 sm:bottom-6 ${
        obscured ? "hidden sm:block" : ""
      }`}
    >
      <div className="flex max-w-[92vw] gap-1 overflow-x-auto rounded-full border border-white/10 bg-black/45 p-1 font-mono text-[11px] uppercase tracking-[0.2em] backdrop-blur-md">
        {portraits.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            aria-current={p.id === activeId}
            className={`whitespace-nowrap rounded-full px-4 py-2 transition ${
              p.id === activeId
                ? "bg-white text-black"
                : "text-white/55 hover:text-white/90"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>
    </nav>
  );
}
