import { useEffect, useRef, useState } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Sprite, Texture } from 'pixi.js'
import mapUrl from './assets/map.webp'

type Time = 'day' | 'dusk' | 'night'
type Grade = { color: [number, number, number]; sat: number; brightness: number }

const CONFIG = {
  focus: { x: 1280, y: 760 }, // map px the view starts centred on (the castle)
  startZoom: 0.75, // never less than "cover the screen"
  maxZoom: 1.6,
  contrast: 1.08,
  times: {
    day: { color: [1, 0.98, 0.94], sat: 0.85, brightness: 1.05 },
    dusk: { color: [1.12, 0.8, 0.62], sat: 0.75, brightness: 0.82 },
    night: { color: [0.48, 0.58, 0.86], sat: 0.3, brightness: 0.78 },
  } satisfies Record<Time, Grade>,
  transition: 0.035, // share of the way to the target grade per 60 fps frame
  clouds: { count: 6, size: [900, 1500], alpha: 0.28, speed: 14 }, // speed in map px per second
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// desaturate towards luminance, multiply by the time-of-day colour, then contrast around mid grey
const gradeMatrix = ({ color, sat, brightness }: Grade) => {
  const w = [0.2126, 0.7152, 0.0722]
  const k = CONFIG.contrast
  const m: number[] = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) m.push(((1 - sat) * w[c] + (r === c ? sat : 0)) * color[r] * brightness * k)
    m.push(0, 0.5 * (1 - k))
  }
  m.push(0, 0, 0, 1, 0)
  return m as ColorMatrixFilter['matrix']
}

// soft round shadow, drawn once on a 2D canvas
function cloudTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.5, 'rgba(0,0,0,0.6)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return Texture.from(c)
}

export default function Page() {
  const host = useRef<HTMLDivElement>(null)
  const [time, setTime] = useState<Time>('day')
  const target = useRef<Grade>(CONFIG.times.day)

  useEffect(() => {
    target.current = CONFIG.times[time]
  }, [time])

  useEffect(() => {
    const reduce = reducedMotion()
    const app = new Application()
    let alive = true
    const cleanups: (() => void)[] = []

    ;(async () => {
      await app.init({ resizeTo: window, background: '#0b0a09', resolution: window.devicePixelRatio, autoDensity: true })
      if (!alive) return app.destroy(true)
      host.current!.appendChild(app.canvas)
      const tex = await Assets.load<Texture>(mapUrl)
      if (!alive) return

      const world = new Container()
      const grade = new ColorMatrixFilter()
      world.filters = [grade]
      world.addChild(new Sprite(tex))
      app.stage.addChild(world)

      // drifting cloud shadows
      const cloudTex = cloudTexture()
      const { clouds: cc } = CONFIG
      const clouds = Array.from({ length: cc.count }, () => {
        const s = new Sprite(cloudTex)
        const size = cc.size[0] + Math.random() * (cc.size[1] - cc.size[0])
        s.anchor.set(0.5)
        s.width = size
        s.height = size * 0.55
        s.alpha = cc.alpha
        s.position.set(Math.random() * tex.width, Math.random() * tex.height)
        world.addChild(s)
        return s
      })
      cleanups.push(() => cloudTex.destroy(true))

      // camera: zoom + pan, clamped so the map always covers the screen
      let zoom = 1
      const coverZoom = () => Math.max(app.screen.width / tex.width, app.screen.height / tex.height)
      const clamp = () => {
        zoom = Math.min(CONFIG.maxZoom, Math.max(coverZoom(), zoom))
        world.scale.set(zoom)
        world.x = Math.min(0, Math.max(app.screen.width - tex.width * zoom, world.x))
        world.y = Math.min(0, Math.max(app.screen.height - tex.height * zoom, world.y))
      }
      const zoomAt = (sx: number, sy: number, next: number) => {
        const mx = (sx - world.x) / zoom
        const my = (sy - world.y) / zoom
        zoom = Math.min(CONFIG.maxZoom, Math.max(coverZoom(), next))
        world.x = sx - mx * zoom
        world.y = sy - my * zoom
        clamp()
      }
      zoom = app.screen.width < 600 ? coverZoom() : Math.max(coverZoom(), CONFIG.startZoom)
      world.x = app.screen.width / 2 - CONFIG.focus.x * zoom
      world.y = app.screen.height / 2 - CONFIG.focus.y * zoom
      clamp()

      const el = app.canvas
      const pointers = new Map<number, { x: number; y: number }>()
      let pinch = 0
      const onDown = (e: PointerEvent) => {
        el.setPointerCapture(e.pointerId)
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }
      const onMove = (e: PointerEvent) => {
        const p = pointers.get(e.pointerId)
        if (!p) return
        if (pointers.size === 1) {
          world.x += e.clientX - p.x
          world.y += e.clientY - p.y
          clamp()
        }
        p.x = e.clientX
        p.y = e.clientY
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, zoom * (d / pinch))
          pinch = d
        }
      }
      const onUp = (e: PointerEvent) => {
        pointers.delete(e.pointerId)
        pinch = 0
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        zoomAt(e.clientX, e.clientY, zoom * Math.exp(-e.deltaY * 0.0015))
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      el.addEventListener('pointercancel', onUp)
      el.addEventListener('wheel', onWheel, { passive: false })
      app.renderer.on('resize', clamp)
      cleanups.push(() => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
        el.removeEventListener('pointercancel', onUp)
        el.removeEventListener('wheel', onWheel)
      })

      // per frame: ease the grade towards the chosen time of day, move the clouds
      const cur: Grade = { ...CONFIG.times.day, color: [...CONFIG.times.day.color] }
      grade.matrix = gradeMatrix(cur)
      app.ticker.add((tk) => {
        const t = target.current
        const k = reduce ? 1 : 1 - Math.pow(1 - CONFIG.transition, tk.deltaTime)
        let moved = 0
        for (let i = 0; i < 3; i++) {
          moved += Math.abs(t.color[i] - cur.color[i])
          cur.color[i] += (t.color[i] - cur.color[i]) * k
        }
        moved += Math.abs(t.sat - cur.sat) + Math.abs(t.brightness - cur.brightness)
        cur.sat += (t.sat - cur.sat) * k
        cur.brightness += (t.brightness - cur.brightness) * k
        if (moved > 1e-4) grade.matrix = gradeMatrix(cur)

        if (reduce) return
        for (const s of clouds) {
          s.x += (cc.speed * tk.deltaMS) / 1000
          s.y += (cc.speed * 0.3 * tk.deltaMS) / 1000
          if (s.x - s.width / 2 > tex.width) s.x = -s.width / 2
          if (s.y - s.height / 2 > tex.height) s.y = -s.height / 2
        }
      })
    })()

    return () => {
      alive = false
      cleanups.forEach((f) => f())
      if (app.renderer) app.destroy(true, { children: true })
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', touchAction: 'none', cursor: 'grab' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 6,
          padding: 6,
          background: 'rgba(14,12,10,0.72)',
          border: '1px solid rgba(200,180,140,0.25)',
          borderRadius: 4,
          font: '13px Georgia, serif',
        }}
      >
        {(['day', 'dusk', 'night'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTime(t)}
            style={{
              padding: '6px 14px',
              background: t === time ? 'rgba(200,170,110,0.25)' : 'transparent',
              color: t === time ? '#e9d8b0' : 'rgba(233,216,176,0.6)',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              font: 'inherit',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}
