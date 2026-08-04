import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EquivalentBlockInputError,
  createElasticPerfectlyPlasticSteelLaw,
  evaluateEquivalentBlock,
  prepareEquivalentBlockSection,
  type EquivalentBlockSection,
  type Point2
} from './index'

const close = (actual: number, expected: number, relative = 1e-10) => {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected))
  assert.ok(Math.abs(actual - expected) <= relative * scale, `${actual} != ${expected}`)
}

const rectangle = (width: number, height: number, center: Point2 = { x: 0, y: 0 }): Point2[] => [
  { x: center.x - width / 2, y: center.y - height / 2 },
  { x: center.x + width / 2, y: center.y - height / 2 },
  { x: center.x + width / 2, y: center.y + height / 2 },
  { x: center.x - width / 2, y: center.y + height / 2 }
]

const section = (patch: Partial<EquivalentBlockSection> = {}): EquivalentBlockSection => ({
  solids: [{ outer: rectangle(300, 500) }],
  rebars: [],
  referencePoint: { x: 0, y: 0 },
  units: 'N-mm-MPa',
  signConvention: 'compression-positive',
  ...patch
})

const law = {
  compressionStress: 0.85 * 30,
  depthFactor: 0.8,
  extremeCompressionStrain: 0.003,
  subtractDisplacedConcrete: true
} as const

test('forward evaluator reproduces the analytical rectangular concrete block', () => {
  const prepared = prepareEquivalentBlockSection(section())
  const result = evaluateEquivalentBlock(prepared, law, {}, {
    neutralAxisAngle: Math.PI / 2,
    neutralAxisDepth: 200
  })
  const area = 300 * 160
  const force = law.compressionStress * area
  close(result.state.blockDepth, 160)
  close(result.concrete.area, area)
  close(result.concrete.centroid.x, 0)
  close(result.concrete.centroid.y, 170)
  close(result.resultants.P, force)
  close(result.resultants.Mx, force * 170)
  close(result.resultants.My, 0)
  close(result.diagnostics.forceClosure, 0)
  close(result.diagnostics.momentXClosure, 0)
})

test('forward evaluator applies strain compatibility and displaced-concrete correction to bars', () => {
  const prepared = prepareEquivalentBlockSection(section({
    rebars: [
      { id: 'top', x: 0, y: 200, area: 500, steelLawId: 'steel' },
      { id: 'bottom', x: 0, y: -200, area: 500, steelLawId: 'steel' }
    ]
  }))
  const steel = createElasticPerfectlyPlasticSteelLaw(200_000, 400)
  const result = evaluateEquivalentBlock(prepared, law, { steel }, {
    neutralAxisAngle: Math.PI / 2,
    neutralAxisDepth: 200
  })
  const top = result.bars.find((bar) => bar.id === 'top')!
  const bottom = result.bars.find((bar) => bar.id === 'bottom')!
  close(top.strain, 0.00225)
  close(top.steelStress, 400)
  close(top.displacedConcreteStress, law.compressionStress)
  close(top.force, 500 * (400 - law.compressionStress))
  assert.equal(top.insideBlock, true)
  close(bottom.strain, -0.00375)
  close(bottom.steelStress, -400)
  close(bottom.displacedConcreteStress, 0)
  close(bottom.force, -200_000)
  assert.equal(bottom.insideBlock, false)
  assert.equal(result.controllingBarId, 'bottom')
  close(result.controllingTensileStrain, 0.00375)
})

test('half-plane integration subtracts clipped holes exactly', () => {
  const prepared = prepareEquivalentBlockSection(section({
    solids: [{ outer: rectangle(200, 200), holes: [rectangle(100, 100)] }]
  }))
  const result = evaluateEquivalentBlock(prepared, {
    ...law,
    depthFactor: 1
  }, {}, {
    neutralAxisAngle: Math.PI / 2,
    neutralAxisDepth: 100
  })
  close(prepared.grossArea, 30_000)
  close(result.concrete.area, 15_000)
  close(result.concrete.centroid.x, 0)
  close(result.concrete.centroid.y, 875_000 / 15_000)
})

test('multiple solids are integrated without a fiber mesh', () => {
  const prepared = prepareEquivalentBlockSection(section({
    solids: [
      { outer: rectangle(100, 200, { x: -100, y: 0 }) },
      { outer: rectangle(100, 200, { x: 100, y: 0 }) }
    ]
  }))
  const result = evaluateEquivalentBlock(prepared, { ...law, depthFactor: 1 }, {}, {
    neutralAxisAngle: Math.PI / 2,
    neutralAxisDepth: 100
  })
  close(prepared.grossArea, 40_000)
  close(result.concrete.area, 20_000)
  close(result.concrete.centroid.x, 0)
  close(result.concrete.centroid.y, 50)
})

test('translation with the reference point preserves section resultants', () => {
  const base = prepareEquivalentBlockSection(section())
  const shifted = prepareEquivalentBlockSection(section({
    solids: [{ outer: rectangle(300, 500, { x: 1234, y: -876 }) }],
    referencePoint: { x: 1234, y: -876 }
  }))
  const state = { neutralAxisAngle: 0.37, neutralAxisDepth: 240 }
  const baseResult = evaluateEquivalentBlock(base, law, {}, state)
  const shiftedResult = evaluateEquivalentBlock(shifted, law, {}, state)
  close(shiftedResult.resultants.P, baseResult.resultants.P, 1e-9)
  close(shiftedResult.resultants.Mx, baseResult.resultants.Mx, 1e-9)
  close(shiftedResult.resultants.My, baseResult.resultants.My, 1e-9)
})

test('invalid self-intersections and rebars in voids are rejected', () => {
  assert.throws(
    () => prepareEquivalentBlockSection(section({
      solids: [{ outer: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }] }]
    })),
    (error: unknown) => error instanceof EquivalentBlockInputError && error.code === 'INVALID_GEOMETRY'
  )
  assert.throws(
    () => prepareEquivalentBlockSection(section({
      solids: [{ outer: rectangle(200, 200), holes: [rectangle(100, 100)] }],
      rebars: [{ id: 'void', x: 0, y: 0, area: 100, steelLawId: 'steel' }]
    })),
    (error: unknown) => error instanceof EquivalentBlockInputError && error.code === 'INVALID_REBAR'
  )
})
