# 013 — D2 character workshop

Source: reference/source.md (no image yet; target is the Diablo II look); animations: Quaternius Universal Animation
Library 1 + 2, Standard (free) versions, CC0, in `source/ual1`, `source/ual2`
(https://quaternius.itch.io/universal-animation-library, https://quaternius.itch.io/universal-animation-library-2)
Engine: three (viewer) + Blender 5.2 scripts (models)
Status: draft

## Effect
A workshop for characters, items and spells in the Diablo II style: low-poly models made by Blender scripts, shown
through the isometric camera of 012 (30 degrees down, 45 around), 8 directions, in a dark scene lit by a warm light
around the hero. Finished models go to scene 012 and are baked into sprites by its baker.

Design (user, 2026-10-19): vampires are a faction and a playable race; they look like anyone, only paler. Partial
transformation: hands become claws and the body hunches; attacks change with it. A hand that turns into a claw drops
its item into the inventory; after turning back it has to be equipped again. Full forms (not started): wolf, bat,
mist, a man-sized half-human half-bat monster. Both the hero and NPCs transform.

## Design brief (collected from the chat, 2026-10-19)
- Game: the isometric RPG of 012, Diablo II-like pre-rendered characters. Visual style not settled: D2 (dark, torch
  light, ~80 px) or the pixel-art reference (reference/style-pixel-art.png: outlines, few tones, ~200 px). The viewer
  offers 80/128/160/200 px; style values (cloth tint, skin tints, light) are parameters so a later choice is one edit.
- Vampires: a faction and a playable race; they look like anyone, only paler. Hero and NPCs both transform.
- Partial transformation: hands become claws and the body hunches; attacks change with it (claw rakes); an item in a
  hand that turns into a claw goes to the inventory and must be equipped again after turning back.
- Full forms (not started): wolf, bat, mist, a man-sized half-human half-bat monster; transitions between forms.
- Claw stance: tuned by the user with sliders (light crouch, knees over the feet, low hands, hooked claws, upright
  back); attacks: own claw rakes (right, left, double), sword, shield, punches from the Quaternius library.
- Characters: Quaternius kit outfits + heads (ranger as the hero, peasants as villagers), restyled to our look;
  the Nosferatu true form is still our primitive model.
- Open: style and sprite size; whether the Nosferatu face appears with the transformation; models for the full
  forms (animal packs or own); weapon models (ours are primitives).

## Implementation
- Kit characters (`tools/kit_character.py` → `assets/kit-ranger.glb`, `kit-peasant.glb`, `kit-peasant-female.glb`):
  the outfit glTF's armature is the rig (same 65 bones as the animation library; proportions differ by up to 8 cm,
  clips are pose-space so they play unchanged); the library clips are imported onto it; the base character's head is
  cut from its full body (vertices weighted ≥ 0.5 to Head/neck_01) and moved onto the rig with eyes and hair; skin
  materials are renamed `skin` and their textures lightened/desaturated (Standard has only dark regular skin) so the
  viewer can tint them per race; claws are curved talons (`talon`, `CLAW`: 10 cm, 7.5 cm on the thumb, flattened
  sideways, bending towards the palm, one pale bone colour with a faint emission (`CLAW_GLOW`) so finger and claw
  read as one long finger, like the user's reference) grown from the last finger joints; items, Hunch, claw stance and claw
  attacks come from tools/mercenary_ual.py. Textures exported as JPEG (85). 20-33k triangles per character.
  `source/kit/`: the needed glTFs from the Standard (free, CC0) packs with textures downscaled to 1024 (27 MB).
  The Standard packs only contain 2 base bodies (superhero proportions), 2 outfits (Ranger, Peasant, male/female)
  and 6 hairstyles; the other bodies and 10 outfits are in the paid versions (~$20 each).
- No separate claw stance any more (user, 2026-10-19): with claws the character keeps the normal clips plus the hunch
  layer (posture `layer` is the default; `predator` stance and its sliders stay available). Clawed hands are held
  open like paws over any clip (`clawHandPose` in pose.ts: fingers 12/22/18°, thumb 10/15/10° from the rest pose,
  the same hinges as curl_hand), because the library clips clench fists and hid the claws; an attack fades this out
  and drives the fingers itself (the rakes open the hand). Long fingers like the user's reference (a demon with
  long clawed hands): the finger joints move 1.8× further apart along the finger and the knuckles 1.25× from the
  wrist (`clawHandStretch`, positions only: the skin between joints stretches, nothing scales), the first joints fan
  out (`CLAW_HAND.splay`). Stretch stays on while striking.
- Blender 5 slotted actions: an action imported with another armature is not bound by assigning it (`make_hunch`
  sets `action_slot`); without that the kit rig stayed in its T-pose and the hunch arms raised the arms sideways.
- Viewer: each touched bone's clip value is restored once per frame (`frameId`); a finger in two layers (curl and
  stretch) otherwise flipped between them every frame (the user saw the hands flicker).
- Hunch layer turns the upper arms forward by about the spine's lean (hanging arms swing BACK when the back bends, like a bow; measured) and 20° out to the sides, elbows bent 25°, so the hands hang clear of
  wide hips and clothes (user: hands sank into the body).
- Kit Nosferatu (`kit_character.py -- assets/kit-nosferatu.glb nosferatu`, `build_nosferatu`): the superhero base
  body on its own armature (same 65 bones), made gaunt by pulling each vertex towards its bones' segments (`THIN`:
  arms 0.62-0.66, waist 0.7, chest 0.8), its legs deleted (the peasant trousers and shoes are cut for regular
  proportions and the superhero legs poked through), no hair or eyebrows, pointed ears swept back and fangs on the
  head bone, peasant trousers and shoes. Our primitive mercenary / nosferatu (tools/mercenary.py, mercenary_ual.py)
  are no longer shown: next to the kit they looked unfinished; mercenary_ual.py stays as the library of clips
  (hunch, claw stance, claw attacks, items) the kit builds use.
- Viewer restyle: clothing materials (`MI_*`) multiplied by `CONFIG.clothTint`, hair by the character's `hair`
  colour (the kit hair texture is grey), skin by `SKIN.texture[race]`.
- Two builds side by side, switch "Animations: ours / ual" in the viewer:
  - `tools/mercenary_ual.py` → `assets/mercenary-ual.glb` (main): imports both packs' rig (65 bones with fingers,
    T-pose, 1.83 m, faces -Y) and 21 of their clips (`CLIPS`), builds the parts from that rig's bone positions, adds a
    `cloak` bone and a `Hunch` pose. Run from this folder (~10 s):
    `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/mercenary_ual.py -- assets/mercenary-ual.glb`
  - `tools/mercenary.py` → `assets/mercenary.glb`: the first version, own 12-bone rig and formula clips (Idle, Walk,
    SwordSlash, ShieldBash, Punch(L), ClawSwipe(L), DoubleClaw, Hunch). Its helpers (parts, materials, grime bake) are
    imported by the UAL build.
- Parts: separate skinned meshes, rigid weights (100% on one bone): `body`, `head`, `cloak`, `armR__human` /
  `armR__claw`, `armL__...`, `item_sword`, `item_shield`. UAL claws: pale fingers built on the finger bones
  (lengthened 1.35×) with dark nails past the tips, so they curl with the clips. Sword on `hand_r` with the blade along
  rest -Y (index side): checked by tracing the tip through Sword_Attack (diagonal cut in front) and Sword_Block
  (blade across the chest). Shield on the back of `lowerarm_l`.
- Skin is baked white (grime/AO only) and tinted per race in the viewer (`SKIN` in parts.ts).
- Grime bake: one atlas for all parts, two passes so overlapping variants don't occlude each other.
- `parts.ts`: slots, races, items and the hand each one needs, `attacksOf(form, equipped)` (two claws → DoubleClaw;
  each hand gives its claw, its item's attack or a punch), and `RIGS`: per rig the clip for each role (Idle,
  SwordIdle, ShieldIdle, ClawIdle, Walk, ClawWalk), the clip for each attack, walk speeds (UAL measured from the
  packs' root-motion files: Walk 1.22 m/s, Zombie walk 1.31 m/s) and the bones the Hunch layer may touch.
- Hunch: a pose clip turned into an additive layer (`makeClipAdditive` against Idle frame 0); its weight follows the
  number of claws (0, 0.5, 1). For UAL only spine/neck/head/leg quaternion tracks are kept (the exporter writes rest
  values for every other bone, which as a delta pulled the arms into a T-pose). Alternative "Hunch: zombie" uses the
  pack's Zombie Idle/Walk clips instead.
- Nosferatu (`assets/nosferatu.glb`, `-- assets/nosferatu.glb nosferatu`, `build_nosferatu`): the vampire's true form
  from reference/nosferatu-*.png (screenshots of someone else's model, used as a visual reference only): gaunt bare
  torso (narrow waist, collarbones), thin bare arms with elbows, long thin neck, bald elongated skull, brow, sunken
  eye pits, nose, jaw with teeth, ears swept back; baggy trousers bunched over knee-high boots. Same rig, clips,
  slots and items; claws longer (fingers 1.7×, nails 9 cm). Viewer: "Character: mercenary / nosferatu".
- Hands (UAL): bracer, wrist ball, a rounded palm and separate fingers, three segments per finger on its own bones
  with a ball at each joint (no gaps when they bend); claws use the same hand with longer slimmer fingers and nails.
  ~1000 triangles per hand.
- Claw stance (own clip `Claw_Stance`, `STANCE` in tools/mercenary_ual.py): from the user's Nosferatu references and
  corrections — crouch, knees above the feet, back bent forward, shoulders up, elbows close to the body, hands raised
  in front of the chest with the curled claws pointing up at the enemy, head forward with the chin up.
  Tuned to the side view: back ~35° forward. Built on Idle frame 0: pelvis lowered 0.13 m, spine/neck/head turned about the world sideways axis, clavicles
  raised, fingers curled; IK (with pole targets; the pole angle is picked automatically) places ankles and wrists,
  damped tracks aim feet and hands; then baked (2 s loop, pelvis breathes 1.2 cm). Viewer posture `predator`
  (default): claw stance when standing, walk + hunch layer when walking.
- Claw pose sliders (`pose.ts`, panel on the right when both hands are claws, posture `predator`, standing): 12
  sliders (crouch, knees apart, feet apart, back lean, neck, chin, shoulders, arms raise, elbows out, elbow bend,
  claws forward, claws curl) turn bones over the baked Claw_Stance at runtime; "Save pose" writes `claw-pose.json`
  through the dev-only `/__save` endpoint. Model-space turns use the axis in the current pose (premultiplied in the
  parent frame, parents first); hinge turns (elbow, finger joints) use the rest-frame axis. After the turns the
  pelvis is moved so the lower ankle stays at the clip's height (feet on the floor). Three's mixer only rewrites a bone
  when the clip value changes, so the clip value of every touched bone is kept and restored each frame before the
  turns (otherwise static bones accumulated the turns). Each slider was checked by measuring joint positions at its
  min/max (direction right, no side effects except where intended) and that zero returns exactly to the clip pose.
  The layer is runtime only: the GLB clip is unchanged, so the 012 baker has to apply `pose.ts` too.
- Posing by hand: `tools/claw-stance.blend` (made by `mercenary_ual.py -- tools/claw-stance.blend nosferatu poser`)
  holds the Nosferatu in the claw stance with live IK: empties `foot/knee/toes/wrist/elbow/fingers.L/.R` drive legs,
  arms, feet and hands; spine, neck, head, clavicles, pelvis and fingers are rotated directly. After saving it,
  `Blender -b tools/claw-stance.blend --python tools/read_stance.py` writes `tools/claw-stance.json` (all bone
  rotations/locations, target positions, pole angles); when that file exists the build uses it instead of `STANCE`
  (delete it to go back to the computed pose). Round trip checked: same render before and after (mean pixel diff 1e-5).
- Own claw attacks (`SWIPE`, `CLAW_ATTACKS`, `make_claw_attack` in tools/mercenary_ual.py): Claw_Swipe_R / _L
  (26 frames, 0.87 s: wind-up 0.2 s out to the side and back, the rake in 0.1 s, a short hold, recovery) and
  Claw_Double (right, then left 9 frames later). The attacking hand opens (`CLAW_OPEN`, fingers nearly straight)
  for the wind-up and the rake and closes again (`curl_hand`, shared with the stance). The foot opposite the striking
  hand steps 0.3 m forward into the rake and back (`STEP`, foot and toes targets keyed, lifted mid-step); the rake ends
  at the centre line, so the arms never cross (also in the double claw). Built from the claw stance with
  live IK: the attacking wrist and fingertip targets are keyed (wind-up beside the head at f5, rake across the front
  at f8, follow-through low on the other side at f11, back to the stance at f22), the chest twists into it (spine
  shares 0.3/0.35/0.35, the neck turns back 40% to keep facing the target), leans and lunges (pelvis forward/down,
  feet stay planted by IK); the other hand pulls back. Baked with visual keying. They replace Zombie_Scratch.
- Attacks: blend in over 0.2 s; the way back to the stance starts 0.45 s before the attack clip ends (at most 40% of
  a short clip) while the arm still moves, so it reads as the recovery. Before, the clip froze on its last frame and
  snapped back in 0.16 s (the user saw "no ending" and a jerk). Measured on the double claw (Zombie_Scratch): hand
  speed during the return stays 1-1.7 m/s with no spike; the blend-in peak dropped from 6 to 3.3 m/s.
- Cloak (UAL): its bone keeps its rest orientation in model space (hangs down whatever the spine does) plus a trail
  angle: 16° ± 4° flap when walking, 2° ± 1.5° sway idle (`CONFIG.cloak`).
- UAL attack mapping: SwordSlash → Sword_Attack (Sword_Regular_A turns the pelvis 130°, it is a combo opener),
  SwordCombo → Sword_Regular_Combo, ShieldBash → Shield_Dash, Punch → Punch_Jab / Punch_Cross, claws → Zombie_Scratch.
- Viewer: "Pixels" mode keeps the hero 80 / 128 / 160 / 200 render px tall ("Hero px", `CONFIG.heroPixels`;
  80 is the Diablo II size); torch split into a shadow-casting and a
  fill light; the ground slides at the current walk clip's speed and stops during attacks.
- Metallic kept <= 0.45 because three.js renders metal black without an environment map.

## Preferences
- The first own idle stood too straight; the user asked for a library of hand-made animations as the base, and own
  clips "by analogy" where the library has nothing.
- The pack's zombie walk is wrong for the vampire's claw form ("looks like he soiled himself"): it must look
  predatory. Waiting for the user's reference images (2026-10-19).

## Open questions
- A predatory walk/stalk to go with the claw stance (now the normal walk + hunch layer).
- Attacks play over the whole body (legs stop). Next: bone masks so the upper body attacks while the legs keep walking.
- Full forms (wolf, bat, mist, bat monster) and the transition effect.
- Does all of 012 move to the D2 look, or does the D2 character fit 012's current light?

- Later (user, 2026-10-19): Quaternius "Bestiary - Dungeon Monsters Kit" (Standard, in ~/Downloads). It has Imp and
  Puglin on the same humanoid rig as the animation library (55 bones, 4 fingers), no animations, textures separate.
  License is the Quaternius Asset License, not CC0: no redistribution as assets, so its files go to a gitignored
  `licensed/` folder. Imp is a candidate base for the half-human half-bat monster form.

## Changelog
- 2026-10-19: first version: mercenary (mail, leather jacket, cloak, sword, round shield), Idle and Walk, D2-style viewer
- 2026-10-19: smaller head and broader shoulders, swaying cloak on its own bone, baked grime/AO texture, softer shadow, shorter sword and smaller shield, walk with weight shift and twist, hero fixed at 80 render px
- 2026-10-19: transformations: model split into slots (head, arms) + items, wolf head and claw arms, attacks change with the form (sword, shield, claws, double claw, bite), viewer slot toggles and attack buttons (keys 1..n)
- 2026-10-19: vampire instead of werewolf: pale claws, hunch layer, punches, race skin tint, inventory (claws drop items); wolf head and bite removed
- 2026-10-19: Quaternius Universal Animation Library 1+2 (free, CC0): the mercenary rebuilt on its rig with 21 of its clips, rig switch in the viewer, zombie clips as the alternative hunch, cloak hangs by gravity
- 2026-10-19: hero size choice in pixel mode: 80 / 128 / 160 / 200 render px
- 2026-10-19: hands with a rounded palm and jointed fingers on the finger bones; own claw stance from the user's Nosferatu reference (IK-built), now the default claw posture; shorter mail skirt
- 2026-10-19: Nosferatu true form on the same rig (character switch in the viewer); claw stance retuned to the user's model screenshots (back bent ~35°, hands in front of and outside the knees)
- 2026-10-19: claw stance narrower (user: knees and arms too wide): ankles at x 0.26, knee poles 0.38, wrists 0.44, elbows 0.75
- 2026-10-19: claw stance per user: knees closer (ankles x 0.22, knee poles 0.2), shallower crouch (0.13 m), elbows in, hands raised in front of the chest with the claws up
- 2026-10-19: claw stance can be posed by hand in Blender (tools/claw-stance.blend → tools/read_stance.py → tools/claw-stance.json)
- 2026-10-19: claw pose sliders in the viewer with save to claw-pose.json (the Blender posing file was too hard to use)
- 2026-10-19: claw stance rebuilt from the user's slider pose: symmetric (from rest, not the pack's twisted Idle), fairly upright, knees over the feet, low hands, hooked claws; toes joined to the foot by a joint ball (no gap)
- 2026-10-19: attacks blend in over 0.2 s and start returning 0.45 s before the clip ends (no freeze and snap)
- 2026-10-19: the user's saved sliders (claw-pose.json) were folded into the base stance, file reset to {} so 0 = that pose
- 2026-10-19: own claw attacks (right, left, double rake) built with keyed IK targets, replacing the pack's zombie scratch
- 2026-10-19: Quaternius kit characters (ranger, peasant, peasant female) built on our rig with all our clips and claw attacks, restyled in the viewer; design brief written
- 2026-10-19: thumbs in the claw stance fold towards the palm about their own hinge (the fingers' axis bent them backwards)
- 2026-10-19: claw rakes wider and open-handed (user: it hit like a fist): wind-up out to the side, rake across in front at chest height, bigger twist and lunge
- 2026-10-19: claw rakes step forward with the opposite foot and end at the centre line (user: hands crossed at the end)
- 2026-10-19: no separate claw stance by default (normal clips + hunch); curved talon claws with pale tips on the kit characters; clawed hands held open over any clip
- 2026-10-19: hunch keeps the arms out of the body; clawed hands get long splayed fingers; attack buttons sized to their text
- 2026-10-19: fixed arms sticking out (hunch measured from the T-pose) and flickering hands; claws one pale glowing colour
- 2026-10-19: hunch arms hang in front of the thighs (the earlier version swung them back); Nosferatu rebuilt from kit parts (gaunt base body, ears, fangs); primitive models dropped from the viewer
- 2026-10-19: faces: the kit's light skin texture for heads (the kit wires skin through a Mix with vertex colour; the
  image is found through it), a mild lift (×1.3, saturation 0.8) instead of the strong ×1.9 wash that flattened face
  detail, outfit arms colour-matched to the head; Nosferatu one flat pale tone (no hairline band on the bald head)
  and its own ears pulled into swept-back points (`point_ears`) instead of cones; viewer fill light from the camera
  side (faces under the overhead torch went black). Review sheet: reference/review/faces-neutral-light.png (before).
- 2026-10-19: vampire combat face (user's reference: Buffy-style vampire). Two shape keys on every head-weighted mesh
  (head, beard, eyebrows; the Nosferatu's full body), built in `kit_character.py` (`FACE`, `face_offsets`):
  GameFace = brow ridge 2 cm forward, lumps above it, folded nose bridge, upper fangs out over the lower lip
  (`face_fangs`, retracted into the gum in the basis); GameFace_Mouth = jaw dropped 26° about a pivot behind the
  mouth, upper lip lifted, inner mouth (tongue, gums) pushed further in, dark mouth plug (`face_mouth`) behind the
  lips. Landmarks per head: eye centre from the Eyes mesh, mouth line = deepest point of the front profile 5.8-8.6 cm
  below the eyes. Viewer (`CONFIG.face`): GameFace on with claws or a strike (auto, fades 2.5 s after), or forced
  on / off; the mouth only with "open mouth" (optional, user's request); eyes glow yellow with the face.
  Known: on the female head the open mouth shows the pink inner mouth a lot (reads as a tongue in close-ups).
  Review: reference/review/game-face.png.
- 2026-10-19: fangs smaller (1.1 cm, 2.6 mm root, user: like a walrus) and set as canines just behind the upper lip, straight down; they ride on the lifted lip when the mouth opens
- 2026-10-19: open mouth replaced by a snarl (user: the mouth stretched like a bug): the kit heads have no proper inner mouth, a dropped jaw pulled the inner lips out; now the upper lip lifts 6 mm over the fangs and the lower lip drops 4 mm, both fading before the mouth corners (`face_offsets`, mouth_open branch)
- 2026-10-19: brighter eyes, a colour per character (user: different colours on different characters): the eye
  material is tinted to the glow colour and glows (`CONFIG.face.eyeGlow`), plus an additive glow sprite in front of
  each eye on the head bone (`CONFIG.eyeHalo`), since the eyes themselves are a pixel or two at game size. Colours in
  `CONFIG.eyeColors` (amber, blood, venom, frost, violet); each character's default is `eyes` in parts.ts
  (ranger amber, peasant blood, peasant_female violet, nosferatu venom); the "Eyes" row overrides it. Sprites are
  attached in an effect, not in the memo (a strict-mode remount removed them for good otherwise).
- 2026-10-19: Nosferatu had two ears per side (user): the ear box also caught scalp above and behind the ear; now only the ear (|x| > 7.4 cm, y -1.5..2.5 cm, measured on the base head) is pulled into the point, the lobe stays
- 2026-10-19: hero size choice reduced to 160 / 200 px (user: 80 and 128 will not be used); 160 is the default
- 2026-10-19: claw rakes rebuilt (option B, user): from the normal idle (Idle_Loop frame 0, IK targets start at the
  idle wrists/feet, pole angles fitted to the idle elbows/knees), every channel a Catmull-Rom spline sampled each
  frame (`RAKE`, `spline`): anticipation draw-back (f4), wind-up high behind the shoulder (f10), accelerating arc,
  impact in front at chest height (f15, hand ~9 m/s), follow-through to the centre line (f18), hold, recovery (f34);
  the body overlaps (`RAKE_CHAIN`: pelvis leads, spine bones 0-2 frames later, neck counter-turns), the opposite foot
  steps 32 cm forward, the free hand guards up, fingers spread from the viewer's claw hand and back. Clip starts and
  ends within 2-3 cm of the idle pose. Double: second hand 11 frames later. Review: reference/review/claw-rake.png.
- 2026-10-19: claw strikes are boxing moves now (user): one clawed hand = hook (hand up, cocked out to the side with
  the elbow raised via a keyed IK pole, a flat arc at head height into the centre line, chest and hips turning);
  two clawed hands = "Hook + uppercut" (`Claw_Double`: right hook, left uppercut 11 frames later: knees dip, hand
  low, drives up past the chin as the body rises) or "Double hook" (`Claw_DoubleHook`, second hook 10 frames later).
  `MOVES` in mercenary_ual.py (32 frames each, keys per channel incl. `elbow`), `CLAW_ATTACKS` lists the combos.
  Timing: slow raise (4.4 m/s), fast strike (7.3 m/s peak hand speed). Review: reference/review/claw-hook.png.
- 2026-10-19: Mixamo creature clips (user's download, `licensed/`, see reference/source.md): `tools/retarget_mixamo.py`
  maps the 65 Mixamo bones to ours and copies each bone's rotation relative to its rest (both rigs rest in a T-pose)
  in world space, hips movement scaled by hip height, horizontal motion dropped (in place); `tools/mixamo_clips.py`
  writes them to `licensed/mixamo-clips.glb` (bare rig, ~1.1 MB). The viewer loads it if present (parts.ts
  `MIXAMO_URL`, import.meta.glob) and merges its clips: claws = posture `beast` (Mutant_Idle / Mutant_Walk, 1.17 m/s),
  one claw = Claw lunge (Mutant_Punch), two claws = Claw swipes (Mutant_Swiping), Pounce (Mutant_JumpAttack),
  Roar (Mutant_Roar), Scream (Zombie_Scream). Our hook clips remain the fallback without the file.
- 2026-10-19: Mixamo idle/walk on our narrow bodies brought the hands together in front (user: strange pose); per user only the elbows straighten: `elbow_open` blends the forearm towards the upper arm's rotation (idle 0.6, walk 0.5, run 0.2, roar 0.2, attacks 0)
- 2026-10-19: Mixamo idle / walk: the whole arm also swings out to its side (`arm_out`, idle 14°, walk 12°) so the clawed hands no longer meet in front of the hips
- 2026-10-19: the normal walk is the user's Mixamo "Walking" (licensed/mixamo/walking.fbx → `Human_Walk`, 1.47 m/s) when the Mixamo clips are present; Walk_Loop stays the fallback
- 2026-10-19: Mixamo walk swung open hands and the sword floated outside them: its finger tracks are replaced by the
  library's fist grip (Sword_Idle frame 0, `fixed` in retarget). New "Run" button: the user's Mixamo "Slow Run"
  (`Human_Run`, 2.75 m/s, fist grip); with claws in posture beast it is Mutant_Run (2.09 m/s); fallback Jog_Fwd_Loop.
- 2026-10-19: the mutant clips stood with the feet 58 cm apart (user: a leg sticks out sideways): `leg_in` swings each whole leg 7° towards the centre in the clips that use that stance (idle, attacks, roar, scream, flex)
- 2026-10-19: "Animation map" panel (button at the bottom): every state (standing, walking, running with / without
  weapons and claws, zombie / predator postures) and every attack with the clip it plays, each a dropdown of all
  loaded clips; Save writes `anim-map.json` (only the overrides; defaults stay in parts.ts RIGS). The mutant stance
  is used only with claws (posture `beast`); the human states never use it.
- 2026-10-19: Mixamo "Pro Magic Pack" + three single magic attacks (licensed/mixamo/magic, 30 clips as `Mage_*`:
  1H/2H attacks, area attacks, casts, idles, walk/run/sprint, block, hit reacts, deaths, jump, crouch). With empty
  human hands the attacks add Spell (Mage_1hMagicAttack01), Spell (two hands) and Area spell. The Animation map got a
  preview: a dropdown of every loaded clip and a ▶ on each row play the clip once over the current state.
- 2026-10-19: "Loop" (on by default) makes attacks and previews repeat until "■ Stop", which blends back to the current state; Loop off = play once as before
