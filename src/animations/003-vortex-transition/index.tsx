import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Vector2, Vector3 } from 'three'
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
  colorDrift: 0.12, // slow color motion inside the orb
  stars: 0.9,
  // palette sampled from the video
  page: '#0b0830',
  pageDeep: '#030023',
  orb: {
    center: '#3a60a7', // the middle is the darkest, light gathers toward the edges
    top: '#94aef0',
    topLeft: '#b4c6f0',
    left: '#5c62ae',
    right: '#3f9ed6',
    aqua: '#55d6e2', // aurora crescent, lower right
    mint: '#7be3c4',
    edgeLow: '#3f4386',
    sheen: '#c9bdfb', // reflection arc just inside the upper-right edge
  },
  rim: '#c6d2fd',
  iridescence: 0.45, // pearl thin-film tint, stronger toward the edge
  rimGradient: 0.65, // colored rim band strength
  sparkles: 7, // glints inside the orb (max 12)
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
const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16)
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}
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
  uniform float uSwirl, uSwirlSpeed, uDrift, uStars;
  uniform vec3 uPage, uPageDeep, uRim;
  uniform vec3 uCenter, uTop, uTopLeft, uLeft, uRight, uAqua, uMint, uEdgeLow, uSheen;
  uniform float uIri, uRimGrad;
  uniform int uSparkles;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v;
  }

  vec3 rainbow(float x) { return 0.5 + 0.5 * cos(6.2832 * (x + vec3(0.0, 0.33, 0.67))); }

  vec3 orbColor(vec2 q, float time) {
    vec2 d = vec2(fbm(q * 1.3 + time * 0.06), fbm(q * 1.3 - time * 0.05 + 4.0)) - 0.5;
    vec2 s = q + d * uDrift * 3.0;
    float r = length(s);
    vec3 c = uCenter;
    c = mix(c, uRight, smoothstep(0.0, 0.95, s.x) * 0.9);
    c = mix(c, uLeft, smoothstep(0.0, 0.9, -s.x) * 0.8);
    c = mix(c, uTop, smoothstep(-0.1, 0.95, s.y) * 0.9);
    c = mix(c, uTopLeft, smoothstep(0.25, 1.15, dot(s, vec2(-0.707, 0.707))));
    // aurora crescent following the curvature, lower right; mint toward its left end
    float arc = exp(-pow((r - 0.6 - 0.04 * sin(time * 0.3)) / 0.26, 2.0)) * 0.9;
    float side = smoothstep(0.25, -0.6, s.y) * smoothstep(-0.9, 0.2, s.x);
    c = mix(c, mix(uAqua, uMint, smoothstep(0.3, -0.4, s.x)), arc * side);
    c = mix(c, uEdgeLow, smoothstep(0.72, 0.98, r) * smoothstep(-0.1, -0.7, s.y) * 0.8);
    return c;
  }

  void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float t = uT;
    float time = uTime;
    float r = length(p);
    float ang = atan(p.y, p.x);

    float R = uOrbR * (1.0 + uOrbGrow.x * t + uOrbGrow.y * t * t * t);
    float H = R * (uHoleStart * smoothstep(0.0, 0.12, t) + uHoleGrow * pow(t, 2.2));
    float px = 1.5 / uRes.y;

    // background: deep navy with a faint violet haze and stars
    vec3 col = mix(uPageDeep, uPage, smoothstep(1.2, 0.0, r) * 0.9);
    col += vec3(0.16, 0.1, 0.35) * 0.25 * fbm(p * 1.5 + time * 0.03);
    vec2 g = p * 38.0;
    vec2 cell = floor(g);
    vec2 star = cell + 0.2 + 0.6 * vec2(hash(cell), hash(cell + 7.1));
    float sd = length(g - star);
    float tw = 0.5 + 0.5 * sin(time * 1.5 + hash(cell) * 30.0);
    col += uStars * step(0.9, hash(cell + 3.3)) * smoothstep(0.08, 0.0, sd) * tw * vec3(0.8, 0.85, 1.0);

    // glow around the orb
    float edge = r - R;
    col += uRim * 0.16 * exp(-max(edge, 0.0) / (0.06 + R * 0.1)) * smoothstep(-0.02, 0.0, edge);

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

    // pearl: thin-film hue shift by view angle, direction and time
    float fres = pow(1.0 - n.z, 2.0);
    float qa = atan(q.y, q.x);
    vec3 film = rainbow(fres * 1.3 + qa * 0.16 + time * 0.04 + fbm(q * 2.0 + time * 0.05) * 0.6);
    film = mix(vec3(0.92, 0.92, 1.0), film, 0.5);
    orb = mix(orb, film, uIri * (0.12 + 0.55 * fres));

    // gradient rim: color runs around the edge (lavender top-right, sky right, mint low, violet left)
    float rimBand = smoothstep(0.84, 0.99, rr);
    vec3 rimCol = mix(uSheen, uRight * 1.3, smoothstep(0.9, -0.2, sin(qa)));
    rimCol = mix(rimCol, uMint, smoothstep(-0.3, -0.95, sin(qa)) * 0.7);
    rimCol = mix(rimCol, uTopLeft, smoothstep(0.2, -0.9, cos(qa)) * smoothstep(-0.5, 0.5, sin(qa)));
    rimCol = mix(rimCol, film, 0.35);
    orb = mix(orb, rimCol, rimBand * uRimGrad);

    // reflection arc just inside the upper-right edge
    float cres = exp(-pow((rr - 0.9) / 0.045, 2.0)) * smoothstep(0.1, 0.85, dot(q / max(rr, 1e-3), vec2(0.6, 0.8)));
    orb += uSheen * 0.35 * cres * calm;
    // soft sheen, top left
    orb += vec3(0.85, 0.88, 1.0) * 0.16 * smoothstep(0.75, 0.0, length(q - vec2(-0.45, 0.5))) * calm;
    // glints floating inside
    for (int i = 0; i < 12; i++) {
      if (i >= uSparkles) break;
      float fi = float(i);
      vec2 sp = (vec2(hash(vec2(fi, 1.3)), hash(vec2(fi, 7.9))) * 2.0 - 1.0) * 0.72;
      sp += 0.04 * vec2(sin(time * 0.23 + fi), cos(time * 0.19 + fi * 1.7));
      float dd = length(q - sp);
      float tw = 0.55 + 0.45 * sin(time * (0.8 + hash(vec2(fi, 3.1))) + fi * 2.0);
      float big = step(0.75, hash(vec2(fi, 5.5)));
      orb += vec3(0.95, 0.97, 1.0) * tw * calm * (0.8 * smoothstep(0.01 + big * 0.006, 0.0, dd) + 0.16 * exp(-dd / (0.02 + big * 0.02)));
    }
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
    const o = CONFIG.orb
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
      uDrift: { value: CONFIG.colorDrift },
      uStars: { value: CONFIG.stars },
      uPage: { value: hex(CONFIG.page) },
      uPageDeep: { value: hex(CONFIG.pageDeep) },
      uRim: { value: hex(CONFIG.rim) },
      uCenter: { value: hex(o.center) },
      uTop: { value: hex(o.top) },
      uTopLeft: { value: hex(o.topLeft) },
      uLeft: { value: hex(o.left) },
      uRight: { value: hex(o.right) },
      uAqua: { value: hex(o.aqua) },
      uMint: { value: hex(o.mint) },
      uEdgeLow: { value: hex(o.edgeLow) },
      uSheen: { value: hex(o.sheen) },
      uIri: { value: CONFIG.iridescence },
      uRimGrad: { value: CONFIG.rimGradient },
      uSparkles: { value: CONFIG.sparkles },
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
    <div className="vortex-page" style={{ background: CONFIG.pageDeep }}>
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
