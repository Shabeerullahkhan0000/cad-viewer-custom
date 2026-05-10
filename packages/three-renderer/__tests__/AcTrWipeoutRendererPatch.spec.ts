import { AcDbWipeout, type AcGiEntity } from '@mlightcad/data-model'

import { installWipeoutRendererPatch } from '../src/renderer/AcTrWipeoutRendererPatch'

describe('AcTrWipeoutRendererPatch', () => {
  it('routes WIPEOUT rendering through a renderer-specific wipeout method', () => {
    installWipeoutRendererPatch()

    const result = {} as AcGiEntity
    const renderer = {
      wipeout: jest.fn(() => result),
      area: jest.fn()
    }

    const wipeout = new AcDbWipeout()
    const rendered = wipeout.subWorldDraw(renderer as never)

    expect(rendered).toBe(result)
    expect(renderer.wipeout).toHaveBeenCalledTimes(1)
    expect(renderer.area).not.toHaveBeenCalled()
  })

  it('keeps the upstream area fallback for renderers without wipeout support', () => {
    installWipeoutRendererPatch()

    const result = {} as AcGiEntity
    const renderer = {
      area: jest.fn(() => result)
    }

    const wipeout = new AcDbWipeout()
    const rendered = wipeout.subWorldDraw(renderer as never)

    expect(rendered).toBe(result)
    expect(renderer.area).toHaveBeenCalledTimes(1)
  })
})
