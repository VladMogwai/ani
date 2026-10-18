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
The knight answers 2.5 s after each fireball, alternating two spells: a dark skull (pimen's Dark VFX 1): his CastSpell animation, the skull
flies to the mage, bursts, a dark spirit (Dark VFX 2) rises under her and she plays her hurt animation; or a bat in a blood orb (Frostwindz Vampire VFX 3) that bursts into a blood star (VFX 1).
Movement: hover a floor cell to see the path, click to walk there: up to 5 steps to the 4 neighbouring cells,
one height level per step (stairs), around props, water and the other unit, with the walk animation.
Projectiles follow a moving target; a walking unit keeps walking when hit, and casts once it stops.
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
- The canvas renders at `devicePixelRatio` (`autoDensity`), otherwise Retina screens get a blurry 2× stretch.
- PixiJS used imperatively in one effect. The picture covers the whole panel (scaled to fill, overflow cropped);
  nearest sampling.
- Characters: 128 px frames, one row per screen direction clockwise from east (E, SE, S, SW, W, NW, N, NE),
  drawn 1:1 with the picture. Knight: licensed sheets in `licensed/knight/` (gitignored), used from
  `licensed/knight/clean/`: `clean-knight.lua` hardens the edges, flattens the baked shadow, sharpens and reduces
  them to 24 colours so the soft 3D render reads as pixel art. Mage: CC0 sheets packed by Aseprite at their full 256 px and drawn at
  `scale: 0.5`, so high-density screens show all of their detail (`frame` / `scale` per character).
- Units have named animations (`CONFIG.characters[*].anims`: idle, cast, hurt; `loop` or one-shot) and return to idle
  after a one-shot. The fireball orb and the impact burst are frame-by-frame Aseprite sprites (`art/fx/build-fx.lua` →
  `fireball.aseprite` 16px × 6, `explosion.aseprite` 48px × 10), exported as `assets/fx/*.png` + `*.json`
  (json-array with per-frame durations, read with `?raw`). The orb rotates along the arc; trail sparks are Graphics.
  Re-export: `aseprite -b fireball.aseprite --sheet-type horizontal --sheet fireball.png --data fireball.json --format json-array --list-tags`.
- Spells are data (`CONFIG.spells`): caster, target, timer, release frame, projectile effect, hit effects at chest or feet.
  Effects are Aseprite exports listed in `CONFIG.fx`, optionally one tag of a sheet (`fly` / `hit`).
- Dark VFX 01-02 (pimen, free part of a paid pack, no redistribution) live in `licensed/fx/` with their `.aseprite`
  sources built by `licensed/fx/import-dark-vfx.lua` (tags, 80 ms per frame).
- Movement: breadth-first search from the player's cell (`reachable`, `pathTo`), units keep `cell`, `path`, `step`;
  `CONFIG.move` holds the range, speed, max height step and the highlight alphas.
- Vampire VFX (Frostwindz, free version: use in projects, no redistribution, no AI training) live in
  `licensed/fx/vampire/` as frames; `licensed/fx/import-vampire.lua` builds `blood-bat` / `blood-star` .aseprite files.
  They are drawn at half size (`scale` in `CONFIG.fx`).
- CONFIG: move, spells, light flicker, hover colour, ring and foot shadow sizes, character sheets (frames, fps, feet), units.

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
- 2026-10-18: fireball and explosion drawn frame by frame in Aseprite, replacing the code-drawn circles
- 2026-10-18: the knight answers with pimen's dark skull (Dark VFX 1) and a rising dark spirit (Dark VFX 2); spells are data
- 2026-10-18: movement (path preview, click to walk, stairs, range 5); the knight alternates the dark skull and a blood bat
  (Frostwindz Vampire VFX); projectiles home on moving targets
- 2026-10-18: sharper picture: canvas at device pixel ratio; mage sheets at full 256 px drawn at half scale
- 2026-10-18: knight sheets cleaned up (hard edges, flat shadow, sharpening, 24 colours)
