import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import {
  AnimationUtils, Bone, CanvasTexture, Object3D, Group, LoopOnce, MathUtils, Mesh, MeshStandardMaterial, Quaternion, RepeatWrapping,
  SRGBColorSpace, Vector3, type AnimationAction, type OrthographicCamera,
} from 'three'
import {
  ATTACKS, CHARACTERS, HUMAN, ITEM_HAND, RIGS, SKIN, SLOTS, attacksOf, claws, visibleParts,
  type Attack, type CharacterId, type Equipped, type Form, type Item, type Race, type Rig, type RigId, type Slot,
} from './parts'
import { SLIDERS, applyTurns, clawHandPose, clawHandStretch, poseTurns, rigBones, type PoseValues } from './pose'
import savedPose from './claw-pose.json'

const CONFIG = {
  elevation: 30, // degrees, same isometric camera as 012
  viewHeight: 4.2, // metres visible vertically; the 1.8 m hero is then about 40% of the screen
  // render pixels the hero is tall in pixel mode: 80 as on an 800x600 Diablo II screen, more for finer detail
  heroPixels: ['80', '128', '160', '200'] as const,
  directions: 8,
  turnEvery: 0.9, // seconds per direction step when auto-turning
  fade: 0.2, // clip crossfade, seconds
  attackIn: 0.2, // blend into an attack, seconds (the pack clips start far from the claw stance)
  // blend back to the stance, seconds: it starts this long before the attack clip ends, while the arm still moves,
  // so the return reads as the strike's recovery instead of a freeze and a snap (at most 40% of a short clip)
  attackOut: 0.45,
  hunchSpeed: 1.5, // how fast the hunch layer follows the number of claws (weight per second)
  cloak: { walk: 16, flap: 4, idle: 2, sway: 1.5 }, // degrees the procedural cloak bone trails back / moves
  background: '#07070a',
  ambient: { color: '#3a4258', intensity: 0.35 },
  // the light radius around the hero; `shadowShare` of it casts the shadow, the rest fills it so shadows stay see-through
  torch: { color: '#ffb36b', intensity: 34, distance: 8, decay: 1.6, height: 4, shadowShare: 0.6 },
  moon: { color: '#8ea2d6', intensity: 0.5, position: [-4, 6, -3] as const },
  ground: { tile: 4, size: 30 }, // metres per texture repeat, plane size
  // restyle of the kit outfits towards our grim look (the style is not settled yet): a muted multiply on clothing
  clothTint: '#aaa294',
}

const pixelRatio = (heroPixels: number, screenHeight: number, heroHeight: number) =>
  (heroPixels * CONFIG.viewHeight) / (heroHeight * screenHeight)

const X_AXIS = new Vector3(1, 0, 0)

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

type Moving = 'Idle' | 'Walk'
type Posture = 'layer' | 'predator' | 'zombie'

// the looping clip for the current state. With claws: `predator` stands in the claw stance (and walks with the
// hunch layer), `zombie` uses the pack's zombie clips, `layer` only adds the hunch to the normal clips
function baseRole(rig: Rig, moving: Moving, form: Form, eq: Equipped, posture: Posture) {
  const beast = rig.zombie && claws(form) > 0 ? posture : 'layer'
  if (moving === 'Walk') return beast === 'zombie' ? 'ClawWalk' : 'Walk'
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
  attack: { name: Attack; n: number } | null
  pose: PoseValues
}

function Mercenary({ rig, url, look, moving, dir, auto, onTurn, form, eq, race, posture, attack, pose }: Props) {
  const group = useRef<Group>(null)
  const { scene, animations } = useGLTF(url)
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
  const role = baseRole(rig, moving, form, eq, posture)
  const baseRef = useRef(rig.clips[role])
  baseRef.current = rig.clips[role]
  const attacking = useRef(false)
  const ground = useGroundTexture()
  const turnT = useRef(0)
  const hunch = useRef(0)
  // claw pose sliders: rest frames from the bind pose, deltas recomputed when the values change
  const frames = useMemo(() => rigBones(scene), [scene])
  const turns = useMemo(() => poseTurns(frames, pose), [frames, pose])
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
  const strike = useRef<{ action: AnimationAction; out: number; returning: boolean } | null>(null)
  useEffect(() => {
    const clip = attack && rig.attacks[attack.name]
    const a = clip ? actions[clip] : null
    if (!a) return
    a.reset().setLoop(LoopOnce, 1)
    a.clampWhenFinished = true
    a.fadeIn(CONFIG.attackIn).play()
    actions[baseRef.current]?.fadeOut(CONFIG.attackIn)
    attacking.current = true
    strike.current = { action: a, out: Math.min(CONFIG.attackOut, a.getClip().duration * 0.4), returning: false }
    return () => {
      a.fadeOut(CONFIG.attackIn) // a newer attack interrupts this one
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
    if (st && !st.returning && st.action.time >= st.action.getClip().duration - st.out) {
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
    const walking = moving === 'Walk' && !attacking.current
    if (walking && !reduced) {
      // the ground slides under the hero opposite to where it faces, at the clip's own speed
      const d = ((rig.speed[role as 'Walk'] ?? 0) * dt) / CONFIG.ground.tile
      ground.offset.x += Math.sin(yaw) * d
      ground.offset.y -= Math.cos(yaw) * d
    }
    // the hunch grows with the claws: half with one, full with two (none when the rig's hunched clips are used)
    const target = role === 'ClawIdle' || role === 'ClawWalk' || role === 'ClawStance' ? 0 : claws(form) / 2
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
  const [heroPx, setHeroPx] = useState<(typeof CONFIG.heroPixels)[number]>('80')
  const [race, setRace] = useState<Race>('vampire')
  const [form, setForm] = useState<Form>(HUMAN)
  const [eq, setEq] = useState<Equipped>({ sword: true, shield: true })
  const [posture, setPosture] = useState<Posture>('layer') // claws: the normal idle, hunched (no separate stance)
  const [attack, setAttack] = useState<{ name: Attack; n: number } | null>(null)
  const [pose, setPose] = useState<PoseValues>(savedPose)
  const [saved, setSaved] = useState('')
  const savePose = async () => {
    const res = await fetch('/__save?path=src/animations/013-d2-character/claw-pose.json', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(Object.entries(pose).filter(([, v]) => v)), null, 2) + '\n',
    })
    setSaved(res.ok ? 'saved' : 'save failed (dev server only)')
  }
  const [screenHeight, setScreenHeight] = useState(window.innerHeight)
  const rig: Rig = RIGS[rigId]
  const ch = CHARACTERS[character] as { url: string; skin: 'baked' | 'texture'; hair?: string }
  const url = rigId === 'ual' ? ch.url : rig.url
  const look = rigId === 'ual' ? ch : { skin: 'baked' as const }
  const attacks = useMemo(() => attacksOf(form, eq).filter((a) => rig.attacks[a]), [form, eq, rig])
  const trigger = (a: Attack) => setAttack((p) => ({ name: a, n: (p?.n ?? 0) + 1 }))

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
  const { torch, moon, ambient } = CONFIG

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
        {race === 'vampire' && rig.zombie && (
          <Choice name="Hunch" value={posture} options={['layer', 'predator', 'zombie'] as const} onChange={setPosture} />
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
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {(['Idle', 'Walk'] as const).map((c) => (
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
        <button style={pixel ? active : button} onClick={() => setPixel((p) => !p)}>
          {pixel ? 'Pixels' : 'Smooth'}
        </button>
      </div>
    </div>
  )
}

for (const u of [...Object.values(RIGS).map((r) => r.url), ...Object.values(CHARACTERS).map((c) => c.url)]) useGLTF.preload(u)
