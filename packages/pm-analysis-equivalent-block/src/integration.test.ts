import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { sliceMomentPlane } from '@pm/analysis'
import { geometryInputRebars, sectionGeometryFromGeometryInput, type GeometryInput } from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import {
  applyCalculationProfileToMaterials,
  createAnalysisOptionsForProfile,
  createDesignBasisForCalculationProfile,
  createProjectDocument,
  parseProjectDocument,
  serializeProjectDocument,
  type EquivalentBlockAnalysisOptions,
  type EquivalentBlockProfileId
} from '@pm/project'
import {
  buildEquivalentBlockDesignSurfaceFromPrepared,
  buildEquivalentBlockFieldMapFromPrepared,
  buildEquivalentBlockPreviewSurfaceFromPrepared,
  prepareBlockAnalysis,
  solveEquivalentBlockDemandFromPrepared
} from './index'

const geometry: GeometryInput = {
  id: 1,
  name: '500 x 700 verification column',
  outers: [{
    id: 1,
    points: [
      { id: 1, x: -250, y: -350 }, { id: 2, x: 250, y: -350 },
      { id: 3, x: 250, y: 350 }, { id: 4, x: -250, y: 350 }
    ],
    holes: []
  }],
  rebars: [
    [-190, -290], [190, -290], [190, 290], [-190, 290], [0, -290], [0, 290]
  ].map(([x, y], index) => ({ id: index + 1, x, y, dia: 25, steelMaterialId: 1 }))
}

const build = (profileId: EquivalentBlockProfileId) => {
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const design = createDesignBasisForCalculationProfile(profileId)
  const options = createAnalysisOptionsForProfile(profileId) as EquivalentBlockAnalysisOptions
  options.directions.seedCount = 12
  options.directions.refinement = { type: 'fixed' }
  options.neutralAxisStations.refinement = { type: 'fixed' }
  const section = sectionGeometryFromGeometryInput(geometry)
  const rebars = geometryInputRebars(geometry)
  const prepared = prepareBlockAnalysis(profileId, section, rebars, materials, design)
  return { materials, design, options, prepared }
}

const assertCardinalSlicesHaveNoCapToTensionChord = (
  surface: ReturnType<typeof buildEquivalentBlockPreviewSurfaceFromPrepared>,
  label: string
) => {
  const syntheticCapPoints = surface.points.filter((point) => point.surfaceRole === 'axial-cap')
  assert.ok(syntheticCapPoints.length > 2, `${label}: expected a triangulated axial-cap face`)
  assert.ok(
    syntheticCapPoints.every((point) => point.station === -1 && point.stationId === null),
    `${label}: axial-cap points must not masquerade as physical strain stations`
  )
  const capP = syntheticCapPoints[0].P
  const tensionP = Math.min(...surface.points.map((point) => point.P))
  const forceTolerance = Math.max(1, Math.abs(capP), Math.abs(tensionP)) * 1e-9
  const near = (value: number, target: number) => Math.abs(value - target) <= forceTolerance
  const epsilon = 1e-6
  const angles = [
    0, epsilon,
    90 - epsilon, 90, 90 + epsilon,
    180 - epsilon, 180, 180 + epsilon,
    270 - epsilon, 270, 270 + epsilon
  ]

  for (const degrees of angles) {
    const paths = sliceMomentPlane(surface.points, degrees * Math.PI / 180, surface.triangles)
    assert.ok(paths.length > 0, `${label} ${degrees} deg: expected a vertical slice`)
    assert.ok(paths.every((path) => path.closed), `${label} ${degrees} deg: full-plane slice must be closed`)
    for (const [pathIndex, path] of paths.entries()) {
      for (let index = 1; index < path.points.length; index += 1) {
        const left = path.points[index - 1]
        const right = path.points[index]
        const capToTension =
          (near(left.P, capP) && near(right.P, tensionP)) ||
          (near(right.P, capP) && near(left.P, tensionP))
        assert.equal(
          capToTension,
          false,
          `${label} ${degrees} deg path ${pathIndex}: axial cap must not connect to the tension pole`
        )
      }
    }
  }
}

test('KDS block cardinal slices do not weld the axial cap to the tension pole', () => {
  const parsed = parseProjectDocument(readFileSync(
    resolve(process.cwd(), 'docs/example case/PM-advanced (7) 2D.pm-project.json'),
    'utf8'
  ))
  assert.ok(parsed.ok, 'PM-advanced (7) 2D fixture must parse')
  if (!parsed.ok) return

  const profileId = 'kds-142020-equivalent-block' as const
  const projectGeometry = parsed.document.inputs.geometry
  const materials = applyCalculationProfileToMaterials(parsed.document.inputs.materials, profileId)
  const design = createDesignBasisForCalculationProfile(profileId)
  const options = createAnalysisOptionsForProfile(profileId) as EquivalentBlockAnalysisOptions
  const prepared = prepareBlockAnalysis(
    profileId,
    sectionGeometryFromGeometryInput(projectGeometry),
    geometryInputRebars(projectGeometry),
    materials,
    design
  )
  const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, options)
  assertCardinalSlicesHaveNoCapToTensionChord(surface, 'KDS PM-advanced (7) 2D')
})

test('docs/example equivalent-block projects parse and solve with their shipped production options', () => {
  const directory = resolve(process.cwd(), 'docs/example')
  const files = readdirSync(directory)
    .filter((file) => /^(KDS|ACI)-EB-\d{2}-.+\.pm-project\.json$/.test(file))
    .sort()
  assert.equal(files.length, 8, 'the public audit set must contain 4 geometries x 2 code profiles')

  for (const file of files) {
    const parsed = parseProjectDocument(readFileSync(resolve(directory, file), 'utf8'))
    assert.ok(parsed.ok, `${file}: project schema v1 must parse`)
    if (!parsed.ok) continue
    assert.deepEqual(parsed.warnings, [], `${file}: import warnings`)
    const { inputs } = parsed.document
    assert.equal(parsed.document.version, 1, `${file}: project version`)
    assert.notEqual(inputs.calculationProfileId, 'kds-2024-stress-strain', `${file}: block profile`)
    assert.equal(inputs.analysis.methodId, 'equivalent-block-surface-v1', `${file}: analysis method`)
    const options = inputs.analysis as EquivalentBlockAnalysisOptions
    const prepared = prepareBlockAnalysis(
      inputs.calculationProfileId,
      sectionGeometryFromGeometryInput(inputs.geometry),
      geometryInputRebars(inputs.geometry),
      inputs.materials,
      inputs.design
    )
    const designSurface = buildEquivalentBlockDesignSurfaceFromPrepared(prepared, options)
    const preview = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, options, designSurface)
    assert.equal(designSurface.topology.closed, true, `${file}: closed design surface`)
    assertCardinalSlicesHaveNoCapToTensionChord(preview, file)
    assert.equal(inputs.loadings.combinations.length, 3, `${file}: audit loadcase count`)
    for (const loadcase of inputs.loadings.combinations) {
      const solved = solveEquivalentBlockDemandFromPrepared(prepared, options, loadcase, designSurface)
      assert.equal(solved.ok, true, `${file}/${loadcase.name}: demand solve`)
      assert.ok(solved.utilization !== null && solved.utilization < 1, `${file}/${loadcase.name}: inside surface`)
    }
  }
})

for (const profileId of ['kds-142020-equivalent-block', 'aci-318-19-22-equivalent-block', 'custom-equivalent-block'] as const) {
  test(`${profileId}: surface, inverse and exact block field`, () => {
    const input = build(profileId)
    const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(input.prepared, input.options)
    assert.equal(surface.mechanics, 'equivalent-rectangular-block')
    assert.ok(surface.points.length > 100)
    assert.ok(surface.triangles && surface.triangles.length > 100)
    assert.ok(surface.points.every((point) => Number.isFinite(point.P + point.Mx + point.My)))
    assertCardinalSlicesHaveNoCapToTensionChord(surface, profileId)
    assert.ok(
      surface.stations.some((station) => station.definition.kind === 'bar-tension-strain'),
      'code transition events must retain controlling-bar semantics in the shared result DTO'
    )
    const reduced = surface.points.find((point) => point.resistance?.factor && point.equivalentBlock)
    assert.ok(reduced?.resistance?.factor)
    assert.ok(Math.abs(reduced.P - reduced.resistance.factor * reduced.resistance.nominalReference.P) < 1e-8)
    assert.ok(Math.abs(reduced.Mx - reduced.resistance.factor * reduced.resistance.nominalReference.Mx) < 1e-6)
    assert.ok(Math.abs(reduced.My - reduced.resistance.factor * reduced.resistance.nominalReference.My) < 1e-6)
    const source = surface.points.find((point) => point.equivalentBlock && Math.hypot(point.Mx, point.My) > 1e6 && point.P > 0)
    assert.ok(source)
    const inverse = solveEquivalentBlockDemandFromPrepared(input.prepared, input.options, {
      id: 1, name: '0.55 x known design ray', actionBasis: 'factoredULS',
      P: 0.55 * source.P, Mx: 0.55 * source.Mx, My: 0.55 * source.My
    })
    assert.equal(inverse.ok, true)
    assert.ok(inverse.utilization !== null && inverse.utilization > 0 && inverse.utilization < 1)
    assert.ok(typeof inverse.fixedPUtilization === 'number' && inverse.fixedPUtilization > 0)
    assert.ok(inverse.equivalentBlock)
    assert.ok(Math.abs(inverse.equivalentBlock.blockDepth - inverse.equivalentBlock.beta1 * inverse.equivalentBlock.neutralAxisDepth) < 1e-9)
    const field = buildEquivalentBlockFieldMapFromPrepared(input.prepared, {
      neutralAxisAngle: inverse.equivalentBlock.neutralAxisAngle,
      neutralAxisDepth: inverse.equivalentBlock.neutralAxisDepth
    })
    assert.equal(field.mechanics, 'equivalent-rectangular-block')
    assert.ok(field.equivalentBlock?.geometry.length)
    assert.ok(field.triangles.length > 0)
  })
}

test('schema v1 round-trips a block profile without migration', () => {
  const profileId = 'aci-318-19-22-equivalent-block' as const
  const input = build(profileId)
  const document = createProjectDocument({
    calculationProfileId: profileId,
    geometry,
    materials: input.materials,
    analysis: input.options,
    design: input.design
  })
  const parsed = parseProjectDocument(serializeProjectDocument(document))
  assert.equal(document.version, 1)
  assert.equal(parsed.ok, true)
  if (parsed.ok) {
    assert.equal(parsed.document.inputs.calculationProfileId, profileId)
    assert.equal(parsed.document.inputs.analysis.methodId, 'equivalent-block-surface-v1')
  }
})

test('ACI default adaptive profile solves a practical factored demand without a fixed grid', () => {
  const profileId = 'aci-318-19-22-equivalent-block' as const
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const design = createDesignBasisForCalculationProfile(profileId)
  const options = createAnalysisOptionsForProfile(profileId) as EquivalentBlockAnalysisOptions
  const prepared = prepareBlockAnalysis(
    profileId,
    sectionGeometryFromGeometryInput(geometry),
    geometryInputRebars(geometry),
    materials,
    design
  )
  const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, options)
  const inverse = solveEquivalentBlockDemandFromPrepared(prepared, options, {
    id: 9,
    name: 'Practical ULS demand',
    actionBasis: 'factoredULS',
    P: 1_000_000,
    Mx: 100_000_000,
    My: 0
  })
  assert.ok(surface.points.length > 500)
  assert.equal(inverse.ok, true)
  assert.ok(inverse.equivalentBlock)
})

test('equivalent-block inverse reports evaluated steel admissibility and honours epsU', () => {
  const profileId = 'aci-318-19-22-equivalent-block' as const
  const base = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const materials = {
    ...base,
    steel: base.steel.map((steel) => ({
      ...steel,
      limits: { ...steel.limits, epsU: 0.02 }
    }))
  }
  const design = createDesignBasisForCalculationProfile(profileId)
  const options = createAnalysisOptionsForProfile(profileId) as EquivalentBlockAnalysisOptions
  options.directions.seedCount = 12
  options.directions.refinement = { type: 'fixed' }
  options.neutralAxisStations.refinement = { type: 'fixed' }
  const prepared = prepareBlockAnalysis(
    profileId,
    sectionGeometryFromGeometryInput(geometry),
    geometryInputRebars(geometry),
    materials,
    design
  )
  const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, options)
  const source = surface.points.find((point) => point.equivalentBlock && point.P > 0 && Math.hypot(point.Mx, point.My) > 1e6)
  assert.ok(source)
  const inverse = solveEquivalentBlockDemandFromPrepared(prepared, options, {
    id: 17,
    name: 'epsU admissibility ray',
    actionBasis: 'factoredULS',
    P: 0.6 * source.P,
    Mx: 0.6 * source.Mx,
    My: 0.6 * source.My
  })
  assert.equal(inverse.ok, true, inverse.message)
  assert.equal(inverse.admissibility.evaluated, true)
  assert.equal(inverse.admissibility.ok, true)
  assert.equal(inverse.admissibility.steelTensionLimit, 0.02)
  assert.ok(inverse.admissibility.maxSteelTension <= 0.02 * (1 + 1e-9))
  assert.deepEqual(inverse.admissibility.violations, [])
})

test('a prepared design surface is reused across inverse load combinations', () => {
  const input = build('aci-318-19-22-equivalent-block')
  const original = input.prepared.model.buildDesignSurface
  let builds = 0
  input.prepared.model.buildDesignSurface = (...args) => {
    builds += 1
    return original(...args)
  }
  const designSurface = buildEquivalentBlockDesignSurfaceFromPrepared(input.prepared, input.options)
  assert.equal(builds, 1)

  for (let index = 0; index < 4; index += 1) {
    const inverse = solveEquivalentBlockDemandFromPrepared(input.prepared, input.options, {
      id: 100 + index,
      name: `cached demand ${index + 1}`,
      actionBasis: 'factoredULS',
      P: 300_000 + index * 50_000,
      Mx: 80_000_000,
      My: 20_000_000
    }, designSurface)
    assert.ok(inverse.utilization !== null)
  }
  assert.equal(builds, 1, 'inverse checks must not rebuild a supplied loadcase-independent surface')
})
