import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Loader, OrbitControls, useGLTF } from '@react-three/drei'
import {
  AdditiveBlending, BufferGeometry, CanvasTexture, Color, DirectionalLight, Float32BufferAttribute, FileLoader, Fog,
  HemisphereLight, InstancedMesh, MeshLambertMaterial, Object3D, PointLight, Sprite, Vector3, type Mesh,
} from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import glbUrl from './assets/ruins.glb?url'
import grassUrl from './assets/grass.bin?url'
import points from './assets/points.json'

type Time = 'day' | 'dusk' | 'night'
type Light = { sun: [number, number, number]; sunColor: string; sunI: number; sky: string; ground: string; hemiI: number; fog: string; torch: number }

const CONFIG = {
  times: {
    day: { sun: [-0.6, 0.62, -0.42], sunColor: '#fff0d8', sunI: 3.8, sky: '#a7b8d0', ground: '#5a4c38', hemiI: 1.5, fog: '#a9b2ba', torch: 0 },
    dusk: { sun: [-0.92, 0.16, 0.2], sunColor: '#ff9150', sunI: 2.4, sky: '#7a6a86', ground: '#3a2a20', hemiI: 0.55, fog: '#b07a5e', torch: 0.55 },
    night: { sun: [0.45, 0.65, -0.5], sunColor: '#8fa6e0', sunI: 0.8, sky: '#2c3a5a', ground: '#101014', hemiI: 0.55, fog: '#0e1422', torch: 1 },
  } satisfies Record<Time, Light>,
  transition: 0.03, // share of the way to the target light per 60 fps frame
  camera: { fov: 35, start: [-30, 40, 58] as [number, number, number], minDistance: 12, maxDistance: 110 },
  fog: [80, 210] as [number, number],
  shadow: { size: 4096, extent: 55 },
  torch: { intensity: 90, distance: 16, color: '#ff8a3a', flicker: 0.25 },
  grass: { colorA: [0.16, 0.15, 0.07], colorB: [0.3, 0.26, 0.13], wind: 0.22, windSpeed: 1.6 },
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const castle = new Vector3(...(points.castle as [number, number, number]))

function Ruins() {
  const { scene } = useGLTF(glbUrl)
  useEffect(() => {
    scene.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      m.receiveShadow = true
      m.castShadow = o.name !== 'Terrain'
    })
  }, [scene])
  return <primitive object={scene} />
}

// one tuft = 4 crossed blades of height 1, scaled per instance; the tip sways in the vertex shader
function tuftGeometry() {
  const pos: number[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + Math.random() * 0.4
    const sx = Math.cos(a) * 0.22
    const sz = Math.sin(a) * 0.22
    const lean = 0.2 + Math.random() * 0.4
    pos.push(-sx, 0, -sz, sx, 0, sz, Math.sin(a) * lean, 1, -Math.cos(a) * lean)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function Grass({ reduce }: { reduce: boolean }) {
  const buf = useLoader(FileLoader, grassUrl, (l) => (l as FileLoader).setResponseType('arraybuffer')) as unknown as ArrayBuffer
  const data = useMemo(() => new Float32Array(buf), [buf])
  const count = data.length / 4
  const ref = useRef<InstancedMesh>(null)
  const geometry = useMemo(tuftGeometry, [])
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  const material = useMemo(() => {
    const m = new MeshLambertMaterial({ side: 2 })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float gust = sin(uTime * ${CONFIG.grass.windSpeed.toFixed(2)} + root.x * 0.3 + root.z * 0.2) * 0.6
                     + sin(uTime * 2.7 + root.x * 0.9) * 0.25;
          transformed.x += gust * position.y * ${CONFIG.grass.wind.toFixed(2)} / max(instanceMatrix[1][1], 0.1);`,
        )
    }
    return m
  }, [uniforms])

  useEffect(() => {
    const mesh = ref.current!
    const o = new Object3D()
    const c = new Color()
    const [a, b] = [CONFIG.grass.colorA, CONFIG.grass.colorB]
    for (let i = 0; i < count; i++) {
      o.position.set(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
      o.rotation.y = Math.random() * Math.PI * 2
      o.scale.setScalar(data[i * 4 + 3])
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      const t = Math.random()
      mesh.setColorAt(i, c.setRGB(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t))
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [count, data])

  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material])
  useFrame((_, dt) => {
    if (!reduce) uniforms.uTime.value += dt
  })
  return <instancedMesh ref={ref} args={[geometry, material, count]} receiveShadow frustumCulled={false} />
}

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,220,150,1)')
  g.addColorStop(0.25, 'rgba(255,140,50,0.6)')
  g.addColorStop(1, 'rgba(255,90,20,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new CanvasTexture(c)
}

function Torches({ level, reduce }: { level: React.RefObject<number>; reduce: boolean }) {
  const lights = useRef<(PointLight | null)[]>([])
  const glows = useRef<(Sprite | null)[]>([])
  const tex = useMemo(glowTexture, [])
  useEffect(() => () => tex.dispose(), [tex])
  const list = points.torches as [number, number, number][]

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const lv = level.current
    list.forEach((_, i) => {
      const f = reduce ? 1 : 1 + CONFIG.torch.flicker * (Math.sin(t * 13 + i * 7) * 0.5 + Math.sin(t * 23.7 + i * 3) * 0.3 + Math.sin(t * 5.3 + i) * 0.2)
      const l = lights.current[i]
      const g = glows.current[i]
      if (l) l.intensity = CONFIG.torch.intensity * lv * f
      if (g) {
        g.visible = lv > 0.03
        g.material.opacity = Math.min(1, lv * 1.4)
        g.scale.setScalar(0.9 + 0.25 * f)
      }
    })
  })

  return (
    <>
      {list.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh position={[0, 1.1, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.07, 2.2, 6]} />
            <meshStandardMaterial color="#2a1d12" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.25, 0]}>
            <cylinderGeometry args={[0.12, 0.07, 0.2, 6]} />
            <meshStandardMaterial color="#1a1612" metalness={0.6} roughness={0.5} />
          </mesh>
          <sprite ref={(s) => void (glows.current[i] = s)} position={[0, 2.5, 0]}>
            <spriteMaterial map={tex} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
          </sprite>
          <pointLight
            ref={(l) => void (lights.current[i] = l)}
            position={[0, 2.6, 0]}
            color={CONFIG.torch.color}
            distance={CONFIG.torch.distance}
            decay={2}
            intensity={0}
          />
        </group>
      ))}
    </>
  )
}

// eases sun, sky, fog and torch level towards the chosen time of day
function Lighting({ time, reduce }: { time: Time; reduce: boolean }) {
  const { scene } = useThree()
  const sun = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const torchLevel = useRef(0)
  const cur = useMemo(() => {
    const d = CONFIG.times.day
    return {
      dir: new Vector3(...d.sun).normalize(), sunColor: new Color(d.sunColor), sunI: d.sunI, sky: new Color(d.sky),
      ground: new Color(d.ground), hemiI: d.hemiI, fog: new Color(d.fog),
    }
  }, [])
  const tmp = useMemo(() => ({ v: new Vector3(), c: new Color() }), [])

  useEffect(() => {
    scene.fog = new Fog(cur.fog.clone(), ...CONFIG.fog)
    scene.background = cur.fog.clone()
    sun.current!.target.position.copy(castle)
    scene.add(sun.current!.target)
  }, [scene, cur])

  useFrame((_, dt) => {
    const t = CONFIG.times[time]
    const k = reduce ? 1 : 1 - Math.pow(1 - CONFIG.transition, dt * 60)
    cur.dir.lerp(tmp.v.set(...t.sun).normalize(), k).normalize()
    cur.sunColor.lerp(tmp.c.set(t.sunColor), k)
    cur.sky.lerp(tmp.c.set(t.sky), k)
    cur.ground.lerp(tmp.c.set(t.ground), k)
    cur.fog.lerp(tmp.c.set(t.fog), k)
    cur.sunI += (t.sunI - cur.sunI) * k
    cur.hemiI += (t.hemiI - cur.hemiI) * k
    torchLevel.current += (t.torch - torchLevel.current) * k

    const s = sun.current!
    s.position.copy(castle).addScaledVector(cur.dir, 90)
    s.color.copy(cur.sunColor)
    s.intensity = cur.sunI
    const h = hemi.current!
    h.color.copy(cur.sky)
    h.groundColor.copy(cur.ground)
    h.intensity = cur.hemiI
    ;(scene.fog as Fog).color.copy(cur.fog)
    ;(scene.background as Color).copy(cur.fog)
  })

  const e = CONFIG.shadow.extent
  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[CONFIG.shadow.size, CONFIG.shadow.size]}
        shadow-camera-left={-e}
        shadow-camera-right={e}
        shadow-camera-top={e}
        shadow-camera-bottom={-e}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <Torches level={torchLevel} reduce={reduce} />
    </>
  )
}

// keep the orbit target over the map so the edges stay out of sight
function clampTarget(c: OrbitControlsImpl) {
  c.target.x = Math.max(-28, Math.min(28, c.target.x))
  c.target.z = Math.max(-50, Math.min(30, c.target.z))
  c.target.y = Math.max(2, Math.min(12, c.target.y))
}

export default function Page() {
  const [time, setTime] = useState<Time>('day')
  const reduce = useMemo(reducedMotion, [])
  const { camera: cam } = CONFIG

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b0a09', touchAction: 'none' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: cam.fov, position: [castle.x + cam.start[0], cam.start[1], castle.z + cam.start[2]], near: 0.5, far: 400 }}
      >
        <Suspense fallback={null}>
          <Ruins />
          <Grass reduce={reduce} />
        </Suspense>
        <Lighting time={time} reduce={reduce} />
        <OrbitControls
          makeDefault
          target={castle.toArray()}
          enableDamping={!reduce}
          minDistance={cam.minDistance}
          maxDistance={cam.maxDistance}
          minPolarAngle={0.2}
          maxPolarAngle={1.35}
          screenSpacePanning={false}
          onChange={(e) => e && clampTarget(e.target as unknown as OrbitControlsImpl)}
        />
      </Canvas>
      <Loader />
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 6,
          padding: 6,
          background: 'rgba(14,12,10,0.72)',
          border: '1px solid rgba(200,180,140,0.25)',
          borderRadius: 4,
          font: '13px Georgia, serif',
        }}
      >
        {(['day', 'dusk', 'night'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTime(t)}
            style={{
              padding: '6px 14px',
              background: t === time ? 'rgba(200,170,110,0.25)' : 'transparent',
              color: t === time ? '#e9d8b0' : 'rgba(233,216,176,0.6)',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              font: 'inherit',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}
