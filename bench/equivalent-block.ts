import { performance } from 'node:perf_hooks'
import { createAci318Model } from '@pm/code-aci318'
import { createKds142020Model } from '@pm/code-kds142020'
import {
  intersectCapacitySurfaceWithRay,
  prepareEquivalentBlockSection,
  solveFixedAxialCapacity,
  solveProportionalRayCapacity,
  type CapacityEvaluator,
  type CapacitySurface,
  type EquivalentBlockSection,
  type Point2,
  type PreparedEquivalentBlockSection
} from '@pm/equivalent-block'

type BenchModel = {
  bindDesignEvaluator: (section: PreparedEquivalentBlockSection) => CapacityEvaluator
  buildDesignSurface: (
    section: PreparedEquivalentBlockSection,
    options: {
      seedDirections?: number
      maxRefinementPasses?: number
      maxStationRefinementPasses?: number
      applyAxialCap?: boolean
    }
  ) => CapacitySurface
  axialCap: (section: PreparedEquivalentBlockSection) => number
  nominalEndpoints: (section: PreparedEquivalentBlockSection) => {
    compression: { resultants: { P: number; Mx: number; My: number } }
  }
}

type BenchCase = {
  name: string
  section: PreparedEquivalentBlockSection
}

const rectangle = (width: number, height: number, cx = 0, cy = 0): Point2[] => [
  { x: cx - width / 2, y: cy - height / 2 },
  { x: cx + width / 2, y: cy - height / 2 },
  { x: cx + width / 2, y: cy + height / 2 },
  { x: cx - width / 2, y: cy + height / 2 }
]

const bar = (id: string, x: number, y: number, area = 400) => ({ id, x, y, area, steelLawId: 'steel' })

const prepare = (
  solids: EquivalentBlockSection['solids'],
  rebars: EquivalentBlockSection['rebars']
) => prepareEquivalentBlockSection({
  solids,
  rebars,
  referencePoint: { x: 0, y: 0 },
  units: 'N-mm-MPa',
  signConvention: 'compression-positive'
})

const cases: BenchCase[] = [
  {
    name: 'rectangle-8-bars',
    section: prepare([{ outer: rectangle(400, 500) }], [
      bar('b1', -150, -200), bar('b2', 0, -200), bar('b3', 150, -200), bar('b4', 150, 0),
      bar('b5', 150, 200), bar('b6', 0, 200), bar('b7', -150, 200), bar('b8', -150, 0)
    ])
  },
  {
    name: 'hollow-8-bars',
    section: prepare([{ outer: rectangle(600, 500), holes: [rectangle(260, 180)] }], [
      bar('b1', -250, -200), bar('b2', 0, -200), bar('b3', 250, -200), bar('b4', 250, 0),
      bar('b5', 250, 200), bar('b6', 0, 200), bar('b7', -250, 200), bar('b8', -250, 0)
    ])
  },
  {
    name: 'L-shape-8-bars',
    section: prepare([{ outer: [
      { x: -300, y: -250 }, { x: 300, y: -250 }, { x: 300, y: -50 },
      { x: -50, y: -50 }, { x: -50, y: 300 }, { x: -300, y: 300 }
    ] }], [
      bar('b1', -250, -200), bar('b2', 0, -200), bar('b3', 250, -200), bar('b4', -250, 0),
      bar('b5', -250, 250), bar('b6', -100, -100), bar('b7', 100, -100), bar('b8', -100, 100)
    ])
  },
  {
    name: 'two-islands-8-bars',
    section: prepare([
      { outer: rectangle(220, 440, -200, 0) },
      { outer: rectangle(220, 440, 200, 0) }
    ], [
      bar('l1', -260, -170), bar('l2', -140, -170), bar('l3', -140, 170), bar('l4', -260, 170),
      bar('r1', 140, -170), bar('r2', 260, -170), bar('r3', 260, 170), bar('r4', 140, 170)
    ])
  }
]

const models: Array<{ standard: string; model: BenchModel }> = [
  {
    standard: 'KDS 14 20 20:2022',
    model: createKds142020Model({
      concreteStrength: 40,
      steel: { steel: { elasticModulus: 200_000, yieldStress: 420 } },
      transverseReinforcement: 'other'
    })
  },
  {
    standard: 'ACI 318-19(22)',
    model: createAci318Model({
      concreteStrength: 40,
      steel: { steel: { elasticModulus: 200_000, yieldStress: 420 } },
      transverseReinforcement: 'tied'
    })
  }
]

const median = (values: number[]) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]

const timeLoop = (iterations: number, run: (index: number) => void) => {
  const started = performance.now()
  for (let index = 0; index < iterations; index += 1) run(index)
  return performance.now() - started
}

const relativeError = (actual: number, expected: number) =>
  Math.abs(actual - expected) / Math.max(1, Math.abs(expected))

const results: Array<Record<string, string | number>> = []
const verificationFailures: string[] = []

for (const { standard, model } of models) {
  for (const item of cases) {
    const evaluator = model.bindDesignEvaluator(item.section)
    const states = Array.from({ length: 120 }, (_, index) => ({
      neutralAxisAngle: 2 * Math.PI * (index % 24) / 24 + 0.003,
      neutralAxisDepth: item.section.characteristicLength * (0.04 + 4 * ((index % 17) / 16) ** 2)
    }))
    for (let index = 0; index < 200; index += 1) evaluator(states[index % states.length])
    let checksum = 0
    const forwardIterations = 5_000
    const forwardMs = timeLoop(forwardIterations, (index) => {
      const resultants = evaluator(states[index % states.length]).resultants
      checksum += resultants.P * 1e-9 + resultants.Mx * 1e-12 + resultants.My * 1e-12
    })

    let surface!: CapacitySurface
    const surfaceTimes: number[] = []
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const started = performance.now()
      surface = model.buildDesignSurface(item.section, {
        seedDirections: 36,
        maxRefinementPasses: 0,
        maxStationRefinementPasses: 0
      })
      surfaceTimes.push(performance.now() - started)
    }
    if (!surface.topology.closed) verificationFailures.push(`${standard}/${item.name}: open surface`)
    const adaptiveStarted = performance.now()
    const adaptiveSurface = model.buildDesignSurface(item.section, {})
    const adaptiveSurfaceMs = performance.now() - adaptiveStarted
    if (!adaptiveSurface.topology.closed) verificationFailures.push(`${standard}/${item.name}: open adaptive surface`)
    if (!adaptiveSurface.directionRefinementConverged) {
      verificationFailures.push(`${standard}/${item.name}: adaptive direction refinement did not converge`)
    }
    if (!adaptiveSurface.stationRefinementConverged) {
      verificationFailures.push(`${standard}/${item.name}: adaptive station refinement did not converge`)
    }

    const raySamples = Array.from({ length: 80 }, (_, index) => {
      const state = {
        neutralAxisAngle: 2 * Math.PI * index / 80 + 0.017,
        neutralAxisDepth: item.section.characteristicLength * (0.12 + 0.50 * ((index % 11) / 10))
      }
      const exact = evaluator(state)
      const expectedFactor = 1.25
      return {
        expectedFactor,
        demand: {
          P: exact.resultants.P / expectedFactor,
          Mx: exact.resultants.Mx / expectedFactor,
          My: exact.resultants.My / expectedFactor
        }
      }
    })
    let rayHits = 0
    let maxMeshRayError = 0
    const rayMs = timeLoop(raySamples.length, (index) => {
      const sample = raySamples[index]
      const hit = intersectCapacitySurfaceWithRay(surface, sample.demand)
      if (!hit) return
      rayHits += 1
      maxMeshRayError = Math.max(maxMeshRayError, relativeError(hit.loadFactor, sample.expectedFactor))
    })

    let maxRefinedError = 0
    let maxResidual = 0
    let maxAdaptiveToRefinedError = 0
    let capFaceSolutions = 0
    const inverseCount = 12
    const inverseMs = timeLoop(inverseCount, (index) => {
      const sample = raySamples[index * 5]
      const solved = solveProportionalRayCapacity(adaptiveSurface, sample.demand, evaluator)
      if (solved.status === 'cap-face-governed') {
        capFaceSolutions += 1
        return
      }
      if (solved.status !== 'converged') {
        verificationFailures.push(`${standard}/${item.name}: proportional inverse ${solved.status}`)
        return
      }
      maxRefinedError = Math.max(maxRefinedError, relativeError(solved.loadFactor!, sample.expectedFactor))
      maxAdaptiveToRefinedError = Math.max(
        maxAdaptiveToRefinedError,
        relativeError(solved.surfaceIntersection!.loadFactor, solved.loadFactor!)
      )
      maxResidual = Math.max(maxResidual, solved.residualNorm ?? 0)
    })

    const fixedKnown = evaluator({
      neutralAxisAngle: 0.47,
      neutralAxisDepth: item.section.characteristicLength * 0.55
    })
    const fixedStarted = performance.now()
    const fixed = solveFixedAxialCapacity(
      item.section,
      evaluator,
      fixedKnown.resultants.P,
      { Mx: fixedKnown.resultants.Mx, My: fixedKnown.resultants.My },
      { angleSamples: 48, depthSamples: 72, axialCap: model.axialCap(item.section) }
    )
    const fixedMs = performance.now() - fixedStarted
    const fixedError = fixed.capacityFactor === undefined ? Number.POSITIVE_INFINITY : relativeError(fixed.capacityFactor, 1)
    if (maxResidual > 1e-7) {
      verificationFailures.push(`${standard}/${item.name}: refined inverse accuracy`)
    }
    if (rayHits !== raySamples.length) {
      verificationFailures.push(`${standard}/${item.name}: missing ray intersections`)
    }
    if (fixed.status === 'no-capacity' || fixedError > 5e-4) {
      verificationFailures.push(`${standard}/${item.name}: fixed-P accuracy/status ${fixed.status}`)
    }

    results.push({
      standard,
      case: item.name,
      forwardKopsPerSec: forwardIterations / forwardMs,
      surfaceMsMedian: median(surfaceTimes),
      adaptiveSurfaceMs,
      adaptiveDirections: adaptiveSurface.directions.length,
      adaptivePoints: adaptiveSurface.points.length,
      adaptiveDirectionalError: adaptiveSurface.maxDirectionalInterpolationError,
      adaptiveStationError: adaptiveSurface.maxStationInterpolationError,
      adaptiveDirectionConverged: adaptiveSurface.directionRefinementConverged ? 1 : 0,
      adaptiveStationConverged: adaptiveSurface.stationRefinementConverged ? 1 : 0,
      surfacePoints: surface.points.length,
      surfaceTriangles: surface.triangles.length,
      degenerateTriangles: surface.topology.degenerateTriangles,
      rayQueriesPerSec: raySamples.length / rayMs * 1_000,
      rayHitRate: rayHits / raySamples.length,
      maxCoarseRayRelError: maxMeshRayError,
      inverseMsPerSolve: inverseMs / inverseCount,
      maxBranchFactorDrift: maxRefinedError,
      maxAdaptiveToRefinedError,
      maxRefinedResidual: maxResidual,
      capFaceSolutions,
      fixedMs,
      fixedRelError: fixedError,
      nominalP0: model.nominalEndpoints(item.section).compression.resultants.P,
      axialCap: model.axialCap(item.section),
      checksum
    })
  }
}

console.table(results.map((result) => ({
  standard: result.standard,
  case: result.case,
  'forward k/s': Number(result.forwardKopsPerSec).toFixed(1),
  'surface ms': Number(result.surfaceMsMedian).toFixed(2),
  'adaptive ms': Number(result.adaptiveSurfaceMs).toFixed(2),
  'adaptive dirs': result.adaptiveDirections,
  'ray q/s': Number(result.rayQueriesPerSec).toFixed(0),
  'coarse ray err': Number(result.maxCoarseRayRelError).toExponential(2),
  'inverse ms': Number(result.inverseMsPerSolve).toFixed(2),
  'LM residual': Number(result.maxRefinedResidual).toExponential(2),
  'adaptive→LM': Number(result.maxAdaptiveToRefinedError).toExponential(2),
  'cap hits': result.capFaceSolutions,
  'fixed ms': Number(result.fixedMs).toFixed(2),
  'fixed err': Number(result.fixedRelError).toExponential(2)
})))
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results, verificationFailures }, null, 2))

if (verificationFailures.length > 0) {
  throw new Error(`Equivalent-block benchmark verification failed:\n${verificationFailures.join('\n')}`)
}
