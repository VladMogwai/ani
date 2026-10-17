# 005 — Liquid hero blob

Source: reference/source.md (Awwwards element "Brand hero animation", The Online School)
Engine: three (R3F, one fullscreen fragment shader) + HTML text
Status: draft
Siblings: 006-simpl-video-menu, 007-subject-cards-blob (same site, same palette and font)

## Effect
- Navy page (#142131); the right part is a purple liquid (#5217af → deep #2a1870) with a soft wavy left edge
  that slowly waves on its own.
- A red glow (#e22051) inside the liquid follows the cursor lazily (≈0.5 s to catch up); the edge bulges toward the
  cursor when it comes near.
- Headline "Education reinvented." + a rotating line: every ~5.5 s the old line slides down and fades (0.45 s, ease-in),
  then the next rises from below (0.6 s, ease-out), both clipped. A thin progress bar under the title fills per phrase.

## Implementation
- Shader: edge x per row = base + value noise + sine, minus a gaussian bulge at the glow's y; glow is a gaussian at
  the lagged cursor (exponential follow, `CONFIG.follow`). Without a mouse (touch / before first move) the glow
  wanders on a slow Lissajous path.
- Text rotation is CSS keyframes restarted with React `key` (one state update per phrase, not per frame).
- Phone: the edge moves to 15 % of the width, the text goes to the bottom.
- Colors are raw sRGB (`hex` from `src/shared/orb.ts`); `THREE.Color` would linearize them and darken the page.
- CONFIG: phrases, hold time, colors, edge position/wave/softness, bulge, glow radius/strength, follow speed.
- Font: Outfit (Google Fonts), close to the site's geometric grotesk.

## Preferences

## Open questions
- Glow speed and size are by eye; the reference cursor is barely visible in the video.

## Changelog
- 2026-10-17: first version from the Awwwards video.
