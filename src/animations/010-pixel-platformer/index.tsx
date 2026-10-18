import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js'
import tilesUrl from './assets/tiles.png'
import charactersUrl from './assets/characters.png'
import backgroundsUrl from './assets/backgrounds.png'
import levelA from './assets/level-a.tmx?raw'
import levelB from './assets/level-b.tmx?raw'

const CONFIG = {
  tile: 18, // world units = source pixels
  charTile: 24,
  levels: [levelA, levelB], // placed side by side
  gravity: 900, // px/s²
  runSpeed: 95, // px/s
  jumpSpeed: 300, // px/s, about 2.8 tiles high
  hitbox: { w: 12, h: 18 },
  player: [0, 1], // character frames: stand, step
  stepEvery: 0.12, // s between walk frames
  idleAnimEvery: 0.4, // s, coins, flags and enemies flip frames
  autoplayAfter: 5, // s without input before the character runs by itself
  parallax: 0.3, // far hills scroll at this share of the camera speed
  horizon: 0.55, // where the hills sit, share of the level height from the top
  sky: '#dff6f5',
}

// Tile ids (in tiles.png, 20 columns) that block from every side, and platforms you can jump through from below
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const SOLID = new Set([
  ...[0, 20, 40, 60, 80, 100, 120, 140].flatMap((r) => range(r, r + 3)), // grass, dirt, snow terrain
  4, 5, 24, 25, 104, 6, 26, 9, 10, 11, 28, 29, 30, 31, 47, // dirt fill, crates, blocks
  93, 94, 95, 113, 114, 115, 132, 133, 134, 135, // pipes
])
const ONE_WAY = new Set([12, 13, 14, 15, 48, 49, 50, 146, 147, 153, 154, 155])
// two-frame tiles that flip back and forth: coin, flag
const ANIMATED: Record<number, number> = { 151: 152, 152: 151, 111: 112, 112: 111 }
const COINS = new Set([151, 152])
// characters.png: 9 columns, each character is a pair of frames side by side; the 9th column is a single frame
const partner = (f: number) => (f % 9 === 8 ? f : f - (f % 9) + ((f % 9) ^ 1))

type Layer = { name: string; data: number[] }
type Level = { width: number; height: number; layers: Layer[] }

const parseLevel = (xml: string): Level => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const map = doc.querySelector('map')!
  return {
    width: Number(map.getAttribute('width')),
    height: Number(map.getAttribute('height')),
    layers: [...doc.querySelectorAll('layer')].map((l) => ({
      name: l.getAttribute('name')!,
      data: l.querySelector('data')!.textContent!.trim().split(/\s*,\s*/).map(Number),
    })),
  }
}

// Tiled stores flips in the top 3 bits of a gid
const splitGid = (gid: number) => ({ id: gid % 0x20000000, flags: Math.floor(gid / 0x20000000) })

const frames = (tex: Texture, size: number, columns: number, count: number) =>
  Array.from({ length: count }, (_, i) =>
    new Texture({ source: tex.source, frame: new Rectangle((i % columns) * size, Math.floor(i / columns) * size, size, size) }),
  )

export default function Page() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const app = new Application()
    let cancelled = false
    const cleanups: (() => void)[] = []

    const start = async () => {
      await app.init({ resizeTo: host, background: CONFIG.sky, antialias: false, roundPixels: true })
      if (cancelled) return app.destroy(true)
      host.appendChild(app.canvas)

      const [tilesTex, charTex, bgTex] = await Promise.all([tilesUrl, charactersUrl, backgroundsUrl].map((u) => Assets.load<Texture>(u)))
      if (cancelled) return
      for (const t of [tilesTex, charTex, bgTex]) t.source.scaleMode = 'nearest'
      const tileFrames = frames(tilesTex, CONFIG.tile, 20, 180)
      const charFrames = frames(charTex, CONFIG.charTile, 9, 27)
      const T = CONFIG.tile

      // --- level: both maps side by side, solids collected from the "Tiles" layer
      const levels = CONFIG.levels.map(parseLevel)
      const rows = levels[0].height
      const cols = levels.reduce((n, l) => n + l.width, 0)
      const solid = new Uint8Array(cols * rows) // 0 empty, 1 solid, 2 one-way
      const world = new Container()
      const tileLayer = new Container()
      const actors = new Container()
      const animated: { sprite: Sprite; id: number; coin: boolean; x: number; y: number }[] = []
      const enemies: { sprite: Sprite; id: number }[] = []
      let spawn: { x: number; y: number } | null = null

      let offset = 0
      for (const level of levels) {
        for (const layer of level.layers) {
          layer.data.forEach((gid, i) => {
            if (!gid) return
            const col = offset + (i % level.width)
            const row = Math.floor(i / level.width)
            const { id, flags } = splitGid(gid)
            if (layer.name === 'Characters') {
              const frame = id - 1
              // the first green astronaut placed in the level becomes the player
              if (frame === CONFIG.player[0] && !spawn) {
                spawn = { x: col * T + T / 2, y: (row + 1) * T }
                return
              }
              const s = new Sprite(charFrames[frame])
              s.anchor.set(0.5, 1)
              s.position.set(col * T + T / 2, (row + 1) * T)
              if (flags & 4) s.scale.x = -1
              enemies.push({ sprite: s, id: frame })
              actors.addChild(s)
              return
            }
            const local = id - 28
            const s = new Sprite(tileFrames[local])
            s.anchor.set(0.5)
            s.position.set(col * T + T / 2, row * T + T / 2)
            if (flags & 4) s.scale.x = -1
            if (flags & 2) s.scale.y = -1
            if (layer.name === 'Water') s.alpha = 0.75
            tileLayer.addChild(s)
            if (local in ANIMATED) animated.push({ sprite: s, id: local, coin: COINS.has(local), x: col, y: row })
            if (layer.name === 'Tiles') {
              if (SOLID.has(local)) solid[row * cols + col] = 1
              else if (ONE_WAY.has(local)) solid[row * cols + col] = 2
            }
          })
        }
        offset += level.width
      }
      const worldW = cols * T
      const worldH = rows * T

      // --- parallax: clouds and trees strip from backgrounds.png, its ground row repeated down to the bottom
      const far = new TilingSprite({
        texture: new Texture({ source: bgTex.source, frame: new Rectangle(0, 24, 96, 48) }),
        width: worldW,
        height: 48,
      })
      const farGround = new TilingSprite({
        texture: new Texture({ source: bgTex.source, frame: new Rectangle(0, 48, 96, 24) }),
        width: worldW,
        height: worldH,
      })
      const parallax = new Container()
      parallax.addChild(farGround, far)

      // --- player
      const player = new Sprite(charFrames[CONFIG.player[0]])
      player.anchor.set(0.5, 1)
      actors.addChild(player)
      const home = spawn ?? { x: 3.5 * T, y: T }
      const p = { x: home.x, y: home.y, vx: 0, vy: 0, ground: false, face: 1, step: 0 }

      world.addChild(tileLayer, actors)
      app.stage.addChild(parallax, world)

      // --- input: arrows / WASD / space; touch: left and right thirds run, middle jumps
      const keys = new Set<string>()
      let lastInput = -Infinity
      let touchDir = 0
      let touchJump = false
      const onKey = (e: KeyboardEvent) => {
        const k = e.key.toLowerCase()
        if (!['arrowleft', 'arrowright', 'arrowup', ' ', 'a', 'd', 'w'].includes(k)) return
        e.preventDefault()
        if (e.type === 'keydown') keys.add(k)
        else keys.delete(k)
        lastInput = performance.now()
      }
      const onPointer = (e: PointerEvent) => {
        lastInput = performance.now()
        if (e.type !== 'pointerdown') return void ((touchDir = 0), (touchJump = false))
        const third = e.clientX / host.clientWidth
        if (third < 1 / 3) touchDir = -1
        else if (third > 2 / 3) touchDir = 1
        else touchJump = true
      }
      addEventListener('keydown', onKey)
      addEventListener('keyup', onKey)
      host.addEventListener('pointerdown', onPointer)
      addEventListener('pointerup', onPointer)
      cleanups.push(() => {
        removeEventListener('keydown', onKey)
        removeEventListener('keyup', onKey)
        host.removeEventListener('pointerdown', onPointer)
        removeEventListener('pointerup', onPointer)
      })

      const cell = (x: number, y: number) => {
        const c = Math.floor(x / T)
        const r = Math.floor(y / T)
        if (c < 0 || c >= cols) return 1 // world edges are walls
        if (r < 0 || r >= rows) return 0
        return solid[r * cols + c]
      }

      // back to the start; collected coins come back
      const respawn = () => {
        Object.assign(p, { x: home.x, y: home.y, vx: 0, vy: 0 })
        for (const a of animated) a.sprite.visible = true
      }

      let animClock = 0
      let animFrame = 0

      app.ticker.add((ticker) => {
        const dt = Math.min(ticker.deltaMS / 1000, 1 / 30)
        const auto = !reduced && performance.now() - lastInput > CONFIG.autoplayAfter * 1000
        const { w, h } = CONFIG.hitbox

        // intent
        let dir = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0) || touchDir
        let jump = keys.has('arrowup') || keys.has('w') || keys.has(' ') || touchJump
        if (auto) {
          // run right, hop over walls and gaps, start over at the end
          dir = 1
          const front = p.x + w / 2 + 4
          const wall = cell(front, p.y - 4) === 1 || cell(front, p.y - T) === 1
          const gap = [0, 1, 2].every((i) => !cell(front + 6, p.y + 2 + i * T))
          jump = p.ground && (wall || gap)
          if (p.x > worldW - 2 * T) respawn()
        }

        // horizontal move, then resolve against solid tiles
        p.vx = dir * CONFIG.runSpeed
        if (dir) p.face = dir
        const prevX = p.x
        p.x += p.vx * dt
        // push back only when this step crossed into a new solid column
        const tileOf = (x: number) => Math.floor(x / T)
        for (const y of [p.y - 1, p.y - h / 2, p.y - h + 1]) {
          if (p.vx > 0 && tileOf(p.x + w / 2) > tileOf(prevX + w / 2) && cell(p.x + w / 2, y) === 1) p.x = tileOf(p.x + w / 2) * T - w / 2 - 0.01
          if (p.vx < 0 && tileOf(p.x - w / 2) < tileOf(prevX - w / 2) && cell(p.x - w / 2, y) === 1) p.x = (tileOf(p.x - w / 2) + 1) * T + w / 2 + 0.01
        }

        // vertical move; one-way platforms only stop you while falling onto their top
        if (jump && p.ground) p.vy = -CONFIG.jumpSpeed
        p.vy = Math.min(p.vy + CONFIG.gravity * dt, 600)
        const prevBottom = p.y
        p.y += p.vy * dt
        p.ground = false
        for (const x of [p.x - w / 2 + 1, p.x + w / 2 - 1]) {
          const below = cell(x, p.y)
          const top = Math.floor(p.y / T) * T
          if (p.vy >= 0 && (below === 1 || (below === 2 && prevBottom <= top + 0.5))) {
            p.y = top
            p.vy = 0
            p.ground = true
          }
          if (p.vy < 0 && cell(x, p.y - h) === 1) {
            p.y = Math.floor((p.y - h) / T + 1) * T + h
            p.vy = 0
          }
        }
        if (p.y > worldH + 60) respawn()

        // player look: step frames while running on the ground, step frame in the air
        p.step = dir && p.ground ? p.step + dt : 0
        const walkFrame = Math.floor(p.step / CONFIG.stepEvery) % 2
        player.texture = charFrames[CONFIG.player[!p.ground || walkFrame ? 1 : 0]]
        player.scale.x = -p.face // the sprites look left
        player.position.set(p.x, p.y)

        // coins, flags and enemies flip frames; coins disappear when touched
        animClock += dt
        if (!reduced && animClock > CONFIG.idleAnimEvery) {
          animClock = 0
          animFrame ^= 1
          for (const a of animated) a.sprite.texture = tileFrames[animFrame ? ANIMATED[a.id] : a.id]
          for (const e of enemies) e.sprite.texture = charFrames[animFrame ? partner(e.id) : e.id]
        }
        for (const a of animated) {
          if (!a.coin || !a.sprite.visible) continue
          if (Math.abs(a.x * T + T / 2 - p.x) < 12 && Math.abs(a.y * T + T / 2 - (p.y - h / 2)) < 14) a.sprite.visible = false
        }

        // camera: integer scale that fits the level height, follows the player horizontally
        const scale = Math.max(2, Math.floor(app.screen.height / worldH))
        const viewW = app.screen.width / scale
        const camX = Math.max(0, Math.min(worldW - viewW, p.x - viewW / 2))
        const camY = Math.min(0, -(app.screen.height / scale - worldH)) // level sits on the bottom edge
        world.scale.set(scale)
        world.position.set(-Math.round(camX * scale), -Math.round(camY * scale))
        parallax.scale.set(scale)
        far.tilePosition.x = farGround.tilePosition.x = -camX * CONFIG.parallax
        far.y = worldH * CONFIG.horizon - camY - 24
        farGround.y = far.y + 48
        far.width = farGround.width = viewW + 2
      })
    }
    start().catch((e) => console.error(e))

    return () => {
      cancelled = true
      cleanups.forEach((f) => f())
      if (app.renderer) app.destroy(true, { children: true })
    }
  }, [])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, touchAction: 'none' }} />
}
