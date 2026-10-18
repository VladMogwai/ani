// Heightmap of the dungeon floor. Digits are heights in levels (one level = LEVEL_H world units),
// "w" is the floor of the flooded pit, "m" a mossy block standing in the water.
// Row 0 is the far edge (low z), column 0 the far-left edge (low x): the camera looks from +x +z.
export const MAP = [
  '9999999998888777',
  '9999888887777666',
  '9988766666665555',
  '9876544444444444',
  '9865432222222222',
  '8764322222222222',
  '8763222222222222',
  '7652222222222222',
  '7642222222222222',
  '6532222222wwww22',
  '6422222222wmww22',
  '5322222222wwww22',
  '4222222222222222',
  '3222222222222222',
]

export const LEVEL_H = 0.5
export const WATER_Y = 0.65
export const COLS = MAP[0].length
export const ROWS = MAP.length

export type Cell = { x: number; z: number; h: number; water: boolean; moss: boolean }

export const cells: Cell[] = MAP.flatMap((row, z) =>
  [...row].map((ch, x) => {
    const water = ch === 'w' || ch === 'm'
    return { x, z, h: water ? 0 : Number(ch), water, moss: ch === 'm' }
  }),
)

export const cellAt = (x: number, z: number) => cells[z * COLS + x]

// world position of a cell's centre on the ground plane
export const toWorld = (x: number, z: number): [number, number] => [x - COLS / 2 + 0.5, z - ROWS / 2 + 0.5]

// small deterministic random so the scene looks the same on every load
export const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
