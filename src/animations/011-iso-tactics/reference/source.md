# Sources

- Look and mechanics: `tactics-reference.webp` — screenshot the user sent (isometric turn-based dungeon tactics with dice).
- Character: "HD 8-Directional Top-Down Character Pack 1", free HD Knight, by smallscaleint —
  https://smallscaleint.itch.io/hd-8-directional-top-down-character-pack-1
  Standard commercial license: use in games allowed, raw files must not be redistributed.
  The sheets live in `licensed/` which is gitignored (the repo is public). To restore: download
  "2D HD Character Knight.zip" from the page above and copy `Spritesheets/With shadows/*.png` into `licensed/knight/`.
- Mage: "8 Directional 2DHD Pixel Art Animated Character" (sample girl) by Hormelz, CC0 —
  https://hormelz.itch.io/8-directional-char
  The per-direction sheets (256px cells) were packed with Aseprite CLI into `assets/mage/*.png`
  (one row per direction E, SE, S, SW, W, NW, N, NE; frames scaled to 128px). CC0, so they are committed.
- Dungeon background: drawn by `art/scenes/dungeon/build-dungeon.lua` in Aseprite, exported to `assets/dungeon/`.
