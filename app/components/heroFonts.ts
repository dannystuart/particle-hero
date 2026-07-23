// Curated Google-font pairings, one per hero layout — a restrained, premium
// system (think Apple keynote): mostly clean grotesques with tight tracking,
// one elegant serif for the film-title layout. Each design gets a DISPLAY face
// for the headline and a BODY face for nav / subline / CTA. Loaded via
// next/font/google (self-hosted). preload:false — only the active design's
// overlay is ever shown, so each pair loads on demand.

import {
  Schibsted_Grotesk,
  Hanken_Grotesk,
  Archivo,
  Instrument_Sans,
  Newsreader,
  Onest,
} from "next/font/google";

// Centered statement — confident, clean, keynote.
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], display: "swap", preload: false });
const hanken = Hanken_Grotesk({ subsets: ["latin"], display: "swap", preload: false });

// Editorial left — heavy grotesque set as a big, bold, uppercase statement.
const archivo = Archivo({ subsets: ["latin"], display: "swap", preload: false });
const instrumentSans = Instrument_Sans({ subsets: ["latin"], display: "swap", preload: false });

// Bottom-anchored — refined serif, cinematic restraint.
const newsreader = Newsreader({ subsets: ["latin"], display: "swap", preload: false });

// Split manifesto — soft, precise, product-grade (single family).
const onest = Onest({ subsets: ["latin"], display: "swap", preload: false });

export type HeroFonts = { display: string; body: string };

/** design id → { display, body } font-family strings (with fallbacks). */
export const HERO_FONTS: Record<string, HeroFonts> = {
  centered: { display: schibsted.style.fontFamily, body: hanken.style.fontFamily },
  editorial: { display: archivo.style.fontFamily, body: instrumentSans.style.fontFamily },
  bottom: { display: newsreader.style.fontFamily, body: hanken.style.fontFamily },
  manifesto: { display: onest.style.fontFamily, body: onest.style.fontFamily },
};
