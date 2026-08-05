import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { compileSteelMaterial, type MaterialStore, type SteelMaterial } from '@pm/materials'
import { createAci318DesignBasis, createKdsBasicDesignBasis } from '@pm/design'
import {
  cloneAnalysisOptions,
  createDefaultAnalysisOptions,
  parseProjectDocument,
  serializeProjectDocument,
  type AnalysisOptions
} from '@pm/project'
import {
  AnalysisInputError,
  analysisStations,
  buildPreviewSurface,
  buildPreviewSurfaceFromPrepared,
  prepareAnalysis
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

test('the canonical default is the transition-aware 25-station surface with 36 seed directions', () => {
  const implicit = buildPreviewSurfaceFromPrepared(prepared)
  const defaults = createDefaultAnalysisOptions()
  const explicit = buildPreviewSurfaceFromPrepared(prepared, defaults)

  assert.equal(explicit.stations.length, 25)
  assert.equal(defaults.directions.seed.type, 'uniform')
  assert.equal(defaults.directions.seed.type === 'uniform' ? defaults.directions.seed.count : 0, 36)
  assert.ok(explicit.directions.length >= 36)
  assert.deepEqual(
    explicit.points.map(({ P, Mx, My, state }) => ({ P, Mx, My, state })),
    implicit.points.map(({ P, Mx, My, state }) => ({ P, Mx, My, state }))
  )
})

test('nine mandatory transition nodes resolve to the selected code rule', () => {
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
  options.directions.refinement = { type: 'fixed', probe: 'all' }
  const transitionIndices = analysisStations(options)
    .map((station, index) => ({ station, index }))
    .filter(({ station }) =>
      (station.definition.kind === 'steel-stress-ratio' && station.definition.ratio === 1) ||
      station.definition.kind === 'strength-reduction-transition-ratio'
    )
    .map(({ index }) => index)
  assert.equal(transitionIndices.length, 9)

  const resolved = (basis: ReturnType<typeof createAci318DesignBasis> | ReturnType<typeof createKdsBasicDesignBasis>) => {
    const surface = buildPreviewSurfaceFromPrepared(sd500Prepared, options, basis)
    return transitionIndices.map((station) => {
      const point = surface.points.find((candidate) => candidate.station === station && candidate.beta === 0)
      assert.ok(point)
      return Math.abs(controllingBarStrain(point))
    })
  }
  const epsY = 500 / sd500.steel[0].elasticModulus
  const kds = resolved(createKdsBasicDesignBasis())
  const aci = resolved(createAci318DesignBasis())
  kds.forEach((strain, index) => assert.ok(Math.abs(strain - (epsY + index / 8 * (2.5 * epsY - epsY))) < 1e-12))
  aci.forEach((strain, index) => assert.ok(Math.abs(strain - (epsY + index / 8 * 0.003)) < 1e-12))
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

  const missingTransition = referenceProjectDocument()
  const transitionAware = createDefaultAnalysisOptions()
  transitionAware.stations.intermediate = transitionAware.stations.intermediate.filter(
    (station) => !(station.criterion.type === 'strength-reduction-transition-ratio' && station.criterion.ratio === 0.5)
  )
  missingTransition.inputs.analysis = transitionAware
  const transitionRejected = parseProjectDocument(serializeProjectDocument(missingTransition))
  assert.equal(transitionRejected.ok, false, 'a transition-aware profile must retain all nine mandatory nodes')
})
