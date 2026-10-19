# Retargets Mixamo clips (licensed/mixamo/*.fbx, the "Creature Pack": royalty-free to use in the game, but the raw
# files may not be redistributed, hence the gitignored folder) onto the Quaternius rig of our characters.
# Each mapped bone takes its source bone's rotation relative to the source rest pose (both rigs rest in a T-pose,
# facing the same way), applied in world space onto the target bone's rest; the hips' movement is scaled by the
# ratio of leg lengths, and with in_place the horizontal part is dropped (the viewer moves characters itself).
import math
import bpy
from mathutils import Matrix, Vector

SIDES = (('Left', 'l'), ('Right', 'r'))
MAP = {'Hips': 'pelvis', 'Spine': 'spine_01', 'Spine1': 'spine_02', 'Spine2': 'spine_03', 'Neck': 'neck_01', 'Head': 'Head'}
for src, s in SIDES:
    MAP.update({f'{src}Shoulder': f'clavicle_{s}', f'{src}Arm': f'upperarm_{s}', f'{src}ForeArm': f'lowerarm_{s}',
                f'{src}Hand': f'hand_{s}', f'{src}UpLeg': f'thigh_{s}', f'{src}Leg': f'calf_{s}',
                f'{src}Foot': f'foot_{s}', f'{src}ToeBase': f'ball_{s}'})
    for finger, f in (('Thumb', 'thumb'), ('Index', 'index'), ('Middle', 'middle'), ('Ring', 'ring'), ('Pinky', 'pinky')):
        for i in (1, 2, 3):
            MAP[f'{src}Hand{finger}{i}'] = f'{f}_0{i}_{s}'


def import_source(path):
    keep = set(bpy.data.objects)
    acts = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in keep]
    arm = next(o for o in new if o.type == 'ARMATURE')
    act = next(a for a in bpy.data.actions if a not in acts)
    return arm, act, new


def retarget(rig, path, name, in_place=True, fps=30, elbow_open=0.0, arm_out=0.0, fixed=None, leg_in=0.0):
    # leg_in: degrees each whole leg swings in towards the centre about the forward axis (the mutant's wide stance
    # put our characters' feet 58 cm apart)
    # fixed: {bone: local quaternion} keyed instead of the source (e.g. a fist grip for the fingers)
    # arm_out: degrees the whole arm (upper arm, forearm, hand, fingers) swings out to its side about the forward axis,
    # so the hands don't meet in front of the hips
    # elbow_open (0..1): how much the elbows straighten. The Mixamo mutant has huge shoulders and a wide chest; on
    # our narrower bodies its bent arms brought the hands together in front and the claws crossed (user: just
    # straighten the elbows a little). The forearm's change from rest is blended towards the upper arm's, which is
    # a straight arm, since both rigs rest with straight arms in a T-pose
    src, src_act, new = import_source(path)
    sc = bpy.context.scene
    pre = 'mixamorig:'
    fixed = fixed or {}
    pairs = [(pre + s, t) for s, t in MAP.items() if pre + s in src.pose.bones and t in rig.pose.bones and t not in fixed]
    # rest orientations in world space
    rs = {s: (src.matrix_world @ src.data.bones[s].matrix_local).to_3x3().normalized() for s, _ in pairs}
    rt = {t: (rig.matrix_world @ rig.data.bones[t].matrix_local).to_3x3().normalized() for _, t in pairs}
    s_hips = src.matrix_world @ src.data.bones[pre + 'Hips'].head_local
    t_hips = rig.matrix_world @ rig.data.bones['pelvis'].head_local
    ratio = t_hips.z / max(s_hips.z, 1e-6)
    # parents first
    depth = lambda b: 0 if b.parent is None else 1 + depth(b.parent)
    pairs.sort(key=lambda p: depth(rig.data.bones[p[1]]))
    levels = sorted({depth(rig.data.bones[t]) for _, t in pairs})
    src.animation_data_create()
    src.animation_data.action = src_act
    if src_act.slots:
        src.animation_data.action_slot = src_act.slots[0]
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = None
    for t0 in rig.pose.bones:
        t0.rotation_mode = 'QUATERNION'
        t0.rotation_quaternion = (1, 0, 0, 0)
        t0.location = (0, 0, 0)
    act = bpy.data.actions.new(name)
    ad.action = act
    f0, f1 = (int(x) for x in src_act.frame_range)
    inv = rig.matrix_world.inverted()
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        for lv in levels:
            for s, t in pairs:
                if depth(rig.data.bones[t]) != lv:
                    continue
                ps = (src.matrix_world @ src.pose.bones[s].matrix).to_3x3().normalized()
                delta = ps @ rs[s].inverted()
                if elbow_open and t in ('lowerarm_l', 'lowerarm_r'):
                    up = pre + ('LeftArm' if t.endswith('_l') else 'RightArm')
                    du = (src.matrix_world @ src.pose.bones[up].matrix).to_3x3().normalized() @ rs[up].inverted()
                    delta = delta.to_quaternion().slerp(du.to_quaternion(), elbow_open).to_matrix()
                if arm_out and (t.endswith('_l') or t.endswith('_r')) and not t.startswith(('clavicle', 'thigh', 'calf', 'foot', 'ball')):
                    sign = -1 if t.endswith('_l') else 1  # about +Y: negative swings the left arm towards +x
                    delta = Matrix.Rotation(math.radians(arm_out * sign), 3, 'Y') @ delta
                if leg_in and t.startswith(('thigh_', 'calf_', 'foot_', 'ball_')):
                    sign = 1 if t.endswith('_l') else -1  # about +Y: positive swings the left leg towards -x
                    delta = Matrix.Rotation(math.radians(leg_in * sign), 3, 'Y') @ delta
                rot = delta @ rt[t]
                pb = rig.pose.bones[t]
                if t == 'pelvis':
                    d = (src.matrix_world @ src.pose.bones[s].head - s_hips) * ratio
                    if in_place:
                        d.x = d.y = 0
                    head = t_hips + d
                else:
                    head = rig.matrix_world @ pb.head
                pb.matrix = inv @ (Matrix.Translation(head) @ rot.to_4x4())
            bpy.context.view_layer.update()
        for t, q in fixed.items():
            rig.pose.bones[t].rotation_quaternion = q
            rig.pose.bones[t].keyframe_insert('rotation_quaternion', frame=f - f0)
        for s, t in pairs:
            pb = rig.pose.bones[t]
            pb.keyframe_insert('rotation_quaternion', frame=f - f0)
            if t == 'pelvis':
                pb.keyframe_insert('location', frame=f - f0)
    ad.action = None
    for t0 in rig.pose.bones:
        t0.rotation_quaternion = (1, 0, 0, 0)
        t0.location = (0, 0, 0)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.actions.remove(src_act)
    return act
