# 020 — Displaced torus

Source: reference/source.md (Visionary 3D, "Abstract Animation With ThreeJS and GLSL For Beginners")
Engine: three
Status: matches reference

## Effect
A glowing violet torus on black, seen face-on and slightly from the side. One zone of the ring bulges out with
gradient noise and burns white-hot; the rest of the surface is covered with thin concentric stripes.
Loop: the noise and the zone position breathe with `sin(t)`, the ring wobbles and slowly spins around Z.
No interaction except orbit drag.

## Implementation
- `torusGeometry` 1 / 0.3, 200×600 segments, custom `shaderMaterial` (own gradient noise with an integer hash;
  the author's repo has no license, so only the parameter values were taken).
- Vertex: `displacement(uv)` = noise(uv × `noise`, sin t × 1.4) × `displace`, masked by
  `clamp(0.23 × spread − |uv.x − (0.5 + sin t / (zoneSwing × spread))|, 0, 1)`; pushed along the normal.
- Fragment: stripes = noise(1 − z × `stripes`) × `stripeGain`; color = −stripes × (0.01 − displacement) × color / colorDivisor.
  The divisor makes blue ~16, which is what saturates and blooms.
- Post: `EffectComposer` (three/addons) → `UnrealBloomPass` 1.4 / 0.0001 / 0.01, rendered in `useFrame` priority 1.
  The composer target is **8-bit** on purpose: three.js in 2023 clamped the scene to 1 before bloom; with today's
  float default the glow washes out the whole frame. No OutputPass (no sRGB/tone mapping), same as the original.
- `CameraFit` moves the camera back below aspect `fitAspect` so the ring fits a phone screen.
- Reduced motion: time frozen at t = 1.
- Everything tunable is in `CONFIG`.

## Preferences

## Open questions
- Improvements over the tutorial (cursor reaction, tone-mapped HDR look, color variants) — not done yet, waiting for the user.

## Changelog
- 2026-10-29: first version from the tutorial, compared with the video frames at 0:03 and 17:10.
