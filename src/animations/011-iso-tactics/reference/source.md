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
- Dark spell effects: "Dark Spell Effect" by pimen, free VFX 01-02 — https://pimen.itch.io/dark-spell-effect
  License: use and modify in personal and commercial projects, no resale or redistribution of the sprites.
  Kept in `licensed/fx/` (gitignored). To restore: download "Dark VFX 01 - 02" from the page, put the two sheets in
  `licensed/fx/` as `dark-vfx-1-sheet.png` / `dark-vfx-2-sheet.png` and run `import-dark-vfx.lua` there.
- Knight spell animation: `CastSpell.png` from the same free HD Knight pack, also in `licensed/knight/`.
- Blood effects: "Pixel Art VFX - Vampire" (free version) by Frostwindz — https://frostwindz.itch.io/
  License: use and modify in commercial and non-commercial projects; no redistribution or resale, no use for AI training,
  assets must stay part of a larger project. Kept in `licensed/fx/vampire/` (gitignored); to restore, put the VFX1 and VFX3
  `Frames/*.png` into `vampire/vfx1` and `vampire/vfx3` and run `import-vampire.lua`.
