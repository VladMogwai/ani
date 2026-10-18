import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import { ScreenFrame } from '../../shared/ScreenFrame'
import { TILE_H, TILE_W, cellAt, cellAtPoint, cellCenter, walkable } from './level'
import baseUrl from './assets/dungeon/base.png'
import lightUrl from './assets/dungeon/light.png'
import darknessUrl from './assets/dungeon/darkness.png'
import mageIdleUrl from './assets/mage/idle.png'
import mageFireballUrl from './assets/mage/fireball.png'
import mageDamagedUrl from './assets/mage/damaged.png'
import mageWalkUrl from './assets/mage/walk.png'
import knightIdleUrl from './licensed/knight/clean/Idle.png'
import knightHurtUrl from './licensed/knight/clean/TakeDamage.png'
import knightCastUrl from './licensed/knight/clean/CastSpell.png'
import fireballUrl from './assets/fx/fireball.png'
import fireballSheet from './assets/fx/fireball.json?raw'
import explosionUrl from './assets/fx/explosion.png'
import explosionSheet from './assets/fx/explosion.json?raw'
import darkSkullUrl from './licensed/fx/dark-vfx-1.png'
import darkSkullSheet from './licensed/fx/dark-vfx-1.json?raw'
import darkRiseUrl from './licensed/fx/dark-vfx-2.png'
import darkRiseSheet from './licensed/fx/dark-vfx-2.json?raw'
import bloodBatUrl from './licensed/fx/blood-bat.png'
import bloodBatSheet from './licensed/fx/blood-bat.json?raw'
import bloodStarUrl from './licensed/fx/blood-star.png'
import bloodStarSheet from './licensed/fx/blood-star.json?raw'
import barrelsUrl from './assets/kenney/barrelsStacked_E.png'
import cratesUrl from './assets/kenney/woodenCrates_W.png'
import chestUrl from './assets/kenney/chestClosed_W.png'
import barrelUrl from './assets/kenney/barrel_S.png'
import tableUrl from './assets/kenney/tableShortChairs_S.png'

type Anim = { url: string; frames: number; fps: number; loop: boolean }
// Aseprite "json-array" export with --list-tags: frame rectangles, per-frame durations in ms, named frame ranges
type AseSheet = {
  frames: { frame: { x: number; y: number; w: number; h: number }; duration: number }[]
  meta: { frameTags?: { name: string; from: number; to: number }[] }
}
type AseFrames = { textures: Texture[]; ms: number[]; total: number }
// where an effect sprite is placed on the target: at the hit point (chest) or on the ground under the feet
type Hit = { fx: string; at: 'chest' | 'feet'; anchor: [number, number] }

const CONFIG = {
  picture: { width: 1040, height: 720 }, // size of the exported dungeon layers
  light: { flicker: 0.12, speed: 7 }, // torch light layer: alpha wobble and its speed
  hover: { color: 0xd6b45e, alpha: 0.3 },
  ring: { rx: 17, ry: 8.5, width: 2, alpha: 0.85 },
  footShadow: { rx: 15, ry: 7, alpha: 0.45 },
  // Sprite sheets: square frames of `frame` px, one row per facing on screen, clockwise from east: E, SE, S, SW, W, NW, N, NE.
  // feet = feet height inside the frame from the bottom; `scale` maps sheet pixels to picture pixels, so a 256px sheet
  // drawn at 0.5 keeps its full detail on high-density screens.
  characters: {
    mage: {
      frame: 256,
      scale: 0.5,
      feet: 0.37,
      anims: {
        idle: { url: mageIdleUrl, frames: 14, fps: 10, loop: true },
        cast: { url: mageFireballUrl, frames: 23, fps: 12, loop: false },
        hurt: { url: mageDamagedUrl, frames: 10, fps: 12, loop: false },
        walk: { url: mageWalkUrl, frames: 9, fps: 12, loop: true },
      },
    },
    knight: {
      frame: 128,
      scale: 1,
      feet: 0.22,
      anims: {
        idle: { url: knightIdleUrl, frames: 15, fps: 12, loop: true },
        cast: { url: knightCastUrl, frames: 15, fps: 12, loop: false },
        hurt: { url: knightHurtUrl, frames: 15, fps: 15, loop: false },
      },
    },
  } satisfies Record<string, { frame: number; scale: number; feet: number; anims: Record<string, Anim> }>,
  units: [
    { name: 'Mage', character: 'mage', cell: [8, 9], tint: 0xffffff, team: 0xf2c14e },
    { name: 'Dark Knight', character: 'knight', cell: [5, 7], tint: 0xa07880, team: 0xe0463e },
  ] as const,
  // Movement: hover a floor cell to see the path, click to walk there (player unit only).
  // Steps go to the 4 neighbouring cells, at most `range` steps, up or down one height level per step.
  move: { unit: 0, range: 5, speed: 3, maxStep: 1, path: 0.18, target: 0.38 }, // speed in cells per second
  // Kenney Miniature Dungeon props (CC0, art/kenney/import-kenney.lua): 192x384 renders drawn at 0.5 (1.5x the pack's
  // own scale, its figures are smaller than ours), the pack's floor tile centre sits at `anchor`. Their cells are not walkable. `tint` pulls the beige renders towards the grey stone.
  props: {
    scale: 0.5,
    anchor: [0.5, 428 / 512] as [number, number],
    tint: 0x9a9494,
    items: [
      { url: barrelsUrl, cell: [2, 6] },
      { url: cratesUrl, cell: [2, 8] },
      { url: chestUrl, cell: [15, 10] },
      { url: barrelUrl, cell: [7, 12] },
      { url: tableUrl, cell: [13, 13] },
    ] as { url: string; cell: [number, number] }[],
  },
  // Aseprite effects: sheet + json, optionally one tag of it, drawn at `scale` (whole-number fractions keep pixels even)
  fx: {
    fireball: { url: fireballUrl, json: fireballSheet },
    explosion: { url: explosionUrl, json: explosionSheet },
    skull: { url: darkSkullUrl, json: darkSkullSheet, tag: 'fly' },
    skullHit: { url: darkSkullUrl, json: darkSkullSheet, tag: 'hit' },
    darkRise: { url: darkRiseUrl, json: darkRiseSheet },
    bloodBat: { url: bloodBatUrl, json: bloodBatSheet, scale: 0.5 },
    bloodStar: { url: bloodStarUrl, json: bloodStarSheet, scale: 0.5 },
  } as Record<string, { url: string; json: string; tag?: string; scale?: number }>,
  // Spells cast on a timer: the caster plays `cast`, the projectile leaves on frame `release` of that animation,
  // flies along an arc (sprite drawn pointing right, rotated along the path) and plays the hit effects on arrival.
  spells: [
    {
      name: 'fireball',
      caster: 0, // index in units
      target: 1,
      every: 5, // s between casts
      first: 3, // s after load for the first cast
      release: 15,
      speed: 220, // px per second along the straight line
      arc: 22, // px the path bulges upwards in the middle
      hand: { forward: 14, up: 34 }, // launch point from the caster's feet, along its facing
      chest: 30, // px above the target's feet where the projectile hits
      projectile: 'fireball',
      anchor: [10 / 16, 0.5], // the hot core of the 16px orb
      trail: { every: 0.016, colors: [0xffa63a, 0xff6a1a] }, // code-drawn sparks behind the orb
      hits: [{ fx: 'explosion', at: 'chest', anchor: [0.5, 0.5] }] as Hit[],
    },
    {
      name: 'dark skull',
      caster: 1,
      target: 0,
      every: 10, // the knight alternates the skull and the blood bat
      first: 5.5, // halfway between the mage's casts
      release: 5,
      speed: 160,
      arc: 14,
      hand: { forward: 16, up: 30 },
      chest: 28,
      projectile: 'skull',
      anchor: [0.7, 0.45], // the skull sits at the front of its 40x32 frame, the tail trails behind
      trail: null,
      hits: [
        { fx: 'darkRise', at: 'feet', anchor: [0.5, 0.92] },
        { fx: 'skullHit', at: 'chest', anchor: [0.5, 0.5] },
      ] as Hit[],
    },
    {
      name: 'blood bat',
      caster: 1,
      target: 0,
      every: 10,
      first: 10.5,
      release: 5,
      speed: 140,
      arc: 18,
      hand: { forward: 16, up: 30 },
      chest: 28,
      projectile: 'bloodBat',
      anchor: [0.5, 0.5],
      rotate: false, // the bat is drawn upright: mirror it when flying left instead of rotating
      trail: null,
      hits: [{ fx: 'bloodStar', at: 'chest', anchor: [0.5, 0.5] }] as Hit[],
    },
  ] as {
    name: string
    caster: number
    target: number
    every: number
    first: number
    release: number
    speed: number
    arc: number
    hand: { forward: number; up: number }
    chest: number
    projectile: string
    anchor: [number, number]
    rotate?: boolean
    trail: { every: number; colors: number[] } | null
    hits: Hit[]
  }[],
}

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
      // render at the screen's pixel density (2 on Retina), otherwise the browser stretches the canvas and blurs it
      await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: false, roundPixels: true, resolution: devicePixelRatio, autoDensity: true })
      if (cancelled) return app.destroy(true)
      host.appendChild(app.canvas)

      const animUrls = Object.values(CONFIG.characters).flatMap((c) => Object.values(c.anims).map((a: Anim) => a.url))
      const fxUrls = Object.values(CONFIG.fx).map((f) => f.url)
      const propUrls = CONFIG.props.items.map((p) => p.url)
      const urls = [...new Set([baseUrl, lightUrl, darknessUrl, ...fxUrls, ...animUrls, ...propUrls])]
      const textures = await Promise.all(urls.map((u) => Assets.load<Texture>(u)))
      if (cancelled) return
      for (const t of textures) t.source.scaleMode = 'nearest'
      const tex = (url: string) => textures[urls.indexOf(url)]

      // the picture: painted base, hover highlight, units, effects, then light (added) and darkness on top
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

      // Aseprite effects: textures plus frame durations (one tag or the whole sheet)
      const aseFrames = (json: string, url: string, tag?: string): AseFrames => {
        const sheet: AseSheet = JSON.parse(json)
        const range = tag ? sheet.meta.frameTags?.find((t) => t.name === tag) : null
        const frames = range ? sheet.frames.slice(range.from, range.to + 1) : sheet.frames
        const textures = frames.map((f) => new Texture({ source: tex(url).source, frame: new Rectangle(f.frame.x, f.frame.y, f.frame.w, f.frame.h) }))
        const ms = frames.map((f) => f.duration)
        return { textures, ms, total: ms.reduce((a, b) => a + b, 0) }
      }
      // frame index at `elapsed` seconds, or -1 when a one-shot is over
      const aseFrameAt = (a: AseFrames, elapsed: number, loop: boolean) => {
        let t = elapsed * 1000
        if (loop) t %= a.total
        else if (t >= a.total) return -1
        for (let i = 0; i < a.ms.length; i++) {
          if (t < a.ms[i]) return i
          t -= a.ms[i]
        }
        return a.ms.length - 1
      }
      const effects: Record<string, AseFrames> = Object.fromEntries(
        Object.entries(CONFIG.fx).map(([name, f]) => [name, aseFrames(f.json, f.url, f.tag)]),
      )
      const fxScale = (name: string) => CONFIG.fx[name].scale ?? 1

      // cut every character animation sheet into [direction][frame] textures
      const cut = (a: Anim, size: number) =>
        Array.from({ length: 8 }, (_, row) =>
          Array.from({ length: a.frames }, (_, f) => new Texture({ source: tex(a.url).source, frame: new Rectangle(f * size, row * size, size, size) })),
        )

      // units: foot shadow, team ring, then the sprite; `anim` + `animStart` say what is playing
      const built = CONFIG.units.map((u) => {
        const character = CONFIG.characters[u.character]
        const anims: Record<string, Anim> = character.anims
        const frames = Object.fromEntries(Object.entries(anims).map(([name, a]) => [name, cut(a, character.frame)]))
        const p = cellCenter(u.cell[0], u.cell[1])
        const group = new Container()
        group.position.set(p.x, p.y)
        const ground = new Graphics()
          .ellipse(0, 0, CONFIG.footShadow.rx, CONFIG.footShadow.ry)
          .fill({ color: 0x000000, alpha: CONFIG.footShadow.alpha })
        const ring = new Graphics().ellipse(0, 0, CONFIG.ring.rx, CONFIG.ring.ry).stroke({ color: u.team, width: CONFIG.ring.width })
        const sprite = new Sprite(frames.idle[2][0])
        sprite.anchor.set(0.5, 1 - character.feet)
        sprite.scale.set(character.scale)
        sprite.tint = u.tint
        group.addChild(ground, ring, sprite)
        units.addChild(group)
        return {
          anims, frames, sprite, ring, group, pos: p, dir: 2, anim: 'idle', animStart: 0, offset: Math.random() * 10,
          cell: [u.cell[0], u.cell[1]] as [number, number],
          path: [] as [number, number][], // remaining cells to walk through
          step: 0, // progress 0..1 between the current cell and path[0]
        }
      })
      // props share the units' container, so the depth sort puts them in front of or behind the characters
      for (const item of CONFIG.props.items) {
        const p = cellCenter(item.cell[0], item.cell[1])
        const prop = new Sprite(tex(item.url))
        prop.anchor.set(...CONFIG.props.anchor)
        prop.scale.set(CONFIG.props.scale)
        prop.tint = CONFIG.props.tint
        prop.position.set(p.x, p.y)
        units.addChild(prop)
      }
      const propAt = (x: number, z: number) => CONFIG.props.items.some((p) => p.cell[0] === x && p.cell[1] === z)
      type Unit = (typeof built)[number]
      const play = (u: Unit, name: string, at: number) => {
        u.anim = name
        u.animStart = at
      }
      const walking = (u: Unit) => u.path.length > 0

      // --- movement: breadth-first search over floor cells from the player's cell, within the move range
      const key = (x: number, z: number) => x * 100 + z
      const reachable = (from: Unit) => {
        const prev = new Map<number, number>([[key(from.cell[0], from.cell[1]), -1]])
        const steps = new Map<number, number>([[key(from.cell[0], from.cell[1]), 0]])
        const queue: [number, number][] = [from.cell]
        while (queue.length) {
          const [x, z] = queue.shift()!
          const k = key(x, z)
          if (steps.get(k)! >= CONFIG.move.range) continue
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz
            const nk = key(nx, nz)
            const c = cellAt(nx, nz)
            if (prev.has(nk) || !c || !walkable(c) || propAt(nx, nz)) continue
            if (Math.abs(c.h - cellAt(x, z)!.h) > CONFIG.move.maxStep) continue
            if (built.some((o) => o !== from && o.cell[0] === nx && o.cell[1] === nz)) continue
            prev.set(nk, k)
            steps.set(nk, steps.get(k)! + 1)
            queue.push([nx, nz])
          }
        }
        return prev
      }
      // path from the unit to a cell (without the start cell), or null when out of reach
      const pathTo = (u: Unit, x: number, z: number): [number, number][] | null => {
        const prev = reachable(u)
        let k = key(x, z)
        if (!prev.has(k) || prev.get(k) === -1) return null
        const path: [number, number][] = []
        while (k !== -1 && prev.get(k) !== -1) {
          path.unshift([Math.floor(k / 100), k % 100])
          k = prev.get(k)!
        }
        return path
      }
      const diamond = (g: Graphics, x: number, z: number, alpha: number) => {
        const p = cellCenter(x, z)
        g.poly([p.x, p.y - TILE_H / 2, p.x + TILE_W / 2, p.y, p.x, p.y + TILE_H / 2, p.x - TILE_W / 2, p.y]).fill({ color: CONFIG.hover.color, alpha })
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

      // hover: show the path to the floor cell under the pointer; click: walk there
      const player = built[CONFIG.move.unit]
      const cellUnder = (e: PointerEvent | MouseEvent) => {
        const r = app.canvas.getBoundingClientRect()
        return cellAtPoint((e.clientX - r.left - world.x) / world.scale.x, (e.clientY - r.top - world.y) / world.scale.y)
      }
      const onMove = (e: PointerEvent) => {
        hover.clear()
        if (walking(player)) return
        const c = cellUnder(e)
        if (!c || !walkable(c)) return
        const path = pathTo(player, c.x, c.z)
        if (!path) return
        path.slice(0, -1).forEach(([x, z]) => diamond(hover, x, z, CONFIG.move.path))
        diamond(hover, c.x, c.z, CONFIG.move.target)
      }
      const onClick = (e: MouseEvent) => {
        if (walking(player)) return
        const c = cellUnder(e)
        const path = c && walkable(c) ? pathTo(player, c.x, c.z) : null
        if (!path || !path.length) return
        player.path = path
        player.step = 0
        hover.clear()
      }
      const onLeave = () => hover.clear()
      host.addEventListener('pointermove', onMove)
      host.addEventListener('click', onClick)
      host.addEventListener('pointerleave', onLeave)
      cleanups.push(() => {
        host.removeEventListener('pointermove', onMove)
        host.removeEventListener('click', onClick)
        host.removeEventListener('pointerleave', onLeave)
      })

      // --- spells: casting state per spell, flying projectiles, one-shot effect sprites, trail sparks
      type Spell = (typeof CONFIG.spells)[number]
      const particles: Particle[] = []
      const oneShots: { sprite: Sprite; frames: AseFrames; start: number }[] = []
      const flights: { spell: Spell; sprite: Sprite; x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; lastSpark: number }[] = []
      const casting = CONFIG.spells.map((s) => ({ spell: s, next: s.first, active: false, released: false }))

      const spark = (x: number, y: number, at: number, color: number) => {
        const g = new Graphics().circle(0, 0, 1.5 + Math.random() * 2).fill({ color })
        g.position.set(x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4)
        g.blendMode = 'add'
        fx.addChild(g)
        particles.push({ g, born: at, life: 0.3 + Math.random() * 0.2, vx: 0, vy: -15 - Math.random() * 15, grow: -0.6 })
      }
      const playFx = (name: string, x: number, y: number, anchor: [number, number], time: number) => {
        const sprite = new Sprite(effects[name].textures[0])
        sprite.anchor.set(anchor[0], anchor[1])
        sprite.position.set(Math.round(x), Math.round(y))
        sprite.scale.set(fxScale(name))
        fx.addChild(sprite)
        oneShots.push({ sprite, frames: effects[name], start: time })
      }
      const launch = (spell: Spell, time: number) => {
        const caster = built[spell.caster]
        const target = built[spell.target]
        const a = (caster.dir * Math.PI) / 4
        const x0 = caster.pos.x + Math.cos(a) * spell.hand.forward
        const y0 = caster.pos.y + Math.sin(a) * spell.hand.forward * 0.5 - spell.hand.up
        const x1 = target.pos.x
        const y1 = target.pos.y - spell.chest
        const sprite = new Sprite(effects[spell.projectile].textures[0])
        sprite.anchor.set(spell.anchor[0], spell.anchor[1])
        sprite.scale.set(fxScale(spell.projectile))
        fx.addChild(sprite)
        flights.push({ spell, sprite, x0, y0, x1, y1, t0: time, dur: Math.hypot(x1 - x0, y1 - y0) / spell.speed, lastSpark: time })
      }
      const land = (spell: Spell, x: number, y: number, time: number) => {
        const target = built[spell.target]
        for (const h of spell.hits) {
          const at = h.at === 'feet' ? target.pos : { x, y }
          playFx(h.fx, at.x, at.y, h.anchor, time)
        }
        if (!walking(target)) play(target, 'hurt', time) // a walking unit keeps walking, the effects still play
      }

      let time = 0
      app.ticker.add((ticker) => {
        const dt = ticker.deltaMS / 1000
        time += dt
        if (!reduced) light.alpha = 1 - CONFIG.light.flicker * (0.5 + 0.5 * Math.sin(time * CONFIG.light.speed) * Math.sin(time * 2.3))

        // casting: start on the timer, release the projectile on the release frame
        for (const c of casting) {
          const caster = built[c.spell.caster]
          if (!reduced && time >= c.next && walking(caster)) c.next = time + 0.3 // cast once the caster stops
          if (!reduced && time >= c.next) {
            play(caster, 'cast', time)
            c.active = true
            c.released = false
            c.next += c.spell.every
          }
          if (c.active && caster.anim !== 'cast') c.active = false // interrupted, e.g. got hit while casting
          if (c.active && !c.released && (time - caster.animStart) * caster.anims.cast.fps >= c.spell.release) {
            c.released = true
            c.active = false
            launch(c.spell, time)
          }
        }

        // projectiles fly along a shallow arc, rotated along the path
        for (let i = flights.length - 1; i >= 0; i--) {
          const f = flights[i]
          const tgt = built[f.spell.target]
          f.x1 = tgt.pos.x // projectiles follow a moving target
          f.y1 = tgt.pos.y - f.spell.chest
          const k = Math.min(1, (time - f.t0) / f.dur)
          const x = f.x0 + (f.x1 - f.x0) * k
          const y = f.y0 + (f.y1 - f.y0) * k - Math.sin(Math.PI * k) * f.spell.arc
          f.sprite.position.set(Math.round(x), Math.round(y))
          const scale = fxScale(f.spell.projectile)
          if (f.spell.rotate === false) f.sprite.scale.set(f.x1 < f.x0 ? -scale : scale, scale)
          else f.sprite.rotation = Math.atan2(f.y1 - f.y0 - Math.cos(Math.PI * k) * Math.PI * f.spell.arc, f.x1 - f.x0)
          const frames = effects[f.spell.projectile]
          f.sprite.texture = frames.textures[aseFrameAt(frames, time - f.t0, true)]
          const trail = f.spell.trail
          if (trail) {
            while (time - f.lastSpark > trail.every) {
              f.lastSpark += trail.every
              spark(x, y, time, trail.colors[Math.random() > 0.4 ? 0 : 1])
            }
          }
          if (k >= 1) {
            land(f.spell, x, y, time)
            f.sprite.destroy()
            flights.splice(i, 1)
          }
        }

        // one-shot effects play through their Aseprite frames and disappear
        for (let i = oneShots.length - 1; i >= 0; i--) {
          const o = oneShots[i]
          const f = aseFrameAt(o.frames, time - o.start, false)
          if (f < 0) {
            o.sprite.destroy()
            oneShots.splice(i, 1)
          } else o.sprite.texture = o.frames.textures[f]
        }

        // sparks drift up, shrink and fade out
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
          let face = { x: other.pos.x, y: other.pos.y }
          if (walking(u)) {
            // move between cell centres; stepping up or down follows the height difference
            const from = cellCenter(u.cell[0], u.cell[1])
            const to = cellCenter(u.path[0][0], u.path[0][1])
            u.step += dt * CONFIG.move.speed
            if (u.step >= 1) {
              u.cell = u.path.shift()!
              u.step = u.path.length ? u.step - 1 : 0
            }
            const a = cellCenter(u.cell[0], u.cell[1])
            const b = u.path.length ? cellCenter(u.path[0][0], u.path[0][1]) : a
            u.pos = { x: a.x + (b.x - a.x) * u.step, y: a.y + (b.y - a.y) * u.step }
            u.group.position.set(Math.round(u.pos.x), Math.round(u.pos.y))
            face = { x: u.pos.x + (to.x - from.x), y: u.pos.y + (to.y - from.y) }
            if (u.anim !== 'walk' && walking(u)) play(u, 'walk', time)
            if (!walking(u)) play(u, 'idle', time)
          }
          const angle = Math.atan2(face.y - u.pos.y, face.x - u.pos.x)
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
        units.children.sort((a, b) => a.y - b.y) // nearer units drawn last
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
