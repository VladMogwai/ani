# 001 — Abstract art piece with cloth simulation and mixed material

Source: https://youtu.be/F1DNdhFTXUw (Jean-Marc Denis, 19:42, Blender 3.4)
HDRI in the video: free "HDR Light Studio 25 Free Studio HDRI" pack, link in the video description (zip on S3).
Status: estimated, not built
Studied: 2026-10-28 (full auto-transcript + contact sheets of key frames)

## Estimate

**Technique ~90%, look of the final render ~70%.** No blockers: everything is free, only the built-in
Node Wrangler add-on is used.

| Chapter | Time | Estimate | Why |
|---|---|---|---|
| Cloth 1: stacked planes on spheres | 0:37–3:30 | 95% | all steps and values spoken |
| Cloth 2: ribbon | 3:30–4:25 | 90% | values spoken, ribbon size set by mouse |
| Cloth 3: stacked strips + wind/turbulence (used for the final) | 4:25–7:10 | 75% | settings exact, but force fields rotated/scaled "randomly"; folds will differ |
| World HDRI | 7:48–8:46 | 90% | pack download needs the user's OK; fallback: Poly Haven studio HDRI |
| Camera, background plane | 8:46–9:24 | 70% | angle chosen by eye |
| Mixing shaders: Fresnel, Layer Weight, Noise | 9:24–12:19 | 95% | node graph fully described |
| Material 1: pink with metallic dots | 12:19–14:23 | 90% | graph clear, colors sampled from frames |
| Material 2: glass with grid | 14:23–16:17 | 90% | almost all values given; texture rotation by eye |
| Tweaks at 10× speed, no narration | 16:40–19:12 | 50% | lights, glass fix, framing — frames only |

## Steps and parameters

### Cloth 1 (0:37)
- Plane, scale 4, edit mode Subdivide 20. Subdivision Surface modifier 2 → later 1, placed **before** Cloth.
- UV sphere = Collision. Plane = Cloth, preset Cotton, Self Collision on, Quality 6, collision steps 10.
- Apply scale (Ctrl A). Shade smooth.
- Stack: duplicate planes upward in side view, duplicate spheres; floor plane S10 as Collision.
- Join planes (Ctrl J), join spheres. Solidify modifier on planes, moved before Subdivision.
- Cache 70 frames, Bake.

### Cloth 2 — ribbon (3:29)
- Plane, rotate X 90, scale Z 30, loop cuts (Ctrl R) then 100 cuts.
- Solidify. Cloth: Quality steps 10, Tension and Compression 30, Shear 10, Bending 5.
  Self Collision on, quality 5. Floor plane = Collision, friction up.
- Shade smooth, Subdivision Surface 3.

### Cloth 3 — final simulation (4:25)
- Plane rotate X 90, scale 5, Subdivide 10, apply scale.
- Solidify, Array: offset X 0, Z up, count 8. Duplicate the setup (Shift D, Esc), move to a new collection.
- Apply modifiers, Origin to Geometry. Add Subdivision Surface.
- Cloth on. Scene gravity **off**.
- Force field Force: shape Line, strength −30 (pulls cloth inward), noise on, rotated, scaled.
- Force field Turbulence: shape Line, strength 20, noise on, scaled and rotated randomly.
- Self Collision on, quality up. Bake to frame 40 (not 250). Subdivision moved under Cloth.
- Then force strength tweaked and more frames baked. Shade smooth.

### World and camera (7:10)
- World: Environment Texture (Ctrl T via Node Wrangler) → Background color. Studio HDRI.
- Render → Film → Transparent. Camera on a chosen frame of the cache.
- Background: plane rotate X 90, scale 10, facing the camera, own material.

### Mixed material (9:24)
- Two Principled BSDF → Mix Shader → Material Output.
- Factor options shown: Fresnel → Color Ramp; Layer Weight (Facing) → Color Ramp;
  **used**: Noise Texture (with Mapping + Texture Coordinate) → Color Ramp (contrast crushed) → Factor.
  Noise: detail 0, scale tuned; later scale reduced ("looks like a cow").
- Material 1 (12:19): glossy, a bit rough. Voronoi (object coords) → Color Ramp (constant) = dots mask.
  Mix node in Color mode: pink A, white B → Base Color. Same mask → Invert → Metallic.
- Material 2 (14:23): Brick Texture (UV coords, rotated) → Bump → Normal. Frequency 1, Bias 1,
  Mortar size 0.01, Mortar smooth 0, Scale 60, brick width = row height via one Value node set to 1.
  Glass-like: Transmission up, Roughness down.

### Tweaks (16:40, sped up, silent)
Author's own critique before it: glass renders black (should be translucent), lighting blown out, framing and camera.
What changed has to be read from frames.

## Final render (from frames at 19:12)
Layered folded strips, warm peach/cream with a dark blue-grey band, soft studio light, light background.

## Notes for reproducing
- Blender 3.4 → newer: Mix node and Principled BSDF inputs renamed (e.g. Transmission → Transmission Weight in 4.x).
  Look nodes up by type, not by name.
- Cloth bakes via `bpy.ops.ptcache.bake` need a context override; bake only ~40–70 frames.
