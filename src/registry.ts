import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export type AnimationMeta = {
  title: string
  tags: string[]
  status: 'template' | 'draft' | 'matches reference' | 'customized'
  updated: string
  kind?: 'animation' | 'scene' // scene = a small playable game world, not a single effect; default animation
}

export type AnimationEntry = AnimationMeta & {
  id: string
  Component: LazyExoticComponent<ComponentType>
}

// Every folder in src/animations/ with meta.ts + index.tsx is picked up automatically.
const metas = import.meta.glob<AnimationMeta>('./animations/*/meta.ts', { eager: true, import: 'default' })
const pages = import.meta.glob<{ default: ComponentType }>('./animations/*/index.tsx')

export const animations: AnimationEntry[] = Object.entries(metas)
  .map(([path, meta]) => {
    const id = path.split('/')[2]
    return { ...meta, id, Component: lazy(pages[`./animations/${id}/index.tsx`]) }
  })
  .sort((a, b) => a.id.localeCompare(b.id))
