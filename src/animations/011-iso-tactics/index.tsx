import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import { ScreenFrame } from '../../shared/ScreenFrame'
import { TILE_H, TILE_W, cellAtPoint, cellCenter, walkable } from './level'
import baseUrl from './assets/dungeon/base.png'
import lightUrl from './assets/dungeon/light.png'
import darknessUrl from './assets/dungeon/darkness.png'
import mageIdleUrl from './assets/mage/idle.png'
import knightIdleUrl from './licensed/knight/Idle.png'

const CONFIG = {
  picture: { width: 1040, height: 720 }, // size of the exported dungeon layers
  light: { flicker: 0.12, speed: 7 }, // torch light layer: alpha wobble and its speed
  hover: { color: 0xd6b45e, alpha: 0.3 },
  ring: { rx: 17, ry: 8.5, width: 2, alpha: 0.85 },
  footShadow: { rx: 15, ry: 7, alpha: 0.45 },
  // Sprite sheets: 128px frames, one row per facing on screen, clockwise from east: E, SE, S, SW, W, NW, N, NE.
  // feet = feet height inside the frame from the bottom; frames are drawn 1:1 with the picture pixels.
  characters: {
    mage: { idle: mageIdleUrl, frames: 14, fps: 10, feet: 0.37 },
    knight: { idle: knightIdleUrl, frames: 15, fps: 12, feet: 0.22 },
  },
  units: [
    { name: 'Mage', character: 'mage', cell: [8, 9], tint: 0xffffff, team: 0xf2c14e },
    { name: 'Dark Knight', character: 'knight', cell: [5, 7], tint: 0xa07880, team: 0xe0463e },
  ] as const,
}

const FRAME = 128

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

      const urls = [baseUrl, lightUrl, darknessUrl, ...Object.values(CONFIG.characters).map((c) => c.idle)]
      const textures = await Promise.all(urls.map((u) => Assets.load<Texture>(u)))
      if (cancelled) return
      for (const t of textures) t.source.scaleMode = 'nearest'
      const tex = (url: string) => textures[urls.indexOf(url)]

      // the picture: painted base, hover highlight, units, then light (added) and darkness on top
      const world = new Container()
      const base = new Sprite(tex(baseUrl))
      const hover = new Graphics()
      const units = new Container()
      const light = new Sprite(tex(lightUrl))
      light.blendMode = 'add'
      const darkness = new Sprite(tex(darknessUrl))
      world.addChild(base, hover, units, light, darkness)
      app.stage.addChild(world)

      // units: foot shadow, team ring, then the sprite frame cut from the sheet
      const built = CONFIG.units.map((u) => {
        const sheet = CONFIG.characters[u.character]
        const sheetTex = tex(sheet.idle)
        const frames = Array.from({ length: 8 }, (_, row) =>
          Array.from({ length: sheet.frames }, (_, f) => new Texture({ source: sheetTex.source, frame: new Rectangle(f * FRAME, row * FRAME, FRAME, FRAME) })),
        )
        const p = cellCenter(u.cell[0], u.cell[1])
        const group = new Container()
        group.position.set(p.x, p.y)
        const ground = new Graphics()
          .ellipse(0, 0, CONFIG.footShadow.rx, CONFIG.footShadow.ry)
          .fill({ color: 0x000000, alpha: CONFIG.footShadow.alpha })
        const ring = new Graphics().ellipse(0, 0, CONFIG.ring.rx, CONFIG.ring.ry).stroke({ color: u.team, width: CONFIG.ring.width })
        const sprite = new Sprite(frames[2][0])
        sprite.anchor.set(0.5, 1 - sheet.feet)
        sprite.tint = u.tint
        group.addChild(ground, ring, sprite)
        units.addChild(group)
        return { sheet, frames, sprite, ring, pos: p, offset: Math.random() * 10 }
      })
      // draw nearer units last
      units.children.sort((a, b) => a.y - b.y)

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

      let time = 0
      app.ticker.add((ticker) => {
        time += ticker.deltaMS / 1000
        if (!reduced) light.alpha = 1 - CONFIG.light.flicker * (0.5 + 0.5 * Math.sin(time * CONFIG.light.speed) * Math.sin(time * 2.3))
        for (const b of built) {
          // face the other unit: screen angle snapped to 8 directions
          const other = built.find((o) => o !== b)!
          const angle = Math.atan2(other.pos.y - b.pos.y, other.pos.x - b.pos.x)
          const dir = (Math.round(angle / (Math.PI / 4)) + 8) % 8
          const frame = reduced ? 0 : Math.floor((time + b.offset) * b.sheet.fps) % b.sheet.frames
          b.sprite.texture = b.frames[dir][frame]
          if (!reduced) b.ring.alpha = CONFIG.ring.alpha * (0.75 + 0.25 * Math.sin((time + b.offset) * 3))
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
