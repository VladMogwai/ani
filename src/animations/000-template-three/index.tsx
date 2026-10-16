import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Mesh } from 'three'

const CONFIG = {
  speed: 0.6,
  color: '#7c5cff',
}

function Box() {
  const ref = useRef<Mesh>(null)
  useFrame((_, dt) => {
    ref.current!.rotation.x += dt * CONFIG.speed
    ref.current!.rotation.y += dt * CONFIG.speed
  })
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshStandardMaterial color={CONFIG.color} />
    </mesh>
  )
}

export default function Page() {
  return (
    <div style={{ height: '100vh' }}>
      <Canvas camera={{ position: [0, 0, 5] }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 3, 3]} />
        <Box />
        <OrbitControls />
      </Canvas>
    </div>
  )
}
