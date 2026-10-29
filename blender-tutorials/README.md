# Blender tutorials

Video tutorials the user sent to check whether Claude can reproduce them in Blender (via the Blender MCP,
`tools/blender-mcp`). One file per tutorial: `NNN-slug.md`, with the step breakdown, parameters and the estimate.

## Index

| # | Tutorial | Length | Estimate | Status |
|---|---|---|---|---|
| [001](001-cloth-abstract-art.md) | Abstract art with cloth simulation and mixed material (Jean-Marc Denis) | 19:42 | technique ~90%, look ~70% | estimated, not built |
| [002](002-abstract-gn-rings.md) | Abstract geometry nodes: twisted rings (Bad Normals) | 5:16 | technique ~95%, look ~80% | reproduced |
| [003](003-gn-fluid-points.md) | 2D fluid simulation in Geometry Nodes, points carried by the flow (Bad Normals) | 39:21 | technique ~90%, look ~75% | reproduced |

Status: `estimated` → `in progress` → `reproduced` (with a render in the file) or `dropped`.

## How a tutorial is studied

1. Open the YouTube link in the browser pane. Title, author, description and chapters come from
   `ytInitialPlayerResponse.videoDetails`.
2. Transcript: the `timedtext` caption URL returns an empty body (YouTube now wants a token), so expand the
   description, click "Show transcript" and read `ytd-transcript-segment-renderer` elements. Auto-captions mishear
   terms ("close" = cloth, "for now" = Fresnel, "voranoi" = Voronoi).
3. Frames: pause, seek `video.currentTime`, wait for `seeked`, draw into a canvas laid over the page, screenshot it
   as a contact sheet. Mid-roll ads replace some frames: check `#movie_player.ad-showing` and resample.
4. Silent or sped-up parts (no narration) are the weak spot: only frames tell what changed there.

## How the estimate is made

Each chapter gets a percentage:
- 90–95%: every step and value is spoken or readable on screen; maps 1:1 to `bpy`.
- 70–80%: steps are clear but values are set by eye (mouse scale, rotation, camera angle) or the result is chaotic
  (simulations).
- ~50%: silent / sped-up tweaking, reconstructed from frames only.
- Below that: sculpting, hand painting, paid add-ons.

Two numbers in the end: **technique** (can the same setup be built) and **look** (how close the final image gets).

Constraints that always apply: free assets only (Poly Haven instead of paid packs; downloads only with the user's OK),
M1 Pro 16 GB (cloth bakes and Cycles renders take minutes), check the Blender version against the tutorial's.
