import { AcDbTrace, type AcGiRenderer } from '@mlightcad/data-model'

const SOLID_FILL_RENDERER_PATCHED = Symbol.for(
  '@mlightcad/three-renderer/solid-fill-renderer-patched'
)

interface AcTrSolidFillRenderer extends AcGiRenderer {
  solidFillDrawOrder?: number
}

type PatchedTracePrototype = AcDbTrace & Record<symbol, boolean | undefined>

/**
 * Renders legacy SOLID/TRACE areas on a fill tier when the active renderer opts
 * in. DXF SOLID entities are converted to AcDbTrace upstream, and Trace draws a
 * generic area at normal tier 0 by default, which can cover model linework.
 */
export function installSolidFillRendererPatch() {
  const prototype = AcDbTrace.prototype as PatchedTracePrototype
  if (prototype[SOLID_FILL_RENDERER_PATCHED]) return

  const originalSubWorldDraw = prototype.subWorldDraw
  prototype.subWorldDraw = function (renderer: AcGiRenderer) {
    const fillRenderer = renderer as AcTrSolidFillRenderer
    const drawOrder = fillRenderer.solidFillDrawOrder
    if (typeof drawOrder !== 'number') {
      return originalSubWorldDraw.call(this, renderer)
    }

    const traits = renderer.subEntityTraits
    const originalDrawOrder = traits.drawOrder
    traits.drawOrder = drawOrder
    try {
      return originalSubWorldDraw.call(this, renderer)
    } finally {
      traits.drawOrder = originalDrawOrder
    }
  }

  prototype[SOLID_FILL_RENDERER_PATCHED] = true
}
