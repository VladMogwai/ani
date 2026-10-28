"""Castle ruins on a hill: procedural scene for scene 015, rendered as one pre-rendered isometric map.

Run inside Blender (MCP or Text Editor):
    exec(compile(open(PATH).read(), PATH, 'exec'), {'__name__': '__main__'})
build() rebuilds the whole scene from scratch; render() writes assets/map.png;
export_3d() bakes the procedural colours and writes ../016-castle-ruins-3d/assets/ (ruins.glb, grass.bin, points.json).
Layout: camera looks along +Y, 30 degrees down (2:1 isometric); the castle square is turned 45 degrees,
so its walls run diagonally on screen.
"""
import json
import math
import os
import struct
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else ''
OUT = os.path.join(os.path.dirname(HERE), 'assets') if HERE else '/tmp'
OUT_3D = os.path.join(os.path.dirname(os.path.dirname(HERE)), '016-castle-ruins-3d', 'assets') if HERE else '/tmp'
GRASS = []  # (x, y, z, height) of every tuft, filled by build_nature, written by export_3d

CONFIG = {
    'seed': 7,
    'castle': Vector((0.0, 12.0)),
    'top': 8.0,  # plateau height, m
    'half': 9.0,  # half side of the curtain wall square (local frame)
    'road': [(6, -60), (8, -34), (-12, -26), (-14, -18), (6, -10), (16, -4), (10, 2), (6.4, 5.6)],
    'road_w': 1.7,
    'grid': (-42.0, 42.0, -62.0, 96.0, 0.5),  # x0, x1, y0, y1, step
    'course': 0.42,  # stone course height
    'render': (2560, 1920, 64.0),  # px, px, ortho width in m (40 px per m)
    'target': Vector((0.0, 2.0, 6.0)),
    'samples': 64,
    'grass': 20000,  # grass tufts
}

C = CONFIG['castle']
ANG = math.radians(45)


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def to_world(u, v):
    """Castle-local (u, v) to world xy."""
    c, s = math.cos(ANG), math.sin(ANG)
    return Vector((C.x + u * c - v * s, C.y + u * s + v * c))


# ---------- terrain ----------

def hill(x, y):
    d = (Vector((x, y)) - C).length
    return CONFIG['top'] * smoothstep(34, 14, d)


def rough(x, y):
    d = (Vector((x, y)) - C).length
    amp = 0.12 + 1.5 * smoothstep(13, 20, d)
    n = noise.fractal(Vector((x * 0.06, y * 0.06, 0.3)), 1.0, 2.0, 5)
    ridge = max(0.0, noise.noise(Vector((x * 0.13, y * 0.13, 1.7)))) * 3.0
    ridge *= smoothstep(14, 21, d) * smoothstep(40, 26, d) * (1.0 if x < 3 else 0.35)
    back = 9.0 * smoothstep(40, 80, y) + 4.0 * smoothstep(40, 80, y) * noise.noise(Vector((x * 0.04, 3.1, 0)))
    return n * amp + ridge + back


def road_nearest(x, y):
    p = Vector((x, y))
    best = (1e9, None)
    pts = [Vector(q) for q in CONFIG['road']]
    for a, b in zip(pts, pts[1:]):
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        q = a + ab * t
        d = (p - q).length
        if d < best[0]:
            best = (d, q)
    return best


def height(x, y):
    dist, q = road_nearest(x, y)
    h = hill(x, y) + rough(x, y)
    hr = hill(q.x, q.y) + 0.25 * rough(q.x, q.y)
    w = smoothstep(CONFIG['road_w'] + 7.0, CONFIG['road_w'], dist)
    return h * (1 - w) + hr * w


def road_mask(x, y):
    dist, _ = road_nearest(x, y)
    return smoothstep(CONFIG['road_w'] + 0.5, CONFIG['road_w'] - 0.6, dist)


def build_terrain(mat):
    x0, x1, y0, y1, st = CONFIG['grid']
    nx, ny = int((x1 - x0) / st) + 1, int((y1 - y0) / st) + 1
    verts, mask, yard = [], [], []
    for j in range(ny):
        for i in range(nx):
            x, y = x0 + i * st, y0 + j * st
            verts.append((x, y, height(x, y)))
            mask.append(road_mask(x, y))
            yard.append(1.0 if in_castle(x, y, -0.5) else 0.0)
    faces = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i)
             for j in range(ny - 1) for i in range(nx - 1)]
    me = bpy.data.meshes.new('Terrain')
    me.from_pydata(verts, [], faces)
    attr = me.attributes.new('road', 'FLOAT', 'POINT')
    attr.data.foreach_set('value', mask)
    me.attributes.new('yard', 'FLOAT', 'POINT').data.foreach_set('value', yard)
    me.shade_smooth()
    me.materials.append(mat)
    ob = bpy.data.objects.new('Terrain', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ---------- stones ----------

class Stones:
    def __init__(self):
        self.bm = bmesh.new()
        self.rand = self.bm.faces.layers.float.new('rand')

    def block(self, pos, size, rot):
        m = Matrix.Translation(pos) @ rot.to_4x4() @ Matrix.Diagonal(Vector((*size, 1.0)))
        vs = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)['verts']
        r = random.random()
        for f in {f for v in vs for f in v.link_faces}:
            f[self.rand] = r

    def rubble(self, x, y, n, spread, size=0.5):
        for _ in range(n):
            a, rr = random.uniform(0, math.tau), spread * math.sqrt(random.random())
            px, py = x + math.cos(a) * rr, y + math.sin(a) * rr
            if road_nearest(px, py)[0] > CONFIG['road_w']:
                s = size * random.uniform(0.6, 1.3)
                z = height(px, py) + s * 0.2
                rot = Matrix.Rotation(random.uniform(0, math.tau), 3, 'Z') @ Matrix.Rotation(random.uniform(-0.6, 0.6), 3, 'X')
                self.block(Vector((px, py, z)), (s * random.uniform(1.0, 1.8), s, s * 0.8), rot)

    def to_object(self, name, mat):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        bev = ob.modifiers.new('Bevel', 'BEVEL')
        bev.width, bev.segments, bev.limit_method = 0.05, 2, 'NONE'
        return ob


def in_castle(x, y, margin=0.0):
    p = Vector((x, y)) - C
    c, s = math.cos(-ANG), math.sin(-ANG)
    u, v = p.x * c - p.y * s, p.x * s + p.y * c
    return abs(u) < CONFIG['half'] + margin and abs(v) < CONFIG['half'] + margin


def in_castle_or_road(x, y, margin=1.0):
    return in_castle(x, y, margin + 0.5) or road_nearest(x, y)[0] < CONFIG['road_w'] + margin


def wall(st, a, b, H, thick=1.5, cuts=(), holes=(), merlons=False):
    """Straight wall from local a to b. cuts: (t, half_width, height) lower the top (breaches);
    holes: (t0, t1, z0, z1) openings (gate, windows), t and z relative to the wall start / base."""
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    d = (b - a).normalized()
    pa, pb = to_world(*a), to_world(*b)
    wd = (pb - pa).normalized()
    rot_z = math.atan2(wd.y, wd.x)
    ch = CONFIG['course']
    seed = random.random() * 100

    def top(t):
        h = H * (0.9 + 0.12 * noise.noise(Vector((t * 0.35, seed, 0))))
        for c, w, hh in cuts:
            k = abs(t - c) / w
            if k < 1:
                h = min(h, hh + (h - hh) * k * k)
        return h

    removed = 0
    below = None  # kept (t0, t1) of the course below; None for the first course
    for k in range(int(H / ch) + 3):
        z0 = -0.8 + k * ch
        kept = []
        # the course right above an opening rests on a lintel across it
        # (only while both jambs still stand)
        lintels = [(h0, h1) for h0, h1, _, z_1 in holes if z_1 <= z0 + 1e-6 < z_1 + ch and below
                   and any(a <= h0 - 0.2 and b >= h0 - 0.05 for a, b in below)
                   and any(a <= h1 + 0.05 and b >= h1 + 0.2 for a, b in below)]
        t = -random.uniform(0, 0.4) if k % 2 else 0.0
        while t < L:
            bl = random.uniform(0.5, 0.95)
            t1 = min(L, t + bl)
            tc = (t + t1) / 2
            zt = z0 + ch
            skip = zt > top(tc) or (zt > top(tc) - 1.6 * ch and random.random() < 0.4)
            skip |= any(h0 <= tc <= h1 and z0 >= z_0 - 0.1 and z0 < z_1 for h0, h1, z_0, z_1 in holes)
            if merlons and not skip and zt > H - ch * 0.5 and int(tc / 0.9) % 2:
                skip = True
            if not skip and below is not None:
                support = sum(max(0.0, min(t1, b) - max(t, a)) for a, b in below + lintels)
                skip = support < 0.35 * (t1 - t)
            if t1 - t > 0.15 and not skip:
                kept.append((t, t1))
                p = to_world(*(a + d * tc))
                base = height(p.x, p.y)
                jitter = Matrix.Rotation(rot_z + random.uniform(-0.04, 0.04), 3, 'Z')
                off = Vector((-wd.y, wd.x)) * random.uniform(-0.05, 0.05)
                st.block(Vector((p.x + off.x, p.y + off.y, base + z0 + ch / 2)),
                         ((t1 - t) * 0.97, thick * random.uniform(0.92, 1.0), ch * 0.94), jitter)
            elif z0 > 0:
                removed += 1
            t = t1
        below = kept
    # fallen stones at the foot, more where the wall is broken
    for c, w, hh in cuts:
        p = to_world(*(a + d * c))
        nrm = Vector((-wd.y, wd.x))
        for side in (1, -1):
            q = p + nrm * side * 2.2
            st.rubble(q.x, q.y, int(10 + w * 6), w + 1.5)
    for _ in range(removed // 10):
        p = to_world(*(a + d * random.uniform(0, L)))
        nrm = Vector((-wd.y, wd.x)) * random.choice((1, -1)) * random.uniform(1.2, 3.0)
        st.rubble(p.x + nrm.x, p.y + nrm.y, 1, 0.5)


def tower(st, u, v, R, H, gap_angle=None, gap_half=0.0, gap_h=0.0, thick=1.1):
    """Round tower at local (u, v); gap_angle (world radians) is a collapsed sector."""
    cxy = to_world(u, v)
    ch = CONFIG['course']
    seed = random.random() * 100
    n = max(8, int(math.tau * R / 0.75))
    below = None
    for k in range(int(H / ch) + 3):
        z0 = -0.8 + k * ch
        off = (k % 2) * 0.5
        kept = set()
        for i in range(n):
            if below is not None:
                under = (i, (i + 1) % n) if k % 2 else ((i - 1) % n, i)
                if not any(j in below for j in under):
                    continue
            ang = (i + off) / n * math.tau
            h = H * (0.88 + 0.14 * noise.noise(Vector((math.cos(ang) * 2, math.sin(ang) * 2, seed))))
            if gap_angle is not None:
                da = abs((ang - gap_angle + math.pi) % math.tau - math.pi)
                if da < gap_half:
                    kk = da / gap_half
                    h = min(h, gap_h + (h - gap_h) * kk * kk)
            zt = z0 + ch
            if zt > h or (zt > h - 1.6 * ch and random.random() < 0.4):
                continue
            kept.add(i)
            p = cxy + Vector((math.cos(ang), math.sin(ang))) * R
            base = height(cxy.x, cxy.y)
            st.block(Vector((p.x, p.y, base + z0 + ch / 2)),
                     (math.tau * R / n * 0.96, thick, ch * 0.94), Matrix.Rotation(ang + math.pi / 2, 3, 'Z'))
        below = kept
    if gap_angle is not None:
        q = cxy + Vector((math.cos(gap_angle), math.sin(gap_angle))) * (R + 2.0)
        st.rubble(q.x, q.y, 40, 3.0)


def build_castle(stone_mat):
    st = Stones()
    h = CONFIG['half']
    cam_dir = -math.pi / 2  # world angle pointing at the camera
    # front-right wall (faces the camera, low and broken, with the gate)
    wall(st, (-h, -h), (h, -h), 5.2, cuts=[(4.0, 3.0, 1.2), (14.5, 2.0, 2.0)], holes=[(7.4, 10.6, 0.0, 3.4)])
    # front-left wall (faces the camera, mostly collapsed)
    wall(st, (-h, -h), (-h, h), 3.0, cuts=[(6.0, 4.0, 0.3), (13.5, 2.5, 1.4)])
    # back walls: tall, with merlons and a breach
    wall(st, (-h, h), (h, h), 6.0, cuts=[(11.0, 2.0, 2.5)], merlons=True)
    wall(st, (h, -h), (h, h), 5.5, cuts=[(5.0, 2.5, 1.0)], merlons=True)
    # corner towers
    tower(st, -h, -h, 2.6, 9.5, cam_dir, 1.3, 1.5)
    tower(st, h, -h, 2.4, 2.2)
    tower(st, -h, h, 2.4, 3.8, cam_dir, 1.0, 0.6)
    tower(st, h, h, 2.8, 11.0, cam_dir, 0.8, 4.0)
    # keep inside, against the back corner, no roof, window openings
    ku, kv, kw, kd = 3.0, 3.0, 3.5, 3.0
    wall(st, (ku - kw, kv - kd), (ku + kw, kv - kd), 4.0, 0.9, cuts=[(2.0, 2.0, 0.6)], holes=[(4.6, 5.6, 1.8, 3.0)])
    wall(st, (ku - kw, kv - kd), (ku - kw, kv + kd), 3.2, 0.9, cuts=[(3.5, 2.0, 1.0)], holes=[(2.4, 3.8, 0.0, 2.4)])
    wall(st, (ku - kw, kv + kd), (ku + kw, kv + kd), 7.5, 0.9, holes=[(2.0, 3.0, 4.2, 5.8), (4.8, 5.8, 4.2, 5.8)])
    wall(st, (ku + kw, kv - kd), (ku + kw, kv + kd), 7.0, 0.9, cuts=[(1.0, 1.5, 4.0)], holes=[(2.6, 3.6, 4.2, 5.8)])
    # stones that rolled down the slope in front
    for _ in range(9):
        p = to_world(random.uniform(-h - 5, -h - 1), random.uniform(-h, h)) if random.random() < 0.5 else \
            to_world(random.uniform(-h, h), random.uniform(-h - 5, -h - 1))
        st.rubble(p.x, p.y, 5, 1.5)
    return st.to_object('Ruins', stone_mat)


# ---------- nature ----------

def rock(bm, pos, r):
    vs = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r,
                                    matrix=Matrix.Translation(pos) @ Matrix.Rotation(random.uniform(0, 6), 4, 'Z'))['verts']
    s = Vector((random.uniform(0, 50), random.uniform(0, 50), 0))
    sx, sy, sz = random.uniform(0.9, 1.6), random.uniform(0.7, 1.1), random.uniform(0.4, 0.7)
    # a slanted cut plane gives each rock a flat broken face
    cut = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(0.3, 1))).normalized()
    for v in vs:
        o = v.co - pos
        o *= 1 + 0.45 * noise.noise(o * (1.1 / r) + s)
        k = o.dot(cut) - r * 0.45
        if k > 0:
            o -= cut * k
        v.co = pos + Vector((o.x * sx, o.y * sy, max(o.z, -r * 0.4) * sz))


def branch(bm, start, direction, length, radius, depth, tips):
    end = start + direction * length
    rot = direction.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=6, radius1=radius, radius2=radius * 0.65, depth=length,
                          matrix=Matrix.Translation((start + end) / 2) @ rot)
    if depth == 0:
        tips.append(end)
        return
    for _ in range(random.randint(2, 3)):
        rv = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.2, 0.6)))
        nd = (direction + rv * 0.85 + Vector((0, 0, 0.15))).normalized()
        branch(bm, end - direction * random.uniform(0, 0.25) * length, nd,
               length * random.uniform(0.55, 0.75), radius * 0.62, depth - 1, tips)


def blob(bm, pos, r):
    vs = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r, matrix=Matrix.Translation(pos))['verts']
    s = Vector((random.uniform(0, 50), 0, random.uniform(0, 50)))
    for v in vs:
        o = v.co - pos
        v.co = pos + o * (1 + 0.28 * noise.noise(o * (2.2 / r) + s)) * Vector((1, 1, 0.8))


def tuft(bm, pos, hgt):
    for _ in range(4):
        a = random.uniform(0, math.tau)
        w = hgt * 0.22
        lean = Vector((math.cos(a), math.sin(a), 0)) * hgt * random.uniform(0.2, 0.6)
        side = Vector((-math.sin(a), math.cos(a), 0)) * w
        v1 = bm.verts.new(pos - side)
        v2 = bm.verts.new(pos + side)
        v3 = bm.verts.new(pos + lean + Vector((0, 0, hgt)))
        bm.faces.new((v1, v2, v3))


def spot(tries=200, accept=lambda x, y, h: True):
    x0, x1, y0, y1, _ = CONFIG['grid']
    for _ in range(tries):
        x, y = random.uniform(x0 + 4, x1 - 4), random.uniform(y0 + 6, y1 - 4)
        if in_castle_or_road(x, y):
            continue
        h = height(x, y)
        if accept(x, y, h):
            return x, y, h
    return None


def build_nature(mats):
    rocks, bark, leaves = bmesh.new(), bmesh.new(), bmesh.new()
    d_c = lambda x, y: (Vector((x, y)) - C).length
    # rocks: mostly on the steep ring of the hill and the left ridge
    for _ in range(75):
        s = spot(accept=lambda x, y, h: 13 < d_c(x, y) < 32 or random.random() < 0.1)
        if s:
            x, y, h = s
            big = random.random() < 0.2
            r = random.uniform(1.0, 1.8) if big else random.uniform(0.2, 0.6)
            rock(rocks, Vector((x, y, h - r * 0.3)), r)
            for _ in range(0 if big else random.randint(0, 3)):  # small stones around
                rr = random.uniform(0.1, 0.25)
                q = Vector((x + random.uniform(-1.2, 1.2), y + random.uniform(-1.2, 1.2), 0))
                q.z = height(q.x, q.y) - rr * 0.3
                rock(rocks, q, rr)
    # dead trees on the slopes, a few gnarled living ones lower down
    for i in range(34):
        living = i < 12
        s = spot(accept=lambda x, y, h: (d_c(x, y) > 26) if living else (d_c(x, y) > 14))
        if not s:
            continue
        x, y, h = s
        tips = []
        trunk = random.uniform(2.2, 3.6) * (1.2 if living else 1.0)
        lean = Vector((random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), 1)).normalized()
        branch(bark, Vector((x, y, h - 0.3)), lean, trunk, random.uniform(0.18, 0.3), 3, tips)
        if living:
            for t in tips:
                blob(leaves, t + Vector((0, 0, 0.2)), random.uniform(0.7, 1.1))
    # bushes
    for _ in range(90):
        s = spot(accept=lambda x, y, h: d_c(x, y) > 13)
        if s:
            x, y, h = s
            for _ in range(random.randint(1, 3)):
                r = random.uniform(0.35, 0.8)
                blob(leaves, Vector((x + random.uniform(-0.6, 0.6), y + random.uniform(-0.6, 0.6), h + r * 0.4)), r)
    grass = bmesh.new()
    x0, x1, y0, y1, _ = CONFIG['grid']
    placed = 0
    while placed < CONFIG['grass']:
        x, y = random.uniform(x0, x1), random.uniform(y0, 60)
        if road_nearest(x, y)[0] < CONFIG['road_w'] + 0.3 or in_castle(x, y, -1.0):
            continue
        # clumps: denser where low-frequency noise is high
        if noise.noise(Vector((x * 0.15, y * 0.15, 5.0))) < random.uniform(-0.6, 0.6):
            continue
        h = height(x, y)
        th = random.uniform(0.12, 0.32)
        tuft(grass, Vector((x, y, h - 0.03)), th)
        GRASS.append((x, y, h - 0.03, th))
        placed += 1
    out = []
    for name, bm, mat in (('Rocks', rocks, mats['rock']), ('Trees', bark, mats['bark']), ('Leaves', leaves, mats['leaves']),
                          ('Grass', grass, mats['grass'])):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        if name != 'Trees':
            me.shade_smooth()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        out.append(ob)
    return out


# ---------- materials ----------

def sock(n, key):
    for s in n.inputs:
        if s.identifier == key:
            return s
    return n.inputs[key]


def osock(n, key):
    for s in n.outputs:
        if s.identifier == key:
            return s
    return n.outputs[key]


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return m, nt, next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')


def mix(nt, fac, a, b):
    n = nt.nodes.new('ShaderNodeMix')
    n.data_type = 'RGBA'
    for key, val in (('Factor_Float', fac), ('A_Color', a), ('B_Color', b)):
        if isinstance(val, (tuple, list)):
            sock(n, key).default_value = (*val, 1.0) if len(val) == 3 else val
        elif isinstance(val, (int, float)):
            sock(n, key).default_value = val
        else:
            nt.links.new(val, sock(n, key))
    return osock(n, 'Result_Color')


def tex_noise(nt, coord, scale, detail=6.0, rough=0.55):
    n = nt.nodes.new('ShaderNodeTexNoise')
    sock(n, 'Scale').default_value = scale
    sock(n, 'Detail').default_value = detail
    sock(n, 'Roughness').default_value = rough
    nt.links.new(coord, sock(n, 'Vector'))
    return osock(n, 'Fac')


def ramp(nt, val, a, b):
    n = nt.nodes.new('ShaderNodeMapRange')
    sock(n, 'From Min').default_value = a
    sock(n, 'From Max').default_value = b
    nt.links.new(val, sock(n, 'Value'))
    return osock(n, 'Result')


def bump(nt, bsdf, height_out, strength):
    n = nt.nodes.new('ShaderNodeBump')
    sock(n, 'Strength').default_value = strength
    nt.links.new(height_out, sock(n, 'Height'))
    nt.links.new(osock(n, 'Normal'), sock(bsdf, 'Normal'))


def normal_z(nt):
    g = nt.nodes.new('ShaderNodeNewGeometry')
    s = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(osock(g, 'Normal'), sock(s, 'Vector'))
    return osock(s, 'Z')


def obj_coord(nt):
    return osock(nt.nodes.new('ShaderNodeTexCoord'), 'Object')


def build_materials():
    mats = {}
    # ground: dry grass / dirt patches, rock on steep slopes, a rutted dirt road
    m, nt, bsdf = new_mat('Ground')
    co = obj_coord(nt)
    big, fine, grain = tex_noise(nt, co, 0.12, 4), tex_noise(nt, co, 1.6, 8), tex_noise(nt, co, 9.0, 4)
    mid = tex_noise(nt, co, 0.5, 6)
    grass = mix(nt, fine, (0.075, 0.075, 0.035), (0.13, 0.12, 0.06))
    grass = mix(nt, ramp(nt, mid, 0.45, 0.62), grass, (0.15, 0.13, 0.07))
    dirt = mix(nt, grain, (0.1, 0.075, 0.05), (0.17, 0.125, 0.08))
    base = mix(nt, ramp(nt, big, 0.5, 0.62), grass, dirt)
    steep = ramp(nt, normal_z(nt), 0.78, 0.62)
    rockc = mix(nt, fine, (0.16, 0.15, 0.135), (0.24, 0.23, 0.21))
    base = mix(nt, steep, base, rockc)
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'road'
    roadc = mix(nt, grain, (0.17, 0.13, 0.085), (0.24, 0.185, 0.12))
    base = mix(nt, osock(attr, 'Fac'), base, roadc)
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'DISTANCE_TO_EDGE'
    sock(vor, 'Scale').default_value = 1.1
    nt.links.new(co, sock(vor, 'Vector'))
    seams = ramp(nt, osock(vor, 'Distance'), 0.02, 0.06)
    flags = mix(nt, seams, (0.06, 0.055, 0.045), mix(nt, fine, (0.15, 0.14, 0.12), (0.22, 0.2, 0.17)))
    yattr = nt.nodes.new('ShaderNodeAttribute')
    yattr.attribute_name = 'yard'
    yf = nt.nodes.new('ShaderNodeMath')
    yf.operation = 'MULTIPLY'
    nt.links.new(osock(yattr, 'Fac'), yf.inputs[0])
    nt.links.new(ramp(nt, big, 0.35, 0.5), yf.inputs[1])  # flagstones survive in patches
    nt.links.new(mix(nt, yf.outputs[0], base, flags), sock(bsdf, 'Base Color'))
    sock(bsdf, 'Roughness').default_value = 0.95
    bump(nt, bsdf, fine, 0.35)
    mats['ground'] = m

    # stone: per-block tint from the 'rand' face attribute, moss on top faces
    def stone(name, lo, hi):
        m, nt, bsdf = new_mat(name)
        co = obj_coord(nt)
        attr = nt.nodes.new('ShaderNodeAttribute')
        attr.attribute_name = 'rand'
        f = tex_noise(nt, co, 3.0, 8)
        c = mix(nt, osock(attr, 'Fac'), lo, hi)
        c = mix(nt, 0.35, c, mix(nt, f, (0.1, 0.095, 0.085), (0.3, 0.28, 0.25)))
        moss = ramp(nt, normal_z(nt), 0.55, 0.9)
        mf = nt.nodes.new('ShaderNodeMath')
        mf.operation = 'MULTIPLY'
        nt.links.new(moss, mf.inputs[0])
        nt.links.new(ramp(nt, tex_noise(nt, co, 1.2, 4), 0.4, 0.65), mf.inputs[1])
        c = mix(nt, mf.outputs[0], c, (0.075, 0.085, 0.035))
        nt.links.new(c, sock(bsdf, 'Base Color'))
        sock(bsdf, 'Roughness').default_value = 0.92
        bump(nt, bsdf, tex_noise(nt, co, 7.0, 8), 0.5)
        return m
    mats['stone'] = stone('Stone', (0.2, 0.185, 0.16), (0.33, 0.3, 0.26))
    mats['rock'] = stone('Rock', (0.17, 0.165, 0.155), (0.27, 0.26, 0.24))

    m, nt, bsdf = new_mat('Bark')
    sock(bsdf, 'Base Color').default_value = (0.075, 0.062, 0.05, 1)
    sock(bsdf, 'Roughness').default_value = 0.95
    mats['bark'] = m

    m, nt, bsdf = new_mat('Leaves')
    co = obj_coord(nt)
    nt.links.new(mix(nt, tex_noise(nt, co, 2.5, 6), (0.04, 0.05, 0.02), (0.1, 0.1, 0.04)), sock(bsdf, 'Base Color'))
    sock(bsdf, 'Roughness').default_value = 0.85
    bump(nt, bsdf, tex_noise(nt, co, 6.0, 6), 0.8)
    mats['leaves'] = m

    m, nt, bsdf = new_mat('Grass')
    co = obj_coord(nt)
    nt.links.new(mix(nt, tex_noise(nt, co, 0.4, 4), (0.16, 0.15, 0.07), (0.3, 0.26, 0.13)), sock(bsdf, 'Base Color'))
    sock(bsdf, 'Roughness').default_value = 0.9
    mats['grass'] = m
    return mats


# ---------- camera, light, render ----------

def build_camera_light():
    sc = bpy.context.scene
    cam = bpy.data.cameras.new('Cam')
    cam.type = 'ORTHO'
    w, h, ortho = CONFIG['render']
    cam.ortho_scale = ortho
    cam.clip_end = 500
    co = bpy.data.objects.new('Cam', cam)
    co.rotation_euler = (math.radians(60), 0, 0)
    fwd = Vector((0, math.sin(math.radians(60)), -math.cos(math.radians(60))))
    co.location = CONFIG['target'] - fwd * 150
    sc.collection.objects.link(co)
    sc.camera = co
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100

    sun = bpy.data.lights.new('Sun', 'SUN')
    sun.energy = 3.6
    sun.color = (1.0, 0.9, 0.78)
    sun.angle = math.radians(1.5)
    so = bpy.data.objects.new('Sun', sun)
    so.rotation_euler = Vector((0.6, -0.42, -0.62)).normalized().to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(so)

    world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    sc.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (0.42, 0.47, 0.56, 1)
    bg.inputs[1].default_value = 0.7


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def build():
    random.seed(CONFIG['seed'])
    GRASS.clear()
    clear()
    mats = build_materials()
    build_terrain(mats['ground'])
    build_castle(mats['stone'])
    build_nature(mats)
    build_camera_light()


def use_cycles():
    sc = bpy.context.scene
    try:
        sc.render.engine = 'CYCLES'
    except TypeError as e:
        print(e)
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e:  # noqa: BLE001 - CPU fallback is fine
        print('GPU off:', e)


def render(path=None, samples=None):
    sc = bpy.context.scene
    use_cycles()
    sc.cycles.samples = samples or CONFIG['samples']
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError as e:
        print(e)
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = path or os.path.join(OUT, 'map.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    build()


def floating():
    """Stone blocks that touch neither the ground nor a block below them; run after build()."""
    from mathutils import kdtree
    vs = bpy.data.objects['Ruins'].data.vertices
    blocks = []
    for b in range(len(vs) // 8):  # create_cube makes 8 verts per block, in order
        cs = [vs[b * 8 + i].co.copy() for i in range(8)]
        cx, cy = sum(c.x for c in cs) / 8, sum(c.y for c in cs) / 8
        r = max(Vector((c.x - cx, c.y - cy)).length for c in cs)
        blocks.append((cx, cy, min(c.z for c in cs), max(c.z for c in cs), r, cs))
    kd = kdtree.KDTree(len(blocks))
    for i, b in enumerate(blocks):
        kd.insert((b[0], b[1], b[2]), i)
    kd.balance()
    bad = []
    for i, (cx, cy, z0, z1, r, cs) in enumerate(blocks):
        if min(c.z - height(c.x, c.y) for c in cs) < 0.05:
            continue
        held = any(j != i and blocks[j][3] >= z0 - 0.15 and blocks[j][2] < z0
                   and Vector((blocks[j][0] - cx, blocks[j][1] - cy)).length < r + blocks[j][4] * 0.8
                   for _, j, _ in kd.find_range((cx, cy, z0), 1.6))
        if not held:
            bad.append((round(cx, 1), round(cy, 1), round(z0 - height(cx, cy), 2)))
    return bad


# ---------- export for the real-time 3D scene (016) ----------

def to_three(x, y, z):
    """Blender Z-up to glTF / three.js Y-up."""
    return [round(x, 3), round(z, 3), round(-y, 3)]


def select_only(ob):
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob


def baked_material(name, image=None):
    m, nt, bsdf = new_mat(name)
    if image:
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = image
        nt.links.new(n.outputs['Color'], sock(bsdf, 'Base Color'))
    else:
        n = nt.nodes.new('ShaderNodeVertexColor')
        n.layer_name = 'Col'
        nt.links.new(n.outputs['Color'], sock(bsdf, 'Base Color'))
    sock(bsdf, 'Roughness').default_value = 0.92
    return m


def export_3d(out=None, tex=(2048, 4096)):
    out = out or OUT_3D
    os.makedirs(out, exist_ok=True)
    sc = bpy.context.scene
    use_cycles()
    sc.cycles.samples = 8
    objs = {o.name: o for o in sc.objects}

    # grass is drawn by the page (instanced, swaying), only its positions go out
    with open(os.path.join(out, 'grass.bin'), 'wb') as f:
        for x, y, z, h in GRASS:
            f.write(struct.pack('<4f', *to_three(x, y, z), h))
    bpy.data.objects.remove(objs.pop('Grass'), do_unlink=True)

    # bevels become real geometry (one segment keeps the vertex count sane)
    dg = bpy.context.evaluated_depsgraph_get()
    ob = objs['Ruins']
    ob.modifiers['Bevel'].segments = 1
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    ob.data = me

    # terrain: planar UVs, procedural colour baked into one image
    t = objs['Terrain']
    x0, x1, y0, y1, _ = CONFIG['grid']
    uv = t.data.uv_layers.new(name='UV')
    vs = t.data.vertices
    for loop in t.data.loops:
        co = vs[loop.vertex_index].co
        uv.data[loop.index].uv = ((co.x - x0) / (x1 - x0), (co.y - y0) / (y1 - y0))
    img = bpy.data.images.new('TerrainColor', *tex)
    nt = t.data.materials[0].node_tree
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = img
    nt.nodes.active = n
    select_only(t)
    sc.render.bake.target = 'IMAGE_TEXTURES'
    sc.render.bake.margin = 4
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
    t.data.materials[0] = baked_material('TerrainBaked', img)

    # everything else: colour baked into vertex colours
    sc.render.bake.target = 'VERTEX_COLORS'
    for name in ('Ruins', 'Rocks', 'Trees', 'Leaves'):
        o = objs[name]
        ca = o.data.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        o.data.color_attributes.active_color = ca
        select_only(o)
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
        o.data.materials[0] = baked_material(name + 'Baked')

    for o in sc.objects:
        o.select_set(o.type == 'MESH')
    kw = dict(filepath=os.path.join(out, 'ruins.glb'), export_format='GLB', use_selection=True, export_apply=True,
              export_cameras=False, export_lights=False, export_vertex_color='MATERIAL', export_image_format='WEBP')
    bpy.ops.export_scene.gltf(**kw)

    # where the page puts torches and aims the camera
    h = CONFIG['half']
    def ground(u, v, up):
        p = to_world(u, v)
        return to_three(p.x, p.y, height(p.x, p.y) + up)
    points = {
        'castle': to_three(C.x, C.y, CONFIG['top']),
        'torches': [ground(-1.9, -h - 1.2, 0), ground(1.9, -h - 1.2, 0), ground(3.0, 3.0, 0),
                    ground(-4.5, 5.5, 0), ground(5.5, -4.0, 0)],
        'size': [x1 - x0, y1 - y0],
    }
    with open(os.path.join(out, 'points.json'), 'w') as f:
        json.dump(points, f, indent=1)
    print('exported', len(GRASS), 'tufts')
