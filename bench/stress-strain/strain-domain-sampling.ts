import { performance } from 'node:perf_hooks'
import {
  buildDesignPreviewSurfaceFromPrepared,
  intersectSurfaceWithDemandRay,
  prepareAnalysis
} from '@pm/analysis'
import { createKdsBasicDesignBasis } from '@pm/design'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  createDefaultAnalysisOptions,
  createLegacyAnalysisOptions,
  type AnalysisOptions,
  type AnalysisStation
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
  result.directions.seed = { type: 'uniform', count: directions, startDeg: 0 }
  result.directions.refinement = { type: 'fixed', probe: 'all' }
  return result
}

/** Thirty-three transition nodes (including yield) and 144 angles form the benchmark reference. */
const referenceOptions = (): AnalysisOptions => {
  const result = fixed(createDefaultAnalysisOptions(), 144)
  const yieldIndex = result.stations.intermediate.findIndex(
    (station) => station.criterion.type === 'steel-stress-ratio' && station.criterion.ratio === 1
  )
  const afterTransition = result.stations.intermediate.filter(
    (station) => station.criterion.type !== 'strength-reduction-transition-ratio'
  )
  const transition: AnalysisStation[] = Array.from({ length: 32 }, (_, index) => ({
    id: 1000 + index,
    label: `benchmark phi transition ${index + 1}/32`,
    criterion: { type: 'strength-reduction-transition-ratio', ratio: (index + 1) / 32 }
  }))
  const insertion = Math.max(0, yieldIndex + 1)
  afterTransition.splice(insertion, 0, ...transition)
  result.stations = { basedOn: 'custom', intermediate: afterTransition }
  return result
}

const relative = (actual: number, expected: number) =>
  Math.abs(actual - expected) / Math.max(1, Math.abs(expected))

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
  const available = reference.value.points.filter((point) => !point.isAxialCap)
  const stride = Math.max(1, Math.floor(available.length / 96))
  const samples = available.filter((_, index) => index % stride === 0).slice(0, 96)

  const candidates = [
    { name: 'legacy-19x24-fixed', options: createLegacyAnalysisOptions() },
    { name: 'transition-25x36-fixed', options: fixed(createDefaultAnalysisOptions(), 36) },
    { name: 'production-25x36-adaptive', options: createDefaultAnalysisOptions() }
  ]

  let legacyError = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const built = timed(() => buildDesignPreviewSurfaceFromPrepared(
      prepared,
      fixture.materials,
      design,
      candidate.options
    ))
    let maxRayError = 0
    let hits = 0
    for (const point of samples) {
      const demand = { P: 0.7 * point.P, Mx: 0.7 * point.Mx, My: 0.7 * point.My }
      if (Math.hypot(demand.P, demand.Mx, demand.My) < 1e-9) continue
      const hit = intersectSurfaceWithDemandRay(built.value, demand)
      if (!hit) continue
      hits += 1
      maxRayError = Math.max(maxRayError, relative(hit.lambda, 1 / 0.7))
    }
    if (candidate.name === 'legacy-19x24-fixed') legacyError = maxRayError
    const report = {
      case: fixture.key,
      sampling: candidate.name,
      buildMs: built.ms,
      points: built.value.points.length,
      directions: built.value.directions.length,
      stations: built.value.stations.length,
      maxRayError,
      rayHitRate: hits / Math.max(1, samples.length),
      directionWithinTolerance: built.value.directionError.withinTolerance,
      referenceMs: reference.ms
    }
    reports.push(report)
    if (hits !== samples.length) failures.push(`${fixture.key}/${candidate.name}: missing ray intersections`)
    if (candidate.name === 'production-25x36-adaptive') {
      if (maxRayError > 0.0075) failures.push(`${fixture.key}/${candidate.name}: ray error exceeds 0.75%`)
      if (maxRayError > legacyError + 1e-12) failures.push(`${fixture.key}/${candidate.name}: less accurate than legacy`)
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
  'max ray error': `${(100 * Number(item.maxRayError)).toFixed(3)}%`,
  converged: item.directionWithinTolerance
})))
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), reports, failures }, null, 2))
if (failures.length > 0) throw new Error(`Strain-domain sampling verification failed:\n${failures.join('\n')}`)
