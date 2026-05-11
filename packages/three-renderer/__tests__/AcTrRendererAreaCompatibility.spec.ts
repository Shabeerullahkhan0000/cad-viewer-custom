import {
  AcGeArea2d,
  AcGePolyline2d,
  AcGiSubEntityTraits
} from '@mlightcad/data-model'
import * as THREE from 'three'

jest.mock('../src/object', () => {
  const THREE = require('three') as typeof import('three')

  const createEntity = (children: THREE.Object3D[] = []) => ({
    userData: {},
    children,
    add(child: THREE.Object3D) {
      this.children.push(child)
    },
    traverse(callback: (object: THREE.Object3D) => void) {
      callback(this as unknown as THREE.Object3D)
      this.children.forEach(child => child.traverse(callback))
    }
  })

  function MockEntity() {
    return createEntity()
  }

  function MockGroup(entities: THREE.Object3D[] = []) {
    return createEntity(entities)
  }

  function MockLine() {
    return createEntity([new THREE.LineSegments()])
  }

  function MockPolygon() {
    return createEntity([new THREE.Mesh()])
  }

  return {
    AcTrEntity: MockEntity,
    AcTrGroup: MockGroup,
    AcTrImage: MockEntity,
    AcTrLine: MockLine,
    AcTrLineSegments: MockLine,
    AcTrMText: MockEntity,
    AcTrObject: MockEntity,
    AcTrPoint: MockEntity,
    AcTrPolygon: MockPolygon
  }
})

import { AcTrRenderer } from '../src/renderer/AcTrRenderer'
import { AcTrStyleManager } from '../src/style/AcTrStyleManager'
import { AcTrSubEntityTraitsUtil } from '../src/util'

describe('AcTrRenderer area compatibility', () => {
  it('outlines background-tier solid fills instead of emitting opaque slabs', () => {
    const { renderer, traits } = createHeadlessRenderer()
    traits.drawOrder = -1
    traits.fillType = {
      solidFill: true,
      patternAngle: 0,
      definitionLines: []
    }

    const entity = renderer.area(createSquareArea())

    expect(countChildren(entity, object => object instanceof THREE.Mesh)).toBe(0)
    expect(
      countChildren(entity, object => object instanceof THREE.LineSegments)
    ).toBeGreaterThan(0)
    expect(entity.userData.renderMode).toBe('outline')
    expect(entity.userData.fillSuppressed).toBe(true)
  })

  it('keeps linework-tier solid fills as real filled meshes', () => {
    const { renderer, traits } = createHeadlessRenderer()
    traits.drawOrder = 0
    traits.fillType = {
      solidFill: true,
      patternAngle: 0,
      definitionLines: []
    }

    const entity = renderer.area(createSquareArea())

    expect(
      countChildren(entity, object => object instanceof THREE.Mesh)
    ).toBeGreaterThan(0)
    expect(
      countChildren(entity, object => object instanceof THREE.LineSegments)
    ).toBe(0)
  })

  it('keeps patterned background hatches as mesh/shader fills', () => {
    const { renderer, traits } = createHeadlessRenderer()
    traits.drawOrder = -1
    traits.fillType = {
      solidFill: false,
      patternAngle: 0,
      definitionLines: [
        {
          angle: Math.PI / 4,
          base: { x: 0, y: 0 },
          offset: { x: 0, y: 3.175 },
          dashLengths: []
        }
      ]
    }

    const entity = renderer.area(createSquareArea())

    expect(
      countChildren(entity, object => object instanceof THREE.Mesh)
    ).toBeGreaterThan(0)
    expect(entity.userData.fillSuppressed).toBeUndefined()
  })
})

function createHeadlessRenderer() {
  const renderer = Object.create(AcTrRenderer.prototype) as AcTrRenderer
  const internals = renderer as unknown as {
    _styleManager: AcTrStyleManager
    _subEntityTraits: AcGiSubEntityTraits
  }
  internals._styleManager = new AcTrStyleManager()
  internals._subEntityTraits = AcTrSubEntityTraitsUtil.createDefaultTraits()
  return { renderer, traits: internals._subEntityTraits }
}

function createSquareArea() {
  const area = new AcGeArea2d()
  area.add(
    new AcGePolyline2d(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ],
      true
    )
  )
  return area
}

function countChildren(
  object: THREE.Object3D,
  predicate: (object: THREE.Object3D) => boolean
) {
  let count = 0
  object.traverse(child => {
    if (predicate(child)) {
      count += 1
    }
  })
  return count
}
