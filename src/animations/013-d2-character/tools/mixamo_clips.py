# Retargets the Mixamo "Creature Pack" clips (licensed/mixamo/*.fbx) onto the Quaternius rig and writes them, with
# the bare rig and no meshes, to licensed/mixamo-clips.glb. The clips are local bone rotations, and every character
# here shares the rig's bone names and rest orientations, so the viewer plays them on any of them.
# The output stays in the gitignored licensed/ folder: Mixamo animations may be used in the game but not
# redistributed as files (the public repo would do that).
# Usage (from the animation folder):
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/mixamo_clips.py
import os, sys
import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import retarget_mixamo as rt

SRC, OUT = 'licensed/mixamo', 'licensed/mixamo-clips.glb'
CLIPS = {  # name in the GLB: (source file, in place, elbow straightening 0..1, [arms out, degrees]: see retarget_mixamo.retarget)
    'Mutant_Swiping': ('mutant swiping.fbx', True, 0),
    'Mutant_Punch': ('mutant punch.fbx', True, 0),
    'Mutant_JumpAttack': ('mutant jump attack.fbx', True, 0),
    'Mutant_Roar': ('mutant roaring.fbx', True, 0.2),
    'Mutant_Flex': ('mutant flexing muscles.fbx', True, 0),
    'Mutant_Idle': ('mutant breathing idle.fbx', True, 0.6, 14),
    'Mutant_Walk': ('mutant walking.fbx', True, 0.5, 12),
    'Mutant_Run': ('mutant run.fbx', True, 0.2),
    'Mutant_Dying': ('mutant dying.fbx', True, 0),
    'Zombie_Scream': ('zombie scream.fbx', True, 0),
    'Human_Walk': ('walking.fbx', True, 0, 0, 'grip'),  # the normal (human) walk, picked by the user; fist grip
    'Human_Run': ('slow run.fbx', True, 0, 0, 'grip'),  # the fast walk (Mixamo "Slow Run"), picked by the user
    # Mixamo "Pro Magic Pack" + three single magic attacks (licensed/mixamo/magic): spells, mage idles and moves,
    # blocks, hit reactions, deaths; picked per state / attack in the viewer's Animation map
    'Mage_1hMagicAttack01': ('magic/Standing 1H Magic Attack 01.fbx', True, 0),
    'Mage_1hMagicAttack02': ('magic/Standing 1H Magic Attack 02.fbx', True, 0),
    'Mage_1hMagicAttack03': ('magic/Standing 1H Magic Attack 03.fbx', True, 0),
    'Mage_1hCastSpell01': ('magic/standing 1H cast spell 01.fbx', True, 0),
    'Mage_2hCastSpell01': ('magic/Standing 2H Cast Spell 01.fbx', True, 0),
    'Mage_2hMagicAreaAttack01': ('magic/Standing 2H Magic Area Attack 01.fbx', True, 0),
    'Mage_2hMagicAreaAttack02': ('magic/Standing 2H Magic Area Attack 02.fbx', True, 0),
    'Mage_2hMagicAttack01': ('magic/Standing 2H Magic Attack 01.fbx', True, 0),
    'Mage_2hMagicAttack02': ('magic/Standing 2H Magic Attack 02.fbx', True, 0),
    'Mage_2hMagicAttack03': ('magic/Standing 2H Magic Attack 03.fbx', True, 0),
    'Mage_2hMagicAttack04': ('magic/Standing 2H Magic Attack 04.fbx', True, 0),
    'Mage_2hMagicAttack05': ('magic/Standing 2H Magic Attack 05.fbx', True, 0),
    'Mage_Idle': ('magic/standing idle.fbx', True, 0),
    'Mage_Idle02': ('magic/standing idle 02.fbx', True, 0),
    'Mage_Idle03': ('magic/Standing Idle 03.fbx', True, 0),
    'Mage_Idle04': ('magic/Standing Idle 04.fbx', True, 0),
    'Mage_WalkForward': ('magic/Standing Walk Forward.fbx', True, 0),
    'Mage_RunForward': ('magic/Standing Run Forward.fbx', True, 0),
    'Mage_SprintForward': ('magic/Standing Sprint Forward.fbx', True, 0),
    'Mage_BlockStart': ('magic/Standing Block Start.fbx', True, 0),
    'Mage_BlockIdle': ('magic/Standing Block Idle.fbx', True, 0),
    'Mage_BlockReactLarge': ('magic/Standing Block React Large.fbx', True, 0),
    'Mage_BlockEnd': ('magic/Standing Block End.fbx', True, 0),
    'Mage_ReactSmallFromFront': ('magic/Standing React Small From Front.fbx', True, 0),
    'Mage_ReactLargeFromFront': ('magic/Standing React Large From Front.fbx', True, 0),
    'Mage_ReactDeathBackward': ('magic/Standing React Death Backward.fbx', True, 0),
    'Mage_ReactDeathForward': ('magic/Standing React Death Forward.fbx', True, 0),
    'Mage_Jump': ('magic/Standing Jump.fbx', True, 0),
    'Mage_CrouchIdle': ('magic/Crouch Idle.fbx', True, 0),
    'Mage_CrouchWalkForward': ('magic/Crouch Walk Forward.fbx', True, 0),
}

# the mutant stands with its feet 58 cm apart (its wide body); these clips start and end in that stance
LEG_IN = {n: 7 for n in ('Mutant_Idle', 'Mutant_Swiping', 'Mutant_Punch', 'Mutant_Roar', 'Mutant_Flex',
                         'Zombie_Scream', 'Mutant_JumpAttack')}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath='assets/kit-ranger.glb')
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in [o for o in bpy.data.objects if o.type != 'ARMATURE']:
    bpy.data.objects.remove(o, do_unlink=True)
ad = rig.animation_data
# the library's fist grip (Sword_Idle frame 0): the Mixamo walk swings open hands, and a sword or shield rigid on
# the hand bone then floated outside the fingers
grip_act = bpy.data.actions['Sword_Idle']
ad.action = grip_act
if grip_act.slots:
    ad.action_slot = grip_act.slots[0]
bpy.context.scene.frame_set(0)
FINGERS = [b.name for b in rig.pose.bones if b.name.split('_')[0] in ('thumb', 'index', 'middle', 'ring', 'pinky')]
GRIP = {n: rig.pose.bones[n].rotation_quaternion.copy() for n in FINGERS}
ad.action = None
for t in list(ad.nla_tracks):
    ad.nla_tracks.remove(t)
ad.action = None
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
for name, (f, in_place, elbow, *more) in CLIPS.items():
    out = more[0] if more else 0
    fixed = GRIP if len(more) > 1 and more[1] == 'grip' else None
    act = rt.retarget(rig, os.path.join(SRC, f), name, in_place=in_place, elbow_open=elbow, arm_out=out, fixed=fixed,
                      leg_in=LEG_IN.get(name, 0))
    track = ad.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, act)
    if act.slots:
        strip.action_slot = act.slots[0]
    print('CLIP', name, [round(x) for x in act.frame_range])
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animation_mode='NLA_TRACKS', export_yup=True)
print('MIXAMO ->', OUT, os.path.getsize(OUT) // 1024, 'KB')
