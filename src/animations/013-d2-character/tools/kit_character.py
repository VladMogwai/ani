# Builds a character from Quaternius kit parts (CC0, source/kit: Modular Character Outfits - Fantasy + Universal Base
# Characters, Standard versions, textures downscaled to 1024) and gives it the same clips, claw stance, claw attacks,
# slots and items as tools/mercenary_ual.py. The kit shares the Universal Animation Library rig (same 65 bones), so
# the outfit's armature is the rig and the library clips play on it unchanged.
# Usage (from the animation folder):
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/kit_character.py -- assets/kit-ranger.glb ranger
import math, os, sys
import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mercenary as m
import mercenary_ual as u
import bmesh
from mercenary import ball, finish, group, material, tube

KIT = 'source/kit'
ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT, NAME = ARGS[0], ARGS[1]
# outfit (with arms and hands), base character whose head is used, hair pieces
CHARACTERS = {
    'ranger': ('Male_Ranger', 'Superhero_Male_FullBody', ['Hair_Beard', 'Eyebrows_Regular']),
    'peasant': ('Male_Peasant', 'Superhero_Male_FullBody', ['Hair_SimpleParted', 'Hair_Beard', 'Eyebrows_Regular']),
    'peasant_female': ('Female_Peasant', 'Superhero_Female_FullBody', ['Hair_Buns', 'Eyebrows_Female']),
}
SKIN_MATERIALS = ('MI_Regular_Male', 'MI_Regular_Female', 'MI_Superhero_Male', 'MI_Superhero_Female')  # → 'skin'
HEAD_BONES = ('Head', 'neck_01')
# the Nosferatu (the vampire's true form, reference/nosferatu-*.png): the base character's full body made gaunt by
# pulling the skin towards the bones (factor = how much of the distance from the bone stays), bald, pointed ears
# swept back and fangs added; the peasant's trousers and shoes
THIN = {'upperarm_l': 0.62, 'upperarm_r': 0.62, 'lowerarm_l': 0.66, 'lowerarm_r': 0.66, 'clavicle_l': 0.85,
        'clavicle_r': 0.85, 'spine_01': 0.7, 'spine_02': 0.74, 'spine_03': 0.8, 'neck_01': 0.8, 'pelvis': 0.85,
        'thigh_l': 0.8, 'thigh_r': 0.8, 'calf_l': 0.8, 'calf_r': 0.8}
m.COLORS.update({'nos_skin': ('#cfc9c6', 0.7, 0.0)})
# claws: curved talons growing from the last finger joints, bending towards the palm, thick dark horn at the base and a
# pale bone tip (it reads as "sharp" even at 80 px). Lengths in metres; `curve` = how far the tip drops per length.
CLAW = {'length': 0.1, 'thumb': 0.075, 'base': 0.012, 'curve': 0.5, 'flat': 0.7, 'tip_share': 0.3, 'rings': 7}
m.COLORS.update({'claw': ('#e4ddc8', 0.4, 0.0)})  # one pale bone colour: finger and claw read as one long finger
CLAW_GLOW = 0.35  # emission of the claws (same colour), so the hand's outline reads in the dark like the reference
# skin: the heads (base characters) use the kit's own light skin texture; the regular bodies (outfit arms) only come
# with dark skin in the Standard kit, so their texture is colour-matched to the light head (per-channel gain from the
# mean colours). The viewer then tints all `skin*` materials per race (vampires paler and cooler).
LIGHT_SKIN = {'MI_Superhero_Male': 'T_Superhero_Male_Ligh.png', 'MI_Superhero_Female': 'T_Superhero_Female_Light_BaseColor.png'}
SKIN_LIFT = {'gain': 1.3, 'saturation': 0.8}  # the kit's "light" skin is still tan: a mild lift keeps the face detail
FLAT_SKIN = (0.5, 0.48, 0.47)  # the Nosferatu: one flat pale tone (the bald head showed the texture's hairline)


def imported(path):
    bpy.ops.import_scene.gltf(filepath=os.path.join(KIT, path + '.gltf'))
    objs = list(bpy.context.selected_objects)
    return next(o for o in objs if o.type == 'ARMATURE'), [o for o in objs if o.type == 'MESH']


def attach(rig, meshes, arm):
    # skinned meshes from another import of the same rig: move them onto our rig and drop their armature
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = rig
        o.matrix_world = mw
        for mod in o.modifiers:
            if mod.type == 'ARMATURE':
                mod.object = rig
    bpy.data.objects.remove(arm, do_unlink=True)


def head_only(mesh):
    # the base character is a full body; the outfit covers everything below the neck, so keep the head
    idx = {g.index for g in mesh.vertex_groups if g.name in HEAD_BONES}
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in mesh.data.vertices:
        v.select = sum(g.weight for g in v.groups if g.group in idx) < 0.5
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')


def skin_mean(img):
    import numpy as np
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)[:, :3]
    lum = px.mean(axis=1)
    return px[(lum > 0.08) & (lum < 0.97)].mean(axis=0)  # skip unused black / white texture space


def lift_skin(img):
    import numpy as np
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    lum = px[:, :3].mean(axis=1, keepdims=True)
    px[:, :3] = np.clip((lum + (px[:, :3] - lum) * SKIN_LIFT['saturation']) * SKIN_LIFT['gain'], 0, 1)
    img.pixels[:] = px.ravel()
    img.pack()


def match_skin(img, target):
    import numpy as np
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    px[:, :3] = np.clip(px[:, :3] * (target / skin_mean(img)), 0, 1)
    img.pixels[:] = px.ravel()
    img.pack()


def base_color_node(mat):
    # the kit wires texture × vertex colour (a Mix node) into Base Color: follow it back to the image
    links = [l for l in mat.node_tree.links if l.to_socket.name == 'Base Color']
    node = links[0].from_node if links else None
    while node is not None and node.type != 'TEX_IMAGE':
        ins = [l.from_node for l in mat.node_tree.links if l.to_node == node and l.from_node.type in ('TEX_IMAGE', 'MIX')]
        node = next((n for n in ins if n.type == 'TEX_IMAGE'), ins[0] if ins else None)
    return node


def talon(root, d, down, length, bone):
    # a tapered, laterally flattened horn tube along a curve from `root` (direction d, bending towards `down`)
    c = CLAW
    d, down = d.normalized(), (down - d * down.dot(d)).normalized()
    side = d.cross(down).normalized()
    me = bpy.data.meshes.new('talon')
    o = bpy.data.objects.new('talon', me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    rings, n = [], c['rings']
    for i in range(n):
        t = i / (n - 1)
        p = root + d * length * t + down * length * c['curve'] * t * t
        tan = (d + down * 2 * c['curve'] * t).normalized()
        nrm = tan.cross(side).normalized() * -1
        r = c['base'] * (1 - t) ** 0.9 + 0.0004
        rings.append([bm.verts.new(p + (side * math.cos(a) * c['flat'] + nrm * math.sin(a)) * r)
                      for a in (k * 2 * math.pi / 6 for k in range(6))])
    tipv = bm.verts.new(root + d * length * 1.04 + down * length * c['curve'] * 1.08)
    for i in range(n - 1):
        for j in range(6):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % 6], rings[i + 1][(j + 1) % 6], rings[i + 1][j]))
    for j in range(6):
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % 6], tipv))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    mat = material('claw')
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Emission Color'].default_value = bsdf.inputs['Base Color'].default_value
    bsdf.inputs['Emission Strength'].default_value = CLAW_GLOW
    finish(o, 'claw', bone)


def thin(mesh, rig):
    # each vertex moves towards its bones' segments, by the weighted mix of their THIN factors
    mw, aw = mesh.matrix_world, rig.matrix_world
    segs = {b.name: (aw @ b.head_local, aw @ b.tail_local) for b in rig.data.bones}
    names = {g.index: g.name for g in mesh.vertex_groups}
    inv = mw.inverted()
    for v in mesh.data.vertices:
        p = mw @ v.co
        total, acc = 0.0, Vector()
        for g in v.groups:
            n = names.get(g.group)
            if not n or n not in segs:
                continue
            a, b = segs[n]
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
            q = a + ab * t
            acc += (q + (p - q) * THIN.get(n, 1.0)) * g.weight
            total += g.weight
        if total > 0:
            v.co = inv @ (acc / total)


def drop_legs(mesh):
    # the trousers and shoes are made for regular proportions; the superhero legs underneath poke through them, and
    # nothing of them shows anyway, so delete every vertex that belongs mostly to a leg bone
    legs = {g.index for g in mesh.vertex_groups if g.name.startswith(('thigh_', 'calf_', 'foot_', 'ball_'))}
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in mesh.data.vertices:
        v.select = sum(g.weight for g in v.groups if g.group in legs) > 0.5
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')


# the ear: measured on the base head, it stands off the skull at |x| > 0.074 for y -0.015..0.025, z 0.045..0.125
# (a wider box also caught scalp vertices above and behind the ear, which grew into a second spike)
EARS = {'from': 0.074, 'low': 0.06, 'high': 0.125, 'bottom': 0.045, 'y': (-0.015, 0.025), 'up': 0.07, 'back': 0.06, 'out': 0.03}


def point_ears(mesh, rig):
    # the head's own ears pulled into points: ear vertices (beside the skull, at ear height) move up, back and out,
    # more the higher they sit, so the top of each ear becomes a long tip swept back
    h = rig.matrix_world @ rig.data.bones['Head'].head_local
    mw, e = mesh.matrix_world, EARS
    inv = mw.inverted()
    for v in mesh.data.vertices:
        p = mw @ v.co - h
        if abs(p.x) < e['from'] or not (e['bottom'] < p.z < e['high']) or not (e['y'][0] < p.y < e['y'][1]):
            continue
        if p.z < e['low']:  # the lobe stays
            continue
        t = ((p.z - e['low']) / (e['high'] - e['low'])) ** 2 * min(1, (abs(p.x) - e['from']) / 0.006)
        v.co = inv @ (h + p + Vector((e['out'] * (1 if p.x > 0 else -1), e['back'], e['up'])) * t)


def nosferatu_head(B):
    h = B['Head'][0]
    group('head_bits')  # fangs
    for x in (1, -1):
        tube(h + Vector((0.012 * x, -0.098, 0.035)), h + Vector((0.012 * x, -0.1, 0.008)), 0.005, 0.0005, 'teeth', 'Head', verts=4)


def build():
    if NAME == 'nosferatu':
        return build_nosferatu()
    outfit, base, hair = CHARACTERS[NAME]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = u.FPS
    rig, body = imported(outfit)
    rig.name = 'Mercenary'
    finish_character(rig, body, base, hair)


def import_clips():
    for p in u.PACKS:  # the library clips; their armature, mannequin and helper sphere are not needed
        keep = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=p)
        for o in [o for o in bpy.data.objects if o not in keep]:
            bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a.name not in u.CLIPS:
            bpy.data.actions.remove(a)


def build_nosferatu():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = u.FPS
    rig, meshes = imported('Superhero_Male_FullBody')
    rig.name = 'Mercenary'
    body = []
    for o in meshes:
        if o.name.startswith('Eyebrows'):
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            if o.name.lower().startswith('superhero'):
                thin(o, rig)
                drop_legs(o)
                point_ears(o, rig)
            body.append(o)
    import_clips()
    arm, meshes = imported('Male_Peasant')  # trousers and shoes only
    for o in list(meshes):
        if not any(k in o.name for k in ('Legs', 'Feet')):
            meshes.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
    attach(rig, meshes, arm)
    # fangs: the combat face's (shape-keyed) fangs, see game_face
    finish_character(rig, body + meshes, None, [], flat_skin=True)


# The vampire's combat face, as two shape keys (glTF morph targets) on every mesh that sits on the head, so the viewer
# can blend them in: GameFace = ridged brow, bulging lumps above it, wrinkled nose bridge, fangs over the lower lip
# (eyes turn yellow in the viewer); GameFace_Mouth = a snarl: upper lip lifted over the fangs, lower lip pulled down
# a little, a dark gap between (optional).
# Landmarks come from the eyes mesh (eye centre height) and the head's front profile; metres, relative to the Head bone.
FACE = {'brow': 0.02, 'lumps': 0.014, 'nose': 0.013, 'corner': 0.024, 'lip_lift': 0.006, 'lip_drop': 0.004, 'fang': 0.011, 'fang_r': 0.0026}  # fangs: length and root radius (m)
m.COLORS.update({'mouth': ('#2a0a0b', 0.8, 0.0)})


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def face_landmarks(rig, eyes, head):
    h = rig.matrix_world @ rig.data.bones['Head'].head_local
    ez = [(eyes.matrix_world @ v.co - h).z for v in eyes.data.vertices]
    mid = (min(ez) + max(ez)) / 2
    lips = [(head.matrix_world @ v.co - h) for v in head.data.vertices]
    # the mouth line: the deepest point of the front profile between the lips (per 2.5 mm height, the front-most y)
    prof = {}
    for p in lips:
        if abs(p.x) < 0.005 and mid - 0.086 < p.z < mid - 0.058 and p.y < -0.05:
            k = round(p.z / 0.0025)
            prof[k] = min(prof.get(k, 0), p.y)
    mouth = max(prof.items(), key=lambda kv: kv[1])[0] * 0.0025 if prof else mid - 0.075
    lip_y = min((p.y for p in lips if abs(p.x) < 0.01 and abs(p.z - mouth) < 0.008), default=-0.105)
    return h, {'eye': mid, 'brow': max(ez) + 0.012, 'mouth': mouth, 'lip_y': lip_y}


def face_offsets(p, L, mouth_open):
    # p: a point relative to the Head bone (Blender axes: +x left, -y forward, z up)
    if mouth_open:
        # a snarl instead of a dropped jaw (these heads have no proper inner mouth: a real jaw opening pulled the inner
        # lips out like a tongue): the upper lip lifts to bare the fangs, the lower lip pulls down a little, both
        # strongest in the middle and fading out before the mouth corners, so nothing stretches
        lips = smooth(-0.085, -0.1, p.y) * (1 - smooth(FACE['corner'] * 0.6, FACE['corner'] * 1.1, abs(p.x)))
        up = smooth(L['mouth'] - 0.001, L['mouth'] + 0.003, p.z) * (1 - smooth(L['mouth'] + 0.008, L['mouth'] + 0.02, p.z))
        down = (1 - smooth(L['mouth'] - 0.003, L['mouth'] + 0.001, p.z)) * smooth(L['mouth'] - 0.02, L['mouth'] - 0.008, p.z)
        return Vector((0, 0.002, FACE['lip_lift'])) * lips * up + Vector((0, 0.001, -FACE['lip_drop'])) * lips * down
    front = smooth(-0.05, -0.085, p.y)
    if front == 0:
        return Vector()
    d = Vector()
    # brow ridge: a heavy bulge over each eye, pushed forward and a little down
    ridge = math.exp(-((p.z - L['brow']) / 0.016) ** 2) * (1 - smooth(0.055, 0.08, abs(p.x)))
    d += Vector((0, -FACE['brow'], -0.004)) * ridge
    # lumps above it: vertical bulges rising from the nose bridge over the forehead
    up = smooth(L['brow'], L['brow'] + 0.015, p.z) * (1 - smooth(L['brow'] + 0.04, L['brow'] + 0.07, p.z))
    d += Vector((0, -FACE['lumps'], 0)) * up * (0.5 + 0.5 * math.cos(p.x * 75)) * (1 - smooth(0.04, 0.06, abs(p.x)))
    # nose bridge: thickened, with horizontal folds
    bridge = (1 - smooth(0.006, 0.022, abs(p.x))) * smooth(L['eye'] - 0.02, L['eye'] - 0.005, p.z) * (1 - smooth(L['brow'], L['brow'] + 0.01, p.z))
    d += Vector((0, -FACE['nose'] * (0.6 + 0.4 * math.sin(p.z * 450)), 0)) * bridge
    return d * front


def add_face_keys(o, h, L, head_weight_only=True):
    me = o.data
    idx = {g.index for g in o.vertex_groups if g.name in ('Head',)}
    if not o.data.shape_keys:
        o.shape_key_add(name='Basis', from_mix=False)
    keys = [o.shape_key_add(name='GameFace', from_mix=False), o.shape_key_add(name='GameFace_Mouth', from_mix=False)]
    inv = o.matrix_world.inverted().to_3x3()
    moved = 0
    for v in me.vertices:
        w = sum(g.weight for g in v.groups if g.group in idx) if head_weight_only else 1
        if w < 0.3:
            continue
        p = o.matrix_world @ v.co - h
        for k, opened in zip(keys, (False, True)):
            d = face_offsets(p, L, opened) * w
            if d.length:
                k.data[v.index].co = v.co + inv @ d
                moved += 1
    return moved


def build_face_parts(B, h, L):
    # fangs (upper canines) and a dark mouth inside, on the Head bone; both carry the same two shape keys:
    # without GameFace the fangs sit inside the gum, GameFace pushes them out over the lower lip
    group('face_mouth')
    ball(h + Vector((0, L['lip_y'] + 0.045, L['mouth'])), 0.016, 'mouth', 'Head', scale=(1.6, 0.9, 1.0))
    group('face_fangs')
    for x in (1, -1):
        # canines just behind the upper lip, pointing straight down: only the tips show over the lower lip
        root = h + Vector((0.012 * x, L['lip_y'] + 0.009, L['mouth'] + 0.005))
        tube(root, root + Vector((0, 0.001, -FACE['fang'])), FACE['fang_r'], 0.0003, 'teeth', 'Head', verts=6)


def fangs_keys(o, h, L):
    # basis: fangs pulled up into the gum; GameFace: out; GameFace_Mouth: follows the upper lip lift
    me = o.data
    o.shape_key_add(name='Basis', from_mix=False)
    k1 = o.shape_key_add(name='GameFace', from_mix=False)
    k2 = o.shape_key_add(name='GameFace_Mouth', from_mix=False)
    basis = o.data.shape_keys.key_blocks['Basis']
    inv = o.matrix_world.inverted().to_3x3()
    for v in me.vertices:
        p = o.matrix_world @ v.co - h
        k1.data[v.index].co = v.co
        k2.data[v.index].co = v.co + inv @ Vector((0, 0, FACE['lip_lift']))  # they ride on the lifted upper lip
        below = max(0.0, (L['mouth'] + 0.006) - p.z)
        basis.data[v.index].co = v.co + inv @ Vector((0, 0, below * 0.9))


def game_face(rig):
    eyes = next((o for o in bpy.data.objects if o.type == 'MESH' and 'Eyes' in o.name), None)
    head = next((o for o in bpy.data.objects if o.type == 'MESH' and (o.name == 'head' or o.name.lower().startswith('superhero'))), None)
    if not eyes or not head:
        return
    h, L = face_landmarks(rig, eyes, head)
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig and 'Eyes' not in o.name]:
        if 'Head' in o.vertex_groups:
            add_face_keys(o, h, L)
    build_face_parts(u.bones(rig), h, L)
    return h, L


def finish_character(rig, body, base, hair, flat_skin=False):
    if base:
        import_clips()
    arm, meshes = imported(base) if base else (None, [])
    for o in list(meshes):
        if o.name.lower().startswith('superhero'):
            head_only(o)
            o.name = 'head'
        elif o.name.startswith('Eyebrows'):  # the hair list brings its own
            meshes.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
    if arm:
        attach(rig, meshes, arm)
    for h in hair:
        arm, meshes = imported(h)
        attach(rig, meshes, arm)
    for o in [o for o in bpy.data.objects if o.name.startswith('Icosphere')]:  # helper spheres in the kit files
        bpy.data.objects.remove(o, do_unlink=True)
    face = game_face(rig)
    body = [o for o in body if o.name in bpy.data.objects]
    for o in body:
        o.name = 'body_' + o.name
    skins = [mat for mat in bpy.data.materials if mat.name.split('.')[0] in SKIN_MATERIALS]
    light = None
    for mat in skins:  # heads first: their light texture is the target tone
        key = mat.name.split('.')[0]
        node = base_color_node(mat)
        if key in LIGHT_SKIN and node:
            node.image = bpy.data.images.load(os.path.abspath(os.path.join(KIT, LIGHT_SKIN[key])))
            lift_skin(node.image)
            light = skin_mean(node.image)
    done = set()
    for mat in skins:
        node = base_color_node(mat)
        if flat_skin and node:
            mat.node_tree.links.remove(next(l for l in mat.node_tree.links if l.to_socket.name == 'Base Color'))
            mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*FLAT_SKIN, 1)
        elif node and mat.name.split('.')[0] not in LIGHT_SKIN and light is not None and node.image not in done:
            match_skin(node.image, light)
            done.add(node.image)
        if node and not flat_skin:
            # the kit multiplies the texture by a dark vertex colour (its skin-tone control): bypass it, the viewer
            # tints per race instead
            mat.node_tree.links.new(node.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
        mat.name = 'skin'  # the viewer tints every skin* material per race
    # our parts: claw nails on the fingertips (slots armL/armR__claw) and the items
    B = u.bones(rig)
    for s, slot in (('l', 'armL'), ('r', 'armR')):
        group(f'{slot}__claw')
        palm = B[f'middle_01_{s}'][0] + Vector((0, 0, -0.03))
        for f in ('index', 'middle', 'ring', 'pinky', 'thumb'):
            n = f'{f}_03_{s}'
            a, b = B[n]
            d = (b - a).normalized()
            down = (palm - b) if f == 'thumb' else Vector((0, 0, -1))  # towards the palm (palms face down in the T-pose)
            talon(b - d * 0.015, d, down, CLAW['thumb' if f == 'thumb' else 'length'], n)
    u.build_items(B)
    parts = m.join_groups()
    if face and 'face_fangs' in parts:
        fangs_keys(parts['face_fangs'], *face)
        add_face_keys(parts['face_mouth'], *face, head_weight_only=False)
    for o in parts.values():
        o.parent = rig
        o.modifiers.new('Armature', 'ARMATURE').object = rig
    u.make_hunch(rig)
    u.make_claw_stance(rig)
    for name, swipes in u.CLAW_ATTACKS.items():
        u.make_claw_attack(rig, name, swipes)
    u.to_tracks(rig)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animation_mode='NLA_TRACKS', export_yup=True,
                              export_image_format='JPEG', export_image_quality=85)
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'}
    print(f'KIT {NAME}: {sum(tris.values())} tris {tris} -> {OUT}')


build()
