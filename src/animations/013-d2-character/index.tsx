import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import {
  AdditiveBlending, AnimationUtils, Bone, CanvasTexture, Color, Sprite, SpriteMaterial, Object3D, Group, LoopOnce, LoopRepeat, MathUtils, Mesh, MeshStandardMaterial, Quaternion, RepeatWrapping,
  SRGBColorSpace, Vector3, type AnimationAction, type OrthographicCamera,
} from 'three'
import {
  ATTACKS, CHARACTERS, MIXAMO_URL, HUMAN, ITEM_HAND, RIGS, SKIN, SLOTS, attacksOf, claws, visibleParts,
  type Attack, type CharacterId, type Equipped, type Form, type Item, type Race, type Rig, type RigId, type Slot,
} from './parts'
import { SLIDERS, applyTurns, clawHandPose, clawHandStretch, poseTurns, rigBones, type PoseValues } from './pose'
import savedPose from './claw-pose.json'
import savedMap from './anim-map.json'

const CONFIG = {
  elevation: 30, // degrees, same isometric camera as 012
  viewHeight: 4.2, // metres visible vertically; the 1.8 m hero is then about 40% of the screen
  // render pixels the hero is tall in pixel mode (80 and 128, the Diablo II sizes, were dropped by the user)
  heroPixels: ['160', '200'] as const,
  directions: 8,
  turnEvery: 0.9, // seconds per direction step when auto-turning
  fade: 0.2, // clip crossfade, seconds
  attackIn: 0.2, // blend into an attack, seconds (the pack clips start far from the claw stance)
  // blend back to the stance, seconds: it starts this long before the attack clip ends, while the arm still moves,
  // so the return reads as the strike's recovery instead of a freeze and a snap (at most 40% of a short clip)
  attackOut: 0.45,
  hunchSpeed: 1.5, // how fast the hunch layer follows the number of claws (weight per second)
  // the vampire's combat face (shape keys GameFace / GameFace_Mouth from tools/kit_character.py): it comes on with
  // claws or a strike and fades out after `faceHold` seconds of calm; eyes glow yellow with it
  // eyes: the iris texture is replaced by the glow colour and the whole eye glows, so it reads at game size
  face: { speed: 4, hold: 2.5, eyeGlow: 3.5 },
  // a soft additive glow in front of each eye, on the head bone: the eyes themselves are a pixel or two at game size
  eyeHalo: { size: 0.085, forward: 0.02, opacity: 1 },
  eyeColors: { amber: '#ffb21e', blood: '#ff2a1a', venom: '#7dff3a', frost: '#5ad8ff', violet: '#c45bff' },
  cloak: { walk: 16, flap: 4, idle: 2, sway: 1.5 }, // degrees the procedural cloak bone trails back / moves
  background: '#07070a',
  ambient: { color: '#3a4258', intensity: 0.35 },
  // the light radius around the hero; `shadowShare` of it casts the shadow, the rest fills it so shadows stay see-through
  torch: { color: '#ffb36b', intensity: 34, distance: 8, decay: 1.6, height: 4, shadowShare: 0.6 },
  moon: { color: '#8ea2d6', intensity: 0.5, position: [-4, 6, -3] as const },
  // a soft warm light from the camera's side: the torch is overhead, so faces under brows and hoods went black
  fill: { color: '#ffd9b0', intensity: 0.9, position: [5, 3, 5] as const },
  ground: { tile: 4, size: 30 }, // metres per texture repeat, plane size
  // restyle of the kit outfits towards our grim look (the style is not settled yet): a muted multiply on clothing
  clothTint: '#aaa294',
}

const pixelRatio = (heroPixels: number, screenHeight: number, heroHeight: number) =>
  (heroPixels * CONFIG.viewHeight) / (heroHeight * screenHeight)

const X_AXIS = new Vector3(1, 0, 0)
const tmpColor = new Color()

const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// worn flagstones drawn once into a canvas
function useGroundTexture() {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    g.fillStyle = '#1b1915'
    g.fillRect(0, 0, 256, 256)
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let row = 0; row < 4; row++) {
      const shift = row % 2 ? 32 : 0
      for (let col = -1; col < 4; col++) {
        const l = 34 + rnd() * 18
        g.fillStyle = `hsl(${30 + rnd() * 15}, ${8 + rnd() * 8}%, ${l * 0.9}%)`
        g.fillRect(col * 64 + shift + 3, row * 64 + 3, 58, 58)
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(0,0,0,${rnd() * 0.25})`
          g.fillRect(col * 64 + shift + 3 + rnd() * 54, row * 64 + 3 + rnd() * 54, 2 + rnd() * 6, 2 + rnd() * 6)
        }
      }
    }
    const t = new CanvasTexture(c)
    t.wrapS = t.wrapT = RepeatWrapping
    t.colorSpace = SRGBColorSpace
    t.repeat.set(CONFIG.ground.size / CONFIG.ground.tile, CONFIG.ground.size / CONFIG.ground.tile)
    return t
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

function IsoCamera() {
  const camera = useThree((s) => s.camera as OrthographicCamera)
  const height = useThree((s) => s.size.height)
  useEffect(() => {
    const el = MathUtils.degToRad(CONFIG.elevation)
    const view = new Vector3(Math.SQRT1_2 * Math.cos(el), Math.sin(el), Math.SQRT1_2 * Math.cos(el))
    const target = new Vector3(0, 0.9, 0)
    camera.position.copy(target).addScaledVector(view, 50)
    camera.lookAt(target)
    camera.zoom = height / CONFIG.viewHeight
    camera.updateProjectionMatrix()
  }, [camera, height])
  return null
}

type Moving = 'Idle' | 'Walk' | 'Run'
// the states of the animation map: what each one means, in the user's terms
const ROLE_INFO: Record<string, string> = {
  Idle: 'Standing, empty hands',
  SwordIdle: 'Standing with a sword',
  ShieldIdle: 'Standing with only a shield',
  Walk: 'Walking (human hands)',
  Run: 'Fast walk / run (human hands)',
  BeastIdle: 'Standing with claws',
  BeastWalk: 'Walking with claws',
  BeastRun: 'Running with claws',
  ClawIdle: 'Claws, posture "zombie": standing',
  ClawWalk: 'Claws, posture "zombie": walking',
  ClawStance: 'Claws, posture "predator": standing',
}
const ATTACK_INFO: Record<string, string> = Object.fromEntries(
  Object.entries(ATTACKS).map(([k, a]) => [k, `Attack: ${a.label}`]),
)

type Posture = 'beast' | 'layer' | 'predator' | 'zombie'

// the looping clip for the current state. With claws: `predator` stands in the claw stance (and walks with the
// hunch layer), `zombie` uses the pack's zombie clips, `layer` only adds the hunch to the normal clips
// (`beast`: the Mixamo mutant idle and walk, when licensed/mixamo-clips.glb is present)
function baseRole(rig: Rig, moving: Moving, form: Form, eq: Equipped, posture: Posture) {
  const beast = rig.zombie && claws(form) > 0 ? posture : 'layer'
  if (beast === 'beast') return moving === 'Run' ? 'BeastRun' : moving === 'Walk' ? 'BeastWalk' : 'BeastIdle'
  if (moving !== 'Idle') return beast === 'zombie' ? 'ClawWalk' : moving
  if (beast === 'zombie') return 'ClawIdle'
  if (beast === 'predator') return 'ClawStance'
  return eq.sword ? 'SwordIdle' : eq.shield ? 'ShieldIdle' : 'Idle'
}

type Props = {
  rig: Rig
  url: string
  look: { skin: 'baked' | 'texture'; hair?: string }
  moving: Moving
  dir: number
  auto: boolean
  onTurn: () => void
  form: Form
  eq: Equipped
  race: Race
  posture: Posture
  attack: { name: Attack; n: number; clip?: string; loop?: boolean } | null // clip: play this one instead; loop: until stopped
  pose: PoseValues
  face: Face
  snarl: boolean
  eyeColor: EyeColor
  onClips: (names: string[]) => void
}
type EyeColor = keyof typeof CONFIG.eyeColors
type Face = 'auto' | 'on' | 'off'

function Mercenary({ rig, url, look, moving, dir, auto, onTurn, form, eq, race, posture, attack, pose, face, snarl, eyeColor, onClips }: Props) {
  const group = useRef<Group>(null)
  const { scene, animations: own } = useGLTF(url)
  // optional Mixamo clips: the same bone names, so the mixer binds them to this character (the hook is always called;
  // without the file it just loads the model again from the cache)
  const extra = useGLTF(MIXAMO_URL ?? url)
  const animations = useMemo(() => (MIXAMO_URL ? [...own, ...extra.animations] : own), [own, extra])
  // Hunch is stored as a full pose; as an additive layer it adds only its difference from Idle frame 0
  const clips = useMemo(() => {
    const idle = animations.find((c) => c.name === rig.clips.Idle)
    return animations.map((c) => {
      if (c.name !== 'Hunch' || !idle) return c
      const hunch = c.clone()
      const keep = rig.hunchBones
      if (keep) hunch.tracks = hunch.tracks.filter((t) => t.name.endsWith('.quaternion') && keep.includes(t.name.split('.')[0]))
      return AnimationUtils.makeClipAdditive(hunch, 0, idle)
    })
  }, [animations, rig])
  const { actions } = useAnimations(clips, group)
  useEffect(() => onClips(clips.map((c) => c.name).filter((n) => n !== 'Hunch').sort()), [clips, onClips])
  const role = baseRole(rig, moving, form, eq, posture)
  const baseRef = useRef(rig.clips[role])
  baseRef.current = rig.clips[role]
  const attacking = useRef(false)
  const ground = useGroundTexture()
  const turnT = useRef(0)
  const hunch = useRef(0)
  const faceState = useRef({ w: 0, mouth: 0, calm: 99 })
  const faceMeshes = useMemo(() => {
    const list: { mesh: Mesh; face: number; mouth: number }[] = []
    scene.traverse((o) => {
      const m = o as Mesh
      const dict = m.isMesh ? m.morphTargetDictionary : undefined
      if (dict && 'GameFace' in dict) list.push({ mesh: m, face: dict.GameFace, mouth: dict.GameFace_Mouth ?? -1 })
    })
    return list
  }, [scene])
  const eyes = useMemo(() => {
    let mat: MeshStandardMaterial | undefined
    scene.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined
      if (m?.name?.startsWith('MI_Eyes')) mat = m
    })
    return mat
  }, [scene])
  // claw pose sliders: rest frames from the bind pose, deltas recomputed when the values change
  const frames = useMemo(() => rigBones(scene), [scene])
  const turns = useMemo(() => poseTurns(frames, pose), [frames, pose])
  // glow sprites at the eye centres (from the Eyes mesh's bind-pose vertices), children of the head bone
  const halo = useMemo(() => {
    const head = frames.get('Head')
    let eyeMesh: Mesh | undefined
    scene.traverse((o) => {
      if (!eyeMesh && (o as Mesh).isMesh && o.name.includes('Eyes')) eyeMesh = o as Mesh
    })
    if (!head || !eyeMesh) return null
    const pos = eyeMesh.geometry.attributes.position
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.25, 'rgba(255,255,255,0.6)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    const map = new CanvasTexture(c)
    const mat = new SpriteMaterial({ map, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })
    const inv = head.rest.clone().invert()
    const sprites = [1, -1].map((side) => {
      const sum = new Vector3()
      let n = 0
      for (let i = 0; i < pos.count; i++) {
        if (pos.getX(i) * side > 0) {
          sum.add(new Vector3().fromBufferAttribute(pos, i))
          n++
        }
      }
      const sp = new Sprite(mat)
      sp.position.copy(sum.divideScalar(Math.max(n, 1)).add(new Vector3(0, 0, CONFIG.eyeHalo.forward)).sub(head.pos).applyQuaternion(inv))
      sp.scale.setScalar(CONFIG.eyeHalo.size)
      return sp
    })
    return { sprites, mat, map, bone: head.bone }
  }, [scene, frames])
  // attached in an effect (not in the memo): a strict-mode remount re-attaches what the cleanup removed
  useEffect(() => {
    if (!halo) return
    halo.sprites.forEach((sp) => halo.bone.add(sp))
    return () => halo.sprites.forEach((sp) => sp.removeFromParent())
  }, [halo])
  useEffect(
    () => () => {
      halo?.mat.dispose()
      halo?.map.dispose()
    },
    [halo],
  )
  const clawHands = useMemo(() => ({ l: clawHandPose(frames, 'l'), r: clawHandPose(frames, 'r') }), [frames])
  const clawStretch = useMemo(() => ({ l: clawHandStretch(frames, 'l'), r: clawHandStretch(frames, 'r') }), [frames])
  const tmp = useMemo(() => ({ v: new Vector3(), w: new Vector3() }), [])
  // three's mixer writes a bone only when the clip value changes, so a static pose is not rewritten each frame:
  // keep the clip value per touched bone and restore it before applying the sliders again (no accumulation)
  // once per frame per bone (a bone can be in several layers: finger curl and finger stretch), or the second call
  // would take the first layer's result for a new clip value and the bone would flip between the two every frame
  const frameId = useRef(0)
  const touched = useRef(new Map<Object3D, { base: Quaternion; applied: Quaternion; pos?: [Vector3, Vector3]; frame: number }>())
  const clipValue = (o: Object3D) => {
    let t = touched.current.get(o)
    if (t?.frame === frameId.current) return t
    if (!t) touched.current.set(o, (t = { base: o.quaternion.clone(), applied: new Quaternion(), pos: [o.position.clone(), new Vector3()], frame: frameId.current }))
    else if (o.quaternion.equals(t.applied)) o.quaternion.copy(t.base)
    else t.base.copy(o.quaternion)
    if (o.position.equals(t.pos![1])) o.position.copy(t.pos![0])
    else t.pos![0].copy(o.position)
    t.frame = frameId.current
    return t
  }

  // the cloak bone (Quaternius rig only) is not in any clip: it hangs down whatever the spine does (its rest
  // orientation in model space) and trails back by a few degrees about the model's sideways axis
  const cloak = useMemo(() => {
    let bone: Bone | undefined
    scene.traverse((o) => {
      if ((o as Bone).isBone && o.name === 'cloak') bone = o as Bone
    })
    if (!bone) return null
    scene.updateWorldMatrix(true, true)
    const modelInv = scene.getWorldQuaternion(new Quaternion()).invert()
    return { bone, restModel: modelInv.multiply(bone.getWorldQuaternion(new Quaternion())), q: new Quaternion(), p: new Quaternion() }
  }, [scene])

  useEffect(() => {
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true
        o.frustumCulled = false
      }
    })
  }, [scene])

  useEffect(() => {
    for (const [name, visible] of Object.entries(visibleParts(form, eq))) {
      const o = scene.getObjectByName(name)
      if (o) o.visible = visible
    }
  }, [scene, form, eq])

  // skin is baked white (grime only); the race tints it
  useEffect(() => {
    scene.traverse((o) => {
      const mat = (o as Mesh).material as MeshStandardMaterial | undefined
      if (!mat?.name) return
      if (mat.name === 'skin') mat.color.set(SKIN[look.skin][race])
      else if (mat.name.startsWith('MI_Hair')) mat.color.set(look.hair ?? '#ffffff')
      else if (mat.name.startsWith('MI_') && !mat.name.startsWith('MI_Eye')) mat.color.set(CONFIG.clothTint)
    })
  }, [scene, race, look])

  useEffect(() => {
    const h = actions.Hunch
    h?.play()
    return () => void h?.stop()
  }, [actions])

  // an attack plays once over the current clip; the way back starts before it ends (see useFrame)
  const strike = useRef<{ action: AnimationAction; out: number; returning: boolean; loop: boolean } | null>(null)
  useEffect(() => {
    const clip = attack && (attack.clip ?? rig.attacks[attack.name])
    const a = clip ? actions[clip] : null
    if (!a) return
    const loop = !!attack?.loop
    a.reset().setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1)
    a.clampWhenFinished = !loop
    a.fadeIn(CONFIG.attackIn).play()
    actions[baseRef.current]?.fadeOut(CONFIG.attackIn)
    attacking.current = true
    const st = { action: a, out: Math.min(CONFIG.attackOut, a.getClip().duration * 0.4), returning: false, loop }
    strike.current = st
    return () => {
      // stopped (or interrupted by a newer one): blend back to the current state unless it already did
      a.fadeOut(CONFIG.attackIn)
      if (!st.returning) actions[baseRef.current]?.reset().fadeIn(CONFIG.attackIn).play()
      strike.current = null
      attacking.current = false
    }
  }, [actions, attack, rig])

  useEffect(() => {
    const a = actions[rig.clips[role]]
    if (!attacking.current) a?.reset().fadeIn(CONFIG.fade).play()
    return () => void a?.fadeOut(CONFIG.fade)
  }, [actions, rig, role])

  useFrame(({ clock }, dt) => {
    const st = strike.current
    if (st && !st.loop && !st.returning && st.action.time >= st.action.getClip().duration - st.out) {
      st.returning = true
      st.action.fadeOut(st.out)
      actions[baseRef.current]?.reset().fadeIn(st.out).play()
      attacking.current = false
    }
    if (auto && !reduced && (turnT.current += dt) > CONFIG.turnEvery) {
      turnT.current = 0
      onTurn() // a state update once per step, not per frame
    }
    const yaw = (dir * 2 * Math.PI) / CONFIG.directions
    group.current!.rotation.y = yaw
    const walking = moving !== 'Idle' && !attacking.current
    if (walking && !reduced) {
      // the ground slides under the hero opposite to where it faces, at the clip's own speed
      const d = ((rig.speed[role as 'Walk'] ?? 0) * dt) / CONFIG.ground.tile
      ground.offset.x += Math.sin(yaw) * d
      ground.offset.y -= Math.cos(yaw) * d
    }
    // the hunch grows with the claws: half with one, full with two (none when the rig's hunched clips are used)
    const target = ['ClawIdle', 'ClawWalk', 'ClawStance', 'BeastIdle', 'BeastWalk'].includes(role) ? 0 : claws(form) / 2
    hunch.current = MathUtils.damp(hunch.current, target, CONFIG.hunchSpeed * 3, dt)
    actions.Hunch?.setEffectiveWeight(hunch.current)
    // the slider layer over the claw stance (weighted by how much of the stance is playing); afterwards the pelvis
    // is moved so the lower ankle stays where the clip put it: the feet keep to the floor whatever the sliders do
    const stance = actions[rig.clips.ClawStance]
    const w = stance && rig.clips.ClawStance !== rig.clips.Idle ? stance.getEffectiveWeight() : 0
    const pelvis = frames.get('pelvis')?.bone
    const feet = [frames.get('foot_l')?.bone, frames.get('foot_r')?.bone]
    frameId.current++
    for (const o of touched.current.keys()) clipValue(o)
    if (w > 0.001 && turns.length && pelvis && feet[0] && feet[1]) {
      clipValue(pelvis)
      const ankle = () => (scene.updateMatrixWorld(), Math.min(...feet.map((f) => f!.getWorldPosition(tmp.v).y)))
      const before = ankle()
      for (const t of turns) clipValue(t.bone)
      applyTurns(scene, turns, w)
      const lift = before - ankle()
      pelvis.getWorldPosition(tmp.w).y += lift
      pelvis.position.copy(pelvis.parent!.worldToLocal(tmp.w))
    }
    // clawed hands stay open like paws (the clips clench fists, hiding the claws); an attack drives its own fingers
    const strikeW = strike.current?.action.getEffectiveWeight() ?? 0
    for (const [side, slot] of [['l', 'armL'], ['r', 'armR']] as const) {
      if (form[slot] !== 'claw') continue
      for (const [bone, q] of clawHands[side]) {
        clipValue(bone)
        bone.quaternion.slerp(q, 1 - strikeW)
      }
      for (const [bone, k] of clawStretch[side]) {  // long fingers, also while striking
        clipValue(bone)
        bone.position.multiplyScalar(k)
      }
    }
    for (const [o, t] of touched.current) {
      t.applied.copy(o.quaternion)
      t.pos![1].copy(o.position)
    }
    // combat face: on with claws or a strike (auto), forced on / off; the mouth opens only when `snarl` is set
    const fs = faceState.current
    const fighting = race === 'vampire' && (claws(form) > 0 || !!strike.current)
    fs.calm = fighting ? 0 : fs.calm + dt
    const want = face === 'on' ? 1 : face === 'off' || race !== 'vampire' ? 0 : fs.calm < CONFIG.face.hold ? 1 : 0
    fs.w = MathUtils.damp(fs.w, want, CONFIG.face.speed, dt)
    fs.mouth = MathUtils.damp(fs.mouth, snarl ? want : 0, CONFIG.face.speed, dt)
    for (const f of faceMeshes) {
      f.mesh.morphTargetInfluences![f.face] = fs.w
      if (f.mouth >= 0) f.mesh.morphTargetInfluences![f.mouth] = fs.mouth
    }
    if (eyes) {
      const glow = CONFIG.eyeColors[eyeColor]
      eyes.emissive.set(glow)
      eyes.emissiveIntensity = fs.w * CONFIG.face.eyeGlow
      eyes.color.set('#ffffff').lerp(tmpColor.set(glow), fs.w) // tints the iris texture towards the glow
    }
    if (halo) {
      halo.mat.color.set(CONFIG.eyeColors[eyeColor])
      halo.mat.opacity = fs.w * CONFIG.eyeHalo.opacity
    }
    if (cloak) {
      const t = clock.elapsedTime
      const c = CONFIG.cloak
      const deg = walking ? c.walk + c.flap * Math.cos(t * 2 * Math.PI * 2) : c.idle + c.sway * Math.sin(t * Math.PI)
      const { bone, restModel, q, p } = cloak
      bone.parent!.updateWorldMatrix(true, false)
      // parent orientation in model space, then local = parent^-1 * (tilt * rest)
      p.copy(scene.getWorldQuaternion(q).invert()).multiply(bone.parent!.getWorldQuaternion(q))
      q.setFromAxisAngle(X_AXIS, MathUtils.degToRad(deg)).multiply(restModel)
      bone.quaternion.copy(p.invert().multiply(q))
    }
  })

  return (
    <>
      <group ref={group}>
        <primitive object={scene} />
      </group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[CONFIG.ground.size, CONFIG.ground.size]} />
        <meshStandardMaterial map={ground} roughness={0.95} />
      </mesh>
    </>
  )
}

const button: React.CSSProperties = {
  font: '13px/1 system-ui, sans-serif',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #3b352c',
  background: '#1a1712',
  color: '#d8c9a8',
  cursor: 'pointer',
}
const active: React.CSSProperties = { ...button, background: '#4a3a22', border: '1px solid #8a6a3a' }
const panel: React.CSSProperties = {
  position: 'absolute',
  top: 48,
  left: 16,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start', // buttons as wide as their text, not the panel
  gap: 6,
  maxWidth: 'calc(100% - 32px)',
  font: '12px/1 system-ui, sans-serif',
  color: '#a89a7c',
}
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }
const label: React.CSSProperties = { width: 72 }

function Choice<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div style={row}>
      <span style={label}>{name}</span>
      {options.map((o) => (
        <button key={o} style={value === o ? active : button} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  )
}

export default function Page() {
  const rigId: RigId = 'ual' // one rig now (our own rig and primitive models were dropped)
  const [character, setCharacter] = useState<CharacterId>('ranger')
  const [moving, setMoving] = useState<Moving>('Idle')
  const [dir, setDir] = useState(0)
  const [auto, setAuto] = useState(!reduced)
  const [pixel, setPixel] = useState(true)
  const [heroPx, setHeroPx] = useState<(typeof CONFIG.heroPixels)[number]>('160')
  const [race, setRace] = useState<Race>('vampire')
  const [form, setForm] = useState<Form>(HUMAN)
  const [eq, setEq] = useState<Equipped>({ sword: true, shield: true })
  const [posture, setPosture] = useState<Posture>(MIXAMO_URL ? 'beast' : 'layer') // claws: the mutant idle / walk
  const [attack, setAttack] = useState<{ name: Attack; n: number; clip?: string } | null>(null)
  const [previewClip, setPreviewClip] = useState('')
  const [loopAll, setLoopAll] = useState(true) // attacks and previews repeat until Stop
  const [pose, setPose] = useState<PoseValues>(savedPose)
  const [face, setFace] = useState<Face>('auto')
  const [snarl, setSnarl] = useState(true)
  const [eyeColor, setEyeColor] = useState<EyeColor>('amber')
  // each character has its own eye colour; picking a character resets the choice to it
  useEffect(() => setEyeColor((CHARACTERS[character] as { eyes: string }).eyes as EyeColor), [character])
  const [saved, setSaved] = useState('')
  const savePose = async () => {
    const res = await fetch('/__save?path=src/animations/013-d2-character/claw-pose.json', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(Object.entries(pose).filter(([, v]) => v)), null, 2) + '\n',
    })
    setSaved(res.ok ? 'saved' : 'save failed (dev server only)')
  }
  const [screenHeight, setScreenHeight] = useState(window.innerHeight)
  // which clip plays in which state: the defaults in parts.ts, overridden by anim-map.json (edited in the
  // "Animation map" panel and saved from there)
  const [animMap, setAnimMap] = useState<{ roles: Record<string, string>; attacks: Record<string, string> }>(savedMap)
  const [clipNames, setClipNames] = useState<string[]>([])
  const [showMap, setShowMap] = useState(false)
  const [mapSaved, setMapSaved] = useState('')
  const base = RIGS[rigId] as Rig
  const rig: Rig = useMemo(
    () => ({ ...base, clips: { ...base.clips, ...animMap.roles }, attacks: { ...base.attacks, ...animMap.attacks } }),
    [base, animMap],
  )
  const saveMap = async () => {
    const res = await fetch('/__save?path=src/animations/013-d2-character/anim-map.json', {
      method: 'POST',
      body: JSON.stringify(animMap, null, 2) + '\n',
    })
    setMapSaved(res.ok ? 'saved' : 'save failed (dev server only)')
  }
  const ch = CHARACTERS[character] as { url: string; skin: 'baked' | 'texture'; hair?: string; eyes: string }
  const url = rigId === 'ual' ? ch.url : rig.url
  const look = rigId === 'ual' ? ch : { skin: 'baked' as const }
  const attacks = useMemo(() => attacksOf(form, eq).filter((a) => rig.attacks[a]), [form, eq, rig])
  const trigger = (a: Attack) => setAttack((p) => ({ name: a, n: (p?.n ?? 0) + 1, loop: loopAll }))
  // plays any clip once over the current state (the Animation map's preview)
  const preview = (clip: string) => clip && setAttack((p) => ({ name: 'Punch', clip, n: (p?.n ?? 0) + 1, loop: loopAll }))

  useEffect(() => {
    const onResize = () => setScreenHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // keys 1..n trigger the listed attacks
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = attacks[Number(e.key) - 1]
      if (a) setAttack((p) => ({ name: a, n: (p?.n ?? 0) + 1 }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [attacks])

  // a hand turning into a claw puts its item into the inventory; only vampires grow claws
  const setSlot = (slot: Slot, v: Form[Slot]) => {
    setForm((f) => ({ ...f, [slot]: v }))
    if (v === 'claw') setEq((e) => ({ ...e, ...Object.fromEntries((Object.keys(ITEM_HAND) as Item[]).filter((i) => ITEM_HAND[i] === slot).map((i) => [i, false])) }))
  }
  const changeRace = (r: Race) => {
    setRace(r)
    if (r === 'human') setForm(HUMAN)
  }
  const { torch, moon, ambient, fill } = CONFIG

  return (
    <div style={{ position: 'fixed', inset: 0, background: CONFIG.background }}>
      <Canvas
        orthographic
        shadows
        dpr={pixel ? pixelRatio(Number(heroPx), screenHeight, rig.height) : [1, 2]}
        style={{ imageRendering: pixel ? 'pixelated' : 'auto' }}
        gl={{ antialias: !pixel }}
      >
        <color attach="background" args={[CONFIG.background]} />
        <IsoCamera />
        <ambientLight color={ambient.color} intensity={ambient.intensity} />
        <directionalLight color={moon.color} intensity={moon.intensity} position={[...moon.position]} />
        <directionalLight color={fill.color} intensity={fill.intensity} position={[...fill.position]} />
        <pointLight
          color={torch.color}
          intensity={torch.intensity * torch.shadowShare}
          distance={torch.distance}
          decay={torch.decay}
          position={[0.25, torch.height, 0.4]}
          castShadow
          shadow-mapSize={[512, 512]}
          shadow-bias={-0.002}
        />
        <pointLight
          color={torch.color}
          intensity={torch.intensity * (1 - torch.shadowShare)}
          distance={torch.distance}
          decay={torch.decay}
          position={[0.25, torch.height, 0.4]}
        />
        <Mercenary
          onClips={setClipNames}
          key={url}
          rig={rig}
          url={url}
          look={look}
          moving={moving}
          dir={dir}
          auto={auto}
          onTurn={() => setDir((d) => d + 1)}
          form={form}
          eq={eq}
          race={race}
          posture={posture}
          attack={attack}
          pose={pose}
          face={face}
          snarl={snarl}
          eyeColor={eyeColor}
        />
      </Canvas>
      <div style={panel}>
        {rigId === 'ual' && (
          <Choice name="Character" value={character} options={Object.keys(CHARACTERS) as CharacterId[]} onChange={setCharacter} />
        )}
        <Choice name="Hero px" value={heroPx} options={CONFIG.heroPixels} onChange={(v) => (setHeroPx(v), setPixel(true))} />
        <Choice name="Race" value={race} options={['human', 'vampire'] as const} onChange={changeRace} />
        {race === 'vampire' &&
          (Object.keys(SLOTS) as Slot[]).map((slot) => (
            <Choice key={slot} name={SLOTS[slot].label} value={form[slot]} options={SLOTS[slot].variants} onChange={(v) => setSlot(slot, v)} />
          ))}
        {race === 'vampire' && (
          <div style={row}>
            <span style={label}>Face</span>
            {(['auto', 'on', 'off'] as const).map((f) => (
              <button key={f} style={face === f ? active : button} onClick={() => setFace(f)}>
                {f}
              </button>
            ))}
            <button style={snarl ? active : button} onClick={() => setSnarl((v) => !v)}>
              snarl
            </button>
          </div>
        )}
        {race === 'vampire' && (
          <div style={row}>
            <span style={label}>Eyes</span>
            {(Object.keys(CONFIG.eyeColors) as EyeColor[]).map((c) => (
              <button
                key={c}
                title={c}
                style={{ ...(eyeColor === c ? active : button), padding: '8px 10px' }}
                onClick={() => setEyeColor(c)}
              >
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: CONFIG.eyeColors[c] }} />
              </button>
            ))}
          </div>
        )}
        {race === 'vampire' && rig.zombie && (
          <Choice name="Hunch" value={posture} options={(MIXAMO_URL ? ['beast', 'layer', 'predator', 'zombie'] : ['layer', 'predator', 'zombie']) as Posture[]} onChange={setPosture} />
        )}
        <div style={row}>
          <span style={label}>Inventory</span>
          {(Object.keys(ITEM_HAND) as Item[]).map((item) => {
            const free = form[ITEM_HAND[item]] === 'human'
            return (
              <button
                key={item}
                style={{ ...(eq[item] ? active : button), opacity: free ? 1 : 0.4 }}
                disabled={!free}
                onClick={() => setEq((e) => ({ ...e, [item]: !e[item] }))}
              >
                {item}: {eq[item] ? 'in hand' : 'in bag'}
              </button>
            )
          })}
        </div>
        <div style={{ ...row, marginTop: 6 }}>Attacks</div>
        {attacks.map((a, i) => (
          <button key={a} style={{ ...button, textAlign: 'left', lineHeight: 1.35 }} onClick={() => trigger(a)}>
            {i + 1}. {ATTACKS[a].label} · {ATTACKS[a].damage}
            {ATTACKS[a].effect && `, ${ATTACKS[a].effect}`}
            <br />
            <span style={{ opacity: 0.6 }}>
              range {ATTACKS[a].range} m · clip {rig.attacks[a]}
            </span>
          </button>
        ))}
      </div>
      {rigId === 'ual' && race === 'vampire' && claws(form) === 2 && posture === 'predator' && moving === 'Idle' && (
        <div style={{ ...panel, left: 'auto', right: 16, width: 240, alignItems: 'stretch', background: '#0d0c0aCC', padding: 10, borderRadius: 8 }}>
          <div style={row}>Claw pose (degrees)</div>
          {SLIDERS.map((sl) => (
            <label key={sl.id} style={{ display: 'grid', gridTemplateColumns: '1fr 32px', gap: 4, alignItems: 'center' }}>
              <span>{sl.label}</span>
              <span style={{ textAlign: 'right' }}>{pose[sl.id] ?? 0}</span>
              <input
                type="range"
                min={sl.min}
                max={sl.max}
                step={1}
                value={pose[sl.id] ?? 0}
                onChange={(e) => (setPose((p) => ({ ...p, [sl.id]: Number(e.target.value) })), setSaved(''))}
                style={{ gridColumn: '1 / 3', accentColor: '#8a6a3a' }}
              />
            </label>
          ))}
          <div style={row}>
            <button style={button} onClick={() => (setPose({}), setSaved(''))}>
              Reset
            </button>
            <button style={active} onClick={savePose}>
              Save pose
            </button>
            <span>{saved}</span>
          </div>
        </div>
      )}
      {showMap && (
        <div style={{ ...panel, top: 16, left: 'auto', right: 16, width: 400, maxHeight: 'calc(100% - 90px)', overflowY: 'auto', background: '#0d0c0aEE', padding: 10, borderRadius: 8, alignItems: 'stretch' }}>
          <div style={row}>Preview any animation</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
            <select
              value={previewClip}
              onChange={(e) => (setPreviewClip(e.target.value), preview(e.target.value))}
              style={{ background: '#1a1712', color: '#d8c9a8', border: '1px solid #3b352c', borderRadius: 4, font: '12px system-ui', padding: 4 }}
            >
              <option value="">— choose —</option>
              {clipNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button style={button} onClick={() => preview(previewClip)}>
              ▶
            </button>
          </div>
          <div style={{ ...row, marginTop: 6 }}>Which animation plays when (saved to anim-map.json)</div>
          {([['roles', ROLE_INFO], ['attacks', ATTACK_INFO]] as const).map(([kind, info]) =>
            Object.entries(info).map(([key, when]) => {
              const cur = (rig[kind === 'roles' ? 'clips' : 'attacks'] as Record<string, string | undefined>)[key] ?? ''
              const changed = key in animMap[kind as 'roles' | 'attacks']
              return (
                <label key={kind + key} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 28px', gap: 6, alignItems: 'center' }}>
                  <span style={{ lineHeight: 1.3, color: changed ? '#e8c27a' : undefined }}>{when}</span>
                  <select
                    value={cur}
                    onChange={(e) => (setAnimMap((m) => ({ ...m, [kind]: { ...m[kind as 'roles' | 'attacks'], [key]: e.target.value } })), setMapSaved(''))}
                    style={{ background: '#1a1712', color: '#d8c9a8', border: '1px solid #3b352c', borderRadius: 4, font: '12px system-ui', padding: 4 }}
                  >
                    {!clipNames.includes(cur) && <option value={cur}>{cur || '—'}</option>}
                    {clipNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button style={{ ...button, padding: '4px 6px' }} onClick={(e) => (e.preventDefault(), preview(cur))}>
                    ▶
                  </button>
                </label>
              )
            }),
          )}
          <div style={row}>
            <button style={button} onClick={() => (setAnimMap({ roles: {}, attacks: {} }), setMapSaved(''))}>
              Reset
            </button>
            <button style={active} onClick={saveMap}>
              Save
            </button>
            <span>{mapSaved}</span>
          </div>
        </div>
      )}
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {(['Idle', 'Walk', 'Run'] as const).map((c) => (
          <button key={c} style={moving === c ? active : button} onClick={() => setMoving(c)}>
            {c}
          </button>
        ))}
        <button style={button} onClick={() => (setAuto(false), setDir((d) => d - 1))}>
          ⟲
        </button>
        <button style={button} onClick={() => (setAuto(false), setDir((d) => d + 1))}>
          ⟳
        </button>
        <button style={auto ? active : button} onClick={() => setAuto((a) => !a)}>
          Auto-turn
        </button>
        <button style={loopAll ? active : button} onClick={() => setLoopAll((v) => !v)}>
          Loop
        </button>
        <button style={attack ? active : button} onClick={() => setAttack(null)}>
          ■ Stop
        </button>
        <button style={showMap ? active : button} onClick={() => setShowMap((v) => !v)}>
          Animation map
        </button>
        <button style={pixel ? active : button} onClick={() => setPixel((p) => !p)}>
          {pixel ? 'Pixels' : 'Smooth'}
        </button>
      </div>
    </div>
  )
}

for (const u of [...Object.values(RIGS).map((r) => r.url), ...Object.values(CHARACTERS).map((c) => c.url)]) useGLTF.preload(u)
