import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CanvasTexture, Vector2 } from 'three'
import { ORB, hex, orbGlsl, orbUniforms } from '../../shared/orb'
import './style.css'

const CONFIG = {
  title: ['We shape *light*.', 'We move *minds*.'],
  logo: 'Y',
  textColor: '#f3efe4',
  fontSans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontSerif: 'Georgia, "Times New Roman", serif',
  fontSize: [36, 0.075, 104], // px: min, fraction of viewport width, max
  orbRadius: 0.4, // at rest, viewport-height units (shrinks with narrow screens)
  ringRadius: [0.045, 0.075], // loader ring: while loading, before it opens into the orb
  // timeline, seconds from start
  t: {
    logoIn: [0.4, 1.0],
    load: [0.6, 3.0], // counter 0 → 100 %, ring draws along
    logoOut: [2.8, 3.4],
    ringGrow: [3.6, 4.4],
    orbFill: [4.0, 4.6], // dim glass appears inside the ring
    orbGrow: [4.4, 5.5],
    orbBright: [4.5, 5.6],
    ringOut: [4.6, 5.1],
    textIn: [4.6, 5.6],
    lensSettle: [4.7, 5.9], // strong refraction → rest
    uiIn: [5.6, 6.3],
  },
  lensRest: { mag: 0.05, bend: 0.05, twist: 0.0 }, // refraction at rest
  lensIntro: { mag: 0.28, bend: 0.5, twist: 0.35 }, // refraction while the orb arrives
  aberration: 0.006, // RGB split of the text near the orb edge, viewport-height units
  follow: 0.05, // orb drifts toward the cursor (ours, not in the video), viewport-height units
  followEase: 3, // 1/s
  ghosts: 0.5, // faint background bubbles
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const range = ([a, b]: number[], t: number) => clamp01((t - a) / (b - a))
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// ?at=5.2 freezes the timeline at that second (for comparing frames with the reference)
const frozenAt = (() => {
  const v = new URLSearchParams(window.location.search).get('at')
  return v === null ? null : Number(v)
})()

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec2 uC; // orb center, viewport-height units
  uniform float uOrbR, uOrbBright, uOrbFill;
  uniform float uRingR, uRingP, uRingA;
  uniform float uMag, uBend, uTwist, uAberr;
  uniform float uTextA, uGhosts;
  uniform vec3 uText;
  uniform sampler2D uTextMap;
  ${orbGlsl}

  // text alpha at a point in viewport-height units
  float textAt(vec2 p) {
    vec2 uv = (p * uRes.y + 0.5 * uRes) / uRes;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return texture2D(uTextMap, uv).a;
  }

  // faint bubble outline in the background
  vec3 ghost(vec2 p, vec2 c, float R) {
    float r = length(p - c);
    float rim = exp(-abs(r - R) / 0.012) * 0.5 + smoothstep(R, R * 0.6, r) * 0.06;
    return uRim * rim * 0.25;
  }

  void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float time = uTime;
    float px = 1.5 / uRes.y;

    vec3 col = nightSky(p, time);
    col += uGhosts * ghost(p, vec2(-0.85, -0.42) + 0.02 * sin(time * 0.2), 0.36);
    col += uGhosts * ghost(p, vec2(0.95, 0.38) + 0.02 * cos(time * 0.17), 0.3);

    vec2 d = p - uC;
    float r = length(d);
    float R = uOrbR;

    // loader ring: thin glowing arc drawn clockwise from the top, lavender → cyan along the arc
    float ang = atan(d.x, d.y); // 0 at the top, clockwise
    float a01 = fract(ang / 6.2832 + 1.0);
    float arc = step(a01, uRingP);
    vec3 ringCol = mix(uSheen, uAqua, a01);
    float ringLine = exp(-abs(r - uRingR) / (px * 1.2)) + 0.35 * exp(-abs(r - uRingR) / 0.012);
    col += ringCol * ringLine * arc * uRingA;

    // the orb
    float inside = smoothstep(R + px, R - px, r) * uOrbFill;
    float rr = clamp(r / max(R, 1e-4), 0.0, 1.0);
    vec3 n = vec3(d / max(R, 1e-4), sqrt(max(0.0, 1.0 - rr * rr)));
    vec2 q = d / max(R, 1e-4);
    vec3 orb = orbFinish(orbColor(q, time), q, rr, n, time, uOrbBright);
    vec3 dim = uPageDeep * 1.5 + uRim * 0.04 + mix(uSheen, uAqua, 0.5 - 0.5 * q.y) * 0.45 * smoothstep(0.8, 1.0, rr);
    orb = mix(dim, orb, uOrbBright); // dim glass with a lit rim while it opens
    col += orbGlow(r, R) * uOrbBright;
    col = mix(col, orb, inside);

    // text: straight outside the orb, refracted through it inside
    float fres = 1.0 - n.z;
    float tw = uTwist * n.z;
    vec2 dt = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * d;
    vec2 ps = uC + dt * (1.0 - uMag * n.z) - n.xy * R * uBend * fres * fres;
    vec2 ab = n.xy * uAberr * fres;
    vec3 aIn = vec3(textAt(ps + ab), textAt(ps), textAt(ps - ab));
    float aOut = textAt(p);
    vec3 a = mix(vec3(aOut), aIn, inside) * uTextA;
    vec3 tc = mix(uText, vec3(1.0), inside * 0.25);
    col = col * (1.0 - a) + tc * a;

    gl_FragColor = vec4(col, 1.0);
  }
`

function makeTextTexture(w: number, h: number) {
  const dpr = Math.min(window.devicePixelRatio, 2)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const g = canvas.getContext('2d')!
  g.scale(dpr, dpr)
  const [min, vw, max] = CONFIG.fontSize
  let fs = Math.min(max, Math.max(min, w * vw))
  const lines = CONFIG.title.map((l) => l.split('*').map((text, i) => ({ text, italic: i % 2 === 1 })))
  const font = (italic: boolean, size: number) => (italic ? `italic 400 ${size}px ${CONFIG.fontSerif}` : `400 ${size}px ${CONFIG.fontSans}`)
  const measure = (segs: (typeof lines)[number], size: number) =>
    segs.reduce((acc, s) => {
      g.font = font(s.italic, size)
      return acc + g.measureText(s.text).width
    }, 0)
  const widest = Math.max(...lines.map((l) => measure(l, fs)))
  if (widest > w - 32) fs *= (w - 32) / widest
  const lineH = fs * 1.04
  g.fillStyle = '#fff'
  g.textBaseline = 'middle'
  lines.forEach((segs, i) => {
    let x = (w - measure(segs, fs)) / 2
    const y = h / 2 + (i - (lines.length - 1) / 2) * lineH
    for (const s of segs) {
      g.font = font(s.italic, fs)
      g.fillText(s.text, x, y)
      x += g.measureText(s.text).width
    }
  })
  return { texture: new CanvasTexture(canvas), titleBottom: h / 2 + (lines.length / 2) * lineH }
}

type Ui = {
  logo: HTMLDivElement | null
  counter: HTMLDivElement | null
  ui: HTMLDivElement | null
}

function Scene({ start, ui, pointer }: { start: MutableRefObject<number>; ui: MutableRefObject<Ui>; pointer: MutableRefObject<Vector2> }) {
  const size = useThree((s) => s.size)
  const text = useMemo(() => makeTextTexture(size.width, size.height), [size.width, size.height])
  useEffect(() => () => text.texture.dispose(), [text])
  useEffect(() => {
    ui.current.ui?.style.setProperty('--title-bottom', `${text.titleBottom}px`)
  }, [text, ui])

  const uniforms = useMemo(
    () => ({
      uRes: { value: new Vector2(1, 1) },
      uTime: { value: 0 },
      uC: { value: new Vector2(0, 0) },
      uOrbR: { value: 0 },
      uOrbBright: { value: 0 },
      uOrbFill: { value: 0 },
      uRingR: { value: CONFIG.ringRadius[0] },
      uRingP: { value: 0 },
      uRingA: { value: 0 },
      uMag: { value: 0 },
      uBend: { value: 0 },
      uTwist: { value: 0 },
      uAberr: { value: CONFIG.aberration },
      uTextA: { value: 0 },
      uGhosts: { value: CONFIG.ghosts },
      uText: { value: hex(CONFIG.textColor) },
      uTextMap: { value: null as CanvasTexture | null },
      ...orbUniforms(),
    }),
    [],
  )
  useEffect(() => {
    uniforms.uTextMap.value = text.texture // swapped on resize, uniforms stay
  }, [uniforms, text])

  const center = useRef(new Vector2())

  useFrame(({ gl, size, clock }, dt) => {
    const u = uniforms
    const T = reducedMotion() ? 1e3 : (frozenAt ?? (performance.now() - start.current) / 1000)
    const k = CONFIG.t
    const dpr = gl.getPixelRatio()
    u.uRes.value.set(size.width * dpr, size.height * dpr)
    if (!reducedMotion()) u.uTime.value = clock.elapsedTime

    const R0 = CONFIG.orbRadius * Math.min(1, (size.width / size.height) * 1.35)
    const [r0, r1] = CONFIG.ringRadius
    const ringR = lerp(r0, r1, easeInOutCubic(range(k.ringGrow, T)))
    const grow = easeOutCubic(range(k.orbGrow, T))
    u.uRingP.value = easeInOutCubic(range(k.load, T))
    u.uRingA.value = range([k.load[0], k.load[0] + 0.3], T) * (1 - range(k.ringOut, T))
    u.uOrbFill.value = range(k.orbFill, T)
    u.uOrbR.value = lerp(ringR, R0, grow)
    u.uRingR.value = u.uOrbR.value // the ring rides the edge as the orb opens
    u.uOrbBright.value = easeInOutCubic(range(k.orbBright, T))

    const settle = easeInOutCubic(range(k.lensSettle, T))
    u.uMag.value = lerp(CONFIG.lensIntro.mag, CONFIG.lensRest.mag, settle)
    u.uBend.value = lerp(CONFIG.lensIntro.bend, CONFIG.lensRest.bend, settle)
    u.uTwist.value = lerp(CONFIG.lensIntro.twist, CONFIG.lensRest.twist, settle)
    u.uTextA.value = easeInOutCubic(range(k.textIn, T))

    // the orb follows the cursor a little once it has settled
    const live = range(k.uiIn, T)
    const target = pointer.current.clone().multiplyScalar(CONFIG.follow * live)
    center.current.lerp(target, 1 - Math.exp(-CONFIG.followEase * dt))
    u.uC.value.copy(center.current)

    const { logo, counter, ui: rest } = ui.current
    const logoA = range(k.logoIn, T) * (1 - range(k.logoOut, T))
    if (logo) logo.style.opacity = String(logoA)
    if (counter) {
      counter.style.opacity = String(logoA)
      counter.textContent = `${Math.round(range(k.load, T) * 100)}%`
    }
    if (rest) {
      rest.style.opacity = String(live)
      rest.style.transform = `translateY(${(1 - easeOutCubic(live)) * 16}px)`
      rest.style.visibility = live > 0 ? 'visible' : 'hidden'
    }
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial args={[{ vertexShader, fragmentShader, uniforms }]} />
    </mesh>
  )
}

export default function Page() {
  const start = useRef(0)
  const ui = useRef<Ui>({ logo: null, counter: null, ui: null })
  const pointer = useRef(new Vector2())

  useEffect(() => {
    start.current = performance.now()
    // pointer in viewport-height units, y up, center 0
    const onMove = (e: PointerEvent) =>
      pointer.current.set((e.clientX - window.innerWidth / 2) / window.innerHeight, (window.innerHeight / 2 - e.clientY) / window.innerHeight)
    const onLeave = () => pointer.current.set(0, 0)
    window.addEventListener('pointermove', onMove)
    document.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div className="lens-page" style={{ background: ORB.pageDeep }}>
      <h1 className="sr-only">{CONFIG.title.join(' ').replaceAll('*', '')}</h1>
      <Canvas flat dpr={[1, 2]} gl={{ antialias: false }}>
        <Scene start={start} ui={ui} pointer={pointer} />
      </Canvas>
      <div className="lens-logo" ref={(el) => void (ui.current.logo = el)}>
        {CONFIG.logo}
      </div>
      <div className="lens-counter" ref={(el) => void (ui.current.counter = el)}>
        0%
      </div>
      <div className="lens-ui" ref={(el) => void (ui.current.ui = el)}>
        <div className="lens-buttons">
          <button type="button" className="pill pill-light">
            Watch the reel <span>▸</span>
          </button>
          <button type="button" className="pill pill-dark">
            See the work <span>›</span>
          </button>
        </div>
        <button type="button" className="lens-replay" onClick={() => (start.current = performance.now())}>
          Replay intro
        </button>
      </div>
    </div>
  )
}
