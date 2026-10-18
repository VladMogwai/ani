# Builds houses from Quaternius Medieval Village modules (pack `village`) and writes them into a level's props.
# Usage: python3 tools/houses.py levels/<id>.json '{"<prop index>": [modules x, modules z, storeys, "stone"|"plaster"]}'
# The prop keeps its cell, size and the rotation of its first part (door on +z at rot 0, on +x at rot 90).
# Roofs exist for 2x2, 3x2, 2x3 and 3x3 modules. One module = 2 m = 4 units = 2 cells at scale 2.
import json, math, sys
K = 2; M = 2 * K; S = 3 * K  # pack scale, module width, storey height (units)

def rotate(x, z, deg):
    a = math.radians(deg)
    return x * math.cos(a) + z * math.sin(a), -x * math.sin(a) + z * math.cos(a)

def house(nx, nz, storeys, door_rot, style):
    # local: door on +z; walls as (model, window model or None)
    parts = []
    hx, hz = nx * M / 2, nz * M / 2
    def add(m, x, y, z, r=0):
        parts.append((m, x, y, z, r))
    xs = [(i - (nx - 1) / 2) * M for i in range(nx)]
    zs = [(i - (nz - 1) / 2) * M for i in range(nz)]
    for y in range(storeys):
        Y = y * S
        ground = y == 0
        mat = 'UnevenBrick' if (ground and style != 'plaster') else 'Plaster'
        straight = f'Wall_{mat}_Straight'
        fancy = 'Wall_Plaster_WoodGrid' if not (ground and style != 'plaster') else straight
        for x in xs:
            for z in zs: add('Floor_WoodDark', x, Y, z)
        faces = [(0, xs, hz, 'front'), (180, xs, -hz, 'back'), (90, zs, hx, 'right'), (270, zs, -hx, 'left')]
        for r, ps, d, name in faces:
            for i, p in enumerate(ps):
                x, z = (p, d) if r in (0, 180) else (d, -p if r == 90 else p)
                if ground and name == 'front' and i == 0:
                    add(f'Wall_{mat}_Door_Round', x, Y, z, r); add('Door_1_Round', x, Y, z, r)
                elif name in ('front', 'right') and i % 2 == (1 if name == 'front' else 0):
                    w = 'Wide_Round' if ground else 'Wide_Flat'
                    add(f'Wall_{mat}_Window_{w}', x, Y, z, r); add(f'Window_{w}1', x, Y, z, r)
                elif name == 'left' and i % 2 == 1 and not ground:
                    add('Wall_Plaster_Window_Thin_Round', x, Y, z, r); add('Window_Thin_Round1', x, Y, z, r)
                else:
                    add(fancy if (name in ('front', 'right', 'left') and not ground) else straight, x, Y, z, r)
        corner = 'Corner_Exterior_Brick' if mat == 'UnevenBrick' else 'Corner_Exterior_Wood'
        for cx, cz, r in ((hx, hz, 0), (-hx, hz, 270), (hx, -hz, 90), (-hx, -hz, 180)):
            add(corner, cx, Y, cz, r)
    top = storeys * S
    roofs = {(2, 2): ('Roof_RoundTiles_4x4', 0, 'Roof_Front_Brick4'), (3, 3): ('Roof_RoundTiles_6x6', 0, 'Roof_Front_Brick6'),
             (3, 2): ('Roof_RoundTiles_4x6', 90, 'Roof_Front_Brick4'), (2, 3): ('Roof_RoundTiles_4x6', 0, 'Roof_Front_Brick4')}
    roof, rr, front = roofs[(nx, nz)]
    add(roof, 0, top, 0, rr)
    if rr == 0:
        add(front, 0, top, hz, 0); add(front, 0, top, -hz, 180)
    else:
        add(front, hx, top, 0, 90); add(front, -hx, top, 0, 270)
    add('Prop_Chimney', xs[-1], top + 1.5 * K, zs[0])
    out = []
    for m, x, y, z, r in parts:
        X, Z = rotate(x, z, door_rot)
        out.append({'model': 'village/' + m, 'offset': [round(X, 3), y, round(Z, 3)], 'rot': (r + door_rot) % 360, 'scale': K})
    return out

if __name__ == '__main__':
    path = sys.argv[1]
    plan = json.loads(sys.argv[2])  # {prop index: [nx, nz, storeys, style]}
    l = json.load(open(path))
    for i, (nx, nz, st, style) in plan.items():
        p = l['props'][int(i)]
        rot = p['parts'][0].get('rot', 0)
        p['parts'] = house(nx, nz, st, rot, style)
    json.dump(l, open(path, 'w'), indent=2)
