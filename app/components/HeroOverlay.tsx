"use client";

import type { Settings } from "../portraits";
import {
  HERO_DESIGNS,
  deriveInk,
  fontsFor,
  headlineSheen,
  type HeroState,
} from "./heroDesigns";

/**
 * Mockup layer rendered over the particle canvas, inside the frame box.
 * pointer-events: none — the field keeps reacting to the cursor through it.
 */
export default function HeroOverlay({
  hero,
  settings,
}: {
  hero: HeroState;
  settings: Settings;
}) {
  if (!hero.enabled) return null;
  const design =
    HERO_DESIGNS.find((d) => d.id === hero.designId) ?? HERO_DESIGNS[0];
  const ink = deriveInk(settings.polarity, settings.color);
  const fonts = fontsFor(design.id);
  const sheen = headlineSheen(settings.polarity, settings.color);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      style={{ containerType: "size" }}
    >
      {design.render({
        content: hero.content,
        visibility: hero.visibility,
        ink,
        fonts,
        sheen,
      })}
    </div>
  );
}
