import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Vector2 } from 'three'
import { ORB, orbGlsl, orbUniforms } from '../../shared/orb'
import './style.css'

type Section = { orb: boolean; title: string; body?: string }

const CONFIG = {
  durationSec: 1.6, // one transition (orb ↔ dark), easeOutQuad: fast start, slow settle
  orbRadius: 0.4, // orb at rest, in viewport-height units (shrinks with narrow screens)
  orbGrow: [2.2, 2.5], // radius = r0 * (1 + a*t + b*t^3)
  holeStart: 0.12, // hole radius / orb radius right after the hole opens
  holeGrow: 0.85, // hole radius / orb radius += holeGrow * t^2.2
  holeSoft: 0.8, // blur of the hole edge, fraction of hole radius
  holeNoise: 0.45, // how ragged the hole edge is
  swirl: 0.55, // twist strength of the vortex
  swirlSpeed: 0.5,
  // orb look and palette: src/shared/orb.ts (ORB)
  wheelThreshold: 25,
  swipeThreshold: 40,
  sections: [
    { orb: true, title: 'We shape *light*.<br/>We move *minds*.' },
    {
      orb: false,
      title: 'Ideas live in the space<br/>between *pixels* and *places*.',
      body: 'A small studio for brands that want to be felt, not only seen.',
    },
    { orb: true, title: 'Step *inside*.<br/>Stay a *while*.' },
    { orb: false, title: 'Every project starts<br/>with a *question*.', body: 'Scroll back up to fall through again.' },
  ] as Section[],
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t)
const italics = (s: string) => s.replace(/\*(.+?)\*/g, '<em>$1</em>')

type Nav = { p: number; from: number; to: number; start: number }

/** 0 = orb at rest, 1 = fully swallowed by the vortex, for the current nav position. */
function vortexAmount(p: number) {
  const i = Math.min(Math.floor(p), CONFIG.sections.length - 2)
  const f = p - i
  const a = CONFIG.sections[i].orb ? 0 : 1
  const b = CONFIG.sections[i + 1].orb ? 0 : 1
  return a + (b - a) * f
}

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uT;
  uniform float uOrbR;
  uniform vec2 uOrbGrow;
  uniform float uHoleStart, uHoleGrow, uHoleSoft, uHoleNoise;
  uniform float uSwirl, uSwirlSpeed;
  ${orbGlsl}

  void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float t = uT;
    float time = uTime;
    float r = length(p);
    float ang = atan(p.y, p.x);

    float R = uOrbR * (1.0 + uOrbGrow.x * t + uOrbGrow.y * t * t * t);
    float H = R * (uHoleStart * smoothstep(0.0, 0.12, t) + uHoleGrow * pow(t, 2.2));
    float px = 1.5 / uRes.y;

    vec3 col = nightSky(p, time);
    col += orbGlow(r, R);

    // the orb: a shaded sphere
    float inside = smoothstep(R + px, R - px, r);
    float rr = clamp(r / R, 0.0, 1.0);
    vec3 n = vec3(p / R, sqrt(max(0.0, 1.0 - rr * rr)));

    // vortex coordinates: twist grows toward the center and with t
    float twist = uSwirl * (1.0 + 2.0 * t) / (rr + 0.25) + time * uSwirlSpeed;
    float a2 = ang + twist;
    vec2 polar = vec2(cos(a2), sin(a2));
    float streak = fbm(polar * 2.2 + vec2(log(r + 0.05) * 1.5 - time * 0.4, 0.0));

    vec2 q = p / R;
    float calm = 1.0 - smoothstep(0.0, 0.4, t); // highlights fade once the vortex starts
    vec3 orb = orbColor(q + polar * 0.15 * t, time);
    orb = mix(orb, uTopLeft * 1.1, streak * smoothstep(0.0, 0.5, t) * 0.5); // light streaks while spinning

    orb = orbFinish(orb, q, rr, n, time, calm);
    col = mix(col, orb, inside);

    // the hole: dark, ragged, swirling, with a blurred edge
    float rag = fbm(polar * 1.6 + vec2(time * 0.15, t * 2.0)) - 0.5;
    float hr = H * (1.0 + uHoleNoise * rag);
    float feather = hr * uHoleSoft * (0.6 + 0.8 * streak); // radial streaks in the blurred edge
    float hole = H > 1e-4 ? smoothstep(hr + feather, hr - feather * 0.35, r) : 0.0;
    vec3 holeCol = mix(uPageDeep, uPage * 1.2, streak * 0.6 * smoothstep(0.0, hr, r));
    // bright swirling ring just outside the hole
    float ring = exp(-max(r - hr, 0.0) / (0.35 * hr + 1e-4)) * (1.0 - hole) * inside;
    col += uTopLeft * 0.55 * ring * smoothstep(0.0, 0.3, t) * (0.6 + 0.8 * streak);
    col = mix(col, holeCol, hole);

    // near the end the whole screen sinks into the dark page
    col = mix(col, uPageDeep, smoothstep(0.85, 1.0, t));

    gl_FragColor = vec4(col, 1.0);
  }
`

function Vortex({ nav }: { nav: MutableRefObject<Nav> }) {
  const uniforms = useMemo(() => {
    return {
      uRes: { value: new Vector2(1, 1) },
      uTime: { value: 0 },
      uT: { value: 0 },
      uOrbR: { value: CONFIG.orbRadius },
      uOrbGrow: { value: new Vector2(...CONFIG.orbGrow) },
      uHoleStart: { value: CONFIG.holeStart },
      uHoleGrow: { value: CONFIG.holeGrow },
      uHoleSoft: { value: CONFIG.holeSoft },
      uHoleNoise: { value: CONFIG.holeNoise },
      uSwirl: { value: CONFIG.swirl },
      uSwirlSpeed: { value: CONFIG.swirlSpeed },
      ...orbUniforms(),
    }
  }, [])

  useFrame(({ gl, size, clock }) => {
    const n = nav.current
    if (n.start >= 0) {
      const dur = reducedMotion() ? 0.001 : CONFIG.durationSec
      n.p = n.from + (n.to - n.from) * easeOutQuad(clamp01((performance.now() - n.start) / 1000 / dur))
    }
    const dpr = gl.getPixelRatio()
    uniforms.uRes.value.set(size.width * dpr, size.height * dpr)
    uniforms.uOrbR.value = CONFIG.orbRadius * Math.min(1, (size.width / size.height) * 1.35)
    if (!reducedMotion()) uniforms.uTime.value = clock.elapsedTime
    uniforms.uT.value = vortexAmount(n.p)
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial args={[{ vertexShader, fragmentShader, uniforms }]} />
    </mesh>
  )
}

export default function Page() {
  const nav = useRef<Nav>({ p: 0, from: 0, to: 0, start: -1 })
  const texts = useRef<(HTMLDivElement | null)[]>([])

  // text opacity follows nav.p; plain rAF, since it's DOM, not the WebGL scene
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const p = nav.current.p
      texts.current.forEach((el, i) => {
        if (!el) return
        const d = Math.abs(p - i)
        const o = 1 - clamp01(d / 0.3)
        el.style.opacity = String(o)
        el.style.transform = `translateY(${(i - p) * 40}px) scale(${1 - Math.min(d, 1) * 0.06})`
        el.style.visibility = o > 0 ? 'visible' : 'hidden'
      })
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const last = CONFIG.sections.length - 1
    const go = (dir: number) => {
      const n = nav.current
      const dur = reducedMotion() ? 0 : CONFIG.durationSec * 1000
      if (n.start >= 0 && performance.now() - n.start < dur * 0.9) return
      const to = Math.min(last, Math.max(0, n.to + dir))
      if (to === n.to) return
      Object.assign(n, { from: n.p, to, start: performance.now() })
    }
    let wheelAcc = 0
    let wheelTimer = 0
    const onWheel = (e: WheelEvent) => {
      wheelAcc += e.deltaY
      clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(() => (wheelAcc = 0), 150)
      if (Math.abs(wheelAcc) > CONFIG.wheelThreshold) {
        go(Math.sign(wheelAcc))
        wheelAcc = 0
      }
    }
    let touchY = 0
    const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0].clientY)
    const onTouchEnd = (e: TouchEvent) => {
      const dy = touchY - e.changedTouches[0].clientY
      if (Math.abs(dy) > CONFIG.swipeThreshold) go(Math.sign(dy))
    }
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown', 'PageDown', ' '].includes(e.key)) go(1)
      if (['ArrowUp', 'PageUp'].includes(e.key)) go(-1)
    }
    const onClick = () => (nav.current.to === last ? go(-last) : go(1))
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClick)
    return () => {
      clearTimeout(wheelTimer)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <div className="vortex-page" style={{ background: ORB.pageDeep }}>
      <Canvas flat dpr={[1, 2]} gl={{ antialias: false }}>
        <Vortex nav={nav} />
      </Canvas>
      {CONFIG.sections.map((s, i) => (
        <div
          key={i}
          ref={(el) => {
            texts.current[i] = el
          }}
          className={`vortex-text ${s.orb ? 'is-orb' : 'is-dark'}`}
        >
          <h2 dangerouslySetInnerHTML={{ __html: italics(s.title) }} />
          {s.body && <p>{s.body}</p>}
        </div>
      ))}
    </div>
  )
}
