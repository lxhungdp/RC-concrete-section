import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateEquivalentBlock,
  prepareEquivalentBlockSection,
  resolveSteelStrainLimits,
  solveFixedAxialCapacity,
  steelStrainLimitAt,
  type SteelLawRegistry
} from '../src/index'

const section = prepareEquivalentBlockSection({
  solids: [{ outer: [{ x: -150, y: -250 }, { x: 150, y: -250 }, { x: 150, y: 250 }, { x: -150, y: 250 }] }],
  rebars: [[-100, -200], [100, -200], [100, 200], [-100, 200], [0, -60]].map(([x, y], i) => ({
    id: String(i),
    x,
    y,
    area: 500,
    steelLawId: i === 4 ? 'inner' : 'outer'
  })),
  referencePoint: { x: 0, y: 0 },
  units: 'N-mm-MPa',
  signConvention: 'compression-positive'
})

const block = {
  compressionStress: 25.5,
  depthFactor: 0.8,
  extremeCompressionStrain: 0.0035,
  subtractDisplacedConcrete: true
}

const stressAt = (e: number) => Math.sign(e) * (Math.abs(e) <= 0.002
  ? 200000 * Math.abs(e)
  : 400 + (440 - 400) * (Math.abs(e) - 0.002) / (0.05 - 0.002))

const steel = (tension: number, compression?: number) => ({
  stressAt,
  yieldStrain: 0.002,
  ultimateStrain: tension,
  strainLimits: { tension, compression }
})

const solve = (laws: SteelLawRegistry, P: number, Mx = 1e6, pivot?: number) => {
  const law = { ...block, compressionPivotStrain: pivot }
  const evaluator = (state: { neutralAxisAngle: number; neutralAxisDepth: number }) => {
    const source = evaluateEquivalentBlock(section, law, laws, state)
    return { state, resultants: source.resultants, source }
  }
  const result = solveFixedAxialCapacity(section, evaluator, P, { Mx, My: 0 }, {
    ...law,
    steelLaws: laws,
    angleSamples: 24
  })
  if (result.state) {
    const evaluated = evaluator(result.state).source
    for (const bar of evaluated.bars) {
      const limit = bar.strain < 0 ? bar.ultimateStrain : bar.compressionUltimateStrain
      if (limit !== undefined) {
        assert.ok(Math.abs(bar.strain) <= limit * (1 + 1e-9), `${bar.id}: ${bar.strain} versus ${limit}`)
      }
    }
  }
  return result
}

test('signed steel strain limits have one reader for every declared law shape', () => {
  assert.deepEqual(resolveSteelStrainLimits({}), { tension: undefined, compression: undefined })
  assert.deepEqual(resolveSteelStrainLimits({ ultimateStrain: 0.03 }), { tension: 0.03, compression: 0.03 })
  assert.deepEqual(
    resolveSteelStrainLimits({ ultimateStrain: 0.03, strainLimits: { tension: 0.045, compression: 0.02 } }),
    { tension: 0.045, compression: 0.02 }
  )
  assert.deepEqual(
    resolveSteelStrainLimits({ ultimateStrain: 0.03, strainLimits: { compression: 0.02 } }),
    { tension: 0.03, compression: 0.02 }
  )
  assert.deepEqual(
    resolveSteelStrainLimits({ ultimateStrain: 0.045, strainLimits: { tension: 0.045 } }),
    { tension: 0.045, compression: undefined },
    'A tensile cutoff must not become a compression bound.'
  )
  const limits = { tension: 0.045, compression: 0.02 }
  assert.equal(steelStrainLimitAt(limits, -1e-12), 0.045)
  assert.equal(steelStrainLimitAt(limits, 0), 0.02)
  assert.equal(steelStrainLimitAt(limits, 1e-12), 0.02)
})

test('forward bar evidence and Fixed-P filtering read the same signed limits', () => {
  const law = { stressAt, yieldStrain: 0.002, ultimateStrain: 0.009, strainLimits: { tension: 0.006 } }
  const { bars } = evaluateEquivalentBlock(section, block, { outer: law, inner: law }, {
    neutralAxisAngle: Math.PI / 2,
    neutralAxisDepth: 100
  })
  for (const bar of bars) {
    assert.equal(bar.ultimateStrain, 0.006)
    assert.equal(bar.compressionUltimateStrain, undefined)
  }
})

test('Fixed-P rejects equilibrium beyond the declared hardening tensile endpoint', () => {
  const laws = { outer: steel(0.006), inner: steel(0.006) }
  const pole = section.rebars.reduce((p, bar) => p + bar.area * laws.outer.stressAt(-0.006), 0)
  const result = solve(laws, 1.5 * pole)
  assert.equal(result.status, 'no-capacity')
  assert.equal(result.state, undefined)
  assert.equal(result.utilization, undefined)
})

test('Fixed-P retains a root on the tensile boundary and uses each grade limit', () => {
  const c = 450 / (1 + 0.009 / block.extremeCompressionStrain)
  const laws = { outer: steel(0.009), inner: steel(0.006) }
  const source = evaluateEquivalentBlock(section, block, laws, { neutralAxisAngle: Math.PI / 2, neutralAxisDepth: c })
  const result = solve(laws, source.resultants.P, source.resultants.Mx)
  assert.notEqual(result.status, 'no-capacity')
  assert.ok(result.state)
  assert.equal(
    solve({ outer: steel(0.009), inner: steel(0.004) }, source.resultants.P, source.resultants.Mx).status,
    'no-capacity',
    'The nearer inner grade can invalidate the root before the outermost grade.'
  )
})

test('Fixed-P uses actual point-C kinematics for physical compression bounds', () => {
  const laws = { outer: steel(0.05, 0.0025), inner: steel(0.03, 0.0025) }
  const law = { ...block, compressionPivotStrain: 0.002 }
  const source = evaluateEquivalentBlock(section, law, laws, { neutralAxisAngle: Math.PI / 2, neutralAxisDepth: 1000 })
  assert.ok(source.bars.every((bar) => bar.strain <= 0.0025))
  const result = solve(laws, source.resultants.P, source.resultants.Mx, 0.002)
  assert.notEqual(result.status, 'no-capacity')
  assert.ok(result.state)
  assert.equal(
    solve(laws, source.resultants.P, source.resultants.Mx).status,
    'no-capacity',
    'Without the compression pivot, the same load requires a root outside the physical compression bound.'
  )
})

test('Fixed-P fails closed on missing laws or invalid signed limits', () => {
  assert.throws(() => solve({ outer: steel(0.006) }, 0), /not registered/)
  assert.throws(() => solve({ outer: steel(NaN), inner: steel(0.006) }, 0), /invalid strain bound/)
})
