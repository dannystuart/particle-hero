// Framework-free particle-portrait engine.
//
// This is the ONE engine that powers both the React playground
// (components/ParticlePortrait.tsx wraps it) and the standalone embed
// (embed.entry.ts bundles it) — so what you tune in the playground is exactly
// what ships. No React, no imports beyond erased types.
//
// createParticlePortrait(container, config) creates its own <canvas> + cursor
// inside `container`, runs the animation, and returns a handle to update the
// live settings or tear everything down.

import type { BgRemoval, CursorStyle, Settings } from "../portraits";

export type EngineConfig = {
  /** Image or video URL. */
  src: string;
  /** "image" (default) or "video". */
  kind?: "image" | "video";
  /** Background removal — images only (video uses per-frame luminance). */
  bg?: BgRemoval;
  /** "particles" (default) or "source" — source reveals the original: the still
   *  image, or (for video) the live playing clip. A src/kind/bg change resets the
   *  engine to particles view, so callers holding "source" should re-assert or
   *  clear it. */
  view?: "particles" | "source";
  /** Live visual settings. */
  settings: Settings;
  /** Accessible label for the rendered subject. */
  label?: string;
};

export type PortraitHandle = {
  /** Apply new settings live (and re-init if src/kind/bg changed). */
  update(config: EngineConfig): void;
  /** Cancel the loop, remove listeners, and remove the elements we created. */
  destroy(): void;
};

// ---- Tuning constants (feel of the field) --------------------------------
const SAMPLE_LONG_EDGE = 800; // image sampling resolution cap (higher = finer detail)
const VIDEO_SAMPLE_LONG_EDGE = 360; // video is sampled every frame — balance detail vs. FPS
const COVER_FLOOR = 0.06; // video: ignore pixels that are ~never lit (dark bg)
const FIT_FRACTION = 0.86; // how much of the viewport the portrait fills
const DENSITY_BASE = 0.06; // baseline density across the whole subject (its shape)
const DENSITY_LUMA = 1.5; // extra density from brightness (the light)
const DENSITY_GAMMA = 1.5; // >1 pushes density toward the brightest areas
const DENSITY_EDGE = 2.4; // extra density from edges (crisper contours / definition)
const SPRING = 0.085; // pull back toward home (higher = quicker heal)
const DAMPING = 0.84; // velocity decay
const SPECK_ALPHA = 0.72; // per-speck opacity (additive)
const CONTRAST_POW_MAX = 3; // contrast=1 raises source luma to this power
const BRIGHT_FLOOR = 0.05; // images: shadows never fully vanish (holds the shape)
const VIDEO_LUMA_GATE = 0.08; // video: skip specks this frame doesn't light (kills the all-poses ghost)
const INTRO_MS = 1300; // "light comes up" fade-in
const BREATHE_AMP = 1.6; // max drift amplitude (CSS px) at rest
const MAX_EFFECTIVE_COUNT = 140000; // hard safety ceiling (embed configs only)
const MORPH_MS = 1000; // image ↔ particles crossfade duration
const MIN_FRAME_MS = 15; // cap ~60fps: 120Hz+ displays double the heat for no visible gain
const ALPHA_BUCKETS = 24; // speck alpha quantization — one state change per level, not per speck

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// The sampler is SOURCE-space only (analysis of the image/clip) — it does not
// depend on container size or fit, so it survives resize/fit/zoom untouched.
type Sampler = {
  cdf: Float64Array; // cumulative weights of eligible pixels
  idx: Int32Array; // linear pixel index for each eligible entry
  lum: Float32Array; // source luminance for each eligible entry
  total: number;
  sw: number;
  sh: number;
};

// Where the source rect lands in the canvas — depends on container size + fit.
type Rect = { drawW: number; drawH: number; offsetX: number; offsetY: number };

type Field = {
  hx: Float32Array; // home x/y in canvas px (recomputed from nx/ny on layout)
  hy: Float32Array;
  nx: Float32Array; // normalized home in [0,1] SAMPLE space (fit-independent)
  ny: Float32Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  phase: Float32Array; // breathing phase
  amp: Float32Array; // breathing amplitude
  lum: Float32Array; // source luminance (drives contrast) — updated live for video
  sidx: Int32Array; // sample-canvas pixel index of each particle's home
  count: number;
};

function luminance(r: number, g: number, b: number) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Analyse the image once: background mask, luminance, edges → weighted CDF. */
function buildSampler(img: HTMLImageElement, bg: BgRemoval): Sampler {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const k = Math.min(1, SAMPLE_LONG_EDGE / Math.max(iw, ih));
  const sw = Math.max(1, Math.round(iw * k));
  const sh = Math.max(1, Math.round(ih * k));

  const off = document.createElement("canvas");
  off.width = sw;
  off.height = sh;
  const octx = off.getContext("2d", { willReadFrequently: true });
  const empty: Sampler = {
    cdf: new Float64Array(0),
    idx: new Int32Array(0),
    lum: new Float32Array(0),
    total: 0,
    sw,
    sh,
  };
  if (!octx) return empty;
  octx.drawImage(img, 0, 0, sw, sh);
  const { data } = octx.getImageData(0, 0, sw, sh);
  const n = sw * sh;

  // Per-pixel luminance + alpha
  const luma = new Float32Array(n);
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    luma[i] = luminance(data[o], data[o + 1], data[o + 2]);
    alpha[i] = data[o + 3];
  }

  // Subject mask (true = part of the subject we sample)
  const subject = new Uint8Array(n);
  if (bg.mode === "alpha") {
    for (let i = 0; i < n; i++) subject[i] = alpha[i] > 24 ? 1 : 0;
  } else {
    const [br, bgc, bb] = bg.color;
    const tol = bg.tolerance * 255;
    const isBgColor = (i: number) => {
      const o = i * 4;
      return (
        Math.abs(data[o] - br) <= tol &&
        Math.abs(data[o + 1] - bgc) <= tol &&
        Math.abs(data[o + 2] - bb) <= tol
      );
    };
    if (bg.fromBorder !== false) {
      // Flood-fill the border-connected background so interior brights survive.
      const isBackground = new Uint8Array(n);
      const stack: number[] = [];
      const push = (x: number, y: number) => {
        const i = y * sw + x;
        if (!isBackground[i] && isBgColor(i)) {
          isBackground[i] = 1;
          stack.push(i);
        }
      };
      for (let x = 0; x < sw; x++) {
        push(x, 0);
        push(x, sh - 1);
      }
      for (let y = 0; y < sh; y++) {
        push(0, y);
        push(sw - 1, y);
      }
      while (stack.length) {
        const i = stack.pop() as number;
        const x = i % sw;
        const y = (i / sw) | 0;
        if (x > 0) push(x - 1, y);
        if (x < sw - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < sh - 1) push(x, y + 1);
      }
      for (let i = 0; i < n; i++) subject[i] = isBackground[i] || alpha[i] < 24 ? 0 : 1;
    } else {
      for (let i = 0; i < n; i++) subject[i] = !isBgColor(i) && alpha[i] > 24 ? 1 : 0;
    }
  }

  // Edge magnitude (Sobel on luminance), only meaningful inside the subject.
  const at = (x: number, y: number) => luma[y * sw + x];
  const edges = new Float32Array(n);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const i = y * sw + x;
      if (!subject[i]) continue;
      const gx =
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      edges[i] = Math.min(1, Math.hypot(gx, gy));
    }
  }

  // Weighted CDF over eligible pixels.
  const idxArr: number[] = [];
  const cdfArr: number[] = [];
  const lumArr: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!subject[i]) continue;
    const w =
      DENSITY_BASE +
      DENSITY_LUMA * Math.pow(luma[i], DENSITY_GAMMA) +
      DENSITY_EDGE * edges[i];
    total += w;
    idxArr.push(i);
    cdfArr.push(total);
    lumArr.push(luma[i]);
  }

  return {
    cdf: Float64Array.from(cdfArr),
    idx: Int32Array.from(idxArr),
    lum: Float32Array.from(lumArr),
    total,
    sw,
    sh,
  };
}

/**
 * Draw `count` particles from the sampler's weighted distribution. Positions are
 * stored NORMALIZED (nx/ny in [0,1] sample space) so they're independent of
 * container size and fit — `layoutField` turns them into canvas px.
 */
function sampleField(s: Sampler, count: number): Field {
  const hx = new Float32Array(count);
  const hy = new Float32Array(count);
  const nx = new Float32Array(count);
  const ny = new Float32Array(count);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const phase = new Float32Array(count);
  const amp = new Float32Array(count);
  const lum = new Float32Array(count);
  const sidx = new Int32Array(count);

  const { cdf, idx, total, sw, sh } = s;
  const len = cdf.length;

  for (let p = 0; p < count; p++) {
    if (len === 0) break;
    const r = Math.random() * total;
    // binary search: first cdf >= r
    let lo = 0;
    let hi = len - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const pix = idx[lo];
    lum[p] = s.lum[lo];
    sidx[p] = pix;
    nx[p] = ((pix % sw) + Math.random()) / sw;
    ny[p] = (((pix / sw) | 0) + Math.random()) / sh;
    phase[p] = Math.random() * Math.PI * 2;
    amp[p] = 0.4 + Math.random() * BREATHE_AMP;
  }

  return { hx, hy, nx, ny, x, y, vx, vy, phase, amp, lum, sidx, count };
}

/**
 * Turn normalized homes into canvas px for the current Rect. On first layout the
 * particles start scattered so they "settle" in; on relayout (resize/fit/zoom)
 * only the homes move and the spring physics glides the particles over — no
 * reshuffle.
 */
function layoutField(field: Field, rect: Rect, firstTime: boolean) {
  const { nx, ny, hx, hy, x, y, vx, vy, count } = field;
  const { drawW, drawH, offsetX, offsetY } = rect;
  for (let p = 0; p < count; p++) {
    const homeX = offsetX + nx[p] * drawW;
    const homeY = offsetY + ny[p] * drawH;
    hx[p] = homeX;
    hy[p] = homeY;
    if (firstTime) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 26;
      x[p] = homeX + Math.cos(a) * d;
      y[p] = homeY + Math.sin(a) * d;
      vx[p] = 0;
      vy[p] = 0;
    }
  }
}

/** Sample resolution for an iw×ih source (independent of container/fit). */
function sampleDims(iw: number, ih: number, longEdge: number) {
  const k = Math.min(1, longEdge / Math.max(iw, ih));
  return { sw: Math.max(1, Math.round(iw * k)), sh: Math.max(1, Math.round(ih * k)) };
}

/**
 * Where the iw×ih source lands in a cw×ch canvas.
 * - contain: whole subject visible, with a small default inset (FIT_FRACTION).
 * - cover: fills the canvas, cropping overflow (edges touch / full width).
 * `zoom` scales either mode (1 = default).
 */
function computeRect(
  iw: number,
  ih: number,
  cw: number,
  ch: number,
  fit: "contain" | "cover",
  zoom: number,
): Rect {
  const base =
    fit === "cover"
      ? Math.max(cw / iw, ch / ih)
      : Math.min(cw / iw, ch / ih) * FIT_FRACTION;
  const scale = base * zoom;
  const drawW = iw * scale;
  const drawH = ih * scale;
  return { drawW, drawH, offsetX: (cw - drawW) / 2, offsetY: (ch - drawH) / 2 };
}

/** Sobel edge magnitude over a scalar field, restricted to `present` pixels. */
function sobelOf(
  f: Float32Array,
  sw: number,
  sh: number,
  present: (i: number) => boolean,
): Float32Array {
  const at = (x: number, y: number) => f[y * sw + x];
  const edges = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const i = y * sw + x;
      if (!present(i)) continue;
      const gx =
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      edges[i] = Math.min(1, Math.hypot(gx, gy));
    }
  }
  return edges;
}

/** Even placement over the whole source (video fallback if pre-scan fails). */
function buildUniformSampler(sw: number, sh: number): Sampler {
  const n = sw * sh;
  const idx = new Int32Array(n);
  const cdf = new Float64Array(n);
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    idx[i] = i;
    cdf[i] = i + 1;
  }
  return { cdf, idx, lum, total: n, sw, sh };
}

/** Place particles for video from a coverage map (max luminance over time). */
function buildVideoSampler(
  cover: Float32Array,
  edges: Float32Array,
  sw: number,
  sh: number,
): Sampler {
  const idxArr: number[] = [];
  const cdfArr: number[] = [];
  const lumArr: number[] = [];
  let total = 0;
  const n = sw * sh;
  for (let i = 0; i < n; i++) {
    if (cover[i] < COVER_FLOOR) continue; // skip the ~always-dark background
    const w =
      DENSITY_BASE +
      DENSITY_LUMA * Math.pow(cover[i], DENSITY_GAMMA) +
      DENSITY_EDGE * edges[i];
    total += w;
    idxArr.push(i);
    cdfArr.push(total);
    lumArr.push(cover[i]);
  }
  return {
    cdf: Float64Array.from(cdfArr),
    idx: Int32Array.from(idxArr),
    lum: Float32Array.from(lumArr),
    total,
    sw,
    sh,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const v =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  const int = parseInt(v, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/**
 * Create a particle portrait inside `container`. Owns its <canvas> + cursor
 * element and the whole animation lifecycle.
 */
export function createParticlePortrait(
  container: HTMLElement,
  config: EngineConfig,
): PortraitHandle {
  // Live-tunable values the animation loop reads each frame.
  let settings: Settings = config.settings;
  let count = config.settings.count;
  let src = config.src;
  let kind = config.kind;
  let bg = config.bg;

  // Morph between the particle field (0) and the original (1): the still image,
  // or the live video frame for video portraits.
  let viewTarget = config.view === "source" ? 1 : 0;
  let morphP = viewTarget;
  let lastTick = 0;
  let lastFrameT = 0; // last RENDERED frame (frame-cap gate)
  let lastVideoT = -1; // video.currentTime at the last luminance sample

  // The container must be a positioned, clipping box so the absolute canvas
  // fills it (harmless for the React host, which is already absolute).
  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }
  container.style.overflow = "hidden";

  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", config.label ?? "Particle portrait");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    display: "block",
    width: "100%",
    height: "100%",
    touchAction: "none",
  } as Partial<CSSStyleDeclaration>);
  container.appendChild(canvas);

  const cursor = document.createElement("div");
  cursor.setAttribute("aria-hidden", "true");
  Object.assign(cursor.style, {
    position: "absolute",
    left: "0",
    top: "0",
    opacity: "0",
    pointerEvents: "none",
    transition: "opacity 200ms",
    willChange: "transform",
  } as Partial<CSSStyleDeclaration>);
  container.appendChild(cursor);

  styleCursor(cursor, settings.cursorStyle, settings.cursorSize, settings.color);

  // --- Source-specific state (rebuilt when src/kind/bg changes) ------------
  let raf = 0;
  let ro: ResizeObserver | null = null;
  let width = 0;
  let height = 0;
  let srcW = 0; // source (image/video) pixel dimensions — for the fit rect
  let srcH = 0;
  let rect: Rect | null = null; // current source→canvas placement
  let speckScale = 1; // how much larger the subject is drawn than at contain/zoom-1
  let sampler: Sampler | null = null;
  let field: Field | null = null;
  let sampledCount = count; // particles actually drawn
  let startT = 0;
  let cancelled = false; // permanent once destroy() is called
  let generation = 0; // bumped on every stop/restart so stale async bails
  let started = false;
  const pointer = { x: -9999, y: -9999, active: false };

  const ctx = canvas.getContext("2d", { alpha: false });

  let img: HTMLImageElement | null = null;
  let video: HTMLVideoElement | null = null;
  let voctx: CanvasRenderingContext2D | null = null;
  let vsw = 0;
  let vsh = 0;
  let cover: Float32Array | null = null; // max luminance over the clip
  let vedges: Float32Array | null = null;
  let pointerBound = false;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const resizeCanvas = () => {
    if (!ctx) return;
    width = container.clientWidth;
    height = container.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const currentRect = (): Rect =>
    computeRect(srcW, srcH, width, height, settings.fit, settings.zoom);

  // Place the subject AND work out how much bigger it's drawn than at contain/
  // zoom-1. Density is held by growing each speck by that factor rather than by
  // adding particles — so the grain coarsens as you zoom (like zooming into film
  // grain) and cover/zoom cost exactly what contain costs. The old area-scaled
  // count silently tripled the field (42k → the 140k ceiling on one "cover"
  // click) while the panel still read 42,000.
  const setRect = () => {
    rect = currentRect();
    const ref = computeRect(srcW, srcH, width, height, "contain", 1);
    speckScale = ref.drawW > 0 ? rect.drawW / ref.drawW : 1;
  };

  // `count` now means exactly what the panel says. The clamp only guards
  // hand-written embed configs — nothing in the UI can reach it.
  const targetCount = (): number =>
    Math.max(2000, Math.min(MAX_EFFECTIVE_COUNT, Math.round(count)));

  // Just move the homes for the current rect and let the physics glide the
  // particles over — cheap, no re-analysis or reshuffle (resize / small zoom).
  const relayout = (firstTime = false) => {
    if (!field || !srcW || !srcH) return;
    setRect();
    layoutField(field, rect!, firstTime);
  };

  // Re-draw the field at the requested count, then lay it out. Only a count
  // change resamples now; fit/zoom just re-place the existing particles (and
  // rescale the specks), which is far cheaper than rebuilding the field.
  const resampleForDensity = (force: boolean) => {
    if (!field || !srcW || !sampler) return;
    setRect();
    const target = targetCount();
    if (force || Math.abs(target - sampledCount) > Math.max(2000, sampledCount * 0.08)) {
      field = sampleField(sampler, target);
      sampledCount = target;
      layoutField(field, rect!, true);
    } else {
      layoutField(field, rect!, false);
    }
  };

  // Full rebuild: analyse the source (expensive) → draw particles at the fit's
  // density → lay them out. Only on src change; resize/fit/zoom stay cheaper.
  const rebuildSampler = () => {
    const isVideo = kind === "video";
    if (isVideo) {
      if (!video || !cover || !vedges) return;
      srcW = video.videoWidth;
      srcH = video.videoHeight;
      sampler = buildVideoSampler(cover, vedges, vsw, vsh);
      // Pre-scan yielded nothing usable (e.g. seeks stalled) — place evenly
      // so the clip still lights up through the particles.
      if (sampler.cdf.length === 0) sampler = buildUniformSampler(vsw, vsh);
    } else {
      if (!img || !img.complete || !img.naturalWidth) return;
      srcW = img.naturalWidth;
      srcH = img.naturalHeight;
      sampler = buildSampler(img, bg ?? { mode: "alpha" });
    }
    setRect();
    sampledCount = targetCount();
    field = sampleField(sampler, sampledCount);
    layoutField(field, rect!, true);
  };

  const buildPaint = (): string | CanvasGradient => {
    const grad = settings.gradient;
    if (grad.type === "none") {
      const [r, g, b] = hexToRgb(settings.color);
      return `rgb(${r},${g},${b})`;
    }
    const cx = width / 2;
    const cy = height / 2;
    if (grad.type === "radial") {
      const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.62);
      g.addColorStop(0, grad.from);
      g.addColorStop(1, grad.to);
      return g;
    }
    const rad = (grad.angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const ext = (Math.abs(dx) * width + Math.abs(dy) * height) / 2;
    const g = ctx!.createLinearGradient(cx - dx * ext, cy - dy * ext, cx + dx * ext, cy + dy * ext);
    g.addColorStop(0, grad.from);
    g.addColorStop(1, grad.to);
    return g;
  };

  // Fill the whole canvas with the chosen backdrop (solid or gradient). This
  // replaces the old hard-coded #000 clear — and multiply-mode specks are drawn
  // ON TOP of it, so it must run first each frame.
  const paintBackground = () => {
    if (!ctx) return;
    const bgd = settings.background;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (bgd.type === "solid") {
      ctx.fillStyle = bgd.color;
    } else if (bgd.type === "radial") {
      const g = ctx.createRadialGradient(
        width / 2,
        height / 2,
        0,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.72,
      );
      g.addColorStop(0, bgd.from);
      g.addColorStop(1, bgd.to);
      ctx.fillStyle = g;
    } else {
      const rad = (bgd.angle * Math.PI) / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const cx = width / 2;
      const cy = height / 2;
      const ext = (Math.abs(dx) * width + Math.abs(dy) * height) / 2;
      const g = ctx.createLinearGradient(cx - dx * ext, cy - dy * ext, cx + dx * ext, cy + dy * ext);
      g.addColorStop(0, bgd.from);
      g.addColorStop(1, bgd.to);
      ctx.fillStyle = g;
    }
    ctx.fillRect(0, 0, width, height);
  };

  // Bucketed speck draw: canvas state changes (globalAlpha) cost ~as much as the
  // fill itself, so per-speck alpha at 40k+ specks eats the whole frame budget.
  // Instead, quantize alpha into ALPHA_BUCKETS levels (imperceptible on ~1px
  // specks), group specks by level with a counting sort, and pay ONE state
  // change per level. Blends ('lighter'/'multiply') are commutative, so draw
  // order doesn't change the result.
  const bLut = new Uint8Array(256); // luminance byte → bucket (255 = skip)
  const bCounts = new Int32Array(ALPHA_BUCKETS);
  const bStarts = new Int32Array(ALPHA_BUCKETS);
  const bCursor = new Int32Array(ALPHA_BUCKETS);
  let bOrder = new Int32Array(0); // speck indices grouped by bucket

  const drawSpecks = (intro: number) => {
    if (!field || !ctx) return;
    const s = settings;
    const isVideo = kind === "video";
    // Grain scales with the drawn subject, holding density without more particles.
    const size = s.size * speckScale;
    const half = size / 2;
    const power = s.contrast * CONTRAST_POW_MAX;
    const baseA = SPECK_ALPHA * intro;
    // Video: no floor + gate on the live frame's luminance, so only the
    // current pose shows (off-pose specks vanish rather than ghosting the
    // whole flight envelope). Image: small floor keeps shadow areas as shape.
    const isInk = s.polarity === "dark-on-light";
    const floor = isVideo ? 0 : BRIGHT_FLOOR;
    // LUT: source luminance → alpha bucket. Rebuilt every call (256 pows is
    // nothing) so contrast/polarity tweaks apply instantly.
    // `tone` = how much mark this speck carries. Glow: bright source → bright
    // light. Ink (images): DARK source → dark ink, so tone follows DARKNESS —
    // dark areas stay dark in BOTH modes (tonal, not a photo-negative). Video
    // is a lit-on-black subject (its "dark" is empty background), so it stays
    // luminance-keyed in both modes.
    for (let v = 0; v < 256; v++) {
      const l = v / 255;
      if (isVideo && l < VIDEO_LUMA_GATE) {
        bLut[v] = 255;
        continue;
      }
      const tone = isInk && !isVideo ? 1 - l : l;
      const bright = floor + (1 - floor) * Math.pow(tone, power);
      bLut[v] = Math.min(ALPHA_BUCKETS - 1, (bright * ALPHA_BUCKETS) | 0);
    }
    const { x, y, lum, count: n } = field;
    if (bOrder.length < n) bOrder = new Int32Array(n);
    // Counting sort: specks → buckets.
    bCounts.fill(0);
    for (let i = 0; i < n; i++) {
      const b = bLut[(lum[i] * 255) | 0];
      if (b !== 255) bCounts[b]++;
    }
    let acc = 0;
    for (let b = 0; b < ALPHA_BUCKETS; b++) {
      bStarts[b] = acc;
      bCursor[b] = acc;
      acc += bCounts[b];
    }
    for (let i = 0; i < n; i++) {
      const b = bLut[(lum[i] * 255) | 0];
      if (b !== 255) bOrder[bCursor[b]++] = i;
    }
    // Polarity picks the blend: additive glow (light-on-dark) or multiply "ink"
    // (dark-on-light). multiply is the true mirror: dark specks deepen where
    // they stack.
    ctx.globalCompositeOperation = isInk ? "multiply" : "lighter";
    ctx.fillStyle = buildPaint();
    for (let b = 0; b < ALPHA_BUCKETS; b++) {
      const cnt = bCounts[b];
      if (!cnt) continue;
      ctx.globalAlpha = baseA * ((b + 0.5) / ALPHA_BUCKETS);
      const end = bStarts[b] + cnt;
      for (let k = bStarts[b]; k < end; k++) {
        const i = bOrder[k];
        ctx.fillRect(x[i] - half, y[i] - half, size, size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  // Video: read the current frame's luminance into each particle's `lum`
  // (sampled at its HOME pixel, so cursor displacement doesn't smear the light).
  const sampleVideoFrameLum = () => {
    if (!voctx || !video || !field) return;
    voctx.drawImage(video, 0, 0, vsw, vsh);
    const d = voctx.getImageData(0, 0, vsw, vsh).data;
    const { sidx, lum, count: n } = field;
    for (let i = 0; i < n; i++) {
      const o = sidx[i] * 4;
      lum[i] = luminance(d[o], d[o + 1], d[o + 2]);
    }
  };

  // The original to draw under the specks in source view: the still image, or
  // the live video frame (once it has decoded at least one frame).
  const sourceFrame = (): CanvasImageSource | null =>
    img ?? (video && video.readyState >= 2 ? video : null);

  const renderStatic = () => {
    if (!ctx) return;
    paintBackground();
    const frame = morphP === 1 ? sourceFrame() : null;
    if (frame && rect) {
      ctx.globalAlpha = 1;
      ctx.drawImage(frame, rect.offsetX, rect.offsetY, rect.drawW, rect.drawH);
      return;
    }
    if (field) {
      for (let i = 0; i < field.count; i++) {
        field.x[i] = field.hx[i];
        field.y[i] = field.hy[i];
      }
    }
    drawSpecks(1);
  };

  const tick = (now: number) => {
    if (cancelled || !field || !ctx) return;
    // ~60fps cap: on 120Hz+ displays rAF doubles the work for no visible gain
    // on a slow-breathing field — and minutes of saturated main thread means
    // thermal throttling, i.e. the whole page lagging.
    if (now - lastFrameT < MIN_FRAME_MS) {
      raf = requestAnimationFrame(tick);
      return;
    }
    lastFrameT = now;
    const isVideo = kind === "video";
    // Only re-read the clip's pixels when it actually advanced a frame —
    // getImageData every rAF (at display rate) triples the cost of a ~30fps clip.
    if (isVideo && video && video.currentTime !== lastVideoT) {
      sampleVideoFrameLum();
      lastVideoT = video.currentTime;
    }
    if (!startT) startT = now;
    const dt = lastTick ? Math.min(50, now - lastTick) : 16;
    lastTick = now;
    if (morphP !== viewTarget) {
      const step = dt / MORPH_MS;
      morphP =
        viewTarget > morphP
          ? Math.min(viewTarget, morphP + step)
          : Math.max(viewTarget, morphP - step);
    }
    const morph = easeInOutCubic(morphP);
    const intro = Math.min(1, (now - startT) / INTRO_MS);
    const s = settings;
    const radius = s.cursorSize;
    const radiusSq = radius * radius;
    const strength = radius * 32;

    paintBackground();

    const { hx, hy, x, y, vx, vy, phase, amp, count: n } = field;
    const px = pointer.x;
    const py = pointer.y;
    const active = pointer.active;
    const t = now * 0.001;

    for (let i = 0; i < n; i++) {
      // Gentle breathing target around home — dust in still air.
      const tx = hx[i] + Math.sin(t * 0.7 + phase[i]) * amp[i] * (1 - morph);
      const ty = hy[i] + Math.cos(t * 0.9 + phase[i] * 1.3) * amp[i] * (1 - morph);

      if (active) {
        const dx = px - x[i];
        const dy = py - y[i];
        const dSq = dx * dx + dy * dy;
        if (dSq < radiusSq && dSq > 0.01) {
          const dist = Math.sqrt(dSq);
          const force = (strength * (1 - dist / radius)) / dist;
          vx[i] -= dx * force * 0.0012 * (1 - morph);
          vy[i] -= dy * force * 0.0012 * (1 - morph);
        }
      }

      vx[i] += (tx - x[i]) * SPRING;
      vy[i] += (ty - y[i]) * SPRING;
      vx[i] *= DAMPING;
      vy[i] *= DAMPING;
      x[i] += vx[i];
      y[i] += vy[i];
    }

    const frame = morph > 0 ? sourceFrame() : null;
    if (frame && rect) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = morph;
      ctx.drawImage(frame, rect.offsetX, rect.offsetY, rect.drawW, rect.drawH);
      ctx.globalAlpha = 1;
    }
    if (morph < 1) drawSpecks(intro * (1 - morph));
    raf = requestAnimationFrame(tick);
  };

  // Pointer / touch handling
  const onMove = (e: PointerEvent) => {
    if (viewTarget === 1) return;
    const cr = canvas.getBoundingClientRect();
    pointer.x = e.clientX - cr.left;
    pointer.y = e.clientY - cr.top;
    pointer.active = true;
    cursor.style.transform = `translate(${e.clientX - cr.left}px, ${e.clientY - cr.top}px) translate(-50%, -50%)`;
    cursor.style.opacity = "1";
  };
  const onLeave = () => {
    pointer.active = false;
    pointer.x = -9999;
    pointer.y = -9999;
    cursor.style.opacity = "0";
  };

  const addPointerListeners = () => {
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerup", onLeave);
    pointerBound = true;
  };
  const removePointerListeners = () => {
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerdown", onMove);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("pointerup", onLeave);
    pointerBound = false;
  };

  // Resolve once the video finishes seeking to `t` (with a safety timeout).
  const seekTo = (v: HTMLVideoElement, t: number) =>
    new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        v.removeEventListener("seeked", finish);
        resolve();
      };
      v.addEventListener("seeked", finish);
      try {
        v.currentTime = t;
      } catch {
        finish();
      }
      window.setTimeout(finish, 300);
    });

  // --- Start / stop the source layer --------------------------------------
  const startSource = () => {
    if (!ctx) return;
    const myGen = generation;
    const isVideo = kind === "video";
    width = container.clientWidth;
    height = container.clientHeight;

    ro = new ResizeObserver(() => {
      resizeCanvas();
      relayout(); // container size only changes the fit rect, not the analysis
      if (prefersReduced) renderStatic();
    });

    if (isVideo) {
      video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      // NOTE: no crossOrigin — the clip is same-origin; setting it forces a
      // CORS-mode fetch that can stall the media load (readyState stuck at 0).
      // Attach (imperceptibly) — detached/invisible videos often won't decode
      // frames for drawImage/seeking. A 2px, near-zero-opacity element decodes
      // reliably while staying invisible.
      video.setAttribute("aria-hidden", "true");
      video.style.position = "absolute";
      video.style.left = "0";
      video.style.top = "0";
      video.style.width = "2px";
      video.style.height = "2px";
      video.style.opacity = "0.01";
      video.style.pointerEvents = "none";
      container.appendChild(video);

      const onReady = async () => {
        if (cancelled || myGen !== generation || started || !video) return;
        started = true;

        const dims = sampleDims(video.videoWidth, video.videoHeight, VIDEO_SAMPLE_LONG_EDGE);
        vsw = dims.sw;
        vsh = dims.sh;
        const sc = document.createElement("canvas");
        sc.width = vsw;
        sc.height = vsh;
        voctx = sc.getContext("2d", { willReadFrequently: true });
        if (!voctx) return;

        // Pre-scan the clip: accumulate max luminance per pixel (the "flight
        // envelope") so particles land everywhere the subject is ever lit.
        cover = new Float32Array(vsw * vsh);
        const dur = isFinite(video.duration) ? video.duration : 0;
        const K = 12;
        if (dur > 0) {
          for (let s = 0; s < K; s++) {
            if (cancelled || myGen !== generation) return;
            await seekTo(video, dur * ((s + 0.5) / K));
            voctx.drawImage(video, 0, 0, vsw, vsh);
            const d = voctx.getImageData(0, 0, vsw, vsh).data;
            for (let i = 0; i < vsw * vsh; i++) {
              const o = i * 4;
              const L = luminance(d[o], d[o + 1], d[o + 2]);
              if (L > cover[i]) cover[i] = L;
            }
          }
        } else {
          voctx.drawImage(video, 0, 0, vsw, vsh);
          const d = voctx.getImageData(0, 0, vsw, vsh).data;
          for (let i = 0; i < vsw * vsh; i++) {
            const o = i * 4;
            cover[i] = luminance(d[o], d[o + 1], d[o + 2]);
          }
        }
        if (cancelled || myGen !== generation) return;
        vedges = sobelOf(cover, vsw, vsh, (i) => (cover as Float32Array)[i] >= COVER_FLOOR);

        resizeCanvas();
        canvas.style.cursor = viewTarget === 1 || prefersReduced ? "auto" : "none";
        rebuildSampler();
        ro?.observe(container);

        if (prefersReduced) {
          await seekTo(video, dur * 0.5);
          sampleVideoFrameLum();
          renderStatic();
        } else {
          try {
            video.currentTime = 0;
            await video.play();
          } catch {
            /* autoplay may be blocked; the field still animates on breathing */
          }
          raf = requestAnimationFrame(tick);
          addPointerListeners();
        }
      };

      video.addEventListener("loadeddata", onReady);
      video.addEventListener("canplay", onReady);
      video.addEventListener("error", () => {
        resizeCanvas();
        paintBackground();
        console.warn(`[ParticlePortrait] could not load video: ${src}`);
      });
      video.src = src;
      video.load();
    } else {
      img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled || myGen !== generation) return;
        resizeCanvas();
        canvas.style.cursor = viewTarget === 1 || prefersReduced ? "auto" : "none";
        rebuildSampler();
        if (prefersReduced) {
          renderStatic();
        } else {
          raf = requestAnimationFrame(tick);
        }
        ro?.observe(container);
        if (!prefersReduced) addPointerListeners();
      };
      img.onerror = () => {
        resizeCanvas();
        paintBackground();
        console.warn(`[ParticlePortrait] could not load image: ${src}`);
      };
      img.src = src;
    }
  };

  const stopSource = () => {
    generation++; // any in-flight async from the previous source now bails
    cancelAnimationFrame(raf);
    raf = 0;
    ro?.disconnect();
    ro = null;
    if (pointerBound) removePointerListeners();
    if (video) {
      try {
        video.pause();
      } catch {
        /* noop */
      }
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* noop */
      }
      video.remove();
      video = null;
    }
    if (img) {
      img.onload = null;
      img.onerror = null;
      img = null;
    }
    voctx = null;
    cover = null;
    vedges = null;
    sampler = null;
    field = null;
    startT = 0;
    lastTick = 0;
    lastFrameT = 0;
    lastVideoT = -1;
    started = false;
  };

  startSource();

  return {
    update(next: EngineConfig) {
      const sourceChanged =
        next.src !== src ||
        next.kind !== kind ||
        JSON.stringify(next.bg ?? null) !== JSON.stringify(bg ?? null);

      const prev = settings;
      settings = next.settings;
      styleCursor(cursor, settings.cursorStyle, settings.cursorSize, settings.color);

      const nextView = next.view === "source" ? 1 : 0;
      if (nextView !== viewTarget) {
        viewTarget = nextView;
        canvas.style.cursor = viewTarget === 1 || prefersReduced ? "auto" : "none";
        if (viewTarget === 1) onLeave();
        if (prefersReduced) {
          morphP = viewTarget;
          renderStatic();
        }
      }

      if (sourceChanged) {
        stopSource();
        src = next.src;
        kind = next.kind;
        bg = next.bg;
        count = next.settings.count;
        viewTarget = 0;
        morphP = 0;
        startSource();
        return;
      }

      if (next.settings.count !== count) {
        count = next.settings.count;
        resampleForDensity(true); // new base density → always re-draw
      }

      // Fit/zoom change the drawn size: re-draw at the new density when it shifts
      // enough (e.g. contain↔cover), otherwise just glide the homes over.
      if (settings.fit !== prev.fit || settings.zoom !== prev.zoom) {
        resampleForDensity(false);
      }
    },
    destroy() {
      stopSource();
      cancelled = true;
      cursor.remove();
      canvas.remove();
    },
  };
}

/** Style the custom cursor element to match the chosen style/size/colour. */
export function styleCursor(
  el: HTMLDivElement,
  style: CursorStyle,
  size: number,
  color: string,
) {
  const d = size * 2; // diameter reflects the push radius
  el.style.width = `${d}px`;
  el.style.height = `${d}px`;
  el.style.borderRadius = "9999px";
  el.style.border = "none";
  el.style.background = "none";
  el.style.boxShadow = "none";
  el.innerHTML = "";

  if (style === "ring") {
    el.style.border = `1.5px solid ${color}`;
    el.style.boxShadow = `0 0 18px ${color}77, inset 0 0 18px ${color}33`;
  } else if (style === "dot") {
    el.style.background = `radial-gradient(circle, ${color}88 0%, ${color}33 45%, transparent 70%)`;
  } else {
    // crosshair — two thin lines spanning the diameter
    el.style.borderRadius = "0";
    const mk = (vertical: boolean) => {
      const line = document.createElement("div");
      line.style.position = "absolute";
      line.style.background = color;
      line.style.opacity = "0.8";
      line.style.boxShadow = `0 0 6px ${color}88`;
      if (vertical) {
        line.style.left = "50%";
        line.style.top = "0";
        line.style.width = "1px";
        line.style.height = "100%";
        line.style.transform = "translateX(-50%)";
      } else {
        line.style.top = "50%";
        line.style.left = "0";
        line.style.height = "1px";
        line.style.width = "100%";
        line.style.transform = "translateY(-50%)";
      }
      return line;
    };
    el.appendChild(mk(true));
    el.appendChild(mk(false));
  }
}
