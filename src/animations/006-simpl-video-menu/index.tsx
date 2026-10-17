import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Vector2, Vector3, Vector4 } from 'three'
import { hex } from '../../shared/orb'
import './style.css'

const CONFIG = {
  items: [
    { word: 'Spark', color: '#ff6a2b', text: 'Spark your curiosity through a personalised video feed curated to turn procrastination into education.' },
    { word: 'Ignite', color: '#ff3346', text: 'Ignite your learning through high-quality lessons and on-demand tutoring tailored to your learner profile.' },
    { word: 'Master', color: '#56d17a', text: 'Master each subject at your own pace with feedback that adapts to how you learn best.' },
    { word: 'Participate', color: '#33c9d4', text: 'Participate in live classes, clubs and projects with learners from all over the world.' },
    { word: 'Launch', color: '#ffc23d', text: 'Launch into what comes next with guidance on exams, universities and careers.' },
  ],
  intro: 'SIMPL is our learning journey: five steps from the first spark of curiosity to launching into the world.',
  bg: '#4d18b4',
  shadow: '#1f0757', // darkest tone of the duotone footage
  cursorColor: '#5fc36e',
  revealIn: 0.7, // s, liquid mask opening
  revealOut: 0.3, // s, closing before the next one opens
  edgeWave: 0.38, // how deep the liquid bites into the footage, fraction of its width
  glow: 0.05, // rim glow reach, viewport-height units
  footageSpeed: 0.35,
  cursorFollow: 10, // 1/s
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const fragmentShader = /* glsl */ `
  uniform vec2 uRes;
  uniform float uTime, uReveal, uWave, uGlow;
  uniform vec4 uRect; // media rect in px from bottom-left: x, y, w, h
  uniform vec3 uAccent, uShadow, uBg;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return s;
  }

  // stand-in for the video: soft drifting shapes with a slow pan, luminance only
  float footage(vec2 uv, float t) {
    vec2 q = uv * vec2(2.0, 2.6) + vec2(t * 0.15, -t * 0.05);
    float l = fbm(q + fbm(q * 0.7 + t * 0.1) * 1.4);
    l += 0.35 * exp(-dot(uv - vec2(0.55, 0.62), uv - vec2(0.55, 0.62)) * 7.0); // a bright "subject" near the middle
    return smoothstep(0.25, 1.0, l);
  }

  void main() {
    vec2 px = gl_FragCoord.xy;
    float H = uRes.y;
    vec2 uv = (px - uRect.xy) / uRect.zw;
    float t = uTime;

    // liquid left edge: waves along the height, sweeps in from the right while revealing
    // one big S-shaped bite plus a slow wobble
    float wave = 0.5 + 0.5 * sin(uv.y * 4.2 + 0.8 + t * 0.6) + 0.35 * (noise(vec2(uv.y * 2.5, t * 0.5)) - 0.5);
    float edgeX = mix(1.05, uWave * wave, uReveal);
    // top edge dips a little too
    float edgeY = 1.0 - 0.05 * (0.5 + 0.5 * sin(uv.x * 6.0 - t * 0.7));
    // signed distance in viewport-height units (negative inside)
    float dl = (edgeX - uv.x) * uRect.z / H;
    float dr = (uv.x - 1.0) * uRect.z / H;
    float dt = (uv.y - edgeY) * uRect.w / H;
    float db = (0.0 - uv.y) * uRect.w / H;
    float d = max(max(dl, dr), max(dt, db));
    float aa = 1.5 / H;
    float inside = smoothstep(aa, -aa, d);

    // duotone: shadow → accent → pale accent
    float l = footage(uv, t);
    vec3 duo = l < 0.6 ? mix(uShadow, uAccent, l / 0.6) : mix(uAccent, mix(uAccent, vec3(1.0), 0.55), (l - 0.6) / 0.4);
    // brighter rim inside the shape, like the reference's glowing edge
    duo = mix(duo, uAccent, 0.55 * exp(d / (uGlow * 0.6)));

    vec3 col = uBg;
    float halo = exp(-max(d, 0.0) / uGlow) * smoothstep(0.0, 0.3, uReveal) * (1.0 - inside);
    col = mix(col, uAccent, halo * 0.85);
    col = mix(col, duo, inside);
    gl_FragColor = vec4(col, 1.0);
  }
`

type Shared = { active: number | null; media: (HTMLDivElement | null)[] }

function Scene({ shared }: { shared: MutableRefObject<Shared> }) {
  const reduce = useMemo(reducedMotion, [])
  const accents = useMemo(() => CONFIG.items.map((i) => hex(i.color)), [])
  const uniforms = useMemo(
    () => ({
      uRes: { value: new Vector2() },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uWave: { value: CONFIG.edgeWave },
      uGlow: { value: CONFIG.glow },
      uRect: { value: new Vector4() },
      uAccent: { value: new Vector3() },
      uShadow: { value: hex(CONFIG.shadow) },
      uBg: { value: hex(CONFIG.bg) },
    }),
    [],
  )
  const state = useRef({ shown: null as number | null, p: 0 }) // p: reveal progress 0..1 before easing

  useFrame(({ gl }, dt) => {
    const u = uniforms
    const s = state.current
    const { active, media } = shared.current
    gl.getDrawingBufferSize(u.uRes.value)
    if (!reduce) u.uTime.value += dt * CONFIG.footageSpeed

    // close what is shown, then open the newly active one
    if (s.shown !== active) {
      s.p = reduce ? 0 : Math.max(0, s.p - dt / CONFIG.revealOut)
      if (s.p === 0) s.shown = active
    } else if (s.shown !== null) {
      s.p = reduce ? 1 : Math.min(1, s.p + dt / CONFIG.revealIn)
    }
    u.uReveal.value = easeInOut(s.p)

    const el = s.shown === null ? null : media[s.shown]
    if (el) {
      const r = el.getBoundingClientRect()
      const k = u.uRes.value.y / window.innerHeight // css px → drawing buffer px
      u.uRect.value.set(r.left * k, (window.innerHeight - r.bottom) * k, r.width * k, r.height * k)
      u.uAccent.value.copy(accents[s.shown!])
    } else u.uRect.value.set(-10, -10, 1, 1)
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial args={[{ vertexShader, fragmentShader, uniforms }]} />
    </mesh>
  )
}

function Cursor({ open }: { open: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current!
    const pos = { x: -200, y: -200, tx: -200, ty: -200 }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      pos.tx = e.clientX
      pos.ty = e.clientY
      if (pos.x === -200) Object.assign(pos, { x: pos.tx, y: pos.ty })
    }
    let last = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      const k = 1 - Math.exp((-(now - last) / 1000) * CONFIG.cursorFollow)
      last = now
      pos.x += (pos.tx - pos.x) * k
      pos.y += (pos.ty - pos.y) * k
      el.style.transform = `translate(${pos.x}px, ${pos.y}px)`
      raf = requestAnimationFrame(tick)
    })
    window.addEventListener('pointermove', onMove)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])
  return (
    <div ref={ref} className="simpl-cursor" aria-hidden>
      <span style={{ background: CONFIG.cursorColor }} className={open ? 'is-small' : undefined}>
        Tap to explore
      </span>
    </div>
  )
}

export default function Page() {
  const [active, setActive] = useState<number | null>(null)
  const shared = useRef<Shared>({ active: null, media: [] })
  shared.current.active = active

  return (
    <div className="simpl-page" style={{ background: CONFIG.bg }}>
      <Canvas flat dpr={[1, 2]} gl={{ antialias: false }} className="simpl-canvas">
        <Scene shared={shared} />
      </Canvas>
      <header className="simpl-nav">
        <span>Lab School</span>
        <span className="simpl-cta">Explore the App</span>
      </header>
      <p className={`simpl-intro ${active === null ? '' : 'is-hidden'}`}>
        <b>How it works</b>
        {CONFIG.intro}
      </p>
      <div className={`simpl-cols ${active === null ? '' : 'has-active'}`}>
        {CONFIG.items.map((item, i) => (
          <button
            key={item.word}
            className={`simpl-col ${active === i ? 'is-active' : ''}`}
            onClick={() => setActive(active === i ? null : i)}
            aria-expanded={active === i}
          >
            <div className="simpl-media" ref={(el) => void (shared.current.media[i] = el)} />
            <p className="simpl-text">{item.text}</p>
            <span className="simpl-play">
              Play video <i>▶</i>
            </span>
            <span className="simpl-word">
              {item.word[0]}
              <span className="simpl-rest">{item.word.slice(1)}</span>
            </span>
            <span className="simpl-label">{item.word}</span>
          </button>
        ))}
      </div>
      <Cursor open={active !== null} />
    </div>
  )
}
