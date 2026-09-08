/* ══════════════════════════════════════════════════ The Complete Shelf ══
 *
 * A lamp-lit 3D library standing in the site's own dark polar room: a
 * continuous walnut shelf of clothbound hardcovers that you browse by
 * dragging, and inspect by pulling a single volume forward into an orbit /
 * pan / zoom view.
 *
 * The spines are NOT decorative filler — every book is a real record from
 * the live `publicArchive` collection, so the shelf grows as NCPOR
 * publishes. Category volumes pad the run out to a full 19-piece shelf so
 * it reads as a library rather than a short row.
 *
 * Everything is procedural: cloth, foil, page edges and walnut are all
 * drawn to canvases. No model files, no texture files.
 *
 * ── on the construction ──
 * A book is not a box. Each volume is built the way a case-bound book
 * actually is: a text block of leaves, two boards that overhang it on three
 * edges (the "squares"), and a rounded spine shell arced over the back.
 * An earlier pass used a single BoxGeometry per book with the spine merely
 * painted on, and the result read as a row of painted dominoes — flat, and
 * lit wrong, because a fake gradient cannot pick up a moving key light the
 * way real curvature does.
 *
 * ── on cost ──
 * Three things keep this affordable, and all three matter on a phone:
 *   1. The scene is not built until the section approaches the viewport.
 *   2. Frames are rendered on demand. When nothing is moving the loop stops
 *      completely rather than burning 60fps behind a static picture.
 *   3. Cover artwork is generated the first time a volume is opened, not
 *      for all nineteen up front.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { useRepository, STATION_LABELS } from '../../api/repository'
import type { RepositoryRecord } from '../../repository/contract'
import './book-shelf.css'

/* ─────────────────────────────────────────────────────────── book specs ── */

interface BookSpec {
  id: string
  title: string
  kind: string
  sub: string
  cloth: string
  foil: string
  href: string
}

/** Muted clothbound palette, keyed by archive category. */
const CLOTH: Record<string, { cloth: string; foil: string }> = {
  expedition:  { cloth: '#7c3d33', foil: '#e8d2a4' },
  dataset:     { cloth: '#2f4a63', foil: '#dcd0ac' },
  publication: { cloth: '#3a5442', foil: '#e0d4ac' },
  media:       { cloth: '#6d4c34', foil: '#efdeb6' },
  institution: { cloth: '#5c3245', foil: '#e6d1b0' },
  default:     { cloth: '#4a4336', foil: '#e2d4ae' },
}

const CATEGORY_VOLUMES: BookSpec[] = [
  { id: 'v-expedition',  title: 'Expedition Reports',   kind: 'Collected Volume', sub: 'Since 1981',     ...CLOTH.expedition,  href: '/archive' },
  { id: 'v-dataset',     title: 'Scientific Datasets',  kind: 'Collected Volume', sub: 'Open data',      ...CLOTH.dataset,     href: '/archive' },
  { id: 'v-publication', title: 'Research Papers',      kind: 'Collected Volume', sub: 'Peer reviewed',  ...CLOTH.publication, href: '/archive' },
  { id: 'v-media',       title: 'Photographs & Video',  kind: 'Collected Volume', sub: 'Field media',    ...CLOTH.media,       href: '/archive' },
  { id: 'v-institution', title: 'Institutional Record', kind: 'Collected Volume', sub: 'NCPOR / MoES',   ...CLOTH.institution, href: '/archive' },
  { id: 'v-atlas',       title: 'Station Atlas',        kind: 'Reference',        sub: 'Maitri / Bharati', ...CLOTH.default,   href: '/archive' },
]

const SHELF_SIZE = 19

function toSpec(r: RepositoryRecord): BookSpec {
  const c = CLOTH[r.cat] ?? CLOTH.default
  return {
    id: r.id,
    title: r.title.replace(/\n/g, ' '),
    kind: r.kind,
    sub: `${STATION_LABELS[r.station] ?? 'NCPOR'} · ${r.year}`,
    cloth: c.cloth,
    foil: c.foil,
    href: '/archive',
  }
}

/** Stable 0..1 from a string, so a book's proportions never change between
 *  renders (a re-shuffling shelf would look broken, not organic). */
function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

/* ────────────────────────────────────────────────── canvas texture work ── */

/** Textures are the memory cost here, not triangles. Phones get smaller
 *  ones, a lower pixel ratio and a smaller shadow map. */
const MOBILE = typeof window !== 'undefined' && window.innerWidth < 768
const TX = MOBILE ? 0.6 : 1
const px = (n: number) => Math.max(8, Math.round(n * TX))

function canvas2d(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, ctx: c.getContext('2d')! }
}

/**
 * Every surface is drawn twice from one routine: once for colour, once as a
 * roughness/metalness map (MeshStandardMaterial reads roughness from green
 * and metalness from blue). That second pass is what makes the foil read as
 * struck metal that catches the key light rather than yellow paint.
 */
type Mode = 'color' | 'orm'
const CLOTH_ORM = 'rgb(0,242,0)'   // rough, non-metal
// Not fully metallic. A metalness of 1 kills diffuse entirely, so with only
// a handful of lights and no environment map to reflect, the foil went dark
// against dark cloth and the titles stopped reading. Around 0.6 keeps the
// specular glint while letting the gold keep its own body.
const FOIL_ORM = 'rgb(0,48,152)'
const BLIND_ORM = 'rgb(0,214,0)'

const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif'

/**
 * Fine woven-cloth tooth, applied as a tiled overlay.
 *
 * This was a per-pixel getImageData/putImageData pass run once per texture —
 * roughly five million pixel iterations across the shelf, all of it blocking
 * the main thread. One tile is generated instead and composited over each
 * surface: visually equivalent, about two orders of magnitude cheaper.
 */
let weaveTile: HTMLCanvasElement | null = null
function getWeaveTile(): HTMLCanvasElement {
  if (weaveTile) return weaveTile
  const S = 128
  const { c, ctx } = canvas2d(S, S)
  const img = ctx.createImageData(S, S)
  const d = img.data
  let s = 20250904
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      // A warp/weft grid plus grain: the grid is what reads as woven book
      // cloth; pure noise alone reads as film grain.
      const grid = (x % 3 === 0 ? 14 : 0) + (y % 3 === 0 ? 14 : 0)
      const v = 128 + (rnd() - 0.5) * 40 + grid - 14
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v))
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  weaveTile = c
  return c
}

function weave(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const pat = ctx.createPattern(getWeaveTile(), 'repeat')
  if (!pat) return
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 0.6
  ctx.fillStyle = pat
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/** Abstract foil motifs — one per book, cycled by index. */
function foilMotif(
  ctx: CanvasRenderingContext2D,
  variant: number,
  cx: number, cy: number, r: number,
  colour: string,
) {
  ctx.save()
  ctx.strokeStyle = colour
  ctx.fillStyle = colour
  ctx.lineWidth = Math.max(2.5, r * 0.055)
  ctx.lineCap = 'round'

  switch (variant % 7) {
    case 0: // concentric arcs — a horizon
      for (let i = 0; i < 5; i++) {
        ctx.beginPath()
        ctx.arc(cx, cy + r * 0.5, r * (0.26 + i * 0.19), Math.PI, Math.PI * 2)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(cx - r * 1.1, cy + r * 0.5)
      ctx.lineTo(cx + r * 1.1, cy + r * 0.5)
      ctx.stroke()
      break
    case 1: // stacked rules, a stratigraphic column
      for (let i = 0; i < 8; i++) {
        const wdt = r * (1.5 - Math.abs(i - 3.5) * 0.22)
        ctx.lineWidth = i % 2 ? r * 0.04 : r * 0.09
        ctx.beginPath()
        ctx.moveTo(cx - wdt / 2, cy - r * 0.78 + i * r * 0.22)
        ctx.lineTo(cx + wdt / 2, cy - r * 0.78 + i * r * 0.22)
        ctx.stroke()
      }
      break
    case 2: // diamond lattice
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          if (Math.abs(i) + Math.abs(j) > 2) continue
          const x = cx + i * r * 0.45
          const y = cy + j * r * 0.45
          ctx.beginPath()
          ctx.moveTo(x, y - r * 0.2)
          ctx.lineTo(x + r * 0.2, y)
          ctx.lineTo(x, y + r * 0.2)
          ctx.lineTo(x - r * 0.2, y)
          ctx.closePath()
          ctx.stroke()
        }
      }
      break
    case 3: // radiating fan
      for (let i = 0; i < 13; i++) {
        const a = Math.PI * (1.12 + (i / 12) * 0.76)
        ctx.beginPath()
        ctx.moveTo(cx, cy + r * 0.7)
        ctx.lineTo(cx + Math.cos(a) * r * 1.2, cy + r * 0.7 + Math.sin(a) * r * 1.2)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(cx, cy + r * 0.7, r * 0.13, 0, Math.PI * 2)
      ctx.fill()
      break
    case 4: // nested rectangles
      for (let i = 0; i < 4; i++) {
        const s = r * (0.34 + i * 0.26)
        ctx.lineWidth = i === 1 ? r * 0.09 : r * 0.045
        ctx.strokeRect(cx - s, cy - s * 0.74, s * 2, s * 1.48)
      }
      break
    case 5: // ring with orbiting marks
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const l = i % 3 === 0 ? r * 0.24 : r * 0.13
        ctx.lineWidth = i % 3 === 0 ? r * 0.07 : r * 0.04
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78)
        ctx.lineTo(cx + Math.cos(a) * (r * 0.78 + l), cy + Math.sin(a) * (r * 0.78 + l))
        ctx.stroke()
      }
      break
    default: { // peaks — a horizon of ice
      ctx.beginPath()
      ctx.moveTo(cx - r * 1.15, cy + r * 0.55)
      const pk = [0.22, 0.68, 0.35, 0.9, 0.45, 0.7, 0.25]
      pk.forEach((p, i) => {
        const x0 = cx - r * 1.15 + (i / pk.length) * r * 2.3
        ctx.lineTo(x0 + r * 0.16, cy + r * 0.55 - p * r)
        ctx.lineTo(x0 + r * 0.33, cy + r * 0.55)
      })
      ctx.stroke()
      break
    }
  }
  ctx.restore()
}

/** Shrink a font until the string fits, so long record titles never clip. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, max: number, start: number, min: number) {
  let size = start
  while (size > min) {
    ctx.font = `${size}px ${SERIF}`
    if (ctx.measureText(text).width <= max) break
    size -= 2
  }
  ctx.font = `${size}px ${SERIF}`
  return size
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > max && line) { lines.push(line); line = w }
    else line = t
  }
  if (line) lines.push(line)
  return lines
}

function tex(c: HTMLCanvasElement, srgb: boolean): THREE.Texture {
  const t = new THREE.CanvasTexture(c)
  // Only the colour map is sRGB; an ORM map carries raw values and must not
  // be colour-converted or the roughness comes out wrong.
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = MOBILE ? 4 : 8
  return t
}

/**
 * The spine. Note there is no painted shading here — the shell it maps onto
 * is genuinely curved, so the roll of the back is real geometry that lights
 * itself.
 */
function drawSpine(spec: BookSpec, variant: number, mode: Mode, W: number, H: number) {
  const { c, ctx } = canvas2d(W, H)
  const foil = mode === 'color' ? spec.foil : FOIL_ORM

  ctx.fillStyle = mode === 'color' ? spec.cloth : CLOTH_ORM
  ctx.fillRect(0, 0, W, H)
  if (mode === 'color') weave(ctx, W, H)

  const headY = H * 0.115
  const tailY = H * 0.845
  const inset = W * 0.17

  // Double foil rules bounding the lettering panel, the way a bound spine is
  // tooled between its raised bands.
  ctx.strokeStyle = foil
  const rule = (y: number, lw: number) => {
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(inset, y)
    ctx.lineTo(W - inset, y)
    ctx.stroke()
  }
  rule(headY, Math.max(2, W * 0.022))
  rule(headY + H * 0.016, Math.max(1.5, W * 0.011))
  rule(tailY, Math.max(1.5, W * 0.011))
  rule(tailY + H * 0.016, Math.max(2, W * 0.022))

  ctx.save()
  ctx.translate(W / 2, H * 0.5)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = foil
  fitFont(ctx, spec.title, H * 0.6, W * 0.4, W * 0.14)
  ctx.fillText(spec.title, 0, 0)
  ctx.restore()

  // Devices in the head and tail panels, so neither sits empty.
  foilMotif(ctx, variant, W / 2, H * 0.925, W * 0.24, foil)
  foilMotif(ctx, variant + 3, W / 2, H * 0.072, W * 0.14, foil)

  return c
}

/**
 * A plain bound board: cloth with only the blind border pressed into it.
 * Every book gets this on both boards immediately, because a board with no
 * tooling reads as a flat coloured slab whenever the row angles one toward
 * the viewer. Full cover artwork replaces it on first open.
 */
function drawBoard(spec: BookSpec, mode: Mode, W: number, H: number) {
  const { c, ctx } = canvas2d(W, H)
  ctx.fillStyle = mode === 'color' ? spec.cloth : CLOTH_ORM
  ctx.fillRect(0, 0, W, H)
  if (mode === 'color') {
    weave(ctx, W, H)
    ctx.strokeStyle = 'rgba(0,0,0,0.38)'
    ctx.lineWidth = W * 0.011
    ctx.strokeRect(W * 0.075, H * 0.052, W * 0.85, H * 0.896)
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = W * 0.007
    ctx.strokeRect(W * 0.086, H * 0.06, W * 0.828, H * 0.88)
  } else {
    ctx.strokeStyle = BLIND_ORM
    ctx.lineWidth = W * 0.016
    ctx.strokeRect(W * 0.08, H * 0.056, W * 0.84, H * 0.888)
  }
  return c
}

/** The front board, drawn only when a volume is first pulled off the shelf. */
function drawCover(spec: BookSpec, variant: number, mode: Mode, W: number, H: number) {
  const { c, ctx } = canvas2d(W, H)
  const foil = mode === 'color' ? spec.foil : FOIL_ORM

  ctx.fillStyle = mode === 'color' ? spec.cloth : CLOTH_ORM
  ctx.fillRect(0, 0, W, H)
  if (mode === 'color') weave(ctx, W, H)

  // Blind stamping: pressed into the cloth, not printed on it — a dark score
  // with a light highlight just inside is what sells the impression.
  if (mode === 'color') {
    ctx.strokeStyle = 'rgba(0,0,0,0.38)'
    ctx.lineWidth = W * 0.008
    ctx.strokeRect(W * 0.075, H * 0.052, W * 0.85, H * 0.896)
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = W * 0.005
    ctx.strokeRect(W * 0.083, H * 0.058, W * 0.834, H * 0.884)
  } else {
    ctx.strokeStyle = BLIND_ORM
    ctx.lineWidth = W * 0.012
    ctx.strokeRect(W * 0.079, H * 0.055, W * 0.842, H * 0.89)
  }

  foilMotif(ctx, variant, W / 2, H * 0.33, W * 0.21, foil)

  ctx.fillStyle = foil
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  fitFont(ctx, spec.title, W * 0.74, W * 0.085, W * 0.045)
  const size = parseInt(ctx.font, 10)
  const lines = wrap(ctx, spec.title, W * 0.74)
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, H * 0.66 + i * size * 1.3))

  ctx.strokeStyle = foil
  ctx.lineWidth = W * 0.005
  ctx.beginPath()
  ctx.moveTo(W * 0.36, H * 0.845)
  ctx.lineTo(W * 0.64, H * 0.845)
  ctx.stroke()
  ctx.font = `${Math.round(W * 0.038)}px ${SERIF}`
  ctx.fillText(spec.sub.toUpperCase(), W / 2, H * 0.9)

  return c
}

/** Cream page block: fine leaf striations, warmer toward the gutter. */
function pagesTexture(): THREE.Texture {
  const W = 256, H = 128
  const { c, ctx } = canvas2d(W, H)
  const g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0, '#e6dcc4')
  g.addColorStop(0.5, '#f3ecdb')
  g.addColorStop(1, '#e6dcc4')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // Lines run along the leaf edges, i.e. across the stacking direction.
  for (let x = 0; x < W; x += 1) {
    if (Math.random() > 0.55) continue
    ctx.strokeStyle = `rgba(126,106,74,${0.06 + Math.random() * 0.2})`
    ctx.lineWidth = Math.random() < 0.2 ? 1.4 : 0.7
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, H)
    ctx.stroke()
  }
  return tex(c, true)
}

/** Walnut: warm brown with drifting grain lines. */
function walnutTexture(): THREE.Texture {
  const W = MOBILE ? 512 : 1024, H = MOBILE ? 128 : 256
  const { c, ctx } = canvas2d(W, H)
  const base = ctx.createLinearGradient(0, 0, 0, H)
  base.addColorStop(0, '#7a5537')
  base.addColorStop(0.5, '#8a6242')
  base.addColorStop(1, '#674530')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 60; i++) {
    const y0 = Math.random() * H
    const amp = 3 + Math.random() * 12
    const freq = 0.004 + Math.random() * 0.012
    ctx.strokeStyle = `rgba(${Math.random() > 0.5 ? '48,30,17' : '150,112,74'},${0.08 + Math.random() * 0.2})`
    ctx.lineWidth = 0.6 + Math.random() * 2.4
    ctx.beginPath()
    for (let x = 0; x <= W; x += 4) {
      const y = y0 + Math.sin(x * freq + i) * amp
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  const t = tex(c, true)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/* ═══════════════════════════════════════════════════════════ component ══ */

interface SceneHandle {
  dispose: () => void
  setVisible: (v: boolean) => void
  goTo: (i: number) => void
  select: (i: number | null) => void
}

export interface BookShelfHandle {
  goTo: (i: number) => void
}

export interface BookShelfProps {
  /** Records to shelve. Omit to have the shelf fetch the live repository
   *  itself (what Home does); pass Archive's own `records` so the shelf and
   *  the page it lives on are always looking at the identical list — no
   *  second query that could return a different order or a different
   *  live/static fallback state. */
  records?: RepositoryRecord[]
  /** Called instead of `navigate(open.href)` when a REAL record's "Open in
   *  Archive" is clicked. Category padding volumes (ids `pad-*`/`v-*`) have
   *  no record to open, so they always fall back to navigating `href`. */
  onOpenRecord?: (id: string) => void
  /** 'section' (default) renders the shelf as a standalone homepage section
   *  with its own heading. 'embedded' renders only the stage, caption and
   *  markers, so a host page can wrap it in its own chrome without a
   *  duplicate heading — this is what Archive uses in place of its old
   *  carousel. */
  variant?: 'section' | 'embedded'
  /** Exposes `goTo` so a host page's own UI (Archive's category-jump menu)
   *  can drive the shelf without reaching into its internals. */
  apiRef?: Ref<BookShelfHandle>
  /** Fires whenever the shelf lands on a different volume — by arrow, marker,
   *  drag, or a host calling `goTo`. A host that keeps its own idea of the
   *  selected record (Archive does, and publishes it as data-active-record)
   *  needs this, or that idea silently drifts from what the shelf shows. */
  onIndexChange?: (index: number, id: string) => void
}

export default function BookShelf({ records: recordsProp, onOpenRecord, variant = 'section', apiRef, onIndexChange }: BookShelfProps) {
  const navigate = useNavigate()
  const { records: liveRecords } = useRepository()
  const records = recordsProp ?? liveRecords
  const mountRef = useRef<HTMLDivElement>(null)

  const specs = useMemo<BookSpec[]>(() => {
    const out = records.map(toSpec)
    let i = 0
    while (out.length < SHELF_SIZE) out.push({ ...CATEGORY_VOLUMES[i % CATEGORY_VOLUMES.length], id: `pad-${i++}` })
    return out.slice(0, SHELF_SIZE)
  }, [records])

  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const api = useRef<SceneHandle | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || specs.length === 0) return

    /* ─────────────────────────────────────────────── the scene proper ── */
    const build = (): SceneHandle => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      const renderer = new THREE.WebGLRenderer({
        antialias: !MOBILE,
        alpha: true,
        preserveDrawingBuffer: true,
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2))
      renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.18
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
      mount.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(30, (mount.clientWidth || 1) / (mount.clientHeight || 1), 0.1, 100)
      camera.position.set(0, 1.45, 7.5)
      camera.lookAt(0, 1.32, 0)

      // Lit as a shelf in a dark room, not a shelf in a bright one: a warm
      // key pooling on the books, a cold polar fill to tie it to the site's
      // palette, and little ambient so the run falls away into the page.
      scene.add(new THREE.HemisphereLight(0xffe9c8, 0x1a2432, 0.78))
      const key = new THREE.DirectionalLight(0xfff2dc, 2.35)
      key.position.set(4.5, 7.5, 6)
      key.castShadow = true
      key.shadow.mapSize.set(MOBILE ? 512 : 1024, MOBILE ? 512 : 1024)
      key.shadow.camera.near = 1
      key.shadow.camera.far = 30
      key.shadow.bias = -0.0015
      const sc = key.shadow.camera as THREE.OrthographicCamera
      sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9
      scene.add(key)
      const fill = new THREE.DirectionalLight(0x8fc4e8, 0.55)
      fill.position.set(-6, 2.5, 4)
      scene.add(fill)
      // A low raking light along the shelf: this is what catches the foil and
      // the curve of each spine, and without it the run goes flat.
      const rake = new THREE.DirectionalLight(0xffe0b0, 0.72)
      rake.position.set(-2, 0.6, 8)
      scene.add(rake)

      // No backdrop plane. The canvas is alpha, so the site's own dark ground
      // shows through and the shelf sits IN the page instead of inside a
      // window cut into it. The warm pool of light is painted in CSS behind
      // the canvas; see book-shelf.css.

      const shelf = new THREE.Group()
      scene.add(shelf)

      const pages = pagesTexture()
      const walnut = walnutTexture()
      const pagesMat = new THREE.MeshStandardMaterial({ map: pages, roughness: 0.92 })

      interface BookObj {
        obj: THREE.Group
        slotX: number
        slotZ: number
        height: number
        hover: number
        /** The book's resting lean, stored rather than read back off the
         *  object. Deriving the target from `obj.rotation.z` meant that after
         *  a deselect — when the group carries leftover orbit rotation on X
         *  and Y — the target moved every frame toward wherever the object
         *  already was, so it chased its own tail instead of easing home. */
        lean: number
        spec: BookSpec
        coverMat: THREE.MeshStandardMaterial
        variant: number
        covered: boolean
      }
      const books: BookObj[] = []
      const junk: { dispose(): void }[] = [pages, walnut, pagesMat]

      const GAP = 0.03
      const FRONT_EDGE = 0.92
      let cursor = 0

      specs.forEach((spec, i) => {
        const h1 = hash01(spec.id, 11), h2 = hash01(spec.id, 23), h3 = hash01(spec.id, 31)
        const height = 2.05 + h1 * 0.58
        const thick = 0.40 + h2 * 0.42
        const depth = 1.50 + h3 * 0.32

        const boardT = Math.min(0.038, thick * 0.13)
        const square = height * 0.013
        // A binder's round back is a shallow arc — about an eighth of the
        // thickness. At a third the books came out as tubes and the boards,
        // the squares and the whole case construction vanished behind it.
        const bulge = thick * 0.14
        const r = ((thick / 2) ** 2 + bulge ** 2) / (2 * bulge)
        const alpha = Math.asin(Math.min(1, (thick / 2) / r))

        const g = new THREE.Group()

        const bw = px(208), bh = px(300)
        const boardTex = tex(drawBoard(spec, 'color', bw, bh), true)
        // One material per board rather than a six-entry array. The array
        // cost six draw calls per board — 266 across the shelf before the
        // shadow pass. The board's other five faces are either hidden or a
        // sub-pixel edge, so they can share the same map for free.
        const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.94 })
        const coverMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.94 })

        const sw = px(232), sh = px(880)
        const spineTex = tex(drawSpine(spec, i, 'color', sw, sh), true)
        const spineOrm = tex(drawSpine(spec, i, 'orm', Math.round(sw / 2), Math.round(sh / 2)), false)
        const spineMat = new THREE.MeshStandardMaterial({
          map: spineTex, roughnessMap: spineOrm, metalnessMap: spineOrm,
          roughness: 1, metalness: 1,
        })

        // 1. text block — the leaves, inset behind the squares. It never
        //    casts: it is sealed inside the boards and the spine.
        const pgGeo = new THREE.BoxGeometry(thick - 2 * boardT, height - 2 * square, depth - 2 * square)
        const pg = new THREE.Mesh(pgGeo, pagesMat)
        pg.position.z = -square * 0.5
        g.add(pg)

        // 2. boards. The front board (+X) is the face turned to camera when a
        //    volume is inspected, so it carries the cover artwork.
        const bdGeo = new THREE.BoxGeometry(boardT, height, depth)
        const front = new THREE.Mesh(bdGeo, coverMat)
        front.position.x = thick / 2 - boardT / 2
        const back = new THREE.Mesh(bdGeo, boardMat)
        back.position.x = -(thick / 2 - boardT / 2)
        for (const b of [front, back]) { b.castShadow = true; b.receiveShadow = true; g.add(b) }

        // 3. the rounded back: an arc of radius r whose chord spans the board
        //    edges and whose apex stands `bulge` proud of them.
        const spGeo = new THREE.CylinderGeometry(r, r, height, MOBILE ? 16 : 28, 1, true, -alpha, 2 * alpha)
        const sp = new THREE.Mesh(spGeo, spineMat)
        sp.position.z = depth / 2 + bulge - r
        sp.castShadow = true
        sp.receiveShadow = true
        g.add(sp)

        const slotX = cursor + thick / 2
        const slotZ = FRONT_EDGE - depth / 2 - bulge
        g.position.set(slotX, height / 2, slotZ)
        // A degree or two of lean stops the row reading as a machined block.
        const lean = (h2 - 0.5) * 0.026
        g.rotation.z = lean
        g.traverse((o) => { o.userData.i = i })
        shelf.add(g)

        books.push({ obj: g, slotX, slotZ, height, hover: 0, lean, spec, coverMat, variant: i, covered: false })
        junk.push(pgGeo, bdGeo, spGeo, spineTex, spineOrm, spineMat, coverMat, boardTex, boardMat)
        cursor += thick + GAP
      })

      /** Cover art is ~2 MB a book; generating all nineteen up front cost
       *  more memory than the rest of the scene combined, for artwork you
       *  only ever see one of at a time. */
      const ensureCover = (i: number) => {
        const b = books[i]
        if (b.covered) return
        b.covered = true
        const cw = px(452), ch = px(660)
        const ct = tex(drawCover(b.spec, b.variant, 'color', cw, ch), true)
        const co = tex(drawCover(b.spec, b.variant, 'orm', Math.round(cw / 2), Math.round(ch / 2)), false)
        b.coverMat.map = ct
        b.coverMat.roughnessMap = co
        b.coverMat.metalnessMap = co
        b.coverMat.roughness = 1
        b.coverMat.metalness = 1
        b.coverMat.needsUpdate = true
        junk.push(ct, co)
      }

      const totalWidth = cursor - GAP
      const shelfLen = totalWidth + 16

      const woodMat = new THREE.MeshStandardMaterial({ map: walnut, roughness: 0.66 })
      junk.push(woodMat)
      const mkPlank = (w: number, h: number, d: number, x: number, y: number, z: number) => {
        const gm = new THREE.BoxGeometry(w, h, d)
        const m = new THREE.Mesh(gm, woodMat)
        m.position.set(x, y, z)
        m.receiveShadow = true
        shelf.add(m)
        junk.push(gm)
      }
      const mid = totalWidth / 2
      mkPlank(shelfLen, 0.22, 2.2, mid, -0.11, -0.05)
      mkPlank(shelfLen, 0.5, 0.1, mid, 0.14, -1.1)
      walnut.repeat.set(shelfLen / 5, 1)

      /* ── browse state ─────────────────────────────────────────────── */
      const centers = books.map((b) => b.slotX)

      const viewHalfW = () => {
        const dist = camera.position.z - FRONT_EDGE
        const vh = 2 * Math.tan((camera.fov * Math.PI) / 180 / 2) * dist
        return (vh * camera.aspect) / 2
      }
      const clampScroll = (v: number) => {
        const half = viewHalfW()
        if (totalWidth <= half * 2) return totalWidth / 2
        return Math.max(half - 0.25, Math.min(totalWidth - half + 0.25, v))
      }

      let scrollTarget = clampScroll(centers[0])
      let scrollNow = scrollTarget
      let selectedIdx: number | null = null
      let hoverIdx: number | null = null
      let currentIdx = 0

      const orbit = { x: 0, y: 0 }
      const pan = { x: 0, y: 0 }
      let zoom = 1
      const INSPECT = new THREE.Vector3(0, 1.3, 2.1)
      const inspectX = () => (camera.aspect > 1.25 ? -0.62 : 0)

      /* ── the render loop, on demand ───────────────────────────────────
       * Frames are only produced while something is actually moving. A 3D
       * scene that repaints 60 times a second behind a picture that has not
       * changed is the single most expensive thing a page like this can do
       * to a phone battery, and it buys nothing.
       */
      let raf = 0
      let running = false
      let dirty = true
      let visible = true

      const stopLoop = () => {
        running = false
        if (raf) cancelAnimationFrame(raf)
        raf = 0
      }
      const startLoop = () => {
        if (running || !visible) return
        running = true
        raf = requestAnimationFrame(tick)
      }
      const invalidate = () => { dirty = true; startLoop() }

      const nearestIndex = (x: number) => {
        let best = 0, bd = Infinity
        centers.forEach((c, i) => { const d = Math.abs(c - x); if (d < bd) { bd = d; best = i } })
        return best
      }

      const goTo = (i: number) => {
        const c = Math.max(0, Math.min(books.length - 1, i))
        currentIdx = c
        scrollTarget = clampScroll(centers[c])
        setIndex(c)
        invalidate()
      }

      const select = (i: number | null) => {
        if (i === selectedIdx) return
        if (selectedIdx !== null) shelf.attach(books[selectedIdx].obj)
        selectedIdx = i
        orbit.x = 0; orbit.y = 0; pan.x = 0; pan.y = 0; zoom = 1
        if (i !== null) {
          ensureCover(i)
          currentIdx = i
          scrollTarget = clampScroll(centers[i])
          setIndex(i)
          scene.attach(books[i].obj)
        }
        setSelected(i)
        invalidate()
      }

      /* ── pointer / keyboard ───────────────────────────────────────── */
      const el = renderer.domElement
      const ray = new THREE.Raycaster()
      const ndc = new THREE.Vector2()
      const pickable = books.map((b) => b.obj)

      let dragging = false
      let lastX = 0, lastY = 0, downX = 0, downY = 0
      let panMode = false

      const worldPerPx = () => {
        const dist = camera.position.z - FRONT_EDGE
        const vh = 2 * Math.tan((camera.fov * Math.PI) / 180 / 2) * dist
        return (vh * camera.aspect) / mount.clientHeight
      }

      const pick = (e: PointerEvent): number | null => {
        const b = el.getBoundingClientRect()
        ndc.x = ((e.clientX - b.left) / b.width) * 2 - 1
        ndc.y = -((e.clientY - b.top) / b.height) * 2 + 1
        ray.setFromCamera(ndc, camera)
        // Recursive: a book is a group of boards, block and spine.
        const hits = ray.intersectObjects(pickable, true)
        return hits.length ? (hits[0].object.userData.i as number) : null
      }

      /* Two-finger pinch. There is no wheel on a phone, so without this the
       * zoom half of the inspection view simply does not exist there — and
       * the on-screen hint promises it. */
      const touches = new Map<number, { x: number; y: number }>()
      let pinchFrom = 0
      const spread = () => {
        const [a, b] = [...touches.values()]
        return Math.hypot(a.x - b.x, a.y - b.y)
      }

      const onDown = (e: PointerEvent) => {
        el.setPointerCapture(e.pointerId)
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touches.size === 2) {
          // A second finger converts the gesture from a drag into a pinch.
          dragging = false
          pinchFrom = spread()
          return
        }
        dragging = true
        lastX = downX = e.clientX
        lastY = downY = e.clientY
        panMode = e.button === 2 || e.shiftKey
      }

      const onMove = (e: PointerEvent) => {
        if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY })

        if (touches.size === 2 && pinchFrom > 0) {
          const now = spread()
          if (selectedIdx !== null && now > 0) {
            zoom = Math.max(0.62, Math.min(2.1, zoom * (now / pinchFrom)))
            invalidate()
          }
          pinchFrom = now
          return
        }

        if (!dragging) {
          // Raycasting on every pointermove is wasted work on a touch device,
          // where there is no hover state to show in the first place.
          if (e.pointerType === 'touch') return
          const h = pick(e)
          if (h !== hoverIdx) { hoverIdx = h; invalidate() }
          el.style.cursor = h !== null ? 'pointer' : 'grab'
          return
        }
        const dx = e.clientX - lastX
        const dy = e.clientY - lastY
        lastX = e.clientX
        lastY = e.clientY

        if (selectedIdx !== null) {
          if (panMode) { pan.x += dx * 0.004; pan.y -= dy * 0.004 }
          else {
            orbit.y += dx * 0.008
            orbit.x = Math.max(-1.2, Math.min(1.2, orbit.x + dy * 0.008))
          }
        } else {
          scrollTarget = clampScroll(scrollTarget - dx * worldPerPx())
          const n = nearestIndex(scrollTarget)
          if (n !== currentIdx) { currentIdx = n; setIndex(n) }
        }
        el.style.cursor = 'grabbing'
        invalidate()
      }

      const onUp = (e: PointerEvent) => {
        touches.delete(e.pointerId)
        if (touches.size < 2) pinchFrom = 0
        try { el.releasePointerCapture(e.pointerId) } catch { /* already gone */ }
        if (!dragging) return
        dragging = false
        el.style.cursor = 'grab'
        if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) < 7) {
          const hit = pick(e)
          if (selectedIdx === null && hit !== null) select(hit)
          else if (selectedIdx !== null && hit === null) select(null)
        }
        invalidate()
      }

      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        if (selectedIdx !== null) {
          zoom = Math.max(0.62, Math.min(2.1, zoom - e.deltaY * 0.0012))
        } else {
          const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
          scrollTarget = clampScroll(scrollTarget + d * 0.0055)
          const n = nearestIndex(scrollTarget)
          if (n !== currentIdx) { currentIdx = n; setIndex(n) }
        }
        invalidate()
      }

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); goTo(currentIdx + 1) }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(currentIdx - 1) }
        else if (e.key === 'Enter' && selectedIdx === null) select(currentIdx)
        else if (e.key === 'Escape') select(null)
      }

      const onCtx = (ev: Event) => ev.preventDefault()

      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      el.addEventListener('pointercancel', onUp)
      el.addEventListener('wheel', onWheel, { passive: false })
      el.addEventListener('contextmenu', onCtx)
      mount.addEventListener('keydown', onKey)
      el.style.cursor = 'grab'

      const ro = new ResizeObserver(() => {
        if (!mount.clientWidth || !mount.clientHeight) return
        camera.aspect = mount.clientWidth / mount.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(mount.clientWidth, mount.clientHeight)
        scrollTarget = clampScroll(scrollTarget)
        invalidate()
      })
      ro.observe(mount)

      const tmpQ = new THREE.Quaternion()
      const tmpE = new THREE.Euler()
      const tmpV = new THREE.Vector3()

      /* An exponential ease never actually arrives, so a threshold this tight
       * (0.0006 world units is under a tenth of a pixel) kept the loop awake
       * for seconds after every drag, rendering motion no one can see. The
       * eases below therefore SNAP once they are within a fraction of a pixel
       * of the target, which ends the frame instead of halving the error
       * forever. */
      const EPS = 0.0025

      function tick() {
        const k = reduce ? 1 : 0.12
        let moving = false

        const ds = scrollTarget - scrollNow
        if (Math.abs(ds) > EPS) { moving = true; scrollNow += ds * k } else scrollNow = scrollTarget
        shelf.position.x = -scrollNow

        const zt = selectedIdx !== null ? -3.2 : 0
        const dz = zt - shelf.position.z
        if (Math.abs(dz) > EPS) { moving = true; shelf.position.z += dz * k } else shelf.position.z = zt

        books.forEach((b, i) => {
          if (i === selectedIdx) return
          const want = hoverIdx === i && selectedIdx === null ? 1 : 0
          const dh = want - b.hover
          if (Math.abs(dh) > EPS) { moving = true; b.hover += dh * (reduce ? 1 : 0.16) } else b.hover = want
          const mark = i === currentIdx && selectedIdx === null ? 0.2 : 0
          const tz = b.slotZ + b.hover * 0.34 + mark
          if (Math.abs(tz - b.obj.position.z) > EPS) moving = true
          b.obj.position.z = tz
          b.obj.position.x = b.slotX
          b.obj.position.y = b.height / 2
          tmpE.set(0, 0, b.lean)
          tmpQ.setFromEuler(tmpE)
          if (b.obj.quaternion.angleTo(tmpQ) > EPS) {
            moving = true
            b.obj.quaternion.slerp(tmpQ, reduce ? 1 : 0.14)
          } else b.obj.quaternion.copy(tmpQ)
        })

        if (selectedIdx !== null) {
          const b = books[selectedIdx]
          tmpV.set(inspectX() + pan.x, INSPECT.y + pan.y, INSPECT.z + (1 - zoom) * 2.1)
          if (b.obj.position.distanceTo(tmpV) > EPS) {
            moving = true
            b.obj.position.lerp(tmpV, reduce ? 1 : 0.11)
          } else b.obj.position.copy(tmpV)
          tmpE.set(orbit.x, -Math.PI / 2 + orbit.y, 0)
          tmpQ.setFromEuler(tmpE)
          if (b.obj.quaternion.angleTo(tmpQ) > EPS) {
            moving = true
            b.obj.quaternion.slerp(tmpQ, reduce ? 1 : 0.11)
          } else b.obj.quaternion.copy(tmpQ)
        }

        if (!moving && !dirty) { stopLoop(); return }
        renderer.render(scene, camera)
        dirty = false
        raf = requestAnimationFrame(tick)
      }

      shelf.position.x = -scrollNow
      renderer.render(scene, camera)
      startLoop()

      return {
        goTo,
        select,
        setVisible: (v: boolean) => {
          visible = v
          if (v) invalidate()
          else stopLoop()
        },
        dispose: () => {
          stopLoop()
          ro.disconnect()
          el.removeEventListener('pointerdown', onDown)
          el.removeEventListener('pointermove', onMove)
          el.removeEventListener('pointerup', onUp)
          el.removeEventListener('pointercancel', onUp)
          el.removeEventListener('wheel', onWheel)
          el.removeEventListener('contextmenu', onCtx)
          mount.removeEventListener('keydown', onKey)
          junk.forEach((d) => d.dispose())
          renderer.dispose()
          if (el.parentNode === mount) mount.removeChild(el)
        },
      }
    }

    /* ── build lazily, and only run while on screen ─────────────────────
     * The shelf lives well below the fold. Building nineteen books' worth
     * of canvas textures during the homepage's first paint delays every
     * other thing on the page for work nobody has scrolled to yet.
     */
    let handle: SceneHandle | null = null
    let killed = false

    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting)
        if (vis && !handle && !killed) {
          handle = build()
          api.current = handle
        }
        handle?.setVisible(vis)
      },
      { rootMargin: '400px 0px' },
    )
    io.observe(mount)

    return () => {
      killed = true
      io.disconnect()
      handle?.dispose()
      if (api.current === handle) api.current = null
    }
    // Rebuilds only when the shelf's contents actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specs.map((s) => s.id).join('|')])

  // A plain ref prop, not React's built-in `ref` — no forwardRef needed.
  // Assigned once; `goTo` closes over the stable `api` ref, so it always
  // calls whatever scene is current even though this effect never re-runs.
  useEffect(() => {
    if (!apiRef) return
    const handle: BookShelfHandle = { goTo: (i) => api.current?.goTo(i) }
    if (typeof apiRef === 'function') apiRef(handle)
    else (apiRef as { current: BookShelfHandle | null }).current = handle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One place to report movement, rather than at each of the four points
  // inside the scene that can change the index.
  useEffect(() => {
    const spec = specs[index]
    if (spec) onIndexChange?.(index, spec.id)
  }, [index, specs, onIndexChange])

  const current = specs[index]
  const open = selected !== null ? specs[selected] : null
  // Category padding volumes have no backing record — always send those to
  // the plain href. A real record uses onOpenRecord when the host supplied
  // one, so Archive can open it in place instead of navigating away.
  const isPadding = (id: string) => id.startsWith('pad-') || id.startsWith('v-')
  const openBook = () => {
    if (!open) return
    if (onOpenRecord && !isPadding(open.id)) onOpenRecord(open.id)
    else navigate(open.href)
  }

  const Wrapper = variant === 'embedded' ? 'div' : 'section'
  const wrapperClass = variant === 'embedded' ? 'shelf-section shelf-section--embedded' : 'shelf-section'

  return (
    <Wrapper className={wrapperClass}>
      {variant === 'section' && (
        <header className="shelf-head">
          <p className="shelf-eyebrow">The Complete Shelf</p>
          <h2>Access Knowledge Base</h2>
          <p className="shelf-sub">
            Every expedition report, dataset and paper NCPOR has published, bound and shelved.
            Drag to browse — pull a volume out to look closer.
          </p>
        </header>
      )}

      {/* data-inspect frees the canvas to take vertical drags while a volume
          is open; on the shelf itself the page must still scroll past. */}
      <div className="shelf-stage" data-inspect={open ? '1' : undefined}>
        <div className="shelf-canvas" ref={mountRef} tabIndex={0} role="application"
             aria-label="Three-dimensional bookshelf of archive records" />

        {!open && (
          <>
            <button className="shelf-arrow shelf-arrow-l" aria-label="Previous volume"
                    onClick={() => api.current?.goTo(index - 1)}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="shelf-arrow shelf-arrow-r" aria-label="Next volume"
                    onClick={() => api.current?.goTo(index + 1)}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}

        {open && (
          <div className="shelf-inspect">
            <button className="shelf-close" onClick={() => api.current?.select(null)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Back to shelf
            </button>
            <div className="shelf-inspect-card">
              <span className="shelf-caption-kind">{open.kind}</span>
              <h3>{open.title}</h3>
              <p>{open.sub}</p>
              <p className="shelf-hint">Drag to turn · pinch or scroll to zoom</p>
              <button className="shelf-open" onClick={openBook}>
                {onOpenRecord && !isPadding(open.id) ? 'Open record' : 'Open in Archive'}
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8"
                        strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="shelf-caption" aria-live="polite">
        <span className="shelf-caption-kind">{open ? open.kind : current?.kind}</span>
        <strong>{open ? open.title : current?.title}</strong>
        <span className="shelf-caption-sub">{open ? open.sub : current?.sub}</span>
      </div>

      <div className="shelf-markers" role="tablist" aria-label="Jump to volume">
        {specs.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={i === index}
            aria-label={s.title}
            className={`shelf-marker ${i === index ? 'is-on' : ''}`}
            onClick={() => api.current?.goTo(i)}
          >
            <span />
          </button>
        ))}
      </div>
    </Wrapper>
  )
}
