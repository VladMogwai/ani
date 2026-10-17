import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Vector2 } from 'three'
import { hex } from '../../shared/orb'
import './style.css'

const CONFIG = {
  headline: 'Education reinvented.',
  phrases: ['For tomorrow’s innovators', 'For remote lifestyles', 'To unlock potential'],
  phraseHold: 5.5, // s per phrase (out/in transition is in style.css)
  colors: {
    navy: '#142131',
    purpleDeep: '#2a1870',
    purple: '#5217af',
    glow: '#e22051',
    text: '#eafced',
  },
  edge: 0.42, // left edge of the purple liquid, fraction of width (desktop)
  edgeMobile: 0.15,
  edgeWave: 0.06, // how much the edge waves, fraction of height
  edgeSoft: 0.004, // edge anti-alias width
  bulge: 0.14, // edge reaches toward the cursor
  glowRadius: 0.2, // red glow size, fraction of height
  glowStrength: 1.0,
  follow: 2.2, // glow catches up with the cursor, 1/s (lower = lazier)
  waveSpeed: 0.25,
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const fragmentShader = /* glsl */ `
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec2 uGlow; // lagged cursor, viewport-height units from the center
  uniform float uEdge, uWave, uSoft, uBulge, uGlowR, uGlowK;
  uniform vec3 uNavy, uDeep, uPurple, uRed;

  // 1D value noise, smooth
  float h(float n) { return fract(sin(n) * 43758.5453); }
  float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h(i), h(i + 1.0), f); }

  void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float aspect = uRes.x / uRes.y;
    float t = uTime;

    // the liquid edge: an x position per row, waving slowly, pulled toward the glow
    float y = p.y;
    float edge = (uEdge - 0.5) * aspect;
    edge += uWave * (n1(y * 2.2 + t * 0.6) * 2.0 - 1.0);
    edge += uWave * 0.6 * sin(y * 4.0 - t * 0.9);
    float pull = exp(-pow((y - uGlow.y) / 0.28, 2.0));
    edge -= uBulge * pull * smoothstep(0.9, -0.1, uGlow.x - edge); // stronger the closer the cursor is to the edge
    float inside = smoothstep(edge - uSoft, edge + uSoft, p.x);

    // inside: deep violet in the far corner → saturated purple, plus the red glow at the cursor
    vec2 q = vec2((p.x - edge) / max(aspect * 0.5 - edge, 0.2), p.y + 0.5);
    vec3 purple = mix(uPurple, uDeep, smoothstep(0.2, 1.1, length(q - vec2(0.0, 0.0)) * 0.7));
    // a shade along the edge, like a fold in the liquid
    purple *= 0.8 + 0.2 * smoothstep(0.0, 0.12, p.x - edge);
    float g = exp(-dot(p - uGlow, p - uGlow) / (uGlowR * uGlowR));
    vec3 col = mix(purple, uRed, clamp(g * uGlowK, 0.0, 1.0));
    // pink halo spills a little over the edge
    vec3 outside = uNavy + uRed * g * 0.12;

    gl_FragColor = vec4(mix(outside, col, inside), 1.0);
  }
`

function Scene({ pointer }: { pointer: MutableRefObject<Vector2 | null> }) {
  const reduce = useMemo(reducedMotion, [])
  const c = CONFIG.colors
  const uniforms = useMemo(
    () => ({
      uRes: { value: new Vector2() },
      uTime: { value: 0 },
      uGlow: { value: new Vector2(0.3, -0.2) },
      uEdge: { value: CONFIG.edge },
      uWave: { value: CONFIG.edgeWave },
      uSoft: { value: CONFIG.edgeSoft },
      uBulge: { value: CONFIG.bulge },
      uGlowR: { value: CONFIG.glowRadius },
      uGlowK: { value: CONFIG.glowStrength },
      uNavy: { value: hex(c.navy) },
      uDeep: { value: hex(c.purpleDeep) },
      uPurple: { value: hex(c.purple) },
      uRed: { value: hex(c.glow) },
    }),
    [c],
  )
  const target = useMemo(() => new Vector2(), [])

  useFrame(({ gl, size }, dt) => {
    const u = uniforms
    gl.getDrawingBufferSize(u.uRes.value)
    const aspect = size.width / size.height
    const narrow = size.width < 700
    u.uEdge.value = narrow ? CONFIG.edgeMobile : CONFIG.edge
    if (!reduce) u.uTime.value += dt * CONFIG.waveSpeed

    // no cursor (touch, or before the first move): the glow wanders inside the liquid
    if (pointer.current) target.copy(pointer.current)
    else {
      const t = u.uTime.value / CONFIG.waveSpeed
      target.set(aspect * (narrow ? 0.12 : 0.2) + 0.12 * Math.sin(t * 0.37), -0.15 + 0.2 * Math.sin(t * 0.23))
    }
    const k = reduce ? 1 : 1 - Math.exp(-dt * CONFIG.follow)
    u.uGlow.value.lerp(target, k)
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial args={[{ vertexShader, fragmentShader, uniforms }]} />
    </mesh>
  )
}

function RotatingLine() {
  const [n, setN] = useState(0) // phrases shown so far
  const len = CONFIG.phrases.length
  const i = n % len
  useEffect(() => {
    const id = setInterval(() => setN((v) => v + 1), CONFIG.phraseHold * 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <>
      <span className="hero-phrase">
        {/* key restarts the in-animation; the previous phrase plays its out-animation as a ghost */}
        {n > 0 && (
          <span key={`out-${n}`} className="hero-phrase-out" aria-hidden>
            {CONFIG.phrases[(i - 1 + len) % len]}
          </span>
        )}
        <span key={`in-${n}`} className={n > 0 ? 'hero-phrase-in' : undefined}>
          {CONFIG.phrases[i]}
        </span>
      </span>
      <span className="hero-progress" aria-hidden>
        <span key={n} style={{ animationDuration: `${CONFIG.phraseHold}s` }} />
      </span>
    </>
  )
}

export default function Page() {
  const pointer = useRef<Vector2 | null>(null)
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const v = pointer.current ?? (pointer.current = new Vector2())
    v.set((e.clientX - r.left - r.width / 2) / r.height, -(e.clientY - r.top - r.height / 2) / r.height)
  }

  return (
    <div
      className="hero-page"
      style={{ background: CONFIG.colors.navy, color: CONFIG.colors.text }}
      onPointerMove={onMove}
      onPointerLeave={() => (pointer.current = null)}
    >
      <Canvas flat dpr={[1, 2]} gl={{ antialias: false }} className="hero-canvas">
        <Scene pointer={pointer} />
      </Canvas>
      <header className="hero-nav">
        <span className="hero-logo">Lab School</span>
        <nav>
          <span>Home</span>
          <span>Academics</span>
          <span>SIMPL</span>
          <span>Community</span>
        </nav>
        <span className="hero-cta">Explore the App</span>
      </header>
      <main className="hero-copy">
        <h1>
          {CONFIG.headline}
          <br />
          <RotatingLine />
        </h1>
        <p>
          Personalised, flexible education for every learner, preparing students for an ever-changing world through
          curiosity-led learning.
        </p>
      </main>
    </div>
  )
}
