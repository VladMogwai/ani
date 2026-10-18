import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three'
import { random } from './level'

// Small hand-made pixel textures drawn on a canvas, sampled without smoothing

const make = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D, rnd: () => number) => void, seed: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!, random(seed))
  const tex = new CanvasTexture(canvas)
  tex.magFilter = tex.minFilter = NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = SRGBColorSpace
  return tex
}

const speckle = (ctx: CanvasRenderingContext2D, rnd: () => number, w: number, h: number, colors: string[], count: number) => {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)]
    ctx.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1 + Math.floor(rnd() * 2), 1)
  }
}

const crack = (ctx: CanvasRenderingContext2D, rnd: () => number, w: number, h: number, color: string) => {
  let x = Math.floor(rnd() * w)
  let y = Math.floor(rnd() * h)
  ctx.fillStyle = color
  for (let i = 0; i < 6 + rnd() * 8; i++) {
    ctx.fillRect(x, y, 1, 1)
    x += Math.round(rnd() * 2 - 1)
    y += rnd() < 0.6 ? 1 : 0
  }
}

// top of a stone slab: bevelled edges, speckles, a crack
export const stoneTop = () =>
  make(
    16,
    16,
    (ctx, rnd) => {
      ctx.fillStyle = '#6d7377'
      ctx.fillRect(0, 0, 16, 16)
      speckle(ctx, rnd, 16, 16, ['#62686c', '#767c80', '#5d6367'], 40)
      crack(ctx, rnd, 16, 16, '#474c50')
      ctx.fillStyle = '#80868a'
      ctx.fillRect(0, 0, 16, 1)
      ctx.fillRect(0, 0, 1, 16)
      ctx.fillStyle = '#4a4f52'
      ctx.fillRect(0, 15, 16, 1)
      ctx.fillRect(15, 0, 1, 16)
    },
    7,
  )

// side of a stone block: darker, horizontal strata, a crack
export const stoneSide = () =>
  make(
    16,
    8,
    (ctx, rnd) => {
      ctx.fillStyle = '#555b5f'
      ctx.fillRect(0, 0, 16, 8)
      speckle(ctx, rnd, 16, 8, ['#4b5054', '#5e6468', '#474c50'], 20)
      ctx.fillStyle = '#43484b'
      ctx.fillRect(0, 7, 16, 1)
      ctx.fillRect(Math.floor(rnd() * 12), 3, 4, 1)
      crack(ctx, rnd, 16, 8, '#3c4044')
      ctx.fillStyle = '#62686c'
      ctx.fillRect(0, 0, 16, 1)
    },
    11,
  )

// dry grass tuft with transparent background
export const grass = () =>
  make(
    16,
    16,
    (ctx, rnd) => {
      for (let i = 0; i < 9; i++) {
        let x = 3 + rnd() * 10
        const tall = 5 + rnd() * 9
        ctx.fillStyle = ['#b39b55', '#9a8344', '#c9b36a', '#7d6a37'][i % 4]
        for (let y = 15; y > 15 - tall; y--) {
          ctx.fillRect(Math.round(x), y, 1, 1)
          x += (rnd() - 0.5) * 0.8
        }
      }
    },
    3,
  )

// mossy stone for the block in the water
export const moss = () =>
  make(
    16,
    16,
    (ctx, rnd) => {
      ctx.fillStyle = '#4c5a3c'
      ctx.fillRect(0, 0, 16, 16)
      speckle(ctx, rnd, 16, 16, ['#5d6e46', '#3e4a31', '#6b7c50', '#555b5f'], 60)
      ctx.fillStyle = '#3a4430'
      ctx.fillRect(0, 15, 16, 1)
      ctx.fillRect(15, 0, 1, 16)
    },
    5,
  )
