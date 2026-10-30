# 023 — Capsules background

Source: reference/source.md (Blender render, the user's own)
Engine: css (plain `<video>`)
Status: matches reference

## Effect
A 24 s seamless Blender loop of glass capsules, full screen, plays on load, muted, looped. Film grain on top
(SVG noise jumping 6 times per 0.6 s, overlay blend).

## Implementation
- Two renders: landscape 1920×1080 and portrait 1080×1920, picked by `(orientation: portrait)`; the `<video>` remounts on rotation.
- `<source>` WebM (VP9) first, MP4 fallback for Safari. Poster jpg shows until the first frame.
- `prefers-reduced-motion`: no autoplay (poster stays), grain frozen.
- CONFIG: `grainOpacity`.

## Preferences

## Open questions

## Changelog
- 2026-10-30: added from the capsule loop renders, as a background.
