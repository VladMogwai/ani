# 007 — Subject cards blob

Source: reference/source.md (Awwwards element "Subject card interactions", The Online School)
Engine: css (React + CSS, one rAF loop, no canvas)
Status: draft
Siblings: 005-liquid-hero-blob, 006-simpl-video-menu

## Effect
- Navy page, a horizontal row of seven outlined cards (number, title, text, circle icon, "+"), pager "01 —— 07".
- Normal system cursor (grab / grabbing); dragging moves the carousel with a throw.
- Icons: each circle holds its own line figure — clock, cone, bars, ball, stripes, whirl, cross. They draw in
  (~1.1 s, staggered 0.15 s left to right) once the carousel rests, retract (0.35 s) while it moves, and keep a
  subtle idle motion (hands drift, bars breathe, stripes bob, arcs turn).
- Hover (from the user's screen recording, `reference/hover-recording.mp4`): every card shows the same liquid blob
  (`reference/blob-shape.png`) with its own placement, turn and blurred side. It appears whole but dim and fully
  blurred, focuses in ~0.7 s (one edge turns crisp, the blob grows 0.9 → 1), the opposite side stays smeared for good,
  and it keeps brightening to full by 1.6 s. The outline keeps breathing. The first hover wakes the card: from then
  on its blob reshapes in an endless 12 s loop (waves along the outline, up to 20 % of the radius, ramping in over
  2.5 s). Leaving fades it out gradually (τ 0.7 s) to fully invisible, but the loop
  keeps running; hovering again shows it at the loop's current phase. The soft side is powdery: grains scattered by noise, dense inside, sparse at the edge.
- Violet haze (#5a2ad1) around a resting cursor, not clipped by cards: builds over ~2 s while the cursor rests,
  stays where it was and fades over ~1.6 s once the cursor moves on.

## Implementation
- One `requestAnimationFrame` loop mutates the DOM through refs: shape follow (relative to the card), carousel inertia
  (`scrollLeft` + exponential friction), icon progress per card, pager bar. No React state per frame.
- Figures live in `figures.ts`: `(p, t) => path d` in a 64×64 box; each builds in stages. The loop recomputes `d`
  only while a figure is drawn.
- Hover blob: `blob.ts` — outline traced from the reference image (19 points), drawn as a closed Catmull-Rom spline
  recomputed every frame while the card is lit (breathing). Two svg layers per card along `softAxis(variant)`: a crisp
  copy masked to fade toward the soft side, and a smeared copy masked to that side only (no halo on the crisp edge).
  All blurs are CSS `filter: blur()` in card units (`--u` = one viewBox unit in px): the smear layer permanently
  (then `url(#cards-grain)`: feTurbulence → feDisplacementMap, scale `grain` px, for the powder), the whole shape
  while focusing. A strong blur before the grain hides it (displacing a smooth gradient changes nothing visible),
  so the soft-side blur is moderate and the scatter does the rest. SVG filters were dropped: Chrome clipped them to the blob's box (a visible frame).
- Haze: a fixed radial-gradient div; the loop tracks cursor speed, builds/fades its strength and only lets it drift
  toward the cursor while it is faint.
- Track is a native horizontal scroller: touch scrolls natively (with snap), the mouse drags it.
- CONFIG: cards (title, color, shape variant, text), colors, shapeRise/shapeDecay, focus, softBlur, grain, startBlur, breathe, grow, morph/morphIn/morphLoop, tilt, perspective, haze (color, size, opacity, build, fade, follow), friction, icon in/out/stagger, idle delay.

## Preferences
- No custom cursor (the reference's big "drag" circle was rejected): keep the normal mouse.
- Hover must show distinct shapes per card, not just a blurred glow.
- Icons approved. Rejected hover versions: a crisp shape glued to the cursor; a liquid morphing shape with card tint;
  fixed static shapes that only fade in ("не анимированное").
- Blur must look grainy, like powder. The blob starts from the traced outline; after the first hover it keeps
  reshaping in a loop; on hover out it fades to invisible while the loop continues.
- Blobs lean back in perspective (rotateX 15°, origin at the bottom) — upright ones looked too vertical.
- The hover shape is one blob (user's image) with variants of blur and reveal; the crisp side differs per card.
- A sweeping-front reveal was rejected: "блюр пропал, просто пятно" — the smeared side must stay.
  Compare against the video frame by frame before showing changes to this effect.

## Open questions
- Shapes 05–06 are not visible in the video (ours). During drag the video's shapes behave differently (not studied).

## Changelog
- 2026-10-17: first version from the Awwwards video.
- 2026-10-17: animated line figures in the icons; per-card hover shapes instead of the blurred blob; removed the "drag" cursor.
- 2026-10-17: hover reworked after the video: shape in place with parallax, liquid edge, card tint, slow fade-out.
- 2026-10-17: hover rebuilt from a frame-by-frame comparison: fixed shapes, linear rise / exponential decay, resting-cursor violet haze.
- 2026-10-17: fixed a dark band and a hard-cut bottom on the shapes (mask region + crossfade dip).
- 2026-10-17: hover = the user's blob in every card, revealed by a soft sweeping front, outline breathing.
- 2026-10-17: reveal reworked from the user's recording: blurred → focus with a permanently smeared side; fixed filter clipping.
- 2026-10-17: fixed the rectangular frame around the blurred blob (filter moved into each card svg).
- 2026-10-17: blurs moved to CSS filters; removes the frame that showed while the blob focused in.
- 2026-10-17: blobs tilted back 15° in perspective so the top reads farther away.
- 2026-10-17: slow reshaping while hovered; powdery grain on the soft side.
- 2026-10-17: first hover wakes a blob; afterwards it loops its reshaping and recedes to the background instead of fading out.
- 2026-10-17: hover out fades the blob out completely again; its reshaping loop keeps running unseen.
