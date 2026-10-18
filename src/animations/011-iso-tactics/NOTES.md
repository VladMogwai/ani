# 011 — Iso tactics

Source: reference/tactics-reference.webp (isometric turn-based dungeon tactics with dice), reference/source.md
Engine: pixi
Status: draft

## Effect
A hand-editable pixel-art dungeon drawn in Aseprite (terraced cliffs, stone slabs, dirt, grass, rubble,
a flooded pit with a mossy block, three wall torches). The torch light flickers. The player's mage (gold ring)
and the enemy Dark Knight (red ring) stand on floor cells, play their idle loops and face each other.
Every 5 s (first time 3 s after load) the mage casts a fireball at the knight: cast animation, the orb leaves her
hand on frame 15, flies along a shallow arc with a spark trail, bursts on the knight, who plays his hurt animation.
Hovering a floor cell highlights it. Fixed camera. The page sits in the gallery's dark panel on the colour backdrop
(`src/shared/ScreenFrame.tsx`), the canvas is transparent so the panel texture shows around the picture.

## Implementation
- The dungeon is built by `art/scenes/dungeon/build-dungeon.lua` (Aseprite CLI) into `dungeon.aseprite` with layers
  background / terrain / details / props / torches / darkness / light. Layers are exported to `assets/dungeon/`:
  `base.png` (terrain + details + props + torches), `light.png` (drawn with `blendMode = 'add'`, alpha flickers), `darkness.png`.
  Re-export after editing the .aseprite file:
  `aseprite -b dungeon.aseprite --ignore-layer background --ignore-layer light --ignore-layer darkness --save-as base.png`
  and `--layer light` / `--layer darkness` for the other two.
- `level.ts` repeats the map and tile constants of the Lua script (64×32 diamonds, 16 px per level) so `cellCenter`
  and `cellAtPoint` line up with the painted floor. Keep both in sync when the map changes.
- PixiJS used imperatively in one effect. The picture covers the whole panel (scaled to fill, overflow cropped);
  nearest sampling.
- Characters: 128 px frames, one row per screen direction clockwise from east (E, SE, S, SW, W, NW, N, NE),
  drawn 1:1 with the picture. Knight: licensed sheet in `licensed/` (gitignored). Mage: CC0 sheets packed by Aseprite.
- Units have named animations (`CONFIG.characters[*].anims`: idle, cast, hurt; `loop` or one-shot) and return to idle
  after a one-shot. The fireball is Graphics with additive blending in an `fx` container between units and light.
- CONFIG: fireball timing/speed/arc/colours, light flicker, hover colour, ring and foot shadow sizes, character sheets (frames, fps, feet), units.

## Plan
1. Diorama (this version).
2. Movement: click a cell, show reachable cells, walk along a path respecting move points and height steps.
3. Combat: turns, dice roll, attack, HP, portraits, END TURN.
4. Enemy AI: approach and attack.

## Preferences
- Wants a game in the style of the reference; free assets first, own art later (user is learning Aseprite).
- No golden grid lines on the floor: looks better without them.
- No outline around characters; the team-coloured ring under the feet is enough.
- Prefers the background drawn in Aseprite over the 3D scene.

## Open questions
- The mage is a girl in an orange coat (CC0 sample model); recolour the coat to a robe colour, or keep it?
- Dice rules: what each die colour does.

## Changelog
- 2026-10-18: first diorama with pixel 3D rendering (R3F), HD Knight sprites (free pack)
- 2026-10-18: grid hidden, team rings, mage (Hormelz CC0) as the player, knight as the enemy
- 2026-10-18: replaced the 3D scene with the Aseprite-drawn dungeon on PixiJS (the R3F version is in git history, commit aaa3324)
- 2026-10-18: page framed like the gallery: dark panel on the animated colour backdrop
- 2026-10-18: the picture covers the whole panel instead of fitting inside it
- 2026-10-18: cliffs and terrace faces (4+ levels) are rock boulders instead of masonry, with chipped rims
- 2026-10-18: accent props on their own Aseprite layer: dead tree with roots, broken column, chains, rubble heap,
  skulls and bones; prop cells are listed in `PROPS` (level.ts) and are not walkable
- 2026-10-18: new map: tall wall only as a one-cell rim at the back and left, the rest are walkable terraces
  (6 and 4) linked by one-level stairs; torches and chains only on visible wall faces (the script asserts it)
- 2026-10-18: the mage throws a fireball at the knight every 30 s; knight hurt animation on impact
- 2026-10-18: fireball every 5 s instead of 30
