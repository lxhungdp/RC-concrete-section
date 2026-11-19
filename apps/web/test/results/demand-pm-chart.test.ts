import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDemandPmGeometry, checkLoadcaseUtilizationFromSurface } from '@pm/analysis'
import { fromCanonical, UNIT_PRESETS, quantityUnit } from '@pm/units'
import { createAnalysisExecution } from '../../application/analysis/execution'
import { demandPmTraces } from '../../features/section-editor/results/demand-pm-chart'
import { plottedPointsText } from '../../features/section-editor/results/demand-chart-text'
import { verdictRoutes, finiteSteelRoutes, verdictInput, boundaryScaledLoads, routeName } from '../support/demand-verdicts'

const angleOf = (point: { Mx: number; My: number }) => Math.atan2(point.My, point.Mx)

for (const route of [...verdictRoutes, ...finiteSteelRoutes]) for (const mode of ['fixed', 'adaptive'] as const) {
  test(`ENG-AN-003/RES-001: ${routeName(route)} ${mode} draws the physical load-direction curve of an L section`, async () => {
    const execution = createAnalysisExecution()
    const input = verdictInput(route, mode, 'KDS-EB-03-l-shape-8-bars')
    const surface = execution.buildSurface(input)
    for (const basis of ['proportional3D', 'constantAxial'] as const) {
      for (const demand of boundaryScaledLoads(surface, basis, [0.91, 1.05])) {
        const check = checkLoadcaseUtilizationFromSurface(surface, demand, basis)
        const theta = angleOf(check.demand)
        const curve = await execution.buildLoadDirection({ ...input, surface, theta })
        assert.deepEqual(curve.unresolved, [], 'every crossing moves onto the physical surface')
        // A jump of the block model across θ is reported, never hidden as a converged root.
        const jumps = new Set(curve.discontinuities.map(item => item.directionResidual))
        if (!route.profileId.includes('equivalent-block')) assert.deepEqual(curve.discontinuities, [])
        const geometry = buildDemandPmGeometry({ surface, curve, demand: check.demand, governingPoint: check.capacityPoint, basis })
        assert.equal(geometry.curveStatus, 'available')
        assert.equal(geometry.theta, theta)
        for (const paths of [geometry.design, geometry.nominal]) {
          assert.ok(paths.length > 0)
          for (const point of paths.flat()) {
            assert.equal(point.M, point.Mx * Math.cos(theta) + point.My * Math.sin(theta))
            assert.ok(point.M >= -1e-6 * Math.max(1, Math.abs(point.P)), 'forward half-plane only')
            if (point.role === 'physical-station' || point.role === 'between-stations') {
              assert.ok(point.beta !== null, 'a physical point carries its own β')
              // Independent direction oracle on the returned resultants.
              const sine = (point.My * Math.cos(theta) - point.Mx * Math.sin(theta)) / Math.hypot(point.Mx, point.My)
              if (Math.abs(sine) > 1e-9) {
                assert.ok([...jumps].some(value => Math.abs(value - sine) <= 1e-12), `unreported direction error ${sine}`)
              }
            }
            if (point.role === 'between-stations') assert.ok(point.between && point.between.fraction > 0 && point.between.fraction < 1)
            if (point.role === 'axial-center' || point.role === 'cap-edge' || point.role === 'axis') assert.equal(point.beta, null)
          }
        }
        // Design points never exceed the cap; the excluded portion is diagnostic only.
        assert.ok(geometry.design.flat().every(point => point.P <= surface.bounds.P[1] * (1 + 1e-12)))
        // The curve crossing reproduces the stored governing crossing within the surface discretization.
        assert.ok(check.capacityMultiplier && geometry.diagnostic.points.length)
        assert.ok(geometry.diagnostic.points.some(point => Math.abs(point.lambda / check.capacityMultiplier! - 1) <= 0.03),
          `curve ${geometry.diagnostic.points.map(point => point.lambda)} vs surface ${check.capacityMultiplier}`)
        // The governing query is unchanged by drawing the curve.
        assert.deepEqual(checkLoadcaseUtilizationFromSurface(surface, demand, basis), check)
        for (const units of [UNIT_PRESETS.metric, UNIT_PRESETS.us]) {
          const traces = demandPmTraces(geometry, { primary: '#123', guide: '#456', markerOutline: '#fff',
            showDesign: true, showNominal: true, constantP: basis === 'constantAxial',
            displayForce: value => fromCanonical('force', value, units), displayMoment: value => fromCanonical('moment', value, units),
            forceUnit: quantityUnit('force', units), momentUnit: quantityUnit('moment', units) }, null)
          const lines = traces.filter(trace => trace.mode === 'lines' && trace.name.startsWith('Load direction θ') && !trace.name.includes('before Pmax'))
          assert.ok(lines.length >= 2)
          assert.ok(lines.every(trace => trace.x.every(value => value >= -1e-6)), 'the curve stays on the forward branch')
          const text = plottedPointsText(traces, { moment: quantityUnit('moment', units), force: quantityUnit('force', units) })
          const expectedCount = traces.reduce((sum, trace) => sum + (trace.meta && 'resistanceStage' in trace.meta ? trace.x.length : 0), 0)
          const rows = text.split('\n').filter(line => {
            // N#, Criteria, β (a number, or — for a geometric point), three moments and P.
            const cells = line.split('\t'); return cells.length === 7 && Number.isInteger(Number(cells[0])) &&
              (cells[2].trim() === '—' || Number.isFinite(Number(cells[2]))) && cells.slice(3).every(cell => cell !== '' && Number.isFinite(Number(cell)))
          })
          assert.equal(rows.length, expectedCount)
          // Every physical point of the curve lists its own β.
          assert.ok(rows.some(line => Number.isFinite(Number(line.split('\t')[2]))))
          assert.doesNotMatch(text, /physicalStations|surface-cut|custom|JSON/u)
        }
      }
    }
  })
}

test('ENG-AN-003: a zero-moment demand has no load direction and draws no curve', () => {
  const execution = createAnalysisExecution()
  const input = verdictInput(verdictRoutes[0], 'fixed')
  const surface = execution.buildSurface(input)
  const geometry = buildDemandPmGeometry({ surface, curve: null, demand: { P: 1e6, Mx: 0, My: 0 }, governingPoint: null, basis: 'proportional3D' })
  assert.equal(geometry.curveStatus, 'zero-moment')
  assert.equal(geometry.theta, null)
  assert.deepEqual(geometry.design, [])
})
