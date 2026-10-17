# 002 — Iridescent glass logo

Source: reference/source.md (Dribbble, "Xevore" visual identity by Techwitpro Brand)
Engine: three (R3F, fullscreen fragment shader) + HTML text logo on top
Status: draft

## Effect
- Light page (#f9f9f9), a rounded card almost full-bleed.
- Inside the card: soft pink (left) → peach (right) background, violet haze bottom-left, and a heavily blurred
  "head" orb in the middle: dark mass with a blue top-left, red/orange top-right, green-yellow core,
  amber lower middle, black chin shadow, violet bottom-left, and a white rim light on the upper-left edge.
- A frosted glass plate across the center (blurred, dimmed, warm-gray tint, faint edge), white wordmark in Rubik 500.
- Film grain over the card.
- The reference is a static still; the motion is ours: every color blob drifts on its own small loop, the orb breathes
  (±3 %), the rim light swings around the edge. Seamless 10 s loop.

## Implementation
- `index.tsx`: one fullscreen `ShaderMaterial`. `scene()` paints the card picture analytically: background gradient,
  then gaussian color blobs (`CONFIG.blobs`, the first two behind the head, the rest on top), the head ellipse and the rim.
- Glass plate = 16-tap disc blur of the same `scene()` function (cheap, it's analytic) × `plateDim`, mixed with `plateTint`.
- Two scales: `fitWidth` sizes the plate and the logo (CSS uses the same formula via `--u`), `orbFitWidth` sizes the color
  picture, so on a phone the orb fills the card width while the plate still fits.
- `prefers-reduced-motion`: time frozen (grain static too).
- Colors sampled from the still (1568×1176) on a grid.

## Preferences
- Wordmark "Yarkina" (the user's own, as in 001) instead of "Xevore"; the X-mark is not drawn.

## Open questions
- What kind of motion is wanted: current slow drift, cursor-following orb, or an intro (orb fades in, plate slides up)?
- Keep the presentation frame from the shot (header "Xevore", arrow, "Logo Structure" caption) or card only?
- Add the Xevore-style mark next to the text?

## Changelog
- 2026-10-17: first version from the Dribbble still; motion invented (drift, breathing, swinging rim light).
