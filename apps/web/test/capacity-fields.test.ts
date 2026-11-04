import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRectangleRing, createSectionSolid, geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import { createKdsBasicDesignBasis } from '@pm/design'
import { createDefaultAnalysisOptions, parseProjectDocument } from '@pm/project'
import { activeDesignSurfaceDataset, checkLoadcaseUtilizationFromSurface, resolveLoadcaseField, sliceMomentPlane } from '@pm/analysis'
import { buildPreviewSurfaceFallback, buildSectionFieldMapFallback, checkLoadcaseFallback } from '../application/analysis/fallback'

for (const file of ['docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json',
  'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json']) {
  test(`ENG-RES-001: OK and NG select the mechanics-specific field and retain curves: ${file}`, async () => {
    const parsed = parseProjectDocument(readFileSync(file, 'utf8'))
    assert.ok(parsed.ok)
    const { geometry, materials, analysis, design, calculationProfileId } = parsed.document.inputs
    const input = { section: sectionGeometryFromGeometryInput(geometry), rebars: geometryInputRebars(geometry),
      materialStore: materials, analysisOptions: analysis, designBasis: design, calculationProfileId }
    const { surface } = buildPreviewSurfaceFallback(input)
    const seed = { id: 1, name: 'Biaxial NG', actionBasis: 'factoredULS' as const, P: 2e6, Mx: 800e6, My: 350e6 }
    const crossing = checkLoadcaseUtilizationFromSurface(surface, seed).capacityPoint
    assert.ok(crossing)
    for (const scale of [0.5, 2, 5]) {
      const demand = { ...seed, P: crossing.P * scale, Mx: crossing.Mx * scale, My: crossing.My * scale }
      const expected = checkLoadcaseUtilizationFromSurface(surface, demand)
      const result = await checkLoadcaseFallback({ ...input, surface, checkBasis: 'proportional3D', loadcase: demand })
      assert.equal(result.utilization, expected.utilization)
      assert.deepEqual(result.designCapacityPoint, expected.capacityPoint)
      assert.equal(result.designCheck.evaluated && result.designCheck.adequacy, expected.adequacy)
      assert.equal(result.capacityField?.status, 'available')
      if (result.capacityField?.status !== 'available') continue
      const field = result.capacityField
      const displayed = resolveLoadcaseField(result, surface.analysisOptions.methodId)
      assert.ok(displayed.status === 'available')
      const atCapacity = analysis.methodId === 'equivalent-block-surface-v1' || expected.adequacy === 'inadequate'
      assert.equal(displayed.basis, atCapacity ? 'capacity' : 'demand')
      assert.equal(displayed.state, atCapacity ? field.state : result.state)
      assert.equal(displayed.response, atCapacity ? field.response : result.response)
      const map = buildSectionFieldMapFallback({ ...input, state: displayed.state,
        blockState: displayed.equivalentBlock ? { neutralAxisAngle: displayed.equivalentBlock.neutralAxisAngle,
          neutralAxisDepth: displayed.equivalentBlock.neutralAxisDepth } : undefined })
      assert.equal(map.rebars.length, input.rebars.length)
      assert.ok(map.rebars.every(bar => [bar.strain, bar.stress, bar.force].every(Number.isFinite)))
      const dataset = activeDesignSurfaceDataset(surface)
      const curves = sliceMomentPlane(dataset.points, Math.atan2(demand.My, demand.Mx), dataset.triangles)
      assert.ok(curves.length > 0)
      assert.ok(curves.every(path => path.closed))
      if (calculationProfileId === 'kds-2024-stress-strain' && scale >= 2) assert.equal(result.ok, false,
        'failed full-demand inverse must not prevent a valid capacity field')
    }
    const zero = await checkLoadcaseFallback({ ...input, surface, checkBasis: 'proportional3D', loadcase: { ...seed, P: 0, Mx: 0, My: 0 } })
    assert.equal(zero.utilization, 0)
    assert.equal(zero.capacityField?.status, 'unavailable')
    if (zero.capacityField?.status === 'unavailable') assert.equal(zero.capacityField.reason, 'zero-demand')
  })
}

test('ENG-RES-001: OK stress-strain fields recover two independent demand-strain oracles', async () => {
  const materials = createDefaultMaterialStore()
  const concrete = materials.concrete
  assert.equal(concrete.stressStrain.type, 'kds-parabolic')
  if (concrete.stressStrain.type !== 'kds-parabolic') return
  const rebars = [-1, 1].flatMap((x, i) => [-1, 1].map((y, j) => ({ id: i * 2 + j + 1,
    x: 150 * x, y: 200 * y, dia: 20, area: 300, steelMaterialId: 1, solidIndex: 0 })))
  const input = { section: { id: 1, name: 'Uniform demand oracle',
    solids: [createSectionSolid(createRectangleRing({ width: 400, height: 500 }))] },
    rebars, materialStore: materials, designBasis: createKdsBasicDesignBasis(),
    analysisOptions: createDefaultAnalysisOptions(), calculationProfileId: 'kds-2024-stress-strain' as const }
  const { surface } = buildPreviewSurfaceFallback(input)
  const before = JSON.stringify(surface)
  const states = []
  for (const strain of [0.0002, 0.0004]) {
    // Independent uniform-section arithmetic, including displaced concrete; no production evaluator.
    const sigmaConcrete = concrete.stressStrain.alpha * concrete.fck *
      (1 - (1 - strain / concrete.stressStrain.eps0) ** concrete.stressStrain.n)
    const sigmaSteel = materials.steel[0].elasticModulus * strain
    assert.ok(sigmaSteel < materials.steel[0].fy)
    const demand = { id: 1, name: 'Uniform demand', actionBasis: 'factoredULS' as const,
      P: sigmaConcrete * (400 * 500 - 1200) + sigmaSteel * 1200, Mx: 0, My: 0 }
    const expectedCheck = checkLoadcaseUtilizationFromSurface(surface, demand)
    assert.equal(expectedCheck.adequacy, 'adequate')
    const result = await checkLoadcaseFallback({ ...input, surface, checkBasis: 'proportional3D', loadcase: demand })
    const field = resolveLoadcaseField(result, surface.analysisOptions.methodId)
    assert.equal(field.status, 'available')
    if (field.status !== 'available') return
    assert.equal(field.basis, 'demand')
    assert.equal(field.state, result.state)
    assert.ok(Math.abs(field.state.e0 - strain) <= 1e-10, 'displayed demand strain matches the independent axial oracle')
    const map = buildSectionFieldMapFallback({ ...input, state: field.state })
    assert.ok(map.rebars.every(bar => Math.abs(bar.stress - sigmaSteel) <= 1e-5))
    assert.equal(result.utilization, expectedCheck.utilization)
    assert.deepEqual(result.designCapacityPoint, expectedCheck.capacityPoint)
    states.push(field.state.e0)
  }
  assert.ok(states[1] > states[0], 'the OK stress-strain field changes with demand')
  assert.equal(JSON.stringify(surface), before, 'demand field selection cannot change the resistance surface')
})
