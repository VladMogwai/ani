import react from '@vitejs/plugin-react'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// Dev-only endpoint for in-browser tools (e.g. the sprite baker of 012): POST /__save?path=src/animations/...
// writes the request body to that file. Only paths inside src/animations/ are accepted.
const saveFiles = (): Plugin => ({
  name: 'save-files',
  apply: 'serve',
  configureServer(server) {
    const root = resolve(server.config.root, 'src/animations') + sep
    server.middlewares.use('/__save', (req, res) => {
      const path = resolve(server.config.root, new URL(req.url!, 'http://x').searchParams.get('path') ?? '')
      if (req.method !== 'POST' || !path.startsWith(root)) {
        res.statusCode = 400
        return res.end('bad request')
      }
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, Buffer.concat(chunks))
        res.end('ok')
      })
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), saveFiles()],
})
