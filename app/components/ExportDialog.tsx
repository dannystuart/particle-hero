"use client";

import { useEffect, useMemo, useState } from "react";
import type { BgRemoval, Settings } from "../portraits";

type PortraitRef = { src: string; kind?: "image" | "video"; bg?: BgRemoval };

type Props = {
  settings: Settings;
  portrait: PortraitRef;
  onClose: () => void;
};

const EMBED_URL = "/embed/embed.js";

/** The tuned config object passed as mount()'s second argument. */
function buildConfig(settings: Settings, portrait: PortraitRef, srcValue: string) {
  const isVideo = (portrait.kind ?? "image") === "video";
  const config: Record<string, unknown> = { src: srcValue, kind: portrait.kind ?? "image" };
  if (!isVideo) config.cutout = portrait.bg ?? { mode: "alpha" };
  config.polarity = settings.polarity;
  config.background = settings.background;
  config.fit = settings.fit;
  config.zoom = settings.zoom;
  config.count = settings.count;
  config.size = settings.size;
  config.contrast = settings.contrast;
  config.color = settings.color;
  config.gradient = settings.gradient;
  config.cursorSize = settings.cursorSize;
  config.cursorStyle = settings.cursorStyle;
  return config;
}

function buildSnippet(config: Record<string, unknown>): string {
  const body = JSON.stringify(config, null, 2).replace(/\n/g, "\n  ");
  return `<!-- Particle Portrait — paste into your hero. Host embed.js on your site. -->
<div id="particle-hero" style="width:100%;height:100vh"></div>
<script src="${EMBED_URL}"></script>
<script>
  ParticlePortrait.mount('#particle-hero', ${body});
</script>`;
}

async function toDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

export default function ExportDialog({ settings, portrait, onClose }: Props) {
  const isVideo = (portrait.kind ?? "image") === "video";
  const [inline, setInline] = useState(false);
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"config" | "snippet" | null>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch + encode the image the first time "inline" is switched on (images only).
  const toggleInline = async (checked: boolean) => {
    setInline(checked);
    if (!checked || isVideo || dataUri) return;
    setBusy(true);
    try {
      setDataUri(await toDataUri(portrait.src));
    } catch {
      setInline(false);
    } finally {
      setBusy(false);
    }
  };

  const srcValue = inline && dataUri ? dataUri : isVideo ? "YOUR_VIDEO_URL" : "YOUR_IMAGE_URL";
  const config = useMemo(
    () => buildConfig(settings, portrait, srcValue),
    [settings, portrait, srcValue],
  );
  const configJson = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const snippet = useMemo(() => buildSnippet(config), [config]);

  const copy = (which: "config" | "snippet", text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1400);
    });
  };

  const inlineNote =
    inline && dataUri
      ? `Image inlined (${Math.round(dataUri.length / 1024)} KB) — snippet is self-contained.`
      : busy
        ? "Encoding image…"
        : "";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Export effect"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-white/12 bg-[#0c0c0e] font-mono text-[11px] text-white/80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="uppercase tracking-[0.28em] text-white/60">Export</span>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 transition hover:text-white/90"
            aria-label="Close export"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <p className="leading-relaxed text-white/45">
            Drop this into the hero of any site — plain HTML, React, Vue, Webflow. Download{" "}
            <code className="text-white/70">embed.js</code>, host it on your site, then paste the
            snippet and point <code className="text-white/70">src</code> at your image or video URL.
          </p>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={EMBED_URL}
              download="particle-portrait.js"
              className="rounded border border-white/15 px-3 py-1.5 uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white"
            >
              ↓ Download embed.js
            </a>
            {!isVideo && (
              <label className="flex items-center gap-2 text-white/55">
                <input
                  type="checkbox"
                  checked={inline}
                  onChange={(e) => toggleInline(e.target.checked)}
                  className="h-3.5 w-3.5 accent-white"
                />
                Inline image (self-contained)
              </label>
            )}
            {inlineNote && <span className="text-white/35">{inlineNote}</span>}
          </div>

          {/* Snippet */}
          <Field
            label="Paste-in snippet"
            value={snippet}
            rows={12}
            copied={copied === "snippet"}
            onCopy={() => copy("snippet", snippet)}
          />

          {/* Raw config */}
          <Field
            label="Config only (JSON)"
            value={configJson}
            rows={8}
            copied={copied === "config"}
            onCopy={() => copy("config", configJson)}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  rows,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  rows: number;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="uppercase tracking-[0.18em] text-white/45">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded border border-white/15 px-2 py-0.5 uppercase tracking-wider text-white/60 transition hover:border-white/40 hover:text-white"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <textarea
        readOnly
        value={value}
        rows={rows}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-none rounded-lg border border-white/10 bg-black/50 p-2.5 leading-relaxed text-white/75 outline-none focus:border-white/30"
        spellCheck={false}
      />
    </div>
  );
}
