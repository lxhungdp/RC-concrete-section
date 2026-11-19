import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCapacitySurface,
  clipCapacitySurfaceByAxialCap,
  createElasticPerfectlyPlasticSteelLaw,
  evaluateEquivalentBlock,
  evaluateUniformSectionState,
  prepareEquivalentBlockSection,
  solveProportionalRayCapacity,
  type CapacityEvaluator,
  type EquivalentBlockSection,
  type Point2,
  type PreparedEquivalentBlockSection
} from '../src/index'

const rectangle = (width: number, height: number, cx = 0, cy = 0): Point2[] => [
  { x: cx - width / 2, y: cy - height / 2 },
  { x: cx + width / 2, y: cy - height / 2 },
  { x: cx + width / 2, y: cy + height / 2 },
  { x: cx - width / 2, y: cy + height / 2 }
]

const bar = (id: string, x: number, y: number) => ({ id, x, y, area: 400, steelLawId: 'steel' })

const section = (solids: EquivalentBlockSection['solids'], bars: EquivalentBlockSection['rebars']): EquivalentBlockSection => ({
  solids,
  rebars: bars,
  referencePoint: { x: 0, y: 0 },
  units: 'N-mm-MPa',
  signConvention: 'compression-positive'
})

const cases = (): Array<{ name: string; section: PreparedEquivalentBlockSection }> => [
  {
    name: 'hollow',
    section: prepareEquivalentBlockSection(section(
      [{ outer: rectangle(500, 500), holes: [rectangle(200, 200)] }],
      [bar('bl', -200, -200), bar('br', 200, -200), bar('tr', 200, 200), bar('tl', -200, 200)]
    ))
  },
  {
    name: 'L-shape',
    section: prepareEquivalentBlockSection(section(
      [{ outer: [
        { x: -250, y: -250 }, { x: 250, y: -250 }, { x: 250, y: -50 },
        { x: -50, y: -50 }, { x: -50, y: 250 }, { x: -250, y: 250 }
      ] }],
      [
        bar('b1', -200, -200), bar('b2', 0, -200), bar('b3', 200, -200),
        bar('b4', -200, 0), bar('b5', -200, 200), bar('b6', -100, -100),
        bar('b7', 100, -100), bar('b8', -100, 100)
      ]
    ))
  },
  {
    name: 'two-islands',
    section: prepareEquivalentBlockSection(section(
      [{ outer: rectangle(200, 400, -180, 0) }, { outer: rectangle(200, 400, 180, 0) }],
      [
        bar('l1', -240, -150), bar('l2', -120, -150), bar('l3', -120, 150), bar('l4', -240, 150),
        bar('r1', 120, -150), bar('r2', 240, -150), bar('r3', 240, 150), bar('r4', 120, 150)
      ]
    ))
  }
]

const law = {
  compressionStress: 25.5,
  depthFactor: 0.8,
  extremeCompressionStrain: 0.003,
  subtractDisplacedConcrete: true
} as const
const steel = createElasticPerfectlyPlasticSteelLaw(200_000, 400)

const pipeline = (prepared: PreparedEquivalentBlockSection) => {
  const evaluator: CapacityEvaluator = (state) => {
    const source = evaluateEquivalentBlock(prepared, law, { steel }, state)
    return { state, resultants: source.resultants, source }
  }
  const tension = evaluateUniformSectionState(prepared, { steel }, {
    concreteStress: 0,
    steelStrain: -1,
    subtractDisplacedConcrete: false
  })
  const compression = evaluateUniformSectionState(prepared, { steel }, {
    concreteStress: law.compressionStress,
    steelStrain: 1,
    subtractDisplacedConcrete: true
  })
  return { evaluator, tension, compression }
}

test('forward resultants remain finite and exactly assembled for difficult geometries', () => {
  for (const item of cases()) {
    const { evaluator } = pipeline(item.section)
    for (let direction = 0; direction < 12; direction += 1) {
      const angle = direction * Math.PI / 6
      for (const ratio of [0.02, 0.1, 0.5, 1, 5, 50]) {
        const source = evaluator({
          neutralAxisAngle: angle,
          neutralAxisDepth: ratio * item.section.characteristicLength
        }).source as ReturnType<typeof evaluateEquivalentBlock>
        assert.ok(Number.isFinite(source.resultants.P), item.name)
        assert.ok(Number.isFinite(source.resultants.Mx), item.name)
        assert.ok(Number.isFinite(source.resultants.My), item.name)
        assert.ok(Math.abs(source.diagnostics.componentForceResidual) < 1e-7, item.name)
        assert.ok(Math.abs(source.diagnostics.componentMomentXResidual) < 1e-5, item.name)
        assert.ok(Math.abs(source.diagnostics.componentMomentYResidual) < 1e-5, item.name)
      }
    }
  }
})

test('surface and axial-cap topology stay closed for hollow, concave, and disconnected concrete', () => {
  for (const item of cases()) {
    const { evaluator, tension, compression } = pipeline(item.section)
    const surface = buildCapacitySurface(item.section, evaluator, {
      extremeCompressionStrain: law.extremeCompressionStrain,
      tensionPole: { resultants: tension.resultants },
      compressionPole: { resultants: compression.resultants },
      seedDirections: 24,
      maxRefinementPasses: 0
    })
    assert.equal(surface.topology.closed, true, `${item.name}: ${JSON.stringify(surface.topology)}`)
    const cap = compression.resultants.P * 0.8
    const clipped = clipCapacitySurfaceByAxialCap(surface, cap)
    assert.equal(clipped.topology.closed, true, `${item.name}: ${JSON.stringify(clipped.topology)}`)
    assert.ok(Math.abs(Math.max(...clipped.points.map((point) => point.resultants.P)) - cap) < 1e-7 * Math.abs(cap))
  }
})

test('proportional inverse round-trips difficult geometries to the exact evaluator', () => {
  const states = [
    { neutralAxisAngle: 0.31, neutralAxisDepth: 180 },
    { neutralAxisAngle: 1.17, neutralAxisDepth: 260 },
    { neutralAxisAngle: 2.42, neutralAxisDepth: 330 }
  ]
  for (const item of cases()) {
    const { evaluator, tension, compression } = pipeline(item.section)
    const surface = buildCapacitySurface(item.section, evaluator, {
      extremeCompressionStrain: law.extremeCompressionStrain,
      tensionPole: { resultants: tension.resultants },
      compressionPole: { resultants: compression.resultants },
      seedDirections: 36,
      maxRefinementPasses: 0
    })
    for (const state of states) {
      const known = evaluator(state)
      const expectedFactor = 1.4
      const result = solveProportionalRayCapacity(surface, {
        P: known.resultants.P / expectedFactor,
        Mx: known.resultants.Mx / expectedFactor,
        My: known.resultants.My / expectedFactor
      }, evaluator)
      assert.equal(result.status, 'converged', item.name)
      assert.ok(Math.abs(result.loadFactor! - expectedFactor) < 2e-6, `${item.name}: ${result.loadFactor}`)
      assert.ok(result.residualNorm! < 1e-8, item.name)
    }
  }
})
