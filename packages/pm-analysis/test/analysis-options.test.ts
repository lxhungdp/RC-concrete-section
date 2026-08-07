import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { compileSteelMaterial, type MaterialStore, type SteelMaterial } from '@pm/materials'
import {
  cloneAnalysisOptions,
  createDefaultAnalysisOptions,
  createDefaultEquivalentBlockAnalysisOptions,
  parseProjectDocument,
  serializeProjectDocument,
  UNIFIED_DEPTH_RATIOS,
  UNIFIED_STATION_COUNT,
  UNIFIED_STATION_SCHEDULE,
  UNIFIED_STEEL_STRAIN_YIELD_RATIOS,
  type AnalysisOptions
} from '@pm/project'
import {
  AnalysisInputError,
  analysisStations,
  buildDesignPreviewSurfaceFromPrepared,
  buildExactDirectionCurveFromPrepared,
  buildPreviewSurface,
  buildPreviewSurfaceFromPrepared,
  prepareAnalysis,
  sliceFixedDesignPContour,
  sliceFixedPContour
} from '../src/index'
import { referenceProjectDocument } from './fixtures/reference-case'

const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const materials = document.inputs.materials
const prepared = prepareAnalysis(section, rebars, materials)

const explicitOptions = (): AnalysisOptions => ({
  optionsVersion: 1,
  methodId: 'strain-domain-surface-v1',
  stations: {
    basedOn: 'custom',
    refinement: { type: 'fixed' },
    intermediate: [
      { id: 11, label: 'NA at 2c₁', criterion: { type: 'c-over-c1', ratio: 2 } },
      { id: 22, label: 'Half design yield stress', criterion: { type: 'steel-stress-ratio', ratio: 0.5 } },
      { id: 33, label: 'Steel strain -0.01', criterion: { type: 'steel-strain', strain: -0.01 } }
    ]
  },
  directions: {
    seed: { type: 'explicit', anglesDeg: [5, 20, 75, 160, 250] },
    refinement: { type: 'fixed', probe: { stationIds: [22] } }
  },
  mesh: createDefaultAnalysisOptions().mesh
})

const controllingBarStrain = (
  point: { beta: number; state: { e0: number; kx: number; ky: number } }
) => {
  const c = Math.cos(point.beta)
  const s = Math.sin(point.beta)
  const control = rebars.reduce((best, bar) => {
    const projection = bar.y * c + bar.x * s
    return projection < best.projection ? { bar, projection } : best
  }, { bar: rebars[0], projection: Number.POSITIVE_INFINITY }).bar
  return point.state.e0 + point.state.kx * control.y + point.state.ky * control.x
}

test('the canonical default uses the fixed 27-by-36 production grid without probes', () => {
  const implicit = buildPreviewSurfaceFromPrepared(prepared)
  const defaults = createDefaultAnalysisOptions()
  const explicit = buildPreviewSurfaceFromPrepared(prepared, defaults)

  assert.equal(defaults.stations.intermediate.length + 2, UNIFIED_STATION_COUNT)
  assert.equal(explicit.stations.filter((station) => station.fixed).length, UNIFIED_STATION_COUNT)
  assert.equal(explicit.stations.length, UNIFIED_STATION_COUNT)
  assert.equal(defaults.stations.refinement.type, 'fixed')
  assert.equal(defaults.directions.refinement.type, 'fixed')
  assert.ok(Number.isNaN(explicit.stationError.maxRelative))
  assert.ok(Number.isNaN(explicit.directionError.maxRelativeComponent))
  assert.equal(explicit.stationError.refinementPasses, 0)
  assert.equal(explicit.directionError.refinementPasses, 0)
  assert.equal(defaults.directions.seed.type, 'uniform')
  assert.equal(defaults.directions.seed.type === 'uniform' ? defaults.directions.seed.count : 0, 36)
  assert.equal(explicit.directions.length, 36)
  assert.equal(explicit.points.length, explicit.stations.length * explicit.directions.length)
  assert.deepEqual(
    explicit.points.map(({ P, Mx, My, state }) => ({ P, Mx, My, state })),
    implicit.points.map(({ P, Mx, My, state }) => ({ P, Mx, My, state }))
  )
})

test('the production Fixed-P helper ignores adaptive Design vertices', () => {
  const surface = buildDesignPreviewSurfaceFromPrepared(
    prepared,
    materials,
    document.inputs.design,
    createDefaultAnalysisOptions()
  )
  assert.ok(surface.designFixed)
  const expected = sliceFixedPContour(
    surface.designFixed!.points,
    0,
    surface.designFixed!.triangles
  )
  const actual = sliceFixedDesignPContour({ ...surface, points: [] }, 0)
  assert.ok(actual.length > 0)
  assert.deepEqual(actual, expected)
})

test('stress-strain and equivalent-stress serialize the exact same 25 intermediate criteria', () => {
  const stressStrain = createDefaultAnalysisOptions()
  const equivalentStress = createDefaultEquivalentBlockAnalysisOptions()

  assert.equal(stressStrain.stations.basedOn, UNIFIED_STATION_SCHEDULE)
  assert.equal(equivalentStress.neutralAxisStations.basedOn, UNIFIED_STATION_SCHEDULE)
  assert.deepEqual(stressStrain.stations.refinement, { type: 'fixed' })
  assert.deepEqual(equivalentStress.neutralAxisStations.refinement, stressStrain.stations.refinement)
  assert.equal(equivalentStress.directions.seedCount, 36)
  assert.equal(equivalentStress.directions.refinement.type, 'fixed')
  assert.deepEqual(
    equivalentStress.neutralAxisStations.values,
    stressStrain.stations.intermediate.map((station) => station.criterion)
  )
})

test('an exact stress-strain direction uses no angular interpolation and keeps its fixed references separate', () => {
  const beta = 17.35 * Math.PI / 180
  const curve = buildExactDirectionCurveFromPrepared(
    prepared,
    materials,
    document.inputs.design,
    createDefaultAnalysisOptions(),
    beta
  )

  assert.ok(Math.abs(curve.beta - beta) < 1e-14)
  assert.equal(curve.designFixed.length, UNIFIED_STATION_COUNT)
  assert.equal(curve.nominalFixed.length, UNIFIED_STATION_COUNT)
  assert.equal(curve.designAdaptive.length, UNIFIED_STATION_COUNT)
  assert.equal(curve.stations.filter((station) => station.fixed).length, UNIFIED_STATION_COUNT)
  assert.ok(curve.designAdaptive.every((point) => Math.abs(point.beta - beta) < 1e-14))
  assert.ok(curve.designFixed.every((point) => point.stationId?.startsWith('adaptive-') !== true))
  assert.ok(Number.isNaN(curve.stationError.maxRelative))
})

test('the controlling-bar branch resolves the canonical yield-strain multiples', () => {
  const sd500: MaterialStore = {
    ...materials,
    steel: materials.steel.map((steel) => ({
      ...steel,
      fy: 500,
      limits: { ...steel.limits, epsY: 500 / steel.elasticModulus }
    }))
  }
  const sd500Prepared = prepareAnalysis(section, rebars, sd500)
  const options = createDefaultAnalysisOptions()
  options.stations.refinement = { type: 'fixed' }
  options.directions.refinement = { type: 'fixed', probe: 'all' }
  const strainStations = analysisStations(options)
    .map((station, index) => ({ station, index }))
    .filter(({ station }) => station.definition.kind === 'bar-tension-yield-ratio')
  assert.equal(strainStations.length, UNIFIED_STEEL_STRAIN_YIELD_RATIOS.length)

  const surface = buildPreviewSurfaceFromPrepared(sd500Prepared, options)
  const epsY = 500 / sd500.steel[0].elasticModulus
  strainStations.forEach(({ station, index }, ratioIndex) => {
    assert.equal(station.definition.kind, 'bar-tension-yield-ratio')
    const point = surface.points.find((candidate) => candidate.station === index && candidate.beta === 0)
    assert.ok(point)
    assert.ok(
      Math.abs(Math.abs(controllingBarStrain(point)) - UNIFIED_STEEL_STRAIN_YIELD_RATIOS[ratioIndex] * epsY) < 1e-12
    )
  })
  assert.deepEqual(
    options.stations.intermediate.slice(0, UNIFIED_DEPTH_RATIOS.length).map((item) =>
      item.criterion.type === 'depth-ratio' ? item.criterion.ratio : Number.NaN),
    [...UNIFIED_DEPTH_RATIOS]
  )
})

test('an explicit nonuniform grid and custom schedule flow through the engine unchanged', () => {
  const options = explicitOptions()
  const surface = buildPreviewSurfaceFromPrepared(prepared, options)

  assert.equal(surface.stations.length, 5)
  assert.equal(surface.points.length, 5 * 5)
  assert.deepEqual(surface.stations.map((station) => station.id), [
    'pure-compression',
    'station-11',
    'station-22',
    'station-33',
    'pure-tension'
  ])
  assert.deepEqual(
    surface.directions.map((beta) => Number(((beta * 180) / Math.PI).toFixed(12))),
    [5, 20, 75, 160, 250]
  )
  assert.deepEqual(surface.analysisOptions, options)
  assert.notEqual(surface.analysisOptions, options, 'results must own a snapshot, not mutable UI state')
})

test('adaptive refinement retains every custom seed direction and uses the custom station count', () => {
  const options = explicitOptions()
  options.directions.refinement = {
    type: 'adaptive',
    tolerance: 1e-9,
    maxPasses: 1,
    maxDirections: 10,
    probe: 'all'
  }
  const surface = buildPreviewSurfaceFromPrepared(prepared, options)
  const degrees = surface.directions.map((beta) => Number(((beta * 180) / Math.PI).toFixed(12)))

  for (const seed of [5, 20, 75, 160, 250]) assert.ok(degrees.includes(seed), `lost seed direction ${seed}°`)
  assert.ok(surface.directions.length > 5)
  assert.ok(surface.directions.length <= 10)
  assert.equal(surface.points.length, surface.directions.length * 5)
  assert.equal(surface.directionError.probedStationIds.length, 3)
})

test('fₛ/fyd is inverted against the compiled nonlinear steel law, not approximated as f/E', () => {
  const nonlinearSteel: SteelMaterial = {
    ...materials.steel[0],
    name: 'Nonlinear pre-yield test law',
    standard: 'CUSTOM',
    limits: { epsY: 0.002, epsU: 0.05 },
    stressStrain: {
      type: 'user-curve',
      interpolation: 'linear',
      points: [
        { strain: -0.05, stress: -400 },
        { strain: -0.002, stress: -400 },
        { strain: -0.0005, stress: -200 },
        { strain: 0, stress: 0 },
        { strain: 0.0005, stress: 200 },
        { strain: 0.002, stress: 400 },
        { strain: 0.05, stress: 400 }
      ]
    }
  }
  const store: MaterialStore = { ...materials, steel: [nonlinearSteel] }
  const options = explicitOptions()
  const surface = buildPreviewSurface(section, rebars, store, {}, options)
  const stationIndex = surface.stations.findIndex((station) => station.id === 'station-22')
  const beta = (5 * Math.PI) / 180
  const point = surface.points.find(
    (candidate) => candidate.station === stationIndex && Math.abs(candidate.beta - beta) <= 1e-12
  )
  assert.ok(point)

  const strain = controllingBarStrain(point)
  const compiled = compileSteelMaterial(nonlinearSteel)
  const target = -0.5 * Math.abs(compiled.stress(-0.002))
  assert.ok(Math.abs(strain - -0.0005) <= 1e-12, `resolved strain ${strain} is not the nonlinear inverse`)
  assert.ok(Math.abs(compiled.stress(strain) - target) <= 1e-9)
  assert.ok(Math.abs(strain - -0.001) > 1e-4, 'the test law must distinguish inversion from f/E')
})

test('an ambiguous nonmonotone tensile steel branch is rejected', () => {
  const steel: SteelMaterial = {
    ...materials.steel[0],
    standard: 'CUSTOM',
    limits: { epsY: 0.002, epsU: 0.05 },
    stressStrain: {
      type: 'user-curve',
      interpolation: 'linear',
      points: [
        { strain: -0.05, stress: -400 },
        { strain: -0.002, stress: -400 },
        { strain: -0.001, stress: -100 },
        { strain: -0.0005, stress: -250 },
        { strain: 0, stress: 0 },
        { strain: 0.05, stress: 400 }
      ]
    }
  }
  const store: MaterialStore = { ...materials, steel: [steel] }

  assert.throws(
    () => buildPreviewSurface(section, rebars, store, {}, explicitOptions()),
    (error: unknown) =>
      error instanceof AnalysisInputError &&
      error.code === 'INVALID_ANALYSIS_OPTIONS' &&
      error.message.includes('not monotone')
  )
})

test('a station order that reverses controlling steel strain is rejected', () => {
  const options = explicitOptions()
  options.stations.intermediate = [
    options.stations.intermediate[1],
    options.stations.intermediate[0],
    options.stations.intermediate[2]
  ]

  assert.throws(
    () => buildPreviewSurfaceFromPrepared(prepared, options),
    (error: unknown) => error instanceof AnalysisInputError && error.code === 'INVALID_ANALYSIS_OPTIONS'
  )
})

test('analysis options are required and round-trip exactly in project JSON', () => {
  const customDocument = referenceProjectDocument()
  customDocument.inputs.analysis = cloneAnalysisOptions(explicitOptions())
  const parsed = parseProjectDocument(serializeProjectDocument(customDocument))
  assert.ok(parsed.ok)
  if (parsed.ok) assert.deepEqual(parsed.document.inputs.analysis, explicitOptions())

  const missing = JSON.parse(serializeProjectDocument(customDocument)) as Record<string, unknown>
  const inputs = missing.inputs as Record<string, unknown>
  delete inputs.analysis
  const rejected = parseProjectDocument(JSON.stringify(missing))
  assert.equal(rejected.ok, false, 'the new format intentionally does not infer legacy defaults')

  const incomplete = referenceProjectDocument()
  const unified = createDefaultAnalysisOptions()
  unified.stations.intermediate.pop()
  incomplete.inputs.analysis = unified
  const rejectedUnified = parseProjectDocument(serializeProjectDocument(incomplete))
  assert.equal(rejectedUnified.ok, false, 'the canonical profile must retain all 27 stations')
})

test('legacy canonical station schedules migrate to fixed unified-27-v2', () => {
  for (const legacyId of ['unified-22-v1', 'transition-aware-p0-p24-v1']) {
    const legacy = JSON.parse(serializeProjectDocument(referenceProjectDocument())) as {
      inputs: { analysis: Record<string, unknown> }
    }
    const analysis = legacy.inputs.analysis
    const stations = analysis.stations as Record<string, unknown>
    const directions = analysis.directions as Record<string, unknown>
    stations.basedOn = legacyId
    stations.intermediate = []
    stations.refinement = { type: 'adaptive', tolerance: 0.005, maxPasses: 6, maxStations: 48 }
    directions.refinement = { type: 'adaptive', tolerance: 0.005, maxPasses: 6, maxDirections: 360, probe: 'all' }

    const parsed = parseProjectDocument(JSON.stringify(legacy))
    assert.equal(parsed.ok, true, legacyId)
    if (!parsed.ok || parsed.document.inputs.analysis.methodId !== 'strain-domain-surface-v1') continue
    assert.equal(parsed.document.inputs.analysis.stations.basedOn, UNIFIED_STATION_SCHEDULE)
    assert.equal(parsed.document.inputs.analysis.stations.intermediate.length + 2, UNIFIED_STATION_COUNT)
    assert.deepEqual(parsed.document.inputs.analysis.stations.refinement, { type: 'fixed' })
    assert.deepEqual(parsed.document.inputs.analysis.directions.refinement, { type: 'fixed', probe: 'all' })
  }
})
