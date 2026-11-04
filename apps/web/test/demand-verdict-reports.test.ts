import assert from 'node:assert/strict'
import test from 'node:test'
import { checkLoadcasesUtilizationFromSurface } from '@pm/analysis'
import { createDefaultProjectInformation } from '@pm/project'
import { buildColumnReportModel } from '@pm/report/report-model'
import { buildPreviewSurfaceFallback } from '../application/analysis/fallback'
import { boundaryScaledLoads, routeName, verdictInput, verdictRoutes } from './support/demand-verdicts'

for (const route of verdictRoutes) for (const mode of ['fixed', 'adaptive'] as const) {
  test(`ENG-REP-001: report and table verdicts agree for ${routeName(route)}, ${mode}, both bases`, () => {
    const input = verdictInput(route, mode)
    const { surface } = buildPreviewSurfaceFallback(input)
    for (const checkBasis of ['proportional3D', 'constantAxial'] as const) {
      const loadcases = boundaryScaledLoads(surface, checkBasis, [0.91, 1, 1.1])
      const expected = checkLoadcasesUtilizationFromSurface(surface, loadcases, checkBasis)
      const report = buildColumnReportModel({ ...input, surface, loadcases, checkBasis,
        projectName: 'Verdict matrix', projectInformation: createDefaultProjectInformation(),
        sectionName: input.section.name, detailLoadcaseIds: [] })
      assert.deepEqual(report.combinations.map(row => row.verdict), expected.map(check => check.adequacy))
      assert.deepEqual(report.combinations.map(row => row.utilization), expected.map(check => check.utilization))
      assert.deepEqual(report.combinations.map(row => row.utilizationInterval), expected.map(check => check.utilizationInterval))
      assert.ok(report.combinations.every(row => row.checkBasis === checkBasis))
    }
  })
}
