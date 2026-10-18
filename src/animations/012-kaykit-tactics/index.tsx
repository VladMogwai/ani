import { lazy, Suspense } from 'react'

// /012-kaykit-tactics          the location (level.ts) with the hero and the day/night clock
// /012-kaykit-tactics?units    the character showcase
// /012-kaykit-tactics?bake     the sprite baker (dev only): units and levels
// /012-kaykit-tactics?edit     the location editor (dev only)
const Location = lazy(() => import('./location'))
const Showcase = lazy(() => import('./showcase'))
// dev-only tools: the production build drops them together with the models they load
const Baker = import.meta.env.DEV ? lazy(() => import('./baker')) : Location
const Editor = import.meta.env.DEV ? lazy(() => import('./editor')) : Location

export default function Page() {
  const q = new URLSearchParams(location.search)
  const View = q.has('edit') ? Editor : q.has('bake') ? Baker : q.has('units') ? Showcase : Location
  return (
    <Suspense fallback={null}>
      <View />
    </Suspense>
  )
}
