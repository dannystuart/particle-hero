"use client";

import { useState, type ReactNode } from "react";
import {
  GRADIENT_PRESETS,
  LOOK_PRESETS,
  POLARITY_DEFAULT_LOOK,
  type Background,
  type CursorStyle,
  type Gradient,
  type Polarity,
  type Settings,
} from "../portraits";
import { HERO_DESIGNS, type HeroContent, type HeroState } from "./heroDesigns";

function gradientCss(g: Gradient): string {
  if (g.type === "none") return "#0a0a0a";
  if (g.type === "radial") return `radial-gradient(circle at 50% 50%, ${g.from}, ${g.to})`;
  return `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`;
}

function backgroundCss(b: Background): string {
  if (b.type === "solid") return b.color;
  if (b.type === "radial") return `radial-gradient(circle at 50% 50%, ${b.from}, ${b.to})`;
  return `linear-gradient(${b.angle}deg, ${b.from}, ${b.to})`;
}

function gradientEquals(a: Gradient, b: Gradient): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "none") return true;
  return a.from === b.from && a.to === b.to && (a.type === "radial" || a.angle === b.angle);
}

function backgroundEquals(a: Background, b: Background): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "solid" && b.type === "solid") return a.color === b.color;
  if (a.type === "radial" && b.type === "radial") return a.from === b.from && a.to === b.to;
  if (a.type === "linear" && b.type === "linear")
    return a.from === b.from && a.to === b.to && a.angle === b.angle;
  return false;
}

/** Convert a background to a different type, carrying colours across sensibly. */
function convertBackground(b: Background, type: Background["type"]): Background {
  const first = b.type === "solid" ? b.color : b.from;
  const second = b.type === "solid" ? b.color : b.to;
  if (type === "solid") return { type: "solid", color: first };
  if (type === "radial") return { type: "radial", from: first, to: second };
  const angle = b.type === "linear" ? b.angle : 120;
  return { type: "linear", from: first, to: second, angle };
}

/** Preview-frame sizing (playground only — the exported effect fills its host). */
export type FramePreset = "full" | "16:9" | "21:9" | "1:1" | "custom";
export type Frame = { preset: FramePreset; w: number; h: number };
export const FRAME_PRESETS: { id: FramePreset; label: string; aw: number; ah: number }[] = [
  { id: "full", label: "Full", aw: 0, ah: 0 },
  { id: "16:9", label: "16:9", aw: 16, ah: 9 },
  { id: "21:9", label: "21:9", aw: 21, ah: 9 },
  { id: "1:1", label: "1:1", aw: 1, ah: 1 },
  { id: "custom", label: "Custom", aw: 0, ah: 0 },
];

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  view: "particles" | "source";
  onViewChange: (v: "particles" | "source") => void;
  frame: Frame;
  onFrameChange: (frame: Frame) => void;
  onExport: () => void;
  hero: HeroState;
  onHeroChange: (patch: Partial<HeroState>) => void;
  /** Lifted so the page can move other floating UI out of the sheet's way. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/* ── design tokens ───────────────────────────────────────────────────────── */

const MONO = "font-[family-name:var(--font-geist-mono)]";
/** Small tracked cap label — the panel's signature voice. */
const CAP = `${MONO} text-[9.5px] uppercase tracking-[0.16em] text-white/40`;
/** Recessed container for a nested editor (backdrop, custom fill, stepper). */
const WELL = "rounded-[9px] border border-white/[0.07] bg-white/[0.025] p-2.5";
const INPUT =
  "h-7 w-full min-w-0 rounded-[7px] border border-white/[0.09] bg-white/[0.04] px-2 text-[11px] text-white/85 outline-none transition placeholder:text-white/25 focus:border-white/30 focus:bg-white/[0.07]";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-white/25";

const CURSOR_STYLES: { value: CursorStyle; label: string }[] = [
  { value: "dot", label: "Dot" },
  { value: "ring", label: "Ring" },
  { value: "crosshair", label: "Cross" },
];
const POLARITIES: { value: Polarity; label: string }[] = [
  { value: "light-on-dark", label: "Light" },
  { value: "dark-on-light", label: "Dark" },
];

type SectionId = "source" | "frame" | "background" | "particles" | "mockup";

export default function ControlPanel({
  settings,
  onChange,
  view,
  onViewChange,
  frame,
  onFrameChange,
  onExport,
  hero,
  onHeroChange,
  open,
  onOpenChange,
}: Props) {
  const [sections, setSections] = useState<Record<SectionId, boolean>>({
    source: false,
    frame: false,
    background: false,
    particles: true,
    mockup: false,
  });
  const [customFill, setCustomFill] = useState(false);
  const g = settings.gradient;
  const bg = settings.background;

  const toggle = (id: SectionId) => setSections((s) => ({ ...s, [id]: !s[id] }));

  const applyPolarity = (p: Polarity) => {
    if (p === settings.polarity) return;
    const look = POLARITY_DEFAULT_LOOK[p];
    onChange({ polarity: p, background: look.background, color: look.color });
  };

  const designIndex = Math.max(
    0,
    HERO_DESIGNS.findIndex((d) => d.id === hero.designId),
  );
  const activeDesign = HERO_DESIGNS[designIndex];
  const cycleDesign = (dir: 1 | -1) =>
    onHeroChange({
      designId:
        HERO_DESIGNS[(designIndex + dir + HERO_DESIGNS.length) % HERO_DESIGNS.length].id,
    });
  const setContent = (key: keyof HeroContent, v: string) =>
    onHeroChange({ content: { ...hero.content, [key]: v } });

  // Section headers carry a live read-out of their own state, so a collapsed
  // panel still tells you where things stand.
  const activeLook = LOOK_PRESETS.find(
    (p) =>
      p.polarity === settings.polarity &&
      backgroundEquals(p.background, bg) &&
      p.color === settings.color,
  );
  const framePreset = FRAME_PRESETS.find((p) => p.id === frame.preset);

  return (
    <div
      // Phone: a bottom sheet pinned to the safe area. Desktop (sm+): the
      // top-right inspector.
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 select-none text-[11px] text-white/80 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-[292px]"
      style={{ fontFamily: "var(--font-geist-sans)" }}
    >
      <div className="relative overflow-hidden rounded-[14px] border border-white/[0.09] bg-[#0b0b0d]/80 shadow-[0_28px_70px_-18px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
        {/* Specular top edge — the "material" tell. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Sheet grabber — phone only, signals the bar opens */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        {/* Title bar */}
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className={`group flex w-full items-center gap-2 px-3 py-3 text-left sm:py-2.5 ${FOCUS}`}
          aria-expanded={open}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white/60 shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
          <span
            className={`${MONO} text-[10px] uppercase tracking-[0.26em] text-white/65 transition group-hover:text-white`}
          >
            Controls
          </span>
          <span className="flex-1" />
          <Chevron open={open} sheet />
        </button>

        {/* Body */}
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden" inert={!open}>
            <div className="max-h-[52dvh] overflow-y-auto overflow-x-hidden overscroll-contain border-t border-white/[0.07] [scrollbar-color:rgba(255,255,255,0.16)_transparent] [scrollbar-width:thin] sm:max-h-[calc(100dvh-9rem)]">
              {/* ---- SOURCE ------------------------------------------------ */}
              <Section
                title="Source"
                summary={view === "particles" ? "Particles" : "Original"}
                open={sections.source}
                onToggle={() => toggle("source")}
              >
                <Stack label="View">
                  <Segmented
                    full
                    value={view}
                    onChange={onViewChange}
                    options={[
                      { value: "particles", label: "Particles" },
                      { value: "source", label: "Original" },
                    ]}
                  />
                </Stack>
                <Note>Flip to the untouched photo or clip to compare.</Note>
              </Section>

              {/* ---- FRAME ------------------------------------------------- */}
              <Section
                title="Frame"
                summary={framePreset?.label ?? "Full"}
                open={sections.frame}
                onToggle={() => toggle("frame")}
              >
                <Stack label="Preview size">
                  <Segmented
                    full
                    value={frame.preset}
                    onChange={(preset) => onFrameChange({ ...frame, preset })}
                    options={FRAME_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
                  />
                </Stack>

                {frame.preset === "custom" && (
                  <div className={`${WELL} flex items-center gap-2`}>
                    <NumberField
                      label="W"
                      value={frame.w}
                      onChange={(w) => onFrameChange({ ...frame, w })}
                    />
                    <span className="shrink-0 text-white/25">×</span>
                    <NumberField
                      label="H"
                      value={frame.h}
                      onChange={(h) => onFrameChange({ ...frame, h })}
                    />
                  </div>
                )}

                <Field label="Fit">
                  <Segmented
                    value={settings.fit}
                    onChange={(fit) => onChange({ fit })}
                    options={[
                      { value: "contain", label: "Contain" },
                      { value: "cover", label: "Cover" },
                    ]}
                  />
                </Field>

                <Slider
                  label="Scale"
                  value={settings.zoom}
                  min={0.5}
                  max={2}
                  step={0.05}
                  display={`${Math.round(settings.zoom * 100)}%`}
                  onChange={(v) => onChange({ zoom: v })}
                />

                <Note>Sizes are preview-only. Fit and Scale ship with the export.</Note>
              </Section>

              {/* ---- BACKGROUND -------------------------------------------- */}
              <Section
                title="Background"
                summary={activeLook?.name ?? "Custom"}
                open={sections.background}
                onToggle={() => toggle("background")}
              >
                <Field label="Mode">
                  <Segmented
                    value={settings.polarity}
                    onChange={applyPolarity}
                    options={POLARITIES}
                  />
                </Field>

                <Stack label="Looks">
                  <div className="grid grid-cols-6 gap-1.5">
                    {LOOK_PRESETS.map((p) => {
                      const active =
                        p.polarity === settings.polarity &&
                        backgroundEquals(p.background, bg) &&
                        p.color === settings.color;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          title={p.name}
                          aria-label={p.name}
                          aria-pressed={active}
                          onClick={() =>
                            onChange({
                              polarity: p.polarity,
                              background: p.background,
                              color: p.color,
                              gradient: {
                                type: "none",
                                from: p.color,
                                to: p.color,
                                angle: 90,
                              },
                            })
                          }
                          className={`relative h-8 w-full overflow-hidden rounded-[7px] transition duration-150 ${FOCUS} ${
                            active
                              ? "ring-2 ring-white ring-offset-2 ring-offset-[#0b0b0d]"
                              : "ring-1 ring-inset ring-white/15 hover:ring-white/45"
                          }`}
                          style={{ background: backgroundCss(p.background) }}
                        >
                          <span
                            className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full ring-1 ring-black/30"
                            style={{ background: p.color }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </Stack>

                <div className={`${WELL} space-y-2.5`}>
                  <Field label="Backdrop">
                    <Segmented
                      value={bg.type}
                      onChange={(t) => onChange({ background: convertBackground(bg, t) })}
                      options={[
                        { value: "solid", label: "Solid" },
                        { value: "linear", label: "Linear" },
                        { value: "radial", label: "Radial" },
                      ]}
                    />
                  </Field>

                  {bg.type === "solid" ? (
                    <ColorRow
                      label="Colour"
                      value={bg.color}
                      onChange={(v) => onChange({ background: { type: "solid", color: v } })}
                    />
                  ) : (
                    <>
                      <ColorRow
                        label="From"
                        value={bg.from}
                        onChange={(v) => onChange({ background: { ...bg, from: v } })}
                      />
                      <ColorRow
                        label="To"
                        value={bg.to}
                        onChange={(v) => onChange({ background: { ...bg, to: v } })}
                      />
                      {bg.type === "linear" && (
                        <Slider
                          label="Angle"
                          value={bg.angle}
                          min={0}
                          max={360}
                          step={5}
                          display={`${bg.angle}°`}
                          onChange={(v) => onChange({ background: { ...bg, angle: v } })}
                        />
                      )}
                    </>
                  )}
                </div>
              </Section>

              {/* ---- PARTICLES --------------------------------------------- */}
              <Section
                title="Particles"
                summary={settings.count.toLocaleString()}
                open={sections.particles}
                onToggle={() => toggle("particles")}
              >
                <Slider
                  label="Count"
                  value={settings.count}
                  min={2000}
                  max={90000}
                  step={1000}
                  display={settings.count.toLocaleString()}
                  onChange={(v) => onChange({ count: v })}
                />
                <Slider
                  label="Speck size"
                  value={settings.size}
                  min={0.5}
                  max={3}
                  step={0.1}
                  display={settings.size.toFixed(1)}
                  onChange={(v) => onChange({ size: v })}
                />
                <Slider
                  label="Contrast"
                  value={settings.contrast}
                  min={0}
                  max={3}
                  step={0.05}
                  display={`${Math.round(settings.contrast * 100)}%`}
                  onChange={(v) => onChange({ contrast: v })}
                />

                <div className="h-px bg-white/[0.06]" />

                <ColorRow
                  label="Colour"
                  value={settings.color}
                  onChange={(v) => onChange({ color: v })}
                />

                <Stack
                  label="Fill"
                  aside={
                    <button
                      type="button"
                      aria-pressed={customFill}
                      onClick={() => {
                        setCustomFill((c) => !c);
                        if (!customFill)
                          onChange({
                            gradient: { ...g, type: g.type === "none" ? "linear" : g.type },
                          });
                      }}
                      className={`${MONO} rounded-[6px] px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.14em] transition ${FOCUS} ${
                        customFill
                          ? "bg-white/[0.14] text-white"
                          : "text-white/35 hover:text-white/80"
                      }`}
                    >
                      Custom
                    </button>
                  }
                >
                  <div className="grid grid-cols-6 gap-1.5">
                    {GRADIENT_PRESETS.map((p) => {
                      const active = !customFill && gradientEquals(g, p.gradient);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          title={p.name}
                          aria-label={p.name}
                          aria-pressed={active}
                          onClick={() => {
                            setCustomFill(false);
                            onChange({ gradient: p.gradient });
                          }}
                          className={`grid h-7 w-full place-items-center rounded-[7px] transition duration-150 ${FOCUS} ${
                            active
                              ? "ring-2 ring-white ring-offset-2 ring-offset-[#0b0b0d]"
                              : "ring-1 ring-inset ring-white/15 hover:ring-white/45"
                          }`}
                          style={{ background: gradientCss(p.gradient) }}
                        >
                          {p.id === "none" && (
                            <span className="text-[9px] text-white/40">∅</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Stack>

                {customFill && (
                  <div className={`${WELL} space-y-2.5`}>
                    <Field label="Type">
                      <Segmented
                        value={g.type === "radial" ? "radial" : "linear"}
                        onChange={(t) => onChange({ gradient: { ...g, type: t } })}
                        options={[
                          { value: "linear", label: "Linear" },
                          { value: "radial", label: "Radial" },
                        ]}
                      />
                    </Field>
                    <ColorRow
                      label="From"
                      value={g.from}
                      onChange={(v) => onChange({ gradient: { ...g, from: v } })}
                    />
                    <ColorRow
                      label="To"
                      value={g.to}
                      onChange={(v) => onChange({ gradient: { ...g, to: v } })}
                    />
                    {g.type === "linear" && (
                      <Slider
                        label="Angle"
                        value={g.angle}
                        min={0}
                        max={360}
                        step={5}
                        display={`${g.angle}°`}
                        onChange={(v) => onChange({ gradient: { ...g, angle: v } })}
                      />
                    )}
                  </div>
                )}

                <div className="h-px bg-white/[0.06]" />

                <Slider
                  label="Cursor size"
                  value={settings.cursorSize}
                  min={30}
                  max={220}
                  step={5}
                  display={String(settings.cursorSize)}
                  onChange={(v) => onChange({ cursorSize: v })}
                />
                <Stack label="Cursor style">
                  <Segmented
                    full
                    value={settings.cursorStyle}
                    onChange={(cursorStyle) => onChange({ cursorStyle })}
                    options={CURSOR_STYLES}
                  />
                </Stack>
              </Section>

              {/* ---- MOCKUP ------------------------------------------------ */}
              <Section
                title="Mockup"
                summary={hero.enabled ? activeDesign.name : "Off"}
                open={sections.mockup}
                onToggle={() => toggle("mockup")}
              >
                <Field label="Hero overlay">
                  <Switch
                    checked={hero.enabled}
                    onChange={(enabled) => onHeroChange({ enabled })}
                    label="Hero overlay"
                  />
                </Field>

                {hero.enabled && (
                  <>
                    <Stack label="Layout">
                      <div className="flex h-8 items-center gap-1 rounded-[8px] border border-white/[0.09] bg-white/[0.03] px-1">
                        <StepperButton label="Previous layout" onClick={() => cycleDesign(-1)}>
                          ‹
                        </StepperButton>
                        <span className="min-w-0 flex-1 truncate text-center text-[11px] text-white/85">
                          {activeDesign.name}
                        </span>
                        <StepperButton label="Next layout" onClick={() => cycleDesign(1)}>
                          ›
                        </StepperButton>
                      </div>
                    </Stack>

                    <Stack label="Elements">
                      <div className="grid grid-cols-2 gap-1.5">
                        {(
                          [
                            ["nav", "Nav"],
                            ["headline", "Headline"],
                            ["subline", "Subline"],
                            ["cta", "CTA"],
                          ] as const
                        ).map(([key, label]) => {
                          const on = hero.visibility[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                onHeroChange({
                                  visibility: { ...hero.visibility, [key]: !on },
                                })
                              }
                              className={`flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[11px] transition duration-150 ${FOCUS} ${
                                on
                                  ? "bg-white/[0.12] text-white ring-1 ring-inset ring-white/15"
                                  : "text-white/35 ring-1 ring-inset ring-white/[0.07] hover:text-white/70"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full transition ${
                                  on ? "bg-white" : "bg-white/20"
                                }`}
                              />
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </Stack>

                    <div className={`${WELL} space-y-2`}>
                      <TextRow
                        label="Brand"
                        value={hero.content.brand}
                        onChange={(v) => setContent("brand", v)}
                      />
                      <TextRow
                        label="Headline"
                        value={hero.content.headline}
                        onChange={(v) => setContent("headline", v)}
                      />
                      <TextRow
                        label="Subline"
                        value={hero.content.subline}
                        onChange={(v) => setContent("subline", v)}
                      />
                      <TextRow
                        label="CTA"
                        value={hero.content.cta}
                        onChange={(v) => setContent("cta", v)}
                      />
                      <TextRow
                        label="Nav links"
                        value={hero.content.links}
                        onChange={(v) => setContent("links", v)}
                      />
                    </div>
                  </>
                )}

                <Note>Preview-only — the mockup does not ship with the export.</Note>
              </Section>
            </div>

            {/* Footer */}
            <div className="border-t border-white/[0.07] bg-white/[0.015] p-2.5">
              <button
                type="button"
                onClick={onExport}
                className={`${MONO} flex h-8 w-full items-center justify-center gap-2 rounded-[8px] border border-white/[0.12] bg-white/[0.05] text-[10px] uppercase tracking-[0.24em] text-white/70 transition hover:border-white/30 hover:bg-white/[0.09] hover:text-white ${FOCUS}`}
              >
                Export
                <span aria-hidden className="text-[11px] tracking-normal">
                  ↗
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── primitives ──────────────────────────────────────────────────────────── */

function Chevron({ open, sheet }: { open: boolean; sheet?: boolean }) {
  // The sheet opens UPWARD on a phone and downward on desktop, so the arrow has
  // to point the opposite way in each case.
  const rotation = sheet
    ? open
      ? "rotate-0 sm:rotate-180"
      : "rotate-180 sm:rotate-0"
    : open
      ? "rotate-180"
      : "";
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={`h-3 w-3 shrink-0 text-white/35 transition-transform duration-200 ${rotation}`}
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A collapsible group. The header keeps the cap-title + rule signature and
 *  adds a live read-out, so a closed section still reports its state. */
function Section({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-white/[0.07] first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`group sticky top-0 z-10 flex w-full items-center gap-2.5 border-b border-transparent bg-[#0b0b0d]/90 px-3 py-2.5 text-left backdrop-blur-md ${FOCUS} ${
          open ? "border-white/[0.05]" : ""
        }`}
      >
        <span
          className={`${MONO} shrink-0 text-[9.5px] uppercase tracking-[0.22em] transition ${
            open ? "text-white/75" : "text-white/45 group-hover:text-white/75"
          }`}
        >
          {title}
        </span>
        <span className="h-px min-w-2 flex-1 bg-white/[0.08]" />
        <span
          className={`${MONO} max-w-[96px] shrink-0 truncate text-[9.5px] tabular-nums text-white/30`}
        >
          {summary}
        </span>
        <Chevron open={open} />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden" inert={!open}>
          <div className="space-y-3 px-3 pb-3.5 pt-0.5">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Label left, control right — for controls that fit on one line. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <span className={`${CAP} shrink-0`}>{label}</span>
      <div className="min-w-0 shrink-0">{children}</div>
    </div>
  );
}

/** Label above a full-width control, with an optional right-hand action. */
function Stack({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-4 items-center justify-between gap-2">
        <span className={CAP}>{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[10px] leading-relaxed text-white/25">{children}</p>;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  full,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  full?: boolean;
}) {
  // Tighten the padding once the track carries enough options that a longer
  // label ("Custom") would otherwise get ellipsised.
  const pad = full && options.length > 4 ? "px-1" : "px-2";
  return (
    <div
      className={`${
        full ? "flex w-full" : "inline-flex"
      } items-center gap-0.5 rounded-[9px] bg-white/[0.045] p-[3px] ring-1 ring-inset ring-white/[0.07]`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`${
              full ? "flex-1" : ""
            } min-w-0 truncate rounded-[6px] ${pad} py-[3px] text-[10.5px] leading-4 transition duration-150 ${FOCUS} ${
              active
                ? "bg-white/[0.14] text-white shadow-[0_1px_2px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.10)]"
                : "text-white/45 hover:text-white/85"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[19px] w-[34px] shrink-0 rounded-full transition-colors duration-200 ${FOCUS} ${
        checked ? "bg-white/85" : "bg-white/[0.12] ring-1 ring-inset ring-white/[0.08]"
      }`}
    >
      <span
        className={`absolute left-[2px] top-[2px] h-[15px] w-[15px] rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.55)] transition-transform duration-200 ${
          checked ? "translate-x-[15px] bg-[#0b0b0d]" : "bg-white/85"
        }`}
      />
    </button>
  );
}

function StepperButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-white/45 transition hover:bg-white/[0.08] hover:text-white ${FOCUS}`}
    >
      {children}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className={`${CAP} shrink-0`}>{label}</span>
      <input
        type="number"
        min={80}
        max={4096}
        step={10}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n > 0) onChange(Math.min(4096, Math.max(80, Math.round(n))));
        }}
        className={`${INPUT} tabular-nums`}
        aria-label={`${label} in pixels`}
      />
    </label>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <span className={`${MONO} text-[10px] uppercase tabular-nums text-white/40`}>
          {value}
        </span>
        <span
          className="relative block h-[22px] w-[22px] shrink-0 overflow-hidden rounded-[6px] ring-1 ring-inset ring-white/25"
          style={{ background: value }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={label}
          />
        </span>
      </div>
    </Field>
  );
}

function TextRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className={`${CAP} block`}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
        aria-label={label}
      />
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={CAP}>{label}</span>
        <span className={`${MONO} text-[10px] tabular-nums text-white/70`}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        style={{
          backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.78) ${pct}%, rgba(255,255,255,0.11) ${pct}%)`,
        }}
        className={`h-[3px] w-full cursor-pointer appearance-none rounded-full ${FOCUS}
          [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.7)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-95
          [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white`}
      />
    </div>
  );
}
