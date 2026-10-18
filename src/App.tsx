import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
import { animations } from './registry'
import { GridGlow } from './GridGlow'
import { Intro } from './Intro'
import './App.css'

const DEFAULT_PALETTE = 5 // dusk

// Backdrop palettes, one per click on the background: [top-left, top, top-right, bottom-right, bottom-left]
const PALETTES = [
  ['#ff8a00', '#ff0a4e', '#ff7a5c', '#cfa8f0', '#ff8fa3'], // sunset
  ['#00c2ff', '#3a5bff', '#6ee7d8', '#b9a6ff', '#7fd1ff'], // ocean
  ['#ffd400', '#ff6b00', '#ffb347', '#ff7aa2', '#ffe08a'], // citrus
  ['#ff3cac', '#784ba0', '#ff6fd8', '#2b86c5', '#c86dd7'], // berry
  ['#a8e063', '#2ecc71', '#f9f871', '#56ab91', '#d4fc79'], // lime
  ['#ff5f6d', '#6a3093', '#ffc371', '#4a00e0', '#ff9a8b'], // dusk
  ['#ffb199', '#ff6f91', '#ffd6a5', '#9de0ad', '#fbc2eb'], // peach & mint
  ['#00f5a0', '#00d9f5', '#7b61ff', '#ff61d2', '#43e97b'], // aurora
]

// Page buttons for the pager: all pages when few, otherwise first, last and neighbours of the current one
const pageButtons = (page: number, pages: number): (number | null)[] => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i)
  const set = [...new Set([0, pages - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < pages))].sort((a, b) => a - b)
  return set.flatMap((p, i) => (i && p - set[i - 1] > 1 ? [null, p] : [p]))
}

// How many cards fit in the list: columns from the grid, rows from its height and fixed row size
const useCardsPerPage = () => {
  const listRef = useRef<HTMLUListElement>(null)
  const [perPage, setPerPage] = useState(animations.length)
  useEffect(() => {
    const list = listRef.current!
    const measure = () => {
      const cs = getComputedStyle(list)
      const cols = cs.gridTemplateColumns.split(' ').length
      const gap = parseFloat(cs.rowGap)
      const rows = Math.max(1, Math.floor((list.clientHeight + gap) / (parseFloat(cs.gridAutoRows) + gap)))
      setPerPage(cols * rows)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(list)
    return () => ro.disconnect()
  }, [])
  return [listRef, perPage] as const
}

const otherPalette = (current: number) => (current + 1 + Math.floor(Math.random() * (PALETTES.length - 1))) % PALETTES.length

function Gallery() {
  const [palette, setPalette] = useState(DEFAULT_PALETTE)
  const [nextPalette, setNextPalette] = useState(() => otherPalette(DEFAULT_PALETTE))
  const cursorRef = useRef<HTMLDivElement>(null)
  const [introDone, setIntroDone] = useState(false)
  const finishIntro = useCallback(() => setIntroDone(true), [])
  const panelRef = useRef<HTMLElement>(null)
  const [listRef, perPage] = useCardsPerPage()
  const [pageWanted, setPage] = useState(0)
  const pages = Math.ceil(animations.length / perPage)
  const page = Math.min(pageWanted, pages - 1)
  const visible = animations.slice(page * perPage, (page + 1) * perPage)
  const style = Object.fromEntries(PALETTES[palette].map((c, i) => [`--c${i + 1}`, c])) as CSSProperties

  const onClick = (e: MouseEvent) => {
    if ((e.target as Element).closest('.panel')) return
    setPalette(nextPalette)
    setNextPalette(otherPalette(nextPalette))
    cursorRef.current?.animate([{ scale: 1.6 }, { scale: 1 }], { duration: 400, easing: 'cubic-bezier(.2, .7, .2, 1)' })
  }

  // custom cursor over the background, filled with the palette a click would switch to
  const onPointerMove = (e: PointerEvent) => {
    const cursor = cursorRef.current!
    if (e.pointerType !== 'mouse') return
    cursor.style.translate = `${e.clientX}px ${e.clientY}px`
    cursor.classList.toggle('visible', !(e.target as Element).closest('.panel'))
  }

  return (
    <div
      className="backdrop"
      style={style}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerLeave={() => cursorRef.current!.classList.remove('visible')}
    >
      <div className="blobs" aria-hidden><i /><i /><i /><i /><i /></div>
      <div className="grain" aria-hidden />
      <div
        ref={cursorRef}
        className="palette-cursor"
        style={{ background: `linear-gradient(135deg, ${PALETTES[nextPalette].join(', ')})` }}
        aria-hidden
      />
      {!introDone && <Intro panelRef={panelRef} onDone={finishIntro} />}
      <main ref={panelRef} className={`gallery panel ${introDone ? 'reveal' : 'pre-reveal'}`}>
        <GridGlow colors={PALETTES[palette]} />
        <h1>Animation Lab</h1>
        <ul ref={listRef}>
          {visible.map((a, i) => (
            <li key={a.id} style={{ '--i': i + 1 } as CSSProperties}>
              <Link to={`/${a.id}`}>
                <div className="muted">{a.id} · {a.kind ?? 'animation'} · {a.status}</div>
                <div className="title">{a.title}</div>
                <div className="muted">{a.tags.join(', ')} · {a.updated}</div>
              </Link>
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <nav className="pager" aria-label="Pages">
            <button onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page">←</button>
            {pages >= 4 &&
              pageButtons(page, pages).map((p, i) =>
                p === null ? (
                  <span key={`gap${i}`}>…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}>
                    {p + 1}
                  </button>
                ),
              )}
            <button onClick={() => setPage(page + 1)} disabled={page === pages - 1} aria-label="Next page">→</button>
          </nav>
        )}
      </main>
    </div>
  )
}

function AnimationPage() {
  const { id } = useParams()
  const entry = animations.find((a) => a.id === id)
  if (!entry) return <main className="gallery">Not found. <Link to="/">Back</Link></main>
  return (
    <>
      <Link to="/" className="back">← {entry.id}</Link>
      <Suspense fallback={null}>
        <entry.Component />
      </Suspense>
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Gallery />} />
      <Route path="/:id" element={<AnimationPage />} />
    </Routes>
  )
}
