// Geometry of the dungeon picture drawn by art/scenes/dungeon/build-dungeon.lua.
// MAP and the constants below must match that script, so cells line up with the painted floor.

export const MAP = [
  'AAAAAAAAAAAAAAAA',
  'A666666666444444',
  'A666666666544444',
  'A666666666444444',
  'A222222522223222',
  'A222222422222222',
  'A222222322222222',
  'A222222222222222',
  'A222222222wwww22',
  '8222222222wmww22',
  '6222222222wwww22',
  '4222222222222222',
  '2222222222222222',
  '2222222222222222',
]

export const TILE_W = 64
export const TILE_H = 32
export const LEVEL_PX = 16
const MARGIN = 40
const MAX_H = 10

export const COLS = MAP[0].length
export const ROWS = MAP.length

export type Cell = { x: number; z: number; h: number; water: boolean }

// cells use 1-based x (column) and z (row), like the Lua script
export const cellAt = (x: number, z: number): Cell | null => {
  const ch = MAP[z - 1]?.[x - 1]
  if (!ch) return null
  const water = ch === 'w' || ch === 'm'
  return { x, z, water, h: water ? 0 : ch === 'A' ? 10 : Number(ch) }
}

// cells taken by the big props painted into the picture (CONFIG.props in the Lua script): tree, column, rubble
export const PROPS: [number, number][] = [
  [4, 3],
  [3, 10],
  [12, 7],
]

// a floor cell a unit can stand on
export const walkable = (c: Cell | null) =>
  !!c && !c.water && c.h <= 6 && !PROPS.some(([x, z]) => x === c.x && z === c.z)

const originX = MARGIN + ((ROWS - 1) * TILE_W) / 2
const originY = MARGIN + MAX_H * LEVEL_PX

// centre of the top face of a cell, in picture pixels
export const cellCenter = (x: number, z: number) => {
  const c = cellAt(x, z)!
  return {
    x: Math.floor(originX + ((x - z) * TILE_W) / 2) + TILE_W / 2,
    y: Math.floor(originY + ((x + z) * TILE_H) / 2) - c.h * LEVEL_PX + TILE_H / 2,
  }
}

// cell whose top diamond contains the picture point; front cells win where faces overlap
export const cellAtPoint = (px: number, py: number): Cell | null => {
  for (let sum = COLS + ROWS; sum >= 2; sum--) {
    for (let z = ROWS; z >= 1; z--) {
      const x = sum - z
      const c = cellAt(x, z)
      if (!c || c.water) continue
      const p = cellCenter(x, z)
      if (Math.abs(px - p.x) / (TILE_W / 2) + Math.abs(py - p.y) / (TILE_H / 2) <= 1) return c
    }
  }
  return null
}
