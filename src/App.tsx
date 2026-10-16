import { Suspense } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
import { animations } from './registry'
import './App.css'

function Gallery() {
  return (
    <main className="gallery">
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
