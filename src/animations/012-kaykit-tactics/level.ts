// Locations as data (levels/<id>.json, edited visually on ?edit): floor cells, back walls, scenery and props. The baker
// builds each one from the source models and renders it with the units' camera; the scene reads the same data for
// walking and depth.
// World units: one cell = 2x2 units (one KayKit small floor tile); cell (x, z) covers [2x, 2x+2] x [2z, 2z+2].
// Model names are paths inside source/ without extension (.gltf), or with .glb (Kenney).

import { BAKE } from './units'

export const CELL = 2

export type Part = { model: string; offset?: [number, number, number]; rot?: number; scale?: number }
// props are rendered one by one and depth-sorted with units; `size` is the footprint in cells (blocked for walking),
// `light` a flame point (world units from the footprint centre) that glows at night
export type Prop = { cell: [number, number]; size?: [number, number]; parts: Part[]; light?: [number, number, number] }
// scenery is baked into the base picture: flat things and things behind the map (never in front of a unit)
export type Scenery = { at: [number, number]; parts: Part[] } // at: world x, z

export type Level = {
  name: string
  floor: string[] // one char per cell, rows are z; ' ' = not walkable
  floorPieces: Record<string, string[]> // char -> models laid on the cell (none = bare ground)
  floorTint?: Record<string, string> // char -> colour multiplied over its pieces (dungeon dirt -> road brown)
  ground?: 'hex-grass' // tiled under the whole map
  walls?: { north: string[]; west: string[]; corner: string } // one piece per 2 cells along the far edges
  wallDecor?: { wall: 'north' | 'west'; piece: number; model: string; y: number; light?: boolean }[]
  scenery?: Scenery[]
  // the world around the playable map, so the camera never shows its edge: the picture reaches `depth` cells beyond the
  // map on screen, the ground covers it and `parts` are scattered there (one per spot, about every `spacing` world
  // units, a `fill` share of spots used, never closer than a cell to the map). In front of the map (east and south)
  // the first `lowDepth` cells use `low` parts only: tall trees there would hide the map's front rows.
  border?: { depth: number; spacing: number; fill: number; parts: Part[]; low?: Part[]; lowDepth?: number }
  props: Prop[]
  hero: [number, number]
  indoor?: boolean // no sky: the scene keeps an indoor light at every hour, flames always burn
}

// levels/<id>.json, written by the editor (?edit)
const files = import.meta.glob<Level>('./levels/*.json', { eager: true, import: 'default' })
export const LEVELS: Record<string, Level> = Object.fromEntries(
  Object.entries(files).map(([path, level]) => [path.slice('./levels/'.length, -'.json'.length), level]),
)

// deterministic scatter: same level -> same forest on every bake
export const hash = (a: number, b: number) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return h - Math.floor(h)
}
// scenery beyond the map's front edges (east or south) is drawn above the units, everything else under them
export const inFront = (l: Level, at: readonly [number, number]) => at[0] > size(l).cols * CELL || at[1] > size(l).rows * CELL

export const size = (l: Level) => ({ cols: l.floor[0].length, rows: l.floor.length })
export const footprint = (p: Prop): [number, number] => p.size ?? [1, 1]

// a cell the hero can stand on
export const walkable = (l: Level, x: number, z: number) =>
  x >= 0 && z >= 0 && x < size(l).cols && z < size(l).rows && l.floor[z][x] !== ' ' &&
  !l.props.some((p) => x >= p.cell[0] && z >= p.cell[1] && x < p.cell[0] + footprint(p)[0] && z < p.cell[1] + footprint(p)[1])

// --- projection shared with the baker: orthographic camera 30 degrees down, 45 degrees around, looking from +X+Z.
// Screen right r = (1, 0, -1)/√2, screen up u = (-sin30/√2, cos30, -sin30/√2).
const A = Math.SQRT1_2
const SIN = Math.sin((BAKE.elevation * Math.PI) / 180)
const COS = Math.cos((BAKE.elevation * Math.PI) / 180)
export const dotRight = (x: number, _y: number, z: number) => A * (x - z)
export const dotUp = (x: number, y: number, z: number) => -A * SIN * (x + z) + COS * y

// written by the baker: picture size and where the world origin lands in it (logical px)
export type LevelPicture = {
  width: number
  height: number
  ox: number
  oy: number
  tiles: { size: number; cols: number; rows: number } // base-<c>-<r>.webp (and front-…) cover the picture, size in px
  props: { file: string; ax: number; ay: number }[] // in the order of Level.props
  front: boolean // front-<c>-<r>.webp: scenery in front of the map, same tiles as base, drawn above the units
  lights: { x: number; y: number }[] // flames in picture px
}

export const toPicture = (pic: LevelPicture, x: number, y: number, z: number) => ({
  x: pic.ox + BAKE.ppu * dotRight(x, y, z),
  y: pic.oy - BAKE.ppu * dotUp(x, y, z),
})
export const cellCenter = (pic: LevelPicture, x: number, z: number) => toPicture(pic, x * CELL + CELL / 2, 0, z * CELL + CELL / 2)
// centre of a prop's footprint on the ground, in world units
export const propCentre = (p: Prop) => [(p.cell[0] + footprint(p)[0] / 2) * CELL, (p.cell[1] + footprint(p)[1] / 2) * CELL] as const

// picture point -> cell on the ground (y = 0)
export const cellAtPoint = (l: Level, pic: LevelPicture, px: number, py: number) => {
  const d = (px - pic.ox) / (BAKE.ppu * A) // x - z
  const s = (py - pic.oy) / (BAKE.ppu * A * SIN) // x + z
  const x = Math.floor((s + d) / 2 / CELL)
  const z = Math.floor((s - d) / 2 / CELL)
  return x >= 0 && z >= 0 && x < size(l).cols && z < size(l).rows ? ([x, z] as [number, number]) : null
}
