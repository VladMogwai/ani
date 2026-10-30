import { useEffect, useState, type CSSProperties } from 'react'
import landscapeMp4 from './assets/capsules-landscape.mp4'
import landscapeWebm from './assets/capsules-landscape.webm'
import landscapePoster from './assets/capsules-landscape-poster.jpg'
import portraitMp4 from './assets/capsules-portrait.mp4'
import portraitWebm from './assets/capsules-portrait.webm'
import portraitPoster from './assets/capsules-portrait-poster.jpg'
import './style.css'

const CONFIG = {
  grainOpacity: 0.12,
}

const VIDEOS = {
  landscape: { webm: landscapeWebm, mp4: landscapeMp4, poster: landscapePoster },
  portrait: { webm: portraitWebm, mp4: portraitMp4, poster: portraitPoster },
}

const useMedia = (query: string) => {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// Blender capsule loop as a full-screen background: the portrait or landscape render by screen shape, film grain on top
export default function CapsulesBackground() {
  const shape = useMedia('(orientation: portrait)') ? 'portrait' : 'landscape'
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const v = VIDEOS[shape]
  return (
    <div className="capsules-bg" style={{ '--grain-opacity': CONFIG.grainOpacity } as CSSProperties}>
      {/* key remounts the element so the new sources load on rotation */}
      <video key={shape} poster={v.poster} autoPlay={!reduced} muted loop playsInline preload="auto">
        <source src={v.webm} type='video/webm; codecs="vp9"' />
        <source src={v.mp4} type="video/mp4" />
      </video>
      <div className="film-grain" aria-hidden />
    </div>
  )
}
