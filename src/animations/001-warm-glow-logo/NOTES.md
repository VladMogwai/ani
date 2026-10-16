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
- Card = rounded-box SDF in height-normalized coordinates; the wobble is a sine displacement of the coordinates before the SDF and the gradient.
- Edge glow = fire ramp across the SDF transition, scaled by how dark the inside color is.
- Motion and geometry are in `CONFIG`: margins, edge width, wobble amplitude/period, bend, skew, logo text.
- Colors and fonts are in `THEMES` (7 themes): background, inner gradient, edge glow, logo font. Switcher buttons at the bottom,
  theme is in the URL `?v=<id>` (ember, ocean, lavender, emerald, rose, sunset, graphite). The shader is rebuilt per theme
  because the stop count differs (ember 15, others 7 at shared `GRAD_POS`).
- Fonts are loaded from Google Fonts in `style.css`: Manrope, Cormorant Garamond italic, DM Serif Display, Playfair Display italic,
  Unbounded, Space Grotesk; ember uses system-ui.
- Logo: text only (`CONFIG.logoText`), white, centered, font from the theme. The original M mark was removed.
- `prefers-reduced-motion`: time is frozen.

## Preferences
- User's own wordmark "Yarkina" instead of the original logo.

## Open questions
- Which theme and font to keep? The rest can be removed, or kept as a switcher.
- On portrait screens the card stretches to the viewport; keep 4:3 card instead?

## Changelog
- 2026-10-17: first recreation from the Dribbble video.
- 2026-10-17: gradient positions switched to viewport-relative x; margins tuned so edge ranges match the video
  at 800×600 (right edge 722..740 vs 721..739, top 50..68 vs 52..65); logo scaled to 7.5vw so it fits narrow screens.
- 2026-10-17: logo replaced with the text "Yarkina", M mark removed.
- 2026-10-17: 6 extra color themes, each with its own font, plus a theme switcher (`?v=`).
