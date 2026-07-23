import type { CSSProperties, ReactNode } from "react";
import type { Polarity } from "../portraits";
import { HERO_FONTS, type HeroFonts } from "./heroFonts";

export type HeroContent = {
  brand: string;
  headline: string;
  subline: string;
  cta: string;
  /** Comma-separated nav labels. */
  links: string;
};

export type HeroVisibility = {
  nav: boolean;
  headline: boolean;
  subline: boolean;
  cta: boolean;
};

export type HeroState = {
  enabled: boolean;
  designId: string;
  content: HeroContent;
  visibility: HeroVisibility;
};

export const DEFAULT_HERO: HeroState = {
  enabled: false,
  designId: "centered",
  content: {
    brand: "Meridian",
    headline: "Form, remembered in light",
    subline:
      "A study in presence — thousands of particles holding the shape of a moment.",
    cta: "See the work",
    links: "Work, Studio, Journal, Contact",
  },
  visibility: { nav: true, headline: true, subline: true, cta: true },
};

/** Text colours derived from the current look. */
export type HeroInk = {
  ink: string;
  inkSoft: string;
  line: string;
  accent: string;
};

export function deriveInk(polarity: Polarity, accent: string): HeroInk {
  return polarity === "dark-on-light"
    ? {
        ink: "#16130e",
        inkSoft: "rgba(22,19,14,0.56)",
        line: "rgba(22,19,14,0.24)",
        accent,
      }
    : {
        ink: "#f4f2ec",
        inkSoft: "rgba(244,242,236,0.56)",
        line: "rgba(244,242,236,0.24)",
        accent,
      };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend two hex colours; t=0 → a, t=1 → b. Returns an rgb() string. */
function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((x, i) => Math.round(x + (B[i] - x) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/**
 * A whisper of a sheen for the H1 — a very narrow tonal range (stays fully
 * legible) that picks up the faintest hint of the current look's accent at its
 * tail. Applied via background-clip:text; deliberately barely-there.
 */
export function headlineSheen(polarity: Polarity, accent: string): string {
  return polarity === "dark-on-light"
    ? `linear-gradient(92deg, #16130e 0%, #26201a 72%, ${mix("#16130e", accent, 0.2)} 100%)`
    : `linear-gradient(92deg, #ffffff 0%, #efece4 66%, ${mix("#f4f2ec", accent, 0.18)} 100%)`;
}

/** Gradient-text style for a headline: the sheen clipped to the glyphs. */
function headlineStyle(sheen: string, fontFamily: string): CSSProperties {
  return {
    fontFamily,
    backgroundImage: sheen,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
  };
}

type DesignProps = {
  content: HeroContent;
  visibility: HeroVisibility;
  ink: HeroInk;
  fonts: HeroFonts;
  sheen: string;
};

const links = (s: string) =>
  s.split(",").map((l) => l.trim()).filter(Boolean);

// A quiet, real-site nav: wordmark + sentence-case links, small and calm.
function Nav({
  content,
  ink,
  fonts,
}: {
  content: HeroContent;
  ink: HeroInk;
  fonts: HeroFonts;
}) {
  return (
    <header
      className="flex items-center justify-between px-[4cqw] pt-[3.4cqh]"
      style={{ fontFamily: fonts.body }}
    >
      <span
        className="text-[max(12px,0.92cqw)] font-semibold tracking-[-0.01em]"
        style={{ color: ink.ink }}
      >
        {content.brand}
      </span>
      <nav
        className="flex items-center gap-[2cqw] text-[max(11px,0.8cqw)] tracking-[0]"
        style={{ color: ink.inkSoft }}
      >
        {links(content.links).map((l, i) => (
          <span key={`${l}-${i}`}>{l}</span>
        ))}
      </nav>
    </header>
  );
}

// A small uppercase eyebrow — the one place caps earn their keep, kept tiny.
function eyebrowClass() {
  return "text-[max(9px,0.66cqw)] font-medium uppercase tracking-[0.16em]";
}

function Centered({ content, visibility, ink, fonts, sheen }: DesignProps) {
  return (
    <div className="flex h-full flex-col">
      {visibility.nav && <Nav content={content} ink={ink} fonts={fonts} />}
      <div className="flex flex-1 flex-col items-center justify-center px-[7cqw] text-center">
        {visibility.headline && (
          <h1
            className="max-w-[18ch] text-[max(26px,4.2cqw)] font-semibold leading-[1.06] tracking-[-0.035em]"
            style={headlineStyle(sheen, fonts.display)}
          >
            {content.headline}
          </h1>
        )}
        {visibility.subline && (
          <p
            className="mt-[2.4cqh] max-w-[42ch] text-[max(11px,1cqw)] leading-[1.55] tracking-[0]"
            style={{ color: ink.inkSoft, fontFamily: fonts.body }}
          >
            {content.subline}
          </p>
        )}
        {visibility.cta && (
          <span
            className="mt-[3.6cqh] inline-block rounded-full border px-[2cqw] py-[1cqh] text-[max(11px,0.82cqw)] font-medium tracking-[0]"
            style={{ borderColor: ink.line, color: ink.ink, fontFamily: fonts.body }}
          >
            {content.cta}
          </span>
        )}
      </div>
    </div>
  );
}

function EditorialLeft({ content, visibility, ink, fonts, sheen }: DesignProps) {
  return (
    <div className="flex h-full flex-col">
      {visibility.nav && <Nav content={content} ink={ink} fonts={fonts} />}
      <div className="flex flex-1 flex-col justify-center px-[5cqw]">
        {visibility.headline && (
          <h1
            className="max-w-[15ch] text-[max(32px,5.2cqw)] font-extrabold uppercase leading-[0.94] tracking-[-0.01em]"
            style={headlineStyle(sheen, fonts.display)}
          >
            {content.headline}
          </h1>
        )}
        {visibility.subline && (
          <p
            className="mt-[2.8cqh] max-w-[36ch] text-[max(11px,0.98cqw)] leading-[1.55] tracking-[0]"
            style={{ color: ink.inkSoft, fontFamily: fonts.body }}
          >
            {content.subline}
          </p>
        )}
        {visibility.cta && (
          <span
            className="mt-[3cqh] inline-flex items-center gap-[0.6ch] text-[max(11px,0.85cqw)] font-medium tracking-[0]"
            style={{ color: ink.ink, fontFamily: fonts.body }}
          >
            {content.cta}
            <span style={{ color: ink.accent }}>→</span>
          </span>
        )}
      </div>
    </div>
  );
}

function BottomAnchored({ content, visibility, ink, fonts, sheen }: DesignProps) {
  return (
    <div className="flex h-full flex-col justify-between">
      {visibility.nav ? (
        <header
          className="flex items-center justify-between px-[4cqw] pt-[3.4cqh] text-[max(11px,0.82cqw)] tracking-[0]"
          style={{ color: ink.inkSoft, fontFamily: fonts.body }}
        >
          <span className="font-semibold" style={{ color: ink.ink }}>
            {content.brand}
          </span>
          <span>{links(content.links)[0] ?? "Menu"}</span>
        </header>
      ) : (
        <span />
      )}
      <footer className="flex items-end justify-between gap-[4cqw] px-[4cqw] pb-[4.6cqh]">
        <div>
          {visibility.subline && (
            <p
              className={`mb-[1.8cqh] ${eyebrowClass()}`}
              style={{ color: ink.inkSoft, fontFamily: fonts.body }}
            >
              {content.subline}
            </p>
          )}
          {visibility.headline && (
            <h1
              className="max-w-[20ch] text-[max(28px,4.4cqw)] font-normal leading-[1.05] tracking-[-0.012em]"
              style={headlineStyle(sheen, fonts.display)}
            >
              {content.headline}
            </h1>
          )}
        </div>
        {visibility.cta && (
          <span
            className="whitespace-nowrap text-[max(11px,0.82cqw)] font-medium tracking-[0]"
            style={{ color: ink.ink, fontFamily: fonts.body }}
          >
            {content.cta}
            <span className="ml-[0.5ch]" style={{ color: ink.accent }}>
              →
            </span>
          </span>
        )}
      </footer>
    </div>
  );
}

function SplitManifesto({ content, visibility, ink, fonts, sheen }: DesignProps) {
  return (
    <div className="flex h-full flex-col">
      {visibility.nav && <Nav content={content} ink={ink} fonts={fonts} />}
      <div className="flex flex-1 items-center justify-end px-[5cqw]">
        <div className="w-[36%] min-w-[min(240px,100%)]">
          <p
            className={`mb-[2.2cqh] flex items-center gap-[0.9ch] ${eyebrowClass()}`}
            style={{ color: ink.inkSoft, fontFamily: fonts.body }}
          >
            <span
              className="inline-block h-[max(4px,0.34cqw)] w-[max(4px,0.34cqw)] rounded-full"
              style={{ background: ink.accent }}
            />
            {content.brand}
          </p>
          {visibility.headline && (
            <h1
              className="text-[max(22px,2.5cqw)] font-medium leading-[1.2] tracking-[-0.02em]"
              style={headlineStyle(sheen, fonts.display)}
            >
              {content.headline}
            </h1>
          )}
          {visibility.subline && (
            <p
              className="mt-[2.4cqh] text-[max(11px,0.98cqw)] leading-[1.6] tracking-[0]"
              style={{ color: ink.inkSoft, fontFamily: fonts.body }}
            >
              {content.subline}
            </p>
          )}
          {visibility.cta && (
            <span
              className="mt-[2.8cqh] inline-flex items-center gap-[0.5ch] text-[max(11px,0.82cqw)] font-medium tracking-[0]"
              style={{ color: ink.ink, fontFamily: fonts.body }}
            >
              {content.cta}
              <span style={{ color: ink.accent }}>→</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export const HERO_DESIGNS: {
  id: string;
  name: string;
  render: (p: DesignProps) => ReactNode;
}[] = [
  { id: "centered", name: "Centered statement", render: (p) => <Centered {...p} /> },
  { id: "editorial", name: "Editorial left", render: (p) => <EditorialLeft {...p} /> },
  { id: "bottom", name: "Bottom-anchored", render: (p) => <BottomAnchored {...p} /> },
  { id: "manifesto", name: "Split manifesto", render: (p) => <SplitManifesto {...p} /> },
];

/** Font pair for a design id (falls back to the first design's pair). */
export function fontsFor(designId: string): HeroFonts {
  return HERO_FONTS[designId] ?? HERO_FONTS.centered;
}
