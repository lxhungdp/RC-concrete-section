import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { AnalysisInputError, checkLoadcasesUtilizationFromSurface } from '@pm/analysis'
import { createAnalysisExecution } from '../../application/analysis/execution'
import { verdictInput } from '../support/demand-verdicts'
import { buildDemandPmGeometry } from '@pm/analysis'
import { buildColumnReportModel } from '@pm/report/report-model'
import { applyCalculationProfileToMaterials, createAnalysisOptionsForProfile,
  createDefaultProjectInformation, createDesignBasisForCalculationProfile, parseProjectDocument } from '@pm/project'

test('ENG-MAT-001/006: P16 UMD converts to both KDS mechanics with separate Nominal/Design curves and completed checks', async () => {
  const parsed = parseProjectDocument(readFileSync('docs/examples/reference-case/projects/P16_Column_ULS.pm-project.json', 'utf8'))
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
  const { geometry, materials, loadings } = parsed.document.inputs
  const execution = createAnalysisExecution()
  for (const calculationProfileId of ['kds-2024-stress-strain', 'kds-142020-equivalent-block'] as const) {
    const input = { calculationProfileId, section: sectionGeometryFromGeometryInput(geometry),
      rebars: geometryInputRebars(geometry), materialStore: applyCalculationProfileToMaterials(materials, calculationProfileId),
      analysisOptions: createAnalysisOptionsForProfile(calculationProfileId), designBasis: createDesignBasisForCalculationProfile(calculationProfileId) }
    const surface = execution.buildSurface(input)
    const nominalTension = Math.min(...surface.nominalPoints.map(point => point.P))
    const designTension = Math.min(...surface.points.map(point => point.P))
    // Independent endpoint scaling oracle: the unchanged KDS Main-body tension factor is 0.85.
    assert.ok(Math.abs(designTension / nominalTension - 0.85) < 1e-12)
    assert.equal(surface.calculationProfileId, calculationProfileId)
    for (const checkBasis of ['proportional3D', 'direct2D', 'constantAxial'] as const) {
      const checks = await execution.checkLoadcases({ surface, loadcases: loadings.combinations,
        checkBasis, preparedInputs: input })
      assert.equal(checks.length, 6)
      for (const loadcase of loadings.combinations) {
        const detail = await execution.checkLoadcase({ ...input, surface, loadcase, checkBasis })
        const check = checks.find(item => item.loadcaseId === loadcase.id)
        assert.ok(check)
        assert.equal(detail.utilization, check.utilization)
        assert.equal(detail.designCheck.evaluated, true)
        if (detail.designCheck.evaluated) assert.equal(detail.designCheck.definition, checkBasis)
      }
    }
  }
})

for (const profileId of ['kds-2024-stress-strain', 'kds-142020-equivalent-block'] as const) {
  test(`ENG-AN-003: ${profileId} 2D batch, detail and report share a projected Design crossing`, async () => {
    const execution = createAnalysisExecution()
    const input = verdictInput({ profileId, appendix: false }, 'fixed')
    const surface = execution.buildSurface(input)
    const loadcase = { id: 1, name: '2D demand', actionBasis: 'factoredULS' as const, P: 1e6, Mx: 90e6, My: 38e6 }
    const [check] = await execution.checkLoadcases({ surface, loadcases: [loadcase], checkBasis: 'direct2D', preparedInputs: input })
    const detail = await execution.checkLoadcase({ ...input, surface, loadcase, checkBasis: 'direct2D' })
    const hit = check.direct2D?.crossing
    assert.ok(hit && detail.direct2DCurve)
    assert.deepEqual(detail.direct2D, check.direct2D)
    assert.equal(detail.utilization, check.utilization)
    const geometry = buildDemandPmGeometry({ surface, exact: detail.direct2DCurve, inspectionBeta: 0,
      demand: loadcase, governingPoint: check.capacityPoint, basis: 'direct2D', stored2D: detail.direct2D, showTheta: false })
    const path = geometry.design[hit.segment.path]
    const a = path[hit.segment.segment], b = path[hit.segment.segment + 1]
    const md = Math.hypot(loadcase.Mx, loadcase.My)
    const fraction = (loadcase.P * a.M - md * a.P) / (md * (b.P - a.P) - loadcase.P * (b.M - a.M))
    assert.ok(Math.abs(fraction - hit.segment.fraction) < 1e-9)
    assert.ok(Math.abs(md / hit.M - check.utilization!) < 1e-9)
    const report = buildColumnReportModel({ ...input, surface, loadcases: [loadcase],
      checkBasis: 'direct2D', projectName: '2D', projectInformation: createDefaultProjectInformation(),
      sectionName: input.section.name, detailLoadcaseIds: [1] })
    assert.equal(report.combinations[0].utilization, check.utilization)
    assert.equal(report.combinations[0].checkBasis, 'direct2D')
    assert.equal(report.details[0].interaction.kind, 'direct-beta')
  })

  test(`AUD-008: ${profileId} execution reuses only matching surfaces and reproduces kernel checks`, () => {
    const execution = createAnalysisExecution()
    const input = verdictInput({ profileId, appendix: false }, 'fixed')
    const surface = execution.buildSurface(input)
    assert.equal(execution.buildSurface(input), surface)
    const seed = surface.points.find((point) => point.P > 0 && Math.hypot(point.Mx, point.My) > 1e6)
    assert.ok(seed)
    const loadcases = [{ id: 1, name: 'Execution oracle', actionBasis: 'factoredULS' as const,
      P: seed.P * 0.7, Mx: seed.Mx * 0.7, My: seed.My * 0.7 }]
    for (const checkBasis of ['proportional3D', 'constantAxial'] as const) {
      assert.deepEqual(execution.checkLoadcases({ surface, loadcases, checkBasis }),
        checkLoadcasesUtilizationFromSurface(surface, loadcases, checkBasis))
      assert.equal(execution.buildSurface(input), surface)
    }
    const changed = { ...input, section: { ...input.section, name: 'Different snapshot' } }
    assert.notEqual(execution.buildSurface(changed), surface)
  })
}

test('AUD-002/008: both backend routes expose the same typed material failure to transports', () => {
  for (const profileId of ['kds-2024-stress-strain', 'kds-142020-equivalent-block'] as const) {
    const input = verdictInput({ profileId, appendix: false }, 'fixed')
    input.materialStore.steel[0].limits = { ...input.materialStore.steel[0].limits, epsY: 0.02 }
    assert.throws(() => createAnalysisExecution().buildSurface(input),
      (error: unknown) => error instanceof AnalysisInputError && error.code === 'INVALID_MATERIAL')
  }
})
