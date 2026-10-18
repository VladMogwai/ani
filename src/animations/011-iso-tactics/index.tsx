import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Billboard, OrbitControls } from '@react-three/drei'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LEVEL_H, WATER_Y, cellAt, cells, random, toWorld } from './level'
import { grass, moss, stoneSide, stoneTop } from './textures'
import knightIdleUrl from './licensed/knight/Idle.png'
import mageIdleUrl from './assets/mage/idle.png'

const CONFIG = {
  pixel: 3, // CSS pixels per rendered pixel
  camera: { azimuth: Math.PI / 4, elevation: 0.52 }, // radians; 0.52 ≈ 30°, the classic 2:1 pixel-art angle
  zoomCells: 11, // how many cells fit across the narrow side of the screen
  background: '#121416',
  ambient: { color: '#8e9bb0', intensity: 1.5 },
  moon: { color: '#c4d0e6', intensity: 1.9, position: [-8, 14, 6] as const },
  grid: { show: false, color: '#d6b45e', opacity: 0.28, maxHeight: 4 }, // grid lines and hover on floors up to this height
  grassDensity: 0.32,
  torches: [
    { cell: [5, 2], height: 4.6 },
    { cell: [12, 1], height: 4.4 },
  ],
  torchLight: { color: '#ffae4a', intensity: 9, distance: 7 },
  // Sprite sheets: 128px frames, one row per facing on screen, clockwise from east: E, SE, S, SW, W, NW, N, NE.
  // size = world units of a frame (both characters are ~1 unit tall), feet = feet height in the frame from the bottom,
  // minLuma = darker opaque pixels don't count as body for the outline (the knight's baked shadow is near-black).
  characters: {
    knight: { idle: knightIdleUrl, width: 1920, frames: 15, fps: 12, size: 2.3, feet: 0.22, minLuma: 0.04 },
    mage: { idle: mageIdleUrl, width: 1792, frames: 14, fps: 10, size: 2.3, feet: 0.37, minLuma: 0 },
  },
  units: [
    { name: 'Mage', character: 'mage', cell: [9, 8], tint: '#ffffff', team: '#f2c14e' },
    { name: 'Dark Knight', character: 'knight', cell: [6, 6], tint: '#a07880', team: '#e0463e' },
  ] as const,
  // readability: team-coloured outline around the sprite, a ring and a dark spot under the feet
  outline: { show: false, texels: 1 }, // thickness in sheet pixels; ~1 screen pixel after downscaling
  ring: { inner: 0.34, outer: 0.42, opacity: 0.85 },
  footShadow: { radius: 0.4, opacity: 0.45 },
}

const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const dummy = new Object3D()

// Stone columns: one box per height level, so side textures keep their proportions
function Terrain() {
  const meshRef = useRef<InstancedMesh>(null)
  const hoverRef = useRef<Mesh>(null)

  const { blocks, materials, geometry } = useMemo(() => {
    const blocks: { x: number; z: number; level: number }[] = []
    for (const c of cells) for (let level = 0; level < c.h; level++) blocks.push({ x: c.x, z: c.z, level })
    const top = new MeshStandardMaterial({ map: stoneTop(), roughness: 0.95 })
    const side = new MeshStandardMaterial({ map: stoneSide(), roughness: 1 })
    // box faces: +x, -x, +y, -y, +z, -z
    return { blocks, materials: [side, side, top, side, side, side], geometry: new BoxGeometry(1, LEVEL_H, 1) }
  }, [])

  useLayoutEffect(() => {
    const mesh = meshRef.current!
    const rnd = random(21)
    const color = new Color()
    blocks.forEach((b, i) => {
      const [wx, wz] = toWorld(b.x, b.z)
      dummy.position.set(wx, (b.level + 0.5) * LEVEL_H, wz)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      // slight per-block tint, darker towards the bottom of tall walls
      const shade = 0.88 + rnd() * 0.16 - Math.max(0, 3 - b.level) * 0.03
      mesh.setColorAt(i, color.setRGB(shade, shade, shade * 1.02))
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
    return () => {
      geometry.dispose()
      new Set(materials).forEach((m) => {
        m.map?.dispose()
        m.dispose()
      })
    }
  }, [blocks, geometry, materials])

  // highlight the top of the hovered column
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const b = blocks[e.instanceId!]
    const c = cellAt(b.x, b.z)
    const [wx, wz] = toWorld(c.x, c.z)
    hoverRef.current!.position.set(wx, c.h * LEVEL_H + 0.01, wz)
    hoverRef.current!.visible = c.h <= CONFIG.grid.maxHeight
  }

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[geometry, materials, blocks.length]}
        castShadow
        receiveShadow
        onPointerMove={onMove}
        onPointerOut={() => (hoverRef.current!.visible = false)}
      />
      <mesh ref={hoverRef} rotation-x={-Math.PI / 2} visible={false} renderOrder={-1}>
        <planeGeometry args={[0.94, 0.94]} />
        <meshBasicMaterial color={CONFIG.grid.color} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {CONFIG.grid.show && <Grid />}
    </>
  )
}

// Thin golden lines around every floor cell
function Grid() {
  const geometry = useMemo(() => {
    const pts: number[] = []
    for (const c of cells) {
      if (c.water || c.h > CONFIG.grid.maxHeight) continue
      const [wx, wz] = toWorld(c.x, c.z)
      const y = c.h * LEVEL_H + 0.005
      const a = [wx - 0.5, wz - 0.5]
      const b = [wx + 0.5, wz + 0.5]
      pts.push(a[0], y, a[1], b[0], y, a[1], b[0], y, a[1], b[0], y, b[1])
      pts.push(b[0], y, b[1], a[0], y, b[1], a[0], y, b[1], a[0], y, a[1])
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])
  return (
    // drawn before the sprites, so characters cover the lines instead of showing them through
    <lineSegments geometry={geometry} renderOrder={-1}>
      <lineBasicMaterial color={CONFIG.grid.color} transparent opacity={CONFIG.grid.opacity} depthWrite={false} />
    </lineSegments>
  )
}

// Dry grass tufts: two crossed planes per tuft, scattered on the floors
function Grass() {
  const meshRef = useRef<InstancedMesh>(null)
  const { geometry, material, spots } = useMemo(() => {
    const a = new PlaneGeometry(0.5, 0.5).translate(0, 0.25, 0)
    const b = a.clone().rotateY(Math.PI / 2)
    const geometry = mergeGeometries([a, b])
    const material = new MeshStandardMaterial({ map: grass(), alphaTest: 0.5, side: DoubleSide, roughness: 1 })
    const rnd = random(9)
    const spots: [number, number, number, number][] = []
    for (const c of cells) {
      if (c.water || c.h < 2 || c.h > 5 || rnd() > CONFIG.grassDensity) continue
      if (CONFIG.units.some((u) => u.cell[0] === c.x && u.cell[1] === c.z)) continue // keep unit cells clear
      const [wx, wz] = toWorld(c.x, c.z)
      for (let i = 0; i < 1 + Math.floor(rnd() * 3); i++)
        spots.push([wx + (rnd() - 0.5) * 0.8, c.h * LEVEL_H, wz + (rnd() - 0.5) * 0.8, 0.7 + rnd() * 0.6])
    }
    return { geometry, material, spots }
  }, [])
  useLayoutEffect(() => {
    const mesh = meshRef.current!
    spots.forEach(([x, y, z, s], i) => {
      dummy.position.set(x, y, z)
      dummy.scale.setScalar(s)
      dummy.rotation.set(0, s * 7, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    dummy.scale.setScalar(1)
    dummy.rotation.set(0, 0, 0)
    return () => {
      geometry.dispose()
      material.map?.dispose()
      material.dispose()
    }
  }, [geometry, material, spots])
  return <instancedMesh ref={meshRef} args={[geometry, material, spots.length]} receiveShadow />
}

// Dark water in the pit with slow moving highlights, plus the mossy block
function Water() {
  const water = cells.filter((c) => c.water)
  const xs = water.map((c) => c.x)
  const zs = water.map((c) => c.z)
  const [x0, z0] = toWorld(Math.min(...xs), Math.min(...zs))
  const [x1, z1] = toWorld(Math.max(...xs), Math.max(...zs))
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vPos;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vPos = world.xz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vPos;
          void main() {
            float w = sin(vPos.x * 3.1 + uTime * 0.9) * sin(vPos.y * 2.3 - uTime * 0.7);
            w += 0.5 * sin((vPos.x + vPos.y) * 5.0 + uTime * 1.3);
            vec3 col = mix(vec3(0.05, 0.11, 0.13), vec3(0.09, 0.19, 0.21), w * 0.3 + 0.5);
            col += step(1.15, w) * vec3(0.12, 0.2, 0.2);
            gl_FragColor = vec4(col, 0.9);
          }`,
      }),
    [],
  )
  const mossMat = useMemo(() => new MeshStandardMaterial({ map: moss(), roughness: 1 }), [])
  useLayoutEffect(
    () => () => {
      material.dispose()
      mossMat.map?.dispose()
      mossMat.dispose()
    },
    [material, mossMat],
  )
  useFrame((_, dt) => {
    if (!reduced) material.uniforms.uTime.value += dt
  })
  const block = water.find((c) => c.moss)
  const [mx, mz] = block ? toWorld(block.x, block.z) : [0, 0]
  return (
    <>
      <mesh position={[(x0 + x1) / 2, WATER_Y, (z0 + z1) / 2]} rotation-x={-Math.PI / 2} material={material}>
        <planeGeometry args={[x1 - x0 + 1, z1 - z0 + 1]} />
      </mesh>
      {block && (
        <mesh position={[mx, 0.5, mz]} material={mossMat} castShadow receiveShadow>
          <boxGeometry args={[0.9, 1, 0.9]} />
        </mesh>
      )}
    </>
  )
}

const flameShader = {
  uniforms: { uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv - vec2(0.5, 0.18);
      p.x += sin(vUv.y * 9.0 + uTime * 11.0) * 0.06 * vUv.y;
      float width = 0.32 * (1.0 - vUv.y) + 0.02;
      float d = length(vec2(p.x / width, p.y * 1.6));
      float a = smoothstep(1.0, 0.55, d) * smoothstep(1.0, 0.75, vUv.y + sin(uTime * 17.0) * 0.05);
      vec3 col = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.92, 0.55), smoothstep(0.8, 0.2, d));
      gl_FragColor = vec4(col, a);
    }`,
}

// Wall torch: dark bracket, flickering flame billboard and a warm point light
function Torch({ cell, height }: { cell: number[]; height: number }) {
  const [wx, wz] = toWorld(cell[0], cell[1])
  const lightRef = useRef<PointLight>(null)
  const material = useMemo(
    () => new ShaderMaterial({ ...flameShader, uniforms: { uTime: { value: Math.random() * 10 } }, transparent: true, blending: AdditiveBlending, depthWrite: false }),
    [],
  )
  useLayoutEffect(() => () => material.dispose(), [material])
  useFrame((_, dt) => {
    if (reduced) return
    const t = (material.uniforms.uTime.value += dt)
    lightRef.current!.intensity = CONFIG.torchLight.intensity * (0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.07)
  })
  // torches hang on the face of the wall that looks towards the camera (+z side)
  const pos = new Vector3(wx, height * LEVEL_H, wz + 0.55)
  return (
    <group position={pos}>
      <mesh position={[0, -0.12, 0]}>
        <boxGeometry args={[0.1, 0.3, 0.1]} />
        <meshStandardMaterial color="#2a2522" />
      </mesh>
      <Billboard position={[0, 0.16, 0]}>
        <mesh material={material}>
          <planeGeometry args={[0.3, 0.45]} />
        </mesh>
      </Billboard>
      <pointLight ref={lightRef} position={[0, 0.2, 0.3]} color={CONFIG.torchLight.color} intensity={CONFIG.torchLight.intensity} distance={CONFIG.torchLight.distance} decay={1.6} />
    </group>
  )
}

// Sprite sheet frame with a solid outline around the body; the soft baked shadow is not outlined
const unitShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D map;
    uniform vec2 offset;
    uniform vec2 repeat;
    uniform vec2 texel;
    uniform vec3 tint;
    uniform vec3 outline;
    uniform float minLuma;
    varying vec2 vUv;
    // the body is opaque and not near-black; the baked shadow is dark and mostly translucent
    float body(vec2 uv) {
      vec4 c = texture2D(map, uv);
      return step(0.99, c.a) * step(minLuma, dot(c.rgb, vec3(0.333)));
    }
    void main() {
      vec2 uv = offset + vUv * repeat;
      vec4 c = texture2D(map, uv);
      if (c.a > 0.99) {
        gl_FragColor = vec4(c.rgb * tint, 1.0);
      } else {
        float o = 0.0;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7853982;
          o = max(o, body(uv + vec2(cos(a), sin(a)) * texel));
        }
        gl_FragColor = o > 0.0 ? vec4(outline, 1.0) : vec4(c.rgb * tint, c.a);
      }
      #include <colorspace_fragment>
    }`,
}

type Character = keyof typeof CONFIG.characters

// A character standing on a cell, playing the idle loop and turning to face the target on screen
function Unit({ character, cell, tint, team, target }: { character: Character; cell: readonly number[]; tint: string; team: string; target: readonly number[] }) {
  const sheet = CONFIG.characters[character]
  const camera = useThree((s) => s.camera)
  const ringRef = useRef<Mesh>(null)
  const { material, geometry } = useMemo(() => {
    const t = new TextureLoader().load(sheet.idle)
    t.colorSpace = SRGBColorSpace
    t.magFilter = t.minFilter = LinearFilter
    t.generateMipmaps = false
    const { frames, size, feet, width, minLuma } = sheet
    const material = new ShaderMaterial({
      ...unitShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        map: { value: t },
        offset: { value: new Vector2() },
        repeat: { value: new Vector2(1 / frames, 1 / 8) },
        // zero offset = no neighbour can be body, so the outline disappears
        texel: { value: new Vector2(CONFIG.outline.texels / width, CONFIG.outline.texels / 1024).multiplyScalar(CONFIG.outline.show ? 1 : 0) },
        minLuma: { value: minLuma },
        tint: { value: new Color(tint) },
        outline: { value: new Color(team) },
      },
    })
    // plane with the feet at its origin
    const geometry = new PlaneGeometry(size, size).translate(0, (0.5 - feet) * size, 0)
    return { material, geometry }
  }, [sheet, tint, team])
  useLayoutEffect(
    () => () => {
      material.uniforms.map.value.dispose()
      material.dispose()
      geometry.dispose()
    },
    [material, geometry],
  )
  const [wx, wz] = toWorld(cell[0], cell[1])
  const y = cellAt(cell[0], cell[1]).h * LEVEL_H
  const [tx, tz] = toWorld(target[0], target[1])
  const ty = cellAt(target[0], target[1]).h * LEVEL_H
  const a = useMemo(() => new Vector3(), [])
  const b = useMemo(() => new Vector3(), [])
  const offset = useMemo(() => Math.random() * 10, [])

  useFrame(({ clock }) => {
    // facing: angle to the target on screen, snapped to 8 directions
    a.set(wx, y, wz).project(camera)
    b.set(tx, ty, tz).project(camera)
    const angle = Math.atan2(-(b.y - a.y), b.x - a.x) // screen y points down
    const dir = (Math.round(angle / (Math.PI / 4)) + 8) % 8
    const row = dir
    const t = clock.elapsedTime + offset
    const frame = reduced ? 0 : Math.floor(t * sheet.fps) % sheet.frames
    material.uniforms.offset.value.set(frame / sheet.frames, 1 - (row + 1) / 8)
    if (!reduced) (ringRef.current!.material as MeshBasicMaterial).opacity = CONFIG.ring.opacity * (0.75 + Math.sin(t * 3) * 0.25)
  })

  return (
    <group position={[wx, y, wz]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.012} renderOrder={-1}>
        <circleGeometry args={[CONFIG.footShadow.radius, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={CONFIG.footShadow.opacity} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} position-y={0.014} renderOrder={-1}>
        <ringGeometry args={[CONFIG.ring.inner, CONFIG.ring.outer, 32]} />
        <meshBasicMaterial color={team} transparent opacity={CONFIG.ring.opacity} depthWrite={false} />
      </mesh>
      <Billboard>
        <mesh geometry={geometry} material={material} renderOrder={1} />
      </Billboard>
    </group>
  )
}

// Orthographic camera at a fixed tilt; zoom fits the map to the screen
function CameraRig() {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const { azimuth, elevation } = CONFIG.camera
    const r = 40
    camera.position.set(Math.sin(azimuth) * Math.cos(elevation) * r, Math.sin(elevation) * r, Math.cos(azimuth) * Math.cos(elevation) * r)
    camera.zoom = Math.min(size.width, size.height) / CONFIG.zoomCells
    camera.lookAt(0, 1, 0)
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

function Scene() {
  const [hero, enemy] = CONFIG.units
  return (
    <>
      <color attach="background" args={[CONFIG.background]} />
      <ambientLight color={CONFIG.ambient.color} intensity={CONFIG.ambient.intensity} />
      <directionalLight
        color={CONFIG.moon.color}
        intensity={CONFIG.moon.intensity}
        position={[...CONFIG.moon.position]}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.002}
      />
      <Terrain />
      <Grass />
      <Water />
      {CONFIG.torches.map((t, i) => (
        <Torch key={i} {...t} />
      ))}
      <Unit {...hero} target={enemy.cell} />
      <Unit {...enemy} target={hero.cell} />
      <CameraRig />
      <OrbitControls
        target={[0, 1, 0]}
        enablePan={false}
        minPolarAngle={Math.PI / 2 - CONFIG.camera.elevation}
        maxPolarAngle={Math.PI / 2 - CONFIG.camera.elevation}
        minZoom={20}
        maxZoom={160}
      />
    </>
  )
}

export default function Page() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: CONFIG.background }}>
      <Canvas
        orthographic
        shadows
        flat
        dpr={1 / CONFIG.pixel}
        gl={{ antialias: false }}
        camera={{ near: 0.1, far: 200 }}
        onCreated={({ gl }) => (gl.domElement.style.imageRendering = 'pixelated')}
      >
        <Scene />
      </Canvas>
      {/* soft vignette like the reference frame */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgb(0 0 0 / .55))' }} />
    </div>
  )
}
