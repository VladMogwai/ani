# 002 — Abstract geometry nodes: twisted rings

Source: https://youtu.be/WCogqNh2AUw (Bad Normals, 5:16, Blender 2.93, legacy attribute nodes)
Status: reproduced (Blender 5.2, scene `AbstractRings` in `002-003-abstract-rings-fluid.blend`)
Studied: 2026-10-29 (no narration, music only; everything read from frames, 9 on-screen steps)

## Estimate

**Technique ~95%, look ~80%.** The node chain is short and fully readable on screen. Differences: the video's
ring object and exact values (line count, offset, twist factor) are tweaked live; colors of the hero shot were
picked by eye from frames.

## Video's node chain (2.93)

Line (Offset, Count ~7…, offset Z ~0.53) → Attribute Separate XYZ (position → x, y, z) →
Attribute Math Add (z + 18.72 → z) → Point Scale (factor z) → Attribute Math Multiply (z × slider → z) →
Point Rotate (Euler, Object, rotation = z) → Point Instance (Circle object) → Output.
The slider in Multiply animates the whole thing. End: white, green glass and orange materials, HDRI.

## Blender 5.2 rebuild (fields)

- Mesh Line, Offset, Count = group input (80), start Z −1.4, offset Z 0.035.
- Ring built in the tree: Curve Circle (r 1, res 128) + Quadrilateral profile (0.025 × 0.22) → Curve to Mesh
  → Set Material `RingColors`. (A hidden helper object evaluates to nothing, so no Object Info.)
- Instance on Points: Scale = |Position.z| + 0.25 (V profile, two cones), Rotation = (z·Twist, z·Twist, z·Twist).
- `Twist` group input keyframed 0.4 → 2.2 over frames 1–240.
- Material: Object Info Random → Color Ramp (constant) red / orange / yellow / cream / dark red / rare blue.
- EEVEE, sun + flat warm world, camera 35 mm looking into the funnel.

Render: `renders/002-abstract-rings-f150.png` (frame 150, 960×540).
