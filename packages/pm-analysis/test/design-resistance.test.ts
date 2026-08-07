import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, netConcreteCentroid, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  buildResistanceMaterialSets,
  createEn1992DesignBasis,
  createKdsAppendixDesignBasis,
  createKdsBasicDesignBasis,
  designBasisIssues,
  designBasisRequiresOverrideReason,
  evaluateGlobalStrengthReduction
} from '@pm/design'
import {
  applyKdsConcreteDerived,
  compileConcreteMaterial,
  compileSteelMaterial,
  type MaterialStore
} from '@pm/materials'
import {
  applyCalculationProfileToMaterials,
  createLoadCombination,
  createDefaultAnalysisOptions
} from '@pm/project'
import {
  AnalysisInputError,
  buildDesignPreviewSurfaceFromPrepared,
  checkLoadcaseUtilizationFromSurface,
  codeAdjustedDemandOfCheck,
  prepareAnalysis,
  sliceFixedPContour,
  solveInversePreviewFromPrepared
} from '../src/index'
import { referenceProjectDocument } from './fixtures/reference-case'

const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const materials = document.inputs.materials

const compactOptions = () => {
  const options = createDefaultAnalysisOptions()
  options.directions.seed = { type: 'uniform', count: 8, startDeg: 0 }
  options.directions.refinement = { type: 'fixed', probe: { stationIds: [] } }
  return options
}

test('KDS current profile identifies the 2024 code set without misdating its resistance clauses', () => {
  const basis = createKdsBasicDesignBasis()
  assert.equal(basis.profileId, 'kds-2024-current-set')
  assert.match(basis.identity.document, /KDS 2024 current set/)
  assert.match(basis.identity.document, /KDS 14 20 10:2021/)
  assert.match(basis.identity.amendment ?? '', /2024-879/)
})

test('disabling only the optional axial limit does not require an override reason', () => {
  const basis = createKdsBasicDesignBasis()
  basis.axialCapEnabled = false
  basis.modified = true
  assert.equal(designBasisRequiresOverrideReason(basis), false)
  assert.equal(
    designBasisIssues(basis).some((issue) => issue.includes('reason')),
    false
  )

  basis.factors.phiCompressionOther = 0.66
  assert.equal(designBasisRequiresOverrideReason(basis), true)
  assert.equal(
    designBasisIssues(basis).some((issue) => issue.includes('reason')),
    true
  )
})

test('global strength reduction is classified and interpolated at the declared strain limits', () => {
  const basis = createKdsBasicDesignBasis()
  const epsY = 0.002

  const compression = evaluateGlobalStrengthReduction(basis, epsY, epsY, 400)
  assert.equal(compression.classification, 'compression-controlled')
  assert.equal(compression.phi, 0.65)

  const transition = evaluateGlobalStrengthReduction(basis, epsY + 0.0015, epsY, 400)
  assert.equal(transition.classification, 'transition')
  assert.ok(Math.abs(transition.phi - 0.75) < 1e-12)

  const tension = evaluateGlobalStrengthReduction(basis, epsY + 0.003, epsY, 400)
  assert.equal(tension.classification, 'tension-controlled')
  assert.equal(tension.phi, 0.85)
})

test('global-factor profiles remove embedded material factors before applying one resultant factor', () => {
  const source = structuredClone(materials)
  source.concrete.factors = { ...source.concrete.factors, gammaC: 1.5 }
  source.steel = source.steel.map((steel) => ({
    ...steel,
    factors: { ...steel.factors, gammaS: 1.15 }
  }))
  const sets = buildResistanceMaterialSets(source, createKdsBasicDesignBasis())

  assert.equal(sets.referenceMaterials.concrete.factors?.gammaC, undefined)
  assert.equal(sets.designMaterials.concrete.factors?.gammaC, undefined)
  assert.ok(sets.referenceMaterials.steel.every((steel) => steel.factors?.gammaS === undefined))
  assert.deepEqual(sets.referenceMaterials, sets.designMaterials)
})

test('design surface preserves IDs and pairs every uncapped design state with its nominal reference', () => {
  const basis = createKdsBasicDesignBasis()
  const sets = buildResistanceMaterialSets(materials, basis)
  const surface = buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, sets.stateMaterials),
    materials,
    basis,
    compactOptions()
  )

  assert.equal(surface.points.length, surface.nominalPoints.length)
  assert.deepEqual(
    surface.points.map((point) => point.id),
    surface.nominalPoints.map((point) => point.id)
  )
  for (const point of surface.points.filter((item) => !item.resistance?.axialCapApplied)) {
    const nominalAtState = surface.nominalPoints.find((item) => item.id === point.id)
    assert.deepEqual(point.state, nominalAtState?.state)
  }

  const uncapped = surface.points.find(
    (point) => point.resistance && !point.resistance.axialCapApplied && Math.abs(point.P) > 1
  )
  assert.ok(uncapped?.resistance?.factor)
  const nominal = surface.nominalPoints.find((point) => point.id === uncapped?.id)
  assert.ok(nominal)
  assert.ok(Math.abs(uncapped.P - nominal.P * uncapped.resistance.factor) < Math.abs(uncapped.P) * 1e-10 + 1e-6)
  assert.ok(Math.abs(uncapped.Mx - nominal.Mx * uncapped.resistance.factor) < Math.abs(uncapped.Mx) * 1e-10 + 1e-6)
  assert.ok(surface.points.some((point) => point.resistance?.axialCapApplied))
  const capped = surface.points.filter((point) => point.resistance?.axialCapApplied)
  assert.ok(capped.length > 0)
  assert.ok(capped.every((point) => point.surfaceRole === 'axial-cap'))
  assert.ok(capped.every((point) => point.stationId === null))
  assert.ok(capped.every((point) => point.onSampledDirection === true))
  const capCentres = surface.points.filter((point) => point.station === 0)
  assert.ok(capCentres.every((point) => Math.abs(point.Mx) < 1e-8 && Math.abs(point.My) < 1e-8))
  assert.ok(capCentres.every((point) => Math.abs(point.P - capCentres[0].P) < 1e-8))
})

test('design-material format reevaluates the same strain states with design material strengths', () => {
  const basis = createEn1992DesignBasis()
  const sets = buildResistanceMaterialSets(materials, basis)
  const surface = buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, sets.stateMaterials),
    materials,
    basis,
    compactOptions()
  )
  const point = surface.points.find((item) => Math.abs(item.P) > 1)
  assert.ok(point)
  assert.equal(point.resistance?.factor, null)
  assert.equal(point.resistance?.format, 'designMaterialReevaluation')
  assert.ok(point.resistance?.stages.includes('design-material-reevaluation'))
})

test('EN 1992 domain 5 rotates about eps_c2 and joins the eps_cu2 boundary continuously', () => {
  const enMaterials = applyCalculationProfileToMaterials(materials, 'en-1992-1-1-2004-stress-strain')
  const basis = createEn1992DesignBasis()
  const sets = buildResistanceMaterialSets(enMaterials, basis)
  const surface = buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, sets.stateMaterials),
    enMaterials,
    basis,
    compactOptions()
  )
  const epsC2 = enMaterials.concrete.limits.eps0!
  const epsCu2 = enMaterials.concrete.limits.epsCu
  assert.equal(basis.compressionEndpoint, 'peak-stress-strain')

  const atBetaZero = (label: string) => {
    const station = surface.stations.find((item) => item.label === label)
    assert.ok(station, `missing ${label}`)
    const point = surface.points.find((item) => item.beta === 0 && item.stationId === station.id)
    assert.ok(point, `missing beta=0 point for ${label}`)
    return point
  }
  const origin = netConcreteCentroid(section)
  const ordinates = section.solids.flatMap((solid) =>
    solid.outer.map((vertex) => vertex.y - origin.y)
  )
  const maxY = Math.max(...ordinates)
  const minY = Math.min(...ordinates)
  const strainAt = (point: ReturnType<typeof atBetaZero>, ordinate: number) =>
    point.state.e0 + point.state.kx * ordinate
  const close = (actual: number, expected: number) =>
    assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`)

  const pole = surface.points.find((point) => point.surfaceRole === 'pure-compression')
  assert.ok(pole)
  close(pole.state.e0, epsC2)

  const boundary = atBetaZero('c/D = 1')
  close(strainAt(boundary, maxY), epsCu2)
  close(strainAt(boundary, minY), 0)

  const domainFive = atBetaZero('c/D = 1.5')
  const ratio = 1.5
  const pivotDepthRatio = 1 - epsC2 / epsCu2
  const expectedCompression = epsC2 * ratio / (ratio - pivotDepthRatio)
  close(strainAt(domainFive, maxY), expectedCompression)
  close(strainAt(domainFive, minY), expectedCompression * (1 - 1 / ratio))
  assert.ok(expectedCompression > epsC2 && expectedCompression < epsCu2)
})

test('KDS Appendix compiles reduced strength ordinates without changing Es or fck-based strain parameters', () => {
  const basis = createKdsAppendixDesignBasis()
  const sets = buildResistanceMaterialSets(materials, basis)
  const referenceConcrete = compileConcreteMaterial(sets.referenceMaterials.concrete)
  const designConcrete = compileConcreteMaterial(sets.designMaterials.concrete)
  const eps0 = materials.concrete.limits.eps0 ?? 0.002
  assert.ok(Math.abs(designConcrete.stress(eps0) / referenceConcrete.stress(eps0) - 0.65) < 1e-12)
  assert.equal(sets.designMaterials.concrete.fck, sets.referenceMaterials.concrete.fck)
  assert.equal(sets.designMaterials.concrete.limits.eps0, sets.referenceMaterials.concrete.limits.eps0)
  assert.equal(sets.designMaterials.concrete.limits.epsCu, sets.referenceMaterials.concrete.limits.epsCu)

  const referenceSteel = compileSteelMaterial(sets.referenceMaterials.steel[0]!)
  const designSteel = compileSteelMaterial(sets.designMaterials.steel[0]!)
  assert.equal(designSteel.stress(0.0005), referenceSteel.stress(0.0005))
  assert.ok(Math.abs(designSteel.stress(0.01) / referenceSteel.stress(0.01) - 0.90) < 1e-12)
  assert.ok(Math.abs((designSteel.limits.epsYield ?? 0) - 0.9 * (referenceSteel.limits.epsYield ?? 0)) < 1e-15)
})

test('KDS Appendix uses eps_c0 at pure compression, has no global phi/cap, and applies e_min to demand', () => {
  const basis = createKdsAppendixDesignBasis()
  const sets = buildResistanceMaterialSets(materials, basis)
  const surface = buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, sets.stateMaterials),
    materials,
    basis,
    compactOptions()
  )
  const compression = surface.points.find((point) => point.surfaceRole === 'pure-compression')
  assert.ok(compression)
  assert.equal(compression.state.e0, materials.concrete.limits.eps0)
  const allCompression = surface.points.find((point) => point.station === 1 && point.beta === 0)
  assert.ok(allCompression)
  const origin = netConcreteCentroid(section)
  const strains = section.solids.flatMap((solid) => solid.outer.map((vertex) =>
    allCompression.state.e0 +
    allCompression.state.kx * (vertex.y - origin.y) +
    allCompression.state.ky * (vertex.x - origin.x)
  ))
  assert.ok(Math.min(...strains) > 0, 'the first bending station remains in the all-compression domain')
  assert.ok(Math.max(...strains) > (materials.concrete.limits.eps0 ?? 0))
  assert.ok(Math.max(...strains) < materials.concrete.limits.epsCu)
  assert.ok(surface.points.every((point) => point.surfaceRole !== 'axial-cap'))
  assert.ok(surface.points.every((point) => point.resistance?.factor == null))

  const result = checkLoadcaseUtilizationFromSurface(
    surface,
    createLoadCombination({ name: 'Appendix minimum eccentricity', P: compression.P * 0.25, Mx: 0, My: 0 })
  )
  assert.ok(result.codeAdjustedDemand)
  assert.ok((result.minimumEccentricityMm ?? 0) > 15)
  assert.ok(Math.hypot(result.codeAdjustedDemand.Mx, result.codeAdjustedDemand.My) > 0)
})

test('KDS Main and Appendix retain their expected pure-tension relation and distinct compression treatment', () => {
  const main = createKdsBasicDesignBasis()
  const appendix = createKdsAppendixDesignBasis()
  const mainSets = buildResistanceMaterialSets(materials, main)
  const appendixSets = buildResistanceMaterialSets(materials, appendix)
  const mainSurface = buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, mainSets.stateMaterials), materials, main, compactOptions()
  )
  const appendixSurface = buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, appendixSets.stateMaterials), materials, appendix, compactOptions()
  )
  const mainTension = Math.min(...mainSurface.points.map((point) => point.P))
  const appendixTension = Math.min(...appendixSurface.points.map((point) => point.P))
  assert.ok(Math.abs(appendixTension / mainTension - 0.90 / 0.85) < 1e-10)
  assert.ok(Math.max(...appendixSurface.points.map((point) => point.P)) > Math.max(...mainSurface.points.map((point) => point.P)))

  const mainP0 = sliceFixedPContour(mainSurface.points, 0, mainSurface.triangles)
  const appendixP0 = sliceFixedPContour(appendixSurface.points, 0, appendixSurface.triangles)
  const maxMoment = (contour: typeof mainP0) => Math.max(...contour.map((point) => Math.hypot(point.Mx, point.My)))
  const ratio = maxMoment(appendixP0) / maxMoment(mainP0)
  assert.ok(ratio > 0.8 && ratio < 1.25, `Unexpected zero-axial KDS method ratio: ${ratio}`)
})

/**
 * KDS 14 20 20:2022 Appendix 3.2(1). Written out independently of the engine so the assertions
 * below are a clause check, not a restatement of the implementation.
 */
const appendixDesignAxialStrength = (store: MaterialStore) => {
  const ring = (points: ReadonlyArray<{ x: number; y: number }>) => {
    let twiceArea = 0
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index]!
      const next = points[(index + 1) % points.length]!
      twiceArea += current.x * next.y - next.x * current.y
    }
    return Math.abs(twiceArea) / 2
  }
  const Ag = section.solids.reduce(
    (sum, solid) => sum + ring(solid.outer) - solid.holes.reduce((holes, hole) => holes + ring(hole), 0),
    0
  )
  const Ast = rebars.reduce((sum, bar) => sum + (Math.PI / 4) * bar.dia * bar.dia, 0)
  const steel = store.steel[0]!
  const eps0 = store.concrete.limits.eps0!
  const phiC = 0.65
  const phiS = 0.90
  const designYieldStrain = (phiS * steel.fy) / steel.elasticModulus
  // (3-2) when the design yield strain is reached at eps_c0, otherwise (3-3).
  const steelStress = designYieldStrain <= eps0 ? phiS * steel.fy : eps0 * steel.elasticModulus
  return {
    Pdo: phiC * 0.85 * store.concrete.fck * (Ag - Ast) + steelStress * Ast,
    equation: designYieldStrain <= eps0 ? '(3-2)' : '(3-3)'
  }
}

const kdsMaterialsAt = (fck: number, fy: number): MaterialStore => ({
  ...materials,
  concrete: applyKdsConcreteDerived({ ...materials.concrete, fck }),
  steel: materials.steel.map((steel) => ({
    ...steel,
    fy,
    limits: { ...steel.limits, epsY: fy / steel.elasticModulus }
  }))
})

for (const [fck, fy, expected] of [[30, 400, '(3-2)'], [60, 400, '(3-2)'], [60, 600, '(3-3)']] as const) {
  test(`stress-strain KDS Appendix reproduces clause ${expected} design axial strength at fck ${fck} / fy ${fy}`, () => {
    const store = kdsMaterialsAt(fck, fy)
    const clause = appendixDesignAxialStrength(store)
    assert.equal(clause.equation, expected, 'the fixture must exercise the intended clause branch')
    const basis = createKdsAppendixDesignBasis()
    const sets = buildResistanceMaterialSets(store, basis)
    const surface = buildDesignPreviewSurfaceFromPrepared(
      prepareAnalysis(section, rebars, sets.stateMaterials),
      store,
      basis,
      compactOptions()
    )
    const compression = Math.max(...surface.points.map((point) => point.P))
    assert.ok(
      Math.abs(compression / clause.Pdo - 1) < 1e-9,
      `Appendix ${clause.equation} expects ${clause.Pdo} N, the surface reported ${compression} N`
    )
  })
}

test('KDS Appendix rejects a concrete material with no eps_c0 instead of falling back to eps_cu', () => {
  const store: MaterialStore = {
    ...materials,
    concrete: { ...materials.concrete, limits: { ...materials.concrete.limits, eps0: undefined } }
  }
  const basis = createKdsAppendixDesignBasis()
  const sets = buildResistanceMaterialSets(store, basis)
  assert.throws(
    () => buildDesignPreviewSurfaceFromPrepared(
      prepareAnalysis(section, rebars, sets.stateMaterials),
      store,
      basis,
      compactOptions()
    ),
    (error: unknown) =>
      error instanceof AnalysisInputError &&
      error.code === 'INVALID_MATERIAL' &&
      /eps_c0/.test(error.message)
  )
  // The Main body never reads eps_c0, so the same material stays usable there.
  assert.ok(buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, buildResistanceMaterialSets(store, createKdsBasicDesignBasis()).stateMaterials),
    store,
    createKdsBasicDesignBasis(),
    compactOptions()
  ).points.length > 0)
})

test('the stress-strain inverse solves the same minimum-eccentricity demand the design check governs', () => {
  const basis = createKdsAppendixDesignBasis()
  const sets = buildResistanceMaterialSets(materials, basis)
  const prepared = prepareAnalysis(section, rebars, sets.stateMaterials)
  const surface = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, compactOptions())
  const concentric = createLoadCombination({
    name: 'Concentric',
    P: 0.25 * Math.max(...surface.points.map((point) => point.P)),
    Mx: 0,
    My: 0
  })

  const check = checkLoadcaseUtilizationFromSurface(surface, concentric)
  const contour = sliceFixedPContour(surface.points, concentric.P, surface.triangles)
  const inverse = solveInversePreviewFromPrepared(
    prepared,
    concentric,
    contour,
    codeAdjustedDemandOfCheck(check)
  )

  assert.ok(check.codeAdjustedDemand, 'the design check must apply e_min to a concentric demand')
  assert.equal(inverse.minimumEccentricityMm, check.minimumEccentricityMm)
  assert.deepEqual(inverse.codeAdjustedDemand, check.codeAdjustedDemand)
  assert.deepEqual(inverse.demand, concentric, 'the raw demand stays reported alongside the adjusted one')
  // The solved equilibrium belongs to the adjusted demand, not to the raw concentric one.
  const adjustedMoment = Math.hypot(check.codeAdjustedDemand!.Mx, check.codeAdjustedDemand!.My)
  const responseMoment = Math.hypot(inverse.response.Mx, inverse.response.My)
  assert.ok(adjustedMoment > 0)
  assert.ok(
    Math.abs(responseMoment / adjustedMoment - 1) < 1e-6,
    `equilibrium moment ${responseMoment} does not match the checked demand ${adjustedMoment}`
  )
  assert.match(inverse.message, /minimum eccentricity/)

  // Omitting the resolved demand keeps the historical raw-demand behaviour.
  const raw = solveInversePreviewFromPrepared(prepared, concentric, contour)
  assert.equal(raw.codeAdjustedDemand, undefined)
  assert.ok(Math.hypot(raw.response.Mx, raw.response.My) < 1e-6 * adjustedMoment)
})

test('minimum eccentricity does not touch a demand that already exceeds it, nor a tensile demand', () => {
  const basis = createKdsAppendixDesignBasis()
  const sets = buildResistanceMaterialSets(materials, basis)
  const surface = buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, sets.stateMaterials),
    materials,
    basis,
    compactOptions()
  )
  const P = 0.25 * Math.max(...surface.points.map((point) => point.P))
  const eccentric = checkLoadcaseUtilizationFromSurface(
    surface,
    createLoadCombination({ name: 'Eccentric', P, Mx: P * 400, My: 0 })
  )
  assert.equal(eccentric.codeAdjustedDemand, undefined)
  const tensile = checkLoadcaseUtilizationFromSurface(
    surface,
    createLoadCombination({ name: 'Tension', P: -1e5, Mx: 0, My: 0 })
  )
  assert.equal(tensile.codeAdjustedDemand, undefined)
})

test('EN two-pass migration preserves recommended fcd and fyd exactly', () => {
  const enMaterials = applyCalculationProfileToMaterials(materials, 'en-1992-1-1-2004-stress-strain')
  const basis = createEn1992DesignBasis()
  const sets = buildResistanceMaterialSets(enMaterials, basis)
  const designConcrete = compileConcreteMaterial(sets.designMaterials.concrete)
  const designSteel = compileSteelMaterial(sets.designMaterials.steel[0]!)
  const epsC2 = enMaterials.concrete.limits.eps0 ?? 0.002
  assert.ok(Math.abs(designConcrete.stress(epsC2) - enMaterials.concrete.fck / 1.5) < 1e-12)
  assert.ok(Math.abs(designSteel.stress(0.01) - enMaterials.steel[0]!.fy / 1.15) < 1e-12)
  assert.equal(sets.referenceMaterials.concrete.factors?.resistanceScale, undefined)
  assert.equal(sets.referenceMaterials.steel[0]!.factors?.resistanceScale, undefined)
})

test('factored ULS utilization uses the 3D proportional demand ray', () => {
  const basis = createKdsBasicDesignBasis()
  const sets = buildResistanceMaterialSets(materials, basis)
  const surface = buildDesignPreviewSurfaceFromPrepared(
    prepareAnalysis(section, rebars, sets.stateMaterials),
    materials,
    basis,
    compactOptions()
  )
  const tensionPole = surface.points.reduce((minimum, point) => (point.P < minimum.P ? point : minimum))
  const loadcase = createLoadCombination({
    name: 'Half pure-tension resistance',
    P: tensionPole.P / 2,
    Mx: 0,
    My: 0
  })
  const result = checkLoadcaseUtilizationFromSurface(surface, loadcase)

  assert.ok(result.proportionalUtilization != null)
  assert.ok(Math.abs(result.proportionalUtilization - 0.5) < 0.02)
  assert.equal(result.utilization, result.proportionalUtilization)
  assert.equal(result.adequate, true)

  const compressionPole = surface.points.find((point) => point.station === 0)
  assert.ok(compressionPole)
  const compressionResult = checkLoadcaseUtilizationFromSurface(
    surface,
    createLoadCombination({
      name: 'Half capped compression resistance',
      P: compressionPole.P / 2,
      Mx: 0,
      My: 0
    })
  )
  assert.ok(compressionResult.proportionalUtilization != null)
  assert.ok(Math.abs(compressionResult.proportionalUtilization - 0.5) < 0.02)
})
