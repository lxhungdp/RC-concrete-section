import { performance } from 'node:perf_hooks'
import {
  buildDesignPreviewSurfaceFromPrepared,
  intersectSurfaceWithDemandRay,
  prepareAnalysis
} from '@pm/analysis'
import { createKdsBasicDesignBasis } from '@pm/design'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  ADAPTIVE_MAX_PASSES,
  createDefaultAnalysisOptions,
  type AnalysisOptions
} from '@pm/project'
import { BENCH_CASES } from '../../packages/pm-analysis/bench/sections'

const timed = <T>(run: () => T) => {
  run()
  const started = performance.now()
  const value = run()
  return { value, ms: performance.now() - started }
}

const fixed = (options: AnalysisOptions, directions: number): AnalysisOptions => {
  const result = structuredClone(options)
  result.stations.refinement = { type: 'fixed' }
  result.directions.seed = { type: 'uniform', count: directions, startDeg: 0 }
  result.directions.refinement = { type: 'fixed', probe: 'all' }
  return result
}

/**
 * Empirical regression envelope for the fixed 27 x 36 Preview surface against the independently
 * refined benchmark surface. These are not design-code acceptance tolerances and do not promote a
 * Preview result; they prevent the measured fixture envelope from silently getting worse.
 */
const MAX_UNDER_PREDICTION = 0.04
const MAX_OVER_PREDICTION = 0.005

/**
 * The benchmark reference densifies the direction lattice to 144 and independently refines each
 * meridian's station schedule. Holding the same 27 stations here would make the harness
 * structurally unable to detect meridian discretisation error.
 */
const referenceOptions = (): AnalysisOptions => {
  const result = fixed(createDefaultAnalysisOptions(), 144)
  result.samplingMode = 'adaptive'
  result.stations.refinement = {
    type: 'adaptive',
    tolerance: 0.0025,
    maxPasses: ADAPTIVE_MAX_PASSES,
    maxStations: 72
  }
  result.directions.refinement = {
    type: 'adaptive',
    tolerance: 0.0025,
    // `samplingMode` is one coherent mode. Zero direction passes retain the already dense fixed
    // 144-direction lattice while allowing the station refiner to operate independently.
    maxPasses: 0,
    maxDirections: 144,
    probe: 'all'
  }
  return result
}

const signedRelative = (actual: number, expected: number) =>
  (actual - expected) / Math.max(1, Math.abs(expected))

const reports: Array<Record<string, string | number | boolean>> = []
const failures: string[] = []

for (const fixture of BENCH_CASES.filter((item) => item.key !== 'tabulated-law').slice(0, 5)) {
  const section = sectionGeometryFromGeometryInput(fixture.geometry)
  const rebars = geometryInputRebars(fixture.geometry)
  const prepared = prepareAnalysis(section, rebars, fixture.materials)
  const design = createKdsBasicDesignBasis()
  const reference = timed(() => buildDesignPreviewSurfaceFromPrepared(
    prepared,
    fixture.materials,
    design,
    referenceOptions()
  ))
  const samples = reference.value.points.filter((point) => !point.isAxialCap)

  const candidates = [
    { name: 'unified-27x36-fixed', options: fixed(createDefaultAnalysisOptions(), 36) }
  ]

  for (const candidate of candidates) {
    const built = timed(() => buildDesignPreviewSurfaceFromPrepared(
      prepared,
      fixture.materials,
      design,
      candidate.options
    ))
    let maxUnderPrediction = 0
    let maxOverPrediction = 0
    let hits = 0
    let rays = 0
    const expectedLambda = 1 / 0.7
    for (const point of samples) {
      const demand = { P: 0.7 * point.P, Mx: 0.7 * point.Mx, My: 0.7 * point.My }
      if (Math.hypot(demand.P, demand.Mx, demand.My) < 1e-9) continue
      rays += 1
      const hit = intersectSurfaceWithDemandRay(built.value, demand)
      if (!hit) continue
      hits += 1
      const error = signedRelative(hit.lambda, expectedLambda)
      maxUnderPrediction = Math.max(maxUnderPrediction, -error)
      maxOverPrediction = Math.max(maxOverPrediction, error)
    }
    const report = {
      case: fixture.key,
      sampling: candidate.name,
      buildMs: built.ms,
      points: built.value.points.length,
      directions: built.value.directions.length,
      stations: built.value.stations.length,
      referencePoints: samples.length,
      referenceStations: reference.value.stations.length,
      maxUnderPrediction,
      maxOverPrediction,
      maxAbsoluteRayError: Math.max(maxUnderPrediction, maxOverPrediction),
      rayHitRate: hits / Math.max(1, rays),
      referenceStationWithinTolerance: reference.value.stationError.withinTolerance,
      referenceMs: reference.ms
    }
    reports.push(report)
    if (hits !== rays) failures.push(`${fixture.key}/${candidate.name}: missing ${rays - hits} of ${rays} ray intersections`)
    if (!reference.value.stationError.withinTolerance) {
      failures.push(`${fixture.key}: refined station reference did not reach its requested tolerance`)
    }
    if (maxUnderPrediction > MAX_UNDER_PREDICTION) {
      failures.push(
        `${fixture.key}/${candidate.name}: ${(100 * maxUnderPrediction).toFixed(3)}% under-prediction exceeds ` +
        `${(100 * MAX_UNDER_PREDICTION).toFixed(3)}% regression envelope`
      )
    }
    if (maxOverPrediction > MAX_OVER_PREDICTION) {
      failures.push(
        `${fixture.key}/${candidate.name}: ${(100 * maxOverPrediction).toFixed(3)}% over-prediction exceeds ` +
        `${(100 * MAX_OVER_PREDICTION).toFixed(3)}% regression envelope`
      )
    }
  }
}

console.table(reports.map((item) => ({
  case: item.case,
  sampling: item.sampling,
  'build ms': Number(item.buildMs).toFixed(1),
  points: item.points,
  dirs: item.directions,
  stations: item.stations,
  'reference points': item.referencePoints,
  'reference stations': item.referenceStations,
  'max under': `${(100 * Number(item.maxUnderPrediction)).toFixed(3)}%`,
  'max over': `${(100 * Number(item.maxOverPrediction)).toFixed(3)}%`,
  'reference station ok': item.referenceStationWithinTolerance
})))
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), reports, failures }, null, 2))
if (failures.length > 0) throw new Error(`Strain-domain sampling verification failed:\n${failures.join('\n')}`)
