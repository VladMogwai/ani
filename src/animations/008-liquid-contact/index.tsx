import { useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Vector2 } from 'three'
import { ORB, hex, orbGlsl, orbUniforms } from '../../shared/orb'
import './style.css'

type Phase = 'page' | 'opening' | 'form' | 'closing'

const CONFIG = {
  // orb on the contact page: partly off the top-left corner
  pageOrb: { x: 0.12, y: 0.1, r: 0.46 }, // x, y = center from the top-left, in viewport width / height; r in heights
  smallOrb: 0.13, // radius at the center before it spills over the screen
  // timelines, seconds
  open: { move: [0, 1.0], grow: [1.25, 2.1], liquid: [1.35, 2.0], done: 2.1 },
  close: { collapse: [0.15, 1.3], liquid: [0.35, 1.15], done: 1.3 },
  thanksSec: 1.8, // "thanks" message before the form closes by itself
  // liquid gradient, sampled from the video
  liquid: {
    deep: '#24257b',
    base: '#3f4ab2',
    lilac: '#594fba',
    sky: '#1374c1',
    cyan: '#15b6dc',
    aqua: '#89d8eb',
  },
  flowSpeed: 0.05,
  flowScale: 1.0, // blob size: smaller = bigger blobs
  steps: [
    { label: 'Hi, my name is', placeholder: 'Jane Doe' },
    { label: 'I work at', placeholder: 'company name' },
    { label: 'I would like you to create', placeholder: 'anything you want', chips: ['A brand identity', 'A website', 'A 3D experience', 'Something else'] },
  ],
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const range = ([a, b]: number[], t: number) => clamp01((t - a) / (b - a))
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const easeInCubic = (t: number) => t * t * t
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

type Clock = { phase: Phase; start: number }

// ?at=1.6 freezes the opening animation at that second after the click (for comparing frames with the reference)
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
  uniform vec2 uC;
  uniform float uR, uLiquid;
  uniform float uFlowSpeed, uFlowScale;
  uniform vec3 uLDeep, uLBase, uLLilac, uLSky, uLCyan, uLAqua;
  ${orbGlsl}

  // lava-lamp gradient: big soft blobs drifting over a blue base, edges wobbled by low-frequency noise
  vec3 liquid(vec2 p, float time) {
    float tt = time * uFlowSpeed * 6.0;
    vec2 w = p + 0.18 * (vec2(noise(p * 1.3 + tt * 0.3), noise(p * 1.3 - tt * 0.25 + 7.0)) - 0.5);
    vec3 c = mix(uLBase, uLDeep, smoothstep(-0.2, 0.9, length(w * vec2(0.7, 1.0))));
    c = mix(c, uLLilac, 0.35 * noise(w * 0.8 + tt * 0.1));
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      vec2 ctr = vec2(
        sin(tt * (0.21 + 0.05 * fi) + fi * 1.9) * 0.95,
        cos(tt * (0.17 + 0.04 * fi) + fi * 2.7) * 0.5
      );
      float rad = (0.22 + 0.2 * hash(vec2(fi, 2.0))) / uFlowScale;
      float wgt = smoothstep(0.1, 0.85, exp(-dot(w - ctr, w - ctr) / (rad * rad))); // soft but readable edges
      int k = i - 4 * (i / 4);
      vec3 bc = k == 0 ? uLCyan : k == 1 ? uLSky : k == 2 ? uLAqua : uLLilac;
      c = mix(c, bc, wgt * 0.85);
      c += vec3(0.85, 1.0, 1.0) * 0.1 * pow(wgt, 6.0) * float(k == 2); // bright cores in the aqua blobs
    }
    return c;
  }

  void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float time = uTime;
    float px = 1.5 / uRes.y;

    vec3 col = nightSky(p, time);
    vec2 d = p - uC;
    float r = length(d);
    float R = uR;
    col += orbGlow(r, R) * (1.0 - uLiquid);

    float inside = smoothstep(R + px * 2.0, R - px * 2.0, r);
    float rr = clamp(r / R, 0.0, 1.0);
    vec2 q = d / R;
    vec3 n = vec3(q, sqrt(max(0.0, 1.0 - rr * rr)));
    vec3 orb = orbFinish(orbColor(q, time), q, rr, n, time, 1.0 - uLiquid);
    // the orb body melts into the flowing gradient from the middle out
    float melt = smoothstep(rr, rr + 0.3, uLiquid * 1.4); // melted region grows from the center
    vec3 body = mix(orb, liquid(p, time), melt);
    body = mix(body, orb, smoothstep(0.86, 1.0, rr) * (1.0 - uLiquid) * 0.6); // keep the pearl rim while it is still an orb
    col = mix(col, body, inside);

    gl_FragColor = vec4(col, 1.0);
  }
`

function Scene({ clock }: { clock: MutableRefObject<Clock> }) {
  const uniforms = useMemo(() => {
    const l = CONFIG.liquid
    return {
      uRes: { value: new Vector2(1, 1) },
      uTime: { value: 0 },
      uC: { value: new Vector2() },
      uR: { value: CONFIG.pageOrb.r },
      uLiquid: { value: 0 },
      uFlowSpeed: { value: CONFIG.flowSpeed },
      uFlowScale: { value: CONFIG.flowScale },
      uLDeep: { value: hex(l.deep) },
      uLBase: { value: hex(l.base) },
      uLLilac: { value: hex(l.lilac) },
      uLSky: { value: hex(l.sky) },
      uLCyan: { value: hex(l.cyan) },
      uLAqua: { value: hex(l.aqua) },
      ...orbUniforms(),
    }
  }, [])

  useFrame(({ gl, size, clock: c }) => {
    const u = uniforms
    const dpr = gl.getPixelRatio()
    const aspect = size.width / size.height
    u.uRes.value.set(size.width * dpr, size.height * dpr)
    if (!reducedMotion()) u.uTime.value = c.elapsedTime

    // orb positions in viewport-height units, center 0, y up
    const narrow = Math.min(1, aspect * 1.35)
    const pageC = new Vector2(-aspect / 2 + CONFIG.pageOrb.x * aspect, 0.5 - CONFIG.pageOrb.y)
    const pageR = CONFIG.pageOrb.r * narrow
    const smallR = CONFIG.smallOrb * narrow
    const bigR = Math.hypot(aspect, 1) * 0.75 // past every corner

    const { phase, start } = clock.current
    const T = reducedMotion() ? 1e3 : (frozenAt ?? (performance.now() - start) / 1000)
    let center = pageC
    let R = pageR
    let liquid = 0
    if (phase === 'opening' || phase === 'form') {
      const k = CONFIG.open
      const move = easeInOutCubic(range(k.move, T))
      const grow = phase === 'form' ? 1 : easeInCubic(range(k.grow, T))
      center = pageC.clone().lerp(new Vector2(), move)
      R = lerp(lerp(pageR, smallR, move), bigR, grow)
      R *= 1 + 0.03 * Math.sin(T * 5) * (move - grow) // breathes while it waits in the middle
      liquid = phase === 'form' ? 1 : easeInOutCubic(range(k.liquid, T))
    } else if (phase === 'closing') {
      const k = CONFIG.close
      const back = easeInOutCubic(range(k.collapse, T))
      center = new Vector2().lerp(pageC, back)
      R = lerp(bigR, pageR, back)
      liquid = 1 - easeInOutCubic(range(k.liquid, T))
    }
    u.uC.value.copy(center)
    u.uR.value = R
    u.uLiquid.value = liquid
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial args={[{ vertexShader, fragmentShader, uniforms }]} />
    </mesh>
  )
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>(frozenAt === null ? 'page' : 'opening')
  const [step, setStep] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [values, setValues] = useState<string[]>(CONFIG.steps.map(() => ''))
  const [thanks, setThanks] = useState(false)
  const clock = useRef<Clock>({ phase: frozenAt === null ? 'page' : 'opening', start: 0 })
  const input = useRef<HTMLInputElement>(null)
  const timers = useRef<number[]>([])

  const later = (fn: () => void, sec: number) => timers.current.push(window.setTimeout(fn, reducedMotion() ? 0 : sec * 1000))
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const go = (next: Phase) => {
    clock.current = { phase: next, start: performance.now() }
    setPhase(next)
  }

  const open = () => {
    if (phase !== 'page') return
    setStep(0)
    setValues(CONFIG.steps.map(() => ''))
    setThanks(false)
    go('opening')
    later(() => go('form'), CONFIG.open.done)
  }

  const close = () => {
    if (phase !== 'form') return
    go('closing')
    later(() => go('page'), CONFIG.close.done)
  }

  // blur out the current step, then show the next one
  const advance = (to: number | 'thanks') => {
    setLeaving(true)
    later(() => {
      setLeaving(false)
      if (to === 'thanks') {
        setThanks(true)
        later(close, CONFIG.thanksSec)
      } else setStep(to)
    }, 0.35)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!values[step].trim() || leaving) return
    advance(step < CONFIG.steps.length - 1 ? step + 1 : 'thanks')
  }

  useEffect(() => {
    if (phase === 'form' && !thanks) input.current?.focus()
  }, [phase, step, thanks])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const s = CONFIG.steps[step]
  const value = values[step]
  const setValue = (v: string) => setValues((vs) => vs.map((x, i) => (i === step ? v : x)))

  return (
    <div className={`liquid-page phase-${phase}`} style={{ background: ORB.pageDeep }}>
      <Canvas flat dpr={[1, 2]} gl={{ antialias: false }}>
        <Scene clock={clock} />
      </Canvas>

      <section className="contact" aria-hidden={phase !== 'page'}>
        <h1>
          Challenge us
          <br />
          with <em>your brief</em>.
        </h1>
        <button type="button" className="cta" onClick={open}>
          Start a project <span>›</span>
        </button>
        <dl className="contact-info">
          <div>
            <dt>Say hello</dt>
            <dd>hello@example.com</dd>
          </div>
          <div>
            <dt>Visit</dt>
            <dd>
              12 Example Street
              <br />
              Somewhere 1000
            </dd>
          </div>
        </dl>
      </section>

      {phase === 'form' && (
        <div className="form-layer">
          <div className="form-top">
            {step > 0 && !thanks ? (
              <button type="button" className="chip-btn" onClick={() => advance(step - 1)}>
                ‹ Previous
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="chip-btn" onClick={close}>
              Close ×
            </button>
          </div>
          {thanks ? (
            <div className="step step-in">
              <p className="step-label">
                Thanks, <em>{values[0]}</em>. We&rsquo;ll be in touch.
              </p>
            </div>
          ) : (
            <form key={step} className={`step ${leaving ? 'step-out' : 'step-in'}`} onSubmit={submit}>
              <div className="step-count">
                0{step + 1} / 0{CONFIG.steps.length}
              </div>
              <label className="step-label" htmlFor="liquid-input">
                {s.label}
              </label>
              <input
                id="liquid-input"
                ref={input}
                className="field"
                value={value}
                placeholder={s.placeholder}
                size={Math.max(s.placeholder.length, value.length + 1)}
                autoComplete="off"
                onChange={(e) => setValue(e.target.value)}
              />
              {s.chips && (
                <div className="chips">
                  {s.chips.map((c) => (
                    <button type="button" key={c} className="chip" onClick={() => setValue(c)}>
                      {c} <span>+</span>
                    </button>
                  ))}
                </div>
              )}
              <button type="submit" className={`next ${value.trim() ? 'is-on' : ''}`} aria-label="Next">
                ›
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
