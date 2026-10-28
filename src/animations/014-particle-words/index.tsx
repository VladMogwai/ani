import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial } from 'three'

const CONFIG = {
  words: ['MOTION', 'LAB', 'PLAY', '✦'],
  autoAdvanceMs: 5000,
  count: 7000,
  font: '900 {size}px system-ui, -apple-system, "Helvetica Neue", sans-serif',
  maxWidthRatio: 0.86, // word width relative to the viewport
  maxHeightRatio: 0.5,
  spring: 0.045, // pull towards the target point
  damping: 0.86,
  noise: 0.35, // idle jitter, px per frame
  burst: 18, // random kick when the word changes
  cursorRadius: 110,
  cursorForce: 7,
  pointSize: 3.2,
  colorA: '#ff5f6d',
  colorB: '#7c5cff',
  colorFast: '#fff4d6',
  background: '#07060c',
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Draw the word on an offscreen canvas and return points on its pixels, centered at 0,0, y up.
function sampleWord(word: string, width: number, height: number): Float32Array {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  let size = height * CONFIG.maxHeightRatio
  ctx.font = CONFIG.font.replace('{size}', String(size))
  const measured = ctx.measureText(word).width
  if (measured > width * CONFIG.maxWidthRatio) size *= (width * CONFIG.maxWidthRatio) / measured
  ctx.font = CONFIG.font.replace('{size}', String(size))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(word, width / 2, height / 2)

  const data = ctx.getImageData(0, 0, width, height).data
  const filled: number[] = []
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 128) filled.push(x, y)

  // Pick CONFIG.count random filled pixels (with repeats if the word is small).
  const out = new Float32Array(CONFIG.count * 2)
  const n = filled.length / 2
  for (let i = 0; i < CONFIG.count; i++) {
    const p = Math.floor(Math.random() * n) * 2
    out[i * 2] = filled[p] - width / 2 + Math.random() - 0.5
    out[i * 2 + 1] = height / 2 - filled[p + 1] + Math.random() - 0.5
  }
  return out
}

const vertexShader = /* glsl */ `
  attribute float aSpeed;
  uniform float uSize;
  uniform float uHalfWidth;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorFast;
  varying vec3 vColor;
  void main() {
    float t = clamp(position.x / uHalfWidth * 0.5 + 0.5, 0.0, 1.0);
    float fast = clamp(aSpeed / 14.0, 0.0, 1.0);
    vColor = mix(mix(uColorA, uColorB, t), uColorFast, fast);
    gl_PointSize = uSize * (1.0 + fast * 0.6);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * a, a);
  }
`

function Particles() {
  const { size, gl, viewport } = useThree()
  const reduce = useMemo(reducedMotion, [])
  const wordIndex = useRef(0)
  const targets = useRef<Float32Array>(new Float32Array(CONFIG.count * 2))
  const vel = useMemo(() => new Float32Array(CONFIG.count * 2), [])
  const pointer = useRef({ x: 0, y: 0, active: false })

  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(CONFIG.count * 3)
    // Start scattered across the screen so the first word assembles from noise.
    for (let i = 0; i < CONFIG.count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * window.innerWidth
      pos[i * 3 + 1] = (Math.random() - 0.5) * window.innerHeight
    }
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aSpeed', new BufferAttribute(new Float32Array(CONFIG.count), 1))
    return g
  }, [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uSize: { value: CONFIG.pointSize },
          uHalfWidth: { value: 1 },
          uColorA: { value: new Color(CONFIG.colorA) },
          uColorB: { value: new Color(CONFIG.colorB) },
          uColorFast: { value: new Color(CONFIG.colorFast) },
        },
      }),
    [],
  )

  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material])

  // (Re)build targets on resize and on word change.
  useEffect(() => {
    material.uniforms.uSize.value = CONFIG.pointSize * viewport.dpr
    material.uniforms.uHalfWidth.value = size.width / 2

    const show = (kick: boolean) => {
      targets.current = sampleWord(CONFIG.words[wordIndex.current], size.width, size.height)
      if (reduce) {
        const pos = geometry.attributes.position.array as Float32Array
        for (let i = 0; i < CONFIG.count; i++) {
          pos[i * 3] = targets.current[i * 2]
          pos[i * 3 + 1] = targets.current[i * 2 + 1]
        }
        geometry.attributes.position.needsUpdate = true
      } else if (kick) {
        for (let i = 0; i < vel.length; i++) vel[i] += (Math.random() - 0.5) * CONFIG.burst * 2
      }
    }
    const next = () => {
      wordIndex.current = (wordIndex.current + 1) % CONFIG.words.length
      show(true)
    }
    show(false)

    const el = gl.domElement
    let timer = window.setInterval(next, CONFIG.autoAdvanceMs)
    const onClick = () => {
      next()
      window.clearInterval(timer)
      timer = window.setInterval(next, CONFIG.autoAdvanceMs)
    }
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      pointer.current = { x: e.clientX - r.left - r.width / 2, y: r.height / 2 - (e.clientY - r.top), active: true }
    }
    const onLeave = () => (pointer.current.active = false)
    const onUp = (e: PointerEvent) => e.pointerType === 'touch' && onLeave()
    el.addEventListener('click', onClick)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onMove)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('pointerup', onUp)
    return () => {
      window.clearInterval(timer)
      el.removeEventListener('click', onClick)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onMove)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('pointerup', onUp)
    }
  }, [size.width, size.height, viewport.dpr, gl, geometry, material, vel, reduce])

  useFrame((_, dt) => {
    if (reduce) return
    const step = Math.min(dt * 60, 2) // frame-rate independent, in 60 fps frames
    const pos = geometry.attributes.position.array as Float32Array
    const speed = geometry.attributes.aSpeed.array as Float32Array
    const t = targets.current
    const { x: px, y: py, active } = pointer.current
    const r = CONFIG.cursorRadius
    const damp = Math.pow(CONFIG.damping, step)

    for (let i = 0; i < CONFIG.count; i++) {
      const ix = i * 3
      const iv = i * 2
      let vx = vel[iv] + (t[iv] - pos[ix]) * CONFIG.spring * step
      let vy = vel[iv + 1] + (t[iv + 1] - pos[ix + 1]) * CONFIG.spring * step
      vx += (Math.random() - 0.5) * CONFIG.noise * step
      vy += (Math.random() - 0.5) * CONFIG.noise * step

      if (active) {
        const dx = pos[ix] - px
        const dy = pos[ix + 1] - py
        const d2 = dx * dx + dy * dy
        if (d2 < r * r && d2 > 0.01) {
          const d = Math.sqrt(d2)
          const f = (1 - d / r) ** 2 * CONFIG.cursorForce * step
          vx += (dx / d) * f
          vy += (dy / d) * f
        }
      }

      vx *= damp
      vy *= damp
      vel[iv] = vx
      vel[iv + 1] = vy
      pos[ix] += vx * step
      pos[ix + 1] += vy * step
      speed[i] = Math.sqrt(vx * vx + vy * vy)
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aSpeed.needsUpdate = true
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

export default function Page() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: CONFIG.background, touchAction: 'none' }}>
      <Canvas orthographic camera={{ position: [0, 0, 100], zoom: 1 }} dpr={[1, 2]}>
        <Particles />
      </Canvas>
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          width: '100%',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.35)',
          font: '13px system-ui, sans-serif',
          pointerEvents: 'none',
        }}
      >
        move the cursor · click to change the word
      </div>
    </div>
  )
}
