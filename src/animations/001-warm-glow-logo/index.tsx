import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useSearchParams } from 'react-router-dom'
import { Vector2, Vector3, type ShaderMaterial } from 'three'
import './style.css'

const CONFIG = {
  logoText: 'Yarkina',
  periodSec: 3,
  // card size: margins in height units (viewport height = 1)
  marginX: 0.078,
  marginY: 0.062,
  cornerRadius: 0.05,
  edgeHalfWidth: 0.058,
  wobbleAmp: 0.015,
  bend: 0.3, // how far the bands at the vertical center sit left of top/bottom
  skew: 0.02,
}

type Theme = {
  id: string
  name: string
  bgLeft: string
  bgRight: string
  // [position along x, color]
  gradient: [number, string][]
  // edge glow from inside (0) to background (1)
  fire: [number, string][]
  font: { family: string; weight: number; style?: 'italic'; letterSpacing: string }
}

// shared positions for the 7-color themes: light, light 2, accent light, accent, accent dark, deep, dark
const GRAD_POS = [0, 0.05, 0.11, 0.225, 0.33, 0.45, 0.58]
const FIRE_POS = [0.26, 0.43, 0.51, 0.69]
const zip = (pos: number[], colors: string[]) => colors.map((c, i) => [pos[i], c] as [number, string])

const THEMES: Theme[] = [
  {
    id: 'ember',
    name: 'Угли',
    bgLeft: '#fefee6',
    bgRight: '#eae8dd',
    gradient: [
      [0.0, '#fdffe5'],
      [0.03, '#fdefc5'],
      [0.06, '#fdcfa8'],
      [0.09, '#feb58c'],
      [0.125, '#ff9b72'],
      [0.16, '#ff825a'],
      [0.19, '#ff613c'],
      [0.225, '#fb1f16'],
      [0.27, '#d42a1d'],
      [0.33, '#a52d1e'],
      [0.39, '#8b2c1f'],
      [0.45, '#632821'],
      [0.51, '#3c241f'],
      [0.55, '#20201d'],
      [0.58, '#1e1e1e'],
    ],
    fire: zip(FIRE_POS, ['#842720', '#ce7d2d', '#daac3a', '#e5d59c']),
    font: { family: 'system-ui, sans-serif', weight: 600, letterSpacing: '-0.02em' },
  },
  {
    id: 'ocean',
    name: 'Океан',
    bgLeft: '#eef4f6',
    bgRight: '#dde6ea',
    gradient: zip(GRAD_POS, ['#f2fbff', '#d3f0fa', '#9fdcf0', '#1fa3d6', '#146f9a', '#0d3a55', '#0b1621']),
    fire: zip(FIRE_POS, ['#0e3a5a', '#2a8fc0', '#7fd3e8', '#cdeef5']),
    font: { family: "'Manrope', sans-serif", weight: 600, letterSpacing: '-0.02em' },
  },
  {
    id: 'lavender',
    name: 'Лаванда',
    bgLeft: '#f7f3fb',
    bgRight: '#e9e4ef',
    gradient: zip(GRAD_POS, ['#fbf7ff', '#ece1ff', '#d9c3ff', '#8b5cf6', '#5b2bb5', '#33186a', '#17121f']),
    fire: zip(FIRE_POS, ['#3b1a6e', '#7c4ddb', '#c3a6ff', '#e6dbff']),
    font: { family: "'Cormorant Garamond', serif", weight: 500, style: 'italic', letterSpacing: '0' },
  },
  {
    id: 'emerald',
    name: 'Изумруд',
    bgLeft: '#f3f8ef',
    bgRight: '#e3e9dd',
    gradient: zip(GRAD_POS, ['#f6fff0', '#dcf7e2', '#b9f0c8', '#16c47f', '#0e8a5c', '#0a4a36', '#0f1a16']),
    fire: zip(FIRE_POS, ['#0d4a35', '#21a06b', '#9fe3b8', '#d8f3df']),
    font: { family: "'DM Serif Display', serif", weight: 400, letterSpacing: '0' },
  },
  {
    id: 'rose',
    name: 'Пудровая роза',
    bgLeft: '#fdf4f1',
    bgRight: '#efe5e1',
    gradient: zip(GRAD_POS, ['#fff6f2', '#ffdfe0', '#ffc2c7', '#ff4d7d', '#b8285a', '#5e1832', '#1c1418']),
    fire: zip(FIRE_POS, ['#6b1a38', '#e04b7a', '#f5b7c4', '#f8e1e4']),
    font: { family: "'Playfair Display', serif", weight: 500, style: 'italic', letterSpacing: '0' },
  },
  {
    id: 'sunset',
    name: 'Закат',
    bgLeft: '#fff8e6',
    bgRight: '#efe6d4',
    gradient: zip(GRAD_POS, ['#fff6e0', '#ffe6a8', '#ffcf6b', '#ff7a3d', '#e0364f', '#7a1240', '#1a0f1f']),
    fire: zip(FIRE_POS, ['#5c1240', '#d9437a', '#ffb15c', '#ffe7b0']),
    font: { family: "'Unbounded', sans-serif", weight: 600, letterSpacing: '-0.01em' },
  },
  {
    id: 'graphite',
    name: 'Графит',
    bgLeft: '#f4f4f2',
    bgRight: '#e6e6e3',
    gradient: zip(GRAD_POS, ['#fafaf8', '#e8e8e5', '#cfcfcc', '#8a8a87', '#5a5a58', '#2e2e2d', '#141414']),
    fire: zip(FIRE_POS, ['#2b2b2b', '#6e6e6e', '#b5b5b2', '#dcdcda']),
    font: { family: "'Space Grotesk', sans-serif", weight: 500, letterSpacing: '-0.03em' },
  },
]

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16)
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// array sizes differ per theme, so the shader is built per theme
const fragmentShader = (G: number, F: number) => /* glsl */ `
  #define G ${G}
  #define F ${F}
  uniform float uTime;
  uniform vec2 uRes;
  uniform float uPeriod, uMarginX, uMarginY, uRadius, uEdge, uAmp, uBend, uSkew;
  uniform vec3 uBgL, uBgR;
  uniform vec3 uGradC[G];
  uniform float uGradP[G];
  uniform vec3 uFireC[F];
  uniform float uFireP[F];
  varying vec2 vUv;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  vec3 gradient(float s) {
    vec3 c = uGradC[0];
    for (int i = 0; i < G - 1; i++) {
      float t = clamp((s - uGradP[i]) / (uGradP[i + 1] - uGradP[i]), 0.0, 1.0);
      if (s >= uGradP[i]) c = mix(uGradC[i], uGradC[i + 1], t);
    }
    return c;
  }

  vec3 fireRamp(float t, vec3 inside, vec3 bg) {
    vec3 c = mix(inside, uFireC[0], clamp(t / uFireP[0], 0.0, 1.0));
    for (int i = 0; i < F - 1; i++) {
      float k = clamp((t - uFireP[i]) / (uFireP[i + 1] - uFireP[i]), 0.0, 1.0);
      if (t >= uFireP[i]) c = mix(uFireC[i], uFireC[i + 1], k);
    }
    if (t >= uFireP[F - 1]) c = mix(uFireC[F - 1], bg, (t - uFireP[F - 1]) / (1.0 - uFireP[F - 1]));
    return c;
  }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    float aspect = uRes.x / uRes.y;
    float w = uTime * 6.2831853 / uPeriod;

    // height-normalized coordinates, center = 0
    vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
    vec2 wob = uAmp * vec2(sin(q.y * 3.0 + w), sin(q.x * 2.0 + w + 1.3));
    vec2 qw = q + wob;

    vec2 half_ = vec2(0.5 * aspect - uMarginX, 0.5 - uMarginY);
    float d = sdRoundBox(qw, half_, uRadius);

    // gradient coordinate: x across the viewport, bent into a chevron, skewed over time
    float x = qw.x / aspect + 0.5;
    float dy = qw.y;
    float s = x - uBend * sqrt(dy * dy + 0.002) + 0.016 - uSkew * dy * sin(w);
    vec3 inside = gradient(s);

    vec3 bg = mix(uBgL, uBgR, vUv.x);
    float t = clamp((d + uEdge) / (2.0 * uEdge), 0.0, 1.0);
    float dark = 1.0 - dot(inside, vec3(0.299, 0.587, 0.114));
    vec3 plain = mix(inside, bg, smoothstep(0.0, 1.0, t));
    vec3 col = mix(plain, fireRamp(t, inside, bg), dark);

    col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
  }
`

function Background({ theme }: { theme: Theme }) {
  const ref = useRef<ShaderMaterial>(null)
  const size = useThree((s) => s.size)
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new Vector2(1, 1) },
      uPeriod: { value: CONFIG.periodSec },
      uMarginX: { value: CONFIG.marginX },
      uMarginY: { value: CONFIG.marginY },
      uRadius: { value: CONFIG.cornerRadius },
      uEdge: { value: CONFIG.edgeHalfWidth },
      uAmp: { value: CONFIG.wobbleAmp },
      uBend: { value: CONFIG.bend },
      uSkew: { value: CONFIG.skew },
      uBgL: { value: hex(theme.bgLeft) },
      uBgR: { value: hex(theme.bgRight) },
      uGradC: { value: theme.gradient.map(([, c]) => hex(c)) },
      uGradP: { value: theme.gradient.map(([p]) => p) },
      uFireC: { value: theme.fire.map(([, c]) => hex(c)) },
      uFireP: { value: theme.fire.map(([p]) => p) },
    }),
    [theme],
  )

  useFrame((state) => {
    const u = ref.current!.uniforms
    u.uTime.value = reduced ? 0 : state.clock.elapsedTime
    u.uRes.value.set(size.width, size.height)
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={ref} vertexShader={vertexShader} fragmentShader={fragmentShader(theme.gradient.length, theme.fire.length)} uniforms={uniforms} />
    </mesh>
  )
}

function Logo({ theme }: { theme: Theme }) {
  const { family, weight, style, letterSpacing } = theme.font
  return (
    <div className="wgl-logo" style={{ fontFamily: family, fontWeight: weight, fontStyle: style, letterSpacing }}>
      <span>{CONFIG.logoText}</span>
    </div>
  )
}

export default function Page() {
  const [params, setParams] = useSearchParams()
  const theme = THEMES.find((t) => t.id === params.get('v')) ?? THEMES[0]
  return (
    <div className="wgl-root" style={{ background: theme.bgLeft }}>
      <Canvas flat dpr={[1, 2]} gl={{ antialias: false }}>
        <Background key={theme.id} theme={theme} />
      </Canvas>
      <Logo theme={theme} />
      <nav className="wgl-themes">
        {THEMES.map((t) => (
          <button
            key={t.id}
            aria-pressed={t.id === theme.id}
            style={{ fontFamily: t.font.family, fontStyle: t.font.style }}
            onClick={() => setParams({ v: t.id }, { replace: true })}
          >
            {t.name}
          </button>
        ))}
      </nav>
    </div>
  )
}
