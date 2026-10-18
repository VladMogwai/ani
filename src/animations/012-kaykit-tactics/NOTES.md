# 012 — KayKit tactics

Source: reference/source.md (KayKit CC0 packs), smooth look like Kenney's Isometric Miniature Dungeon sample
Engine: pixi (scene) + three (sprite baker)
Status: draft

## Effect
`/012-kaykit-tactics` — the village at the forest edge (default, `?level=village`): KayKit Medieval Hexagon buildings
scaled x5 (tavern, two houses, smithy, well, grain field), Kenney Fantasy Town cart, stall, fences and three lanterns
along a brown dirt road, KayKit Forest trees, bushes and rocks around, hex grass ground. `?level=ruins` — a ruined courtyard of KayKit Dungeon pieces (12x10 cells, back walls
with a door, window, breaches, banner, four wall torches; barrels, crates, a table with a candle, chest, keg, a standing
torch, rubble). The hero (neutral adventurer with a dagger) walks where you click (path preview on hover, 4 neighbours,
around props). A game clock runs (1 game day = 240 s, starts at 17:30, hold T for 30x): the whole picture is coloured
by the hour (day neutral, dusk warm, night blue and desaturated, dawn pink) and flames glow and flicker from dusk to
dawn. `?units` — the character showcase below.

A scene (small game world), sibling of 011 in a smooth style. For now a character showcase on a floor of 128x64
isometric diamonds, in two rows: the KayKit characters as they come (knight, mage, barbarian, ranger, rogue,
hooded rogue, skeleton warrior, each with its class weapons and moves) and units built with the constructor (guard,
vampire, necromancer, druid, innkeeper, bandit). Each turns slowly through the 8 directions while idle and every 4 s plays its next special
animation (attack, cast, wave...) facing the viewer. Front and back views: reference/units-lineup.png.

## Implementation
- `units.ts` is the unit constructor. All KayKit characters share one skeleton (Rig_Medium) and are split into parts
  (`<Prefix>_Head`, `_Body`, `_ArmLeft`..., `_Cape`, `_Hat`, `_Helmet`, `_HelmetVisor`, `_Mask`, `_BearHat`, `_Cloak`).
  A unit: `base` model, `hide` parts, `borrow` parts from another model (skinned parts are re-bound to our skeleton by
  bone name; rigid hats/hoods hang on the bone of the same name), `tint` per part (colour multiplied over the texture,
  so it darkens and colours but cannot turn red into green), `right` / `left` items on `handslot.r` / `handslot.l`,
  `scale` per bone (e.g. head 0.82 for less cartoonish proportions), `anims` (our name → KayKit clip, optional `fps`
  for long slow clips: the skeleton idles are baked at 6 fps, 26 frames instead of 51).
  `BAKE` holds frame size (128), scale, camera, fps, WebP quality.
- `baker.tsx` (open `/012-kaykit-tactics?bake` for all units or `?bake=mage,ranger` for some, dev only): Three.js renders each unit through an orthographic camera
  at 30 degrees down / 45 around (true 2:1 isometric), 8 screen directions (rows, clockwise from east, same as 011),
  12 fps, and saves sheets via the dev server's `/__save` endpoint (`vite.config.ts`, only into `src/animations/`).
  Output: `assets/units/<unit>/<anim>.webp` (256 px frames drawn at 0.5) and `assets/units/<unit>.json`
  (frames, fps, loop, feet). The json files are written last: the scene imports them, so the first one makes the
  dev server reload the baker page.
- GLTFLoader strips dots from node names: bones are looked up with `PropertyBinding.sanitizeNodeName`
  (`handslot.r` → `handslotr`).
- `index.tsx` loads whatever the baker wrote (import.meta.glob), no manual registration.
- Loading: the gallery and other pages never fetch these sheets (separate files, referenced only by this scene's chunk).
  Inside the scene every unit's idle sheet loads first (5.1 MB, the scene shows at once), the other animations load
  one by one in the background; a special animation that is not loaded yet is skipped until it is.
- Source files the baker needs are in `source/` (CC0, committed).
- Views: `index.tsx` picks `location.tsx` (default), `showcase.tsx` (`?units`), `baker.tsx` (`?bake`) or `editor.tsx`
  (`?edit`), each lazy; baker and editor exist only in dev (the production build drops them and the models).
- Location editor (`?edit`, `editor.tsx`): live three.js view of `buildLevel` with the game camera and light; tools:
  prop (click a cell, footprint measured from the model's bounds, kept inside the map, refused on taken cells),
  decor (non-blocking scenery at the exact point), floor brushes (`catalog.ts` FLOOR_BRUSHES), select (arrows move,
  R / Shift+R rotate 90 / 45, Delete), hero start, map size, grass ground, border preview; Ctrl/Cmd+Z undo (a floor
  stroke is one step), Ctrl/Cmd+S save to `levels/<id>.json`, "Save + Bake" bakes the location. `catalog.ts` lists every
  model in source/ (645) with a default scale per pack and kind, and which ones carry a flame.
- Levels are JSON (`levels/<id>.json`), loaded by `level.ts` with import.meta.glob.
- Border (`Level.border`): the picture is the map's screen rectangle grown by `depth` cell widths; the ground covers
  it all and `parts` are scattered there; in front of the map (east/south) the first `lowDepth` cells use `low`
  parts only, because tall trees there would hide the map's front rows. Scenery in front of the map is baked into
  `front.webp`, drawn above the units.
- Camera (`location.tsx` CONFIG.view): about 11 cells across, follows the hero, wheel zoom 6..20 cells, never shows
  past the picture.
  `sheets.ts` loads unit sheets for both scenes; `bake-common.ts` holds the loader, light and camera shared by bakers.
- Location data: `level.ts`, `LEVELS` by id: floor chars + pieces (+ tint), optional hex-grass ground, back walls and
  decor, `scenery` (baked into the base: flat things and things behind the map), `props` (parts with offset, rotation,
  scale; `size` footprint in cells, all blocked; optional flame), hero start. `walkable(level, x, z)` plus the projection used by baker and scene (`dotRight` / `dotUp`, `toPicture`, `cellCenter`,
  `cellAtPoint`). One cell = one KayKit small floor tile = 2x2 world units = a 113x57 px diamond at ppu 40.
- `bake-level.ts` ("Bake level <id>" on ?bake, output in assets/levels/<id>/): base.webp = floor, walls, decorations with soft key-light shadows
  (props cast shadows there through colorWrite/depthWrite-off copies of their materials), then each prop alone,
  cropped (prop-<i>.webp + its anchor), and level.json last (picture size, world origin in px, props, flame points).
- Day/night (`location.tsx`): CONFIG.time and CONFIG.sky keyframes by hour (colour multiply, saturation, glow);
  a ColorMatrixFilter on the picture + props + units; flames are additive radial sprites above the filter.
  `phaseOf(hour)` gives night / dawn / day / dusk for game logic later.

## Goal
An isometric RPG (user's goal, 2026-10-18): heroes, monsters, neutral NPCs, spells, rooms. The character showcase
is the first step; next pieces are background, turn-based combat, NPCs, dialogue, inventory, quests.
- Three factions: vampires, mages, hunters. The hero starts neutral, an ordinary adventurer; from level 3 they can join
  one of the three (not at the start) or stay neutral.
- Joining a faction gives everything at once: new skills, its look, allies, access to its locations and quests,
  and hostility from rival factions.
- Relations: hunters are hostile or neutral to a vampire, never friendly. Mages can be hostile, neutral or friendly,
  driven by reputation (so reputation per faction is a number, not a fixed state).
- Hero: one character, two genders (later). Starts with a dagger only.
- Solo hero for now; a party may come later, so keep the code ready for several player units.
- Before level 3: ordinary quests in a single available location, e.g. "save someone from bandits".
- Combat: turn-based on grid cells (like 011 and the dice reference).
- Day/night cycle is required (like The Witcher): a game clock runs continuously (dawn, day, dusk, night); light and
  colour of the whole scene follow it, torches glow at night; the hour is exposed to game logic (vampires stronger
  at night, NPC schedules, night-only quests and monsters later). Locations are baked once in neutral daylight;
  the time of day is applied at runtime (colour filter + additive torch glows), not baked four times.
- Indoors the time of day shows through windows: daylight falls in during the day, windows go dark at night and the
  candles and torches inside take over.
- The clock cannot be fast-forwarded during combat (the T key is a dev aid for now; it must be blocked once combat
  exists). Open: does game time advance per combat turn or stand still during a fight?
- Not decided yet: what staying neutral gives.

## Plan
1. Done (first version). Location: one room/area built from KayKit Dungeon tiles, baked with the same camera and light as the units;
   the map is data (cells, walls, props), walkable cells come from it.
2. Done: hero (neutral adventurer with a dagger), walks by clicking cells with a path preview. Day/night clock done.
3. Turn-based combat: initiative, move + action per turn, HP, attack, hurt, death; bandits with simple AI.
4. First quest "save from bandits": NPC asks, bandits in the room, a captive to free, reward and XP.
5. Then: levels and XP, inventory, dialogue, faction reputation, level 3 choice.

Next session (2026-10-18 stop point): turn-based combat with bandits in the village (step 3), then the
"save from bandits" quest. Commits are on main, not pushed to GitHub yet (the user decides).

## Preferences
- Smooth rendering like the Kenney sample, rather than the angular pixel look of 011 (chose smooth over a pixelated bake).
- Finds KayKit too cartoony (big heads, toy look).
- Wants to build NPCs from parts (constructor) and to be able to edit the background.

## Open questions
- Village grass is the KayKit hex tile's yellow-green; tint it greener?
- Big props sort by their front cell: a unit right behind a building's side can be drawn under its edge.
- Sheets: 42 MB for thirteen units (was 29 MB for eight) after WebP and 128 px frames. The long clips weigh most (necromancer 7.9 MB: idle 51
  and summon 52 frames). Next options: per-animation fps or frame caps. Skeleton and necromancer idles (51 frames each) are
  most of the 7.2 MB needed before the scene shows.
- How to make it less cartoony: proportions (head scale), darker light and colours, or other models.
- Background: build from KayKit Dungeon Remastered tiles baked with the same camera and light.
- Cell size: 128x64 for now, characters ~75 px tall.
- Recolouring: `tint` multiplies, so a red cape tinted green turns brown. A real palette swap (replace texture colours)
  would allow any colour.

## Changelog
- 2026-10-18: scene created: KayKit sources, sprite baker (Three.js → sheets), knight vs skeleton duels, smooth and pixel
- 2026-10-18: smooth only: the pixel variant removed from the baker and the scene
- 2026-10-18: unit constructor (hide, borrow, tint, items, bone scale) and eight units; WebP sheets, 128 px frames; showcase scene
- 2026-10-18: idle sheets load first, the rest in the background (locally: scene at 0.7 s, all sheets by 3.2 s)
- 2026-10-18: per-animation fps; skeleton and necromancer idles at 6 fps (idle sheets 7.2 → 5.1 MB, all 29 → 27 MB)
- 2026-10-18: the five KayKit adventurers as they come (mage, barbarian, ranger, rogue, hooded rogue); `?bake=<units>`; showcase in two rows
- 2026-10-18: first location (ruined courtyard from KayKit Dungeon, baked with shadows, props depth-sorted), hero walking by click, day/night clock with glowing flames; showcase moved to ?units
- 2026-10-18: locations as data (LEVELS), per-prop scale and footprint, scenery, floor tint; village at the forest edge from KayKit Medieval Hexagon + Forest + Kenney Fantasy Town (all CC0)
- 2026-10-18: world around the map (border forest, front layer), follow camera with wheel zoom; levels moved to JSON; visual location editor (?edit) with the full KayKit Dungeon, Medieval Hexagon, Forest and Kenney Fantasy Town catalogs
