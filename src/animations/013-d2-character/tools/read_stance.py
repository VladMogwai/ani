# Reads the claw stance set by hand in tools/claw-stance.blend into tools/claw-stance.json, which
# tools/mercenary_ual.py then uses instead of the computed STANCE (rebuild both characters afterwards).
# Usage (from the animation folder):
#   /Applications/Blender.app/Contents/MacOS/Blender -b tools/claw-stance.blend --python tools/read_stance.py
import json, math
import bpy

rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
out = {
    'bones': {pb.name: [round(x, 5) for x in (*pb.rotation_quaternion, *pb.location)] for pb in rig.pose.bones},
    'targets': {o.name: [round(x, 4) for x in o.location] for o in bpy.data.objects if o.type == 'EMPTY'},
    'poles': {pb.name: round(math.degrees(c.pole_angle), 2) for pb in rig.pose.bones for c in pb.constraints if c.type == 'IK'},
}
# one bone / target per line, so a change reads well in a git diff
lines = ['{']
for i, (key, items) in enumerate(out.items()):
    lines.append(f'  "{key}": {{')
    lines.append(',\n'.join(f'    "{k}": {json.dumps(v)}' for k, v in items.items()))
    lines.append('  }' + (',' if i < len(out) - 1 else ''))
lines.append('}')
with open(bpy.path.abspath('//claw-stance.json'), 'w') as f:
    f.write('\n'.join(lines) + '\n')
print(f"STANCE: {len(out['bones'])} bones, {len(out['targets'])} targets -> tools/claw-stance.json")
