# 011 — Iso tactics

Source: reference/tactics-reference.webp (isometric turn-based dungeon tactics with dice), reference/source.md
Engine: three
Status: draft

## Effect
Dark stone dungeon seen from a fixed isometric angle, rendered at low resolution so it reads as pixel art.
Terraced cliffs at the back, a flat floor with a golden grid, dry grass, a flooded pit with a mossy block,
two wall torches with flickering flames and warm light. The player's mage (gold) and the enemy Dark Knight (red) stand on the grid and face each other.
Hovering a floor cell highlights it. Drag rotates the camera around the map, wheel / pinch zooms.

## Implementation
- "Pixel 3D": real 3D scene (R3F) drawn with `dpr = 1 / CONFIG.pixel` and `image-rendering: pixelated`,
  orthographic camera at 45° azimuth and ~30° elevation (the classic 2:1 pixel-art angle), no antialiasing, `flat` (no tone mapping).
- Level is a heightmap in `level.ts` (digits = height levels of 0.5 units, `w` water pit, `m` mossy block).
  Every level of every column is one instance of a box, so side textures keep their proportions.
- Textures are tiny canvases drawn in `textures.ts` (stone top/side, grass tuft, moss), sampled with NearestFilter.
- Water and torch flames are small ShaderMaterials; torch point lights flicker in `useFrame`.
- Readability: each unit has a team-coloured 1 px outline (shader on a billboard plane checks 8 neighbours of the
  sheet frame at `CONFIG.outline.texels`), a pulsing ring of the same colour and a dark spot under the feet;
  grass is never placed on unit cells. Gold = player, red = enemy.
- Characters are camera-facing billboards cut from sheets with 128 px frames, one row per direction; `CONFIG.characters` holds
  per-sheet frames, fps, size, feet and `minLuma`. Knight: 15×8 licensed sheet. Mage: CC0 sheets packed by Aseprite. Facing is picked from the angle
  to the target on screen, snapped to 8 directions; sheet row = direction index, clockwise from east
  (0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE). The enemy is the same knight tinted.
- Licensed sprite sheets live in `licensed/` (gitignored, the repo is public). See reference/source.md to restore them.
- CONFIG: pixel size, camera angles and zoom, lights, grid, grass density, torches, knight sprite size/feet/fps, units.

## Plan
1. Diorama (this version).
2. Movement: click a cell, show reachable cells, walk along a path respecting move points and height steps.
3. Combat: turns, dice roll, attack, HP, portraits, END TURN.
4. Enemy AI: approach and attack.

## Preferences
- Wants a game in the style of the reference; free assets first, own art later (user is learning Aseprite).
- No golden grid lines on the floor: looks better without them.
- No outline around characters; the team-coloured ring under the feet is enough.

## Open questions
- The mage is a girl in an orange coat (CC0 sample model); recolour the coat to a robe colour, or keep it?
- Dice rules: what each die colour does.
- Portraits: placeholder or wait for user's own art?

## Changelog
- 2026-10-18: first diorama with pixel 3D rendering, HD Knight sprites (free pack)
- 2026-10-18: grid and hover highlight render before the sprites (renderOrder), so lines no longer show through the knights
- 2026-10-18: grid lines hidden (`CONFIG.grid.show`), the user prefers the floor without them; cell hover stays
- 2026-10-18: units stand out: team-coloured outline, ring and foot shadow, no grass on their cells
- 2026-10-18: thinner outline (1 sheet px) that skips the knight's baked shadow
- 2026-10-18: player is a mage (Hormelz CC0 sheets, packed with Aseprite CLI); the knight becomes the enemy
- 2026-10-18: outline turned off (`CONFIG.outline.show`), only the team ring and foot shadow stay
