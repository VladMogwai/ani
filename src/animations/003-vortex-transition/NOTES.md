# 003 — Vortex transition

Source: reference/source.md (Awwwards element "Engaged Vortex Transition", Altform)
Engine: three (R3F, one fullscreen fragment shader) + HTML text on top
Status: draft

## Effect
- Dark navy page (#0b0830 → #030023) with faint stars and violet haze; a glassy orb in the middle
  (lavender top-left, blue, cyan/aqua right and bottom, teal-green low, indigo left; light fresnel rim, soft glow).
- Orb → dark page (≈0.8 s to dark in the video): the orb grows past the screen edges, a dark ragged hole opens in the
  center and swirls (spiral streaks, blurred edge, a bright ring of light just outside it), grows until everything is dark.
  Then the dark text page is there.
- Dark → orb (≈1.6 s): the same in reverse; light comes in from the edges, the hole shrinks and closes, the orb settles.
- Fast start, slow settle. Trigger in the video looks like scroll, one gesture = one page.

## Implementation
- `nav.p` (section index, float) is tweened on wheel / swipe / arrow keys / click, `easeOutQuad`, `durationSec`.
  Sections alternate orb / dark; `vortexAmount(p)` maps the position to `t` (0 = orb at rest, 1 = swallowed).
- Shader: orb radius `r0 * (1 + a*t + b*t^3)` (`orbGrow`), hole radius `r * (holeStart + holeGrow * t^2.2)`.
  Hole edge: fbm on twisted polar coords (`swirl`, `swirlSpeed`), ragged by `holeNoise`, feathered by `holeSoft`.
  Orb at rest (palette and look in `ORB`, `src/shared/orb.ts`, shared with 004 and 005; sampled from the video): the middle is the darkest blue, light gathers toward
  the edges (pale top / top-left, violet left, sky right), a wide soft aqua→mint aurora crescent lower right, dark indigo
  at the low edge; all drifting slowly with fbm (`colorDrift`).
  Pearl: thin-film rainbow tint by view angle + direction + time (`iridescence`), stronger toward the edge.
  Gradient rim: a band near the edge whose color runs around the circle (lavender → sky → mint → pale) mixed with the
  film (`rimGradient`). Highlights: reflection arc just inside the upper-right edge, soft sheen top-left, `sparkles`
  twinkling glints inside. Highlights fade out once the vortex starts.
- Text: HTML, one block per section, opacity/translate set from `nav.p` in a rAF loop (no React state per frame).
  Orb pages: big centered title; dark pages: left-aligned title + small paragraph. `*word*` = serif italic.
- `prefers-reduced-motion`: transitions instant, shader time frozen.
- Orb radius shrinks on narrow screens (`width/height * 1.35`).

## Preferences
- The first orb looked too artificial. The user asked for the highlights from the original, more shimmer and pearl,
  and gradient edges. The pearl/rainbow rim is intentionally stronger than in the original.
- The previous attempt at this slot (003 scene transition, Montreal) was deleted by the user: they wanted the
  illustrations themselves, not only the motion.

## Open questions
- Should the orb react to the cursor (tilt / follow), as many such sites do? Not visible in the video.
- Free scroll (the vortex follows the wheel continuously) instead of one-gesture-one-page?
- Add the site chrome (logo, "Menu", "Get in touch" buttons)?

## Changelog
- 2026-10-17: first version from the Awwwards video.
- 2026-10-17: orb reworked: darker center, light at the edges, aurora crescent, pearl iridescence, gradient rim,
  highlights and glints (the user found the first one artificial).
- 2026-10-17: orb shader and palette moved to `src/shared/orb.ts` (004 and 005 use it too); no visual change.
