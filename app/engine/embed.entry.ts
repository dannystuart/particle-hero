// Standalone entry for the framework-agnostic embed.
//
// esbuild bundles this + core.ts into public/particle-portrait/embed.js (a
// minified, dependency-free IIFE) via `pnpm build:embed`. On any website:
//
//   <div id="hero" style="width:100%;height:100vh"></div>
//   <script src="/particle-portrait/embed.js"></script>
//   <script>ParticlePortrait.mount('#hero', { src: 'IMAGE_URL', ...config });</script>
//
// The <particle-portrait> custom element is optional sugar over the same mount.

import { createParticlePortrait, type PortraitHandle } from "./core";
import type { BgRemoval, Settings } from "../portraits";

/** Flat, ergonomic config for the snippet: the tuned settings + the source. */
type MountConfig = Partial<Settings> & {
  /** Image or video URL the target site can load. */
  src: string;
  /** "image" (default) or "video". */
  kind?: "image" | "video";
  /** How to separate the subject from its background (images). Default alpha cutout. */
  cutout?: BgRemoval;
  /** Accessible label. */
  label?: string;
};

// Fallback settings for hand-written partial configs (the exporter writes every
// field explicitly, so this only fills gaps). Keep in sync with DEFAULT_SETTINGS.
const DEFAULTS: Settings = {
  polarity: "light-on-dark",
  background: { type: "solid", color: "#000000" },
  fit: "contain",
  zoom: 1,
  count: 42000,
  size: 1.25,
  contrast: 0.5,
  color: "#ffffff",
  gradient: { type: "none", from: "#5b8cff", to: "#0a1a3f", angle: 90 },
  cursorSize: 90,
  cursorStyle: "ring",
};

function mount(
  target: string | HTMLElement,
  config: MountConfig,
): PortraitHandle | null {
  const el =
    typeof target === "string"
      ? (document.querySelector(target) as HTMLElement | null)
      : target;
  if (!el) {
    console.warn("[ParticlePortrait] mount target not found:", target);
    return null;
  }
  const { src, kind, cutout, label, ...rest } = config;
  const settings: Settings = { ...DEFAULTS, ...rest };
  return createParticlePortrait(el, { src, kind, bg: cutout, settings, label });
}

// Optional declarative sugar: <particle-portrait src="..." config='{...}'>
function defineElement() {
  if (typeof customElements === "undefined" || customElements.get("particle-portrait")) {
    return;
  }
  class ParticlePortraitElement extends HTMLElement {
    private handle: PortraitHandle | null = null;
    connectedCallback() {
      if (getComputedStyle(this).display === "inline") this.style.display = "block";
      let cfg: Partial<MountConfig> = {};
      const raw = this.getAttribute("config");
      if (raw) {
        try {
          cfg = JSON.parse(raw);
        } catch {
          console.warn("[particle-portrait] invalid config attribute JSON");
        }
      }
      const src = this.getAttribute("src") ?? cfg.src;
      if (!src) {
        console.warn("[particle-portrait] missing src");
        return;
      }
      const kindAttr = this.getAttribute("kind");
      this.handle = mount(this, {
        ...cfg,
        src,
        kind: (kindAttr as "image" | "video" | null) ?? cfg.kind,
      });
    }
    disconnectedCallback() {
      this.handle?.destroy();
      this.handle = null;
    }
  }
  customElements.define("particle-portrait", ParticlePortraitElement);
}

defineElement();

const api = { mount, version: "1.0.0" };
// Expose as a global for the <script> drop-in.
(globalThis as unknown as { ParticlePortrait?: typeof api }).ParticlePortrait = api;

export default api;
export { mount };
