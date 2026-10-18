import { useEffect, useRef } from 'react'
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { ScreenFrame } from '../../shared/ScreenFrame'
import { loadAnim, unitMeta } from './sheets'
import type { UnitSheets } from './units'

const CONFIG = {
  tile: { w: 128, h: 64 }, // isometric cell (2:1)
  grid: { cols: 9, rows: 7 },
  floor: { fill: 0x3a3833, line: 0x4a4740 },
  shadow: { rx: 22, ry: 11, alpha: 0.35 },
  label: { color: 0xe8e2d0, size: 14, below: 22 },
  // every unit stands on its own cell, turns through the 8 directions and plays its animations in turn
  rows: [2, 5], // grid rows the units stand on, `perRow` units each
  perRow: 7,
  turn: 1.2, // s per direction while idle
  showEvery: 4, // s between special animations
  order: [
    'knight', 'mage', 'barbarian', 'ranger', 'rogue', 'rogueHooded', 'skeleton', // KayKit as they come
    'guard', 'vampire', 'necromancer', 'druid', 'innkeeper', 'bandit', // built with the constructor
  ],
}

type Unit = {
  sprite: Sprite
  frames: Record<string, Texture[][]>
  meta: UnitSheets
  dir: number
  anim: string
  start: number
  specials: string[]
  next: number
}

// Character showcase (?units): every unit on its own cell, turning and playing its animations in turn.
export default function Showcase() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const app = new Application()
    let cancelled = false

    const start = async () => {
      await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, resolution: devicePixelRatio, autoDensity: true })
      if (cancelled) return app.destroy(true)
      host.appendChild(app.canvas)

      const world = new Container()
      app.stage.addChild(world)
      const { w, h } = CONFIG.tile
      // a staggered isometric grid: col steps right, every other row is shifted by half a cell
      const center = (col: number, row: number) => ({ x: col * w - (row % 2) * (w / 2), y: (row * h) / 2 })

      const floor = new Graphics()
      for (let row = 0; row < CONFIG.grid.rows; row++)
        for (let col = 0; col < CONFIG.grid.cols; col++) {
          const c = center(col, row)
          floor
            .poly([c.x, c.y - h / 2, c.x + w / 2, c.y, c.x, c.y + h / 2, c.x - w / 2, c.y])
            .fill({ color: CONFIG.floor.fill })
            .stroke({ color: CONFIG.floor.line, width: 1 })
        }
      const shadows = new Container()
      world.addChild(floor, shadows)

      const names = CONFIG.order.filter((n) => unitMeta(n))
      if (names.length < CONFIG.order.length) console.warn('012: some units are not baked yet, open ?bake')

      // the scene starts as soon as every unit's idle sheet is in; the other animations load in the background
      const idles = await Promise.all(names.map((n) => loadAnim(n, 'idle')))
      if (cancelled) return

      const units: Unit[] = []
      for (const [i, name] of names.entries()) {
        const meta = unitMeta(name)!
        const frames: Record<string, Texture[][]> = { idle: idles[i] }
        const pos = center((i % CONFIG.perRow) + 1, CONFIG.rows[Math.floor(i / CONFIG.perRow)])
        shadows.addChild(new Graphics().ellipse(pos.x, pos.y, CONFIG.shadow.rx, CONFIG.shadow.ry).fill({ color: 0, alpha: CONFIG.shadow.alpha }))
        const sprite = new Sprite(frames.idle[2][0])
        sprite.anchor.set(0.5, 1 - meta.feet)
        sprite.scale.set(meta.frame / frames.idle[0][0].width)
        sprite.position.set(pos.x, pos.y)
        world.addChild(sprite)
        const label = new Text({ text: name, style: { fill: CONFIG.label.color, fontSize: CONFIG.label.size } })
        label.anchor.set(0.5, 0)
        label.position.set(pos.x, pos.y + CONFIG.label.below)
        world.addChild(label)
        const specials = Object.keys(meta.anims).filter((a) => a !== 'idle' && a !== 'die')
        units.push({ sprite, frames, meta, dir: 2, anim: 'idle', start: 0, specials, next: 1 + i * 0.5 })
      }

      const fit = () => {
        const b = world.getLocalBounds()
        const s = Math.min(app.screen.width / (b.width + 60), app.screen.height / (b.height + 60))
        world.scale.set(s)
        world.position.set(app.screen.width / 2 - (b.x + b.width / 2) * s, app.screen.height / 2 - (b.y + b.height / 2) * s)
      }
      fit()
      app.renderer.on('resize', fit)

      const background = async () => {
        for (const [i, name] of names.entries())
          for (const anim of Object.keys(units[i].meta.anims)) {
            if (anim === 'idle') continue
            const frames = await loadAnim(name, anim)
            if (cancelled) return
            units[i].frames[anim] = frames
          }
      }
      background().catch((e) => console.error(e))

      let time = 0
      app.ticker.add((t) => {
        time += t.deltaMS / 1000
        for (const u of units) {
          // every few seconds play the next special animation (attack, cast, wave...), facing the viewer
          // (a special that has not loaded yet is skipped for now)
          if (!reduced && u.anim === 'idle' && time >= u.next && u.specials.length) {
            const next = u.specials[0]
            u.specials.push(u.specials.shift()!)
            if (u.frames[next]) {
              u.anim = next
              u.start = time
              u.dir = 2
            } else u.next = time + 0.5
          }
          const a = u.meta.anims[u.anim]
          let f = Math.floor((time - u.start) * a.fps)
          // one-shots end with their last frame, looping specials (walk, block) after `showEvery` seconds
          if (u.anim !== 'idle' && (a.loop ? time - u.start > CONFIG.showEvery : f >= a.frames)) {
            u.anim = 'idle'
            u.start = time
            u.next = time + CONFIG.showEvery
            f = 0
          }
          // while idle, turn around slowly so all 8 directions show
          if (u.anim === 'idle' && !reduced) u.dir = (2 + Math.floor(time / CONFIG.turn)) % 8
          const anim = u.meta.anims[u.anim]
          u.sprite.texture = u.frames[u.anim][u.dir][reduced ? 0 : f % anim.frames]
        }
      })
    }
    start().catch((e) => console.error(e))

    return () => {
      cancelled = true
      if (app.renderer) app.destroy(true, { children: true })
    }
  }, [])

  return (
    <ScreenFrame>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
    </ScreenFrame>
  )
}
