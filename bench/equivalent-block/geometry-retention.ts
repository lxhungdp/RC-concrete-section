import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { createAci318Model } from '@pm/code-aci318'
import {
  bindEquivalentBlockForwardEvaluator,
  buildCapacitySurface,
  prepareEquivalentBlockSection,
  type CapacitySurface,
  type Point2
} from '@pm/equivalent-block'

const circle = (radius: number, count: number): Point2[] => Array.from({ length: count }, (_, index) => {
  const angle = 2 * Math.PI * index / count
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
})

const section = prepareEquivalentBlockSection({
  solids: [{ outer: circle(450, 96), holes: [circle(170, 48).reverse()] }],
  rebars: Array.from({ length: 24 }, (_, index) => {
    const angle = 2 * Math.PI * index / 24
    return {
      id: `b${index + 1}`,
      x: 360 * Math.cos(angle),
      y: 360 * Math.sin(angle),
      area: 500,
      steelLawId: 'steel'
    }
  }),
  referencePoint: { x: 0, y: 0 },
  units: 'N-mm-MPa',
  signConvention: 'compression-positive'
})

const model = createAci318Model({
  concreteStrength: 40,
  steel: { steel: { elasticModulus: 200_000, yieldStress: 420 } },
  transverseReinforcement: 'tied'
})
const surfaceOptions = {
  seedDirections: 36,
  maxRefinementPasses: 0,
  maxStationRefinementPasses: 0
} as const

const buildFull = (): CapacitySurface => {
  const endpoints = model.designEndpoints(section)
  return buildCapacitySurface(section, model.bindDesignEvaluator(section), {
    ...surfaceOptions,
    steelLaws: model.steelLaws,
    barStrainEvents: [],
    extremeCompressionStrain: model.blockLaw.extremeCompressionStrain,
    tensionPole: endpoints.tension,
    compressionPole: endpoints.compression
  })
}
const buildCompact = () => model.buildDesignSurface(section, { ...surfaceOptions, applyAxialCap: false })

const fullReference = buildFull()
const compactReference = buildCompact()
assert.deepEqual(compactReference, fullReference)

const median = (values: number[]) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]
const timings = { full: [] as number[], compact: [] as number[] }
for (let repeat = 0; repeat < 7; repeat += 1) {
  const order = repeat % 2 === 0 ? ['full', 'compact'] as const : ['compact', 'full'] as const
  for (const kind of order) {
    const started = performance.now()
    const surface = kind === 'full' ? buildFull() : buildCompact()
    timings[kind].push(performance.now() - started)
    assert.deepEqual(surface, fullReference)
  }
}

const fullEvaluator = bindEquivalentBlockForwardEvaluator(section, model.blockLaw, model.steelLaws)
const compactEvaluator = bindEquivalentBlockForwardEvaluator(section, model.blockLaw, model.steelLaws, {
  retainConcreteGeometry: false
})
let retainedFullVertices = 0
let retainedCompactVertices = 0
for (let direction = 0; direction < 36; direction += 1) {
  for (let station = 1; station <= 27; station += 1) {
    const state = {
      neutralAxisAngle: 2 * Math.PI * direction / 36,
      neutralAxisDepth: section.characteristicLength * station / 14
    }
    const full = fullEvaluator(state)
    const compact = compactEvaluator(state)
    assert.deepEqual(compact.resultants, full.resultants)
    retainedFullVertices += full.concrete.geometry.reduce(
      (sum, solid) => sum + solid.outer.length + solid.holes.reduce((holeSum, hole) => holeSum + hole.length, 0),
      0
    )
    retainedCompactVertices += compact.concrete.geometry.length
  }
}

const fullMs = median(timings.full)
const compactMs = median(timings.compact)
console.table([{
  case: '96-vertex hollow circle / 24 bars / 36x27 surface',
  'full geometry ms': fullMs.toFixed(2),
  'resultants-only ms': compactMs.toFixed(2),
  speedup: `${(fullMs / compactMs).toFixed(2)}x`,
  'retained clipped vertices': retainedFullVertices,
  'compact retained vertices': retainedCompactVertices,
  fidelity: 'bit-identical surface'
}])
