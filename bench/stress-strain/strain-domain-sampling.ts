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

/** The shared 22-station schedule and 144 fixed angles form the directional benchmark reference. */
const referenceOptions = (): AnalysisOptions => {
  return fixed(createDefaultAnalysisOptions(), 144)
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
    { name: 'unified-22x36-fixed', options: fixed(createDefaultAnalysisOptions(), 36) },
    { name: 'unified-22x36-adaptive', options: createDefaultAnalysisOptions() }
  ]

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
      stationWithinTolerance: built.value.stationError.withinTolerance,
      referenceMs: reference.ms
    }
    reports.push(report)
    if (hits !== samples.length) failures.push(`${fixture.key}/${candidate.name}: missing ray intersections`)
    if (candidate.name === 'unified-22x36-adaptive') {
      if (maxRayError > 0.0075) failures.push(`${fixture.key}/${candidate.name}: ray error exceeds 0.75%`)
      if (!built.value.directionError.withinTolerance || !built.value.stationError.withinTolerance) {
        failures.push(`${fixture.key}/${candidate.name}: station/direction chord tolerance was not reached`)
      }
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
  'direction ok': item.directionWithinTolerance,
  'station ok': item.stationWithinTolerance
})))
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), reports, failures }, null, 2))
if (failures.length > 0) throw new Error(`Strain-domain sampling verification failed:\n${failures.join('\n')}`)
