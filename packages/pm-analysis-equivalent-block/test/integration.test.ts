import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { checkLoadcaseUtilizationFromSurface, sliceMomentPlane } from '@pm/analysis'
import {
  solveProportionalRayCapacity,
  type CapacityEvaluator,
  type NominalBlockEvaluation
} from '@pm/equivalent-block'
import { geometryInputRebars, sectionGeometryFromGeometryInput, type GeometryInput } from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import { createKdsAppendixDesignBasis } from '@pm/design'
import {
  applyCalculationProfileToMaterials,
  createAnalysisOptionsForProfile,
  createDesignBasisForCalculationProfile,
  createProjectDocument,
  parseProjectDocument,
  serializeProjectDocument,
  UNIFIED_DEPTH_RATIOS,
  UNIFIED_STEEL_STRAIN_YIELD_RATIOS,
  type EquivalentBlockAnalysisOptions,
  type EquivalentBlockProfileId
} from '@pm/project'
import {
  buildEquivalentBlockDesignSurfaceFromPrepared,
  buildEquivalentBlockExactDirectionCurveFromPrepared,
  buildEquivalentBlockFieldMapFromPrepared,
  buildEquivalentBlockPreviewSurfaceFromPrepared,
  prepareBlockAnalysis,
  solveEquivalentBlockDemandFromPrepared,
  solveEquivalentBlockDemandsFromPrepared
} from '../src/index'

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
    resolve(process.cwd(), 'docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json'),
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

test('equivalent-block example projects parse and solve with their shipped production options', () => {
  const directory = resolve(process.cwd(), 'docs/examples/equivalent-block')
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

for (const profileId of [
  'kds-142020-equivalent-block',
  'aci-318-19-22-equivalent-block',
  'as-3600-2018-amd2-equivalent-block',
  'custom-equivalent-block'
] as const) {
  test(`${profileId}: surface, inverse and exact block field`, () => {
    const input = build(profileId)
    const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(input.prepared, input.options)
    assert.equal(surface.mechanics, 'equivalent-rectangular-block')
    assert.ok(surface.points.length > 100)
    assert.ok(surface.triangles && surface.triangles.length > 100)
    assert.ok(surface.points.every((point) => Number.isFinite(point.P + point.Mx + point.My)))
    if (profileId === 'as-3600-2018-amd2-equivalent-block') {
      assert.equal(
        surface.points.some((point) => point.surfaceRole === 'axial-cap'),
        false,
        'AS 3600 preview applies phi_o at pure compression and does not invent an ACI/KDS axial cap'
      )
    } else {
      assertCardinalSlicesHaveNoCapToTensionChord(surface, profileId)
    }
    assert.equal(surface.stations.length, 22)
    assert.equal(surface.stations[0].definition.kind, 'pure-compression')
    assert.equal(surface.stations.at(-1)?.definition.kind, 'pure-tension')
    assert.equal(
      surface.warnings.some((warning) => warning.includes('neutral-axis refinement')),
      false,
      'a fixed station schedule must not emit an adaptive-refinement warning'
    )
    assert.deepEqual(
      surface.stations.slice(1, 1 + UNIFIED_DEPTH_RATIOS.length).map((station) => station.definition),
      UNIFIED_DEPTH_RATIOS.map((ratio) => ({ kind: 'block-depth-ratio', ratio }))
    )
    assert.deepEqual(
      surface.stations.slice(1 + UNIFIED_DEPTH_RATIOS.length, -1).map((station) => station.definition),
      UNIFIED_STEEL_STRAIN_YIELD_RATIOS.map((ratio) => ({ kind: 'bar-tension-yield-ratio', ratio }))
    )
    assert.equal(
      surface.stations.filter((station) => station.definition.kind === 'bar-tension-yield-ratio').length,
      14,
      'all block models must use the shared controlling-bar yield-ratio schedule'
    )
    assert.equal(
      surface.stations.some((station) => station.definition.kind === 'bar-tension-strain'),
      false,
      'transition event stations are not part of the fixed baseline'
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

test('ACI default keeps an independent 22-by-36 fixed grid while adaptive design solves a practical demand', () => {
  const profileId = 'aci-318-19-22-equivalent-block' as const
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const design = createDesignBasisForCalculationProfile(profileId)
  const options = createAnalysisOptionsForProfile(profileId) as EquivalentBlockAnalysisOptions
  assert.deepEqual(options.neutralAxisStations.refinement, {
    type: 'adaptive',
    tolerance: 0.0075,
    maxPasses: 8,
    maxStations: 48
  })
  const prepared = prepareBlockAnalysis(
    profileId,
    sectionGeometryFromGeometryInput(geometry),
    geometryInputRebars(geometry),
    materials,
    design
  )
  const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, options)
  assert.equal(surface.designFixed?.stations.length, 22)
  assert.equal(surface.designFixed?.directions.length, 36)
  assert.equal(surface.nominalFixed?.stations.length, 22)
  assert.equal(surface.nominalFixed?.directions.length, 36)
  assert.ok(surface.stations.length >= 22 && surface.stations.length <= 48)
  assert.ok(surface.stationError.refinementPasses > 0)
  assert.ok(surface.directionError.refinementPasses > 0)
  assert.ok(surface.stationError.maxRelative <= 0.0075)
  assert.ok(surface.directionError.maxRelativeComponent <= 0.0075)
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

test('an exact equivalent-block direction refines stations only on the requested meridian', () => {
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
  const beta = 17.35 * Math.PI / 180
  const curve = buildEquivalentBlockExactDirectionCurveFromPrepared(prepared, options, beta)

  assert.ok(Math.abs(curve.beta - beta) < 1e-14)
  assert.equal(
    curve.nominalFixed.length,
    22,
    curve.nominalFixed.map((point) => point.stationId ?? point.surfaceRole ?? point.id).join(', ')
  )
  assert.ok(curve.designFixed.some((point) => point.surfaceRole === 'axial-cap'))
  assert.ok(curve.designFixed.every((point) => point.stationId?.startsWith('adaptive-') !== true))
  assert.equal(curve.stations.filter((station) => station.fixed).length, 22)
  assert.ok(curve.designAdaptive.length >= 22 && curve.designAdaptive.length <= 48)
  assert.ok(curve.designAdaptive
    .filter((point) => point.surfaceRole !== 'pure-compression' && point.surfaceRole !== 'pure-tension')
    .every((point) => Math.abs(point.beta - beta) < 1e-10))
  assert.ok(curve.stationError.maxRelative <= 0.0075)
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
  const loadcases = Array.from({ length: 4 }, (_, index) => ({
      id: 100 + index,
      name: `cached demand ${index + 1}`,
      actionBasis: 'factoredULS' as const,
      P: 300_000 + index * 50_000,
      Mx: 80_000_000,
      My: 20_000_000
    }))
  const inverses = solveEquivalentBlockDemandsFromPrepared(input.prepared, input.options, loadcases)
  assert.equal(inverses.length, loadcases.length)
  assert.ok(inverses.every((inverse) => inverse.utilization !== null))
  assert.equal(builds, 1, 'the batch API must build one loadcase-independent surface')
})

test('KDS Appendix block route reevaluates materials, uses eps_c0, omits phi/cap, and enforces e_min', () => {
  const profileId = 'kds-142020-equivalent-block' as const
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  const design = createKdsAppendixDesignBasis()
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

  assert.ok(Math.abs(
    prepared.designModel.blockLaw.compressionStress /
    prepared.referenceModel.blockLaw.compressionStress - 0.65
  ) < 1e-12)
  const referenceSteel = prepared.referenceModel.steelLaws['1']!
  const designSteel = prepared.designModel.steelLaws['1']!
  assert.equal(designSteel.stressAt(0.0005), referenceSteel.stressAt(0.0005), 'Es remains unchanged')
  assert.ok(Math.abs(designSteel.stressAt(0.01) / referenceSteel.stressAt(0.01) - 0.90) < 1e-12)
  assert.equal(
    prepared.designModel.blockLaw.compressionPivotStrain,
    materials.concrete.limits.eps0
  )
  assert.equal(prepared.designModel.blockLaw.extremeCompressionStrain, materials.concrete.limits.epsCu)

  const designSurface = buildEquivalentBlockDesignSurfaceFromPrepared(prepared, options)
  const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, options, designSurface)
  assert.equal(designSurface.topology.closed, true)
  const allCompressionState = designSurface.points.find((point) =>
    point.state && point.state.neutralAxisDepth > 1.1 * 700
  )?.state
  assert.ok(allCompressionState)
  const allCompressionEvaluation = prepared.designModel
    .bindNominalEvaluator(prepared.section)(allCompressionState).source as NominalBlockEvaluation
  assert.ok(allCompressionEvaluation.diagnostics.extremeCompressionStrain > materials.concrete.limits.eps0!)
  assert.ok(allCompressionEvaluation.diagnostics.extremeCompressionStrain < materials.concrete.limits.epsCu)
  assert.ok(surface.points.every((point) => point.surfaceRole !== 'axial-cap'))
  assert.ok(surface.points.every((point) => point.resistance?.factor == null))
  assert.ok(surface.nominalPoints.length > 0, 'the characteristic reference surface remains available')

  const compression = surface.points.reduce((maximum, point) => point.P > maximum.P ? point : maximum)
  const solved = solveEquivalentBlockDemandFromPrepared(prepared, options, {
    id: 81,
    name: 'Appendix minimum eccentricity',
    actionBasis: 'factoredULS',
    P: 0.25 * compression.P,
    Mx: 0,
    My: 0
  }, designSurface)
  assert.ok(solved.codeAdjustedDemand)
  assert.ok(
    solved.minimumEccentricityMm === 15 + 0.03 * 500 ||
    solved.minimumEccentricityMm === 15 + 0.03 * 700,
    'zero-moment demand checks both principal projected depths and retains the governing direction'
  )
  assert.ok(Math.hypot(solved.codeAdjustedDemand!.Mx, solved.codeAdjustedDemand!.My) > 0)

  const check = checkLoadcaseUtilizationFromSurface(surface, {
    id: 81,
    name: 'Appendix minimum eccentricity',
    actionBasis: 'factoredULS',
    P: 0.25 * compression.P,
    Mx: 0,
    My: 0
  })
  assert.equal(
    check.minimumEccentricityMm,
    solved.minimumEccentricityMm,
    'the loadcase table and the inverse must resolve the same governing principal axis'
  )
  assert.deepEqual(check.codeAdjustedDemand, solved.codeAdjustedDemand)
})

/**
 * KDS Appendix 3.2(1) equations (3-2) and (3-3) carry no eta, so the concentric design axial
 * strength is model independent. Below fck = 40 MPa eta is 1.00 and the defect this covers is
 * invisible, which is why the fixture runs at fck = 60 MPa where Table 4.1-2 gives eta = 0.95.
 */
for (const [fck, fy, equation] of [[30, 400, '(3-2)'], [60, 400, '(3-2)'], [60, 600, '(3-3)']] as const) {
  test(`KDS Appendix block route reports clause ${equation} design axial strength at fck ${fck} / fy ${fy}`, () => {
    const profileId = 'kds-142020-equivalent-block' as const
    const store = createDefaultMaterialStore()
    const materials = applyCalculationProfileToMaterials({
      ...store,
      concrete: { ...store.concrete, fck },
      steel: store.steel.map((steel) => ({
        ...steel,
        fy,
        limits: { ...steel.limits, epsY: fy / steel.elasticModulus }
      }))
    }, profileId)
    const design = createKdsAppendixDesignBasis()
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

    const Ag = 500 * 700
    const Ast = geometryInputRebars(geometry).reduce(
      (sum, bar) => sum + (Math.PI / 4) * bar.dia * bar.dia,
      0
    )
    const steel = materials.steel[0]!
    const eps0 = materials.concrete.limits.eps0!
    const designYieldStrain = (0.9 * steel.fy) / steel.elasticModulus
    assert.equal(designYieldStrain <= eps0 ? '(3-2)' : '(3-3)', equation, 'clause branch under test')
    const steelStress = designYieldStrain <= eps0 ? 0.9 * steel.fy : eps0 * steel.elasticModulus
    const Pdo = 0.65 * 0.85 * fck * (Ag - Ast) + steelStress * Ast

    const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, options)
    const compression = Math.max(...surface.points.map((point) => point.P))
    assert.ok(
      Math.abs(compression / Pdo - 1) < 1e-9,
      `Appendix ${equation} expects ${Pdo} N, the block surface reported ${compression} N`
    )

    const etaDisclosure = surface.warnings.some((warning) => warning.includes('carry no eta'))
    assert.equal(
      etaDisclosure,
      prepared.appendixPoleDivergesFromBlockLimit,
      'the interpolated band above the block limit must be disclosed exactly when eta < 1'
    )
    assert.equal(etaDisclosure, fck > 40)
  })
}

test('canonical My migration preserves the physical ray load factor and utilization', () => {
  const parsed = parseProjectDocument(readFileSync(
    resolve(process.cwd(), 'docs/examples/equivalent-block/ACI-EB-03-l-shape-8-bars.pm-project.json'),
    'utf8'
  ))
  assert.ok(parsed.ok, 'asymmetric sign-migration fixture must parse')
  if (!parsed.ok) return
  const { inputs } = parsed.document
  const options = inputs.analysis as EquivalentBlockAnalysisOptions
  const prepared = prepareBlockAnalysis(
    inputs.calculationProfileId,
    sectionGeometryFromGeometryInput(inputs.geometry),
    geometryInputRebars(inputs.geometry),
    inputs.materials,
    inputs.design
  )
  const canonicalSurface = buildEquivalentBlockDesignSurfaceFromPrepared(prepared, options)
  const canonicalEvaluator = prepared.model.bindDesignEvaluator(prepared.section)
  const reflectMy = (value: { P: number; Mx: number; My: number }) => ({
    P: value.P,
    Mx: value.Mx,
    My: -value.My
  })
  const legacySurface = {
    ...canonicalSurface,
    points: canonicalSurface.points.map((point) => ({
      ...point,
      resultants: reflectMy(point.resultants)
    }))
  }
  const legacyEvaluator: CapacityEvaluator = (state) => {
    const evaluation = canonicalEvaluator(state)
    return { ...evaluation, resultants: reflectMy(evaluation.resultants) }
  }
  const canonicalDemand = inputs.loadings.combinations[0]
  const legacyDemand = reflectMy(canonicalDemand)
  const canonical = solveProportionalRayCapacity(
    canonicalSurface,
    canonicalDemand,
    canonicalEvaluator
  )
  const legacy = solveProportionalRayCapacity(legacySurface, legacyDemand, legacyEvaluator)
  assert.equal(canonical.status, legacy.status)
  assert.equal(canonical.loadFactor, legacy.loadFactor)
  assert.equal(canonical.utilization, legacy.utilization)
  assert.equal(canonical.residualNorm, legacy.residualNorm)
  assert.deepEqual(
    canonical.capacity && reflectMy(canonical.capacity),
    legacy.capacity,
    'only the coordinate representation of My may change'
  )
})
