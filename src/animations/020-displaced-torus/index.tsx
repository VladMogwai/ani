import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const CONFIG = {
  // torus: ring radius, tube radius, segments around the tube / along the ring
  radius: 1,
  tube: 0.3,
  radialSegments: 200,
  tubularSegments: 600,
  // displacement: strength, width of the bulging zone, noise frequency in UV space
  displace: 2,
  spread: 1.2,
  noise: 16,
  // the zone drifts along the ring by sin(t) / (zoneSwing * spread)
  zoneSwing: 12,
  // surface stripes: noise frequency along Z and brightness
  stripes: 35,
  stripeGain: 40,
  color: [0.498, 0.204, 0.831] as const,
  // color is divided by this (blue gets pushed far above 1 and blooms)
  colorDivisor: [0.494, 0.494, 0.051] as const,
  // rotation.z = sin(t) * wobble + t * spin + offset
  wobble: 0.25,
  spin: 0.05,
  rotationOffset: 5,
  bloom: { strength: 1.4, radius: 0.0001, threshold: 0.01 },
  // camera position: the torus is seen slightly from the side, as in the video
  camera: [0.9, 0.5, 4.6] as const,
  // below this aspect ratio (phones) the camera moves back so the ring fits the width
  fitAspect: 1.2,
  background: '#000000',
}

// Classic 3D gradient noise with a sine-free integer hash.
const NOISE = /* glsl */ `
vec3 hash3(vec3 p) {
  uvec3 q = uvec3(ivec3(p)) * uvec3(1597334673u, 3812015801u, 2798796415u);
  q = (q.x ^ q.y ^ q.z) * uvec3(1597334673u, 3812015801u, 2798796415u);
  return -1.0 + 2.0 * vec3(q) * (1.0 / float(0xffffffffu));
}
float gnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dot(hash3(i + vec3(0, 0, 0)), f - vec3(0, 0, 0)), dot(hash3(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
        mix(dot(hash3(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash3(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
    mix(mix(dot(hash3(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash3(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
        mix(dot(hash3(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash3(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y),
    u.z);
}
`

// Shared by both stages: how far a point on the surface is pushed out.
const DISPLACEMENT = /* glsl */ `
uniform float uTime;
uniform float uDisplace;
uniform float uSpread;
uniform float uNoise;
uniform float uZoneSwing;
float displacement(vec2 uv) {
  float n = gnoise(vec3(uv * uNoise, sin(uTime) * 1.4)) * uDisplace;
  float dist = abs(uv.x - (0.5 + sin(uTime) / (uZoneSwing * uSpread)));
  return n * clamp(0.23 * uSpread - dist, 0.0, 1.0);
}
`

const vertexShader = /* glsl */ `
${NOISE}
${DISPLACEMENT}
varying vec3 vPosition;
varying vec2 vUv;
varying float vDisplacement;
void main() {
  vUv = uv;
  vDisplacement = displacement(uv);
  vPosition = position + normal * vDisplacement;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1.0);
}
`

const fragmentShader = /* glsl */ `
${NOISE}
uniform float uStripes;
uniform float uStripeGain;
uniform vec3 uColor;
varying vec3 vPosition;
varying float vDisplacement;
void main() {
  float stripes = gnoise(vec3(1.0 - vPosition.z * uStripes)) * uStripeGain;
  vec3 color = -stripes * (0.01 - vDisplacement) * uColor;
  gl_FragColor = vec4(max(color, 0.0), 1.0);
}
`

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function Torus() {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDisplace: { value: CONFIG.displace },
      uSpread: { value: CONFIG.spread },
      uNoise: { value: CONFIG.noise },
      uZoneSwing: { value: CONFIG.zoneSwing },
      uStripes: { value: CONFIG.stripes },
      uStripeGain: { value: CONFIG.stripeGain },
      uColor: {
        value: new THREE.Vector3(...CONFIG.color).divide(new THREE.Vector3(...CONFIG.colorDivisor)),
      },
    }),
    [],
  )

  useFrame(({ clock }) => {
    const t = reducedMotion ? 1 : clock.elapsedTime
    material.current!.uniforms.uTime.value = t
    mesh.current!.rotation.z = Math.sin(t) * CONFIG.wobble + t * CONFIG.spin + CONFIG.rotationOffset
  })

  return (
    <mesh ref={mesh}>
      <torusGeometry args={[CONFIG.radius, CONFIG.tube, CONFIG.radialSegments, CONFIG.tubularSegments]} />
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function Bloom() {
  const { gl, scene, camera, size } = useThree()
  const composer = useMemo(() => {
    // 8-bit target like three.js in 2023: the scene is clamped to 1 before bloom, otherwise blue (x16) blows out
    const c = new EffectComposer(gl, new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType }))
    c.addPass(new RenderPass(scene, camera))
    const { strength, radius, threshold } = CONFIG.bloom
    // resolution is set by composer.setSize below
    c.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), strength, radius, threshold))
    return c
  }, [gl, scene, camera])

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio())
    composer.setSize(size.width, size.height)
  }, [composer, gl, size])
  useEffect(() => () => composer.dispose(), [composer])

  // No OutputPass: the shader writes display values directly, like the original (no sRGB/tone mapping).
  // priority 1 takes over rendering from R3F
  useFrame(() => composer.render(), 1)
  return null
}

function CameraFit() {
  const { camera, size } = useThree()
  useEffect(() => {
    const base = new THREE.Vector3(...CONFIG.camera).length()
    const aspect = size.width / size.height
    camera.position.setLength(base * Math.max(1, CONFIG.fitAspect / aspect))
  }, [camera, size])
  return null
}

export default function Page() {
  return (
    <div style={{ height: '100vh', background: CONFIG.background }}>
      <Canvas camera={{ position: [...CONFIG.camera], fov: 45 }} gl={{ antialias: true }}>
        <color attach="background" args={[CONFIG.background]} />
        <Torus />
        <Bloom />
        <CameraFit />
        <OrbitControls enableDamping enablePan={false} />
      </Canvas>
    </div>
  )
}
