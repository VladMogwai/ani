# 003 — 2D fluid simulation in Geometry Nodes, points carried by the flow

Source: https://youtu.be/l_vnAz0Yo8w (Bad Normals, "New CRAZY fluid simulations in Blender!", 39:21, Blender 4.x)
Status: reproduced (Blender 5.2, scene `FluidSim` in `002-003-abstract-rings-fluid.blend`; simulation not baked, play from frame 1)
Studied: 2026-10-29 (full auto-transcript + frames)

## Estimate

**Technique ~90%, look ~75%.** The video uses the author's pre-made node groups (download link in the
description), but every group is explained in words, so they were rebuilt from the explanation instead of
downloaded. The intro scenes (face, koi pond) belong to his paid extended course and are not shown — not
reproducible from this video. His final shots use an image from Pixabay as the color source; here a noise
texture with a custom palette is used (the variant he shows first).

| Chapter | Time | Estimate | Why |
|---|---|---|---|
| Grid, velocity attribute | 2:29–4:23 | 95% | spoken |
| Advection (sample nearest surface backwards) | 4:23–8:31 | 90% | logic spoken, group internals partly |
| Time step | 8:31–10:15 | 95% | 1/fps; replaced by the simulation zone's Delta Time |
| Divergence, neighbours | 10:15–16:50 | 90% | formula explained with numbers |
| Pressure (Jacobi, repeat zone 20×), gradient correction | 16:50–21:43 | 90% | formula spoken |
| Points: distribute every frame, move, delete, age, radius | 21:43–33:52 | 85% | all steps spoken; radius curve shape by eye |
| Colors from original position | 33:52–38:38 | 70% | noise / image choice, values by eye |

## Blender 5.2 rebuild

Object `Fluid` (hidden in render), group `FluidSim`:
- Grid 0.5 × 0.5 m, Resolution 40. Neighbour indices `nR nL nU nD` via Sample Nearest at position ± edge length.
- Initial `velocity` = (Noise color − 0.5) × (1, 1, 0) × Strength (1.0), Noise Scale 3.
- Simulation zone, every frame:
  1. advect: `velocity` = Sample Nearest Surface(velocity, position − velocity·Δt);
  2. `d` = 0.5·((vR.x − vL.x) + (vU.y − vD.y)), `p` = 0;
  3. repeat zone, Iterations 20: `p` = (pL + pR + pU + pD − d) / 4;
  4. `velocity` −= 0.5·(pR − pL, pU − pD, 0).

Object `Points`, group `FluidPoints` (reads `Fluid` through Object Info):
- Simulation zone: Distribute Points on Faces of the grid each frame (Density 5000, seed = frame), store
  `og` = position, `age` = 0, `age_max` = 200; old points get age + 1, are deleted if |x| or |y| > 0.25 or
  age > age_max, and move by Sample Nearest Surface(velocity) × Δt.
- Radius = 0.0009 · sin(π · age / age_max): born and dying at zero, no flicker.
- Material `FluidPoints`: Attribute `og` → Noise (scale 12) → color ramp navy / blue / red / orange / cream.
  Floor = the fluid grid with black `FluidFloor`.
- Ortho camera from above, Cycles 48 samples + denoise: ~24 s per 1080² frame on M1 Pro, ~150k points.

Render: `renders/003-fluid-points-f150.png` (frame 150).

## Not checked
- Long runs: velocity slowly damps (semi-Lagrangian advection loses energy); the video has the same setup.
- The image-texture variant and the "velocity lines" effect (fixed seed) were not built.
