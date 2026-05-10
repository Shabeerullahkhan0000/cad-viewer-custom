import {
  AcDbWipeout,
  type AcGePoint3dLike,
  type AcGiEntity,
  type AcGiRenderer
} from '@mlightcad/data-model'

const WIPEOUT_RENDERER_PATCHED = Symbol.for(
  '@mlightcad/three-renderer/wipeout-renderer-patched'
)

interface AcTrWipeoutRenderer extends AcGiRenderer {
  wipeout?(points: AcGePoint3dLike[]): AcGiEntity
}

type AcDbWipeoutWithBoundary = AcDbWipeout & {
  boundaryPath?: () => AcGePoint3dLike[]
}

type PatchedWipeoutPrototype = AcDbWipeout &
  Record<symbol, boolean | undefined>

/**
 * Routes AcDbWipeout drawing through renderers that explicitly implement
 * `wipeout()`. The upstream data model emits wipeouts as generic filled areas,
 * which makes browser viewers paint opaque white/foreground blocks. Keeping the
 * fallback preserves behavior for renderers that have no wipeout-specific path.
 */
export function installWipeoutRendererPatch() {
  const prototype = AcDbWipeout.prototype as PatchedWipeoutPrototype
  if (prototype[WIPEOUT_RENDERER_PATCHED]) return

  const originalSubWorldDraw = prototype.subWorldDraw
  prototype.subWorldDraw = function (
    this: AcDbWipeoutWithBoundary,
    renderer: AcGiRenderer
  ) {
    const wipeoutRenderer = renderer as AcTrWipeoutRenderer
    if (typeof wipeoutRenderer.wipeout === 'function') {
      return wipeoutRenderer.wipeout(this.boundaryPath?.() ?? [])
    }

    return originalSubWorldDraw.call(this, renderer)
  }

  prototype[WIPEOUT_RENDERER_PATCHED] = true
}
