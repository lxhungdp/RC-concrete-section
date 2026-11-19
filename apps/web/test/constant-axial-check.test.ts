import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { createKdsAppendixDesignBasis, minimumEccentricityCandidates } from '@pm/design'
import {
  createAdaptiveAnalysisOptions,
  createAdaptiveEquivalentBlockAnalysisOptions,
  demandCheckBasisOf,
  parseProjectDocument
} from '@pm/project'
import {
  activeDesignSurfaceDataset,
  checkLoadcaseUtilizationFromSurface,
  intersectFixedPContourWithMomentRay,
  intersectSurfaceAtConstantAxial,
  projectedBoundaryDepth,
  sectionBoundaryPoints,
  sliceActiveDesignPContour
} from '@pm/analysis'
import { buildPreviewSurfaceFallback, checkLoadcaseFallback } from '../application/analysis/fallback'

const STRESS_STRAIN = 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json'
const BLOCK = 'docs/examples/equivalent-block/ACI-EB-03-l-shape-8-bars.pm-project.json'

const projectInput = (file: string, adaptive = false) => {
  const parsed = parseProjectDocument(readFileSync(file, 'utf8'))
  assert.ok(parsed.ok)
  const { geometry, materials, analysis, design, calculationProfileId } = parsed.document.inputs
  const analysisOptions = !adaptive
    ? analysis
    : analysis.methodId === 'equivalent-block-surface-v1'
      ? createAdaptiveEquivalentBlockAnalysisOptions()
      : createAdaptiveAnalysisOptions()
  return { section: sectionGeometryFromGeometryInput(geometry), rebars: geometryInputRebars(geometry),
    materialStore: materials, analysisOptions, designBasis: design, calculationProfileId }
}

const load = (P: number, Mx: number, My: number) => ({ id: 1, name: 'Check', actionBasis: 'factoredULS' as const, P, Mx, My })

for (const file of [STRESS_STRAIN, BLOCK]) {
  test(`ENG-RES-001: constant-P ray agrees with the independent contour route: ${file}`, () => {
    const { surface } = buildPreviewSurfaceFallback(projectInput(file))
    const [minimum, maximum] = surface.bounds.P
    let compared = 0
    for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
      const P = minimum + fraction * (maximum - minimum)
      const contour = sliceActiveDesignPContour(surface, P)
      for (let octant = 0; octant < 8; octant += 1) {
        // Off the principal axes, so the moment direction never lands on a sampled strain direction.
        const theta = (octant + 0.37) * Math.PI / 4
        const crossing = intersectSurfaceAtConstantAxial(surface, load(P, 1e6 * Math.cos(theta), 1e6 * Math.sin(theta)))
        if (crossing.status !== 'crossing') continue
        const oracle = intersectFixedPContourWithMomentRay(contour, theta)
        assert.ok(oracle)
        const moment = Math.hypot(crossing.intersection.point.Mx, crossing.intersection.point.My)
        assert.ok(Math.abs(moment - oracle.M) <= 1e-6 * oracle.M, `${moment} versus ${oracle.M}`)
        compared += 1
      }
    }
    assert.ok(compared >= 16, `Only ${compared} directions published a ratio.`)
  })

  test(`ENG-RES-001: a demand on the boundary gives UR = 1 at constant P: ${file}`, () => {
    const { surface } = buildPreviewSurfaceFallback(projectInput(file))
    const P = surface.bounds.P[0] + 0.6 * (surface.bounds.P[1] - surface.bounds.P[0])
    const crossing = checkLoadcaseUtilizationFromSurface(surface, load(P, 3e6, 1e6), 'constantAxial')
    assert.ok(crossing.capacityPoint)
    const onBoundary = checkLoadcaseUtilizationFromSurface(surface, load(P, crossing.capacityPoint.Mx, crossing.capacityPoint.My), 'constantAxial')
    assert.ok(Math.abs(Number(onBoundary.utilization) - 1) <= 1e-9, String(onBoundary.utilization))
    assert.equal(onBoundary.capacityPoint?.P, P)
  })

  test(`ENG-RES-001: Fixed constant-P verdicts are CHECK only within the 2% margin: ${file}`, () => {
    const { surface } = buildPreviewSurfaceFallback(projectInput(file))
    const P = surface.bounds.P[0] + 0.6 * (surface.bounds.P[1] - surface.bounds.P[0])
    const boundary = checkLoadcaseUtilizationFromSurface(surface, load(P, 3e6, 1e6), 'constantAxial').capacityPoint
    assert.ok(boundary)
    const at = (ratio: number) => checkLoadcaseUtilizationFromSurface(surface, load(P, boundary.Mx * ratio, boundary.My * ratio), 'constantAxial')
    const ratios = [0.91, 0.975, 1, 1.025, 1.4]
    assert.deepEqual(ratios.map((ratio) => at(ratio).adequacy),
      ['adequate', 'adequate', 'indeterminate', 'inadequate', 'inadequate'])
    assert.equal(at(0.91).utilizationInterval.evidence, 'fixed-grid-screening-margin')
    assert.equal(at(0.91).utilizationInterval.relativeUncertainty, 0.02)
    assert.match(at(0.91).message, /project decision/)
  })

  test(`ENG-RES-001: every unavailable constant-P outcome stays typed: ${file}`, () => {
    const { surface } = buildPreviewSurfaceFallback(projectInput(file))
    const [minimum, maximum] = surface.bounds.P
    for (const P of [maximum * 1.01 + 1, minimum * 1.01 - 1]) {
      const outside = checkLoadcaseUtilizationFromSurface(surface, load(P, 1e6, 0), 'constantAxial')
      assert.equal(outside.adequacy, 'inadequate')
      assert.equal(outside.adequate, false)
      assert.equal(outside.utilization, null)
      assert.equal(outside.capacityPoint, null)
      assert.equal(outside.utilizationInterval.evidence, 'axial-outside-design-domain')
    }
    const axial = checkLoadcaseUtilizationFromSurface(surface, load((minimum + maximum) / 2, 0, 0), 'constantAxial')
    assert.equal(axial.constantAxialStatus, 'zero-moment')
    assert.equal(axial.utilization, null)
    assert.equal(axial.adequacy, 'indeterminate')
  })

  test(`ENG-RES-001: Adaptive evidence classifies constant-P demands on both sides of UR = 1: ${file}`, () => {
    const { surface } = buildPreviewSurfaceFallback(projectInput(file, true))
    assert.equal(surface.analysisOptions.samplingMode, 'adaptive')
    const P = surface.bounds.P[0] + 0.6 * (surface.bounds.P[1] - surface.bounds.P[0])
    const reference = checkLoadcaseUtilizationFromSurface(surface, load(P, 3e6, 1e6), 'constantAxial')
    assert.ok(reference.capacityPoint)
    const scaled = (factor: number) => checkLoadcaseUtilizationFromSurface(surface,
      load(P, reference.capacityPoint!.Mx * factor, reference.capacityPoint!.My * factor), 'constantAxial')
    assert.equal(scaled(0.5).adequacy, 'adequate')
    assert.equal(scaled(1.5).adequacy, 'inadequate')
    assert.equal(scaled(1.5).utilizationInterval.evidence, 'adaptive-sampling-estimate')
  })

  test(`ENG-RES-001: an NG constant-P field stays at Pu and carries the demand direction: ${file}`, async () => {
    const input = projectInput(file, true)
    const { surface } = buildPreviewSurfaceFallback(input)
    const P = surface.bounds.P[0] + 0.6 * (surface.bounds.P[1] - surface.bounds.P[0])
    const reference = checkLoadcaseUtilizationFromSurface(surface, load(P, 3e6, 1e6), 'constantAxial')
    assert.ok(reference.capacityPoint)
    const demand = load(P, reference.capacityPoint.Mx * 1.5, reference.capacityPoint.My * 1.5)
    const result = await checkLoadcaseFallback({ ...input, surface, checkBasis: 'constantAxial', loadcase: demand })
    assert.equal(result.designCheck.evaluated && result.designCheck.definition, 'constantAxial')
    assert.equal(result.designCheck.evaluated && result.designCheck.adequacy, 'inadequate')
    assert.equal(result.designCapacityPoint?.P, P)
    assert.equal(result.capacityField?.status, 'available')
    if (result.capacityField?.status !== 'available') return
    const { response } = result.capacityField
    const { residual, residualNorm, loadFactor } = result.capacityField
    const forceScale = Math.max(...surface.bounds.P.map(Math.abs), 1)
    const momentScale = Math.max(...surface.bounds.Mx.map(Math.abs), ...surface.bounds.My.map(Math.abs), 1)
    const expectedResidual = [response.P - demand.P, response.Mx - loadFactor * demand.Mx, response.My - loadFactor * demand.My]
    ;[residual.P, residual.Mx, residual.My].forEach((value, i) =>
      assert.ok(Math.abs(value - expectedResidual[i]) <= 1e-8 * (i === 0 ? forceScale : momentScale)))
    assert.ok(residualNorm <= 1e-8)
    // The block bridge uses its declared per-component normalization, not a fabricated zero norm.
    if (surface.mechanics === 'equivalent-rectangular-block') {
      assert.ok(Math.abs(residual.P) <= 1e-8 * forceScale)
    }
    assert.ok(Math.abs(response.P - P) <= 1e-6 * Math.max(Math.abs(surface.bounds.P[0]), Math.abs(surface.bounds.P[1])), `${response.P} versus ${P}`)
    const cross = response.Mx * demand.My - response.My * demand.Mx
    assert.ok(Math.abs(cross) <= 1e-6 * Math.hypot(response.Mx, response.My) * Math.hypot(demand.Mx, demand.My))
    // Exact state against the faceted crossing: refinement error, not a design tolerance.
    const faceted = Math.hypot(reference.capacityPoint.Mx, reference.capacityPoint.My)
    const relative = Math.abs(Math.hypot(response.Mx, response.My) - faceted) / faceted
    assert.ok(relative < 0.05, `Exact state differs from the faceted crossing by ${relative}.`)
  })
}

test('ENG-RES-001: a Fixed hardening domain classifies constant-P demands with the same margin', () => {
  const input = projectInput(STRESS_STRAIN)
  const materialStore = { ...input.materialStore, steel: input.materialStore.steel.map((steel) => ({ ...steel,
    stressStrain: { type: 'linear-hardening' as const, epsUk: 0.05, ultimateStrength: { type: 'ratio' as const, ratio: 1.08 },
      strainLimit: { type: 'factor' as const, value: 1 } } })) }
  const { surface } = buildPreviewSurfaceFallback({ ...input, materialStore })
  const P = surface.bounds.P[0] + 0.6 * (surface.bounds.P[1] - surface.bounds.P[0])
  const check = checkLoadcaseUtilizationFromSurface(surface, load(P, 1e6, 0), 'constantAxial')
  assert.equal(check.adequacy, 'adequate')
  assert.equal(check.utilizationInterval.evidence, 'fixed-grid-screening-margin')
})

test('the default basis is unchanged by the constant-P option', () => {
  const { surface } = buildPreviewSurfaceFallback(projectInput(STRESS_STRAIN))
  const demand = load(2e6, 800e6, 350e6)
  const implicit = checkLoadcaseUtilizationFromSurface(surface, demand)
  assert.deepEqual(checkLoadcaseUtilizationFromSurface(surface, demand, 'proportional3D'), implicit)
  assert.equal(implicit.utilization, implicit.proportionalUtilization)
  assert.equal('constantAxialStatus' in implicit, false)
  const held = checkLoadcaseUtilizationFromSurface(surface, demand, 'constantAxial')
  assert.equal(held.proportionalUtilization, implicit.proportionalUtilization)
  assert.equal(held.fixedPUtilization, implicit.fixedPUtilization)
})

test('KDS Appendix minimum eccentricity candidates are ranked by the selected basis', () => {
  const input = projectInput(STRESS_STRAIN)
  const designBasis = createKdsAppendixDesignBasis()
  const { surface } = buildPreviewSurfaceFallback({ ...input, designBasis })
  const boundary = sectionBoundaryPoints(input.section)
  const demand = load(surface.bounds.P[1] * 0.3, 0, 0)
  const candidates = minimumEccentricityCandidates(designBasis, demand, (nx, ny) => projectedBoundaryDepth(boundary, nx, ny))
  assert.ok(candidates.length > 0)
  const ratios = candidates.map((candidate) => {
    const crossing = intersectSurfaceAtConstantAxial(surface, { P: demand.P, Mx: candidate.Mx, My: candidate.My })
    assert.equal(crossing.status, 'crossing')
    return crossing.status === 'crossing' ? 1 / crossing.intersection.lambda : Number.NaN
  })
  const checked = checkLoadcaseUtilizationFromSurface(surface, demand, 'constantAxial')
  assert.ok(checked.codeAdjustedDemand)
  assert.equal(checked.utilization, Math.max(...ratios))
  assert.equal(activeDesignSurfaceDataset(surface).points.length > 0, true)
})

test('project JSON carries the basis and rejects an unknown value', () => {
  const text = readFileSync(STRESS_STRAIN, 'utf8')
  const parsed = parseProjectDocument(text)
  assert.ok(parsed.ok)
  assert.equal(demandCheckBasisOf(parsed.document.inputs.loadings), 'proportional3D')
  const declare = (checkBasis: unknown) => {
    const raw = JSON.parse(text)
    raw.inputs.loadings.checkBasis = checkBasis
    return parseProjectDocument(JSON.stringify(raw))
  }
  const declared = declare('constantAxial')
  assert.ok(declared.ok)
  assert.equal(declared.document.inputs.loadings.checkBasis, 'constantAxial')
  assert.equal(declare('nearest-angle').ok, false)
})
