# Builds the mercenary (low-poly, Diablo II scale of detail) as swappable parts on one skeleton, bakes their grime
# texture and writes a GLB with idle, walk and attack clips.
# Usage (from the animation folder):
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/mercenary.py -- assets/mercenary.glb
# Units are metres, Blender Z up, the character faces -Y (glTF +Z after export). Left side is +X.
#
# Parts are separate meshes skinned to the same armature, named `<slot>__<variant>` for swappable body parts
# (armR__human / armR__claw, armL__...), `item_<name>` for things in the hands and plain names for the parts every
# variant keeps (body, head, cloak). The viewer shows one variant per slot; the vampire's partial transformation
# swaps hands for claws (like changing gear) and adds the Hunch pose on top of any clip. Transformation parts only use
# the shared bones, so any humanoid on this skeleton can wear them (hero and NPCs alike).
# Skin is baked white (grime and AO only): the viewer tints the `skin` material per race (vampires are paler).
# Body parts are weighted 100% to one bone (rigid skinning); only the cloak blends, so it can sway.
import math, sys
import bpy, bmesh
from mathutils import Euler, Vector

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'assets/mercenary.glb'
FPS = 24
TEXTURE = 512  # baked albedo size; the hero is ~80 px tall, so this is plenty

COLORS = {  # sRGB hex, roughness, metallic (kept low: without an environment map metal renders black in three.js)
    'skin': ('#a8795a', 0.7, 0.0),
    'hair': ('#2a1d14', 0.9, 0.0),
    'leather': ('#5e4129', 0.8, 0.0),
    'leather_dark': ('#33241a', 0.8, 0.0),
    'mail': ('#80817c', 0.5, 0.35),
    'cloth': ('#3a3830', 0.95, 0.0),
    'cloak': ('#30352a', 0.95, 0.0),
    'boots': ('#2e2118', 0.8, 0.0),
    'steel': ('#b4b9be', 0.35, 0.45),
    'bronze': ('#8a6e3e', 0.5, 0.4),
    'wood': ('#6b4a2b', 0.85, 0.0),
    'iron': ('#55565a', 0.55, 0.4),
    'nails': ('#1d1416', 0.4, 0.0),
}

# vampire claws: long thin pale fingers with dark pointed nails, exaggerated so they read at 80 px
CLAWS = {'fingers': 4, 'finger': 0.11, 'nail': 0.07, 'hand': 1.2}  # finger and nail length (m), hand size factor

# the partial transformation's posture, added on top of any clip (degrees about local X/Y/Z; hips location)
HUNCH = {
    'hips': ((8, 0, 0), (0, -0.06, 0)),
    'spine': ((26, 0, 0), (0, 0, 0)),
    'head': ((-24, 0, 0), (0, 0, 0)),  # face stays forward
    'upperarm.L': ((14, 0, -6), (0, 0, 0)), 'upperarm.R': ((14, 0, 6), (0, 0, 0)),  # shoulders up, arms forward
    'forearm.L': ((18, 0, 0), (0, 0, 0)), 'forearm.R': ((18, 0, 0), (0, 0, 0)),
    'thigh.L': ((10, 0, 0), (0, 0, 0)), 'thigh.R': ((10, 0, 0), (0, 0, 0)),  # knees bent
    'shin.L': ((-14, 0, 0), (0, 0, 0)), 'shin.R': ((-14, 0, 0), (0, 0, 0)),
}

GRIME = {  # baked into the albedo: noise stains, ambient occlusion in creases, dirt towards the feet
    'noise_scale': 18, 'noise_dark': 0.62,  # stains darken the colour down to this factor
    'ao_distance': 0.12, 'ao_dark': 0.35,  # fully occluded creases keep this much of the colour
    'dirt_height': 0.7, 'dirt_dark': 0.62,  # at the soles, fading out by dirt_height metres
}

# name: (head, tail, parent)
BONES = {
    'hips': ((0, 0, 0.95), (0, 0, 1.05), None),
    'spine': ((0, 0, 1.05), (0, 0, 1.42), 'hips'),
    'head': ((0, 0, 1.45), (0, 0, 1.74), 'spine'),
    'cloak': ((0, 0.13, 1.4), (0, 0.22, 0.5), 'spine'),
    'upperarm.L': ((0.26, 0, 1.4), (0.29, 0, 1.13), 'spine'),
    'forearm.L': ((0.29, 0, 1.13), (0.3, 0, 0.89), 'upperarm.L'),
    'upperarm.R': ((-0.26, 0, 1.4), (-0.29, 0, 1.13), 'spine'),
    'forearm.R': ((-0.29, 0, 1.13), (-0.3, 0, 0.89), 'upperarm.R'),
    'thigh.L': ((0.11, 0, 0.93), (0.11, 0, 0.5), 'hips'),
    'shin.L': ((0.11, 0, 0.5), (0.11, 0, 0.08), 'thigh.L'),
    'thigh.R': ((-0.11, 0, 0.93), (-0.11, 0, 0.5), 'hips'),
    'shin.R': ((-0.11, 0, 0.5), (-0.11, 0, 0.08), 'thigh.R'),
}


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]


def material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    hexc, rough, metal = COLORS[name]
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = srgb(hexc)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if name == 'cloak':
        m.use_backface_culling = False  # open shell, seen from inside at some directions
    return m


GROUPS = {}  # part name -> objects joined into it
CURRENT = ['body']


def group(name):
    CURRENT[0] = name


def finish(obj, mat, bone, smooth=True):
    obj.data.materials.append(material(mat))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if smooth:
        bpy.ops.object.shade_smooth()
    if bone:
        obj.vertex_groups.new(name=bone).add(range(len(obj.data.vertices)), 1.0, 'REPLACE')
    GROUPS.setdefault(CURRENT[0], []).append(obj)
    return obj


def tube(p0, p1, r0, r1, mat, bone, verts=8, scale=(1, 1, 1)):
    a, b = Vector(p0), Vector(p1)
    d = b - a
    rot = d.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r0, radius2=r1, depth=d.length, location=(a + b) / 2, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    return finish(o, mat, bone)


def ball(loc, r, mat, bone, scale=(1, 1, 1), seg=10, rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.object
    o.scale = scale
    return finish(o, mat, bone)


def box(loc, size, mat, bone, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    return finish(o, mat, bone, smooth=False)


def build_cloak():
    # an open shell around the back: rows from the shoulders to the knees, an arc that wraps past the arms.
    # Weights fade from the spine at the collar to the cloak bone at the hem, so the hem swings and the collar stays.
    top, bottom, rows, cols = 1.43, 0.45, 6, 14
    arc0, arc1 = math.radians(-25), math.radians(205)  # 0 = +X (left side), 90 = back (+Y)
    me = bpy.data.meshes.new('cloak')
    o = bpy.data.objects.new('cloak', me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    grid = []
    for i in range(rows + 1):
        t = i / rows
        z = top + (bottom - top) * t
        r = 0.22 + 0.13 * t ** 0.8
        ring = []
        for j in range(cols + 1):
            a = arc0 + (arc1 - arc0) * j / cols
            ring.append(bm.verts.new((r * math.cos(a), 0.03 + 0.78 * r * math.sin(a), z)))
        grid.append(ring)
    for i in range(rows):
        for j in range(cols):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    finish(o, 'cloak', None)
    spine, cloak = o.vertex_groups.new(name='spine'), o.vertex_groups.new(name='cloak')
    for v in me.vertices:
        w = min(1, max(0, (top - v.co.z) / (top - bottom))) ** 0.7
        spine.add([v.index], 1 - w, 'REPLACE')
        cloak.add([v.index], w, 'REPLACE')


def build_body():
    # parts every variant keeps: legs, waist, torso, upper arms, neck
    group('body')
    for s, side in ((1, 'L'), (-1, 'R')):
        x = 0.11 * s
        tube((x, 0, 0.92), (x, 0, 0.5), 0.092, 0.074, 'cloth', f'thigh.{side}')
        tube((x, 0, 0.53), (x, 0, 0.08), 0.078, 0.066, 'boots', f'shin.{side}')
        tube((x, 0, 0.55), (x, 0, 0.47), 0.085, 0.085, 'leather_dark', f'shin.{side}')  # boot cuff
        box((x, -0.04, 0.05), (0.12, 0.27, 0.1), 'boots', f'shin.{side}')
    tube((0, 0, 0.99), (0, 0, 0.7), 0.19, 0.235, 'mail', 'hips', verts=10, scale=(1, 0.78, 1))
    tube((0, 0, 1.02), (0, 0, 0.96), 0.195, 0.195, 'leather_dark', 'hips', verts=10, scale=(1, 0.76, 1))
    box((0, -0.155, 0.99), (0.07, 0.03, 0.06), 'bronze', 'hips')
    box((0.15, -0.09, 0.93), (0.07, 0.05, 0.09), 'leather', 'hips')
    tube((0, 0, 1.0), (0, 0, 1.43), 0.185, 0.245, 'leather', 'spine', verts=10, scale=(1, 0.7, 1))
    tube((0, 0, 1.41), (0, 0, 1.48), 0.15, 0.085, 'mail', 'spine', verts=10, scale=(1, 0.85, 1))
    for s, side in ((1, 'L'), (-1, 'R')):
        ball((0.24 * s, 0, 1.41), 0.115, 'leather_dark', f'upperarm.{side}', scale=(1.05, 1, 0.62))
        tube((0.26 * s, 0, 1.39), (0.29 * s, 0, 1.12), 0.066, 0.056, 'mail', f'upperarm.{side}')
    tube((0, 0, 1.44), (0, 0, 1.53), 0.056, 0.052, 'skin', 'head')
    group('cloak')
    build_cloak()


def build_human():
    for s, side, slot in ((1, 'L', 'armL'), (-1, 'R', 'armR')):
        group(f'{slot}__human')
        tube((0.29 * s, 0, 1.13), (0.3 * s, 0, 0.9), 0.062, 0.05, 'leather', f'forearm.{side}')
        box((0.3 * s, 0, 0.85), (0.065, 0.085, 0.095), 'skin', f'forearm.{side}')
    group('head')
    ball((0, 0, 1.615), 0.092, 'skin', 'head', scale=(0.92, 1, 1.12))
    ball((0, 0.022, 1.64), 0.096, 'hair', 'head', scale=(0.96, 1, 1.04))
    ball((0, -0.052, 1.56), 0.054, 'hair', 'head', scale=(1.12, 0.8, 0.9))
    ball((0, -0.088, 1.605), 0.018, 'skin', 'head', seg=6, rings=4)


def build_claws():
    # same sleeve and bracer as the human arm, a bigger pale hand, long fingers pointing down and forward, dark nails
    c = CLAWS
    for s, side, slot in ((1, 'L', 'armL'), (-1, 'R', 'armR')):
        group(f'{slot}__claw')
        bone = f'forearm.{side}'
        tube((0.29 * s, 0, 1.13), (0.3 * s, 0, 0.9), 0.062, 0.05, 'leather', bone)
        box((0.3 * s, -0.005, 0.85), (0.065 * c['hand'], 0.09 * c['hand'], 0.09 * c['hand']), 'skin', bone)
        for i in range(c['fingers']):
            t = i / (c['fingers'] - 1) - 0.5
            root = Vector((0.3 * s + t * 0.06, -0.035, 0.81))
            knuckle = root + Vector((t * 0.03, -0.035, -c['finger']))
            tip = knuckle + Vector((t * 0.015, -0.035, -c['nail']))
            tube(root, knuckle, 0.011, 0.008, 'skin', bone, verts=4)
            tube(knuckle, tip, 0.008, 0.001, 'nails', bone, verts=4)


def build_items():
    # sword: built along +Z around the grip, then tilted so the blade points forward and down
    group('item_sword')
    hand = Vector((-0.3, 0, 0.85))
    tilt = Euler((math.radians(130), 0, 0))
    def at(z):
        v = Vector((0, 0, z)); v.rotate(tilt); return hand + v
    tube(at(-0.06), at(0.09), 0.018, 0.018, 'leather_dark', 'forearm.R', verts=6)
    ball(at(-0.08), 0.028, 'bronze', 'forearm.R', seg=6, rings=4)
    box(at(0.1), (0.18, 0.03, 0.03), 'bronze', 'forearm.R', rot=tilt)
    box(at(0.41), (0.055, 0.012, 0.6), 'steel', 'forearm.R', rot=tilt)
    # round wooden shield on the outer side of the left forearm, turned slightly towards the front
    group('item_shield')
    rot = Euler((0, math.radians(90), math.radians(-15)))
    normal = Vector((0, 0, 1)); normal.rotate(rot)
    c = Vector((0.37, -0.01, 1.0))
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.25, depth=0.03, location=c, rotation=rot)
    finish(bpy.context.object, 'wood', 'forearm.L', smooth=False)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.25, minor_radius=0.017, major_segments=14, minor_segments=4, location=c, rotation=rot)
    finish(bpy.context.object, 'iron', 'forearm.L')
    ball(c + normal * 0.02, 0.055, 'iron', 'forearm.L')


def join_groups():
    parts = {}
    for name, objs in GROUPS.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        o = bpy.context.object
        o.name = o.data.name = name
        parts[name] = o
    return parts


def bake_grime(parts):
    # one shared UV atlas for all parts, then Cycles bakes base colour x stains x AO x dirt through an emission
    # shader into one image, used as Base Color by every material (roughness and metallic stay per material).
    # Two passes, so a variant is never darkened by the variant it replaces (they overlap in space):
    # 1) the default look (human parts + items), 2) the beast parts with the human parts and items hidden.
    objs = list(parts.values())
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('MercenaryAlbedo', TEXTURE, TEXTURE)
    g = GRIME
    mats = {m for o in objs for m in o.data.materials}
    for m in mats:
        nt = m.node_tree
        N, L = nt.nodes, nt.links
        bsdf, out = N['Principled BSDF'], N['Material Output']
        base = [1, 1, 1] if m.name == 'skin' else list(bsdf.inputs['Base Color'].default_value)[:3]

        def node(kind, **inputs):
            n = N.new(kind)
            for k, v in inputs.items():
                n.inputs[k].default_value = v
            return n

        def remap(src, a, b, c, d):
            n = node('ShaderNodeMapRange', **{'From Min': a, 'From Max': b, 'To Min': c, 'To Max': d})
            L.new(src, n.inputs['Value'])
            return n.outputs['Result']

        def mul(x, y):
            n = node('ShaderNodeMath')
            n.operation = 'MULTIPLY'
            L.new(x, n.inputs[0]); L.new(y, n.inputs[1])
            return n.outputs['Value']

        coord = N.new('ShaderNodeTexCoord')
        noise = node('ShaderNodeTexNoise', Scale=g['noise_scale'], Detail=4.0)
        L.new(coord.outputs['Object'], noise.inputs['Vector'])
        ao = node('ShaderNodeAmbientOcclusion', Distance=g['ao_distance'])
        sep = N.new('ShaderNodeSeparateXYZ')
        L.new(N.new('ShaderNodeNewGeometry').outputs['Position'], sep.inputs['Vector'])
        k = mul(mul(remap(noise.outputs['Fac'], 0.42, 0.68, 1, g['noise_dark']),
                    remap(ao.outputs['AO'], 0, 1, g['ao_dark'], 1)),
                remap(sep.outputs['Z'], 0, g['dirt_height'], g['dirt_dark'], 1))
        scale = N.new('ShaderNodeVectorMath')
        scale.operation = 'SCALE'
        scale.inputs[0].default_value = base
        L.new(k, scale.inputs['Scale'])
        emit = N.new('ShaderNodeEmission')
        L.new(scale.outputs['Vector'], emit.inputs['Color'])
        L.new(emit.outputs['Emission'], out.inputs['Surface'])
        tex = N.new('ShaderNodeTexImage')
        tex.image = img
        N.active = tex
        m['_bake'] = [n.name for n in N if n not in (bsdf, out, tex)]
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.render.bake.margin = 3
    beast = [o for n, o in parts.items() if n.endswith('__claw')]
    replaced = [o for n, o in parts.items() if n.endswith('__human') or n.startswith('item_')]
    for i, (bake, hide) in enumerate(((objs, beast), (beast, replaced))):
        for o in objs:
            o.hide_render = o in hide
        bpy.ops.object.select_all(action='DESELECT')
        for o in bake:
            if o not in hide:
                o.select_set(True)
        bpy.context.view_layer.objects.active = next(o for o in bake if o not in hide)
        bpy.ops.object.bake(type='EMIT', use_clear=i == 0)
    for o in objs:
        o.hide_render = False
    for m in mats:
        nt = m.node_tree
        for name in m['_bake']:
            nt.nodes.remove(nt.nodes[name])
        del m['_bake']
        tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE')
        nt.links.new(tex.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
        nt.links.new(nt.nodes['Principled BSDF'].outputs['BSDF'], nt.nodes['Material Output'].inputs['Surface'])
    img.pack()


def build_armature():
    bpy.ops.object.armature_add(location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = 'Mercenary'
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    eb.remove(eb[0])
    for name, (h, t, parent) in BONES.items():
        b = eb.new(name)
        b.head, b.tail = h, t
        b.align_roll(Vector((0, -1, 0)))  # local X is then the sideways axis: +X rotation swings a bone forward
        if parent:
            b.parent = eb[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


# Pose: bone -> (rotation degrees about local X, Y, Z; location in bone space). +X swings forward,
# Y twists around the bone (+Y turns the chest to its left), Z tilts sideways.
# The hips bone points up, so its location (x, y, z) is (left, up, forward).
Z3 = (0, 0, 0)


def walk_pose(f):
    p = f / FPS * 2 * math.pi  # one second per cycle; left heel strikes at p = 0, right at p = pi
    c, s = math.cos(p), math.sin(p)
    return {
        # lowest just after each heel strike, highest at mid-stance; weight shifts over the planted foot
        'hips': ((0, -7 * c, -3 * s), (0.022 * s, 0.028 * abs(math.sin(p - 0.3)) - 0.01, 0)),
        'spine': ((7, 11 * c, 2 * s), Z3),  # shoulders turn against the hips
        'head': ((-6, -4 * c, s), Z3),  # keeps the gaze steady
        'cloak': ((-16 + 4 * math.cos(2 * p), -3 * c, 3 * s), Z3),  # trails behind, flaps twice per cycle
        'thigh.L': ((26 * c + 4, 0, 0), Z3),
        'thigh.R': ((-26 * c + 4, 0, 0), Z3),
        'shin.L': ((-6 - 58 * max(0, -math.sin(p + 0.25)) - 10 * max(0, s), 0, 0), Z3),
        'shin.R': ((-6 - 58 * max(0, math.sin(p + 0.25)) - 10 * max(0, -s), 0, 0), Z3),
        'upperarm.L': ((12 - 16 * c, 0, -4), Z3),  # shield arm swings less, held up
        'forearm.L': ((45 - 6 * math.cos(p - 0.6), 0, 0), Z3),
        'upperarm.R': ((8 + 20 * c, 0, 4), Z3),
        'forearm.R': ((32 + 10 * math.cos(p - 0.6), 0, 0), Z3),  # lags behind the upper arm
    }


def idle_pose(f):
    p = f / (2 * FPS) * 2 * math.pi  # two seconds per breath
    s = math.sin(p)
    return {
        # weight on the right (back) leg: hips shifted and tilted over it
        'hips': ((0, 6, 3), (-0.025, -0.022 + 0.006 * s, 0)),
        'spine': ((4 + 1.8 * s, -6, -3), Z3),
        'head': ((-3 - 1.5 * s, 3, 1), Z3),
        'cloak': ((-3 + 1.5 * math.sin(p - 0.8), 0, 1.5 * math.sin(p * 0.5)), Z3),
        'thigh.L': ((12, 0, -5), Z3),
        'thigh.R': ((-8, 0, 3), Z3),
        'shin.L': ((-16, 0, 0), Z3),
        'shin.R': ((-6, 0, 0), Z3),
        'upperarm.L': ((16 + s, 0, -6), Z3),
        'forearm.L': ((48, 0, 0), Z3),
        'upperarm.R': ((10 + 1.5 * s, 0, 5), Z3),
        'forearm.R': ((35 + 2 * s, 0, 0), Z3),
    }


def keyed(keys):
    # attack clips: key poses (frame -> bone overrides, the rest from idle), eased with smoothstep in between
    base = idle_pose(0)
    frames = sorted(keys)
    full = {k: {b: keys[k].get(b, base[b]) for b in base} for k in frames}
    lerp = lambda a, b, t: tuple(x + (y - x) * t for x, y in zip(a, b))

    def pose(f):
        for a, b in zip(frames, frames[1:]):
            if a <= f <= b:
                t = (f - a) / (b - a)
                t = t * t * (3 - 2 * t)
                return {n: (lerp(full[a][n][0], full[b][n][0], t), lerp(full[a][n][1], full[b][n][1], t)) for n in base}
        return full[frames[-1]]
    return pose, frames[-1]


def mirror(pose_fn):
    # the same move with the other side: swap .L/.R bones, flip twist and tilt, flip sideways shifts
    def pose(f):
        out = {}
        for n, ((x, y, z), (lx, ly, lz)) in pose_fn(f).items():
            m = n[:-1] + ('R' if n.endswith('L') else 'L') if n.endswith(('.L', '.R')) else n
            out[m] = ((x, -y, -z), (-lx, ly, lz))
        return out
    return pose


R = lambda x, y=0, z=0: ((x, y, z), Z3)  # rotation only
ATTACKS = {
    # right-hand sword: wind up over the shoulder, diagonal cut with a step in
    'SwordSlash': {
        5: {'spine': R(2, -28), 'upperarm.R': R(125), 'forearm.R': R(55), 'thigh.R': R(-14)},
        9: {'spine': R(14, 22), 'upperarm.R': R(35), 'forearm.R': R(5), 'thigh.L': R(24), 'shin.L': R(-20),
            'hips': ((0, 10, 0), (0, -0.04, 0.06))},
        15: {},
    },
    # left-hand shield punch with the body behind it
    'ShieldBash': {
        4: {'spine': R(0, 18), 'upperarm.L': R(25), 'forearm.L': R(70)},
        7: {'spine': R(12, -22), 'upperarm.L': R(70), 'forearm.L': R(55), 'thigh.L': R(28), 'shin.L': R(-18),
            'hips': ((0, -8, 0), (0, -0.03, 0.1))},
        12: {},
    },
    # right claw: a fast wide rake, no weapon weight, so a shorter wind-up
    'ClawSwipe': {
        3: {'spine': R(0, -30), 'upperarm.R': R(110), 'forearm.R': R(80)},
        6: {'spine': R(18, 25), 'upperarm.R': R(25), 'forearm.R': R(15), 'thigh.L': R(22),
            'hips': ((0, 8, 0), (0, -0.04, 0.08))},
        12: {},
    },
    # both claws: right then left
    'DoubleClaw': {
        3: {'spine': R(0, -30), 'upperarm.R': R(110), 'forearm.R': R(80), 'upperarm.L': R(30)},
        6: {'spine': R(15, 25), 'upperarm.R': R(25), 'forearm.R': R(15), 'upperarm.L': R(110), 'forearm.L': R(80),
            'hips': ((0, 6, 0), (0, -0.03, 0.05))},
        10: {'spine': R(18, -25), 'upperarm.L': R(25), 'forearm.L': R(15), 'upperarm.R': R(60), 'forearm.R': R(60),
             'thigh.L': R(22), 'hips': ((0, -6, 0), (0, -0.04, 0.1))},
        17: {},
    },
    # empty right hand: a jab, cocked at the chest, then extended with the shoulder behind it
    'Punch': {
        3: {'spine': R(0, -15), 'upperarm.R': R(40), 'forearm.R': R(100)},
        6: {'spine': R(8, 20), 'upperarm.R': R(85), 'forearm.R': R(10), 'thigh.L': R(18),
            'hips': ((0, 8, 0), (0, -0.02, 0.06))},
        11: {},
    },
}


def bake_action(arm, name, frames, pose_fn, step=2):
    ad = arm.animation_data or arm.animation_data_create()
    act = bpy.data.actions.new(name)
    ad.action = act
    for f in list(range(0, frames, step)) + [frames]:
        for bone, (rot, loc) in pose_fn(f).items():
            pb = arm.pose.bones[bone]
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = [math.radians(a) for a in rot]
            pb.location = loc
            pb.keyframe_insert('rotation_euler', frame=f)
            pb.keyframe_insert('location', frame=f)
    track = ad.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    ad.action = None


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    build_body()
    build_human()
    build_claws()
    build_items()
    parts = join_groups()
    bake_grime(parts)  # before rigging, so AO is computed on the rest pose
    arm = build_armature()
    for o in parts.values():
        o.parent = arm
        o.modifiers.new('Armature', 'ARMATURE').object = arm
    bake_action(arm, 'Idle', 2 * FPS, idle_pose)
    bake_action(arm, 'Walk', FPS, walk_pose)
    for name, keys in ATTACKS.items():
        pose, length = keyed({0: {}, **keys})
        bake_action(arm, name, length, pose, step=1)
        if name in ('ClawSwipe', 'Punch'):
            bake_action(arm, name + 'L', length, mirror(pose), step=1)
    # Hunch: the idle rest pose plus HUNCH; the viewer makes it additive against Idle frame 0
    rest = idle_pose(0)
    add = lambda a, b: tuple(x + y for x, y in zip(a, b))
    hunch = {n: ((add(r, HUNCH[n][0]), add(l, HUNCH[n][1])) if n in HUNCH else (r, l)) for n, (r, l) in rest.items()}
    bake_action(arm, 'Hunch', 2, lambda f: hunch)
    tris = {n: sum(len(p.vertices) - 2 for p in o.data.polygons) for n, o in parts.items()}
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animation_mode='NLA_TRACKS', export_yup=True)
    print(f'MERCENARY: {tris} -> {OUT}')


if __name__ == '__main__':
    main()
