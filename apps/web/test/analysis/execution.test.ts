import assert from 'node:assert/strict'
import test from 'node:test'
import { AnalysisInputError, checkLoadcasesUtilizationFromSurface } from '@pm/analysis'
import { createAnalysisExecution } from '../../application/analysis/execution'
import { verdictInput } from '../support/demand-verdicts'

for (const profileId of ['kds-2024-stress-strain', 'kds-142020-equivalent-block'] as const) {
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
