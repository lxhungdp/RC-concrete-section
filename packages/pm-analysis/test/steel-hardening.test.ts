import assert from 'node:assert/strict'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput, type GeometryInput } from '@pm/geometry'
import { createDefaultMaterialStore, compileSteelMaterial, type SteelMaterial } from '@pm/materials'
import { buildResistanceMaterialSets, createKdsAppendixDesignBasis, withSteelModelModification } from '@pm/design'
import { applyCalculationProfileToMaterials, createAdaptiveAnalysisOptions, createAnalysisOptionsForProfile, createDesignBasisForCalculationProfile, createProjectDocument, createLoadCombination, parseProjectDocument } from '@pm/project'
import { buildDesignPreviewSurfaceFromPrepared, prepareAnalysis, evaluatePreparedState, buildStressStrainPointCalculationAudit, checkLoadcaseUtilizationFromSurface, solveInversePreviewFromPrepared, sliceFixedPContour } from '../src/index'
import { buildEquivalentBlockDesignSurfaceFromPrepared, prepareBlockAnalysis } from '@pm/analysis-equivalent-block'

const geometry: GeometryInput = {
  id: 1, name: 'Mixed ductility',
  outers: [{ id: 1, holes: [], points: [{ id: 1, x: -250, y: -350 }, { id: 2, x: 250, y: -350 }, { id: 3, x: 250, y: 350 }, { id: 4, x: -250, y: 350 }] }],
  rebars: [[-190, -290], [190, -290], [190, 290], [-190, 290], [0, -100], [0, 100]].map(([x, y], index) => ({ id: index + 1, x, y, dia: 25, steelMaterialId: index < 4 ? 1 : 2 }))
}
const section = sectionGeometryFromGeometryInput(geometry)
const rebars = geometryInputRebars(geometry)
const setup = (id: 'kds-2024-stress-strain' | 'en-1992-1-1-2004-stress-strain' | 'kds-142020-equivalent-block') => {
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), id)
  const base = materials.steel[0]
  materials.steel = [0.04, 0.006].map((limit, index): SteelMaterial => ({ ...base, id: index + 1, name: `Grade ${index + 1}`, fy: 400,
    stressStrain: { type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: 1.1 }, epsUk: limit * 1.2, strainLimit: { type: 'absolute', value: limit } } }))
  const basis = withSteelModelModification(createDesignBasisForCalculationProfile(id), materials)
  return { materials, basis }
}

for (const profileId of ['kds-2024-stress-strain', 'en-1992-1-1-2004-stress-strain'] as const) {
  test(`${profileId} adaptively evaluates a complete compatible mixed-grade hardening domain`, () => {
    const { materials, basis } = setup(profileId)
    const sets = buildResistanceMaterialSets(materials, basis)
    const prepared = prepareAnalysis(section, rebars, sets.stateMaterials)
    const options = createAdaptiveAnalysisOptions()
    if (options.methodId !== 'strain-domain-surface-v1') throw new Error('Invalid fixture mechanics.')
    options.directions.seed = { type: 'explicit', anglesDeg: [0, 90, 180, 270] }
    const surface = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, options)
    assert.equal(surface.strainDomain, 'steel-limited-ultimate')
    const points = surface.points.filter((point) => point.surfaceRole === 'physical-state')
    assert.ok(points.length > 0)
    let steelControlled = false
    for (const point of points) {
      const concretePeak = Math.max(...section.solids.flatMap((solid) => solid.outer).map((p) => point.state.e0 + point.state.kx * (p.y - prepared.origin.y) + point.state.ky * (p.x - prepared.origin.x)))
      assert.ok(concretePeak <= materials.concrete.limits.epsCu * (1 + 1e-9))
      if (concretePeak < 0 && Math.hypot(point.state.kx, point.state.ky) > 0) steelControlled = true
      for (const bar of rebars) {
        const strain = point.state.e0 + point.state.kx * (bar.y - prepared.origin.y) + point.state.ky * (bar.x - prepared.origin.x)
        const definition = sets.stateMaterials.steel.find((item) => item.id === bar.steelMaterialId)
        if (!definition) throw new Error('Missing fixture steel.')
        const limit = compileSteelMaterial(definition).limits.epsTensionUltimate
        assert.ok(limit !== undefined && -strain <= limit * (1 + 1e-9), `${bar.id}: ${strain} > ${limit}`)
      }
    }
    assert.ok(steelControlled, 'The boundary includes nonuniform all-tension states.')
    const point = points[Math.floor(points.length / 2)]
    const audit = buildStressStrainPointCalculationAudit(prepared, materials, basis, 'design', point)
    assert.equal(audit.kind, 'stress-strain')
    if (audit.kind !== 'stress-strain') throw new Error('Missing physical calculation audit.')
    assert.ok(audit.reconciliation.ok)
    assert.equal(evaluatePreparedState(prepared, point.state).total.P, point.ledger.total.P / (point.resistance?.factor ?? 1))
  })
}

test('KDS hardening is preserved by profile application, JSON and explicit modification evidence', () => {
  const { materials, basis } = setup('kds-2024-stress-strain')
  const applied = applyCalculationProfileToMaterials(materials, 'kds-2024-stress-strain')
  assert.deepEqual(applied.steel[0].stressStrain, materials.steel[0].stressStrain)
  const document = createProjectDocument({ calculationProfileId: 'kds-2024-stress-strain', geometry, materials, design: basis })
  const parsed = parseProjectDocument(document)
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
  if (!parsed.ok) return
  assert.equal(JSON.stringify(parsed.document.inputs.materials.steel), JSON.stringify(materials.steel))
  assert.equal(parsed.document.inputs.design.steelModelModified, true)
})

test('both KDS block stages use the declared hardening while the main-body axial cap retains fy', () => {
  const profileId = 'kds-142020-equivalent-block'
  const { materials, basis } = setup(profileId)
  const prepared = prepareBlockAnalysis(profileId, section, rebars, materials, basis)
  const law = prepared.model.steelLaws['1']
  const compiled = compileSteelMaterial(materials.steel[0])
  assert.equal(law.stressAt(-0.01), compiled.stress(-0.01))
  const plateau = structuredClone(materials)
  plateau.steel = plateau.steel.map((steel) => ({ ...steel, stressStrain: { type: 'elastic-perfectly-plastic' } }))
  const other = prepareBlockAnalysis(profileId, section, rebars, plateau, basis)
  if (!('axialCap' in prepared.model) || !('axialCap' in other.model)) throw new Error('KDS axial cap is missing.')
  assert.equal(prepared.model.axialCap(prepared.section), other.model.axialCap(other.section))
  const options = createAnalysisOptionsForProfile(profileId)
  if (options.methodId !== 'equivalent-block-surface-v1') throw new Error('Invalid fixture mechanics.')
  const surface = buildEquivalentBlockDesignSurfaceFromPrepared(prepared, options)
  assert.ok(surface.points.length > 0)
})

test('adaptive hardening feeds the governing check and a normal inverse solve with the same steel limits', () => {
  const { materials, basis } = setup('en-1992-1-1-2004-stress-strain')
  const sets = buildResistanceMaterialSets(materials, basis)
  const prepared = prepareAnalysis(section, rebars, sets.stateMaterials)
  const options = createAdaptiveAnalysisOptions()
  const surface = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, options)
  const state = { e0: -0.003, kx: 0, ky: 0 }
  const response = evaluatePreparedState(prepared, state).total
  const demand = createLoadCombination({ id: 1, name: 'Hardening inverse', ...response })
  const check = checkLoadcaseUtilizationFromSurface(surface, demand)
  assert.ok(check.proportionalUtilization !== null && check.proportionalUtilization > 0)
  assert.equal(surface.stationError.withinTolerance, true)
  assert.equal(surface.directionError.withinTolerance, true)
  assert.equal(check.utilizationInterval.evidence, 'adaptive-sampling-estimate')
  const inverse = solveInversePreviewFromPrepared(prepared, demand, sliceFixedPContour(surface.points, demand.P, surface.triangles))
  assert.ok(inverse.converged, inverse.message)
  assert.ok(inverse.admissibility.ok, inverse.message)
  assert.ok(Math.abs(inverse.state.e0 - state.e0) < 1e-8)
  assert.equal(inverse.admissibility.governingSteelLimit?.steelMaterialId, 2)
  assert.equal(inverse.admissibility.governingSteelLimit?.limit, 0.006)
})

test('an unused hardening grade cannot change the active plateau surface', () => {
  const { materials } = setup('kds-2024-stress-strain')
  const activeBars = rebars.map((bar) => ({ ...bar, steelMaterialId: 1 }))
  materials.steel[0].stressStrain = { type: 'elastic-perfectly-plastic' }
  const basis = createDesignBasisForCalculationProfile('kds-2024-stress-strain')
  const options = createAnalysisOptionsForProfile('kds-2024-stress-strain')
  if (options.methodId !== 'strain-domain-surface-v1') throw new Error('Invalid fixture mechanics.')
  options.directions.seed = { type: 'explicit', anglesDeg: [0, 90, 180, 270] }
  const surface = buildDesignPreviewSurfaceFromPrepared(prepareAnalysis(section, activeBars, materials), materials, basis, options)
  materials.steel = [materials.steel[0]]
  const other = buildDesignPreviewSurfaceFromPrepared(prepareAnalysis(section, activeBars, materials), materials, basis, options)
  assert.equal(surface.strainDomain, other.strainDomain)
  assert.deepEqual(surface.stations, other.stations)
  assert.deepEqual(surface.points, other.points)
})

test('Fixed hardening checks use the 2% margin and state that it is unvalidated', () => {
  const { materials, basis } = setup('kds-2024-stress-strain')
  const prepared = prepareAnalysis(section, rebars, materials)
  const options = createAnalysisOptionsForProfile('kds-2024-stress-strain')
  if (options.methodId !== 'strain-domain-surface-v1') throw new Error('Invalid fixture mechanics.')
  const surface = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, options)
  const check = checkLoadcaseUtilizationFromSurface(surface, createLoadCombination({ id: 2, name: 'Fixed domain', P: 100000, Mx: 1000000, My: 0 }))
  assert.ok(check.proportionalUtilization !== null)
  assert.equal(check.adequacy, check.proportionalUtilization <= 0.98 ? 'adequate' : check.proportionalUtilization > 1.02 ? 'inadequate' : 'indeterminate')
  assert.equal(check.utilizationInterval.evidence, 'fixed-grid-screening-margin')
  assert.match(check.message, /not a validated bound/)
})

test('KDS Appendix compiles reduced strength at the same Es exactly once in both mechanics', () => {
  const { materials } = setup('kds-142020-equivalent-block')
  const basis = withSteelModelModification(createKdsAppendixDesignBasis(), materials)
  const sets = buildResistanceMaterialSets(materials, basis)
  const block = prepareBlockAnalysis('kds-142020-equivalent-block', section, rebars, materials, basis)
  const design = compileSteelMaterial(sets.designMaterials.steel[0])
  const reference = compileSteelMaterial(sets.referenceMaterials.steel[0])
  assert.equal(block.designModel.steelLaws['1'].stressAt(-0.01), design.stress(-0.01))
  assert.equal(block.referenceModel.steelLaws['1'].stressAt(-0.01), reference.stress(-0.01))
  assert.equal(block.designModel.steelLaws['1'].stressAt(0.0001), 20)
  assert.equal(block.designModel.steelLaws['1'].yieldStrain, 360 / 200000)
  assert.notEqual(design.stress(-0.01), 0.9 * reference.stress(-0.01))
})

test('mixed-grade inverse diagnostics match an exhaustive check, including every violating bar', () => {
  const { materials } = setup('kds-2024-stress-strain')
  const prepared = prepareAnalysis(section, rebars, materials)
  for (const state of [
    { e0: -0.003, kx: 0, ky: 0 }, { e0: -0.007, kx: 0, ky: 0 },
    { e0: -0.041, kx: 0, ky: 0 }, { e0: -0.008, kx: 0.000001, ky: -0.000002 }
  ]) {
    const response = evaluatePreparedState(prepared, state).total
    const inverse = solveInversePreviewFromPrepared(prepared, createLoadCombination({ id: 1, name: 'Domain oracle', ...response }), [])
    assert.ok(inverse.converged, inverse.message)
    const violations = rebars.flatMap((bar) => {
      const definition = materials.steel.find((item) => item.id === bar.steelMaterialId)
      if (!definition) throw new Error('Missing test grade.')
      const law = compileSteelMaterial(definition)
      const strain = inverse.state.e0 + inverse.state.kx * (bar.y - prepared.origin.y) + inverse.state.ky * (bar.x - prepared.origin.x)
      const limit = strain < 0 ? law.limits.epsTensionUltimate : law.limits.epsCompressionUltimate
      return limit !== undefined && Math.abs(strain) > limit * (1 + 1e-9) ? [bar.id] : []
    })
    assert.deepEqual(inverse.admissibility.violations.filter((item) => item.code === 'STEEL_STRAIN_EXCEEDS_ULTIMATE').map((item) => item.rebarId), violations)
    assert.equal(inverse.ok, violations.length === 0)
  }
})

test('physical compression bounds cannot be silently exceeded by fixed-strain block mechanics', () => {
  const { materials, basis } = setup('kds-142020-equivalent-block')
  materials.steel[0].limits = { epsU: 0.0025 }
  assert.throws(() => prepareBlockAnalysis('kds-142020-equivalent-block', section, rebars, materials, basis), /physical steel compression limit/)
  const document = createProjectDocument({ calculationProfileId: 'kds-142020-equivalent-block', geometry, materials, design: basis })
  const invalid = structuredClone(document)
  Object.assign(invalid.inputs.materials.steel[0].limits ?? {}, { epsU: 'invalid' })
  assert.equal(parseProjectDocument(invalid).ok, false)
})

test('Adaptive hardening capacity agrees with an independently enumerated dense strain polygon', (context) => {
  const { materials, basis } = setup('en-1992-1-1-2004-stress-strain')
  const first = materials.steel[0].stressStrain
  if (first.type !== 'linear-hardening') throw new Error('Invalid test grade.')
  first.strainLimit = { type: 'absolute', value: 0.009 }
  const prepared = prepareAnalysis(section, rebars, buildResistanceMaterialSets(materials, basis).stateMaterials)
  const options = createAdaptiveAnalysisOptions()
  const surface = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, options)
  assert.ok(surface.directionError.withinTolerance && surface.stationError.withinTolerance)
  // Independent half-plane enumeration in (e0, kappa) for beta=0. The rectangle's exact
  // compression edge is y=350. EN point C supplies the all-compression pivot inequality.
  const ecu = materials.concrete.limits.epsCu
  const ec0 = materials.concrete.limits.eps0
  assert.ok(ec0 !== undefined)
  const constraints = [
    { a: 0, b: -1, c: 0 }, { a: 1, b: 350, c: ecu },
    { a: 1, b: 350 - 700 * (1 - ec0 / ecu), c: ec0 },
    ...rebars.map((bar) => ({ a: -1, b: -bar.y, c: bar.steelMaterialId === 1 ? 0.009 : 0.006 }))
  ]
  const corners: Array<{ e0: number; k: number }> = []
  for (let i = 0; i < constraints.length; i += 1) for (let j = i + 1; j < constraints.length; j += 1) {
    const x = constraints[i], y = constraints[j]
    const det = x.a * y.b - y.a * x.b
    if (det === 0) continue
    const e0 = (x.c * y.b - y.c * x.b) / det
    const k = (x.a * y.c - y.a * x.c) / det
    if (constraints.every((bound) => bound.a * e0 + bound.b * k <= bound.c + 1e-15) &&
      !corners.some((p) => Math.abs(p.e0 - e0) < 1e-15 && Math.abs(p.k - k) < 1e-18)) corners.push({ e0, k })
  }
  assert.ok(corners.length >= 4)
  const center = { e0: corners.reduce((sum, p) => sum + p.e0, 0) / corners.length,
    k: corners.reduce((sum, p) => sum + p.k, 0) / corners.length }
  const eScale = Math.max(...corners.map((p) => Math.abs(p.e0)))
  const kScale = Math.max(...corners.map((p) => p.k))
  corners.sort((a, b) => Math.atan2((a.k - center.k) / kScale, (a.e0 - center.e0) / eScale) - Math.atan2((b.k - center.k) / kScale, (b.e0 - center.e0) / eScale))
  const oracle = (divisions: number) => corners.flatMap((a, index) => {
    const b = corners[(index + 1) % corners.length]
    if (a.k === 0 && b.k === 0) return [] // Axial interior states do not define the ultimate meridian.
    return Array.from({ length: divisions + 1 }, (_, step) => {
      const t = step / divisions
      return evaluatePreparedState(prepared, { e0: a.e0 + (b.e0 - a.e0) * t, kx: a.k + (b.k - a.k) * t, ky: 0 }).total
    })
  })
  const capacity = (points: Array<{ P: number; Mx: number }>, demand: { P: number; Mx: number }) => {
    const lambdas: number[] = []
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1], b = points[i]
      const crossA = a.P * demand.Mx - a.Mx * demand.P
      const crossB = b.P * demand.Mx - b.Mx * demand.P
      if (crossA * crossB > 0 || crossA === crossB) continue
      const t = crossA / (crossA - crossB)
      const lambda = (a.Mx + (b.Mx - a.Mx) * t) / demand.Mx
      if (lambda > 0) lambdas.push(lambda)
    }
    assert.ok(lambdas.length > 0)
    return Math.min(...lambdas)
  }
  const coarse = oracle(300), dense = oracle(600)
  const comparisons: Array<{ P: number; Mx: number; relativeCapacityDifference: number }> = []
  for (const [P, Mx] of [[0, 50000000], [-500000, 20000000], [1000000, 50000000], [2000000, 20000000]]) {
    const demand = createLoadCombination({ id: 1, name: 'Independent strain polygon', P, Mx, My: 0 })
    const reference = capacity(dense, demand)
    assert.ok(Math.abs(capacity(coarse, demand) / reference - 1) < 0.0001, 'The independent dense reference must itself converge.')
    const check = checkLoadcaseUtilizationFromSurface(surface, demand)
    assert.ok(check.capacityMultiplier !== null)
    comparisons.push({ P, Mx, relativeCapacityDifference: check.capacityMultiplier / reference - 1 })
    assert.ok(Math.abs(check.capacityMultiplier / reference - 1) <= Math.max(surface.stationError.tolerance, surface.directionError.tolerance),
      JSON.stringify({ P, Mx, reference, actual: check.capacityMultiplier }))
    const nearBoundary = checkLoadcaseUtilizationFromSurface(surface, { ...demand, P: P * reference, Mx: Mx * reference })
    assert.ok(nearBoundary.proportionalUtilization !== null && Math.abs(nearBoundary.proportionalUtilization - 1) <= Math.max(surface.stationError.tolerance, surface.directionError.tolerance))
  }
  context.diagnostic(JSON.stringify({ independentDenseBoundaryComparisons: comparisons }))
})
