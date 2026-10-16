# 001 — Warm glow logo card

Source: reference/source.md (Dribbble, "Mindaf" letter M logo by Anik Khandaker)
Engine: three (R3F, fullscreen fragment shader) + HTML/SVG logo on top
Status: matches reference (background); text logo "Yarkina"

## Effect
- Cream background, a large dark card almost full-bleed (margins ~5% sides, ~8% top/bottom).
- Inside the card, a horizontal gradient: cream on the left → peach → bright red-orange (~23% width) → dark brown → #1e1e1e from ~55%.
  The color bands are bent into a soft chevron "<": at the vertical center they sit ~11% more to the left than at top/bottom.
- Card edges are very soft (~70 px at 800×600) and burn through deep red → orange → yellow → cream, like a heat glow.
  The left edge is invisible because the inside there is already cream.
- Motion: slow cloth-like wobble, period 3 s, seamless loop. Edges move ±10 px at 800×600; top and bottom ends of the bands
  shift out of phase (slight skew). The logo itself is static.
- Measured from the video: row/column color samples and edge positions every 0.25 s.

## Implementation
- `index.tsx`: one `<mesh>` with a fullscreen `ShaderMaterial`; colors are passed as sRGB vec3 (no color management, `flat` canvas)
  so they interpolate like the video.
- Card = rounded-box SDF in height-normalized coordinates; the wobble is a sine displacement of the coordinates before the SDF only
  (the gradient uses undisplaced coordinates, so the color bands stay put):
  a slow whole-card sway (`wobbleAmp`) plus traveling ripples along each edge (`rippleAmp`, `rippleFreq`), two waves per axis,
  with a cross term so opposite edges move out of phase.
- Edge glow = fire ramp across the SDF transition, scaled by how dark the inside color is.
- Everything tunable is in `CONFIG`: gradient stops, fire ramp, background, margins, edge width, wobble amplitude/period,
  bend, skew, logo text.
- Logo: text only (`CONFIG.logoText`), white, centered, system-ui 600. The original M mark was removed.
- `prefers-reduced-motion`: time is frozen.

## Preferences
- Edges must ripple along their length like cloth, not shift as one piece.
- Only the edges move; the color bands inside stay still (apart from the slight top/bottom skew).
- Chose the original ember palette and system-ui font over 6 alternatives (ocean, lavender, emerald, rose, sunset,
  graphite with Google Fonts); those live in commit bb7d9de if needed again.
- User's own wordmark "Yarkina" instead of the original logo.

## Open questions
- On portrait screens the card stretches to the viewport; keep 4:3 card instead?

## Changelog
- 2026-10-17: first recreation from the Dribbble video.
- 2026-10-17: gradient positions switched to viewport-relative x; margins tuned so edge ranges match the video
  at 800×600 (right edge 722..740 vs 721..739, top 50..68 vs 52..65); logo scaled to 7.5vw so it fits narrow screens.
- 2026-10-17: logo replaced with the text "Yarkina", M mark removed.
- 2026-10-17: 6 extra color themes, each with its own font, plus a theme switcher (`?v=`).
- 2026-10-17: kept only the ember palette; theme switcher and extra fonts removed.
- 2026-10-17: edges ripple along their length (traveling waves, ~1 wave per edge, ±10 px at 800×600), matching the reference
  edge profile; whole-card sway reduced to 0.008.
- 2026-10-17: wobble applied to the card edges only; gradient bands no longer bend with it (red band at center fixed at 177 px vs 182 px in the reference).
