# 006 — SIMPL video menu

Source: reference/source.md (Awwwards element "Video Menu", The Online School)
Engine: three (R3F fullscreen shader behind HTML columns) + CSS
Status: draft
Siblings: 005-liquid-hero-blob, 007-subject-cards-blob

## Effect
- Purple page (#4d18b4), five columns separated by soft shadows, huge letters S I M P L at the bottom with small
  labels (Spark, Ignite, Master, Participate, Launch). "How it works" intro top-left.
- A green circle cursor "Tap to explore" follows the mouse; hovering a column tints it and peeks the next letter.
- Click: the column grows (~0.8 s, ease in-out), the letter types out into the word, the description and "Play video"
  fade in; a duotone "video" (shadow → column color → pale) opens inside with a liquid S-shaped left edge and a glowing
  rim. Another click switches (old one closes in 0.3 s, then the new opens); clicking the open one closes it.

## Implementation
- Column layout is flex-grow transitions; each column has an empty `.simpl-media` div. Every frame the shader reads
  the shown column's media rect (`getBoundingClientRect`) and draws the footage + mask there, so it rides the
  column animation for free.
- Mask: signed distance to a rect whose left edge is `edgeWave * (sine + noise)`, swept in from the right by the
  reveal; halo = `exp(-d / glow)` outside, brighter rim inside.
- The footage is procedural (domain-warped fbm with a bright spot), a stand-in for real videos.
- Phone: columns become rows, the open row grows vertically. Custom cursor hidden on touch.
- CONFIG: items (word, color, text), colors, reveal timings, edge depth, glow reach, footage speed, cursor follow.

## Preferences

## Open questions
- Real video clips instead of the procedural footage? (Need free clips, e.g. from Pexels, put into `public/`.)
- Launch color is a guess (not shown in the video): yellow #ffc23d.

## Changelog
- 2026-10-17: first version from the Awwwards video.
