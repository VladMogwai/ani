import { Suspense, useState, type CSSProperties, type MouseEvent } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
import { animations } from './registry'
import './App.css'

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

function Gallery() {
  const [palette, setPalette] = useState(0)
  const style = Object.fromEntries(PALETTES[palette].map((c, i) => [`--c${i + 1}`, c])) as CSSProperties

  const onClick = (e: MouseEvent) => {
    if ((e.target as Element).closest('.panel')) return
    setPalette((p) => (p + 1 + Math.floor(Math.random() * (PALETTES.length - 1))) % PALETTES.length)
  }

  return (
    <div className="backdrop" style={style} onClick={onClick}>
      <div className="blobs" aria-hidden><i /><i /><i /><i /><i /></div>
      <div className="grain" aria-hidden />
      <main className="gallery panel">
        <h1>Animation Lab</h1>
        <ul>
          {animations.map((a) => (
            <li key={a.id}>
              <Link to={`/${a.id}`}>
                <div className="muted">{a.id} · {a.status}</div>
                <div className="title">{a.title}</div>
                <div className="muted">{a.tags.join(', ')} · {a.updated}</div>
              </Link>
            </li>
          ))}
        </ul>
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
