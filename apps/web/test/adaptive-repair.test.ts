import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPreviewSurfaceFallback } from '../application/analysis/fallback'
import { boundaryScaledLoads, verdictInput, type VerdictRoute, type VerdictShape } from './support/demand-verdicts'
import { checkLoadcaseUtilizationFromSurface } from '@pm/analysis'

const cases: Array<[VerdictRoute, VerdictShape]> = [
  [{ profileId: 'aci-318-19-22-equivalent-block', appendix: false }, 'KDS-EB-02-hollow-8-bars'],
  ...['KDS-EB-02-hollow-8-bars', 'KDS-EB-03-l-shape-8-bars', 'KDS-EB-04-two-islands-8-bars'].map(shape =>
    [{ profileId: 'as-3600-2018-amd2-equivalent-block', appendix: false }, shape] as [VerdictRoute, VerdictShape]),
  ...[false, true].map(appendix => [{ profileId: 'kds-142020-equivalent-block', appendix }, 'KDS-EB-03-l-shape-8-bars'] as [VerdictRoute, VerdictShape]),
  [{ profileId: 'custom-equivalent-block', appendix: false }, 'KDS-EB-03-l-shape-8-bars']
]
for (const [route, shape] of cases) test(`ENG-AN-002: matched-row refinement converges ${route.profileId}/${route.appendix}/${shape}`, () => {
  const { surface } = buildPreviewSurfaceFallback(verdictInput(route, 'adaptive', shape))
  assert.ok(surface.directionError.withinTolerance)
  assert.ok(surface.stationError.withinTolerance)
  assert.ok(surface.directionError.refinementPasses <= 8)
  assert.ok(surface.directionError.directions <= 360)
  assert.ok((surface.stationError.maxStations ?? 0) <= 48)
  for (const basis of ['proportional3D', 'constantAxial'] as const) {
    const checks = boundaryScaledLoads(surface, basis, [0.91, 1.1]).map(load => checkLoadcaseUtilizationFromSurface(surface, load, basis))
    assert.deepEqual(checks.map(check => check.adequacy), ['adequate', 'inadequate'])
  }
})
for (const appendix of [false, true]) test(`ENG-AN-002: finite steel pole stalls remain explicit, Appendix=${appendix}`, () => {
  const { surface } = buildPreviewSurfaceFallback(verdictInput({ profileId: 'kds-142020-equivalent-block', appendix, hardening: true }, 'adaptive'))
  assert.equal(surface.stationError.withinTolerance, false)
  assert.equal(surface.stationError.reason, 'state-stalled')
  const load = boundaryScaledLoads(surface, 'constantAxial', [0.91])[0]
  const check = checkLoadcaseUtilizationFromSurface(surface, load, 'constantAxial')
  assert.equal(check.adequacy, 'indeterminate')
  assert.match(check.message, /steel-limit\/pole interval/)
})
