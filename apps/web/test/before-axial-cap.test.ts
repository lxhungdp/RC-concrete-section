import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { buildResistanceMaterialSets } from '@pm/design'
import { analysisMeshKernelOptions, createAdaptiveAnalysisOptions, createAdaptiveEquivalentBlockAnalysisOptions,
  parseProjectDocument } from '@pm/project'
import { activeDesignSurfaceDataset, axialCapExcludedPaths, checkLoadcaseUtilizationFromSurface,
  prepareAnalysis, resolveLoadcaseField, sliceMomentPlane } from '@pm/analysis'
import { buildExactDirectionFallback, buildPreviewSurfaceFallback, buildSectionFieldMapFallback,
  checkLoadcaseFallback } from '../application/analysis/fallback'

for (const adaptive of [false, true]) for (const file of [
  'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json',
  'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json'
]) test(`ENG-RES-001: cap fields use the same ray before Pmax without changing checks: ${file} adaptive=${adaptive}`, async () => {
  const parsed = parseProjectDocument(readFileSync(file, 'utf8'))
  assert.ok(parsed.ok)
  const { geometry, materials, design, calculationProfileId, loadings } = parsed.document.inputs
  const block = calculationProfileId === 'aci-318-19-22-equivalent-block'
  const analysis = adaptive ? block ? createAdaptiveEquivalentBlockAnalysisOptions() : createAdaptiveAnalysisOptions()
    : parsed.document.inputs.analysis
  const input = { section: sectionGeometryFromGeometryInput(geometry), rebars: geometryInputRebars(geometry),
    materialStore: materials, designBasis: design, analysisOptions: analysis, calculationProfileId }
  const { surface } = buildPreviewSurfaceFallback(input)
  assert.ok(surface.beforeAxialCap)
  assert.ok(surface.beforeAxialCap.points.every(point => point.surfaceRole !== 'axial-cap'))
  const cap = surface.bounds.P[1]
  const loadcase = block ? { id: 2, name: 'Cap controlled biaxial', actionBasis: 'factoredULS' as const,
    P: cap * 1.5, Mx: cap * 30, My: cap * 10 } : loadings.combinations[1]
  const before = JSON.stringify(surface)
  const expected = checkLoadcaseUtilizationFromSurface(surface, loadcase)
  const result = await checkLoadcaseFallback({ ...input, surface, loadcase })
  assert.equal(result.utilization, expected.utilization)
  assert.deepEqual(result.designCapacityPoint, expected.capacityPoint)
  assert.ok(expected.capacityPoint)
  assert.ok(Math.abs(expected.capacityPoint.P / cap - 1) <= 1e-12)
  if (!adaptive && !block) assert.equal(result.utilization, 1.4115695666188057, 'original ULS-2 check regression')
  const field = result.capacityField
  assert.equal(field?.status, 'available', field?.message)
  if (field?.status !== 'available') return
  assert.equal(field.boundary.kind, 'before-axial-cap')
  if (field.boundary.kind !== 'before-axial-cap') return
  assert.equal(field.boundary.limit, cap)
  assert.ok(field.admissibility.evaluated && field.admissibility.ok)
  assert.ok(field.response.P > cap)
  assert.ok(field.loadFactor > (expected.capacityMultiplier ?? Infinity))
  const forceScale = Math.max(...surface.bounds.P.map(Math.abs))
  const momentScale = Math.max(...surface.bounds.Mx.map(Math.abs), ...surface.bounds.My.map(Math.abs))
  for (const key of ['P', 'Mx', 'My'] as const) assert.ok(
    Math.abs(field.response[key] - field.loadFactor * loadcase[key]) / (key === 'P' ? forceScale : momentScale) <= 1e-8)
  const theta = Math.atan2(loadcase.My, loadcase.Mx)
  // Zero demand chooses theta=0. Approximate graph welding must still retain the exact cap plane.
  for (const angle of [0,theta]) {
    const excluded = axialCapExcludedPaths(sliceMomentPlane(surface.beforeAxialCap.points,angle,
      surface.beforeAxialCap.triangles).map(path=>path.points),cap)
    const solid = sliceMomentPlane(surface.points,angle,surface.triangles).flatMap(path=>path.points)
    for (const cut of excluded.flat().filter(point=>point.P===cap)) {
      assert.ok(solid.some(point=>point.P===cap && Math.hypot(point.Mx-cut.Mx,point.My-cut.My)/momentScale<=1e-10),
        'solid/dotted endpoints retain the exact cap plane even when nearby graph nodes are welded')
    }
  }
  const overlay = axialCapExcludedPaths(sliceMomentPlane(surface.beforeAxialCap.points, theta,
    surface.beforeAxialCap.triangles).map(path => path.points), cap)
  assert.ok(overlay.length > 0)
  assert.ok(overlay.every(path => path.every(point => point.P >= cap)))
  const beta = Math.atan2(field.state.ky, field.state.kx)
  const exact = buildExactDirectionFallback({ ...input, beta })
  assert.ok(exact.beforeAxialCap?.some(point => point.P > cap))
  const map = buildSectionFieldMapFallback({ ...input, state: field.state,
    blockState: field.equivalentBlock ? { neutralAxisAngle: field.equivalentBlock.neutralAxisAngle,
      neutralAxisDepth: field.equivalentBlock.neutralAxisDepth } : undefined })
  assert.ok(map.rebars.every(bar => bar.strain >= 0), 'the oracle uses the declared compression phi')
  assert.ok(design.format === 'globalResultantFactor')
  const phi = design.factors.phiCompressionOther
  assert.equal(field.resistance?.factor, phi)
  const expectedNominal = { P: 0, Mx: 0, My: 0 }
  const add = (f: number, x: number, y: number) => {
    expectedNominal.P += f; expectedNominal.Mx += f * y; expectedNominal.My += f * x
  }
  if (!block) {
    // Independent scalar laws and sums on the retained integration fibres; not a mesh/code oracle.
    assert.ok(analysis.methodId === 'strain-domain-surface-v1')
    const prepared = prepareAnalysis(input.section, input.rebars,
      buildResistanceMaterialSets(materials, design).stateMaterials, analysisMeshKernelOptions(analysis))
    const concrete = materials.concrete
    assert.equal(concrete.stressStrain.type, 'kds-parabolic')
    if (concrete.stressStrain.type !== 'kds-parabolic') return
    const law = concrete.stressStrain
    for (const fiber of prepared.fibers) {
      const strain = field.state.e0 + field.state.kx * fiber.y + field.state.ky * fiber.x
      assert.ok(strain <= law.epsCu)
      const sigmaC = strain <= 0 ? 0 : law.alpha * concrete.fck *
        (strain < law.eps0 ? 1 - (1 - strain / law.eps0) ** law.n : 1)
      const sigma = fiber.kind === 'concrete' ? sigmaC : (() => {
        const steel = materials.steel[0]
        return Math.max(-steel.fy, Math.min(steel.fy, steel.elasticModulus * strain)) - sigmaC
      })()
      add(fiber.area * sigma, fiber.x, fiber.y)
    }
    const first = await checkLoadcaseFallback({ ...input, surface, loadcase: loadings.combinations[0] })
    assert.ok(first.capacityField?.status === 'available')
    assert.equal(first.capacityField.boundary.kind, 'design', 'ULS-1 retains its permitted physical boundary field')
  } else {
    // Independent half-plane clipping and polygon first moments for the convex rectangular fixture.
    const trace = field.equivalentBlock
    assert.ok(trace)
    const nx = Math.cos(trace.neutralAxisAngle); const ny = Math.sin(trace.neutralAxisAngle)
    const polygon = input.section.solids[0].outer
    assert.equal(input.section.solids.length, 1)
    assert.equal(input.section.solids[0].holes.length, 0)
    const edge = Math.max(...polygon.map(p => nx * p.x + ny * p.y))
    const cut = edge - trace.blockDepth
    const clipped: {x:number;y:number}[] = []
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]; const b = polygon[(i + 1) % polygon.length]
      const da = nx * a.x + ny * a.y - cut; const db = nx * b.x + ny * b.y - cut
      if (da >= 0) clipped.push(a)
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db)
        clipped.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
      }
    }
    let twiceArea = 0; let cx = 0; let cy = 0
    for (let i = 0; i < clipped.length; i++) {
      const a = clipped[i]; const b = clipped[(i + 1) % clipped.length]
      const cross = a.x * b.y - b.x * a.y
      twiceArea += cross; cx += (a.x + b.x) * cross; cy += (a.y + b.y) * cross
    }
    cx /= 3 * twiceArea; cy /= 3 * twiceArea
    add(trace.compressionStress * Math.abs(twiceArea) / 2, cx - map.origin.x, cy - map.origin.y)
    for (const bar of map.rebars) {
      const steel = materials.steel[0]
      const stress = Math.max(-steel.fy, Math.min(steel.fy, steel.elasticModulus * bar.strain))
      const displaced = nx * bar.x + ny * bar.y >= cut ? trace.compressionStress : 0
      add((stress - displaced) * bar.area, bar.x - map.origin.x, bar.y - map.origin.y)
    }
  }
  for (const key of ['P', 'Mx', 'My'] as const) assert.ok(
    Math.abs(phi * expectedNominal[key] - field.response[key]) / (key === 'P' ? forceScale : momentScale) <= 1e-10,
    `${key}: independent concrete/steel/displaced-concrete replay`)
  const scaled = await checkLoadcaseFallback({ ...input, surface, loadcase: { ...loadcase,
    P: loadcase.P * 2, Mx: loadcase.Mx * 2, My: loadcase.My * 2 } })
  assert.ok(scaled.capacityField?.status === 'available')
  for (const key of ['e0', 'kx', 'ky'] as const) assert.ok(
    Math.abs(scaled.capacityField.state[key] - field.state[key]) <= 1e-10 * Math.max(1e-6, Math.abs(field.state[key])))
  assert.equal(JSON.stringify(checkLoadcaseUtilizationFromSurface(surface, loadcase)), JSON.stringify(expected))
  assert.equal(JSON.stringify(surface), before, 'field/overlay queries cannot mutate the governing domain')
  if (expected.adequacy === 'inadequate') {
    const selected = resolveLoadcaseField(result, analysis.methodId)
    assert.ok(selected.status === 'available' && selected.basis === 'capacity')
    assert.equal(selected.boundary.kind, 'before-axial-cap')
  }
  const { surface: uncapped } = buildPreviewSurfaceFallback({ ...input, designBasis: { ...design, axialCapEnabled: false } })
  assert.deepEqual(surface.beforeAxialCap, activeDesignSurfaceDataset(uncapped), 'retain the actual pre-cap Design dataset')
  assert.equal(uncapped.beforeAxialCap, undefined, 'disabled cap creates no excluded overlay')
})
