import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  activeDesignSurfaceDataset, checkLoadcaseUtilizationFromSurface,
  sliceActiveDesignPContour, intersectFixedPContourWithMomentRay
} from '@pm/analysis'
import { buildPreviewSurfaceFallback } from '../../../apps/web/application/analysis/fallback'
import {
  boundaryScaledLoads, finiteSteelRoutes, intervalVerdict, routeName, verdictInput, verdictRoutes, verdictShapes
} from '../../../apps/web/test/support/demand-verdicts'
import { segmentContourRadius, verifySegmentOracle } from './contour-oracle'

const full = process.argv.includes('--full')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/verdict-audit'
mkdirSync(out, { recursive: true })
const records = []
let checks = 0
let contourComparisons = 0
const failures: string[] = []
verifySegmentOracle()
for (const shape of full ? verdictShapes : verdictShapes.slice(0, 1)) {
  const routes = shape === verdictShapes[0] ? [...verdictRoutes, ...finiteSteelRoutes] : verdictRoutes
  for (const route of routes) for (const mode of ['fixed', 'adaptive'] as const) {
    const label = `${shape}/${routeName(route)}/${mode}`
    const { surface } = buildPreviewSurfaceFallback(verdictInput(route, mode, shape))
    const uncertainty = mode === 'fixed' ? 0.02 :
      surface.directionError.withinTolerance && surface.stationError.withinTolerance
        ? Math.max(surface.directionError.maxRelativeComponent, surface.stationError.maxRelative) : null
    const verdictCounts = { adequate: 0, inadequate: 0, indeterminate: 0 }
    for (const fraction of full ? [0.1, 0.3, 0.5, 0.7, 0.9] : [0.6]) {
      const P = surface.bounds.P[0] + fraction * (surface.bounds.P[1] - surface.bounds.P[0])
      for (let octant = 0; octant < (full ? 8 : 1); octant += 1) {
        const theta = (octant + 0.37) * Math.PI / 4
        for (const basis of ['proportional3D', 'constantAxial'] as const) {
          const loads = boundaryScaledLoads(surface, basis, [0.5, 0.91, 0.975, 1, 1.025, 1.1, 1.5], fraction, theta)
          for (const load of loads) {
            const result = checkLoadcaseUtilizationFromSurface(surface, load, basis)
            const expected = intervalVerdict(result.utilization, uncertainty)
            if (result.adequacy !== expected) failures.push(`${label}/${basis}/${load.name}: ${result.adequacy} versus ${expected}`)
            if (result.adequacy === 'indeterminate') assert.match(result.message,
              uncertainty === null ? /sampling has not converged/ : /interval crosses UR = 1/)
            verdictCounts[result.adequacy] += 1
            checks += 1
          }
          if (basis === 'constantAxial') {
            const check = checkLoadcaseUtilizationFromSurface(surface, loads[0], basis)
            const demand = check.codeAdjustedDemand ?? loads[0]
            const oracle = segmentContourRadius(activeDesignSurfaceDataset(surface), P, Math.atan2(demand.My, demand.Mx))
            assert.ok(oracle !== null && check.capacityPoint, `${label}: missing contour oracle`)
            const moment = Math.hypot(check.capacityPoint.Mx, check.capacityPoint.My)
            const pathHit = intersectFixedPContourWithMomentRay(sliceActiveDesignPContour(surface, P), Math.atan2(demand.My, demand.Mx))
            assert.ok(pathHit && Math.abs(pathHit.M - oracle) <= 1e-6 * oracle,
              `${label}: the displayed contour must retain the authoritative segment crossing`)
            assert.ok(Math.abs(moment - oracle) <= 1e-6 * oracle,
              `${label}: ray/contour mismatch at fraction=${fraction}, octant=${octant}, P=${demand.P}: ${moment} versus ${oracle}`)
            contourComparisons += 1
          }
        }
      }
    }
    const record = { shape, route: routeName(route), mode, verdictCounts,
      direction: surface.directionError, station: surface.stationError }
    records.push(record)
    console.log(`${label}: ${JSON.stringify(verdictCounts)}; ${uncertainty === null ? 'unconverged Adaptive' : 'classified'}`)
  }
}
const summary = { runtime: { node: process.version, platform: process.platform, arch: process.arch },
  generatedAt: new Date().toISOString(), full, surfaces: records.length, checks, contourComparisons,
  unconvergedAdaptive: records.filter(record => record.mode === 'adaptive' &&
    (!record.direction.withinTolerance || !record.station.withinTolerance)).map(({ shape, route, direction, station }) =>
      ({ shape, route, direction, station })), failures }
writeFileSync(`${out}/matrix.json`, JSON.stringify({ summary, records }, null, 2))
console.log(JSON.stringify({ ...summary, unconvergedAdaptive: summary.unconvergedAdaptive.length }, null, 2))
assert.deepEqual(failures, [])
