// Line figures inside the card icons. Each returns an SVG path `d` in a 64×64 box (center 32,32, circle r=30)
// for draw-in progress p (0 = nothing, 1 = full figure) and time t (s) for the idle motion.

const C = 32
const R = 30
const f = (n: number) => n.toFixed(2)
const line = (x1: number, y1: number, x2: number, y2: number) => `M${f(C + x1)} ${f(C + y1)}L${f(C + x2)} ${f(C + y2)}`
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
// sub-progress of a stage that runs from a to b inside p
const stage = (p: number, a: number, b: number) => ease(clamp01((p - a) / (b - a)))
// half-width of the circle at height y
const chord = (y: number) => Math.sqrt(Math.max(0, R * R - y * y))
const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  if (Math.abs(a1 - a0) < 0.01) return ''
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0
  const sweep = a1 > a0 ? 1 : 0
  return `M${f(C + cx + r * Math.cos(a0))} ${f(C + cy + r * Math.sin(a0))}A${f(r)} ${f(r)} 0 ${large} ${sweep} ${f(C + cx + r * Math.cos(a1))} ${f(C + cy + r * Math.sin(a1))}`
}

type Figure = (p: number, t: number) => string

// 01: clock — a vertical diameter and two hands that slowly drift
const clock: Figure = (p, t) => {
  const d = stage(p, 0, 0.5) * R
  const h = stage(p, 0.35, 1) * R
  const a1 = 0.05 + 0.25 * Math.sin(t * 0.5)
  const a2 = 0.75 + 0.2 * Math.sin(t * 0.37 + 1)
  return line(0, -d, 0, d) + line(0, 0, h * Math.cos(a1), h * Math.sin(a1)) + line(0, 0, h * Math.cos(a2), h * Math.sin(a2))
}

// 02: cone — lines from points on the bottom arc meet at an apex that rises to the top
const cone: Figure = (p, t) => {
  const s = stage(p, 0, 1)
  const apexY = lerp(R * 0.85, -R, s)
  const apexX = 1.5 * Math.sin(t * 0.6)
  return [-0.62, -0.22, 0.22, 0.62]
    .map((k, i) => {
      const x = (k + 0.05 * Math.sin(t * 0.8 + i)) * R
      return line(x, chord(x), apexX, apexY)
    })
    .join('')
}

// 03: bars — five vertical lines spread out from the center, heights breathing
const bars: Figure = (p, t) => {
  const spread = stage(p, 0.2, 0.9)
  const grow = stage(p, 0, 0.6)
  return [-2, -1, 0, 1, 2]
    .map((k) => {
      const x = k * 0.2 * R * spread
      const hh = grow * R * 0.36 * (1 + 0.12 * Math.sin(t * 1.3 + k * 1.1))
      return line(x, -hh, x, hh)
    })
    .join('')
}

// 04: ball — dot → horizontal line → small ring, then two cups open above and below
const ball: Figure = (p, t) => {
  const w = stage(p, 0, 0.35) * R
  const ring = stage(p, 0.25, 0.6) * R * 0.22
  const cup = stage(p, 0.5, 1)
  const dip = (0.22 + 0.04 * Math.sin(t * 0.7)) * R // how far the cups bend toward the ring
  let d = line(-w, 0, w, 0)
  if (ring > 0.3) d += arc(0, 0, ring, 0, Math.PI * 2 - 0.001)
  if (cup > 0.01) {
    for (const sgn of [-1, 1]) {
      const y = sgn * R * 0.62
      const x = chord(y)
      const cy = sgn * (R * 0.62 - dip * 2 * cup)
      d += `M${f(C - x)} ${f(C + y)}Q${f(C)} ${f(C + cy)} ${f(C + x)} ${f(C + y)}`
    }
  }
  return d
}

// 05: stripes — horizontal lines fill the lower half, sliding in from the right; the level bobs
const stripes: Figure = (p, t) => {
  const bob = 1.2 * Math.sin(t * 0.8)
  return [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const s = stage(p, i * 0.1, 0.5 + i * 0.1)
      if (s <= 0) return ''
      const y = R * (0.08 + i * 0.16) + bob
      const x = chord(y) - 0.5
      return line(x, y + (1 - s) * 3, lerp(x, -x, s), y)
    })
    .join('')
}

// 06: whirl — nested arcs sweep open and slowly turn at different speeds
const whirl: Figure = (p, t) =>
  [0.28, 0.48, 0.68, 0.88]
    .map((k, i) => {
      const s = stage(p, i * 0.12, 0.6 + i * 0.12)
      const start = -0.6 + t * (0.15 + i * 0.07) * (i % 2 ? -1 : 1)
      const off = (1 - k) * R * 0.35 // circles shift right-down, so they nest off-center
      return arc(off * 0.7, off * 0.5, k * R, start, start + s * 4.9)
    })
    .join('')

// 07: cross — two diameters grow from the center and sway a little
const cross: Figure = (p, t) => {
  const a = 0.08 * Math.sin(t * 0.5)
  const l1 = stage(p, 0, 0.6) * R
  const l2 = stage(p, 0.3, 1) * R
  const c = Math.cos(a)
  const s = Math.sin(a)
  return line(-l1 * s, -l1 * c, l1 * s, l1 * c) + line(-l2 * c, l2 * s, l2 * c, -l2 * s)
}

export const FIGURES: Figure[] = [clock, cone, bars, ball, stripes, whirl, cross]
