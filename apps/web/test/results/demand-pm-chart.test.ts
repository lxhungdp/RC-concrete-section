import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDemandPmGeometry, checkLoadcaseUtilizationFromSurface, intersectPmLoadPath,
  sliceMomentPlane, activeDesignSurfaceDataset, activeNominalSurfaceDataset } from '@pm/analysis'
import { fromCanonical, UNIT_PRESETS, quantityUnit } from '@pm/units'
import { createAnalysisExecution } from '../../application/analysis/execution'
import { demandPmTraces } from '../../features/section-editor/results/demand-pm-chart'
import { plottedPointsText } from '../../features/section-editor/results/demand-chart-text'
import { createDemandCheckView } from '../../features/section-editor/results/results-view'
import { buildChartTableRows } from '../../features/section-editor/results/chart-data-table'
import { verdictRoutes, finiteSteelRoutes, verdictInput, boundaryScaledLoads, routeName } from '../support/demand-verdicts'

test('ENG-RES-001: Direct beta is primary and theta is initially hidden', () => {
  assert.equal(createDemandCheckView().showLoadAngleSection, false)
})

for (const route of [...verdictRoutes, ...finiteSteelRoutes]) for (const mode of ['fixed', 'adaptive'] as const) {
  test(`ENG-AN-003/RES-001: ${routeName(route)} ${mode} preserves governing checks across both P-M layers`, () => {
    const execution = createAnalysisExecution()
    const input = verdictInput(route, mode, 'KDS-EB-03-l-shape-8-bars')
    const surface = execution.buildSurface(input)
    const exact = execution.buildExactDirection({ ...input, beta: 0.37 })
    for (const basis of ['proportional3D', 'constantAxial'] as const) {
      for (const demand of boundaryScaledLoads(surface, basis, [0.91, 1.05])) {
        const check = checkLoadcaseUtilizationFromSurface(surface, demand, basis)
        const args = { surface, exact, inspectionBeta: 0.37, demand: check.demand,
          governingPoint: check.capacityPoint, basis }
        const hidden = buildDemandPmGeometry({ ...args, showTheta: false })
        const shown = buildDemandPmGeometry({ ...args, showTheta: true })
        assert.equal(shown.directStatus, 'available')
        assert.deepEqual(hidden.nominal, shown.nominal)
        assert.deepEqual(hidden.design, shown.design)
        for (const resistanceStage of ['design', 'nominal'] as const) {
          const rows = buildChartTableRows({ surface, exactDirectionCurve: exact, source: 'vertical',
            resistanceStage, sliceAngleDeg: 0.37 * 180 / Math.PI, fixedP: 0 })
          const plotted = resistanceStage === 'design' ? shown.design.flat() : shown.nominal.flat()
          assert.ok(rows.length)
          for (const row of rows) {
            assert.equal(row.kind, 'vertical')
            if (row.kind !== 'vertical') continue
            const source = plotted.find(point => point.sourceId === row.evidence.point.id)
            assert.ok(source, 'every primary-beta Envelope row belongs to the plotted source path')
            assert.equal(row[resistanceStage]?.total.M, source.M)
            assert.equal(row[resistanceStage]?.total.P, source.P)
          }
        }
        assert.deepEqual(hidden.diagnostic, shown.diagnostic)
        assert.deepEqual(hidden.summary, shown.summary)
        assert.deepEqual(hidden.designTheta, [])
        for (const paths of [shown.design, shown.nominal]) for (const path of paths) for (const point of path) {
          assert.equal(point.M, Math.hypot(point.Mx, point.My))
          if (point.role === 'axial-center' || point.role === 'cap-edge') assert.equal(point.stationId, null)
        }
        for (const [dataset, actual] of [[activeDesignSurfaceDataset(surface), shown.designTheta],
          [activeNominalSurfaceDataset(surface), shown.nominalTheta]] as const) {
          const expected = sliceMomentPlane(dataset.points, shown.theta, dataset.triangles)
          const expectedSegments = expected.flatMap(path => path.points.slice(1).flatMap((b, index) => {
            const a = path.points[index]
            if (a.M < 0 && b.M < 0) return []
            const axisP = (a.M * b.P - b.M * a.P) / (a.M - b.M)
            const left = a.M >= 0 ? [a.M, a.P] : [0, axisP]
            const right = b.M >= 0 ? [b.M, b.P] : [0, axisP]
            return left[0] === right[0] && left[1] === right[1] ? [] : [[left, right]]
          }))
          const actualSegments = actual.flatMap(path => path.slice(1).map((b, index) =>
            [[path[index].M, path[index].P], [b.M, b.P]]))
          assert.equal(actualSegments.length, expectedSegments.length)
          const momentScale = Math.max(1, ...dataset.points.map(p => Math.hypot(p.Mx, p.My)))
          const forceScale = Math.max(1, ...dataset.points.map(p => Math.abs(p.P)))
          for (const segment of actualSegments) assert.ok(expectedSegments.some(expected =>
            segment.every((point, index) => Math.abs(point[0] - expected[index][0]) <= 1e-9 * momentScale &&
              Math.abs(point[1] - expected[index][1]) <= 1e-9 * forceScale)), 'matches independent forward segment clipping')
          assert.ok(actual.flat().every(p => p.M >= 0))
        }
        assert.ok(check.capacityPoint && check.capacityMultiplier)
        const query = intersectPmLoadPath(shown.designTheta, check.demand, basis)
        assert.ok(query.points.some(point => Math.abs(point.lambda / check.capacityMultiplier! - 1) <= 2e-9),
          'independent plane-cut route agrees with the stored ray/triangle crossing at the existing geometry scale')
        assert.deepEqual(checkLoadcaseUtilizationFromSurface(surface, demand, basis), check)
        const changedTheta = buildDemandPmGeometry({ ...args, demand: { ...check.demand, Mx: -check.demand.My, My: check.demand.Mx }, showTheta: true })
        assert.deepEqual(changedTheta.design, shown.design, 'theta alone cannot move exact-beta magnitude coordinates')
        for (const units of [UNIT_PRESETS.metric, UNIT_PRESETS.us]) {
          const traces = demandPmTraces(shown, { primary: '#123', guide: '#456', markerOutline: '#fff',
            showDesign: true, showNominal: true, showTheta: true, constantP: basis === 'constantAxial',
            displayForce: value => fromCanonical('force', value, units), displayMoment: value => fromCanonical('moment', value, units),
            forceUnit: quantityUnit('force', units), momentUnit: quantityUnit('moment', units) }, null)
          const lines = traces.filter(trace => trace.mode === 'lines' && trace.name.startsWith('Load-angle θ') && !trace.name.includes('before Pmax'))
          assert.ok(lines.length)
          assert.ok(lines.every(trace => trace.line && 'dash' in trace.line && trace.line.dash === 'dot'))
          assert.ok(lines.every(trace => trace.line?.color === '#ef4444'), 'load-angle dotted curves use red')
          assert.ok(lines.every(trace => trace.x.every(value => value >= 0)), 'theta overlay stays on the forward branch')
          const text = plottedPointsText(traces, { moment: quantityUnit('moment', units), force: quantityUnit('force', units) })
          const expectedCount = traces.reduce((sum, trace) => sum + (trace.meta && 'resistanceStage' in trace.meta ? trace.x.length : 0), 0)
          const rows = text.split('\n').filter(line => {
            const cells = line.split('\t'); return cells.length === 6 && Number.isInteger(Number(cells[0])) && cells.slice(2).every(cell => cell !== '' && Number.isFinite(Number(cell)))
          })
          assert.equal(rows.length, expectedCount)
          assert.doesNotMatch(text, /physicalStations|surface-cut|custom|JSON/u)
          assert.match(text, /Mrx/u)
          assert.match(text, /Mnx/u)
        }
      }
    }
  })
}
