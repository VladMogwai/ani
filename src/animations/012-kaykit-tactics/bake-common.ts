import {
  AmbientLight, Color, DirectionalLight, HemisphereLight, MathUtils, Mesh, OrthographicCamera, SRGBColorSpace, Scene, Vector3,
  WebGLRenderer, type MeshStandardMaterial, type Texture,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BAKE } from './units'

// Shared by the unit and level bakers: same loader, light, camera direction and file saving, so units and locations
// match when the scene puts them together.

// the packs' palettes are bright and toy-like; every texture is muted before baking: less saturation, darker,
// yellow-greens pulled towards a deep green (hues in degrees)
export const PALETTE = { sat: 0.55, light: 0.85, green: { from: [45, 110], to: 105, pull: 0.6 } }

const muted = new Map<string, Texture>()
const mute = (tex: Texture, key: string) => {
  if (!muted.has(key)) {
    const img = tex.image as CanvasImageSource & { width: number; height: number }
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const data = g.getImageData(0, 0, c.width, c.height)
    const px = data.data
    const hsl = { h: 0, s: 0, l: 0 }
    const col = new Color()
    for (let i = 0; i < px.length; i += 4) {
      col.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, SRGBColorSpace).getHSL(hsl, SRGBColorSpace)
      let h = hsl.h * 360
      const { from, to, pull } = PALETTE.green
      if (h >= from[0] && h <= from[1]) h += (to - h) * pull
      col.setHSL(h / 360, hsl.s * PALETTE.sat, hsl.l * PALETTE.light, SRGBColorSpace)
      const rgb = col.getRGB(new Color(), SRGBColorSpace)
      px[i] = rgb.r * 255
      px[i + 1] = rgb.g * 255
      px[i + 2] = rgb.b * 255
    }
    g.putImageData(data, 0, 0)
    const t = tex.clone()
    t.image = c
    t.needsUpdate = true
    muted.set(key, t)
  }
  return muted.get(key)!
}

const loader = new GLTFLoader()
export const load = async (url: string) => {
  const gltf = await loader.loadAsync(url)
  const folder = url.split('/').slice(-2, -1)[0]
  gltf.scene.traverse((o) => {
    if (!(o instanceof Mesh)) return
    for (const m of [o.material].flat() as MeshStandardMaterial[]) if (m.map) m.map = mute(m.map, `${folder}/${m.map.name || url}`)
  })
  return gltf
}

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
