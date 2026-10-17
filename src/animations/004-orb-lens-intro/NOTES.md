# 004 — Orb lens intro

Source: reference/source.md (Awwwards element "Engaged Homepage Scroll", Altform), 0–6.5 s of the video
Engine: three (R3F, one fullscreen fragment shader; title rendered into a canvas texture) + HTML UI
Status: draft
Parent: 003-vortex-transition (same orb, same palette; shared code in `src/shared/orb.ts`)

## Effect
Timeline from page load (seconds, as in the video):
- 0.4–1.0: on the dark starry page the logo mark fades in, a small % counter under it.
- 0.6–3.0: loading; a thin glowing ring draws clockwise around the logo (lavender → cyan along the arc).
- 2.8–3.4: logo and counter fade, the ring stays.
- 3.6–4.4: the ring grows a little; 4.0–4.6 it fills with dim glass, the rim lit.
- 4.4–5.5: the orb opens up to full size (easeOutCubic), colors come up; the ring rides the edge and fades.
- 4.6–5.6: the title appears; through the orb it is strongly refracted (magnified, bent at the edge, slightly
  twisted), settling by 5.9 to an almost invisible lens. Buttons fade in at 5.6–6.3.
- Faint ghost bubbles in the background corners.

## Implementation
- Timeline values are computed in JS each frame (`CONFIG.t`, ranges in seconds) and passed as uniforms:
  orb radius/brightness/fill, ring radius/progress/alpha, lens strength, text alpha. No React state per frame;
  the HTML logo, counter and buttons are updated through refs in the same `useFrame`.
- Title: drawn once per viewport size into a canvas (sans + serif italic for `*words*`), sampled by the shader at
  screen uv outside the orb and at a refracted point inside it:
  `ps = c + rotate(d, twist*n.z) * (1 - mag*n.z) - n.xy * R * bend * (1-n.z)^2`, plus an RGB split near the edge
  (`aberration`). `lensIntro` → `lensRest` over `t.lensSettle`.
- Orb look: `orbColor` + `orbFinish` from `src/shared/orb.ts` (pearl film, gradient rim, highlights, glints).
- Ours, not in the video: the orb drifts toward the cursor (`follow`), so the lens moves over the text.
- "Replay intro" button restarts the timeline; `?at=5.2` in the URL freezes it at that second (to compare frames).
- `prefers-reduced-motion`: the intro is skipped (final state), shader time frozen.

## Preferences
- Logo mark is the user's "Y" (Yarkina, as in 001/002), not the Engaged mark.

## Open questions
- At rest the lens is almost off (stronger lens tore letters at the orb edge). Want a stronger visible lens at rest?
- Should the % counter reflect real loading (textures/fonts) instead of a fixed 2.4 s?
- Continue the page with the vortex from 003 and the 3D project cards from the same video?

## Changelog
- 2026-10-17: first version from the Awwwards "Engaged Homepage Scroll" video.
