-- Imports props from Kenney's Isometric Miniature Dungeon (CC0, kenney.nl) into scene 011.
-- The pack's 256x512 renders are resized to 192x384 and drawn at scale 0.5: its figures are smaller than ours, so
-- props are 1.5x the pack's own size (its 256px floor tile would be 96px, our cell is 64).
-- Usage: aseprite -b --script-param pack=<unzipped pack> --script-param out=<assets/kenney> --script import-kenney.lua
local pack, out = app.params.pack, app.params.out
local names = { 'barrelsStacked_E', 'woodenCrates_W', 'chestClosed_W', 'barrel_S', 'tableShortChairs_S' }
for _, n in ipairs(names) do
  local spr = Sprite{ fromFile = pack .. '/Isometric/' .. n .. '.png' }
  if spr.colorMode ~= ColorMode.RGB then app.command.ChangePixelFormat{ format = 'rgb' } end
  app.command.SpriteSize{ width = 192, height = 384, method = 'bilinear' }
  spr:saveCopyAs(out .. '/' .. n .. '.png')
  spr:close()
end
