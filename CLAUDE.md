# Animation Lab

A sandbox of test pages with animations the user likes. The user sends an example
(video, GIF, screenshot, link, CodePen, code snippet or a description), Claude recreates it,
then changes it on request. Talk to the user in Russian; code and these files stay in English.

Stack: Vite + React 19 + TypeScript, Three.js via React Three Fiber (`@react-three/fiber`, helpers from
`@react-three/drei`), PixiJS v8 via `@pixi/react`, `react-router-dom` for routes.

## Start of every session

1. List `src/animations/` and read the `meta.ts` files — that is the list of all animations.
2. If the user names an animation (by number, slug or description), read its `NOTES.md` before touching code.
3. If it's unclear which animation the user means, list the closest matches and ask.

## Layout

```
src/
  registry.ts                 auto-discovers animations via import.meta.glob, no manual registration
  App.tsx                     gallery at /, each animation at /NNN-slug
  animations/
    000-template-three/       starter for a Three.js (R3F) animation
    000-template-pixi/        starter for a PixiJS animation
    NNN-slug/
      index.tsx               default export: the page component (full screen)
      meta.ts                 title, tags, status, updated
      NOTES.md                the context of this animation (see below)
      reference/              what the user sent: files, links in source.md, screenshots of the source
```

- `NNN` is a zero-padded running number (`001`, `002`, ...); `slug` is short kebab-case (`magnetic-button`).
- One animation = one folder. A variant the user wants to keep side by side gets its own folder
  (`004-card-flip-spring`) with a link to the parent in `NOTES.md`.
- Code shared by several animations goes to `src/shared/` only once a second animation needs it.

## New example → new animation

1. Pick the engine: Three.js for 3D, shaders, particles in space; PixiJS for 2D sprites, many objects,
   2D filters; plain React + CSS when neither is needed. If unclear, say which one and why.
2. Copy the matching `000-template-*` folder to `src/animations/NNN-slug/`, update `meta.ts`.
3. Save the user's example into `reference/` (files as-is, links in `reference/source.md`).
4. Describe in `NOTES.md` what the effect is: what moves, timing, easing, triggers (load / hover / scroll / click / cursor).
   If something in the example is ambiguous (speed, easing, what happens on mobile), list it as an open question and ask.
5. Build `index.tsx`. Extra libraries (GSAP, Motion, postprocessing, etc.) only when they clearly fit, free,
   installed with npm, and the choice is written in `NOTES.md`.
6. Show it in the browser preview (`preview_start` with name `lab`, open `/NNN-slug`),
   compare with the reference, say honestly what differs. Run `npx tsc -b` before saying it's done.

## Studying a video reference

- Open the video URL directly in the preview tab (Dribbble: take the `.mp4` from the shot page's `<video>`), seek with
  `video.currentTime` and draw frames into a canvas: a contact sheet shows the motion, `getImageData` gives exact colors
  and edge positions over time. No download needed.
- Compare the same way: set the preview to the video's size (`resize_window`), copy the WebGL canvas into a 2D canvas
  inside `requestAnimationFrame` (right after R3F renders) and sample the same rows/columns.

## Change requests

- Before editing, re-read `NOTES.md`. After editing, update it: current parameters and a line in the changelog,
  and `updated` in `meta.ts`.
- Keep tunable values (durations, easings, distances, colors, counts) in a `CONFIG` object at the top of
  `index.tsx`, so the next change is a one-line edit.
- Offer a git commit after each finished iteration, so any earlier state can be restored.

## NOTES.md template

```md
# NNN — Title

Source: <link or file in reference/>
Engine: three | pixi | css
Status: draft | matches reference | customized

## Effect
What moves, trigger, timing, easing.

## Implementation
Key techniques, what's in CONFIG.

## Preferences
What the user liked or rejected for this animation.

## Open questions

## Changelog
- YYYY-MM-DD: what changed and why
```

## Cross-animation taste

General preferences the user expresses (not tied to one animation) go into the list below,
so new animations follow them from the start.

- (empty yet)

## Rules

- Respect `prefers-reduced-motion`.
- Clean up on unmount: R3F and `@pixi/react` do it for their own objects; anything created by hand
  (listeners, textures, GSAP timelines) is disposed in an effect cleanup.
- Check smoothness, not only that it runs: no per-frame React state updates, mutate refs in `useFrame` / `useTick`.
- Each page works full screen and at phone width.
- Local only: `npm run dev` via `.claude/launch.json` (port 4173). No deploys unless asked.
- Deploys (only when asked): `npm run deploy` → Cloudflare Worker `animation-lab` with static assets,
  https://animation-lab.animation-lab.workers.dev. Config in `wrangler.jsonc` (account pinned). Wrangler must be logged in
  as the animations account; check `npx wrangler whoami` first.
- Preview quirk: when the browser pane is hidden, an R3F canvas can stay at 300×150 (blank) because the first
  ResizeObserver measurement doesn't arrive. Run `window.dispatchEvent(new Event('resize'))` before judging it broken.
