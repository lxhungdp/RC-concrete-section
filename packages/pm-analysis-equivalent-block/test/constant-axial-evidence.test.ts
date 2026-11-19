import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { parseProjectDocument, type EquivalentBlockProfileId } from '@pm/project'
import { buildEquivalentBlockDesignSurfaceFromPrepared, prepareBlockAnalysis, solveEquivalentBlockDemandFromPrepared } from '../src/index'

test('ENG-RES-002 CP-A02: Constant-P residuals and their norms use the same unscaled axial target', () => {
  const parsed = parseProjectDocument(readFileSync('docs/examples/equivalent-block/ACI-EB-03-l-shape-8-bars.pm-project.json', 'utf8'))
  assert.ok(parsed.ok)
  const { geometry, materials, analysis, design, calculationProfileId } = parsed.document.inputs
  assert.ok(analysis.methodId === 'equivalent-block-surface-v1')
  const prepared = prepareBlockAnalysis(calculationProfileId as EquivalentBlockProfileId,
    sectionGeometryFromGeometryInput(geometry), geometryInputRebars(geometry), materials, design)
  const surface = buildEquivalentBlockDesignSurfaceFromPrepared(prepared, analysis)
  const demand = { id: 1, name: 'Audit residual', actionBasis: 'factoredULS' as const, P: 2102702.4, Mx: 6e8, My: 2e8 }
  const result = solveEquivalentBlockDemandFromPrepared(prepared, analysis, demand, surface, 'constantAxial')
  assert.ok(result.converged)
  assert.equal(result.capacityField?.status, 'available')
  if (result.capacityField?.status !== 'available') throw Error('No physical field')
  const field = result.capacityField
  const expected = {
    P: field.response.P - demand.P,
    Mx: field.response.Mx - field.loadFactor * demand.Mx,
    My: field.response.My - field.loadFactor * demand.My
  }
  assert.deepEqual(field.residual, expected)
  const norm = (r: typeof expected) => Math.hypot(r.P / surface.normalization.P,
    r.Mx / surface.normalization.Mx, r.My / surface.normalization.My)
  assert.equal(field.residualNorm, norm(expected))
  assert.equal(result.residualNorm, norm(result.residual))
  assert.ok(field.residualNorm <= 1e-8)
})
