import {
  AcCmEventManager,
  AcDbRenderingCache,
  AcGeArea2d,
  AcGeCircArc3d,
  AcGeEllipseArc3d,
  AcGePoint3d,
  AcGePoint3dLike,
  AcGiEntity,
  AcGiFontMapping,
  AcGiImageStyle,
  AcGiMTextData,
  AcGiPointStyle,
  AcGiRenderer,
  AcGiSubEntityTraits,
  AcGiTextStyle
} from '@mlightcad/data-model'
import { FontManager, FontManagerEventArgs } from '@mlightcad/mtext-renderer'
import * as THREE from 'three'

import {
  AcTrEntity,
  AcTrGroup,
  AcTrImage,
  AcTrLine,
  AcTrLineSegments,
  AcTrMText,
  AcTrObject,
  AcTrPoint,
  AcTrPolygon
} from '../object'
import { AcTrMaterialManager } from '../style/AcTrMaterialManager'
import { AcTrStyleManager } from '../style/AcTrStyleManager'
import { AcTrSubEntityTraitsUtil } from '../util'
import { AcTrCamera } from '../viewport'
import { AcTrMTextRenderer } from './AcTrMTextRenderer'

type CameraZoomUniform = { value: number }
type RenderingCacheEntry = {
  key: string
  size: number
  updatedAt: number
}

type RenderingCacheStats = {
  count: number
  totalBytes: number
  maxBytes: number
  targetBytes: number
  entries: RenderingCacheEntry[]
}

type RenderingCacheRuntime = {
  set: AcDbRenderingCache['set']
  get: AcDbRenderingCache['get']
  has: AcDbRenderingCache['has']
  clear: AcDbRenderingCache['clear']
  _blocks?: Map<string, AcGiEntity>
  __mobileLruInstalled?: boolean
  __mobileLruEntries?: Map<string, RenderingCacheEntry>
  __mobileLruTotalBytes?: number
  getStats?: () => RenderingCacheStats
}

const MOBILE_RENDERING_CACHE_MAX_BYTES = 40 * 1024 * 1024
const MOBILE_RENDERING_CACHE_TARGET_BYTES = 30 * 1024 * 1024

const getIsMobile = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  const isMobile = window.matchMedia('(pointer: coarse)').matches
  return isMobile
}

const getIsDevRuntime = () => {
  const meta = import.meta as ImportMeta & {
    env?: {
      DEV?: boolean
    }
  }

  if (typeof meta.env?.DEV === 'boolean') return meta.env.DEV
  if (typeof window === 'undefined') return false
  return (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  )
}

export class AcTrRenderer implements AcGiRenderer<AcTrEntity> {
  private static _isMobileRenderingCacheLimitInstalled = false
  private _styleManager: AcTrStyleManager
  private _renderer: THREE.WebGLRenderer
  private _subEntityTraits: AcGiSubEntityTraits
  private readonly _isMobile = getIsMobile()
  private _isFrameUniformBatching = false
  private _hasFlushedFrameUniforms = false
  private _pendingCameraZoom = 1
  private _dirtyCameraZoomUniforms = new Set<CameraZoomUniform>()
  private readonly _frustum = new THREE.Frustum()
  private readonly _projectionScreenMatrix = new THREE.Matrix4()
  private readonly _visibleMaterials = new Set<THREE.Material>()

  public readonly events = {
    fontNotFound: new AcCmEventManager<FontManagerEventArgs>()
  }

  constructor(renderer: THREE.WebGLRenderer) {
    this._renderer = renderer
    if (this._isMobile) {
      AcTrRenderer.installMobileRenderingCacheLimit()
    }
    this._styleManager = new AcTrStyleManager()
    const size = renderer.getSize(new THREE.Vector2())
    this._styleManager.updateLineResolution(size.x, size.y)
    AcTrMTextRenderer.getInstance().overrideStyleManager(this._styleManager)
    FontManager.instance.events.fontNotFound.addEventListener(args => {
      this.events.fontNotFound.dispatch(args)
    })
    this._subEntityTraits = AcTrSubEntityTraitsUtil.createDefaultTraits()
  }

  /**
   * @inheritdoc
   */
  get subEntityTraits() {
    return this._subEntityTraits
  }

  get autoClear() {
    return this._renderer.autoClear
  }
  set autoClear(value: boolean) {
    this._renderer.autoClear = value
  }

  get domElement() {
    return this._renderer.domElement
  }

  setSize(width: number, height: number) {
    this._renderer.setSize(width, height)
    this._styleManager.updateLineResolution(width, height)
  }

  setPixelRatio(pixelRatio: number) {
    this._renderer.setPixelRatio(pixelRatio)
  }

  getViewport(target: THREE.Vector4) {
    return this._renderer.getViewport(target)
  }
  setViewport(x: number, y: number, width: number, height: number) {
    this._renderer.setViewport(x, y, width, height)
  }

  clear() {
    this._renderer.clear()
  }

  clearDepth() {
    this._renderer.clearDepth()
  }

  render(scene: THREE.Object3D, camera: AcTrCamera) {
    this.queueCameraZoomUniform(camera.zoom, scene, camera)
    this.flushCameraZoomUniformsIfNeeded()
    this._renderer.render(scene, camera.internalCamera)
  }

  beginFrame() {
    if (!this._isMobile) return

    this._isFrameUniformBatching = true
    this._hasFlushedFrameUniforms = false
    this._dirtyCameraZoomUniforms.clear()
  }

  endFrame() {
    if (!this._isMobile) return

    this.flushCameraZoomUniforms()
    this._isFrameUniformBatching = false
    this._hasFlushedFrameUniforms = false
    this._dirtyCameraZoomUniforms.clear()
  }

  resetState() {
    this._renderer.resetState()
  }

  /**
   * Changes rendering color to the specified color for entities whose color is ACI 7.
   * @param color - New rendering color for ACI 7.
   */
  changeForeground(color: number) {
    this._styleManager.changeForeground(color)
  }

  /**
   * Repaints materials explicitly registered as background-follow fills.
   *
   * The current fill manager keeps solid hatches on the foreground path, so
   * this is mostly an extension point for future fill styles.
   *
   * @param color - New background color (typically the canvas bg).
   */
  changeBackground(color: number) {
    this._styleManager.changeBackground(color)
  }

  /**
   * The canvas background colour tracked by the style manager.
   *
   * Reading returns the value last written here (or the default
   * `0x000000`).  Writing both stores the colour on the style manager
   * options (so material managers know the current theme) and repaints
   * every background-follow material already in the cache.
   */
  get currentBackgroundColor(): number {
    return this._styleManager.currentBackgroundColor
  }
  set currentBackgroundColor(value: number) {
    this._styleManager.currentBackgroundColor = value
  }

  /**
   * Sets the clear color used when clearing the canvas.
   *
   * @param color - Background color as 24-bit hexadecimal RGB number
   * @param alpha - Optional alpha value (0.0 - 1.0)
   */
  setClearColor(color: number, alpha?: number) {
    this._renderer.setClearColor(color, alpha)
  }

  /**
   * Gets the current clear color as a 24-bit hexadecimal RGB number.
   */
  getClearColor() {
    const color = new THREE.Color()
    this._renderer.getClearColor(color)
    return color.getHex()
  }

  /**
   * Sets the clear alpha used when clearing the canvas.
   *
   * @param alpha - Alpha value (0.0 - 1.0)
   */
  set clearAlpha(alpha: number) {
    this._renderer.setClearAlpha(alpha)
  }

  /**
   * Gets the current clear alpha value.
   */
  get clearAlpha() {
    return this._renderer.getClearAlpha()
  }

  /**
   * The internal THREE.js webgl renderer
   */
  get internalRenderer() {
    return this._renderer
  }

  /**
   * @inheritdoc
   */
  setFontMapping(mapping: AcGiFontMapping) {
    FontManager.instance.setFontMapping(mapping)
  }

  /**
   * Sets global ltscale
   */
  set ltscale(scale: number) {
    this._styleManager.options.ltscale = scale
  }

  /**
   * Sets global celtscale
   */
  set celtscale(scale: number) {
    this._styleManager.options.celtscale = scale
  }

  /**
   * Fonts list which can't be found
   */
  get missedFonts() {
    return FontManager.instance.missedFonts
  }

  /**
   * Gets whether entity lineweights are displayed.
   */
  get showLineWeight() {
    return this._styleManager.showLineWeight
  }

  /**
   * Sets whether entity lineweights are displayed.
   *
   * When disabled, line entities are rendered with basic 1px materials.
   */
  set showLineWeight(value: boolean) {
    this._styleManager.showLineWeight = value
  }

  updateLayerMaterial(
    layerName: string,
    newTraits: Partial<AcGiSubEntityTraits>
  ): Record<number, THREE.Material> {
    return this._styleManager.updateLayerMaterial(layerName, newTraits)
  }

  /**
   * Returns one cached material bound to an effective layer while preserving symbolic traits.
   *
   * This is used for block contents that inherit the layer of the INSERT they belong to.
   */
  getLayerBoundMaterial(
    material: THREE.Material,
    layerName: string,
    layerTraits?: Partial<AcGiSubEntityTraits>
  ) {
    return this._styleManager.getLayerBoundMaterial(
      material,
      layerName,
      layerTraits
    )
  }

  /**
   * Create one empty drawable object
   */
  createObject() {
    return new AcTrObject(this._styleManager)
  }

  /**
   * Create one empty entity
   */
  createEntity() {
    return new AcTrEntity(this._styleManager)
  }

  /**
   * @inheritdoc
   */
  group(entities: AcTrEntity[]) {
    return new AcTrGroup(entities, this._styleManager)
  }

  /**
   * @inheritdoc
   */
  point(point: AcGePoint3d, style: AcGiPointStyle) {
    const geometry = new AcTrPoint(
      point,
      this._subEntityTraits,
      style,
      this._styleManager
    )
    return geometry
  }

  /**
   * @inheritdoc
   */
  circularArc(arc: AcGeCircArc3d) {
    // TODO: Compute division based on current viewport size
    return this.linePoints(arc.getPoints(100))
  }

  /**
   * @inheritdoc
   */
  ellipticalArc(ellipseArc: AcGeEllipseArc3d) {
    // TODO: Compute division based on current viewport size
    return this.linePoints(ellipseArc.getPoints(100))
  }

  /**
   * @inheritdoc
   */
  lines(points: AcGePoint3dLike[]) {
    return this.linePoints(points)
  }

  /**
   * @inheritdoc
   */
  lineSegments(array: Float32Array, itemSize: number, indices: Uint16Array) {
    return new AcTrLineSegments(
      array,
      itemSize,
      indices,
      this._subEntityTraits,
      this._styleManager
    )
  }

  /**
   * @inheritdoc
   */
  area(area: AcGeArea2d) {
    return new AcTrPolygon(area, this._subEntityTraits, this._styleManager)
  }

  /**
   * @inheritdoc
   */
  mtext(mtext: AcGiMTextData, style: AcGiTextStyle, delay?: boolean) {
    return new AcTrMText(
      mtext,
      this._subEntityTraits,
      style,
      this._styleManager,
      delay
    )
  }

  /**
   * @inheritdoc
   */
  image(blob: Blob, style: AcGiImageStyle) {
    return new AcTrImage(blob, style, this._styleManager)
  }

  /**
   * Clears all cached materials and releases its memory
   */
  dispose() {
    this._styleManager.dispose()
    FontManager.instance.missedFonts = {}
  }

  private linePoints(points: AcGePoint3dLike[]) {
    return new AcTrLine(points, this._subEntityTraits, this._styleManager)
  }

  /**
   * Updates camera zoom value for shader materials
   */
  private queueCameraZoomUniform(
    zoom: number,
    scene?: THREE.Object3D,
    camera?: AcTrCamera
  ) {
    this._pendingCameraZoom = zoom

    if (!this._isMobile || !this._isFrameUniformBatching) {
      AcTrMaterialManager.CameraZoomUniform.value = zoom
      return
    }

    const uniforms =
      scene && camera
        ? this.collectVisibleCameraZoomUniforms(scene, camera)
        : undefined

    if (!uniforms || uniforms.size === 0) {
      this._dirtyCameraZoomUniforms.add(AcTrMaterialManager.CameraZoomUniform)
      return
    }

    uniforms.forEach(uniform => this._dirtyCameraZoomUniforms.add(uniform))
  }

  private flushCameraZoomUniformsIfNeeded() {
    if (!this._isMobile || !this._isFrameUniformBatching) {
      this.flushCameraZoomUniforms()
      return
    }

    if (this._hasFlushedFrameUniforms) return
    this.flushCameraZoomUniforms()
    this._hasFlushedFrameUniforms = true
  }

  private flushCameraZoomUniforms() {
    if (this._dirtyCameraZoomUniforms.size === 0) {
      AcTrMaterialManager.CameraZoomUniform.value = this._pendingCameraZoom
      return
    }

    this._dirtyCameraZoomUniforms.forEach(uniform => {
      uniform.value = this._pendingCameraZoom
    })
    this._dirtyCameraZoomUniforms.clear()
  }

  private collectVisibleCameraZoomUniforms(
    scene: THREE.Object3D,
    camera: AcTrCamera
  ) {
    this._visibleMaterials.clear()
    this.updateFrustum(camera)

    scene.traverseVisible(object => {
      if (!this.isObjectVisibleInCurrentFrustum(object)) return
      const material = (object as THREE.Object3D & {
        material?: THREE.Material | THREE.Material[]
      }).material
      if (!material) return

      if (Array.isArray(material)) {
        material.forEach(item => this._visibleMaterials.add(item))
      } else {
        this._visibleMaterials.add(material)
      }
    })

    const uniforms = new Set<CameraZoomUniform>()
    this._visibleMaterials.forEach(material => {
      const uniform = (material as THREE.ShaderMaterial).uniforms?.u_cameraZoom
      if (uniform && typeof uniform.value === 'number') {
        uniforms.add(uniform as CameraZoomUniform)
      }
    })
    this._visibleMaterials.clear()
    return uniforms
  }

  private updateFrustum(camera: AcTrCamera) {
    const internalCamera = camera.internalCamera
    internalCamera.updateMatrixWorld()
    this._projectionScreenMatrix.multiplyMatrices(
      internalCamera.projectionMatrix,
      internalCamera.matrixWorldInverse
    )
    this._frustum.setFromProjectionMatrix(this._projectionScreenMatrix)
  }

  private isObjectVisibleInCurrentFrustum(object: THREE.Object3D) {
    if (!('geometry' in object)) return true

    try {
      return this._frustum.intersectsObject(object)
    } catch {
      return true
    }
  }

  private static installMobileRenderingCacheLimit() {
    if (AcTrRenderer._isMobileRenderingCacheLimitInstalled) return

    const cache =
      AcDbRenderingCache.instance as unknown as RenderingCacheRuntime
    const blocks = cache._blocks
    if (!blocks) return

    AcTrRenderer._isMobileRenderingCacheLimitInstalled = true
    cache.__mobileLruInstalled = true
    cache.__mobileLruEntries = new Map()
    cache.__mobileLruTotalBytes = 0

    const originalSet = cache.set.bind(cache)
    const originalGet = cache.get.bind(cache)
    const originalHas = cache.has.bind(cache)
    const originalClear = cache.clear.bind(cache)
    const entries = cache.__mobileLruEntries

    const touch = (key: string) => {
      const entry = entries.get(key)
      if (!entry) return
      entry.updatedAt = Date.now()
      entries.delete(key)
      entries.set(key, entry)
    }

    const evictIfNeeded = () => {
      let evictedCount = 0
      let evictedBytes = 0

      while (
        (cache.__mobileLruTotalBytes ?? 0) >
          MOBILE_RENDERING_CACHE_MAX_BYTES &&
        entries.size > 0
      ) {
        const oldest = entries.values().next().value as
          | RenderingCacheEntry
          | undefined
        if (!oldest) break

        const cachedEntity = blocks.get(oldest.key)
        if (cachedEntity) {
          AcTrRenderer.disposeCachedRenderingGeometry(cachedEntity)
        }
        blocks.delete(oldest.key)
        entries.delete(oldest.key)
        cache.__mobileLruTotalBytes =
          (cache.__mobileLruTotalBytes ?? 0) - oldest.size
        evictedCount++
        evictedBytes += oldest.size

        if (
          (cache.__mobileLruTotalBytes ?? 0) <=
          MOBILE_RENDERING_CACHE_TARGET_BYTES
        ) {
          break
        }
      }

      if (evictedCount > 0 && getIsDevRuntime()) {
        console.warn('[AcDbRenderingCache] mobile LRU evicted entries', {
          evictedCount,
          evictedBytes,
          totalBytes: cache.__mobileLruTotalBytes
        })
      }
    }

    cache.set = (key: string, group: AcGiEntity) => {
      const previous = entries.get(key)
      if (previous) {
        cache.__mobileLruTotalBytes =
          (cache.__mobileLruTotalBytes ?? 0) - previous.size
        entries.delete(key)
      }

      const stored = originalSet(key, group)
      const cachedEntity = blocks.get(key) ?? stored
      const size = AcTrRenderer.estimateCachedRenderingSize(cachedEntity)
      entries.set(key, {
        key,
        size,
        updatedAt: Date.now()
      })
      cache.__mobileLruTotalBytes =
        (cache.__mobileLruTotalBytes ?? 0) + size
      evictIfNeeded()
      return stored
    }

    cache.get = (key: string) => {
      const result = originalGet(key)
      if (result) touch(key)
      return result
    }

    cache.has = (key: string) => {
      const result = originalHas(key)
      if (result) touch(key)
      return result
    }

    cache.clear = () => {
      blocks.forEach((entity: AcGiEntity) => {
        AcTrRenderer.disposeCachedRenderingGeometry(entity)
      })
      entries.clear()
      cache.__mobileLruTotalBytes = 0
      originalClear()
    }

    cache.getStats = () => ({
      count: entries.size,
      totalBytes: cache.__mobileLruTotalBytes ?? 0,
      maxBytes: MOBILE_RENDERING_CACHE_MAX_BYTES,
      targetBytes: MOBILE_RENDERING_CACHE_TARGET_BYTES,
      entries: Array.from(entries.values())
    })
  }

  private static estimateCachedRenderingSize(entity: AcGiEntity) {
    let size = 0
    const maybeObject = entity as unknown as THREE.Object3D
    maybeObject.traverse?.(object => {
      size += 512
      const geometry = (object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry
      }).geometry
      if (!geometry) return

      Object.values(geometry.attributes).forEach(attribute => {
        const array = attribute.array as ArrayLike<number> & {
          byteLength?: number
        }
        size += array.byteLength ?? array.length * 4
      })
      const indexArray = geometry.index?.array as
        | (ArrayLike<number> & {
            byteLength?: number
          })
        | undefined
      if (indexArray) size += indexArray.byteLength ?? indexArray.length * 4
    })
    return size
  }

  private static disposeCachedRenderingGeometry(entity: AcGiEntity) {
    const maybeObject = entity as unknown as THREE.Object3D
    maybeObject.traverse?.(object => {
      const geometry = (object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry
      }).geometry
      geometry?.dispose()
    })
  }
}
