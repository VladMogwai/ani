# 014 — Particle words

Source: none, Claude's own idea (user asked "create something")
Engine: three
Status: draft

## Effect
7000 glowing points assemble into a word from random scatter on load. Every 5 s (or on click/tap) they
burst and fly into the next word: MOTION → LAB → PLAY → ✦. The cursor pushes points away within ~110 px;
they spring back. Color is a red → violet gradient across the screen, fast points flash warm white and grow.

## Implementation
- The word is drawn on an offscreen 2D canvas sized to the viewport, filled pixels are sampled at random
  as targets (`sampleWord`), so it fits phone width too.
- CPU spring physics in `useFrame` on Float32Arrays (no React state), frame-rate independent via `step`.
- Orthographic camera, zoom 1: one world unit = one CSS pixel.
- `THREE.Points` with a small ShaderMaterial: soft round sprite, additive blending, `aSpeed` attribute drives color/size.
- Reduced motion: points snap to the word, no physics, no cursor.
- CONFIG: words, autoAdvanceMs, count, font, spring, damping, noise, burst, cursorRadius/Force, pointSize, colors.

## Preferences

## Open questions
- Words, palette, font — placeholders, waiting for the user's taste.

## Changelog
- 2026-10-28: first version
