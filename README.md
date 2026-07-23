# Particle Hero

Turn a photo — or a short video clip — into a field of drifting light-specks that part around your cursor. Tune it live, then export it as a self-contained script you can drop into any website.

No 3D library, no particle library, no WebGL. It's hand-written canvas code in one file, and the whole thing installs in about ten seconds.


---

## Run it

```bash
pnpm install && pnpm dev
```

Then open <http://localhost:3000>.

Everything is in the panel on the right — on a phone it's a sheet at the bottom.

---

## Use your own image

This is the fun part, and it's a two-step change.

**1. Drop your file into `public/`.**

**2. Add one entry to `PORTRAITS` in [`app/portraits.ts`](app/portraits.ts):**

```ts
{
  id: "my-portrait",
  name: "My Portrait",
  src: "/my-portrait.png",
  bg: { mode: "alpha" },
}
```

Save. It appears in the switcher at the bottom of the screen automatically.

### Which `bg` mode do I need?

The engine has to know which pixels are *subject* and which are *background*, so it only spends particles on the thing you care about.

| Your image | Use | Why |
|---|---|---|
| **A cutout PNG** (transparent background) | `{ mode: "alpha" }` | Easiest and best. Any background remover gives you this. |
| **Subject on a flat colour** | `{ mode: "chroma", color: [255, 255, 255], tolerance: 0.12 }` | Flood-fills that colour inward from the edges. `color` is RGB 0–255. Raise `tolerance` if bits of background survive; lower it if parts of your subject vanish. |
| **A video clip** | *omit `bg`*, set `kind: "video"` | Video works out its own subject from the light in each frame. |

**Cutout PNGs give by far the best results.** If a photo looks muddy, that's usually the reason — the engine is spending particles on the background.

### Video clips

```ts
{
  id: "my-clip",
  name: "My Clip",
  src: "/my-clip.mp4",
  kind: "video",
  defaults: { count: 50000, contrast: 0.45 },
}
```

Keep clips **short** (2–5s), **looping**, and ideally a **bright subject on a dark background** — that's what reads best as light.

### Per-portrait defaults

`defaults` overrides any control for that portrait only:

```ts
defaults: { count: 50000, contrast: 0.7, size: 1.5 }
```

Handy when one image needs more contrast than the rest.

---

## What the controls do

**Source** — flip between the particles and the untouched original, to compare.

**Frame** — the preview box size (16:9, 21:9, square…). `Fit` and `Scale` decide how the subject sits in the frame, and unlike the preview size, **those two travel with your export**.

**Background** — `Mode` switches between light specks on a dark backdrop and dark "ink" specks on a light one. `Looks` are one-click pairings of backdrop and speck colour. `Backdrop` is the manual version.

**Particles**
- **Count** — how many specks. Exactly the number you set, no hidden scaling.
- **Speck size** — how big each one is. Small changes here matter a lot.
- **Contrast** — how hard the light falls off. `0` is flat; higher makes highlights blaze and shadows recede.
- **Colour** / **Fill** — one flat colour, or a gradient revealed *through* the specks.
- **Cursor size / style** — how far your cursor pushes the field, and what the pointer looks like.

**Mockup** — drops a fake hero layout over the top (nav, headline, sub, button) so you can see it working as a real page. Preview only; it doesn't ship with the export.

---

## Put it on your own site

Hit **Export**. You get:

- a config block matching exactly what's on screen
- a `<script>` snippet to paste
- a download for `embed.js` (~14KB, no dependencies)

```html
<div id="hero" style="width:100%;height:600px"></div>
<script src="/embed.js"></script>
<script>
  window.ParticlePortrait.mount("#hero", {
    src: "/your-image.png",
    bg: { mode: "alpha" },
    settings: {
      /* … whatever you tuned … */
    },
  });
</script>
```

It fills whatever box you give it. Host `embed.js` and your image on your own site.

If you change anything in `app/engine/`, rebuild the bundle:

```bash
pnpm build:embed
```

---

## Performance notes

The cost per frame is roughly **particle count × speck size × screen pixels**. If it feels sluggish:

1. Drop **Count** first — it's the biggest lever.
2. Then **Speck size** — going from 1.25 to 3 is nearly 6× the pixels to paint.
3. Very large, very dense displays are the hardest case.

Phones automatically start at a lower count (the panel shows the real number — there's no hidden multiplier anywhere).

---

## How it works, briefly

1. The source is analysed once into a **weighted probability map** — brighter areas and edges get more weight, so particles land where the detail is.
2. Particles are drawn from that map and given a **home** position.
3. Every frame they spring back toward home, drift gently, and are pushed away by the cursor.
4. For video, step 1 runs across the whole clip so particles cover everywhere the subject ever goes, then each frame's brightness decides which ones light up.

The engine ([`app/engine/core.ts`](app/engine/core.ts)) is plain canvas and DOM with no framework imports — which is why the same code runs both this playground and the exported embed. No drift between what you tune and what you ship.

---

## Licence

Code is MIT — see [LICENSE](LICENSE).

The sample media (statue, flower, parrot, glass) is included so the project runs out of the box. **Please swap in your own for anything you publish.**
