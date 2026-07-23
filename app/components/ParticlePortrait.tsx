"use client";

import { useEffect, useRef } from "react";
import type { BgRemoval, Settings } from "../portraits";
import { createParticlePortrait, type PortraitHandle } from "../engine/core";

type Props = {
  src: string;
  kind?: "image" | "video";
  bg?: BgRemoval;
  settings: Settings;
  view?: "particles" | "source";
  /** Accessible label for the rendered subject. */
  label?: string;
};

/**
 * Thin React wrapper around the framework-free engine in `engine/core.ts`.
 * The engine creates its own <canvas> + cursor inside this host div, so the
 * playground runs the exact same code that ships in the standalone embed.
 */
export default function ParticlePortrait({ src, kind, bg, settings, view, label }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PortraitHandle | null>(null);
  // Latest settings/view/label for the create effect (which is keyed only on source).
  const settingsRef = useRef(settings);
  const viewRef = useRef(view);
  const labelRef = useRef(label);

  // Keep the latest-value refs fresh (declared first so they update before the
  // create effect reads them on a source-change commit).
  useEffect(() => {
    settingsRef.current = settings;
    viewRef.current = view;
    labelRef.current = label;
  });

  // Create / recreate the engine when the SOURCE changes — not on every tweak.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = createParticlePortrait(host, {
      src,
      kind,
      bg,
      settings: settingsRef.current,
      view: viewRef.current,
      label: labelRef.current,
    });
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
  }, [src, kind, bg]);

  // Push live settings without restarting the engine.
  useEffect(() => {
    handleRef.current?.update({ src, kind, bg, settings, view, label });
  }, [settings, src, kind, bg, view, label]);

  return <div ref={hostRef} className="absolute inset-0 overflow-hidden bg-black" />;
}
