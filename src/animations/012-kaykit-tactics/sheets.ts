import { Assets, Rectangle, Texture } from 'pixi.js'
import type { UnitSheets } from './units'

// Sheets written by the baker: assets/units/<unit>/<anim>.webp (rows = 8 screen directions clockwise from east,
// columns = frames) and assets/units/<unit>.json. Files are fetched only when a scene asks for them.
const urls = import.meta.glob<string>('./assets/units/*/*.webp', { eager: true, import: 'default', query: '?url' })
const metas = import.meta.glob<UnitSheets>('./assets/units/*.json', { eager: true, import: 'default' })

export const unitMeta = (name: string): UnitSheets | undefined => metas[`./assets/units/${name}.json`]

// one sheet -> [direction][frame] textures
export const loadAnim = async (name: string, anim: string) => {
  const tex = await Assets.load<Texture>(urls[`./assets/units/${name}/${anim}.webp`])
  const size = tex.height / 8
  return Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: unitMeta(name)!.anims[anim].frames }, (_, f) =>
      new Texture({ source: tex.source, frame: new Rectangle(f * size, row * size, size, size) }),
    ),
  )
}

// screen direction (0 = east, clockwise) from a screen-space vector
export const direction = (dx: number, dy: number) => (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8
