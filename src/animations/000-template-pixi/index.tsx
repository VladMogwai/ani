import { useCallback, useRef } from 'react'
import { Application, extend, useTick } from '@pixi/react'
import { Graphics, type Graphics as PixiGraphics } from 'pixi.js'

extend({ Graphics })

const CONFIG = {
  radius: 60,
  speed: 0.03,
  color: 0x7c5cff,
}

function Orbit() {
  const ref = useRef<PixiGraphics>(null)
  const t = useRef(0)
  const draw = useCallback((g: PixiGraphics) => {
    g.clear().circle(0, 0, CONFIG.radius).fill(CONFIG.color)
  }, [])
  useTick((ticker) => {
    t.current += CONFIG.speed * ticker.deltaTime
    const g = ref.current!
    g.x = window.innerWidth / 2 + Math.cos(t.current) * 150
    g.y = window.innerHeight / 2 + Math.sin(t.current) * 150
  })
  return <pixiGraphics ref={ref} draw={draw} />
}

export default function Page() {
  return (
    <Application resizeTo={window} background="#0e0e10" antialias>
      <Orbit />
    </Application>
  )
}
