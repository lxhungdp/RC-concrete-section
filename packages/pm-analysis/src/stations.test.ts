/**
 * The station schedule must come from the material definitions it claims to describe.
 *
 * `docs/05` §2 seed-schedule policy: "Seed strains are derived from the authoritative
 * adapter/material definitions, not hard-coded values such as 0.003 that may conflict with fy/Es."
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { createKdsRebarSteel, IMPLEMENTED_STRAIN_DOMAIN, type MaterialStore } from '@pm/materials'
import { createDefaultAnalysisOptions } from '@pm/project'
import { analysisStations, buildPreviewSurface } from './index'
import { referenceProjectDocument } from './reference-case'

const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const materials = document.inputs.materials

const DEFAULT_STATIONS = analysisStations(createDefaultAnalysisOptions())
const PURE_TENSION = DEFAULT_STATIONS.findIndex((station) => station.definition.kind === 'pure-tension')
const YIELD_STATION = DEFAULT_STATIONS.findIndex(
  (station) => station.definition.kind === 'steel-stress-ratio' && station.definition.ratio === 1
)

const stationRow = (store: MaterialStore, stationIndex: number) => {
  const surface = buildPreviewSurface(section, rebars, store)
  return surface.points.filter((point) => point.station === stationIndex)
}

/** Extreme tensile fibre strain of a plane, over the bars. */
const minBarStrain = (state: { e0: number; kx: number; ky: number }) =>
  Math.min(...rebars.map((bar) => state.e0 + state.kx * bar.y + state.ky * bar.x))

test('the pure-tension pole follows the grade, not a constant', () => {
  const sd400 = stationRow(materials, PURE_TENSION)[0].state.e0
  const sd500: MaterialStore = {
    ...materials,
    steel: [createKdsRebarSteel({ id: 1, name: 'SD500', fy: 500, elasticModulus: 200000 })]
  }
  const sd500e0 = stationRow(sd500, PURE_TENSION)[0].state.e0

  // 25 x epsY: SD400 yields at 0.002, SD500 at 0.0025.
  assert.equal(sd400, -0.05)
  assert.equal(sd500e0, -0.0625)
})

test('a declared rupture strain becomes the tension pole', () => {
  const brittle: MaterialStore = {
    ...materials,
    steel: materials.steel.map((steel) => ({ ...steel, limits: { ...steel.limits, epsU: 0.025 } }))
  }
  assert.equal(stationRow(brittle, PURE_TENSION)[0].state.e0, -0.025)
})

test('no scheduled station may drive a bar past its declared rupture strain', () => {
  const epsU = 0.01
  const brittle: MaterialStore = {
    ...materials,
    steel: materials.steel.map((steel) => ({ ...steel, limits: { ...steel.limits, epsU } }))
  }
  const surface = buildPreviewSurface(section, rebars, brittle)
  for (const point of surface.points) {
    assert.ok(
      minBarStrain(point.state) >= -epsU * (1 + 1e-9),
      `station ${point.station} at beta ${point.beta} reaches ${minBarStrain(point.state)}, past -${epsU}`
    )
  }
  // Without the limit the schedule does go past it, so the clamp above is doing real work.
  const unlimited = buildPreviewSurface(section, rebars, materials)
  assert.ok(Math.min(...unlimited.points.map((point) => minBarStrain(point.state))) < -epsU)
})

test('the "fs = fyd" station honours the steel partial factor', () => {
  const gammaS = 1.15
  const withFactor: MaterialStore = {
    ...materials,
    steel: materials.steel.map((steel) => ({
      ...steel,
      limits: {},
      factors: { ...steel.factors, gammaS }
    }))
  }
  const state = stationRow(withFactor, YIELD_STATION)[0].state
  const steel = withFactor.steel[0]
  // The compiled law yields at fy/gammaS/Es, so that is where the station must sit.
  const expected = -steel.fy / gammaS / steel.elasticModulus
  assert.ok(
    Math.abs(minBarStrain(state) - expected) <= 1e-12 * Math.abs(expected),
    `expected the controlling bar at ${expected}, got ${minBarStrain(state)}`
  )
})

test('the surface declares the strain domain it was built on', () => {
  assert.equal(buildPreviewSurface(section, rebars, materials).strainDomain, IMPLEMENTED_STRAIN_DOMAIN)
})

test('an EC2 material law is flagged as paired with a non-EC2 strain domain', () => {
  const ec2: MaterialStore = {
    ...materials,
    concrete: {
      ...materials.concrete,
      standard: 'EC2',
      stressStrain: { type: 'ec2-parabolic-rectangular', n: 2, epsC2: 0.002, epsCu2: 0.0035, alpha: 0.85 },
      factors: { alpha: 0.85, gammaC: 1.5 }
    }
  }
  const warnings = buildPreviewSurface(section, rebars, ec2).warnings
  assert.ok(
    warnings.some((warning) => warning.startsWith('Strain domain:') && warning.includes('εud')),
    `expected an EC2 strain-domain warning, got ${JSON.stringify(warnings)}`
  )
  // KDS is the domain's own convention and must stay quiet.
  assert.ok(!buildPreviewSurface(section, rebars, materials).warnings.some((w) => w.startsWith('Strain domain:')))
})
