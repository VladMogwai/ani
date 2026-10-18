# 010 — Pixel platformer

Source: reference/source.md (Sprite Fusion gallery as the mood, Kenney Pixel Platformer assets)
Engine: pixi
Status: draft

## Effect
Side-view pixel-art platformer. The two example levels from the Kenney pack are placed side by side.
A green astronaut runs and jumps; the camera follows horizontally, distant hills and clouds scroll slower (parallax).
Coins and flags flip between two frames, enemies flip their two frames in place, touching a coin collects it.
Without input for 5 s the character runs right by itself, hopping over walls and gaps, and starts over at the end.

Controls: ← → / A D to run, ↑ / W / Space to jump. Touch: left third runs left, right third runs right, middle jumps.

## Implementation
- PixiJS v8 used imperatively inside one effect (Application, Sprites, TilingSprite), not through @pixi/react:
  a tile game is easier to drive from one ticker. Everything is destroyed in the effect cleanup.
- Levels are the pack's Tiled `.tmx` files, parsed at runtime (CSV layers, flip bits in the gid).
  Collision comes from the `Tiles` layer: `SOLID` ids block from all sides, `ONE_WAY` ids only from above.
- Integer scale that fits the level height, `nearest` sampling and rounded camera position keep pixels crisp.
- CONFIG: physics (gravity, run, jump), animation timings, autoplay delay, parallax factors, sky color.

## Preferences

## Open questions
- Should enemies walk and hurt the player, or stay as scenery?
- One long hand-made level instead of the two example maps?

## Changelog
- 2026-10-18: first version with Kenney Pixel Platformer assets
