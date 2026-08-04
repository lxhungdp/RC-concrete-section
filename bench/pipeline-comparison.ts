import { performance } from 'node:perf_hooks'
import { buildDesignPreviewSurface, intersectSurfaceWithDemandRay } from '@pm/analysis'
import {
  buildEquivalentBlockPreviewSurfaceFromPrepared,
  prepareBlockAnalysis
} from '@pm/analysis-equivalent-block'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  applyCalculationProfileToMaterials,
  createDefaultAnalysisOptions,
  createDefaultEquivalentBlockAnalysisOptions,
  createDesignBasisForCalculationProfile,
  type EquivalentBlockAnalysisOptions
} from '@pm/project'
import { BENCH_CASES } from '../packages/pm-analysis/src/bench/sections'

const timed = <T>(run: () => T) => {
  run()
  const started = performance.now()
  const value = run()
  return { value, ms: performance.now() - started }
}

const resampledStations = (count: number) => {
  const epsCu = 0.003
  const minRatio = 1 / (1 + 0.1 / epsCu)
  const maxRatio = 50
  return Array.from({ length: count }, (_, index) => {
    const ratio = Math.exp(Math.log(minRatio) + (Math.log(maxRatio) - Math.log(minRatio)) * index / (count - 1))
    return ratio <= 1
      ? { type: 'extreme-tension-strain' as const, strain: epsCu * (1 / ratio - 1) }
      : { type: 'depth-ratio' as const, ratio }
  })
}

const fixedBlockOptions = (stations: number, directions: number): EquivalentBlockAnalysisOptions => {
  const options = createDefaultEquivalentBlockAnalysisOptions()
  options.neutralAxisStations = {
    basedOn: 'custom',
    values: resampledStations(stations),
    refinement: { type: 'fixed' }
  }
  options.directions = { seedCount: directions, startDeg: 0, refinement: { type: 'fixed' } }
  return options
}

const relative = (actual: number, expected: number) => Math.abs(actual - expected) / Math.max(1, Math.abs(expected))
const reports: Array<Record<string, string | number>> = []
const failures: string[] = []

for (const fixture of BENCH_CASES.filter((item) => item.key !== 'tabulated-law').slice(0, 5)) {
  const section = sectionGeometryFromGeometryInput(fixture.geometry)
  const rebars = geometryInputRebars(fixture.geometry)
  const design = createDesignBasisForCalculationProfile('kds-142020-equivalent-block')
  const curveOptions = createDefaultAnalysisOptions()
  const curve = timed(() => buildDesignPreviewSurface(section, rebars, fixture.materials, design, undefined, curveOptions))
  const blockMaterials = applyCalculationProfileToMaterials(fixture.materials, 'kds-142020-equivalent-block')
  const prepared = prepareBlockAnalysis('kds-142020-equivalent-block', section, rebars, blockMaterials, design)
  const referenceOptions = fixedBlockOptions(96, 144)
  const reference = timed(() => buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, referenceOptions))
  const referenceSamples = reference.value.points.filter((point) => point.equivalentBlock)
    .filter((_, index, values) => index % Math.max(1, Math.floor(values.length / 48)) === 0)
    .slice(0, 48)

  const candidates = [
    { name: 'block-19x24-fixed', options: fixedBlockOptions(19, 24) },
    { name: 'block-37x24-fixed', options: fixedBlockOptions(37, 24) },
    { name: 'block-37x24-adaptive-0.75pct', options: createDefaultEquivalentBlockAnalysisOptions() }
  ]
  for (const candidate of candidates) {
    const built = timed(() => buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, candidate.options))
    let maxRayError = 0
    let hits = 0
    for (const point of referenceSamples) {
      const demand = { P: 0.7 * point.P, Mx: 0.7 * point.Mx, My: 0.7 * point.My }
      if (Math.hypot(demand.P, demand.Mx, demand.My) < 1e-9) continue
      const hit = intersectSurfaceWithDemandRay(built.value, demand)
      if (!hit) continue
      hits += 1
      maxRayError = Math.max(maxRayError, relative(hit.lambda, 1 / 0.7))
    }
    const directions = built.value.directions.length
    const stations = built.value.stations.length
    reports.push({
      case: fixture.key,
      pipeline: candidate.name,
      buildMs: built.ms,
      points: built.value.points.length,
      directions,
      stations,
      maxRayErrorVs96x144: maxRayError,
      rayHitRate: hits / Math.max(1, referenceSamples.length),
      curveBuildMs: curve.ms,
      curvePoints: curve.value.points.length,
      highResolutionBlockMs: reference.ms
    })
    if (hits !== referenceSamples.length) failures.push(`${fixture.key}/${candidate.name}: missing demand-ray intersections`)
    if (candidate.name.includes('adaptive') && maxRayError > 0.01) {
      failures.push(`${fixture.key}/${candidate.name}: ${maxRayError} ray error exceeds 1.5% acceptance`)
    }
  }
}

console.table(reports.map((item) => ({
  case: item.case,
  pipeline: item.pipeline,
  'build ms': Number(item.buildMs).toFixed(1),
  points: item.points,
  dirs: item.directions,
  stations: item.stations,
  'ray err': Number(item.maxRayErrorVs96x144).toExponential(2),
  'curve ms': Number(item.curveBuildMs).toFixed(1)
})))
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), reports, failures }, null, 2))
if (failures.length) throw new Error(`Pipeline benchmark verification failed:\n${failures.join('\n')}`)
