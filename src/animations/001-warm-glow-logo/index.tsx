import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
  wobbleAmp: 0.008, // slow whole-card sway
  rippleAmp: 0.009, // shorter waves running along each edge
  rippleFreq: 8, // ~1 wave along an edge, as in the reference
  bend: 0.3, // how far the bands at the vertical center sit left of top/bottom
  skew: 0.02,
  bgLeft: '#fefee6',
  bgRight: '#eae8dd',
  // [position along x, color]
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
  ] as [number, string][],
  // edge glow from inside (0) to background (1)
  fire: [
    [0.26, '#842720'],
    [0.43, '#ce7d2d'],
    [0.51, '#daac3a'],
    [0.69, '#e5d59c'],
  ] as [number, string][],
}

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

const G = CONFIG.gradient.length
const F = CONFIG.fire.length

const fragmentShader = /* glsl */ `
  #define G ${G}
  #define F ${F}
  uniform float uTime;
  uniform vec2 uRes;
  uniform float uPeriod, uMarginX, uMarginY, uRadius, uEdge, uAmp, uRipple, uFreq, uBend, uSkew;
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
    // traveling ripples; the cross term gives opposite edges different phases.
    // temporal multipliers are integers so the loop stays seamless
    wob += uRipple * vec2(
      sin(q.y * uFreq + q.x * 2.0 + w + 0.5) + 0.6 * sin(q.y * uFreq * 1.7 - q.x * 3.0 - 2.0 * w + 1.7),
      sin(q.x * uFreq * 0.9 - q.y * 2.0 - w + 2.1) + 0.6 * sin(q.x * uFreq * 1.6 + q.y * 3.0 + 2.0 * w + 0.4)
    );
    vec2 qw = q + wob;

    vec2 half_ = vec2(0.5 * aspect - uMarginX, 0.5 - uMarginY);
    float d = sdRoundBox(qw, half_, uRadius);

    // gradient coordinate: x across the viewport, bent into a chevron, skewed over time.
    // uses the undisplaced q: only the card edges ripple, the color bands stay put
    float x = q.x / aspect + 0.5;
    float dy = q.y;
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

function Background() {
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
      uRipple: { value: CONFIG.rippleAmp },
      uFreq: { value: CONFIG.rippleFreq },
      uBend: { value: CONFIG.bend },
      uSkew: { value: CONFIG.skew },
      uBgL: { value: hex(CONFIG.bgLeft) },
      uBgR: { value: hex(CONFIG.bgRight) },
      uGradC: { value: CONFIG.gradient.map(([, c]) => hex(c)) },
      uGradP: { value: CONFIG.gradient.map(([p]) => p) },
      uFireC: { value: CONFIG.fire.map(([, c]) => hex(c)) },
      uFireP: { value: CONFIG.fire.map(([p]) => p) },
    }),
    [],
  )

  useFrame((state) => {
    const u = ref.current!.uniforms
    u.uTime.value = reduced ? 0 : state.clock.elapsedTime
    u.uRes.value.set(size.width, size.height)
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={ref} vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} />
    </mesh>
  )
}

function Logo() {
  return (
    <div className="wgl-logo">
      <span>{CONFIG.logoText}</span>
    </div>
  )
}

export default function Page() {
  return (
    <div className="wgl-root">
      <Canvas flat dpr={[1, 2]} gl={{ antialias: false }}>
        <Background />
      </Canvas>
      <Logo />
    </div>
  )
}
