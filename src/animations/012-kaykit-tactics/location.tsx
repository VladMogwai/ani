import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { ScreenFrame } from '../../shared/ScreenFrame'
import { CELL, LEVELS, cellAtPoint, cellCenter, footprint, propCentre, toPicture, walkable, type LevelPicture } from './level'
import { direction, loadAnim, unitMeta } from './sheets'
import { BAKE } from './units'

// A location: the baked picture of a level of level.ts (?level=<id>, village by default), props depth-sorted with the
// hero, click a cell to walk there, and a game clock that drives day and night (colour of the whole picture + flames).

const pictureUrls = import.meta.glob<string>('./assets/levels/*/*.webp', { eager: true, import: 'default', query: '?url' })
const pictures = import.meta.glob<LevelPicture>('./assets/levels/*/level.json', { eager: true, import: 'default' })

type Sky = { h: number; color: [number, number, number]; sat: number; glow: number }

const CONFIG = {
  level: 'village', // default location
  // camera: how many cells fit across the panel (wheel zooms between min and max), how fast it catches up with the hero
  view: { cells: 11, min: 6, max: 20, follow: 5 },
  hero: { unit: 'hero', speed: 3.2 }, // speed in cells per second
  hover: { color: 0xf2d38a, path: 0.16, target: 0.35 },
  shadow: { rx: 20, ry: 10, alpha: 0.35 },
  // game clock: one game day lasts `dayLength` real seconds; hold T to run it `fast` times faster
  time: { dayLength: 240, start: 17.5, fast: 30 },
  // by hour: colour multiplied over the picture, saturation, how strongly the flames glow
  sky: [
    { h: 0, color: [0.42, 0.5, 0.85], sat: 0.6, glow: 1 },
    { h: 5, color: [0.42, 0.5, 0.85], sat: 0.6, glow: 1 },
    { h: 6.5, color: [0.95, 0.78, 0.78], sat: 0.85, glow: 0.4 },
    { h: 8, color: [1, 1, 1], sat: 1, glow: 0 },
    { h: 17, color: [1, 1, 1], sat: 1, glow: 0 },
    { h: 19, color: [1.05, 0.78, 0.6], sat: 0.9, glow: 0.5 },
    { h: 20.5, color: [0.42, 0.5, 0.85], sat: 0.6, glow: 1 },
    { h: 24, color: [0.42, 0.5, 0.85], sat: 0.6, glow: 1 },
  ] as Sky[],
  glow: { color: 0xffa040, radius: 90, alpha: 0.85, flicker: 0.12 },
  clock: { color: 0xf0e6d0, size: 16 },
}

// day phase for game logic and the clock: vampires, schedules and night quests will read this
export const phaseOf = (h: number) => (h < 5 || h >= 20.5 ? 'night' : h < 8 ? 'dawn' : h < 17 ? 'day' : 'dusk')

const skyAt = (h: number): Sky => {
  const i = CONFIG.sky.findIndex((k) => k.h > h)
  const a = CONFIG.sky[i - 1]
  const b = CONFIG.sky[i]
  const t = (h - a.h) / (b.h - a.h)
  const mix = (x: number, y: number) => x + (y - x) * t
  return { h, color: [0, 1, 2].map((c) => mix(a.color[c], b.color[c])) as Sky['color'], sat: mix(a.sat, b.sat), glow: mix(a.glow, b.glow) }
}

// colour matrix: desaturate towards luminance, then multiply by the sky colour
const skyMatrix = ({ color, sat }: Sky) => {
  const w = [0.2126, 0.7152, 0.0722]
  const m: number[] = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) m.push(((1 - sat) * w[c] + (r === c ? sat : 0)) * color[r])
    m.push(0, 0)
  }
  m.push(0, 0, 0, 1, 0)
  return m as ColorMatrixFilter['matrix']
}

// soft round light, white in the middle
const glowTexture = () => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return Texture.from(c)
}

export default function Location() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const app = new Application()
    let cancelled = false
    const cleanups: (() => void)[] = []

    const start = async () => {
      await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, resolution: devicePixelRatio, autoDensity: true })
      if (cancelled) return app.destroy(true)
      host.appendChild(app.canvas)

      const id = new URLSearchParams(location.search).get('level') ?? CONFIG.level
      const level = LEVELS[id]
      const pic = pictures[`./assets/levels/${id}/level.json`]
      const file = (name: string) => pictureUrls[`./assets/levels/${id}/${name}`]
      if (!level || !pic || !unitMeta(CONFIG.hero.unit)) {
        app.stage.addChild(new Text({ text: `Not baked yet: open ?bake, bake level "${id}" and the hero`, style: { fill: 0xffffff, fontSize: 16 } }))
        return
      }
      const res = BAKE.resolution

      // world: graded part (picture, hover, props and units) + flames on top, outside the colour filter
      const world = new Container()
      const graded = new Container()
      const sky = new ColorMatrixFilter()
      graded.filters = [sky]
      const base = new Sprite(await Assets.load<Texture>(file('base.webp')))
      base.scale.set(1 / res)
      const hover = new Graphics()
      const ground = new Container() // shadows under units
      const depth = new Container() // props and units, sorted by zIndex = picture y of their front-most point
      depth.sortableChildren = true
      const glows = new Container()
      const frontLayer = new Container() // scenery in front of the map, above the units
      graded.addChild(base, hover, ground, depth, frontLayer)
      world.addChild(graded, glows)
      app.stage.addChild(world)

      if (pic.front) {
        const f = new Sprite(await Assets.load<Texture>(file('front.webp')))
        f.scale.set(1 / res)
        frontLayer.addChild(f)
      }
      for (const [i, p] of pic.props.entries()) {
        const prop = level.props[i]
        const s = new Sprite(await Assets.load<Texture>(file(p.file)))
        s.scale.set(1 / res)
        s.anchor.set(p.ax / (s.texture.width / res), p.ay / (s.texture.height / res))
        const [cx, cz] = propCentre(prop)
        const at = toPicture(pic, cx, 0, cz)
        s.position.set(at.x, at.y)
        // big props sort by their front cell, so a unit in front of any part of them is drawn over them
        const [w, d] = footprint(prop)
        s.zIndex = cellCenter(pic, prop.cell[0] + w - 1, prop.cell[1] + d - 1).y
        depth.addChild(s)
      }
      if (cancelled) return

      const glowTex = glowTexture()
      const flames = pic.lights.map((l, i) => {
        const s = new Sprite(glowTex)
        s.anchor.set(0.5)
        s.position.set(l.x, l.y)
        s.scale.set((CONFIG.glow.radius * 2) / 128)
        s.tint = CONFIG.glow.color
        s.blendMode = 'add'
        glows.addChild(s)
        return { s, seed: i * 1.7 }
      })

      // hero
      const meta = unitMeta(CONFIG.hero.unit)!
      const anims = Object.keys(meta.anims)
      const loaded = await Promise.all(anims.map((a) => loadAnim(CONFIG.hero.unit, a)))
      if (cancelled) return
      const frames = Object.fromEntries(anims.map((a, i) => [a, loaded[i]]))
      const shadow = new Graphics().ellipse(0, 0, CONFIG.shadow.rx, CONFIG.shadow.ry).fill({ color: 0, alpha: CONFIG.shadow.alpha })
      ground.addChild(shadow)
      const sprite = new Sprite(frames.idle[2][0])
      sprite.anchor.set(0.5, 1 - meta.feet)
      sprite.scale.set(1 / res)
      depth.addChild(sprite)
      const hero = { cell: level.hero, path: [] as [number, number][], step: 0, dir: 2, anim: 'idle', start: 0 }
      const heroPos = () => {
        const a = cellCenter(pic, hero.cell[0], hero.cell[1])
        if (!hero.path.length) return a
        const b = cellCenter(pic, hero.path[0][0], hero.path[0][1])
        return { x: a.x + (b.x - a.x) * hero.step, y: a.y + (b.y - a.y) * hero.step }
      }

      // paths: breadth-first search over walkable cells, 4 neighbours
      const key = (x: number, z: number) => x * 100 + z
      const pathTo = (from: [number, number], to: [number, number]) => {
        if (!walkable(level, to[0], to[1])) return null
        const prev = new Map<number, number>([[key(...from), -1]])
        const queue = [from]
        while (queue.length) {
          const [x, z] = queue.shift()!
          if (x === to[0] && z === to[1]) break
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx
            const nz = z + dz
            if (prev.has(key(nx, nz)) || !walkable(level, nx, nz)) continue
            prev.set(key(nx, nz), key(x, z))
            queue.push([nx, nz])
          }
        }
        if (!prev.has(key(...to))) return null
        const path: [number, number][] = []
        for (let k = key(...to); prev.get(k) !== -1; k = prev.get(k)!) path.unshift([Math.floor(k / 100), k % 100])
        return path
      }
      const diamond = (x: number, z: number, alpha: number) => {
        const pts = [[0, 0], [CELL, 0], [CELL, CELL], [0, CELL]].map(([dx, dz]) => toPicture(pic, x * CELL + dx, 0, z * CELL + dz))
        hover.poly(pts.flatMap((p) => [p.x, p.y])).fill({ color: CONFIG.hover.color, alpha })
      }
      let hovered: [number, number] | null = null
      const drawHover = () => {
        hover.clear()
        if (!hovered || hero.path.length) return
        const path = pathTo(hero.cell, hovered)
        if (!path?.length) return
        for (const c of path.slice(0, -1)) diamond(c[0], c[1], CONFIG.hover.path)
        diamond(hovered[0], hovered[1], CONFIG.hover.target)
      }
      app.stage.eventMode = 'static'
      app.stage.hitArea = app.screen
      app.stage.on('pointermove', (e) => {
        const p = world.toLocal(e.global)
        const c = cellAtPoint(level, pic, p.x, p.y)
        if (c?.[0] !== hovered?.[0] || c?.[1] !== hovered?.[1]) {
          hovered = c
          drawHover()
        }
      })
      app.stage.on('pointertap', (e) => {
        const p = world.toLocal(e.global)
        const c = cellAtPoint(level, pic, p.x, p.y)
        if (!c || hero.path.length) return
        const path = pathTo(hero.cell, c)
        if (path?.length) {
          hero.path = path
          hero.step = 0
          hover.clear()
        }
      })

      // clock HUD and the fast-forward key
      const clock = new Text({ text: '', style: { fill: CONFIG.clock.color, fontSize: CONFIG.clock.size } })
      clock.position.set(16, 12)
      app.stage.addChild(clock)
      let fast = false
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'KeyT') fast = e.type === 'keydown'
      }
      addEventListener('keydown', onKey)
      addEventListener('keyup', onKey)
      cleanups.push(() => {
        removeEventListener('keydown', onKey)
        removeEventListener('keyup', onKey)
      })

      // camera: zoom so `view.cells` cell widths fit the panel, centre on the hero, never show past the picture
      const cellWidth = CELL * 2 * Math.SQRT1_2 * BAKE.ppu
      let cells = CONFIG.view.cells
      const zoom = () => {
        const s = app.screen.width / (cells * cellWidth)
        return Math.max(s, app.screen.width / pic.width, app.screen.height / pic.height) // the picture always covers the panel
      }
      const camera = { x: 0, y: 0 }
      const moveCamera = (k: number) => {
        const s = zoom()
        const target = heroPos()
        camera.x += (target.x - camera.x) * k
        camera.y += (target.y - camera.y) * k
        const halfW = app.screen.width / s / 2
        const halfH = app.screen.height / s / 2
        camera.x = Math.min(Math.max(camera.x, halfW), pic.width - halfW)
        camera.y = Math.min(Math.max(camera.y, halfH), pic.height - halfH)
        world.scale.set(s)
        world.position.set(app.screen.width / 2 - camera.x * s, app.screen.height / 2 - camera.y * s)
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        cells = Math.min(CONFIG.view.max, Math.max(CONFIG.view.min, cells * Math.exp(e.deltaY * 0.001)))
      }
      app.canvas.addEventListener('wheel', onWheel, { passive: false })
      cleanups.push(() => app.canvas.removeEventListener('wheel', onWheel))
      moveCamera(1)

      let time = 0
      let gameHours = CONFIG.time.start // hours since day 1, 00:00
      app.ticker.add((t) => {
        const dt = t.deltaMS / 1000
        time += dt
        gameHours += (dt * 24 * (fast ? CONFIG.time.fast : 1)) / CONFIG.time.dayLength
        const h = gameHours % 24
        const s = skyAt(h)
        sky.matrix = skyMatrix(s)
        for (const f of flames) {
          const flicker = reduced ? 0 : CONFIG.glow.flicker * (Math.sin(time * 9 + f.seed) * 0.6 + Math.sin(time * 23 + f.seed * 3) * 0.4)
          f.s.alpha = s.glow * CONFIG.glow.alpha * (1 + flicker)
        }
        const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0')
        clock.text = `Day ${Math.floor(gameHours / 24) + 1} · ${String(Math.floor(h)).padStart(2, '0')}:${mm} · ${phaseOf(h)}   (hold T to speed up)`

        // walking between cell centres
        if (hero.path.length) {
          const from = cellCenter(pic, hero.cell[0], hero.cell[1])
          const to = cellCenter(pic, hero.path[0][0], hero.path[0][1])
          hero.dir = direction(to.x - from.x, to.y - from.y)
          hero.step += dt * CONFIG.hero.speed
          while (hero.step >= 1 && hero.path.length) {
            hero.cell = hero.path.shift()!
            hero.step -= 1
          }
          if (!hero.path.length) {
            hero.step = 0
            drawHover()
          }
        }
        const anim = hero.path.length ? 'walk' : 'idle'
        if (anim !== hero.anim) {
          hero.anim = anim
          hero.start = time
        }
        const a = meta.anims[hero.anim]
        const f = reduced ? 0 : Math.floor((time - hero.start) * a.fps) % a.frames
        sprite.texture = frames[hero.anim][hero.dir][f]
        const p = heroPos()
        sprite.position.set(p.x, p.y)
        shadow.position.set(p.x, p.y)
        sprite.zIndex = p.y
        moveCamera(reduced ? 1 : Math.min(1, dt * CONFIG.view.follow))
      })
    }
    start().catch((e) => console.error(e))

    return () => {
      cancelled = true
      cleanups.forEach((f) => f())
      if (app.renderer) app.destroy(true, { children: true })
    }
  }, [])

  return (
    <ScreenFrame>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
    </ScreenFrame>
  )
}
