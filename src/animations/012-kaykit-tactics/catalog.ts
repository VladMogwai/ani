// Everything the location editor can place: every model in source/<pack>/, with a default scale that brings it to the
// characters' size (the packs use different scales) and whether it carries a flame that glows at night.

const files = import.meta.glob('./source/{dungeon,forest,medieval,town}/*.{gltf,glb}', { query: '?url', import: 'default' })

// model names as level.ts uses them: <pack>/<file> (.gltf dropped, .glb kept)
export const CATALOG: string[] = Object.keys(files)
  .map((p) => p.slice('./source/'.length).replace(/\.gltf$/, ''))
  .filter((m) => !m.includes('_Mesh') && !m.includes('Singlesided') && !m.includes('hex_grass'))
  .sort()

export const PACKS = ['medieval', 'town', 'forest', 'dungeon'] as const
export const packOf = (m: string) => m.split('/')[0]

// real sizes against the characters (2.4 units = 1.8 m, so 1 m = 1.33 units): a house door a bit taller than the hero,
// trees 7-9 m, a barrel about 1 m; the dungeon pack is already at the characters' scale
export const defaultScale = (m: string) => {
  if (m.startsWith('medieval/building_well')) return 5
  if (m.startsWith('medieval/building_grain') || m.startsWith('medieval/building_dirt')) return 5
  if (m.startsWith('medieval/building_') || m.startsWith('medieval/fence')) return 9
  if (m.startsWith('medieval/tent')) return 6
  if (m.startsWith('medieval/')) return 6
  if (m.startsWith('forest/Tree')) return 2.2
  if (m.startsWith('forest/Bush_1')) return 6
  if (m.startsWith('forest/Bush_3')) return 1.6
  if (m.startsWith('forest/Bush_')) return 3
  if (m.startsWith('forest/Rock_2')) return 9
  if (m.startsWith('forest/Rock_')) return 3.5
  if (m.startsWith('forest/Grass')) return 3
  if (m === 'town/lantern.glb') return 2
  if (m.startsWith('town/')) return 3
  return 1
}

// flames: point above the model's top where the glow sits, as a share of its height (null = no flame)
export const flameAt = (m: string) => (/lantern|torch_lit|candle_lit|torch_mounted/.test(m) ? 0.92 : null)

// floor brushes the editor offers; each adds its pieces (and tint) to the level when first used
export const FLOOR_BRUSHES: { char: string; label: string; pieces: string[]; tint?: string }[] = [
  { char: '.', label: 'ground (bare)', pieces: [] },
  { char: ',', label: 'dirt road', pieces: ['dungeon/floor_dirt_small_A', 'dungeon/floor_dirt_small_B', 'dungeon/floor_dirt_small_C', 'dungeon/floor_dirt_small_D'], tint: '#c49a68' },
  { char: 't', label: 'stone tiles', pieces: ['dungeon/floor_tile_small'] },
  { char: 'b', label: 'broken tiles', pieces: ['dungeon/floor_tile_small_broken_A', 'dungeon/floor_tile_small_broken_B'] },
  { char: 'w', label: 'tiles with weeds', pieces: ['dungeon/floor_tile_small_weeds_A', 'dungeon/floor_tile_small_weeds_B'] },
  { char: 'd', label: 'decorated tiles', pieces: ['dungeon/floor_tile_small_decorated'] },
  { char: 'g', label: 'floor grate', pieces: ['dungeon/floor_tile_grate'] },
  { char: 'p', label: 'wooden planks', pieces: ['dungeon/floor_wood_small'] },
  { char: 'P', label: 'dark planks', pieces: ['dungeon/floor_wood_small_dark'] },
  { char: ' ', label: 'not walkable', pieces: [] },
]
