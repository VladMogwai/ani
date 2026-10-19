# The mercenary on the Quaternius Universal Animation Library rig (CC0, source/ual1 + source/ual2): the same parts as
# tools/mercenary.py, but placed from that rig's bone positions and animated by its hand-made clips.
# Usage (from the animation folder):
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/mercenary_ual.py -- assets/mercenary-ual.glb
#   ... -- assets/nosferatu.glb nosferatu   (the vampire's true form: same rig, clips and slots, different body)
#   ... -- tools/claw-stance.blend nosferatu poser   (a file to pose the claw stance by hand; then tools/read_stance.py)
# The rig rests in a T-pose facing -Y (glTF +Z), 1.83 m. Parts are built in that rest pose, each weighted 100% to the
# bone it follows; claw fingers sit on the finger bones, so they curl with the clips. Extra bone: `cloak` (spine_03),
# driven procedurally by the viewer. Extra clip: `Hunch`, the vampire's posture, made additive by the viewer.
import json, math, os, sys
import bpy
from mathutils import Quaternion, Vector

sys.dont_write_bytecode = True  # no __pycache__ in the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mercenary as m  # parts helpers, materials, grime bake
from mercenary import ball, box, finish, group, tube

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else 'assets/mercenary-ual.glb'
CHARACTER = ARGS[1] if len(ARGS) > 1 else 'mercenary'
POSER = 'poser' in ARGS[2:]  # save a .blend for posing the claw stance by hand instead of exporting
FPS = 30  # the library's frame rate
PACKS = ['source/ual1/UAL1_Standard.glb', 'source/ual2/UAL2_Standard.glb']
CLIPS = [  # kept from the packs; the viewer maps them to roles
    'Idle_Loop', 'Sword_Idle', 'Idle_Shield_Loop', 'Walk_Loop', 'Jog_Fwd_Loop',
    'Sword_Attack', 'Sword_Regular_Combo', 'Sword_Block', 'Shield_Dash',
    'Punch_Jab', 'Punch_Cross', 'Melee_Hook',
    'Zombie_Idle_Loop', 'Zombie_Walk_Fwd_Loop', 'Zombie_Scratch',
    'Hit_Chest', 'Death01', 'Roll', 'Spell_Simple_Shoot', 'Consume',
]
CLAWS = {'finger': 1.35, 'nail': 0.07}  # finger segments lengthened by this factor, nail length beyond the tip (m)
# the Nosferatu (reference/nosferatu-*.png): gaunt, bare-chested, baggy trousers in tall boots, long clawed fingers
NOSFERATU = {'finger': 1.25, 'claw_finger': 1.7, 'nail': 0.09}
m.COLORS.update({
    'trousers': ('#8a877c', 0.9, 0.0),
    'teeth': ('#cdbf94', 0.5, 0.0),
    'eye_pits': ('#1a0d0d', 0.9, 0.0),
})
# vampire posture, degrees about the world sideways axis (+ leans a bone forward), added to the Idle pose of these bones
# (a number = degrees about X; or [(axis, degrees), ...] in world axes). Arms hang from the chest, so when the back
# bends forward they swing BACK with it (like a bow: measured 34° for this lean); the upper arms turn forward by about
# that much, so they hang down again, and out to the sides, so the hands stay clear of hips and clothes.
HUNCH = {'spine_01': 10, 'spine_02': 14, 'spine_03': 10, 'neck_01': -12, 'Head': -16,
         'thigh_l': -10, 'thigh_r': -10, 'calf_l': 16, 'calf_r': 16, 'foot_l': -6, 'foot_r': -6,
         'upperarm_l': [((0, 1, 0), -20), ((1, 0, 0), -30)], 'upperarm_r': [((0, 1, 0), 20), ((1, 0, 0), -30)],
         'lowerarm_l': -25, 'lowerarm_r': -25}  # elbows bent: the (long-fingered) hands hang in front of the thighs


def load_rig():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    rig = None
    for path in PACKS:
        bpy.ops.import_scene.gltf(filepath=path)
        arm = next(o for o in bpy.context.selected_objects if o.type == 'ARMATURE')
        if rig is None:
            rig = arm
            rig.name = 'Mercenary'
        for o in list(bpy.context.selected_objects):  # mannequin, helper sphere, the second pack's armature
            if o is not rig:
                bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a.name not in CLIPS:
            bpy.data.actions.remove(a)
    return rig


def bones(rig):
    w = rig.matrix_world
    return {b.name: (w @ b.head_local, w @ b.tail_local) for b in rig.data.bones}


def build_parts(B):
    H = lambda n: B[n][0]
    T = lambda n: B[n][1]
    group('body')
    for s, x in (('l', 1), ('r', -1)):
        tube(H(f'thigh_{s}'), T(f'thigh_{s}'), 0.092, 0.074, 'cloth', f'thigh_{s}')
        tube(H(f'calf_{s}') + Vector((0, 0, 0.02)), T(f'calf_{s}'), 0.078, 0.064, 'boots', f'calf_{s}')
        tube(H(f'calf_{s}') + Vector((0, 0, 0.03)), H(f'calf_{s}') - Vector((0, 0, 0.05)), 0.085, 0.085, 'leather_dark', f'calf_{s}')
        tube(H(f'foot_{s}') + Vector((0, 0.03, -0.02)), T(f'foot_{s}'), 0.068, 0.056, 'boots', f'foot_{s}', scale=(1, 1, 0.8))
        ball(H(f'ball_{s}'), 0.05, 'boots', f'ball_{s}', scale=(1.1, 1, 0.75))  # joint: no gap when the toes bend
        tube(H(f'ball_{s}') + Vector((0, 0.02, 0)), T(f'ball_{s}') + Vector((0, 0.02, 0)), 0.054, 0.04, 'boots', f'ball_{s}', scale=(1, 1, 0.75))
    p = H('pelvis')
    tube((0, p.y, 1.0), (0, p.y, 0.8), 0.19, 0.225, 'mail', 'pelvis', verts=10, scale=(1, 0.78, 1))  # short: wide stances
    tube((0, p.y, 1.03), (0, p.y, 0.97), 0.195, 0.195, 'leather_dark', 'pelvis', verts=10, scale=(1, 0.76, 1))
    box((0, p.y - 0.155, 1.0), (0.07, 0.03, 0.06), 'bronze', 'pelvis')
    box((0.15, p.y - 0.09, 0.94), (0.07, 0.05, 0.09), 'leather', 'pelvis')
    for bone, r0, r1 in (('spine_01', 0.185, 0.2), ('spine_02', 0.2, 0.235), ('spine_03', 0.235, 0.245)):
        tube(H(bone) - Vector((0, 0, 0.02)), T(bone) + Vector((0, 0, 0.01)), r0, r1, 'leather', bone, verts=10, scale=(1, 0.7, 1))
    tube(T('spine_03') - Vector((0, 0, 0.03)), H('neck_01') + Vector((0, 0, 0.05)), 0.15, 0.085, 'mail', 'spine_03', verts=10, scale=(1, 0.85, 1))
    tube(H('neck_01'), T('neck_01') + Vector((0, 0, 0.02)), 0.056, 0.052, 'skin', 'neck_01')
    for s, x in (('l', 1), ('r', -1)):
        ball(H(f'upperarm_{s}') + Vector((0.03 * x, -0.01, 0.02)), 0.09, 'leather', f'upperarm_{s}', scale=(1.1, 1, 0.5))
        tube(H(f'upperarm_{s}'), T(f'upperarm_{s}'), 0.066, 0.056, 'mail', f'upperarm_{s}')
    # head: skull above the Head bone, hair cap, beard, nose
    h = H('Head')
    group('head')
    ball(h + Vector((0, 0, 0.095)), 0.092, 'skin', 'Head', scale=(0.92, 1, 1.12))
    ball(h + Vector((0, 0.022, 0.12)), 0.096, 'hair', 'Head', scale=(0.96, 1, 1.04))
    ball(h + Vector((0, -0.052, 0.04)), 0.054, 'hair', 'Head', scale=(1.12, 0.8, 0.9))
    ball(h + Vector((0, -0.09, 0.085)), 0.018, 'skin', 'Head', seg=6, rings=4)
    group('cloak')
    m.build_cloak()  # weights `spine` / `cloak`, renamed below
    build_hands_items(B, ('leather', 0.062, 0.05), (1.0, CLAWS['finger'], CLAWS['nail']))


def build_hands_items(B, forearm, claw):
    H = lambda n: B[n][0]
    T = lambda n: B[n][1]
    for s, x in (('l', 1), ('r', -1)):
        slot = 'armL' if s == 'l' else 'armR'
        group(f'{slot}__human')
        hand(H, T, s, x, forearm, 1.0, claw[0], None)
        group(f'{slot}__claw')
        hand(H, T, s, x, forearm, 1.08, claw[1], claw[2])
    build_items(B)


def build_items(B):
    H = lambda n: B[n][0]
    T = lambda n: B[n][1]
    # sword in the right fist, blade forward along the thumb; round shield on the back of the left forearm
    group('item_sword')
    grip = H('hand_r') + Vector((-0.075, 0.0, -0.02))
    fwd = Vector((0, -1, 0))
    tube(grip - fwd * 0.08, grip + fwd * 0.07, 0.018, 0.018, 'leather_dark', 'hand_r', verts=6)
    ball(grip - fwd * 0.1, 0.028, 'bronze', 'hand_r', seg=6, rings=4)
    box(grip + fwd * 0.08, (0.03, 0.03, 0.18), 'bronze', 'hand_r')
    box(grip + fwd * 0.39, (0.012, 0.6, 0.055), 'steel', 'hand_r')
    group('item_shield')
    c = (H('lowerarm_l') + T('lowerarm_l')) / 2 + Vector((0, 0, 0.07))
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.25, depth=0.03, location=c)
    finish(bpy.context.object, 'wood', 'lowerarm_l', smooth=False)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.25, minor_radius=0.017, major_segments=14, minor_segments=4, location=c)
    finish(bpy.context.object, 'iron', 'lowerarm_l')
    ball(c + Vector((0, 0, 0.02)), 0.055, 'iron', 'lowerarm_l')


def hand(H, T, s, x, forearm, size, finger, nail):
    # forearm (material, radius at elbow, at wrist), wrist, a rounded palm and separate fingers: three segments per
    # finger on its own bones, a ball at every joint so bent fingers stay closed. Claws: longer, slimmer fingers and
    # dark nails past the tips.
    mat, r0, r1 = forearm
    tube(H(f'lowerarm_{s}'), T(f'lowerarm_{s}'), r0, r1, mat, f'lowerarm_{s}')
    ball(H(f'hand_{s}') + Vector((0.005 * x, 0, -0.002)), 0.04, 'skin', f'hand_{s}', scale=(1, 1.1, 0.75))
    palm = (H(f'hand_{s}') + H(f'middle_01_{s}')) / 2 + Vector((0, 0.008, -0.004))
    ball(palm, 0.062 * size, 'skin', f'hand_{s}', scale=(1, 0.8, 0.36), seg=10, rings=6)
    for f, r in (('index', 0.0105), ('middle', 0.011), ('ring', 0.0105), ('pinky', 0.009), ('thumb', 0.0135)):
        if nail:
            r *= 0.85
        for i in (1, 2, 3):
            n = f'{f}_0{i}_{s}'
            a, b = H(n), T(n)
            b = a + (b - a) * finger
            k = 1 - 0.1 * i
            if i > 1 or f == 'thumb':  # the first knuckles sit in the palm
                ball(a, r * k * 1.08, 'skin', n, seg=6, rings=4)
            tube(a, b, r * k, r * (k - 0.08), 'skin', n, verts=5)
            if i == 3:
                if nail:
                    tube(b, b + (b - a).normalized() * nail, r * 0.8, 0.001, 'nails', n, verts=4)
                else:
                    ball(b, r * (k - 0.08), 'skin', n, seg=6, rings=3)


def build_nosferatu(B):
    H = lambda n: B[n][0]
    T = lambda n: B[n][1]
    group('body')
    for s, x in (('l', 1), ('r', -1)):
        tube(H(f'thigh_{s}') + Vector((0, 0, 0.03)), T(f'thigh_{s}') - Vector((0, 0, 0.03)), 0.105, 0.085, 'trousers', f'thigh_{s}')  # baggy
        tube(H(f'calf_{s}') + Vector((0, 0, 0.05)), H(f'calf_{s}') - Vector((0, 0, 0.12)), 0.088, 0.072, 'trousers', f'calf_{s}')  # bunched over the boot
        tube(H(f'calf_{s}') - Vector((0, 0, 0.06)), T(f'calf_{s}'), 0.066, 0.056, 'boots', f'calf_{s}')
        tube(H(f'foot_{s}') + Vector((0, 0.03, -0.02)), T(f'foot_{s}'), 0.066, 0.054, 'boots', f'foot_{s}', scale=(1, 1, 0.8))
        ball(H(f'ball_{s}'), 0.048, 'boots', f'ball_{s}', scale=(1.1, 1, 0.75))  # joint: no gap when the toes bend
        tube(H(f'ball_{s}') + Vector((0, 0.02, 0)), T(f'ball_{s}') + Vector((0, 0.02, 0)), 0.052, 0.04, 'boots', f'ball_{s}', scale=(1, 1, 0.75))
        # bare, bony arms: a small shoulder, thin upper arm
        ball(H(f'upperarm_{s}') + Vector((0.01 * x, 0, 0.0)), 0.055, 'skin', f'upperarm_{s}', scale=(1.2, 1, 0.8))
        tube(H(f'upperarm_{s}'), T(f'upperarm_{s}'), 0.046, 0.036, 'skin', f'upperarm_{s}')
        ball(T(f'upperarm_{s}'), 0.037, 'skin', f'upperarm_{s}', seg=8, rings=5)  # elbow
    p = H('pelvis')
    tube((0, p.y, 1.0), (0, p.y, 0.86), 0.165, 0.175, 'trousers', 'pelvis', verts=10, scale=(1, 0.75, 1))
    tube((0, p.y, 1.02), (0, p.y, 0.98), 0.165, 0.165, 'leather_dark', 'pelvis', verts=10, scale=(1, 0.75, 1))
    # gaunt bare torso: narrow waist, a little wider at the chest, collarbones, long thin neck
    for bone, r0, r1 in (('spine_01', 0.13, 0.135), ('spine_02', 0.135, 0.165), ('spine_03', 0.165, 0.18)):
        tube(H(bone) - Vector((0, 0, 0.02)), T(bone) + Vector((0, 0, 0.01)), r0, r1, 'skin', bone, verts=10, scale=(1, 0.62, 1))
    for x in (1, -1):
        tube(T('spine_03') + Vector((0.02 * x, -0.03, -0.02)), H('upperarm_l' if x > 0 else 'upperarm_r'), 0.02, 0.018, 'skin', 'spine_03', verts=5)
    tube(H('neck_01') - Vector((0, 0, 0.03)), T('neck_01') + Vector((0, 0, 0.03)), 0.042, 0.038, 'skin', 'neck_01')
    # head: bald elongated skull, heavy brow, sunken eyes, protruding jaw with teeth, ears swept back
    h = H('Head')
    group('head')
    ball(h + Vector((0, 0.01, 0.12)), 0.092, 'skin', 'Head', scale=(0.8, 1.05, 1.28), seg=12, rings=8)
    ball(h + Vector((0, -0.072, 0.14)), 0.05, 'skin', 'Head', scale=(1.4, 0.5, 0.4))  # brow
    for x in (1, -1):
        ball(h + Vector((0.03 * x, -0.078, 0.115)), 0.014, 'eye_pits', 'Head', seg=6, rings=4)
        tube(h + Vector((0.068 * x, 0.01, 0.13)), h + Vector((0.14 * x, 0.1, 0.165)), 0.03, 0.001, 'skin', 'Head', verts=4)  # swept back
        tube(h + Vector((0.016 * x, -0.098, 0.05)), h + Vector((0.016 * x, -0.1, 0.02)), 0.006, 0.001, 'teeth', 'Head', verts=4)
    tube(h + Vector((0, -0.088, 0.11)), h + Vector((0, -0.105, 0.075)), 0.014, 0.008, 'skin', 'Head', verts=5)  # nose
    ball(h + Vector((0, -0.06, 0.045)), 0.05, 'skin', 'Head', scale=(0.9, 0.95, 0.7))  # jaw and mouth
    build_hands_items(B, ('skin', 0.04, 0.03), (NOSFERATU['finger'], NOSFERATU['claw_finger'], NOSFERATU['nail']))


def add_cloak_bone(rig, B):
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    b = rig.data.edit_bones.new('cloak')
    top = B['spine_03'][1]
    b.head, b.tail = top + Vector((0, 0.13, -0.03)), Vector((0, 0.22, 0.5))
    b.parent = rig.data.edit_bones['spine_03']
    bpy.ops.object.mode_set(mode='OBJECT')


def bind(rig, parts):
    for o in parts.values():
        if 'spine' in o.vertex_groups:
            o.vertex_groups['spine'].name = 'spine_03'
        o.parent = rig
        o.modifiers.new('Armature', 'ARMATURE').object = rig


def make_hunch(rig):
    # Idle frame 0 plus a forward lean about the world sideways axis, expressed in each bone's posed frame
    ad = rig.animation_data or rig.animation_data_create()
    idle = bpy.data.actions['Idle_Loop']
    ad.action = idle
    # Blender 5 actions have slots: an action imported with another armature is not bound to this rig by assigning
    # it, so pick its slot explicitly (otherwise the rig stays in its T-pose and the hunch is measured from that)
    if idle.slots:
        ad.action_slot = idle.slots[0]
    bpy.context.scene.frame_set(0)
    world = {n: (rig.matrix_world @ rig.pose.bones[n].matrix).to_3x3() for n in HUNCH}
    base = {n: rig.pose.bones[n].rotation_quaternion.copy() for n in HUNCH}
    act = bpy.data.actions.new('Hunch')
    ad.action = act
    for n, turns in HUNCH.items():
        pb = rig.pose.bones[n]
        pb.rotation_mode = 'QUATERNION'
        q = base[n]
        for axis, deg in ([((1, 0, 0), turns)] if isinstance(turns, (int, float)) else turns):
            q = q @ Quaternion((world[n].inverted() @ Vector(axis)).normalized(), math.radians(deg))
        pb.rotation_quaternion = q
        for f in (0, 1):
            pb.keyframe_insert('rotation_quaternion', frame=f)
    ad.action = None


# Claw stance: started from the Nosferatu references (reference/nosferatu-*.png), then tuned with the user's sliders:
# a light crouch, knees over the feet, back slightly forward, shoulders up, hands low in front of the hips with
# hooked claws, neck forward. Built from the symmetric rest pose. Feet and wrists are
# placed by IK targets (metres, Blender space: +X left, -Y forward, Z up), the rest is degrees about world axes.
STANCE = {  # tuned with the user's sliders (2026-10-19): fairly upright, knees over the feet, low hands, hooked claws
    'drop': 0.08, 'forward': 0.0, 'breath': 0.012,  # pelvis down / forward (m), breathing depth (m)
    'feet': (0.15, 0.03, 0.1), 'knees': (0.18, -0.8, 0.5),  # ankle targets and knee pole targets (mirrored in x)
    'wrists': (0.415, -0.23, 0.955), 'elbows': (0.39, 0.36, 1.18), 'fingertips': (0.49, -0.47, 0.75),
    'lean': {'pelvis': 6, 'spine_01': 5, 'spine_02': 4, 'spine_03': 3, 'neck_01': 12, 'Head': -18},
    'shrug': 14,  # clavicles up
    'curl': {1: 68, 2: 78, 3: 72},  # finger joints
    'thumb': {1: 20, 2: 28, 3: 22},  # thumb joints, folding towards the palm
}


STANCE_FILE = 'tools/claw-stance.json'  # the pose set by hand in tools/claw-stance.blend (tools/read_stance.py)
# IK targets (empties) per side: (bone, target, pole) for IK chains, (bone, target) for damped tracks
IK = lambda s, X: ((f'calf_{s}', f'foot.{X}', f'knee.{X}'), (f'lowerarm_{s}', f'wrist.{X}', f'elbow.{X}'))
TRACK = lambda s, X: ((f'foot_{s}', f'toes.{X}'), (f'hand_{s}', f'fingers.{X}'))
SIDES = (('l', 'L', 1), ('r', 'R', -1))


def curl_hand(rig, s, x, curl, thumb):
    # sets the fingers of one hand from the rest pose: the four fingers curl towards the palm about the forward axis
    # (rest frame), the thumb folds towards the middle of the palm about its own hinge (the fingers' axis bent it
    # backwards). curl / thumb: degrees per joint {1: .., 2: .., 3: ..}
    pbs = rig.pose.bones
    rest = lambda n: (rig.matrix_world @ rig.data.bones[n].matrix_local).to_3x3()
    world = lambda n, tail=False: rig.matrix_world @ (rig.data.bones[n].tail_local if tail else rig.data.bones[n].head_local)
    for f in ('index', 'middle', 'ring', 'pinky'):
        for i, deg in curl.items():
            n = f'{f}_0{i}_{s}'
            axis = (rest(n).inverted() @ Vector((0, 1, 0))).normalized()
            pbs[n].rotation_quaternion = Quaternion(axis, math.radians(deg * x))
    palm = world(f'middle_01_{s}') + Vector((0, 0, -0.03))
    for i, deg in thumb.items():
        n = f'thumb_0{i}_{s}'
        h = world(n)
        axis = (world(n, True) - h).cross(palm - h).normalized()
        pbs[n].rotation_quaternion = Quaternion((rest(n).inverted() @ axis).normalized(), math.radians(deg))


def pose_claw_stance(rig):
    # puts the rig into the claw stance with live IK/damped-track constraints on named empties; returns the empties.
    # The pose comes from STANCE_FILE when it exists (set by hand in Blender), otherwise it is computed from STANCE.
    sc = bpy.context.scene
    pbs = rig.pose.bones
    saved = json.load(open(STANCE_FILE)) if os.path.exists(STANCE_FILE) else None
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = None
    # from the symmetric rest pose (the pack's Idle has the pelvis turned ~13° and the weight on one leg)
    base = {pb.name: (Quaternion(), Vector()) for pb in pbs}
    st = STANCE
    for n, (q, l) in base.items():
        pbs[n].rotation_mode = 'QUATERNION'
        pbs[n].rotation_quaternion, pbs[n].location = q, l
    rest = lambda n: (rig.matrix_world @ rig.data.bones[n].matrix_local).to_3x3()
    if saved:
        for n, v in saved['bones'].items():
            pbs[n].rotation_quaternion, pbs[n].location = Quaternion(v[:4]), Vector(v[4:])
    else:
        def turn(n, axis, deg):  # rotate a pose bone about a world axis, in its current posed frame
            bpy.context.view_layer.update()
            w = (rig.matrix_world @ pbs[n].matrix).to_3x3()
            pbs[n].rotation_quaternion = pbs[n].rotation_quaternion @ Quaternion((w.inverted() @ Vector(axis)).normalized(), math.radians(deg))

        pbs['pelvis'].location = base['pelvis'][1] + rest('pelvis').inverted() @ Vector((0, -st['forward'], -st['drop']))
        for n in ('pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head'):
            turn(n, (1, 0, 0), st['lean'][n])
        turn('clavicle_l', (0, 1, 0), -st['shrug'])
        turn('clavicle_r', (0, 1, 0), st['shrug'])
        for s, X, x in SIDES:
            curl_hand(rig, s, x, st['curl'], st['thumb'])
    mirror = lambda v, x: Vector((v[0] * x, v[1], v[2]))
    computed = lambda X, x: {
        f'foot.{X}': mirror(st['feet'], x), f'knee.{X}': mirror(st['knees'], x),
        f'wrist.{X}': mirror(st['wrists'], x), f'elbow.{X}': mirror(st['elbows'], x),
        f'toes.{X}': mirror((st['feet'][0] + 0.03, st['feet'][1] - 0.3, st['feet'][2] - 0.18), x),  # foot rest slope
        f'fingers.{X}': mirror(st['fingertips'], x),
    }
    empties = {}
    for s, X, x in SIDES:
        for name, loc in computed(X, x).items():
            e = bpy.data.objects.new(name, None)
            sc.collection.objects.link(e)
            e.location = saved['targets'][name] if saved else loc
            e.empty_display_type = 'PLAIN_AXES' if name.split('.')[0] in ('knee', 'elbow') else 'SPHERE'
            e.empty_display_size = 0.05
            e.show_name = e.show_in_front = True
            empties[name] = e
        for bone, tgt, pole in IK(s, X):
            c = pbs[bone].constraints.new('IK')
            c.target, c.chain_count, c.pole_target = empties[tgt], 2, empties[pole]
            if saved:
                c.pole_angle = math.radians(saved['poles'][bone])
            else:  # the pole angle depends on the bone rolls: pick the one that puts the knee/elbow nearest its pole
                best = None
                for a in (-180, -90, 0, 90):
                    c.pole_angle = math.radians(a)
                    bpy.context.view_layer.update()
                    d = (rig.matrix_world @ pbs[bone].head - c.pole_target.location).length
                    if best is None or d < best[0]:
                        best = (d, a)
                c.pole_angle = math.radians(best[1])
        for bone, tgt in TRACK(s, X):
            pbs[bone].constraints.new('DAMPED_TRACK').target = empties[tgt]
    bpy.context.view_layer.update()
    return empties


def make_claw_stance(rig):
    # the stance as a 2 s loop (the pelvis sinks a little in the middle: breathing), baked with its constraints
    empties = pose_claw_stance(rig)
    ad = rig.animation_data
    src = bpy.data.actions.new('Claw_Stance_src')
    ad.action = src
    pbs = rig.pose.bones
    l0 = pbs['pelvis'].location.copy()
    breath = (rig.matrix_world @ rig.data.bones['pelvis'].matrix_local).to_3x3().inverted() @ Vector((0, 0, -STANCE['breath']))
    for f, dl in ((0, Vector()), (30, breath), (60, Vector())):
        pbs['pelvis'].location = l0 + dl
        for pb in pbs:
            pb.keyframe_insert('rotation_quaternion', frame=f)
            pb.keyframe_insert('location', frame=f)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.nla.bake(frame_start=0, frame_end=60, only_selected=False, visual_keying=True, clear_constraints=True,
                     use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    ad.action.name = 'Claw_Stance'
    ad.action = None
    bpy.data.actions.remove(src)
    for e in empties.values():
        bpy.data.objects.remove(e, do_unlink=True)


# Own claw attacks from the claw stance (the pack's Zombie_Scratch looked like a zombie): the attacking hand winds up
# beside the head, rakes across the front and follows through low on the other side, the body twists and lunges into
# it, the other hand pulls back. Wrist/fingertip targets in Blender space for the left hand (k = +1); the right hand
# mirrors them (k = -1). Frames are 30 fps, relative to the swipe's start.
SWIPE = [  # frame, wrist, fingertips, twist (deg, + turns the chest to its left), lean (deg), lunge (forward, down m), open
    (0, None, None, 0, 0, (0, 0), 0),
    (6, (0.62, 0.08, 1.55), (0.8, 0.12, 1.75), 30, -8, (-0.04, 0), 1),  # wound up out to the side and back, claws spread
    (9, (0.2, -0.78, 1.38), (-0.05, -1.15, 1.3), -30, 18, (0.2, 0.05), 1),  # arm out in front at chest height, claws lead
    (12, (0.02, -0.62, 0.98), (-0.25, -0.9, 0.75), -38, 22, (0.24, 0.07), 0.6),  # raked in to the centre line, not past it
    (15, (0.04, -0.58, 0.96), (-0.22, -0.86, 0.72), -34, 20, (0.23, 0.06), 0.4),  # a short hold: the hit reads
    (26, None, None, 0, 0, (0, 0), 0),
]
# the foot opposite the striking hand steps forward into the rake and back: (frame, forward m, lift m, outward m)
STEP = [(0, 0, 0, 0), (4, 0.12, 0.07, 0.02), (8, 0.3, 0, 0.05), (16, 0.3, 0, 0.05), (21, 0.15, 0.06, 0.02), (26, 0, 0, 0)]
CLAW_OPEN = {'curl': {1: 8, 2: 12, 3: 10}, 'thumb': {1: 5, 2: 5, 3: 5}}  # fingers spread for the rake
CLAW_ATTACKS = {'Claw_Swipe_R': [(-1, 0)], 'Claw_Swipe_L': [(1, 0)], 'Claw_Double': [(-1, 0), (1, 9)]}  # (k, start)


def make_claw_attack(rig, name, swipes):
    empties = pose_claw_stance(rig)
    pbs = rig.pose.bones
    base = {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in pbs}
    stance = {n: e.location.copy() for n, e in empties.items()}
    rest = lambda n: (rig.matrix_world @ rig.data.bones[n].matrix_local).to_3x3()
    ad = rig.animation_data
    src = bpy.data.actions.new(name + '_src')
    ad.action = src
    mirror = lambda v, k: Vector((v[0] * k, v[1], v[2]))
    side = lambda k: 'L' if k > 0 else 'R'
    # hand targets: keyed per empty at its own swipe's frames (the other hand pulls back meanwhile)
    for k, t0 in swipes:
        X, O = side(k), side(-k)
        for f, wrist, tips, *_rest in SWIPE:
            for e, loc in ((f'wrist.{X}', wrist), (f'fingers.{X}', tips)):
                empties[e].location = mirror(loc, k) if loc else stance[e]
                empties[e].keyframe_insert('location', frame=t0 + f)
            back = stance[f'wrist.{O}'] + Vector((0, 0.11, 0.05)) if 0 < f < SWIPE[-1][0] else stance[f'wrist.{O}']
            if len(swipes) == 1:
                empties[f'wrist.{O}'].location = back
                empties[f'wrist.{O}'].keyframe_insert('location', frame=t0 + f)
        for f, fwd, lift, out in STEP:  # step with the other foot (toes target moves with it, the foot stays flat)
            d = Vector((out * -k, -fwd, lift))
            for e in (f'foot.{O}', f'toes.{O}'):
                empties[e].location = stance[e] + d
                empties[e].keyframe_insert('location', frame=t0 + f)

    def curve(i, k, t0, f):  # piecewise-linear value of SWIPE column i for one swipe at frame f
        pts = [(t0 + row[0], row[i] * (k if i == 3 else 1) if not isinstance(row[i], tuple) else row[i]) for row in SWIPE]
        if f <= pts[0][0] or f >= pts[-1][0]:
            return pts[0][1] if f <= pts[0][0] else pts[-1][1]
        for (fa, va), (fb, vb) in zip(pts, pts[1:]):
            if fa <= f <= fb:
                t = (f - fa) / (fb - fa)
                return tuple(a + (b - a) * t for a, b in zip(va, vb)) if isinstance(va, tuple) else va + (vb - va) * t

    def turn(n, axis, deg):
        bpy.context.view_layer.update()
        w = (rig.matrix_world @ pbs[n].matrix).to_3x3()
        pbs[n].rotation_quaternion = pbs[n].rotation_quaternion @ Quaternion((w.inverted() @ Vector(axis)).normalized(), math.radians(deg))

    end = max(t0 for _, t0 in swipes) + SWIPE[-1][0]
    frames = sorted({t0 + row[0] for _, t0 in swipes for row in SWIPE} | {end})
    for f in frames:
        twist = sum(curve(3, k, t0, f) for k, t0 in swipes)
        lean = sum(curve(4, k, t0, f) for k, t0 in swipes)
        fwd = sum(curve(5, k, t0, f)[0] for k, t0 in swipes)
        down = sum(curve(5, k, t0, f)[1] for k, t0 in swipes)
        for n, (q, l) in base.items():
            pbs[n].rotation_quaternion, pbs[n].location = q.copy(), l.copy()
        pbs['pelvis'].location = base['pelvis'][1] + rest('pelvis').inverted() @ Vector((0, -fwd, -down))
        for n, share in (('spine_01', 0.3), ('spine_02', 0.35), ('spine_03', 0.35)):
            turn(n, (0, 0, 1), twist * share)
            turn(n, (1, 0, 0), lean * share)
        turn('neck_01', (0, 0, 1), -twist * 0.4)  # the head keeps facing the target
        for k, t0 in swipes:  # the attacking hand opens for the rake and closes again
            o = curve(6, k, t0, f)
            mix = lambda a, b: {j: a[j] * (1 - o) + b[j] * o for j in a}
            curl_hand(rig, 'l' if k > 0 else 'r', k, mix(STANCE['curl'], CLAW_OPEN['curl']), mix(STANCE['thumb'], CLAW_OPEN['thumb']))
        for pb in pbs:
            pb.keyframe_insert('rotation_quaternion', frame=f)
            pb.keyframe_insert('location', frame=f)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.nla.bake(frame_start=0, frame_end=end, only_selected=False, visual_keying=True, clear_constraints=True,
                     use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    ad.action.name = name
    ad.action = None
    bpy.data.actions.remove(src)
    for e in empties.values():
        if e.animation_data and e.animation_data.action:
            bpy.data.actions.remove(e.animation_data.action)
        bpy.data.objects.remove(e, do_unlink=True)


def save_poser(rig, parts):
    # tools/claw-stance.blend: the character in the claw stance with live constraints, for posing by hand
    ad = rig.animation_data or rig.animation_data_create()
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    pose_claw_stance(rig)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for n, o in parts.items():
        if n.endswith('__human') or n.startswith('item_'):
            o.hide_set(True)
            o.hide_render = True
    rig.show_in_front = True
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT))


def to_tracks(rig):
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = None
    for t in list(ad.nla_tracks):  # the importer stashes every pack clip in a track; keep only CLIPS
        ad.nla_tracks.remove(t)
    for a in sorted((a for a in bpy.data.actions if a.name in CLIPS + ['Hunch', 'Claw_Stance', *CLAW_ATTACKS]), key=lambda a: a.name):
        track = ad.nla_tracks.new()
        track.name = a.name
        strip = track.strips.new(a.name, int(a.frame_range[0]), a)
        if a.slots:
            strip.action_slot = a.slots[0]


def main():
    rig = load_rig()
    B = bones(rig)
    if CHARACTER == 'nosferatu':
        build_nosferatu(B)
    else:
        build_parts(B)
    parts = m.join_groups()
    m.bake_grime(parts)
    add_cloak_bone(rig, B)
    bind(rig, parts)
    if POSER:
        return save_poser(rig, parts)
    make_hunch(rig)
    make_claw_stance(rig)
    for name, swipes in CLAW_ATTACKS.items():
        make_claw_attack(rig, name, swipes)
    to_tracks(rig)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animation_mode='NLA_TRACKS', export_yup=True)
    tris = {n: sum(len(p.vertices) - 2 for p in o.data.polygons) for n, o in parts.items()}
    print(f'MERCENARY_UAL: {tris} clips={len(bpy.data.actions)} -> {OUT}')


if __name__ == '__main__':
    main()
