import { useMemo, useRef, type CSSProperties } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Vector2, Vector3, Vector4, type ShaderMaterial } from 'three'
import './style.css'

const CONFIG = {
  logoText: 'Yarkina',
  periodSec: 10,
  drift: 0.035, // how far each color blob wanders, in card-height units
  breathe: 0.03, // orb scale pulse
  grain: 0.05,
  pageBg: '#f9f9f9',
  margin: 24, // px around the card
  fitWidth: 1.4, // plate and logo scale: card-height units that must fit across the card
  orbFitWidth: 1.0, // the same for the color picture, so the orb fills narrow screens
  cardRadius: 0.04, // in card-height units
  plateW: 1.25, // glass plate, in card-height units
  plateH: 0.384,
  plateRadius: 0.02,
  plateBlur: 0.05,
  plateTint: '#8a8178',
  plateTintMix: 0.32,
  plateDim: 0.82,
  bgLeft: '#f6a5c7',
  bgRight: '#fbb697',
  bgBottomLeft: '#ee8fe0',
  // color blobs: [x, y (up), radius, alpha, color]; card center = 0, card height = 1
  blobs: [
    [0.42, 0.4, 0.26, 0.8, '#ff9a5e'], // orange glow outside the head, top right
    [-0.22, -0.3, 0.32, 0.75, '#a65ae0'], // violet haze, bottom left
    [-0.24, 0.38, 0.24, 1.0, '#0638e0'], // blue, top left
    [-0.2, -0.26, 0.21, 0.95, '#5a25d0'], // deep violet, bottom left
    [0.3, 0.4, 0.15, 0.95, '#c0103a'], // red rim, top right
    [0.14, 0.2, 0.2, 1.0, '#72c805'], // green core
    [0.29, 0.13, 0.1, 0.9, '#e7aa28'], // yellow
    [0.08, -0.12, 0.15, 0.9, '#9f6a08'], // amber, lower middle
    [0.15, -0.34, 0.12, 0.95, '#000000'], // chin shadow
    [0.22, -0.46, 0.1, 0.7, '#7a222e'], // maroon under the chin
  ] as [number, number, number, number, string][],
  head: { x: 0.03, y: 0.06, rx: 0.36, ry: 0.52, color: '#04112a' },
  rim: { color: '#fff3ff', width: 0.09, strength: 0.7 },
}

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16)
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const blobs = CONFIG.blobs
const B = blobs.length

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  #define B ${B}
  uniform float uTime, uPeriod, uDrift, uBreathe, uGrain;
  uniform vec2 uRes;
  uniform float uMargin, uFit, uOrbFit, uRadius;
  uniform vec2 uPlate;
  uniform float uPlateR, uPlateBlur, uTintMix, uDim;
  uniform vec3 uTint, uPageBg, uBgL, uBgR, uBgBL;
  uniform vec4 uBlob[B];
  uniform vec3 uBlobC[B];
  uniform vec4 uHead;
  uniform vec3 uHeadC, uRimC;
  uniform vec2 uRim;
  varying vec2 vUv;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  // the card picture, in card-height units (y up)
  vec3 scene(vec2 p, float w) {
    float bx = smoothstep(-0.6, 0.6, p.x);
    vec3 col = mix(uBgL, uBgR, bx);
    col = mix(col, uBgBL, smoothstep(0.1, 0.9, -p.y - p.x * 0.6) * 0.7);

    float s = 1.0 + uBreathe * sin(w);
    vec2 o = p / s;

    // dark head mass with a soft edge
    vec2 hc = uHead.xy + uDrift * 0.5 * vec2(sin(w + 0.4), cos(w));
    vec2 e = (o - hc) / uHead.zw;
    float er = length(e);

    for (int i = 0; i < B; i++) {
      vec4 b = uBlob[i];
      float fi = float(i);
      vec2 c = b.xy + uDrift * vec2(sin(w * (1.0 + mod(fi, 2.0)) + fi * 1.7), cos(w * (1.0 + mod(fi + 1.0, 2.0)) + fi * 2.3));
      vec2 d = o - c;
      float a = exp(-dot(d, d) / (b.z * b.z)) * b.w;
      // the first two blobs sit behind the head, the rest on top of it
      if (i == 2) col = mix(col, uHeadC, (1.0 - smoothstep(0.7, 1.05, er)) * 0.97);
      col = mix(col, uBlobC[i], clamp(a, 0.0, 1.0));
    }

    // white rim light on the upper-left edge of the head, slowly swinging
    float ang = 2.35 + 0.35 * sin(w);
    float facing = max(dot(normalize(e + 1e-4), vec2(cos(ang), sin(ang))), 0.0);
    float rim = exp(-pow((er - 0.97) / uRim.x, 2.0)) * pow(facing, 2.0) * uRim.y;
    col = mix(col, uRimC, clamp(rim, 0.0, 1.0));
    return col;
  }

  void main() {
    float w = uTime * 6.2831853 / uPeriod;
    vec2 px = vUv * uRes;
    vec2 card = uRes - 2.0 * uMargin;
    float unit = min(card.y, card.x / uFit); // px per card-height unit
    vec2 p = (px - 0.5 * uRes) / unit;
    vec2 halfCard = 0.5 * card / unit;
    float orbUnit = min(card.y, card.x / uOrbFit);
    vec2 po = (px - 0.5 * uRes) / orbUnit;
    float k = unit / orbUnit;

    float dCard = sdRoundBox(p, halfCard, uRadius);
    vec3 col = scene(po, w);

    // frosted glass plate: blurred scene, dimmed and tinted
    float dPlate = sdRoundBox(p, 0.5 * uPlate, uPlateR);
    if (dPlate < 0.01) {
      vec3 acc = vec3(0.0);
      float n = 0.0;
      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float r = uPlateBlur * sqrt((fi + 0.5) / 16.0);
        float a = fi * 2.39996;
        acc += scene(po + k * r * vec2(cos(a), sin(a)), w);
        n += 1.0;
      }
      vec3 glass = mix(acc / n * uDim, uTint, uTintMix);
      float aa = 1.5 / unit;
      float inside = 1.0 - smoothstep(-aa, aa, dPlate);
      float edge = (1.0 - smoothstep(0.0, aa * 1.5, abs(dPlate + aa))) * 0.12;
      col = mix(col, glass + edge, inside);
    }

    float aaC = 1.0 / unit;
    col = mix(col, uPageBg, smoothstep(-aaC, aaC, dCard));

    float g = hash(px + fract(uTime * 7.31) * 113.0) - 0.5;
    col += g * uGrain * (1.0 - smoothstep(-aaC, aaC, dCard));
    gl_FragColor = vec4(col, 1.0);
  }
`

function Background() {
  const ref = useRef<ShaderMaterial>(null)
  const size = useThree((s) => s.size)
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  const uniforms = useMemo(() => {
    const h = CONFIG.head
    return {
      uTime: { value: 0 },
      uRes: { value: new Vector2(1, 1) },
      uPeriod: { value: CONFIG.periodSec },
      uDrift: { value: CONFIG.drift },
      uBreathe: { value: CONFIG.breathe },
      uGrain: { value: CONFIG.grain },
      uMargin: { value: CONFIG.margin },
      uFit: { value: CONFIG.fitWidth },
      uOrbFit: { value: CONFIG.orbFitWidth },
      uRadius: { value: CONFIG.cardRadius },
      uPlate: { value: new Vector2(CONFIG.plateW, CONFIG.plateH) },
      uPlateR: { value: CONFIG.plateRadius },
      uPlateBlur: { value: CONFIG.plateBlur },
      uTint: { value: hex(CONFIG.plateTint) },
      uTintMix: { value: CONFIG.plateTintMix },
      uDim: { value: CONFIG.plateDim },
      uPageBg: { value: hex(CONFIG.pageBg) },
      uBgL: { value: hex(CONFIG.bgLeft) },
      uBgR: { value: hex(CONFIG.bgRight) },
      uBgBL: { value: hex(CONFIG.bgBottomLeft) },
      uBlob: { value: blobs.map(([x, y, r, a]) => new Vector4(x, y, r, a)) },
      uBlobC: { value: blobs.map(([, , , , c]) => hex(c)) },
      uHead: { value: new Vector4(h.x, h.y, h.rx, h.ry) },
      uHeadC: { value: hex(h.color) },
      uRimC: { value: hex(CONFIG.rim.color) },
      uRim: { value: new Vector2(CONFIG.rim.width, CONFIG.rim.strength) },
    }
  }, [])

  useFrame((state) => {
    const u = ref.current!.uniforms
    u.uTime.value = reduced ? 0 : state.clock.elapsedTime
    u.uRes.value.set(size.width * state.viewport.dpr, size.height * state.viewport.dpr)
    u.uMargin.value = CONFIG.margin * state.viewport.dpr
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={ref} vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} />
    </mesh>
  )
}

export default function Page() {
  const vars = {
    '--m': `${CONFIG.margin}px`,
    '--fit': CONFIG.fitWidth,
    background: CONFIG.pageBg,
  } as CSSProperties
  return (
    <div className="igl-root" style={vars}>
      <Canvas flat dpr={[1, 2]} gl={{ antialias: false }}>
        <Background />
      </Canvas>
      <div className="igl-logo">
        <span>{CONFIG.logoText}</span>
      </div>
    </div>
  )
}
