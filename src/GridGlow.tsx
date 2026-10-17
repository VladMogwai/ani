import { useEffect, useRef } from 'react'

// Cells of the panel grid that light up in palette colors: random sparkles plus a light pulse running along the grid lines like a snake
const CONFIG = {
  cell: 32, // must match the grid size in .panel background
  sparkleEvery: 700, // ms between random cells
  sparkleDuration: [2000, 4000], // ms
  sparkleAlpha: 0.65,
  snakeStep: 110, // ms per grid segment
  snakeStart: 3, // length in segments of the first pulse, +1 on every next crossing
  snakeMax: 15, // after this length it starts over from snakeStart
  snakeTurn: 0.12, // chance to turn on each step
  snakeStraight: 3, // steps without turns after entering
  snakePause: [1500, 3000], // ms between crossings
  snakeAlpha: [0.85, 0], // head, tail
  snakeWidth: 2, // px
  snakeGlow: 12, // px, soft halo around the line
  snakeHead: 2.5, // px, radius of the head dot
  fadeIn: 0.15, // share of a cell's lifetime
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

// Color at t (0..1) along the palette, blending smoothly between neighbouring hex colors
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const gradientAt = (palette: string[], t: number, alpha = 1) => {
  const p = t * (palette.length - 1)
  const i = Math.min(Math.floor(p), palette.length - 2)
  const a = hex(palette[i])
  const b = hex(palette[i + 1])
  const [r, g, bl] = a.map((v, k) => Math.round(v + (b[k] - v) * (p - i)))
  return `rgb(${r} ${g} ${bl} / ${alpha})`
}

export function GridGlow({ colors }: { colors: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colorsRef = useRef(colors)

  useEffect(() => {
    colorsRef.current = colors
  }, [colors])

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const { cell } = CONFIG

    let cols = 0
    let rows = 0
    let dpr = 1
    let start = new Float64Array(0)
    let dur = new Float32Array(0)
    let peak = new Float32Array(0)
    let color = new Uint8Array(0)

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      dpr = Math.min(devicePixelRatio, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      cols = Math.ceil(width / cell)
      rows = Math.ceil(height / cell)
      const n = cols * rows
      start = new Float64Array(n).fill(-Infinity)
      dur = new Float32Array(n).fill(1)
      peak = new Float32Array(n)
      color = new Uint8Array(n)
    }

    const light = (i: number, at: number, d: number, a: number, c: number) => {
      start[i] = at
      dur[i] = d
      peak[i] = a
      color[i] = c
    }

    // Pulse: travels along grid-line vertices, enters from a random side, wanders with random turns
    // and leaves through any other side
    const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] // up, right, down, left; side k is exited by moving in DIRS[k]
    let body: [number, number][] = []
    let dir = 0
    let entrySide = 0
    let steps = 0
    let length = CONFIG.snakeStart - 1
    let nextStep = performance.now() + 1500
    let alive = false

    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= cols && y <= rows
    const occupied = (x: number, y: number) => body.some(([bx, by]) => bx === x && by === y)

    const spawn = () => {
      length = length >= CONFIG.snakeMax ? CONFIG.snakeStart : length + 1
      entrySide = Math.floor(Math.random() * 4)
      dir = (entrySide + 2) % 4 // move inwards
      const x = entrySide === 1 ? cols : entrySide === 3 ? 0 : 1 + Math.floor(Math.random() * (cols - 1))
      const y = entrySide === 2 ? rows : entrySide === 0 ? 0 : 1 + Math.floor(Math.random() * (rows - 1))
      body = [[x, y]]
      steps = 0
      alive = true
    }

    const step = () => {
      const [hx, hy] = body[0]
      const free = (d: number) => {
        const nx = hx + DIRS[d][0]
        const ny = hy + DIRS[d][1]
        // leaving is allowed through any side except the one it came from
        return inside(nx, ny) ? !occupied(nx, ny) : d !== entrySide
      }
      const turns = [(dir + 1) % 4, (dir + 3) % 4].filter(free)
      const wantTurn = steps >= CONFIG.snakeStraight && Math.random() < CONFIG.snakeTurn
      if ((wantTurn || !free(dir)) && turns.length) dir = turns[Math.floor(Math.random() * turns.length)]
      body.unshift([hx + DIRS[dir][0], hy + DIRS[dir][1]])
      if (body.length > length + 1) body.pop()
      steps++
      if (body.every(([x, y]) => !inside(x, y))) {
        alive = false
        nextStep = performance.now() + rand(CONFIG.snakePause[0], CONFIG.snakePause[1])
      }
    }

    let nextSparkle = 0
    let raf = 0

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!cols) return
      if (now >= nextSparkle) {
        const i = Math.floor(Math.random() * cols * rows)
        light(i, now, rand(CONFIG.sparkleDuration[0], CONFIG.sparkleDuration[1]), CONFIG.sparkleAlpha, Math.floor(Math.random() * 8))
        nextSparkle = now + CONFIG.sparkleEvery
      }
      if (now - nextStep > 1000) nextStep = now // don't replay a hidden tab's backlog
      while (now >= nextStep) {
        if (!alive) spawn()
        else step()
        if (alive) nextStep += CONFIG.snakeStep
      }

      const palette = colorsRef.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cols * cell, rows * cell)
      for (let i = 0; i < start.length; i++) {
        const t = (now - start[i]) / dur[i]
        if (t < 0 || t > 1) continue
        const env = t < CONFIG.fadeIn ? t / CONFIG.fadeIn : (1 - (t - CONFIG.fadeIn) / (1 - CONFIG.fadeIn)) ** 2
        ctx.globalAlpha = peak[i] * env
        ctx.fillStyle = palette[color[i] % palette.length]
        // inset by the 1px grid line so the lines stay visible
        ctx.fillRect((i % cols) * cell + 1, Math.floor(i / cols) * cell + 1, cell - 1, cell - 1)
      }
      if (alive && body.length > 1) {
        // head slides from the previous vertex to the current one; once full length, the tail follows
        const p = Math.min(1, Math.max(0, 1 - (nextStep - now) / CONFIG.snakeStep))
        const at = ([x, y]: [number, number]): [number, number] => [x * cell + 0.5, y * cell + 0.5]
        const lerp = (a: [number, number], b: [number, number], k: number): [number, number] => {
          const [ax, ay] = at(a)
          const [bx, by] = at(b)
          return [ax + (bx - ax) * k, ay + (by - ay) * k]
        }
        const n = body.length
        const pts = body.map(at)
        pts[0] = lerp(body[1], body[0], p)
        if (n > length) pts[n - 1] = lerp(body[n - 1], body[n - 2], p)

        // head to tail runs through the whole palette and fades out
        const [head, tail] = CONFIG.snakeAlpha
        const color = (k: number, a: number) => gradientAt(palette, Math.min(1, k / length), a)
        ctx.globalAlpha = 1
        ctx.lineWidth = CONFIG.snakeWidth
        ctx.lineCap = 'round'
        ctx.shadowBlur = CONFIG.snakeGlow * dpr
        for (let k = 0; k < n - 1; k++) {
          const a0 = head + (tail - head) * (k / (n - 1))
          const a1 = head + (tail - head) * ((k + 1) / (n - 1))
          const g = ctx.createLinearGradient(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1])
          g.addColorStop(0, color(k, a0))
          g.addColorStop(1, color(k + 1, a1))
          ctx.strokeStyle = g
          ctx.shadowColor = color(k, a0)
          ctx.beginPath()
          ctx.moveTo(pts[k][0], pts[k][1])
          ctx.lineTo(pts[k + 1][0], pts[k + 1][1])
          ctx.stroke()
        }
        ctx.fillStyle = ctx.shadowColor = color(0, 1)
        ctx.beginPath()
        ctx.arc(pts[0][0], pts[0][1], CONFIG.snakeHead, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="grid-glow" aria-hidden />
}
