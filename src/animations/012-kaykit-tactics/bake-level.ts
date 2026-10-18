import {
  Box3, Group, MathUtils, Mesh, Object3D, PCFSoftShadowMap, Vector3, type Camera, type Material, type MeshStandardMaterial,
} from 'three'
import { load, makeRenderer, makeScene, orthoAt, saveImage, saveJson } from './bake-common'
import {
  CELL, dotRight, dotUp, footprint, hash, inFront, propCentre, size, type Level, type LevelPicture, type Part,
} from './level'
import { BAKE, SOURCE } from './units'

// Level baker: builds a location of level.ts from the source models (buildLevel, also used by the editor) and renders
// into assets/levels/<id>/
// - base-<col>-<row>.webp: tiles of the ground, floor, walls, decorations and scenery behind or on the map, with every
//   prop's shadow
// - front-<col>-<row>.webp: scenery in front of the map (east and south of it), same tiles, drawn above the units
// - prop-<i>.webp: every prop alone, cropped, with the picture point of its footprint centre (ax, ay)
// - level.json: picture size, where the world origin lands, props and flame positions (written last)

export const levelOut = (id: string) => `src/animations/012-kaykit-tactics/assets/levels/${id}`
const PAD = 8 // px around pictures without a border
const TILE = 1024 // logical px per side of a base / front tile (stored at BAKE.resolution)
const A = Math.SQRT1_2
const SIN = Math.sin(MathUtils.degToRad(BAKE.elevation))

const models = new Map<string, Object3D>()
export const model = async (name: string) => {
  if (!models.has(name)) models.set(name, (await load(`${SOURCE}/${name}${name.endsWith('.glb') ? '' : '.gltf'}`)).scene)
  return models.get(name)!.clone()
}
const place = (o: Object3D, x: number, y: number, z: number, deg = 0, scale = 1) => {
  o.position.set(x, y, z)
  o.rotation.y = MathUtils.degToRad(deg)
  o.scale.setScalar(scale)
  return o
}
// parts of a prop or a scenery item around a ground point
export const assemble = async (parts: Part[], x: number, z: number) => {
  const g = new Group()
  for (const p of parts) {
    const [ox, oy, oz] = p.offset ?? [0, 0, 0]
    g.add(place(await model(p.model), x + ox, oy, z + oz, p.rot ?? 0, p.scale ?? 1))
  }
  return g
}
// each mesh gets its own material copy so a tint stays on that piece
const tint = (obj: Object3D, color: string) =>
  obj.traverse((o) => {
    if (!(o instanceof Mesh)) return
    o.material = (o.material as MeshStandardMaterial).clone()
    ;(o.material as MeshStandardMaterial).color.set(color)
  })
const shadows = (o: Object3D) =>
  o.traverse((m) => {
    if (m instanceof Mesh) m.castShadow = m.receiveShadow = true
  })
// a ghost casts its shadow but writes neither colour nor depth
const ghosts = new WeakMap<Mesh, Material>()
export const ghost = (o: Object3D, on: boolean) =>
  o.traverse((m) => {
    if (!(m instanceof Mesh)) return
    if (on && !ghosts.has(m)) {
      ghosts.set(m, m.material as Material)
      m.material = Object.assign((m.material as Material).clone(), { colorWrite: false, depthWrite: false })
    } else if (!on && ghosts.has(m)) {
      m.material = ghosts.get(m)!
      ghosts.delete(m)
    }
  })

// world-space corners of an object's bounding box
const corners = (o: Object3D) => {
  const b = new Box3().setFromObject(o)
  return [0, 1, 2, 3, 4, 5, 6, 7].map(
    (i) => new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z),
  )
}
type Frame = { left: number; top: number; width: number; height: number } // left/top in world units along screen axes, size in px
// frustum around points, relative to `target`, snapped to whole logical pixels
const frameAround = (points: Vector3[], target: Vector3, pad = PAD): Frame => {
  const r = points.map((p) => dotRight(p.x - target.x, p.y - target.y, p.z - target.z))
  const u = points.map((p) => dotUp(p.x - target.x, p.y - target.y, p.z - target.z))
  const left = Math.floor(Math.min(...r) * BAKE.ppu - pad) / BAKE.ppu
  const top = Math.ceil(Math.max(...u) * BAKE.ppu + pad) / BAKE.ppu
  return { left, top, width: Math.ceil((Math.max(...r) - left) * BAKE.ppu + pad), height: Math.ceil((top - Math.min(...u)) * BAKE.ppu + pad) }
}
// with a border: the picture is the map's screen rectangle grown by `depth` cell widths, and the world fills all of it
const borderFrame = (level: Level): Frame => {
  const { cols, rows } = size(level)
  const map = [[0, 0], [cols * CELL, 0], [0, rows * CELL], [cols * CELL, rows * CELL]].map(([x, z]) => new Vector3(x, 0, z))
  return frameAround(map, new Vector3(), level.border!.depth * CELL * 2 * A * BAKE.ppu)
}

export type BuiltLevel = Awaited<ReturnType<typeof buildLevel>>

// the location as a three.js scene: statics (base picture), front scenery, props, flame points, frame
export async function buildLevel(level: Level) {
  const { cols, rows } = size(level)
  const { scene, key } = makeScene()
  const statics = new Group()
  const front = new Group()
  const lights: Vector3[] = []
  const frame = level.border ? borderFrame(level) : null

  // the world area a border must cover: the frame's screen rectangle turned back into ground coordinates
  // (d = x - z, s = x + z), with extra room below for trees whose crowns reach up into the picture
  const cover = frame && {
    d: [frame.left / A, (frame.left + frame.width / BAKE.ppu) / A],
    s: [-frame.top / (A * SIN), -(frame.top - frame.height / BAKE.ppu) / (A * SIN) + 14],
  }
  const covered = (x: number, z: number) =>
    !cover || (x - z >= cover.d[0] - 4 && x - z <= cover.d[1] + 4 && x + z >= cover.s[0] - 4 && x + z <= cover.s[1])
  const box = cover && {
    x: [(cover.s[0] + cover.d[0]) / 2, (cover.s[1] + cover.d[1]) / 2],
    z: [(cover.s[0] - cover.d[1]) / 2, (cover.s[1] - cover.d[0]) / 2],
  }

  // ground: KayKit hex grass tiles (2 x 2.31, pointy along z)
  if (level.ground === 'hex-grass') {
    const [x0, x1] = box?.x ?? [-6, cols * CELL + 6]
    const [z0, z1] = box?.z ?? [-6, rows * CELL + 6]
    for (let row = Math.floor(z0 / 1.732); row * 1.732 < z1; row++)
      for (let col = Math.floor(x0 / 2) - 1; col * 2 < x1; col++) {
        const x = col * 2 + (row % 2 ? 1 : 0)
        if (covered(x, row * 1.732)) statics.add(place(await model('medieval/hex_grass'), x, 0, row * 1.732))
      }
  }
  // floor: a piece per cell, variants and quarter turns picked from the cell position so rebakes look the same
  for (let z = 0; z < rows; z++)
    for (let x = 0; x < cols; x++) {
      const kinds = level.floorPieces[level.floor[z][x]]
      if (!kinds?.length) continue
      const tile = await model(kinds[(x * 7 + z * 3) % kinds.length])
      const color = level.floorTint?.[level.floor[z][x]]
      if (color) tint(tile, color)
      statics.add(place(tile, x * CELL + 1, level.ground ? 0.01 : 0, z * CELL + 1, ((x * 5 + z * 11) % 4) * 90))
    }
  // back walls: north along x behind row 0, west along z behind column 0 (turned to face the room)
  if (level.walls) {
    for (const [i, name] of level.walls.north.entries()) statics.add(place(await model(name), i * 4 + 2, 0, -0.5))
    for (const [i, name] of level.walls.west.entries()) statics.add(place(await model(name), -0.5, 0, i * 4 + 2, 90))
    statics.add(place(await model(level.walls.corner), -0.5, 0, -0.5))
  }
  for (const d of level.wallDecor ?? []) {
    const along = d.piece * 4 + 2
    const flush = d.model.includes('banner') ? -0.5 : 0 // banners sit on the wall's centre line, torches on its face
    statics.add(d.wall === 'north' ? place(await model(d.model), along, d.y, flush) : place(await model(d.model), flush, d.y, along, 90))
    if (d.light) lights.push(d.wall === 'north' ? new Vector3(along, d.y + 0.6, 0.45) : new Vector3(0.45, d.y + 0.6, along))
  }
  // hand-placed scenery, then the border scatter
  const scenery = [...(level.scenery ?? [])]
  if (level.border && box) {
    const { spacing, fill, parts, low, lowDepth = 0 } = level.border
    for (let z = box.z[0]; z < box.z[1]; z += spacing)
      for (let x = box.x[0]; x < box.x[1]; x += spacing) {
        const jx = x + (hash(x, z) - 0.5) * spacing * 0.8
        const jz = z + (hash(z, x) - 0.5) * spacing * 0.8
        if (jx > -CELL && jx < cols * CELL + CELL && jz > -CELL && jz < rows * CELL + CELL) continue // keep a cell clear
        if (!covered(jx, jz) || hash(jx, jz) > fill) continue
        const near = inFront(level, [jx, jz]) && Math.max(jx - cols * CELL, jz - rows * CELL) < lowDepth * CELL // in front, close
        const pool = near && low?.length ? low : parts
        if (near && !low?.length) continue
        const part = pool[Math.floor(hash(jz, jx) * pool.length)]
        scenery.push({ at: [jx, jz], parts: [{ ...part, rot: Math.floor(hash(x + 1, z) * 360) }] })
      }
  }
  for (const s of scenery) (inFront(level, s.at) ? front : statics).add(await assemble(s.parts, s.at[0], s.at[1]))
  shadows(statics)
  shadows(front)
  scene.add(statics, front)

  const props: Group[] = []
  for (const p of level.props) {
    const [cx, cz] = propCentre(p)
    const g = await assemble(p.parts, cx, cz)
    shadows(g)
    scene.add(g)
    props.push(g)
    if (p.light) lights.push(new Vector3(cx + p.light[0], p.light[1], cz + p.light[2]))
  }

  // soft shadows from the key light over the whole area
  const span = box ? Math.max(box.x[1] - box.x[0], box.z[1] - box.z[0]) : Math.max(cols, rows) * CELL + 12
  const centre = box ? new Vector3((box.x[0] + box.x[1]) / 2, 0, (box.z[0] + box.z[1]) / 2) : new Vector3((cols * CELL) / 2, 0, (rows * CELL) / 2)
  key.position.copy(centre).addScaledVector(key.position.clone().normalize(), span)
  key.target.position.copy(centre)
  scene.add(key.target)
  key.castShadow = true
  key.shadow.mapSize.set(8192, 8192)
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.02
  Object.assign(key.shadow.camera, { left: -span * 0.75, right: span * 0.75, top: span * 0.75, bottom: -span * 0.75, near: 1, far: span * 2.5 })
  key.shadow.camera.updateProjectionMatrix()

  return {
    scene, key, statics, front, props, lights,
    frame: frame ?? frameAround([...corners(statics), ...props.flatMap(corners)], new Vector3()),
  }
}

export async function bakeLevel(id: string, level: Level, log: (s: string) => void, preview: (c: HTMLCanvasElement) => void) {
  const out = levelOut(id)
  const { scene, key, statics, front, props, lights, frame: f } = await buildLevel(level)
  const renderer = makeRenderer()
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  const shot = (camera: Camera, width: number, height: number) => {
    renderer.setSize(width * BAKE.resolution, height * BAKE.resolution, false)
    renderer.render(scene, camera)
    return renderer.domElement
  }

  // big pictures are cut into tiles: browsers cap canvas and texture sizes (phones load textures up to 4096 px);
  // the world origin is the camera target, so (ox, oy) is where it lands
  const origin = new Vector3()
  const tiles = { size: TILE, cols: Math.ceil(f.width / TILE), rows: Math.ceil(f.height / TILE) }
  const shootTiles = async (name: string) => {
    for (let r = 0; r < tiles.rows; r++)
      for (let c = 0; c < tiles.cols; c++) {
        const w = Math.min(TILE, f.width - c * TILE)
        const h = Math.min(TILE, f.height - r * TILE)
        const left = f.left + (c * TILE) / BAKE.ppu
        const top = f.top - (r * TILE) / BAKE.ppu
        const canvas = shot(orthoAt(origin, left, left + w / BAKE.ppu, top, top - h / BAKE.ppu), w, h)
        if (r === 0 && c === 0) preview(cloneCanvas(canvas))
        await saveImage(canvas, `${out}/${name}-${c}-${r}.webp`)
      }
  }

  // base picture: front scenery and props only cast their shadows here
  ghost(front, true)
  for (const g of props) ghost(g, true)
  await shootTiles('base')
  log(`${id} base: ${f.width}x${f.height}, ${tiles.cols}x${tiles.rows} tiles`)
  const ox = -f.left * BAKE.ppu
  const oy = f.top * BAKE.ppu

  // front scenery alone in the same frame
  statics.visible = false
  ghost(front, false)
  key.castShadow = false // things drawn alone: no shadows from things that are not there
  const hasFront = front.children.length > 0
  if (hasFront) {
    await shootTiles('front')
    log(`front: ${front.children.length} items`)
  }
  front.visible = false

  // props one by one, around their footprint centre
  const pictures: LevelPicture['props'] = []
  for (const [i, g] of props.entries()) {
    for (const other of props) other.visible = other === g
    ghost(g, false)
    const [cx, cz] = propCentre(level.props[i])
    const c = new Vector3(cx, 0, cz)
    const pf = frameAround(corners(g), c)
    const cam = orthoAt(c, pf.left, pf.left + pf.width / BAKE.ppu, pf.top, pf.top - pf.height / BAKE.ppu)
    await saveImage(shot(cam, pf.width, pf.height), `${out}/prop-${i}.webp`)
    pictures.push({ file: `prop-${i}.webp`, ax: -pf.left * BAKE.ppu, ay: pf.top * BAKE.ppu })
    log(`prop ${i}: ${level.props[i].parts.map((p) => p.model).join(' + ')} ${footprint(level.props[i]).join('x')}`)
  }
  renderer.dispose()

  const picture: LevelPicture = {
    width: f.width,
    height: f.height,
    ox,
    oy,
    tiles,
    props: pictures,
    front: hasFront,
    lights: lights.map((l) => ({ x: ox + BAKE.ppu * dotRight(l.x, l.y, l.z), y: oy - BAKE.ppu * dotUp(l.x, l.y, l.z) })),
  }
  await saveJson(`${out}/level.json`, picture) // last: the scene imports it, the dev server reloads this page
  log('done')
}

// the renderer canvas is reused, keep a copy for the preview
const cloneCanvas = (src: HTMLCanvasElement) => {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  c.getContext('2d')!.drawImage(src, 0, 0)
  return c
}
