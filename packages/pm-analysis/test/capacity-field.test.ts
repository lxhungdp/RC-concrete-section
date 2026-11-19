import assert from 'node:assert/strict'
import test from 'node:test'
import { createRectangleRing, createSectionSolid, geometryInputRebars, sectionGeometryFromGeometryInput, type SectionGeometry } from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import { buildResistanceMaterialSets, createKdsBasicDesignBasis, createKdsAppendixDesignBasis, createEn1992DesignBasis } from '@pm/design'
import { applyCalculationProfileToMaterials, createAdaptiveAnalysisOptions, createDefaultAnalysisOptions, createLoadCombination } from '@pm/project'
import { BENCH_CASES } from '../bench/sections'
import { buildDesignPreviewSurfaceFromPrepared, checkLoadcaseUtilizationFromSurface,
  evaluatePreparedState, prepareAnalysis } from '../src/index'
import { solveStressStrainCapacityFieldFromPrepared } from '../src/capacity-field'

test('ENG-RES-001: physical capacity fields retain the same ray state across demand scaling and both resistance formats', () => {
  for (const fixture of BENCH_CASES) for (const basis of [createKdsBasicDesignBasis(), createKdsAppendixDesignBasis(), createEn1992DesignBasis()]) {
    const materials = basis.profileId === 'en-1992-1-1-2004-default'
      ? applyCalculationProfileToMaterials(fixture.materials, 'en-1992-1-1-2004-stress-strain') : fixture.materials
    const section = sectionGeometryFromGeometryInput(fixture.geometry)
    const rebars = geometryInputRebars(fixture.geometry)
    const sets = buildResistanceMaterialSets(materials, basis)
    const prepared = prepareAnalysis(section, rebars, sets.stateMaterials)
    const surface = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, createDefaultAnalysisOptions())
    const forceScale = Math.max(...surface.bounds.P.map(Math.abs))
    const momentScale = Math.max(...surface.bounds.Mx.map(Math.abs), ...surface.bounds.My.map(Math.abs))
    const demand = createLoadCombination({ id: 1, name: fixture.key, P: forceScale * 0.1, Mx: momentScale * 0.7, My: momentScale * 0.3 })
    const before = JSON.stringify(checkLoadcaseUtilizationFromSurface(surface, demand))
    const field = solveStressStrainCapacityFieldFromPrepared(prepared, materials, basis, surface, demand)
    assert.equal(field.status, 'available', `${fixture.key} ${basis.format}: ${field.message}`)
    if (field.status !== 'available') continue
    assert.equal(field.admissibility.ok, true)
    assert.ok(field.residualNorm <= 1e-8)
    for (const key of ['P', 'Mx', 'My'] as const) {
      const scale = key === 'P' ? forceScale : momentScale
      assert.ok(Math.abs(field.response[key] - field.loadFactor * demand[key]) / scale <= 1e-8)
    }
    // Independent kernel replay catches interpolated-result or duplicated-resistance shortcuts.
    const ledger = evaluatePreparedState(prepared, field.state)
    const factor = basis.format === 'globalResultantFactor' ? field.resistance?.factor : 1
    assert.ok(typeof factor === 'number')
    for (const key of ['P', 'Mx', 'My'] as const) {
      assert.ok(Math.abs(field.response[key] - factor * ledger.total[key]) <= 8 * Number.EPSILON * Math.max(1, Math.abs(field.response[key])))
    }
    const outside = { ...demand, P: demand.P * field.loadFactor * 3,
      Mx: demand.Mx * field.loadFactor * 3, My: demand.My * field.loadFactor * 3 }
    const outsideField = solveStressStrainCapacityFieldFromPrepared(prepared, materials, basis, surface, outside)
    assert.equal(outsideField.status, 'available')
    if (outsideField.status === 'available') {
      for (const key of ['e0', 'kx', 'ky'] as const) {
        assert.ok(Math.abs(outsideField.state[key] - field.state[key]) <= 1e-10 * Math.max(1e-6, Math.abs(field.state[key])))
      }
      assert.ok(Math.abs(outsideField.loadFactor - 1 / 3) <= 1e-8)
    }
    assert.equal(JSON.stringify(checkLoadcaseUtilizationFromSurface(surface, demand)), before, 'field queries cannot change UR or verdict')
  }
})

test('ENG-AN-003: adaptive capacity fields preserve physical station coordinates in every bending quadrant', () => {
  const fixture = BENCH_CASES.find(item => item.key === 'l-shape')
  assert.ok(fixture)
  const basis = createKdsBasicDesignBasis()
  // 0.004 is an explicitly declared test-material limit, as in the existing admissibility cases;
  // it is not a code default or a limit inferred for steel definitions that omit rupture strain.
  for (const epsU of [undefined, 0.004]) {
  const materials = epsU === undefined ? fixture.materials : { ...fixture.materials,
    steel: fixture.materials.steel.map(steel => ({ ...steel, limits: { ...steel.limits, epsU } })) }
  const prepared = prepareAnalysis(sectionGeometryFromGeometryInput(fixture.geometry), geometryInputRebars(fixture.geometry), materials)
  const surface = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, createAdaptiveAnalysisOptions())
  const moment = Math.max(...surface.bounds.Mx.map(Math.abs), ...surface.bounds.My.map(Math.abs))
  const axial = Math.max(...surface.bounds.P.map(Math.abs))
  for (const [mx, my] of [[1, 0.4], [-1, 0.4], [-1, -0.4], [1, -0.4]]) {
    for (const p of [0, -0.05 * axial]) {
      const demand = createLoadCombination({ id: 1, P: p, Mx: mx * moment, My: my * moment })
      const field = solveStressStrainCapacityFieldFromPrepared(prepared, materials, basis, surface, demand)
      assert.equal(field.status, 'available', `${mx},${my},${p}: ${field.message}`)
      if (field.status === 'available') {
        assert.ok(field.residualNorm <= 1e-8)
        assert.equal(field.admissibility.ok, true)
        assert.ok(field.loadFactor > 0)
        assert.ok(Math.abs(field.admissibility.maxConcreteCompression / field.admissibility.concreteLimit - 1) <= 1e-8 ||
          (epsU !== undefined && Math.abs(field.admissibility.maxSteelTension / epsU - 1) <= 1e-8),
          'the refined biaxial state reaches an actual declared material boundary')
      }
    }
  }
  }
})

test('ENG-AN-003: uniform axial capacity fields reproduce independent rectangle concrete/steel force oracles', () => {
  const section: SectionGeometry = { id: 1, name: 'Axial capacity oracle',
    solids: [createSectionSolid(createRectangleRing({ width: 400, height: 500 }))] }
  const rebars = [-1, 1].flatMap((x, i) => [-1, 1].map((y, j) => ({ id: i * 2 + j + 1,
    x: x * 150, y: y * 200, dia: 20, area: 300, steelMaterialId: 1, solidIndex: 0 })))
  const materials = createDefaultMaterialStore()
  const basis = createKdsBasicDesignBasis()
  basis.axialCapEnabled = false
  const prepared = prepareAnalysis(section, rebars, materials)
  const surface = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis)
  const concrete = materials.concrete
  assert.equal(concrete.stressStrain.type, 'kds-parabolic')
  if (concrete.stressStrain.type !== 'kds-parabolic') return
  const concreteStress = concrete.fck * concrete.stressStrain.alpha
  const fy = materials.steel[0].fy
  assert.ok(concrete.limits.epsCu >= fy / materials.steel[0].elasticModulus)
  for (const sign of [1, -1]) {
    const demand = createLoadCombination({ id: 1, name: 'Axial', P: sign * 1e9, Mx: 0, My: 0 })
    const field = solveStressStrainCapacityFieldFromPrepared(prepared, materials, basis, surface, demand)
    assert.equal(field.status, 'available', field.message)
    if (field.status !== 'available') continue
    const expected = sign > 0
      ? basis.factors.phiCompressionOther * (concreteStress * (400 * 500 - 1200) + fy * 1200)
      : -basis.factors.phiTension * fy * 1200
    assert.ok(Math.abs(field.response.P - expected) <= Math.abs(expected) * 1e-12)
    assert.equal(field.state.kx, 0)
    assert.equal(field.state.ky, 0)
  }
  const cappedBasis = createKdsBasicDesignBasis()
  const capped = buildDesignPreviewSurfaceFromPrepared(prepared, materials, cappedBasis)
  const cappedField = solveStressStrainCapacityFieldFromPrepared(prepared, materials, cappedBasis, capped,
    createLoadCombination({ id: 1, P: 1e9, Mx: 0, My: 0 }))
  assert.equal(cappedField.status, 'available')
  if (cappedField.status === 'available') {
    assert.equal(cappedField.boundary.kind, 'before-axial-cap')
    assert.ok(Math.abs(cappedField.response.P - basis.factors.phiCompressionOther *
      (concreteStress * (400 * 500 - 1200) + fy * 1200)) <= Math.abs(cappedField.response.P) * 1e-12)
    assert.ok(cappedField.response.P > capped.bounds.P[1])
    assert.equal(cappedField.state.kx, 0)
    assert.equal(cappedField.state.ky, 0)
  }
  const missingPreCap = solveStressStrainCapacityFieldFromPrepared(prepared, materials, cappedBasis,
    { ...capped, beforeAxialCap: undefined }, createLoadCombination({ id: 1, P: 1e9, Mx: 0, My: 0 }))
  assert.equal(missingPreCap.status, 'unavailable')
  if (missingPreCap.status === 'unavailable') assert.equal(missingPreCap.reason, 'axial-cap')
  const zero = solveStressStrainCapacityFieldFromPrepared(prepared, materials, basis, surface,
    createLoadCombination({ id: 1, P: 0, Mx: 0, My: 0 }))
  assert.equal(zero.status, 'unavailable')
  if (zero.status === 'unavailable') assert.equal(zero.reason, 'zero-demand')
  const missing = solveStressStrainCapacityFieldFromPrepared(prepared, materials, basis, { ...surface, triangles: [] },
    createLoadCombination({ id: 1, P: 1e9, Mx: 0, My: 0 }))
  assert.equal(missing.status, 'unavailable')
  if (missing.status === 'unavailable') assert.equal(missing.reason, 'no-crossing')
  const invalid = solveStressStrainCapacityFieldFromPrepared(prepared, materials, basis, surface,
    { ...createLoadCombination({ id: 1 }), P: Number.NaN })
  assert.equal(invalid.status, 'unavailable')
  if (invalid.status === 'unavailable') assert.equal(invalid.reason, 'invalid-input')
  const brokenSeed = solveStressStrainCapacityFieldFromPrepared(prepared, materials, basis,
    { ...surface, points: surface.points.map(point => ({ ...point, stationCoordinate: -100 })) },
    createLoadCombination({ id: 1, P: 1e6, Mx: 3e8, My: 1e8 }))
  assert.equal(brokenSeed.status, 'unavailable')
  if (brokenSeed.status === 'unavailable') assert.equal(brokenSeed.reason, 'non-converged')
})
