# 016 — Castle ruins 3D

Source: variant of [015-castle-ruins](../015-castle-ruins/NOTES.md): the same Blender scene, but real-time 3D.
Engine: three
Status: draft

## Effect
The castle ruins on a hill as a real-time scene: orbit around (drag), zoom (wheel / pinch), pan (right drag /
two fingers), the target stays over the map. Day / Dusk / Night buttons move the sun and fade sky, fog and
ambient light over ~1.5 s; from dusk on, five torches light up (point lights, flicker, glow sprites).
Grass tufts sway in the wind. Real shadows from the sun.

## Implementation
- Built by `../015-castle-ruins/tools/build_ruins.py`: in Blender `build()` then `export_3d()`. Export bakes the
  procedural Cycles colours (DIFFUSE colour pass): terrain into a 2048x4096 image on planar UVs, ruins / rocks /
  trees / leaves into vertex colours; the bevel becomes geometry (1 segment). Writes `assets/ruins.glb`,
  `assets/grass.bin` (20000 x [x, y, z, height] float32, three.js coordinates) and `assets/points.json`
  (castle centre, torch positions).
- Then compress: `npx -y @gltf-transform/cli@4 optimize ruins.glb ruins.opt.glb --compress meshopt
  --texture-compress webp --simplify false --join false --instance false` and replace ruins.glb (32 MB → 5.6 MB).
  drei's `useGLTF` decodes meshopt with three's bundled decoder (no CDN).
- Grass: one InstancedMesh (4 crossed triangles per tuft), MeshLambertMaterial patched in `onBeforeCompile` for wind.
- Lighting: hemisphere + directional sun (4096 shadow map over ±55 m); `CONFIG.times` holds every preset, eased per frame.
- Reduced motion: no wind, no flicker, instant switch, no orbit damping.

## Preferences

## Open questions
- Is the free orbit wanted, or a fixed isometric angle with only rotation in 90-degree steps?
- Baked colours lose the bump detail of the Cycles render; normal maps would need a bake too.

## Changelog
- 2026-10-28: first version
- 2026-10-28: re-exported after the floating-stones fix in the 015 script
