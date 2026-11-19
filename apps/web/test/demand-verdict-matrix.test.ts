import assert from 'node:assert/strict'
import test from 'node:test'
import { checkLoadcaseUtilizationFromSurface, checkLoadcasesUtilizationFromSurface, type PreviewSurface } from '@pm/analysis'
import { createLoadCombination } from '@pm/project'
import { buildPreviewSurfaceFallback, checkLoadcasesFallback } from '../application/analysis/fallback'
import { boundaryScaledLoads, finiteSteelRoutes, intervalVerdict, routeName, verdictInput, verdictRoutes } from './support/demand-verdicts'

for (const route of [...verdictRoutes, ...finiteSteelRoutes]) for (const mode of ['fixed', 'adaptive'] as const) {
  test(`ENG-RES-001: unified verdicts, ${routeName(route)}, ${mode}, both bases`, () => {
    const { surface } = buildPreviewSurfaceFallback(verdictInput(route, mode))
    const uncertainty = mode === 'fixed' ? 0.02 :
      surface.directionError.withinTolerance && surface.stationError.withinTolerance
        ? Math.max(surface.directionError.maxRelativeComponent, surface.stationError.maxRelative) : null
    for (const basis of ['proportional3D', 'constantAxial'] as const) {
      const loads = boundaryScaledLoads(surface, basis)
      const checks = checkLoadcasesUtilizationFromSurface(surface, loads, basis)
      assert.deepEqual(checkLoadcasesFallback({ surface, loadcases: loads, checkBasis: basis }), checks)
      checks.forEach((check, index) => {
        assert.ok(check.utilization !== null)
        assert.ok(Math.abs(check.utilization - [0.91, 0.975, 1, 1.025, 1.1][index]) < 1e-9)
        assert.equal(check.adequacy, intervalVerdict(check.utilization, uncertainty))
        assert.equal(check.adequate, check.adequacy === 'indeterminate' ? null : check.adequacy === 'adequate')
        assert.equal(check.utilizationInterval.relativeUncertainty, uncertainty)
        assert.deepEqual(checkLoadcaseUtilizationFromSurface(surface, loads[index], basis), check)
        if (check.adequacy === 'indeterminate') {
          assert.match(check.message, uncertainty === null ? /sampling has not converged/ : /interval crosses UR = 1/)
        }
      })
      if (uncertainty !== null) {
        assert.equal(checks[0].adequacy, 'adequate', 'UR 0.91 must not be forced to CHECK by the code or mechanics')
        assert.equal(checks[4].adequacy, 'inadequate', 'UR 1.1 must not be forced to CHECK by the code or mechanics')
      }
      const zero = checkLoadcaseUtilizationFromSurface(surface, createLoadCombination(), basis)
      assert.equal(zero.utilization, basis === 'proportional3D' ? 0 : null)
      assert.equal(zero.adequacy, basis === 'proportional3D' ? intervalVerdict(0, uncertainty) : 'indeterminate')
      for (const P of [surface.bounds.P[0] * 0.5, surface.bounds.P[1] * 0.5]) {
        const axial = checkLoadcaseUtilizationFromSurface(surface, createLoadCombination({ P }), basis)
        if (basis === 'proportional3D') {
          assert.ok(axial.utilization !== null && axial.utilization > 0, 'pure axial demand must retain axial utilization')
          assert.equal(axial.adequacy, intervalVerdict(axial.utilization, uncertainty))
        } else if (!axial.codeAdjustedDemand) {
          assert.equal(axial.constantAxialStatus, 'zero-moment')
          assert.equal(axial.adequacy, 'indeterminate')
        } else {
          assert.ok(axial.utilization !== null, 'minimum-eccentricity demand is checked with its nonzero moment')
          assert.equal(axial.adequacy, intervalVerdict(axial.utilization, uncertainty))
        }
      }
      for (const P of [surface.bounds.P[0] - 1, surface.bounds.P[1] + 1]) {
        const result = checkLoadcaseUtilizationFromSurface(surface, createLoadCombination({ P, Mx: 1e6, My: 0 }), 'constantAxial')
        assert.equal(result.adequacy, 'inadequate')
        assert.equal(result.utilization, null)
        assert.equal(result.constantAxialStatus, 'axial-outside-domain')
      }
    }
  })
}

test('ENG-RES-001: exhausted block surfaces explain CHECK away from UR = 1', () => {
  const input = verdictInput({ profileId: 'aci-318-19-22-equivalent-block', appendix: false }, 'adaptive', 'KDS-EB-02-hollow-8-bars')
  if (input.analysisOptions.directions.refinement.type !== 'adaptive') throw new Error('Adaptive fixture required.')
  input.analysisOptions.directions.refinement.maxPasses = 0
  const { surface } = buildPreviewSurfaceFallback(input)
  assert.equal(surface.directionError.withinTolerance, false)
  for (const basis of ['proportional3D', 'constantAxial'] as const) {
    for (const load of boundaryScaledLoads(surface, basis, [0.91, 1.1])) {
      const check = checkLoadcaseUtilizationFromSurface(surface, load, basis)
      assert.equal(check.adequacy, 'indeterminate')
      assert.equal(check.utilizationInterval.lower, null)
      assert.match(check.message, /Adaptive direction sampling has not converged/)
      assert.doesNotMatch(check.message, /interval crosses|use Adaptive/)
    }
  }
})

test('ENG-RES-001: unavailable queries and missing evidence retain distinct diagnostics', () => {
  const { surface } = buildPreviewSurfaceFallback(verdictInput(verdictRoutes[0], 'adaptive'))
  const load = boundaryScaledLoads(surface, 'proportional3D', [0.91])[0]
  for (const missing of ['direction', 'station', 'both', 'invalid'] as const) {
    const changed: PreviewSurface = { ...surface,
      directionError: { ...surface.directionError, withinTolerance: missing !== 'direction' && missing !== 'both',
        maxRelativeComponent: missing === 'invalid' ? Number.NaN : surface.directionError.maxRelativeComponent },
      stationError: { ...surface.stationError, withinTolerance: missing !== 'station' && missing !== 'both' }
    }
    const check = checkLoadcaseUtilizationFromSurface(changed, load)
    assert.equal(check.adequacy, 'indeterminate')
    assert.match(check.message, missing === 'invalid' ? /missing or invalid/ :
      new RegExp(`Adaptive ${missing === 'both' ? 'direction and station' : missing} sampling has not converged`))
    assert.doesNotMatch(check.message, /interval crosses/)
  }
  const zero = checkLoadcaseUtilizationFromSurface(surface, createLoadCombination(), 'constantAxial')
  assert.equal(zero.constantAxialStatus, 'zero-moment')
  assert.equal(zero.adequacy, 'indeterminate')
  assert.doesNotMatch(zero.message, /interval crosses/)
  const noCrossing = checkLoadcaseUtilizationFromSurface({ ...surface, points: [], triangles: [] }, load)
  assert.equal(noCrossing.adequacy, 'indeterminate')
  assert.match(noCrossing.message, /No proportional demand-ray crossing/)
  assert.doesNotMatch(noCrossing.message, /interval crosses/)
})
