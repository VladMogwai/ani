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
from mercenary import finish, group, material, tube

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
# the Standard kit only has dark skin for the regular bodies: skin textures are lightened and partly desaturated here,
# the viewer then tints them per race (warm human, pale vampire)
SKIN_LIFT = {'gain': 1.9, 'saturation': 0.55}


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


def lift_skin(img):
    import numpy as np
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    rgb = px[:, :3]
    lum = rgb.mean(axis=1, keepdims=True)
    px[:, :3] = np.clip((lum + (rgb - lum) * SKIN_LIFT['saturation']) * SKIN_LIFT['gain'], 0, 1)
    img.pixels[:] = px.ravel()
    img.pack()


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


def nosferatu_head(B):
    h = B['Head'][0]
    group('head_bits')
    for x in (1, -1):
        tube(h + Vector((0.07 * x, 0.01, 0.1)), h + Vector((0.15 * x, 0.11, 0.15)), 0.03, 0.001, 'nos_skin', 'Head', verts=4)
        tube(h + Vector((0.012 * x, -0.1, 0.035)), h + Vector((0.012 * x, -0.102, 0.008)), 0.005, 0.0005, 'teeth', 'Head', verts=4)


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
            body.append(o)
    import_clips()
    arm, meshes = imported('Male_Peasant')  # trousers and shoes only
    for o in list(meshes):
        if not any(k in o.name for k in ('Legs', 'Feet')):
            meshes.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
    attach(rig, meshes, arm)
    nosferatu_head(u.bones(rig))
    finish_character(rig, body + meshes, None, [])


def finish_character(rig, body, base, hair):
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
    body = [o for o in body if o.name in bpy.data.objects]
    for o in body:
        o.name = 'body_' + o.name
    lifted = set()
    for mat in bpy.data.materials:
        if mat.name.split('.')[0] in SKIN_MATERIALS:
            mat.name = 'skin'  # the viewer tints it per race
            for n in mat.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and 'Normal' not in n.image.name and 'Rough' not in n.image.name and n.image not in lifted:
                    lift_skin(n.image)
                    lifted.add(n.image)
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
