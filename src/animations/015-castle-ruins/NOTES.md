# 015 — Castle ruins

Source: user's idea: a landscape in the style of Fallout Tactics (pre-rendered isometric), but medieval:
castle ruins on a hill. No reference files.
Engine: pixi (view) + Blender (the map is rendered there)
Status: draft

## Effect
One pre-rendered isometric map (2560x1920, 40 px per metre): a hill with a ruined castle on a flat top: curtain
walls in a 45-degree square (front walls low and broken so the yard shows, back walls tall with merlons), four round
towers in different states, a roofless keep with windows, flagstones in the yard, rubble that rolled down the slope.
A dirt road winds up from the bottom to the gate. Dry olive grass with tufts, rocks on the slopes and a ridge on
the left, dead trees, a few gnarled living ones, bushes, hills behind.
In the browser: drag to pan, wheel / pinch to zoom (never less than covering the screen), Day / Dusk / Night
buttons fade a colour grade over ~1 s, soft cloud shadows drift across.

## Implementation
- `tools/build_ruins.py` builds the whole scene procedurally (no downloaded assets) and renders it. In Blender
  via MCP: `exec(compile(open(P).read(), P, 'exec'), {'__name__': 'ruins', '__file__': P})`, then `build()`,
  then `render()` (Cycles, Metal GPU, 64 samples, ~1 min) → `assets/map.png`; then
  `cwebp -q 86 assets/map.png -o assets/map.webp` and delete the png (7 MB).
  Script CONFIG: seed, castle position, plateau height, road polyline, grid, course height, render size, samples, grass count.
- `export_3d()` (after `build()`) bakes the procedural colours and exports the same scene for 016, see its NOTES.
- Camera: orthographic, 30 degrees down, looking along +Y; the castle frame is turned 45 degrees.
- Every block needs support from the course below (walls: overlap >= 35%, towers: one of the two blocks under it);
  `floating()` checks the built mesh against the ground and the blocks below.
- Walls and towers are stacked stone blocks (one joined mesh with a bevel); a top profile with breaches,
  random missing blocks near the top, rubble at the breaches. Per-block tint from a face attribute `rand`.
- Terrain: hill + fractal noise + ridge + back hills; the road flattens its cross section (cut and fill);
  vertex attributes `road` and `yard` drive the ground material.
- `index.tsx`: plain PixiJS app (like 012), ColorMatrixFilter grade (same formula as 012), cloud shadows are
  sprites of one radial-gradient canvas texture. CONFIG: focus, zoom, grades, transition speed, clouds.
- Reduced motion: no cloud drift, instant time switch.

## Preferences

## Open questions
- Is this the look wanted? Fallout Tactics is browner and more detailed; stones here are fairly clean and regular.
- Night is only a grade; real night (torches, moonlight) needs a second render.
- Should the hero walk here (needs a walk grid / occlusion like 012)?

## Changelog
- 2026-10-28: first version
- 2026-10-28: script can also export the scene for the real-time 3D variant 016
- 2026-10-28: no more floating stones: a block stays only if the course below holds it (>= 35% of its length), lintels only while both jambs stand, rubble lies on the ground; `floating()` in the script lists any that still float (0 now)
