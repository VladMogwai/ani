import {
  AmbientLight, DirectionalLight, HemisphereLight, MathUtils, OrthographicCamera, Scene, Vector3, WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BAKE } from './units'

// Shared by the unit and level bakers: same loader, light, camera direction and file saving, so units and locations
// match when the scene puts them together.

const loader = new GLTFLoader()
export const load = (url: string) => loader.loadAsync(url)

const post = async (path: string, body: Blob | string) => {
  const r = await fetch(`/__save?path=${encodeURIComponent(path)}`, { method: 'POST', body })
  if (!r.ok) throw new Error(`save failed: ${path}`)
}
export const saveImage = async (canvas: HTMLCanvasElement, path: string) =>
  post(path, await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/webp', BAKE.quality)))
export const saveJson = (path: string, data: unknown) => post(path, JSON.stringify(data, null, 2))

export const makeRenderer = () => {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setClearColor(0x000000, 0)
  return renderer
}

// soft daylight: key light from the screen's upper left, sky/ground fill
export const KEY_LIGHT = new Vector3(-1, 3, 2)
export const makeScene = () => {
  const scene = new Scene()
  scene.add(new HemisphereLight(0xffffff, 0x8a7f74, 1.6))
  scene.add(new AmbientLight(0xffffff, 0.4))
  const key = new DirectionalLight(0xfff4e0, 2.4)
  key.position.copy(KEY_LIGHT)
  scene.add(key)
  return { scene, key }
}

// from the target towards the camera: 30 degrees up, 45 degrees around (true 2:1 isometric)
const el = MathUtils.degToRad(BAKE.elevation)
export const VIEW = new Vector3(Math.SQRT1_2 * Math.cos(el), Math.sin(el), Math.SQRT1_2 * Math.cos(el))

// orthographic camera looking at `target`; the frustum edges are in world units along screen right / up
export const orthoAt = (target: Vector3, left: number, right: number, top: number, bottom: number) => {
  const camera = new OrthographicCamera(left, right, top, bottom, 1, 400)
  camera.position.copy(target).addScaledVector(VIEW, 200)
  camera.lookAt(target)
  return camera
}
