import { performance } from 'node:perf_hooks'
import { readFileSync } from 'node:fs'
import {
  buildDesignPreviewSurfaceFromPrepared,
  prepareAnalysis,
  type PreviewSurface
} from '@pm/analysis'
import {
  buildEquivalentBlockPreviewSurfaceFromPrepared,
  prepareBlockAnalysis
} from '@pm/analysis-equivalent-block'
import {
  buildResistanceMaterialSets,
  createKdsAppendixDesignBasis,
  createKdsBasicDesignBasis
} from '@pm/design'
import {
  geometryInputRebars,
  sectionGeometryFromGeometryInput,
  type GeometryInput
} from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import {
  applyCalculationProfileToMaterials,
  createAdaptiveAnalysisOptions,
  createAdaptiveEquivalentBlockAnalysisOptions,
  createDefaultAnalysisOptions,
  createDefaultEquivalentBlockAnalysisOptions,
  createDesignBasisForCalculationProfile,
  parseProjectDocument
} from '@pm/project'
import { BENCH_CASES } from '../packages/pm-analysis/bench/sections'
import { buildDirectMeridianSection } from '../apps/web/features/section-editor/results/surface-plot-geometry'

type SamplingResult = {
  mechanics: 'stress-strain' | 'equivalent-block'
  mode: 'fixed' | 'adaptive'
  medianMs: number
  points: number
  directions: number
  minStations: number
  averageStations: number
  maxStations: number
  evaluations: number
  tensionTransitionPoints: number
  averageTensionTransitionPoints: number
  maxTensionChordError: number
  stationOk: boolean
  directionOk: boolean
}

const median = (values: number[]) =>
  [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]

const measure = <T>(build: () => T, repeats = 3) => {
  build()
  const times: number[] = []
  let value!: T
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    const started = performance.now()
    value = build()
    times.push(performance.now() - started)
  }
  return { value, medianMs: median(times) }
}

const summarize = (
  mechanics: SamplingResult['mechanics'],
  mode: SamplingResult['mode'],
  measured: { value: PreviewSurface; medianMs: number }
): SamplingResult => {
  const transitionIds = new Set(measured.value.stations
    .filter((station) => station.definition.kind === 'tension-pole-transition-ratio')
    .map((station) => station.id))
  const tensionTransitionPoints = measured.value.points
    .filter((point) => point.stationId !== null && transitionIds.has(point.stationId)).length
  const transitionRatio = new Map(measured.value.stations.flatMap((station) =>
    station.definition.kind === 'tension-pole-transition-ratio'
      ? [[station.id, station.definition.ratio] as const]
      : []))
  const finalFinite = measured.value.stations
    .filter((station) => station.definition.kind === 'bar-tension-yield-ratio')
    .sort((left, right) => {
      const leftRatio = left.definition.kind === 'bar-tension-yield-ratio' ? left.definition.ratio : 0
      const rightRatio = right.definition.kind === 'bar-tension-yield-ratio' ? right.definition.ratio : 0
      return rightRatio - leftRatio
    })[0]
  const forceScale = Math.max(1, ...measured.value.points.map((point) => Math.abs(point.P)))
  const momentScale = Math.max(1, ...measured.value.points.map((point) => Math.hypot(point.Mx, point.My)))
  let maxTensionChordError = 0
  if (finalFinite) {
    const rows = new Map<number, typeof measured.value.points>()
    for (const point of measured.value.points) rows.set(point.beta, [...(rows.get(point.beta) ?? []), point])
    for (const row of rows.values()) {
      const left = row.find((point) => point.stationId === finalFinite.id)
      const right = row.find((point) => point.stationId === 'pure-tension')
      if (!left || !right) continue
      for (const point of row) {
        const ratio = point.stationId === null ? undefined : transitionRatio.get(point.stationId)
        if (ratio === undefined) continue
        const expectedP = left.P + ratio * (right.P - left.P)
        const expectedMx = left.Mx + ratio * (right.Mx - left.Mx)
        const expectedMy = left.My + ratio * (right.My - left.My)
        maxTensionChordError = Math.max(
          maxTensionChordError,
          Math.abs(point.P - expectedP) / forceScale,
          Math.hypot(point.Mx - expectedMx, point.My - expectedMy) / momentScale
        )
      }
    }
  }
  return {
    mechanics,
    mode,
    medianMs: measured.medianMs,
    points: measured.value.points.length,
    directions: measured.value.directions.length,
    minStations: measured.value.stationError.minStations ?? measured.value.stations.length,
    averageStations: measured.value.stationError.averageStations ?? measured.value.stations.length,
    maxStations: measured.value.stationError.maxStations ?? measured.value.stations.length,
    evaluations: measured.value.stationError.evaluations ?? measured.value.points.length,
    tensionTransitionPoints,
    averageTensionTransitionPoints: tensionTransitionPoints / Math.max(1, measured.value.directions.length),
    maxTensionChordError,
    stationOk: measured.value.stationError.withinTolerance,
    directionOk: measured.value.directionError.withinTolerance
  }
}

const projectArgument = process.argv.indexOf('--stress-project')
const projectPath = projectArgument >= 0 ? process.argv[projectArgument + 1] : undefined
const useProfileDefaultDesign = process.argv.includes('--profile-default-design')
const defaultStressFixture = BENCH_CASES.find((item) => item.key !== 'tabulated-law')
if (!defaultStressFixture) throw new Error('No stress-strain benchmark fixture is available.')
const parsedProject = projectPath ? parseProjectDocument(readFileSync(projectPath, 'utf8')) : undefined
if (parsedProject && !parsedProject.ok) throw new Error(`Cannot parse ${projectPath}: ${parsedProject.error}`)
if (parsedProject && parsedProject.document.inputs.calculationProfileId.includes('equivalent-block')) {
  throw new Error('--stress-project requires a stress-strain project.')
}
const stressGeometry = parsedProject?.document.inputs.geometry ?? defaultStressFixture.geometry
const stressMaterials = parsedProject?.document.inputs.materials ?? defaultStressFixture.materials
const stressDesign = parsedProject
  ? useProfileDefaultDesign
    ? createDesignBasisForCalculationProfile(parsedProject.document.inputs.calculationProfileId)
    : parsedProject.document.inputs.design
  : createKdsBasicDesignBasis()
const stressSection = sectionGeometryFromGeometryInput(stressGeometry)
const stressStateMaterials = buildResistanceMaterialSets(stressMaterials, stressDesign).stateMaterials
const stressPrepared = prepareAnalysis(
  stressSection,
  geometryInputRebars(stressGeometry),
  stressStateMaterials
)
const stressFixedOptions = createDefaultAnalysisOptions()
const stressAdaptiveOptions = createAdaptiveAnalysisOptions()

const defaultBlockGeometry: GeometryInput = {
  id: 1,
  name: '500 x 700 sampling benchmark column',
  outers: [{
    id: 1,
    points: [
      { id: 1, x: -250, y: -350 },
      { id: 2, x: 250, y: -350 },
      { id: 3, x: 250, y: 350 },
      { id: 4, x: -250, y: 350 }
    ],
    holes: []
  }],
  rebars: [
    [-190, -290], [190, -290], [190, 290], [-190, 290], [0, -290], [0, 290]
  ].map(([x, y], index) => ({
    id: index + 1,
    x,
    y,
    dia: 25,
    steelMaterialId: 1
  }))
}
const blockProfile = 'kds-142020-equivalent-block' as const
const useProjectBlock = process.argv.includes('--block-project')
if (useProjectBlock && !parsedProject) throw new Error('--block-project also requires --stress-project <file>.')
const blockGeometry = useProjectBlock ? stressGeometry : defaultBlockGeometry
const blockMaterials = applyCalculationProfileToMaterials(
  useProjectBlock ? stressMaterials : createDefaultMaterialStore(),
  blockProfile
)
const blockDesign = process.argv.includes('--block-material-factor')
  ? createKdsAppendixDesignBasis()
  : createDesignBasisForCalculationProfile(blockProfile)
const blockPrepared = prepareBlockAnalysis(
  blockProfile,
  sectionGeometryFromGeometryInput(blockGeometry),
  geometryInputRebars(blockGeometry),
  blockMaterials,
  blockDesign
)
const blockFixedOptions = createDefaultEquivalentBlockAnalysisOptions()
const blockAdaptiveOptions = createAdaptiveEquivalentBlockAnalysisOptions()

const results: SamplingResult[] = [
  summarize('stress-strain', 'fixed', measure(() => buildDesignPreviewSurfaceFromPrepared(
    stressPrepared,
    stressMaterials,
    stressDesign,
    stressFixedOptions
  ))),
  summarize('stress-strain', 'adaptive', measure(() => buildDesignPreviewSurfaceFromPrepared(
    stressPrepared,
    stressMaterials,
    stressDesign,
    stressAdaptiveOptions
  ))),
  summarize('equivalent-block', 'fixed', measure(() => buildEquivalentBlockPreviewSurfaceFromPrepared(
    blockPrepared,
    blockFixedOptions
  ))),
  summarize('equivalent-block', 'adaptive', measure(() => buildEquivalentBlockPreviewSurfaceFromPrepared(
    blockPrepared,
    blockAdaptiveOptions
  )))
]

if (process.argv.includes('--audit-vertical')) {
  const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(blockPrepared, blockFixedOptions)
  const poles = surface.points.filter((point) =>
    point.surfaceRole === 'pure-compression' || point.surfaceRole === 'pure-tension'
  )
  console.table(poles.map((point) => ({
    role: point.surfaceRole,
    PkN: point.P / 1_000,
    MxkNm: point.Mx / 1_000_000,
    MykNm: point.My / 1_000_000,
    betaDeg: point.beta * 180 / Math.PI,
    station: point.station
  })))
  console.table(Array.from({ length: 18 }, (_, index) => index * 10).map((angleDeg) => {
    const section = buildDirectMeridianSection(surface.points, angleDeg, true)
    const angle = angleDeg * Math.PI / 180
    const projected = section.displayPaths.flat().map((point) => ({
      m: (point.Mx * Math.cos(angle) + point.My * Math.sin(angle)) / 1_000_000,
      p: point.P / 1_000,
      role: point.surfaceRole
    }))
    const pMax = Math.max(...projected.map((point) => point.p))
    const pMin = Math.min(...projected.map((point) => point.p))
    const nearTop = projected.filter((point) => point.p >= pMax - 0.02 * (pMax - pMin))
    return {
      angleDeg,
      points: projected.length,
      pMax: pMax.toFixed(3),
      topPoints: nearTop.length,
      topMinM: Math.min(...nearTop.map((point) => point.m)).toFixed(3),
      topMaxM: Math.max(...nearTop.map((point) => point.m)).toFixed(3),
      compressionPoleM: projected
        .find((point) => point.role === 'pure-compression')?.m.toFixed(3) ?? 'missing'
    }
  }))
  const zeroHalf = buildDirectMeridianSection(surface.points, 0, false).displayPaths[0] ?? []
  console.table(zeroHalf.slice(0, 3).map((point, index) => ({
    index,
    role: point.surfaceRole,
    PkN: point.P / 1_000,
    MkNm: point.Mx / 1_000_000
  })))
  const zeroSection = buildDirectMeridianSection(surface.points, 0, true)
  const zeroPoints = [...zeroSection.primary, ...zeroSection.opposite]
    .map((point) => ({
      side: zeroSection.primary.includes(point) ? 'primary' : 'opposite',
      role: point.surfaceRole,
      stationId: point.stationId,
      station: point.station,
      cOverD: point.equivalentBlock
        ? point.equivalentBlock.neutralAxisDepth / point.equivalentBlock.projectedSectionDepth
        : null,
      PkN: point.P / 1_000,
      MkNm: point.Mx / 1_000_000
    }))
    .sort((left, right) => right.PkN - left.PkN)
  const zeroPMax = zeroPoints[0]?.PkN ?? 0
  const zeroPMin = zeroPoints.at(-1)?.PkN ?? zeroPMax
  console.table(zeroPoints.filter((point) => point.PkN >= zeroPMax - 0.05 * (zeroPMax - zeroPMin)))
}

const failures: string[] = []
for (const result of results) {
  if (result.mode === 'adaptive' && (!result.stationOk || !result.directionOk)) {
    failures.push(`${result.mechanics}/${result.mode}: refinement did not satisfy tolerance`)
  }
  if (result.mode === 'fixed' && (result.directions !== 36 || result.minStations !== 27 || result.maxStations !== 27)) {
    failures.push(`${result.mechanics}/${result.mode}: expected the exact editable 27 x 36 grid`)
  }
  const evaluationAmplification = result.evaluations / Math.max(1, result.points)
  const allowedAmplification = result.mechanics === 'stress-strain' ? 6 : 10
  if (evaluationAmplification >= allowedAmplification) {
    failures.push(
      `${result.mechanics}/${result.mode}: ${evaluationAmplification.toFixed(2)} evaluations/point indicates repeated row rebuilding`
    )
  }
}

const modeRatio = (mechanics: SamplingResult['mechanics']) => {
  const fixed = results.find((item) => item.mechanics === mechanics && item.mode === 'fixed')!
  const adaptive = results.find((item) => item.mechanics === mechanics && item.mode === 'adaptive')!
  return adaptive.medianMs / Math.max(0.001, fixed.medianMs)
}

const normalizedCostRatio = (mechanics: SamplingResult['mechanics']) => {
  const fixed = results.find((item) => item.mechanics === mechanics && item.mode === 'fixed')!
  const adaptive = results.find((item) => item.mechanics === mechanics && item.mode === 'adaptive')!
  const fixedCost = fixed.medianMs / Math.max(1, fixed.evaluations)
  const adaptiveCost = adaptive.medianMs / Math.max(1, adaptive.evaluations)
  return adaptiveCost / Math.max(0.000_001, fixedCost)
}

for (const mechanics of ['stress-strain', 'equivalent-block'] as const) {
  const ratio = normalizedCostRatio(mechanics)
  if (ratio > 3) {
    failures.push(`${mechanics}/adaptive: normalized evaluation cost is ${ratio.toFixed(2)}x fixed mode`)
  }
}

console.table(results.map((result) => ({
  mechanics: result.mechanics,
  mode: result.mode,
  'median ms': result.medianMs.toFixed(1),
  points: result.points,
  directions: result.directions,
  'stations min/avg/max': `${result.minStations}/${result.averageStations.toFixed(1)}/${result.maxStations}`,
  evaluations: result.evaluations,
  'eval/point': (result.evaluations / Math.max(1, result.points)).toFixed(2),
  'pure-tens avg': result.averageTensionTransitionPoints.toFixed(1),
  'pure-tens chord': `${(100 * result.maxTensionChordError).toFixed(2)}%`,
  'ms/eval': (result.medianMs / Math.max(1, result.evaluations)).toFixed(4),
  'station tolerance': result.mode === 'adaptive' ? result.stationOk : 'not probed',
  'direction tolerance': result.mode === 'adaptive' ? result.directionOk : 'not probed'
})))
console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  adaptiveToFixedTimeRatio: {
    stressStrain: modeRatio('stress-strain'),
    equivalentBlock: modeRatio('equivalent-block')
  },
  adaptiveToFixedNormalizedCostRatio: {
    stressStrain: normalizedCostRatio('stress-strain'),
    equivalentBlock: normalizedCostRatio('equivalent-block')
  },
  results,
  failures
}, null, 2))

if (failures.length > 0) {
  throw new Error(`Sampling-mode benchmark detected regressions:\n${failures.join('\n')}`)
}
