// The hover shape: one liquid blob (traced from reference/blob-shape.png), reused in every card with its own
// placement and blurred side. Its outline breathes slowly.

// outline points, clockwise, traced at 530×718 px and normalized: center at 0, height = 1
const TRACE: [number, number][] = [
  [78, 110], [150, 82], [260, 90], [380, 118], [432, 190], [415, 265], [375, 340], [350, 430], [320, 530],
  [290, 600], [200, 560], [100, 495], [35, 430], [22, 370], [60, 310], [120, 265], [135, 225], [105, 185], [80, 140],
]
const BLOB = TRACE.map(([x, y]) => [(x - 227) / 518, (y - 341) / 518] as const)

export type Variant = {
  x: number // center in card space (viewBox 0 0 100 190)
  y: number
  size: number // blob height in card units
  rotate: number // deg
  flip?: boolean // mirror horizontally
  soft: number // which side stays blurred, deg: 0 = right, 90 = down, 180 = left (the opposite edge is crisp)
}

const f = (n: number) => n.toFixed(2)

// closed Catmull-Rom spline through the (breathing) outline, as cubic Béziers.
// `morph` (0..1) blends in the reshaping; `loop` (0..1) is the position in its cycle, so it repeats seamlessly;
// `seed` offsets the cycle per card. At morph 0 the outline is the traced one.
export function blobPath(v: Variant, t: number, breathe: number, grow: number, morph = 0, loop = 0, seed = 0) {
  const rot = ((v.rotate + 3 * Math.sin(t * 0.35)) * Math.PI) / 180
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const s = v.size * grow
  const pts = BLOB.map(([bx, by], i) => {
    // each point swells on its own rhythm; the morph adds waves running along the outline, so neighbours move together
    const a = (loop + seed * 0.37) * Math.PI * 2
    const wave = 0.6 * Math.sin(a + i * 0.9) + 0.4 * Math.sin(2 * a - i * 2.3)
    const k = 1 + breathe * Math.sin(t * (0.6 + (i % 5) * 0.13) + i * 1.7) + morph * wave
    const x = bx * k * (v.flip ? -1 : 1)
    const y = by * k
    return [v.x + (x * cos - y * sin) * s, v.y + (x * sin + y * cos) * s]
  })
  const n = pts.length
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
  }
  return d + 'Z'
}

// axis from the crisp side to the blurred side, in card space, spanning the blob
export function softAxis(v: Variant) {
  const a = (v.soft * Math.PI) / 180
  const r = v.size * 0.45 // about the blob's half-width
  return { x1: v.x - Math.cos(a) * r, y1: v.y - Math.sin(a) * r, x2: v.x + Math.cos(a) * r, y2: v.y + Math.sin(a) * r }
}
