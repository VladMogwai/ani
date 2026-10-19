# Reference

No file from the user yet. Target look: Diablo II (2000) characters — pre-rendered low-poly 3D models,
about 60-100 px tall on screen, isometric view, 8/16 directions, dark scene lit by a warm light around the hero.

Character brief (agreed in chat, 2026-10-19): a mercenary of about 35 arriving in the village of scene 012 for work;
chainmail under a worn leather jacket, dark knee-length cloak, one-handed sword, round wooden shield, no helmet.

## From the user, 2026-10-19
- `style-pixel-art.png`: target style question — 8-direction pixel-art hooded mercenary (tattered dark cloak, plate
  pauldrons, cross belts, pouches; ~200 px tall; outlines, 3-4 tones per material, limited desaturated palette).
- Claw stance (image sent in chat, not saved as a file): a gaunt bald vampire with pointed ears (Nosferatu-like),
  very wide low crouch, knees bent outwards, torso slightly forward with the chest open, shoulders raised, arms spread
  wide and low with slightly bent elbows, hands at knee height, long fingers curled into claws pointing down,
  head pushed forward with the chin up, eyes on the target.
- `nosferatu-front.png`, `-three-quarter.png`, `-side.png`, `-back.png`: screenshots of a 3D-print model of the
  Bloodlines Nosferatu (Cults3D page, behind a bot check). Visual reference only — the model itself is a game rip of
  someone else's IP and is not used. What to take: gaunt bare torso, thin long arms, very long clawed fingers,
  bald elongated skull, pointed ears swept back, heavy brow, protruding jaw and teeth, baggy trousers in knee-high
  boots; posture: wide crouch, knees out, back bent forward ~35-40°, neck forward, chin up, arms hanging forward and
  out with the hands in front of / outside the knees.

## Licensed (gitignored, not in the repo): Mixamo
- `licensed/mixamo/*.fbx`: Mixamo "Creature Pack" (mutant idle, walking, run, swiping, punch, jump attack, roaring,
  flexing, dying, turns, X Bot), "Zombie Scream", "Walking" (saved as walking.fbx) and "Slow Run" (slow run.fbx), downloaded by the user from https://www.mixamo.com (free with an
  Adobe ID; royalty-free in games, the raw files may not be redistributed). To restore: download those animations as
  FBX Binary, Without Skin, 30 fps into `licensed/mixamo/` (file names as listed in tools/mixamo_clips.py `CLIPS`),
  then run `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/mixamo_clips.py`
  (writes `licensed/mixamo-clips.glb`). Without it the viewer falls back to the own claw attacks.
- `licensed/mixamo/magic/*.fbx`: Mixamo "Pro Magic Pack" and "Standing 1H Magic Attack 03", "Standing 2H Magic Attack 01", "Standing 2H Magic Attack 04" (user's downloads); clip list in tools/mixamo_clips.py (`Mage_*`).
