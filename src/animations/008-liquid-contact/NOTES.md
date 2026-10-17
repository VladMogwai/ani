# 008 — Liquid contact form

Source: reference/source.md (Awwwards element "Engaged Contact Form", Altform)
Engine: three (R3F, one fullscreen fragment shader) + HTML page and form
Status: draft
Parent: 003-vortex-transition (same orb, same palette; shared code in `src/shared/orb.ts`)

## Effect
- Contact page: the pearl orb sits half off the top-left corner; big title "Challenge us with *your brief*.",
  a CTA pill, contact columns on the right.
- CTA (video 2.4–4.7 s): the page blurs out; the orb flies to the center while shrinking to ~0.13 of the screen height
  (~1 s), breathes for a moment, then swells past the edges (easeIn, ~0.8 s). Inside, it melts from the middle out
  into a flowing gradient: big soft cyan / sky / aqua / lilac blobs drifting over blue-violet.
- Form over the gradient, one step at a time: step counter, italic serif label, a cream input with a soft glow that
  grows with its text, a cyan "next" button that appears once something is typed, chips on the last step,
  "Previous" and "Close" pills on top. Steps change by blurring out up and blurring in from below.
- Finish (video 16.4–17.5 s): the gradient collapses back into the orb in the corner and the page returns.

## Implementation
- Phases `page → opening → form → closing → page` (React state, discrete events). The shader reads phase + start
  time from a ref and the timelines in `CONFIG.open` / `CONFIG.close`: orb center, radius, and `uLiquid` (0 orb, 1 liquid).
- Melt: `smoothstep(rr, rr + 0.3, uLiquid * 1.4)`, so the gradient spreads from the center; the pearl rim stays until the
  orb is past the screen.
- Liquid: 9 gaussian blobs on Lissajous paths, colors cycle cyan / sky / aqua / lilac, edges wobbled by low-frequency
  noise, aqua blobs get faint bright cores. `flowSpeed`, `flowScale`, palette in `CONFIG.liquid` (sampled from the video).
  A first try with domain-warped fbm looked like smoke, not like the round blobs of the video.
- Orb: `orbColor` + `orbFinish` from `src/shared/orb.ts`.
- Form: plain React state; nothing is sent anywhere. Enter or the cyan button goes on, Escape / Close closes,
  after the last step "Thanks, {name}" shows for `thanksSec`, then it closes by itself.
- `?at=1.6` in the URL freezes the opening at that second (to compare frames).
- `prefers-reduced-motion`: timelines and step animations are instant.

## Preferences

## Open questions
- Should the gradient react to typing or the cursor (ripples, blobs pulled toward the pointer)? Not visible in the video.
- Keep the step texts in English, or Russian?
- Not checked at phone width yet in the preview (CSS has a ≤600px layout).

## Changelog
- 2026-10-17: first version from the Awwwards "Engaged Contact Form" video.
