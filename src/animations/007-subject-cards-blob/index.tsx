import { useEffect, useRef } from 'react'
import { blobPath, softAxis, type Variant } from './blob'
import { FIGURES } from './figures'
import './style.css'

const CONFIG = {
  // shape: where the blob sits in the card (viewBox 0 0 100 190), its turn and which side stays blurred
  cards: [
    { title: 'GCSE / IGCSEs', color: '#ff1d3d', shape: { x: 68, y: 88, size: 112, rotate: -10, soft: 135 }, text: 'Take a range of qualifications accredited by the main exam boards. Courses can be adapted to a one or two year programme.' },
    { title: 'A-Levels', color: '#ff601b', shape: { x: 52, y: 86, size: 120, rotate: 0, soft: 15 }, text: 'Coming soon.' },
    { title: 'Extracurriculars', color: '#4cbf7a', shape: { x: 60, y: 92, size: 104, rotate: 25, soft: 0 }, text: 'Schooling is more than just the core curriculum: speech and communication, entrepreneurship, coding and robotics.' },
    { title: 'In Person Learning', color: '#5524d6', shape: { x: 52, y: 96, size: 104, rotate: -35, flip: true, soft: 135 }, text: 'Use a global network of partner centres for in-person teaching across the globe.' },
    { title: 'Supplementary Courses', color: '#ff1d3d', shape: { x: 60, y: 88, size: 110, rotate: 160, soft: 200 }, text: 'Already enrolled elsewhere but want to join our community? Courses can be taken alongside your school.' },
    { title: 'Exam Preparation', color: '#ff601b', shape: { x: 50, y: 90, size: 114, rotate: 80, flip: true, soft: 300 }, text: 'Focused revision plans, mock exams and feedback from experienced examiners.' },
    { title: 'Tuition On Demand', color: '#5fd68f', shape: { x: 70, y: 72, size: 100, rotate: 200, soft: 160 }, text: 'Book a tutor whenever you need one: single sessions or a weekly plan.' },
  ] satisfies { title: string; color: string; shape: Variant; text: string }[],
  bg: '#142131',
  text: '#eafced',
  // hover shape: appears whole, dim and fully blurred, then focuses (one edge turns crisp, the far side stays
  // smeared) and keeps brightening; leaving runs it back. A quick pass shows it only partly.
  shapeRise: 1.6, // s to full brightness while hovered (linear)
  shapeDecay: 0.7, // s, exponential time constant of the fade-out after leaving
  focus: 0.45, // part of the rise during which the crisp edge comes into focus
  softBlur: 5, // card units, blur of the soft side before the powder scatters it (wider smear)
  startBlur: 12, // card units, blur of the whole shape when it first appears
  breathe: 0.035, // how much the outline swells and sinks
  grow: 0.9, // blob scale when it first appears
  // the first hover wakes a card's blob: from then on it reshapes in an endless loop, also while invisible;
  // leaving fades it out gradually, hovering again shows it at the loop's current phase
  morph: 0.2, // how far the outline reshapes (fraction of its radius)
  morphIn: 2.5, // s for the reshaping to ramp up after the first hover
  morphLoop: 12, // s, one full reshaping cycle (it loops)
  grain: 80, // px, how far the powder scatters pixels on the soft side
  tilt: 15, // deg, the blobs lean back in perspective: the top looks farther away
  perspective: 700, // px
  // violet haze around a resting cursor: builds while the cursor rests, stays behind and fades when it moves on
  haze: {
    color: '#5a2ad1',
    size: 900, // px, diameter
    opacity: 0.45, // at full strength
    build: 2.2, // s to full strength while resting
    fade: 1.6, // s to vanish once the cursor moves
    restSpeed: 60, // px/s, slower than this counts as resting
    follow: 1.2, // 1/s, how lazily it moves to the cursor
  },
  friction: 4, // 1/s, how fast a thrown carousel stops
  iconIn: 1.1, // s, a figure draws in once the carousel stops
  iconOut: 0.35, // s, figures retract while the carousel moves
  iconStagger: 0.15, // s between neighbouring cards
  idleAfter: 0.15, // s without movement before figures draw in
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Page() {
  const track = useRef<HTMLDivElement>(null)
  const progress = useRef<HTMLSpanElement>(null)
  const haze = useRef<HTMLDivElement>(null)
  const shapes = useRef<(HTMLDivElement | null)[]>([])
  const blobs = useRef<(SVGPathElement | null)[][]>(CONFIG.cards.map(() => []))
  const cards = useRef<(HTMLElement | null)[]>([])
  const figures = useRef<(SVGPathElement | null)[]>([])

  useEffect(() => {
    const el = track.current!
    const page = el.parentElement!
    const reduce = reducedMotion()
    const s = {
      mouse: { x: -999, y: -999 },
      hovered: -1,
      haze: { x: -9999, y: -9999, a: 0 },
      speed: 0, // cursor speed, px/s (smoothed)
      prev: { x: -999, y: -999 },
      drag: null as null | { x: number; scroll: number },
      vel: 0, // px/s while thrown
      lastX: 0,
      lastT: 0,
      lastScroll: el.scrollLeft,
      still: 0, // s since the carousel last moved
      time: 0,
      icons: CONFIG.cards.map(() => ({ p: 0, on: false })),
      lit: CONFIG.cards.map(() => 0), // hover shape brightness per card
      morph: CONFIG.cards.map(() => ({ m: 0, t: 0 })), // reshaping amount and its clock per card
      woken: CONFIG.cards.map(() => false), // hovered at least once
    }

    const hoveredAt = (x: number, y: number) =>
      cards.current.findIndex((c) => {
        const r = c!.getBoundingClientRect()
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
      })

    const setHovered = (i: number) => {
      if (i === s.hovered) return
      s.hovered = i
    }

    const onMove = (e: PointerEvent) => {
      s.mouse.x = e.clientX
      s.mouse.y = e.clientY
      setHovered(hoveredAt(e.clientX, e.clientY))
      if (s.drag) {
        el.scrollLeft = s.drag.scroll - (e.clientX - s.drag.x)
        const now = performance.now()
        const dt = Math.max(1, now - s.lastT) / 1000
        s.vel = (-(e.clientX - s.lastX) / dt) * 0.8 + s.vel * 0.2
        s.lastX = e.clientX
        s.lastT = now
      }
    }
    // mouse drags the carousel; touch keeps native scrolling
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      s.drag = { x: e.clientX, scroll: el.scrollLeft }
      s.vel = 0
      s.lastX = e.clientX
      s.lastT = performance.now()
      page.classList.add('is-dragging')
      e.preventDefault()
    }
    const onUp = () => {
      if (!s.drag) return
      s.drag = null
      if (reduce || performance.now() - s.lastT > 80) s.vel = 0
      page.classList.remove('is-dragging')
    }
    const onLeave = () => setHovered(-1)

    let last = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!reduce) s.time += dt

      if (!s.drag && Math.abs(s.vel) > 5) {
        el.scrollLeft += s.vel * dt
        s.vel *= Math.exp(-dt * CONFIG.friction)
      }
      const moved = el.scrollLeft !== s.lastScroll
      s.lastScroll = el.scrollLeft
      s.still = moved || s.drag ? 0 : s.still + dt
      // the carousel moves under a still cursor too
      if (moved) setHovered(hoveredAt(s.mouse.x, s.mouse.y))

      s.lit.forEach((v, i) => {
        if (i === s.hovered) s.woken[i] = true
        // the reshaping loop runs for every woken card, visible or not
        const mo = s.morph[i]
        if (s.woken[i] && !reduce) {
          mo.m = Math.min(1, mo.m + dt / CONFIG.morphIn)
          mo.t = (mo.t + dt / CONFIG.morphLoop) % 1
        }
        const next = reduce
          ? Number(i === s.hovered)
          : i === s.hovered
            ? Math.min(1, v + dt / CONFIG.shapeRise)
            : v * Math.exp(-dt / CONFIG.shapeDecay)
        if (next === v && next === 0) return
        const lit = (s.lit[i] = next < 0.002 ? 0 : next)
        const el = shapes.current[i]!
        el.style.opacity = String(Math.min(1, lit * 1.6))
        if (lit === 0) return
        // one card unit in px (the svg uses viewBox 100×190 with `slice`), for the CSS blurs
        el.style.setProperty('--u', `${Math.max(el.offsetWidth / 100, el.offsetHeight / 190)}px`)
        const focus = Math.min(1, lit / CONFIG.focus)
        const ease = mo.m * mo.m * (3 - 2 * mo.m)
        const d = blobPath(
          CONFIG.cards[i].shape,
          s.time + i * 3,
          CONFIG.breathe,
          CONFIG.grow + (1 - CONFIG.grow) * focus,
          CONFIG.morph * ease,
          mo.t,
          i,
        )
        blobs.current[i].forEach((p) => p!.setAttribute('d', d))
        const blur = CONFIG.startBlur * (1 - focus) ** 2
        el.style.filter = blur > 0.05 ? `blur(calc(var(--u) * ${blur.toFixed(2)}))` : ''
      })

      // haze: grows where the cursor rests, lags behind and fades when it moves
      const h = CONFIG.haze
      if (dt > 0 && s.prev.x !== -999) {
        const v = Math.hypot(s.mouse.x - s.prev.x, s.mouse.y - s.prev.y) / dt
        s.speed += (v - s.speed) * (1 - Math.exp(-dt * 8))
      }
      s.prev.x = s.mouse.x
      s.prev.y = s.mouse.y
      if (s.mouse.x !== -999) {
        if (s.haze.x === -9999) Object.assign(s.haze, { x: s.mouse.x, y: s.mouse.y })
        const resting = s.speed < h.restSpeed && !s.drag
        s.haze.a = resting ? Math.min(1, s.haze.a + dt / h.build) : Math.max(0, s.haze.a - dt / h.fade)
        // it only drifts toward the cursor while it is faint, so a built-up haze stays where the cursor rested
        const k = 1 - Math.exp(-dt * h.follow * (1 - s.haze.a) * 3)
        s.haze.x += (s.mouse.x - s.haze.x) * k
        s.haze.y += (s.mouse.y - s.haze.y) * k
        const a = reduce ? 0 : s.haze.a * s.haze.a * (3 - 2 * s.haze.a)
        haze.current!.style.transform = `translate(${s.haze.x}px, ${s.haze.y}px)`
        haze.current!.style.opacity = String(a * h.opacity)
      }

      // icon figures: draw in (staggered, left to right) once the carousel rests, retract while it moves
      const view = el.getBoundingClientRect()
      const idle = reduce || s.still > CONFIG.idleAfter
      let order = 0
      s.icons.forEach((icon, i) => {
        const r = cards.current[i]!.getBoundingClientRect()
        const visible = r.right > view.left && r.left < view.right
        const want = idle && visible
        if (want && !icon.on && icon.p <= 0) icon.p = -(order * CONFIG.iconStagger) / CONFIG.iconIn
        if (visible) order++
        icon.on = want
        const before = icon.p
        if (reduce) icon.p = want ? 1 : 0
        else if (want) icon.p = Math.min(1, icon.p + dt / CONFIG.iconIn)
        else icon.p = Math.max(0, icon.p - dt / CONFIG.iconOut)
        if (icon.p > 0 || before > 0) {
          figures.current[i]!.setAttribute('d', FIGURES[i % FIGURES.length](Math.max(0, icon.p), s.time))
        }
      })

      const max = el.scrollWidth - el.clientWidth
      progress.current!.style.transform = `scaleX(${max > 0 ? 0.15 + 0.85 * (el.scrollLeft / max) : 1})`
      raf = requestAnimationFrame(tick)
    })

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  const n = String(CONFIG.cards.length).padStart(2, '0')
  return (
    <div className="cards-page" style={{ background: CONFIG.bg, color: CONFIG.text }}>
      <header className="cards-nav">
        <span>Lab School</span>
        <span className="cards-cta">Explore the App</span>
      </header>
      {/* powder: scatters the pixels of the soft side by fine noise — dense inside, sparse grains toward the edge */}
      <svg className="cards-defs" aria-hidden>
        <filter id="cards-grain" x="0" y="0" width="1" height="1">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale={CONFIG.grain} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="cards-haze" ref={haze} aria-hidden>
        <span style={{ width: CONFIG.haze.size, height: CONFIG.haze.size, background: `radial-gradient(closest-side, ${CONFIG.haze.color}, transparent)` }} />
      </div>
      <div className="cards-track" ref={track}>
        {CONFIG.cards.map((c, i) => {
          const ax = softAxis(c.shape)
          const box = { maskUnits: 'userSpaceOnUse', x: -20, y: -20, width: 140, height: 230 } as const
          return (
          <article key={c.title} className="cards-card" ref={(e) => void (cards.current[i] = e)}>
            {/* blurs are CSS filters: SVG filters here got clipped to the blob's box and showed a rectangular frame */}
            <div
              className="cards-shape"
              ref={(e) => void (shapes.current[i] = e)}
              style={
                {
                  '--soft': CONFIG.softBlur,
                  transform: `perspective(${CONFIG.perspective}px) rotateX(${CONFIG.tilt}deg)`,
                } as React.CSSProperties
              }
              aria-hidden
            >
              {/* the smeared copy, only on the blurred side so the crisp edge has no halo */}
              <svg className="cards-smear" viewBox="0 0 100 190" preserveAspectRatio="xMidYMin slice">
                <defs>
                  <linearGradient id={`cards-smear-${i}`} gradientUnits="userSpaceOnUse" {...ax}>
                    <stop offset="0.15" stopColor="#fff" stopOpacity="0" />
                    <stop offset="0.4" stopColor="#fff" />
                  </linearGradient>
                  <mask id={`cards-smear-mask-${i}`} {...box}>
                    <rect x="-20" y="-20" width="140" height="230" fill={`url(#cards-smear-${i})`} />
                  </mask>
                </defs>
                <g mask={`url(#cards-smear-mask-${i})`}>
                  <path ref={(e) => void (blobs.current[i][0] = e)} fill={c.color} />
                </g>
              </svg>
              {/* crisp on its side of the blob, fading out toward the blurred side */}
              <svg viewBox="0 0 100 190" preserveAspectRatio="xMidYMin slice">
                <defs>
                  <linearGradient id={`cards-crisp-${i}`} gradientUnits="userSpaceOnUse" {...ax}>
                    <stop offset="0.35" stopColor="#fff" />
                    <stop offset="0.9" stopColor="#fff" stopOpacity="0" />
                  </linearGradient>
                  <mask id={`cards-crisp-mask-${i}`} {...box}>
                    <rect x="-20" y="-20" width="140" height="230" fill={`url(#cards-crisp-${i})`} />
                  </mask>
                </defs>
                <g mask={`url(#cards-crisp-mask-${i})`}>
                  <path ref={(e) => void (blobs.current[i][1] = e)} fill={c.color} />
                </g>
              </svg>
            </div>
            <span className="cards-num">{String(i + 1).padStart(2, '0')}</span>
            <h2>{c.title}</h2>
            <p>{c.text}</p>
            <svg className="cards-icon" viewBox="0 0 64 64" aria-hidden>
              <circle cx="32" cy="32" r="30" />
              <path ref={(e) => void (figures.current[i] = e)} />
            </svg>
            <span className="cards-plus" aria-hidden>
              +
            </span>
          </article>
          )
        })}
      </div>
      <div className="cards-pager" aria-hidden>
        01
        <span className="cards-bar">
          <span ref={progress} />
        </span>
        {n}
      </div>
    </div>
  )
}
