import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import { ScreenFrame } from '../../shared/ScreenFrame'
import { TILE_H, TILE_W, cellAtPoint, cellCenter, walkable } from './level'
import baseUrl from './assets/dungeon/base.png'
import lightUrl from './assets/dungeon/light.png'
import darknessUrl from './assets/dungeon/darkness.png'
import mageIdleUrl from './assets/mage/idle.png'
import mageFireballUrl from './assets/mage/fireball.png'
import mageDamagedUrl from './assets/mage/damaged.png'
import knightIdleUrl from './licensed/knight/Idle.png'
import knightHurtUrl from './licensed/knight/TakeDamage.png'

type Anim = { url: string; frames: number; fps: number; loop: boolean }

const CONFIG = {
  picture: { width: 1040, height: 720 }, // size of the exported dungeon layers
  light: { flicker: 0.12, speed: 7 }, // torch light layer: alpha wobble and its speed
  hover: { color: 0xd6b45e, alpha: 0.3 },
  ring: { rx: 17, ry: 8.5, width: 2, alpha: 0.85 },
  footShadow: { rx: 15, ry: 7, alpha: 0.45 },
  // Sprite sheets: 128px frames, one row per facing on screen, clockwise from east: E, SE, S, SW, W, NW, N, NE.
  // feet = feet height inside the frame from the bottom; frames are drawn 1:1 with the picture pixels.
  characters: {
    mage: {
      feet: 0.37,
      anims: {
        idle: { url: mageIdleUrl, frames: 14, fps: 10, loop: true },
        cast: { url: mageFireballUrl, frames: 23, fps: 12, loop: false },
        hurt: { url: mageDamagedUrl, frames: 10, fps: 12, loop: false },
      },
    },
    knight: {
      feet: 0.22,
      anims: {
        idle: { url: knightIdleUrl, frames: 15, fps: 12, loop: true },
        hurt: { url: knightHurtUrl, frames: 15, fps: 15, loop: false },
      },
    },
  } satisfies Record<string, { feet: number; anims: Record<string, Anim> }>,
  units: [
    { name: 'Mage', character: 'mage', cell: [8, 9], tint: 0xffffff, team: 0xf2c14e },
    { name: 'Dark Knight', character: 'knight', cell: [5, 7], tint: 0xa07880, team: 0xe0463e },
  ] as const,
  // the mage throws a fireball at the knight every `every` seconds, the first one `first` seconds after load
  fireball: {
    every: 30,
    first: 3,
    release: 15, // frame of the cast animation where the hand is thrust forward
    speed: 220, // px per second along the straight line
    arc: 22, // px the flight path bulges upwards in the middle
    hand: { forward: 14, up: 34 }, // launch point relative to the caster's feet, along its facing
    chest: 30, // px above the target's feet where it hits
    trailEvery: 0.016, // s between trail sparks
    colors: { glow: 0xff6a1a, body: 0xffa63a, core: 0xfff1bd },
  },
}

const FRAME = 128
type Particle = { g: Graphics; born: number; life: number; vx: number; vy: number; grow: number }

export default function Page() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const app = new Application()
    let cancelled = false
    const cleanups: (() => void)[] = []

    const start = async () => {
      // transparent canvas: the panel's own texture shows around the picture
      await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: false, roundPixels: true })
      if (cancelled) return app.destroy(true)
      host.appendChild(app.canvas)

      const animUrls = Object.values(CONFIG.characters).flatMap((c) => Object.values(c.anims).map((a: Anim) => a.url))
      const urls = [baseUrl, lightUrl, darknessUrl, ...animUrls]
      const textures = await Promise.all(urls.map((u) => Assets.load<Texture>(u)))
      if (cancelled) return
      for (const t of textures) t.source.scaleMode = 'nearest'
      const tex = (url: string) => textures[urls.indexOf(url)]

      // the picture: painted base, hover highlight, units, fireball effects, then light (added) and darkness on top
      const world = new Container()
      const base = new Sprite(tex(baseUrl))
      const hover = new Graphics()
      const units = new Container()
      const fx = new Container()
      const light = new Sprite(tex(lightUrl))
      light.blendMode = 'add'
      const darkness = new Sprite(tex(darknessUrl))
      world.addChild(base, hover, units, fx, light, darkness)
      app.stage.addChild(world)

      // cut every animation sheet into [direction][frame] textures
      const cut = (a: Anim) =>
        Array.from({ length: 8 }, (_, row) =>
          Array.from({ length: a.frames }, (_, f) => new Texture({ source: tex(a.url).source, frame: new Rectangle(f * FRAME, row * FRAME, FRAME, FRAME) })),
        )

      // units: foot shadow, team ring, then the sprite; `anim` + `animStart` say what is playing
      const built = CONFIG.units.map((u) => {
        const character = CONFIG.characters[u.character]
        const anims: Record<string, Anim> = character.anims
        const frames = Object.fromEntries(Object.entries(anims).map(([name, a]) => [name, cut(a)]))
        const p = cellCenter(u.cell[0], u.cell[1])
        const group = new Container()
        group.position.set(p.x, p.y)
        const ground = new Graphics()
          .ellipse(0, 0, CONFIG.footShadow.rx, CONFIG.footShadow.ry)
          .fill({ color: 0x000000, alpha: CONFIG.footShadow.alpha })
        const ring = new Graphics().ellipse(0, 0, CONFIG.ring.rx, CONFIG.ring.ry).stroke({ color: u.team, width: CONFIG.ring.width })
        const sprite = new Sprite(frames.idle[2][0])
        sprite.anchor.set(0.5, 1 - character.feet)
        sprite.tint = u.tint
        group.addChild(ground, ring, sprite)
        units.addChild(group)
        return { anims, frames, sprite, ring, pos: p, dir: 2, anim: 'idle', animStart: 0, offset: Math.random() * 10 }
      })
      type Unit = (typeof built)[number]
      units.children.sort((a, b) => a.y - b.y) // draw nearer units last
      const play = (u: Unit, name: string, at: number) => {
        u.anim = name
        u.animStart = at
      }

      // cover the whole panel: the picture is scaled until both sides are filled, the overflow is cropped
      const layout = () => {
        const scale = Math.max(app.screen.width / CONFIG.picture.width, app.screen.height / CONFIG.picture.height)
        world.scale.set(scale)
        world.position.set(
          Math.round((app.screen.width - CONFIG.picture.width * scale) / 2),
          Math.round((app.screen.height - CONFIG.picture.height * scale) / 2),
        )
      }
      layout()
      app.renderer.on('resize', layout)

      // hover: highlight the floor cell under the pointer
      const onMove = (e: PointerEvent) => {
        const r = app.canvas.getBoundingClientRect()
        const px = (e.clientX - r.left - world.x) / world.scale.x
        const py = (e.clientY - r.top - world.y) / world.scale.y
        const c = cellAtPoint(px, py)
        hover.clear()
        if (!c || !walkable(c)) return
        const p = cellCenter(c.x, c.z)
        hover
          .poly([p.x, p.y - TILE_H / 2, p.x + TILE_W / 2, p.y, p.x, p.y + TILE_H / 2, p.x - TILE_W / 2, p.y])
          .fill({ color: CONFIG.hover.color, alpha: CONFIG.hover.alpha })
      }
      const onLeave = () => hover.clear()
      host.addEventListener('pointermove', onMove)
      host.addEventListener('pointerleave', onLeave)
      cleanups.push(() => {
        host.removeEventListener('pointermove', onMove)
        host.removeEventListener('pointerleave', onLeave)
      })

      // --- fireball: glowing orb with a spark trail, burst and ring on impact
      const FB = CONFIG.fireball
      const particles: Particle[] = []
      const spark = (x: number, y: number, at: number, opts: { r: number; color: number; life: number; vx?: number; vy?: number; grow?: number; ring?: boolean }) => {
        const g = new Graphics()
        if (opts.ring) g.circle(0, 0, opts.r).stroke({ color: opts.color, width: 2 })
        else g.circle(0, 0, opts.r).fill({ color: opts.color })
        g.position.set(x, y)
        g.blendMode = 'add'
        fx.addChild(g)
        particles.push({ g, born: at, life: opts.life, vx: opts.vx ?? 0, vy: opts.vy ?? 0, grow: opts.grow ?? -0.6 })
      }
      const orb = new Graphics()
        .circle(0, 0, 8).fill({ color: FB.colors.glow, alpha: 0.35 })
        .circle(0, 0, 5).fill({ color: FB.colors.body, alpha: 0.85 })
        .circle(0, 0, 2.5).fill({ color: FB.colors.core })
      orb.blendMode = 'add'
      orb.visible = false
      fx.addChild(orb)
      let flight: { x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; target: Unit; lastSpark: number } | null = null
      let nextCast = FB.first
      let released = false

      const [caster, victim] = built
      const throwAt = (time: number) => {
        const a = (caster.dir * Math.PI) / 4
        const x0 = caster.pos.x + Math.cos(a) * FB.hand.forward
        const y0 = caster.pos.y + Math.sin(a) * FB.hand.forward * 0.5 - FB.hand.up
        const x1 = victim.pos.x
        const y1 = victim.pos.y - FB.chest
        flight = { x0, y0, x1, y1, t0: time, dur: Math.hypot(x1 - x0, y1 - y0) / FB.speed, target: victim, lastSpark: time }
        orb.visible = true
      }
      const impact = (x: number, y: number, time: number, target: Unit) => {
        spark(x, y, time, { r: 4, color: FB.colors.core, life: 0.35, ring: true, grow: 4 })
        spark(x, y, time, { r: 9, color: FB.colors.glow, life: 0.25, grow: 1.5 })
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2
          const v = 40 + Math.random() * 70
          spark(x, y, time, { r: 1.5 + Math.random() * 1.5, color: i % 3 ? FB.colors.body : FB.colors.core, life: 0.4 + Math.random() * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 20 })
        }
        play(target, 'hurt', time)
      }

      let time = 0
      app.ticker.add((ticker) => {
        const dt = ticker.deltaMS / 1000
        time += dt
        if (!reduced) light.alpha = 1 - CONFIG.light.flicker * (0.5 + 0.5 * Math.sin(time * CONFIG.light.speed) * Math.sin(time * 2.3))

        // schedule: start casting, release the orb on the release frame
        if (!reduced && time >= nextCast) {
          play(caster, 'cast', time)
          released = false
          nextCast += FB.every
        }
        if (caster.anim === 'cast' && !released && (time - caster.animStart) * caster.anims.cast.fps >= FB.release) {
          released = true
          throwAt(time)
        }

        // the orb flies along a shallow arc and leaves sparks behind
        if (flight) {
          const k = Math.min(1, (time - flight.t0) / flight.dur)
          const x = flight.x0 + (flight.x1 - flight.x0) * k
          const y = flight.y0 + (flight.y1 - flight.y0) * k - Math.sin(Math.PI * k) * FB.arc
          orb.position.set(x, y)
          orb.scale.set(1 + Math.sin(time * 40) * 0.12)
          while (time - flight.lastSpark > FB.trailEvery) {
            flight.lastSpark += FB.trailEvery
            spark(x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4, time, {
              r: 1.5 + Math.random() * 2,
              color: Math.random() > 0.4 ? FB.colors.body : FB.colors.glow,
              life: 0.3 + Math.random() * 0.2,
              vy: -15 - Math.random() * 15,
            })
          }
          if (k >= 1) {
            impact(x, y, time, flight.target)
            orb.visible = false
            flight = null
          }
        }

        // sparks drift, shrink or grow, and fade out
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i]
          const age = (time - p.born) / p.life
          if (age >= 1) {
            p.g.destroy()
            particles.splice(i, 1)
            continue
          }
          p.g.x += p.vx * dt
          p.g.y += p.vy * dt
          p.g.alpha = 1 - age
          p.g.scale.set(Math.max(0.1, 1 + p.grow * age))
        }

        // units: face the other unit, play the current animation, fall back to idle when a one-shot ends
        for (const u of built) {
          const other = built.find((o) => o !== u)!
          const angle = Math.atan2(other.pos.y - u.pos.y, other.pos.x - u.pos.x)
          u.dir = (Math.round(angle / (Math.PI / 4)) + 8) % 8
          let a = u.anims[u.anim]
          let frame = Math.floor((time - u.animStart) * a.fps)
          if (!a.loop && frame >= a.frames) {
            play(u, 'idle', time)
            a = u.anims.idle
            frame = 0
          }
          if (a.loop) frame = Math.floor((time + u.offset) * a.fps) % a.frames
          if (reduced) frame = 0
          u.sprite.texture = u.frames[u.anim][u.dir][frame]
          if (!reduced) u.ring.alpha = CONFIG.ring.alpha * (0.75 + 0.25 * Math.sin((time + u.offset) * 3))
        }
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
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
    </ScreenFrame>
  )
}
