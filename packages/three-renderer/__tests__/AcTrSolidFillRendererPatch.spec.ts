import {
  AcCmColor,
  AcDbTrace,
  AcGiSubEntityTraits,
  type AcGiEntity
} from '@mlightcad/data-model'

import { installSolidFillRendererPatch } from '../src/renderer/AcTrSolidFillRendererPatch'
import { AcTrSubEntityTraitsUtil } from '../src/util'

describe('AcTrSolidFillRendererPatch', () => {
  it('draws TRACE/SOLID-compatible fills on the renderer fill tier', () => {
    installSolidFillRendererPatch()

    const traits = createTraits()
    const result = {} as AcGiEntity
    const renderer = {
      solidFillDrawOrder: -1,
      subEntityTraits: traits,
      area: jest.fn(() => {
        expect(traits.drawOrder).toBe(-1)
        return result
      })
    }

    const trace = new AcDbTrace()
    const rendered = trace.subWorldDraw(renderer as never)

    expect(rendered).toBe(result)
    expect(renderer.area).toHaveBeenCalledTimes(1)
    expect(traits.drawOrder).toBe(0)
  })

  it('keeps the upstream draw tier for renderers without fill-tier support', () => {
    installSolidFillRendererPatch()

    const traits = createTraits()
    const result = {} as AcGiEntity
    const renderer = {
      subEntityTraits: traits,
      area: jest.fn(() => {
        expect(traits.drawOrder).toBe(0)
        return result
      })
    }

    const trace = new AcDbTrace()
    const rendered = trace.subWorldDraw(renderer as never)

    expect(rendered).toBe(result)
    expect(renderer.area).toHaveBeenCalledTimes(1)
    expect(traits.drawOrder).toBe(0)
  })
})

function createTraits(): AcGiSubEntityTraits {
  const traits = AcTrSubEntityTraitsUtil.createDefaultTraits()
  traits.color = new AcCmColor().setForeground()
  traits.rgbColor = 0xffffff
  traits.drawOrder = 0
  return traits
}
