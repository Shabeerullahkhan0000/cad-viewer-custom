export interface CadPoint {
  x: number
  y: number
  z?: number
}

export interface CadBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  isEmpty?: boolean
}

export interface CadColor {
  mode: 'bylayer' | 'byblock' | 'aci' | 'truecolor'
  aci: number | null
  trueColor: number | null
  rgb: string | null
}

export interface CadLayer {
  name: string
  color: CadColor
  linetype: string
  is_off?: boolean
  is_frozen?: boolean
  is_locked?: boolean
  isOff: boolean
  isFrozen: boolean
  isLocked: boolean
}

export interface CadEntity {
  type: string
  handle: string
  layer: string
  color: CadColor
  linetype: string
  lineweight: number
  geometry: CadGeometry
}

export type CadGeometry = Record<string, unknown> & {
  bounds?: CadBounds
  children?: CadEntity[]
}

export interface DxfDrawingJson {
  schemaVersion: string
  source: string
  generatedAt: string
  layers: CadLayer[]
  entities: CadEntity[]
  skipped: Array<Record<string, unknown>>
  errors: Array<Record<string, unknown>>
  bounds: CadBounds
  summary: {
    totalParsed: number
    totalSkipped: number
    totalErrors: number
    entityTypeBreakdown: Record<string, number>
    recoverMessages?: string[]
  }
}

export interface DxfRenderOptions {
  backgroundColor?: string
  defaultColor?: string
  padding?: number
  devicePixelRatio?: number
  fitToCanvas?: boolean
  renderText?: boolean
  renderHatchFills?: boolean
  hatchFillAlpha?: number
  pointSize?: number
  fontFamily?: string
  lineweightScale?: number
  onEntityRendered?: (record: CanvasObjectRecord) => void
}

export interface DxfViewTransform {
  scale: number
  padding: number
  canvasWidth: number
  canvasHeight: number
  bounds: CadBounds
  worldToScreen(point: CadPoint): CadPoint
  screenToWorld(point: CadPoint): CadPoint
}

export interface CanvasObjectRecord {
  id: string
  handle: string
  type: string
  layer: string
  entity: CadEntity
  path: Path2D | null
  worldBounds: CadBounds | null
  screenBounds: CadBounds | null
}

export interface DxfRenderResult {
  drawing: DxfDrawingJson
  objects: CanvasObjectRecord[]
  view: DxfViewTransform
}

interface RenderState {
  ctx: CanvasRenderingContext2D
  layerMap: Map<string, CadLayer>
  view: DxfViewTransform
  options: Required<
    Pick<
      DxfRenderOptions,
      | 'backgroundColor'
      | 'defaultColor'
      | 'padding'
      | 'renderText'
      | 'renderHatchFills'
      | 'hatchFillAlpha'
      | 'pointSize'
      | 'fontFamily'
      | 'lineweightScale'
    >
  >
  onEntityRendered?: (record: CanvasObjectRecord) => void
  objects: CanvasObjectRecord[]
}

const DEFAULT_OPTIONS = {
  backgroundColor: '#050505',
  defaultColor: '#ffffff',
  padding: 32,
  renderText: true,
  renderHatchFills: false,
  hatchFillAlpha: 0.16,
  pointSize: 4,
  fontFamily: 'Arial, sans-serif',
  lineweightScale: 1,
}

const ACI_FALLBACK: Record<number, string> = {
  1: '#ff0000',
  2: '#ffff00',
  3: '#00ff00',
  4: '#00ffff',
  5: '#0000ff',
  6: '#ff00ff',
  7: '#ffffff',
  8: '#808080',
  9: '#c0c0c0',
  10: '#ff0000',
  30: '#ff7f00',
  50: '#ffff00',
  70: '#7fff00',
  90: '#00ff00',
  130: '#00ffff',
  170: '#0000ff',
  210: '#7f00ff',
  250: '#333333',
  251: '#505050',
  252: '#696969',
  253: '#828282',
  254: '#bebebe',
  255: '#ffffff',
}

export async function fetchDxfDrawingJson(
  url = '/drawing.json',
  init?: RequestInit
): Promise<DxfDrawingJson> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as DxfDrawingJson
}

export async function renderDxfDrawing(
  canvas: HTMLCanvasElement,
  source: string | DxfDrawingJson = '/drawing.json',
  options: DxfRenderOptions = {}
): Promise<DxfRenderResult> {
  const drawing = typeof source === 'string' ? await fetchDxfDrawingJson(source) : source
  return renderDxfDrawingToCanvas(canvas, drawing, options)
}

export function renderDxfDrawingToCanvas(
  canvas: HTMLCanvasElement,
  drawing: DxfDrawingJson,
  options: DxfRenderOptions = {}
): DxfRenderResult {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context is not available')
  }

  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options }
  resizeCanvas(canvas, options.devicePixelRatio)
  const view = createViewTransform(canvas, drawing.bounds, resolvedOptions.padding)
  const layerMap = new Map(drawing.layers.map(layer => [layer.name, layer]))
  const state: RenderState = {
    ctx,
    layerMap,
    view,
    options: resolvedOptions,
    onEntityRendered: options.onEntityRendered,
    objects: [],
  }

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = resolvedOptions.backgroundColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()

  for (const entity of drawing.entities) {
    renderEntity(entity, state, null, null)
  }

  return { drawing, objects: state.objects, view }
}

export function createViewTransform(
  canvas: HTMLCanvasElement,
  bounds: CadBounds,
  padding = 32
): DxfViewTransform {
  const safeBounds =
    !bounds || bounds.isEmpty
      ? { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1, isEmpty: false }
      : bounds
  const width = Math.max(safeBounds.width || safeBounds.maxX - safeBounds.minX, 1)
  const height = Math.max(safeBounds.height || safeBounds.maxY - safeBounds.minY, 1)
  const availableWidth = Math.max(canvas.width - padding * 2, 1)
  const availableHeight = Math.max(canvas.height - padding * 2, 1)
  const scale = Math.min(availableWidth / width, availableHeight / height)
  const drawnWidth = width * scale
  const drawnHeight = height * scale
  const left = (canvas.width - drawnWidth) / 2
  const top = (canvas.height - drawnHeight) / 2

  return {
    scale,
    padding,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    bounds: safeBounds,
    worldToScreen(point: CadPoint): CadPoint {
      return {
        x: left + (point.x - safeBounds.minX) * scale,
        y: top + (safeBounds.maxY - point.y) * scale,
        z: point.z,
      }
    },
    screenToWorld(point: CadPoint): CadPoint {
      return {
        x: safeBounds.minX + (point.x - left) / scale,
        y: safeBounds.maxY - (point.y - top) / scale,
        z: point.z,
      }
    },
  }
}

function renderEntity(
  entity: CadEntity,
  state: RenderState,
  parentLayer: string | null,
  parentColor: string | null
): void {
  const effectiveLayer = entity.layer === '0' && parentLayer ? parentLayer : entity.layer
  if (!isLayerVisible(effectiveLayer, state.layerMap)) {
    return
  }

  const color = resolveEntityColor(entity, effectiveLayer, state.layerMap, parentColor, state.options.defaultColor)
  state.ctx.save()
  state.ctx.strokeStyle = color
  state.ctx.fillStyle = color
  state.ctx.lineWidth = resolveLineWidth(entity, state.view.scale, state.options.lineweightScale)
  state.ctx.lineCap = 'round'
  state.ctx.lineJoin = 'round'

  switch (entity.type) {
    case 'LINE':
      recordPath(entity, state, drawLinePath(state.view, point(entity.geometry.start), point(entity.geometry.end)), false)
      break
    case 'CIRCLE':
      renderCircle(entity, state)
      break
    case 'ARC':
    case 'ELLIPSE':
    case 'SPLINE':
      renderSampled(entity, state, 'sampledPoints', false)
      break
    case 'LWPOLYLINE':
    case 'POLYLINE':
      renderSampled(entity, state, 'points', Boolean(entity.geometry.closed))
      break
    case 'TEXT':
      renderTextEntity(entity, state, 'text')
      break
    case 'MTEXT':
      renderTextEntity(entity, state, 'mtext')
      break
    case 'POINT':
      renderPoint(entity, state)
      break
    case 'HATCH':
      renderHatch(entity, state)
      break
    case 'INSERT':
    case 'DIMENSION':
      renderChildren(entity, state, effectiveLayer, color)
      break
    default:
      break
  }

  state.ctx.restore()
}

function renderChildren(
  entity: CadEntity,
  state: RenderState,
  effectiveLayer: string,
  color: string
): void {
  const children = entity.geometry.children || []
  for (const child of children) {
    renderEntity(child, state, effectiveLayer, color)
  }
  pushRecord(entity, state, null)
}

function renderCircle(entity: CadEntity, state: RenderState): void {
  const center = point(entity.geometry.center)
  const radius = number(entity.geometry.radius)
  if (!center || radius <= 0) return
  const screen = state.view.worldToScreen(center)
  const path = new Path2D()
  path.arc(screen.x, screen.y, radius * state.view.scale, 0, Math.PI * 2)
  recordPath(entity, state, path, false)
}

function renderSampled(
  entity: CadEntity,
  state: RenderState,
  key: 'points' | 'sampledPoints',
  closed: boolean
): void {
  const points = pointArray(entity.geometry[key])
  if (points.length < 2) return
  const path = polylinePath(points, state.view, closed)
  recordPath(entity, state, path, false)
}

function renderTextEntity(entity: CadEntity, state: RenderState, kind: 'text' | 'mtext'): void {
  if (!state.options.renderText) return
  const insert = point(entity.geometry.insert)
  if (!insert) return
  const text = String(entity.geometry.text || '')
  if (!text) return

  const screen = state.view.worldToScreen(insert)
  const height =
    kind === 'mtext'
      ? number(entity.geometry.charHeight, 1) * state.view.scale
      : number(entity.geometry.height, 1) * state.view.scale
  const rotation = (-number(entity.geometry.rotation) * Math.PI) / 180
  const lines = text.split(/\r\n|\r|\n/g)

  state.ctx.save()
  state.ctx.translate(screen.x, screen.y)
  state.ctx.rotate(rotation)
  state.ctx.font = `${Math.max(height, 6)}px ${state.options.fontFamily}`
  state.ctx.textBaseline = 'alphabetic'
  for (let index = 0; index < lines.length; index += 1) {
    state.ctx.fillText(lines[index], 0, index * height * 1.25)
  }
  const width = Math.max(...lines.map(line => state.ctx.measureText(line).width), 1)
  state.ctx.restore()

  const boundsPath = new Path2D()
  boundsPath.rect(screen.x, screen.y - height, width, Math.max(height * lines.length * 1.25, height))
  pushRecord(entity, state, boundsPath)
}

function renderPoint(entity: CadEntity, state: RenderState): void {
  const location = point(entity.geometry.location)
  if (!location) return
  const screen = state.view.worldToScreen(location)
  const size = state.options.pointSize
  const path = new Path2D()
  path.moveTo(screen.x - size, screen.y)
  path.lineTo(screen.x + size, screen.y)
  path.moveTo(screen.x, screen.y - size)
  path.lineTo(screen.x, screen.y + size)
  recordPath(entity, state, path, false)
}

function renderHatch(entity: CadEntity, state: RenderState): void {
  const paths = array(entity.geometry.paths)
  for (const hatchPath of paths) {
    const path = hatchBoundaryPath(hatchPath, state.view)
    if (!path) continue
    if (state.options.renderHatchFills && Boolean(entity.geometry.solidFill)) {
      state.ctx.save()
      state.ctx.globalAlpha = state.options.hatchFillAlpha
      state.ctx.fill(path)
      state.ctx.restore()
    }
    state.ctx.stroke(path)
    pushRecord(entity, state, path)
  }
}

function hatchBoundaryPath(value: unknown, view: DxfViewTransform): Path2D | null {
  const hatchPath = object(value)
  if (!hatchPath) return null
  if (hatchPath.type === 'polyline') {
    const points = pointArray(hatchPath.points)
    return points.length >= 2 ? polylinePath(points, view, Boolean(hatchPath.closed)) : null
  }
  if (hatchPath.type === 'edges') {
    const path = new Path2D()
    let hasGeometry = false
    for (const edgeValue of array(hatchPath.edges)) {
      const edge = object(edgeValue)
      if (!edge) continue
      const edgePoints =
        edge.type === 'line'
          ? [point(edge.start), point(edge.end)].filter(Boolean)
          : pointArray(edge.sampledPoints)
      if (edgePoints.length < 2) continue
      appendPolyline(path, edgePoints as CadPoint[], view, false)
      hasGeometry = true
    }
    return hasGeometry ? path : null
  }
  return null
}

function recordPath(entity: CadEntity, state: RenderState, path: Path2D | null, fill: boolean): void {
  if (!path) return
  if (fill) {
    state.ctx.fill(path)
  } else {
    state.ctx.stroke(path)
  }
  pushRecord(entity, state, path)
}

function pushRecord(entity: CadEntity, state: RenderState, path: Path2D | null): void {
  const worldBounds = entity.geometry.bounds || null
  const record: CanvasObjectRecord = {
    id: entity.handle,
    handle: entity.handle,
    type: entity.type,
    layer: entity.layer,
    entity,
    path,
    worldBounds,
    screenBounds: worldBounds ? screenBounds(worldBounds, state.view) : null,
  }
  state.objects.push(record)
  state.onEntityRendered?.(record)
}

function drawLinePath(view: DxfViewTransform, start: CadPoint | null, end: CadPoint | null): Path2D | null {
  if (!start || !end) return null
  const path = new Path2D()
  const a = view.worldToScreen(start)
  const b = view.worldToScreen(end)
  path.moveTo(a.x, a.y)
  path.lineTo(b.x, b.y)
  return path
}

function polylinePath(points: CadPoint[], view: DxfViewTransform, closed: boolean): Path2D {
  const path = new Path2D()
  appendPolyline(path, points, view, closed)
  return path
}

function appendPolyline(path: Path2D, points: CadPoint[], view: DxfViewTransform, closed: boolean): void {
  points.forEach((worldPoint, index) => {
    const screenPoint = view.worldToScreen(worldPoint)
    if (index === 0) path.moveTo(screenPoint.x, screenPoint.y)
    else path.lineTo(screenPoint.x, screenPoint.y)
  })
  if (closed) {
    path.closePath()
  }
}

function screenBounds(bounds: CadBounds, view: DxfViewTransform): CadBounds {
  const a = view.worldToScreen({ x: bounds.minX, y: bounds.minY })
  const b = view.worldToScreen({ x: bounds.maxX, y: bounds.maxY })
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x, b.x)
  const maxY = Math.max(a.y, b.y)
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, isEmpty: false }
}

function isLayerVisible(layerName: string, layerMap: Map<string, CadLayer>): boolean {
  const layer = layerMap.get(layerName)
  return !layer || (!(layer.isOff || layer.is_off) && !(layer.isFrozen || layer.is_frozen))
}

function resolveEntityColor(
  entity: CadEntity,
  effectiveLayer: string,
  layerMap: Map<string, CadLayer>,
  parentColor: string | null,
  defaultColor: string
): string {
  const color = entity.color
  if (color.mode === 'truecolor' && color.rgb) return color.rgb
  if (color.mode === 'aci' && color.rgb) return color.rgb
  if (color.mode === 'aci' && color.aci) return ACI_FALLBACK[color.aci] || defaultColor
  if (color.mode === 'byblock' && parentColor) return parentColor

  const layer = layerMap.get(effectiveLayer) || layerMap.get(entity.layer)
  if (layer?.color.rgb) return layer.color.rgb
  if (layer?.color.aci) return ACI_FALLBACK[layer.color.aci] || defaultColor
  return defaultColor
}

function resolveLineWidth(entity: CadEntity, scale: number, lineweightScale: number): number {
  if (entity.lineweight > 0) {
    return Math.max(1, Math.min(12, (entity.lineweight / 100) * scale * lineweightScale))
  }
  return 1
}

function resizeCanvas(canvas: HTMLCanvasElement, requestedDpr?: number): void {
  const dpr =
    requestedDpr ||
    (typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1)
  const cssWidth = canvas.clientWidth || canvas.width
  const cssHeight = canvas.clientHeight || canvas.height
  const width = Math.max(1, Math.floor(cssWidth * dpr))
  const height = Math.max(1, Math.floor(cssHeight * dpr))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
}

function point(value: unknown): CadPoint | null {
  const objectValue = object(value)
  if (!objectValue) return null
  const x = number(objectValue.x, Number.NaN)
  const y = number(objectValue.y, Number.NaN)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const z = number(objectValue.z, 0)
  return { x, y, z }
}

function pointArray(value: unknown): CadPoint[] {
  return array(value).map(point).filter((item): item is CadPoint => Boolean(item))
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
