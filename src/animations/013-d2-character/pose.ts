// Claw pose sliders: a hand-tuned layer over the baked Claw_Stance clip (Quaternius rig). A slider turns some bones
// by `value × coef` degrees about an axis in model space (X = the character's left, Y = up, Z = forward):
// - `model` turns use the axis as it is in the current pose ("lean forward" is forward whatever the bone's roll);
// - `local` turns use the axis in the bone's rest frame, i.e. a fixed joint hinge (elbows, finger joints).
// `mirror` flips the turn for the right side. The values live in claw-pose.json (saved from the viewer); any
// three.js scene with this rig can apply them (the 012 sprite baker included).
import { Bone, Matrix4, Object3D, Quaternion, SkinnedMesh, Vector3 } from 'three'

type Axis = [number, number, number]
type Turn = { bone: string; axis: Axis; coef: number; mirror?: boolean; local?: boolean }
export type Slider = { id: string; label: string; min: number; max: number; turns: Turn[] }

const X: Axis = [1, 0, 0]
const Y: Axis = [0, 1, 0]
const Z: Axis = [0, 0, 1]
// a turn for both sides: the left bone as given, the right one mirrored when `mirror`
const both = (bone: string, axis: Axis, coef: number, mirror = true, local = false): Turn[] => [
  { bone: `${bone}_l`, axis, coef, local },
  { bone: `${bone}_r`, axis, coef, mirror, local },
]
const fingers = (coef: number): Turn[] =>
  ['index', 'middle', 'ring', 'pinky'].flatMap((f) => [1, 2, 3].flatMap((i) => both(`${f}_0${i}`, Z, coef, true, true)))

export const SLIDERS: Slider[] = [
  // thighs forward, shins back twice as much, feet forward: knees bend, the feet stay under the hips
  { id: 'crouch', label: 'Crouch', min: -20, max: 25, turns: [...both('thigh', X, -1, false), ...both('calf', X, 2, false), ...both('foot', X, -1, false)] },
  // thighs out, shins tilted back in (×1.9 ≈ undo the thigh turn and tilt by thigh/shin length): knees move, feet stay
  { id: 'knees', label: 'Knees apart', min: -20, max: 20, turns: [...both('thigh', Z, 1), ...both('calf', Z, -1.9)] },
  { id: 'feet', label: 'Feet apart', min: -12, max: 12, turns: both('thigh', Z, 1) },
  { id: 'lean', label: 'Back lean', min: -20, max: 25, turns: [{ bone: 'spine_01', axis: X, coef: 0.4 }, { bone: 'spine_02', axis: X, coef: 0.35 }, { bone: 'spine_03', axis: X, coef: 0.25 }] },
  { id: 'neck', label: 'Neck forward', min: -25, max: 25, turns: [{ bone: 'neck_01', axis: X, coef: 1 }] },
  { id: 'chin', label: 'Chin up', min: -30, max: 30, turns: [{ bone: 'Head', axis: X, coef: -1 }] },
  { id: 'shoulders', label: 'Shoulders up', min: -15, max: 20, turns: both('clavicle', Z, 1) },
  { id: 'arms', label: 'Arms raise', min: -40, max: 40, turns: both('upperarm', X, -1, false) },
  { id: 'elbowsOut', label: 'Elbows out', min: -25, max: 30, turns: both('upperarm', Z, 1) },
  { id: 'elbowBend', label: 'Elbow bend', min: -40, max: 40, turns: both('lowerarm', Y, -1, true, true) },
  { id: 'wrists', label: 'Claws forward', min: -50, max: 50, turns: both('hand', X, 1, false) },
  { id: 'curl', label: 'Claws curl', min: -30, max: 40, turns: fingers(-1) },
]

export type PoseValues = Record<string, number>

// bones by name, with their rest orientation in model space (from the skin's bind pose) and depth in the hierarchy
export function rigBones(scene: Object3D) {
  let skinned: SkinnedMesh | undefined
  scene.traverse((o) => {
    if (!skinned && (o as SkinnedMesh).isSkinnedMesh) skinned = o as SkinnedMesh
  })
  const bones = new Map<string, { bone: Bone; rest: Quaternion; pos: Vector3; depth: number }>()
  if (!skinned) return bones
  const m = new Matrix4()
  skinned.skeleton.bones.forEach((bone, i) => {
    // boneInverses hold the inverse of each bone's world matrix at bind time, when the model sat at the origin
    // (three's Skeleton.pose() reads them the same way), so this is the rest orientation in model space
    const rest = new Quaternion()
    const pos = new Vector3()
    m.copy(skinned!.skeleton.boneInverses[i]).invert().decompose(pos, rest, new Vector3())
    let depth = 0
    for (let p = bone.parent; p && (p as Bone).isBone; p = p.parent) depth++
    bones.set(bone.name, { bone, rest, pos, depth })
  })
  return bones
}

export type PoseTurn = { axis: Vector3; angle: number; local: boolean }
// the turns per bone for a set of values, parents first (a child's model-space axis depends on its parent's turn)
export function poseTurns(bones: ReturnType<typeof rigBones>, values: PoseValues) {
  const byBone = new Map<string, PoseTurn[]>()
  for (const s of SLIDERS) {
    const v = values[s.id] ?? 0
    if (!v) continue
    for (const t of s.turns) {
      const b = bones.get(t.bone)
      if (!b) continue
      const axis = new Vector3(...t.axis)
      if (t.local) axis.applyQuaternion(b.rest.clone().invert()).normalize()
      const angle = (v * t.coef * (t.mirror ? -1 : 1) * Math.PI) / 180
      byBone.set(t.bone, [...(byBone.get(t.bone) ?? []), { axis, angle, local: !!t.local }])
    }
  }
  return [...byBone].map(([name, turns]) => ({ ...bones.get(name)!, turns })).sort((a, b) => a.depth - b.depth)
}

const q = new Quaternion()
const pq = new Quaternion()
const mq = new Quaternion()
const a = new Vector3()
// applies the turns (scaled by `weight`) to the current pose of `model`
export function applyTurns(model: Object3D, turns: ReturnType<typeof poseTurns>, weight: number) {
  model.getWorldQuaternion(mq)
  for (const { bone, turns: list } of turns) {
    bone.parent!.updateWorldMatrix(true, false)
    bone.parent!.getWorldQuaternion(pq).invert()
    for (const t of list) {
      if (t.local) bone.quaternion.multiply(q.setFromAxisAngle(t.axis, t.angle * weight))
      else bone.quaternion.premultiply(q.setFromAxisAngle(a.copy(t.axis).applyQuaternion(mq).applyQuaternion(pq), t.angle * weight))
    }
  }
}

// A clawed hand: open, fingers a little bent like a paw, so the claws show (the library's idle and walk clench
// fists, which hid the claws inside). Local rotations from the rest pose, the same way tools/mercenary_ual.py
// curl_hand() bends fingers: the four fingers about the model's forward axis in their rest frame, the thumb about
// its own hinge towards the palm. Applied over any clip, per hand.
// curl / thumb: degrees per joint; splay: the first joints fan out (index → pinky, degrees); length: the joints move
// apart along the finger so the skin between them stretches (long thin fingers, the bones don't scale); palm: the
// knuckles move away from the wrist
export const CLAW_HAND = { curl: [12, 22, 18], thumb: [10, 15, 10], splay: [-10, -3, 5, 12], length: 1.8, palm: 1.25 }
export function clawHandPose(bones: ReturnType<typeof rigBones>, side: 'l' | 'r') {
  const out = new Map<Bone, Quaternion>()
  const x = side === 'l' ? 1 : -1
  const localRest = (name: string) => {
    const b = bones.get(name)!
    const parent = bones.get(b.bone.parent!.name)
    return parent ? parent.rest.clone().invert().multiply(b.rest) : b.rest.clone()
  }
  const set = (name: string, axisModel: Vector3, deg: number) => {
    const b = bones.get(name)
    if (!b) return
    const axis = axisModel.clone().applyQuaternion(b.rest.clone().invert()).normalize()
    out.set(b.bone, localRest(name).multiply(new Quaternion().setFromAxisAngle(axis, (deg * Math.PI) / 180)))
  }
  // Blender's +Y (backwards) is three's -Z; the right hand mirrors the turn
  ;['index', 'middle', 'ring', 'pinky'].forEach((f, k) =>
    CLAW_HAND.curl.forEach((deg, i) => {
      set(`${f}_0${i + 1}_${side}`, new Vector3(0, 0, -1), deg * x)
      // the fan: about the palm normal (palms face down in the rest pose), before the curl
      if (i === 0) {
        const b = bones.get(`${f}_01_${side}`)
        if (!b) return
        const axis = new Vector3(0, -1, 0).applyQuaternion(b.rest.clone().invert()).normalize()
        out.get(b.bone)?.multiply(new Quaternion().setFromAxisAngle(axis, (CLAW_HAND.splay[k] * x * Math.PI) / 180))
      }
    }),
  )
  const palm = bones.get(`middle_01_${side}`)?.pos.clone().add(new Vector3(0, -0.03, 0))
  CLAW_HAND.thumb.forEach((deg, i) => {
    const b = bones.get(`thumb_0${i + 1}_${side}`)
    const child = bones.get(`thumb_0${i + 2}_${side}`) ?? bones.get(`thumb_04_leaf_${side}`)
    if (!b || !child || !palm) return
    const dir = child.pos.clone().sub(b.pos)
    set(b.bone.name, dir.cross(palm.clone().sub(b.pos)).normalize(), deg)
  })
  return out
}

// how far each finger joint moves from its parent for a clawed hand (position scale)
export function clawHandStretch(bones: ReturnType<typeof rigBones>, side: 'l' | 'r') {
  const out = new Map<Bone, number>()
  for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
    const first = bones.get(`${f}_01_${side}`)
    if (first && f !== 'thumb') out.set(first.bone, CLAW_HAND.palm)
    for (const i of [2, 3]) {
      const b = bones.get(`${f}_0${i}_${side}`)
      if (b) out.set(b.bone, CLAW_HAND.length)
    }
  }
  return out
}
