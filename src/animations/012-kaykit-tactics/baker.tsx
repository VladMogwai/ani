import { useEffect, useRef, useState } from 'react'
import {
  AnimationClip, AnimationMixer, Bone, LoopOnce, MathUtils, Mesh, Object3D, PropertyBinding, Skeleton, SkinnedMesh, Vector3,
  type MeshStandardMaterial,
} from 'three'
import { load, makeRenderer, makeScene, orthoAt, saveImage, saveJson } from './bake-common'
import { bakeLevel } from './bake-level'
import { LEVELS } from './level'
import { ANIMATION_FILES, BAKE, ITEMS, MODELS, OUT, SOURCE, UNITS, type Model, type UnitDef, type UnitSheets } from './units'

// Dev-only sprite baker: renders every unit of units.ts into sheets (one row per screen direction, one column per frame)
// through an isometric orthographic camera and saves them via the dev server's /__save endpoint; "Bake level" renders
// the locations of level.ts (bake-level.ts). ?bake bakes every unit, ?bake=mage,ranger only those.
const only = new URLSearchParams(location.search).get('bake')?.split(',').filter(Boolean) ?? []
const selected = Object.keys(UNITS).filter((n) => !only.length || only.includes(n))

// GLTFLoader drops dots and other reserved characters from node names: handslot.r -> handslotr
const node = (root: Object3D, name: string) => root.getObjectByName(PropertyBinding.sanitizeNodeName(name))
const loadModel = async (m: Model) => (await load(`${SOURCE}/characters/${MODELS[m]}.glb`)).scene
// part names are <prefix>_<Part>; Rogue_Hooded.glb names them RogueHooded_*
const partOf = (root: Object3D, m: Model, part: string) =>
  root.getObjectByName(`${MODELS[m].replace('Rogue_Hooded', 'RogueHooded')}_${part}`)

// each mesh gets its own material copy so a tint stays on that part
const tint = (obj: Object3D, color: string) =>
  obj.traverse((o) => {
    if (!(o instanceof Mesh)) return
    o.material = (o.material as MeshStandardMaterial).clone()
    ;(o.material as MeshStandardMaterial).color.set(color)
  })

// assemble a unit from units.ts: base model, hidden parts, borrowed parts, tints, items in hands
async function build(name: string, def: UnitDef) {
  const model = await loadModel(def.base)
  const part = (p: string) => {
    const o = partOf(model, def.base, p)
    if (!o) throw new Error(`${name}: ${def.base} has no part ${p}`)
    return o
  }
  for (const p of def.hide ?? []) part(p).visible = false
  for (const b of def.borrow ?? []) {
    const o = partOf(await loadModel(b.from), b.from, b.part)
    if (!o) throw new Error(`${name}: ${b.from} has no part ${b.part}`)
    const parent = node(model, o.parent!.name)!
    if (o instanceof SkinnedMesh) {
      // skinned clothes follow our skeleton: same bone names, the donor's bind pose
      const bones = o.skeleton.bones.map((bone) => model.getObjectByName(bone.name) as Bone)
      parent.add(o)
      o.bind(new Skeleton(bones, o.skeleton.boneInverses), o.bindMatrix)
    } else parent.add(o) // rigid parts (hats, hoods) hang on a bone of the same name
    if (b.tint) tint(o, b.tint)
  }
  for (const [p, color] of Object.entries(def.tint ?? {})) tint(part(p), color)
  for (const [hand, item] of [['handslot.r', def.right], ['handslot.l', def.left]] as const) {
    if (item) node(model, hand)!.add((await load(`${SOURCE}/weapons/${ITEMS[item]}.gltf`)).scene)
  }
  const scaled = Object.entries(def.scale ?? {}).map(([bone, s]) => [node(model, bone)!, s] as const)
  return { model, scaled }
}

// screen row r (clockwise from east) -> model yaw; glTF models face +Z, the camera looks from +X+Z
const yaw = (row: number) => MathUtils.degToRad(135 - (360 / BAKE.directions) * row)

async function bakeAll(log: (s: string) => void, preview: (c: HTMLCanvasElement) => void) {
  const clips = new Map<string, AnimationClip>()
  for (const url of ANIMATION_FILES) for (const c of (await load(url)).animations) clips.set(c.name, c)
  log(`${clips.size} clips loaded`)

  // a square frame around the feet: world origin sits `feet` up from the bottom, centred
  const w = BAKE.frame / BAKE.ppu
  const camera = orthoAt(new Vector3(), -w / 2, w / 2, (1 - BAKE.feet) * w, -BAKE.feet * w)
  const size = BAKE.frame * BAKE.resolution
  const renderer = makeRenderer()
  renderer.setSize(size, size, false)

  const metas: Record<string, UnitSheets> = {}
  for (const name of selected) {
    const def = UNITS[name]
    const { scene } = makeScene()
    const { model, scaled } = await build(name, def)
    const pivot = new Object3D()
    pivot.add(model)
    scene.add(pivot)
    const mixer = new AnimationMixer(model)
    const meta: UnitSheets = (metas[name] = { frame: BAKE.frame, feet: BAKE.feet, anims: {} })

    for (const [anim, a] of Object.entries(def.anims)) {
      const clip = clips.get(a.clip)
      if (!clip) throw new Error(`${name}.${anim}: no clip ${a.clip}`)
      mixer.stopAllAction()
      const action = mixer.clipAction(clip)
      if (!a.loop) {
        action.setLoop(LoopOnce, 1)
        action.clampWhenFinished = true
      }
      action.reset().play()
      // loops end one frame before they repeat; one-shots include their last pose
      const fps = a.fps ?? BAKE.fps
      const frames = a.loop ? Math.max(1, Math.round(clip.duration * fps)) : Math.floor(clip.duration * fps) + 1
      meta.anims[anim] = { frames, fps, loop: a.loop }

      const sheet = document.createElement('canvas')
      sheet.width = size * frames
      sheet.height = size * BAKE.directions
      const ctx = sheet.getContext('2d')!
      for (let row = 0; row < BAKE.directions; row++) {
        pivot.rotation.y = yaw(row)
        for (let f = 0; f < frames; f++) {
          mixer.setTime(Math.min(f / fps, clip.duration - 1e-4))
          for (const [bone, s] of scaled) bone.scale.setScalar(s) // after the clip, which may key scale too
          renderer.render(scene, camera)
          ctx.drawImage(renderer.domElement, f * size, row * size)
        }
      }
      await saveImage(sheet, `${OUT}/${name}/${anim}.webp`)
      preview(sheet)
      mixer.uncacheClip(clip)
      log(`${name}.${anim}: ${frames} frames`)
    }
  }
  // json files last: the scene imports them, so writing one makes the dev server reload this page
  for (const [name, meta] of Object.entries(metas)) await saveJson(`${OUT}/${name}.json`, meta)
  renderer.dispose()
  log('done')
}

export default function Baker() {
  const [lines, setLines] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => previewRef.current?.replaceChildren(), [])

  const run = async (bake: typeof bakeAll) => {
    setBusy(true)
    setLines([])
    const log = (s: string) => setLines((l) => [...l, s])
    const preview = (c: HTMLCanvasElement) => {
      c.style.cssText = 'max-width:100%;background:#333'
      previewRef.current?.replaceChildren(c)
    }
    try {
      await bake(log, preview)
    } catch (e) {
      log(`error: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  return (
    <div style={{ padding: 24, color: '#ddd', background: '#16161a', minHeight: '100vh', font: '14px/1.5 system-ui' }}>
      <h1 style={{ fontSize: 20 }}>012 sprite baker</h1>
      <p>Units: {selected.join(', ')} → {OUT}</p>
      <button onClick={() => run(bakeAll)} disabled={busy} style={{ padding: '8px 16px' }}>{busy ? 'Baking…' : 'Bake units'}</button>{' '}
      {Object.keys(LEVELS).map((id) => (
        <button key={id} onClick={() => run((log, preview) => bakeLevel(id, LEVELS[id], log, preview))} disabled={busy} style={{ padding: '8px 16px', marginRight: 8 }}>
          Bake level {id}
        </button>
      ))}
      <pre>{lines.join('\n')}</pre>
      <div ref={previewRef} />
    </div>
  )
}
