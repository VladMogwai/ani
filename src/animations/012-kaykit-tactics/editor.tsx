import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Box3, BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  OrthographicCamera, PCFSoftShadowMap, Plane, PlaneGeometry, Raycaster, Vector2, Vector3, WebGLRenderer, type Scene,
} from 'three'
import { VIEW } from './bake-common'
import { bakeLevel, buildLevel, model } from './bake-level'
import { CATALOG, FLOOR_BRUSHES, PACKS, defaultScale, flameAt, packOf } from './catalog'
import { CELL, LEVELS, footprint, size, type Level, type Prop } from './level'

// Location editor (dev only, /012-kaykit-tactics?edit): the level is drawn live with the game's camera and light,
// edits go into levels/<id>.json ("Save"), "Bake" renders the pictures the game uses.

type Tool = 'floor' | 'prop' | 'decor' | 'select' | 'hero'
const LEVEL_DIR = 'src/animations/012-kaykit-tactics/levels'
const save = async (id: string, level: Level) => {
  const r = await fetch(`/__save?path=${encodeURIComponent(`${LEVEL_DIR}/${id}.json`)}`, { method: 'POST', body: JSON.stringify(level, null, 2) })
  if (!r.ok) throw new Error('save failed')
}
const clone = (l: Level): Level => structuredClone(l)
const blank = (cols: number, rows: number): Level => ({
  name: 'New location',
  floor: Array.from({ length: rows }, () => '.'.repeat(cols)),
  floorPieces: { '.': [] },
  ground: 'hex-grass',
  props: [],
  hero: [Math.floor(cols / 2), Math.floor(rows / 2)],
})
// footprint of a model at a scale and rotation, in cells, from its bounding box
const measure = async (name: string, scale: number, rot: number) => {
  const o = await model(name)
  o.scale.setScalar(scale)
  o.rotation.y = (rot * Math.PI) / 180
  const b = new Box3().setFromObject(o)
  const s = b.getSize(new Vector3())
  return { size: [Math.max(1, Math.round(s.x / CELL)), Math.max(1, Math.round(s.z / CELL))] as [number, number], height: s.y }
}
const propAt = (l: Level, x: number, z: number) =>
  l.props.findIndex((p) => x >= p.cell[0] && z >= p.cell[1] && x < p.cell[0] + footprint(p)[0] && z < p.cell[1] + footprint(p)[1])

export default function Editor() {
  const [id, setId] = useState(LEVELS.village ? 'village' : (Object.keys(LEVELS)[0] ?? 'village'))
  const [level, setLevel] = useState<Level>(() => clone(LEVELS[id] ?? blank(12, 10)))
  const [tool, setTool] = useState<Tool>('prop')
  const [brush, setBrush] = useState(',')
  const [item, setItem] = useState('medieval/building_home_A_red')
  const [rot, setRot] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [pack, setPack] = useState<string>('medieval')
  const [status, setStatus] = useState('')
  const [dirty, setDirty] = useState(false)
  const [showBorder, setShowBorder] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const view = useRef<{ scene?: Scene; overlay: Group; hover: Mesh; camera: OrthographicCamera; target: Vector3; cells: number }>(null)
  const pointer = useRef<{ cell: [number, number] | null; world: Vector3 | null; down: boolean }>({ cell: null, world: null, down: false })
  const levelRef = useRef(level)
  levelRef.current = level
  const history = useRef<Level[]>([]) // previous states for Ctrl+Z

  // record = false continues the previous step (the cells of one floor stroke undo together)
  const edit = (f: (l: Level) => void, record = true) => {
    setLevel((old) => {
      if (record) history.current = [...history.current.slice(-49), old]
      const l = clone(old)
      f(l)
      return l
    })
    setDirty(true)
  }
  const undo = () => {
    const prev = history.current.pop()
    if (prev) {
      setLevel(prev)
      setSelected(null)
      setDirty(true)
    }
  }

  // --- three.js view: renderer, camera, pointer picking, overlays (grid, blocked cells, hover)
  useEffect(() => {
    const host = hostRef.current!
    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(devicePixelRatio)
    renderer.setClearColor(0x1d1d22)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFSoftShadowMap
    host.appendChild(renderer.domElement)
    const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 600)
    const overlay = new Group()
    const hover = new Mesh(new PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xf2d38a, transparent: true, opacity: 0.45, depthWrite: false }))
    hover.renderOrder = 2
    const { cols, rows } = size(levelRef.current)
    view.current = { overlay, hover, camera, target: new Vector3((cols * CELL) / 2, 0, (rows * CELL) / 2), cells: 14 }

    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      renderer.setSize(w, h)
      const v = view.current!
      const half = (v.cells * CELL * 2 * Math.SQRT1_2) / 2 // world units across half the view (cell width on screen)
      camera.left = -half
      camera.right = half
      camera.top = (half * h) / w
      camera.bottom = (-half * h) / w
      camera.position.copy(v.target).addScaledVector(VIEW, 300)
      camera.lookAt(v.target)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    const ray = new Raycaster()
    const ground = new Plane(new Vector3(0, 1, 0), 0)
    const pick = (e: PointerEvent | MouseEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      return ray.ray.intersectPlane(ground, new Vector3())
    }
    let panning: { x: number; y: number; target: Vector3 } | null = null
    const onMove = (e: PointerEvent) => {
      const v = view.current!
      if (panning) {
        const scale = (camera.right - camera.left) / renderer.domElement.clientWidth
        const right = new Vector3(1, 0, -1).normalize()
        const up = new Vector3(-1, 0, -1).normalize() // screen up projected on the ground, stretched by 1/sin30
        v.target.copy(panning.target).addScaledVector(right, -(e.clientX - panning.x) * scale).addScaledVector(up, ((e.clientY - panning.y) * scale) / 0.5)
        resize()
        return
      }
      track(e)
      if (pointer.current.down) window.dispatchEvent(new CustomEvent('editor-paint'))
    }
    // the cell and ground point under the pointer
    const track = (e: PointerEvent) => {
      const w = pick(e)
      pointer.current.world = w
      const l = levelRef.current
      const { cols, rows } = size(l)
      const cell = w ? ([Math.floor(w.x / CELL), Math.floor(w.z / CELL)] as [number, number]) : null
      pointer.current.cell = cell && cell[0] >= 0 && cell[1] >= 0 && cell[0] < cols && cell[1] < rows ? cell : null
      hover.visible = !!pointer.current.cell
      if (pointer.current.cell) hover.position.set(pointer.current.cell[0] * CELL + 1, 0.06, pointer.current.cell[1] * CELL + 1)
    }
    const onDown = (e: PointerEvent) => {
      if (e.button === 2 || e.button === 1 || e.shiftKey) {
        panning = { x: e.clientX, y: e.clientY, target: view.current!.target.clone() }
        return
      }
      track(e)
      pointer.current.down = true
      window.dispatchEvent(new CustomEvent('editor-click'))
    }
    const onUp = () => {
      panning = null
      pointer.current.down = false
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      view.current!.cells = Math.min(60, Math.max(4, view.current!.cells * Math.exp(e.deltaY * 0.001)))
      resize()
    }
    const el = renderer.domElement
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    addEventListener('pointerup', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', (e) => e.preventDefault())

    let raf = 0
    const loop = () => {
      const v = view.current!
      if (v.scene) renderer.render(v.scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      removeEventListener('pointerup', onUp)
      renderer.dispose()
      el.remove()
    }
  }, [])

  // rebuild the scene when the level changes (debounced: a border forest has hundreds of trees)
  useEffect(() => {
    let stop = false
    const t = setTimeout(async () => {
      const shown = showBorder ? level : { ...level, border: undefined }
      const built = await buildLevel(shown)
      if (stop) return
      built.key.shadow.mapSize.set(4096, 4096)
      const v = view.current!
      // overlays: grid over the map, blocked cells, selection, hero start
      const { cols, rows } = size(level)
      v.overlay.clear()
      const pts: number[] = []
      for (let x = 0; x <= cols; x++) pts.push(x * CELL, 0.05, 0, x * CELL, 0.05, rows * CELL)
      for (let z = 0; z <= rows; z++) pts.push(0, 0.05, z * CELL, cols * CELL, 0.05, z * CELL)
      const grid = new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pts, 3)), new LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }))
      v.overlay.add(grid)
      const cellMesh = (x: number, z: number, color: number, opacity: number) => {
        const m = new Mesh(new PlaneGeometry(CELL * 0.92, CELL * 0.92).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }))
        m.position.set(x * CELL + 1, 0.04, z * CELL + 1)
        v.overlay.add(m)
      }
      for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) if (level.floor[z][x] === ' ') cellMesh(x, z, 0x000000, 0.45)
      for (const [i, p] of level.props.entries()) {
        const [w, d] = footprint(p)
        for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) cellMesh(p.cell[0] + dx, p.cell[1] + dz, i === selected ? 0x4aa3ff : 0xff4a4a, i === selected ? 0.5 : 0.22)
      }
      cellMesh(level.hero[0], level.hero[1], 0x4aff7a, 0.6)
      built.scene.add(v.overlay, v.hover)
      v.scene = built.scene
    }, 120)
    return () => {
      stop = true
      clearTimeout(t)
    }
  }, [level, selected, showBorder])

  // --- tools
  useEffect(() => {
    const apply = async (click: boolean) => {
      const cell = pointer.current.cell
      const l = levelRef.current
      if (tool === 'floor' && cell) {
        if (click) history.current = [...history.current.slice(-49), l] // a stroke starts: one undo step for all of it
        if (l.floor[cell[1]][cell[0]] === brush) return
        const b = FLOOR_BRUSHES.find((f) => f.char === brush)!
        edit((n) => {
          n.floor[cell[1]] = n.floor[cell[1]].slice(0, cell[0]) + brush + n.floor[cell[1]].slice(cell[0] + 1)
          if (brush !== ' ' && !n.floorPieces[brush]) n.floorPieces[brush] = b.pieces
          if (b.tint) n.floorTint = { ...n.floorTint, [brush]: b.tint }
        }, false)
      }
      if (!click) return
      if (tool === 'prop' && cell) {
        const scale = defaultScale(item)
        const { size: s, height } = await measure(item, scale, rot)
        const flame = flameAt(item)
        // keep the footprint inside the map and off other props
        const { cols, rows } = size(l)
        const at: [number, number] = [Math.min(cell[0], cols - s[0]), Math.min(cell[1], rows - s[1])]
        for (let dz = 0; dz < s[1]; dz++)
          for (let dx = 0; dx < s[0]; dx++)
            if (propAt(l, at[0] + dx, at[1] + dz) >= 0) return setStatus('those cells are taken: move or delete what stands there')
        const prop: Prop = { cell: at, parts: [{ model: item, scale, rot }] }
        if (s[0] > 1 || s[1] > 1) prop.size = s
        if (flame) prop.light = [0, height * flame, 0]
        edit((n) => n.props.push(prop))
        setSelected(levelRef.current.props.length)
      }
      if (tool === 'decor' && pointer.current.world) {
        const w = pointer.current.world
        edit((n) => (n.scenery = [...(n.scenery ?? []), { at: [+w.x.toFixed(2), +w.z.toFixed(2)], parts: [{ model: item, scale: defaultScale(item), rot }] }]))
      }
      if (tool === 'select' && cell) setSelected(((i) => (i < 0 ? null : i))(propAt(l, cell[0], cell[1])))
      if (tool === 'hero' && cell) edit((n) => (n.hero = cell))
    }
    const onClick = () => apply(true)
    const onPaint = () => apply(false)
    addEventListener('editor-click', onClick)
    addEventListener('editor-paint', onPaint)
    return () => {
      removeEventListener('editor-click', onClick)
      removeEventListener('editor-paint', onPaint)
    }
  }, [tool, brush, item, rot])

  // keys: R rotates (the next prop, or the selected one), arrows move the selection, Delete removes it, Ctrl+S saves
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        undo()
        return
      }
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        doSave()
        return
      }
      const step = e.shiftKey ? 45 : 90
      if (e.key === 'r' || e.key === 'R') {
        if (selected !== null) updateSelected((p) => (p.parts[0].rot = ((p.parts[0].rot ?? 0) + step) % 360), true)
        else setRot((r) => (r + step) % 360)
      }
      if (selected === null) return
      const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (moves[e.key]) {
        e.preventDefault()
        updateSelected((p) => (p.cell = [p.cell[0] + moves[e.key][0], p.cell[1] + moves[e.key][1]]))
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        edit((n) => n.props.splice(selected, 1))
        setSelected(null)
      }
      if (e.key === 'Escape') setSelected(null)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const updateSelected = async (f: (p: Prop) => void, remeasure = false) => {
    if (selected === null) return
    const p = structuredClone(level.props[selected])
    f(p)
    if (remeasure) {
      const { size: s } = await measure(p.parts[0].model, p.parts[0].scale ?? 1, p.parts[0].rot ?? 0)
      if (s[0] > 1 || s[1] > 1) p.size = s
      else delete p.size
    }
    edit((n) => (n.props[selected] = p))
  }

  const doSave = async () => {
    try {
      await save(id, levelRef.current)
      setDirty(false)
      setStatus(`saved levels/${id}.json`)
    } catch (e) {
      setStatus(`error: ${(e as Error).message}`)
    }
  }
  const doBake = async () => {
    setStatus('baking…')
    try {
      await save(id, levelRef.current)
      setDirty(false)
      await bakeLevel(id, levelRef.current, (s) => setStatus(s), () => {})
      setStatus(`baked: open /012-kaykit-tactics?level=${id}`)
    } catch (e) {
      setStatus(`error: ${(e as Error).message}`)
    }
  }
  const open = (next: string) => {
    if (dirty && !confirm('Unsaved changes will be lost. Open anyway?')) return
    setId(next)
    setLevel(clone(LEVELS[next]))
    setSelected(null)
    setDirty(false)
  }
  const create = () => {
    const name = prompt('Id of the new location (latin letters, e.g. forest-camp)')?.trim()
    if (!name || !/^[a-z0-9-]+$/.test(name)) return
    setId(name)
    setLevel(blank(16, 14))
    setSelected(null)
    setDirty(true)
  }
  const resize = (cols: number, rows: number) =>
    edit((n) => {
      n.floor = Array.from({ length: rows }, (_, z) => (n.floor[z] ?? '').padEnd(cols, '.').slice(0, cols))
      n.props = n.props.filter((p) => p.cell[0] < cols && p.cell[1] < rows)
      n.hero = [Math.min(n.hero[0], cols - 1), Math.min(n.hero[1], rows - 1)]
    })

  const list = useMemo(
    () => CATALOG.filter((m) => packOf(m) === pack && m.toLowerCase().includes(search.toLowerCase())),
    [pack, search],
  )
  const sel = selected !== null ? level.props[selected] : null
  const { cols, rows } = size(level)

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', background: '#16161a', color: '#ddd', font: '13px/1.4 system-ui' }}>
      <aside style={{ width: 300, padding: '44px 12px 12px',  overflowY: 'auto', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>012 location editor</b>
        <div style={row}>
          <select value={id} onChange={(e) => open(e.target.value)} style={{ flex: 1 }}>
            {[...new Set([...Object.keys(LEVELS), id])].map((l) => <option key={l}>{l}</option>)}
          </select>
          <button onClick={create}>New</button>
        </div>
        <label style={row}>Name <input value={level.name} onChange={(e) => edit((n) => (n.name = e.target.value))} style={{ flex: 1 }} /></label>
        <div style={row}>
          Size
          <input type="number" min={4} max={40} value={cols} onChange={(e) => resize(+e.target.value, rows)} style={{ width: 52 }} />×
          <input type="number" min={4} max={40} value={rows} onChange={(e) => resize(cols, +e.target.value)} style={{ width: 52 }} />
        </div>
        <label style={row}>
          <input type="checkbox" checked={level.ground === 'hex-grass'} onChange={(e) => edit((n) => (e.target.checked ? (n.ground = 'hex-grass') : delete n.ground))} /> grass ground
        </label>
        <label style={row}>
          <input type="checkbox" checked={showBorder} onChange={(e) => setShowBorder(e.target.checked)} disabled={!level.border} /> show the border forest (slow)
        </label>

        <div style={row}>
          {(['prop', 'decor', 'floor', 'select', 'hero'] as Tool[]).map((t) => (
            <button key={t} onClick={() => setTool(t)} style={{ ...btn, background: tool === t ? '#4a6fd6' : '#2a2a30' }}>{t}</button>
          ))}
        </div>
        <small style={{ opacity: 0.7 }}>
          {tool === 'prop' && 'Click a cell to place (blocks walking). R / Shift+R rotates.'}
          {tool === 'decor' && 'Click anywhere: decoration that does not block walking.'}
          {tool === 'floor' && 'Click or drag over cells to paint the floor.'}
          {tool === 'select' && 'Click a prop. Arrows move, R rotates, Delete removes.'}
          {tool === 'hero' && 'Click the hero start cell.'}
          {' '}Wheel zooms, right-drag or Shift-drag pans, Ctrl/Cmd+Z undoes, Ctrl/Cmd+S saves.
        </small>

        {tool === 'floor' && FLOOR_BRUSHES.map((b) => (
          <button key={b.char} onClick={() => setBrush(b.char)} style={{ ...btn, textAlign: 'left', background: brush === b.char ? '#4a6fd6' : '#2a2a30' }}>{b.label}</button>
        ))}

        {(tool === 'prop' || tool === 'decor') && (
          <>
            <div style={row}>
              {PACKS.map((p) => <button key={p} onClick={() => setPack(p)} style={{ ...btn, background: pack === p ? '#4a6fd6' : '#2a2a30' }}>{p}</button>)}
            </div>
            <input placeholder="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div>rotation {rot}° · scale {defaultScale(item)}</div>
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {list.map((m) => (
                <button key={m} onClick={() => setItem(m)} style={{ ...btn, textAlign: 'left', background: item === m ? '#4a6fd6' : 'transparent' }}>{m.split('/')[1]}</button>
              ))}
            </div>
          </>
        )}

        {sel && (
          <div style={{ border: '1px solid #444', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b>{sel.parts[0].model}</b>
            <div>cell {sel.cell.join(', ')} · size {footprint(sel).join('×')}</div>
            <label style={row}>scale <input type="number" step={0.1} value={sel.parts[0].scale ?? 1} onChange={(e) => updateSelected((p) => (p.parts[0].scale = +e.target.value), true)} style={{ width: 70 }} /></label>
            <label style={row}>rotation <input type="number" step={15} value={sel.parts[0].rot ?? 0} onChange={(e) => updateSelected((p) => (p.parts[0].rot = +e.target.value), true)} style={{ width: 70 }} /></label>
            <label style={row}>
              <input type="checkbox" checked={!!sel.light} onChange={(e) => updateSelected((p) => (e.target.checked ? (p.light = [0, 2, 0]) : delete p.light))} /> glows at night
            </label>
            <button onClick={() => { edit((n) => n.props.splice(selected!, 1)); setSelected(null) }} style={btn}>Delete</button>
          </div>
        )}

        <div style={{ ...row, marginTop: 'auto' }}>
          <button onClick={doSave} style={btn}>Save{dirty ? ' *' : ''}</button>
          <button onClick={doBake} style={btn}>Save + Bake</button>
          <a href={`?level=${id}`} style={{ color: '#9cf' }}>play</a>
        </div>
        <small>{status}</small>
      </aside>
      <div ref={hostRef} style={{ flex: 1, position: 'relative' }} />
    </div>
  )
}

const row: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }
const btn: CSSProperties = { padding: '4px 8px', border: '1px solid #444', background: '#2a2a30', color: '#ddd', borderRadius: 4, cursor: 'pointer' }
