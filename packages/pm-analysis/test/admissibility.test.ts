/**
 * `docs/04` §6: acceptance needs the residual test *and* admissible material strains. Before this,
 * the solver reported `ok: true` for any plane that balanced the demand, including planes far
 * outside the material domain — i.e. demands the section cannot carry.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import { createLoadCombination } from '@pm/project'
import { buildPreviewSurface, sliceFixedPContour, solveInversePreview } from '../src/index'
import { referenceProjectDocument } from './fixtures/reference-case'

const KN = 1e3
const KNM = 1e6

const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const materials = document.inputs.materials
const surface = buildPreviewSurface(section, rebars, materials)

const solve = (loadcase: ReturnType<typeof createLoadCombination>, store: MaterialStore = materials) =>
  solveInversePreview(section, rebars, store, loadcase, sliceFixedPContour(surface.points, loadcase.P))

test('a demand on the capacity surface is converged and admissible', () => {
  // Sheet `Newton`: this demand is the nominal P5 station at 15 degrees.
  const onSurface = createLoadCombination({
    id: 1,
    name: 'ULS-1',
    P: 24942.922102452183 * KN,
    Mx: 3714.165943842699 * KNM,
    My: 1431.7807276950741 * KNM
  })
  const result = solve(onSurface)

  assert.equal(result.converged, true)
  assert.equal(result.admissibility.ok, true, result.message)
  assert.equal(result.ok, true)
  assert.deepEqual(result.admissibility.violations, [])
  assert.ok(
    result.admissibility.maxConcreteCompression <= result.admissibility.concreteLimit * (1 + 1e-9),
    `peak ${result.admissibility.maxConcreteCompression} vs limit ${result.admissibility.concreteLimit}`
  )
})

test('a demand well inside the surface stays admissible', () => {
  const inside = createLoadCombination({
    id: 2,
    name: 'ULS-2',
    P: 10000 * KN,
    Mx: 1000 * KNM,
    My: 300 * KNM
  })
  const result = solve(inside)
  assert.equal(result.ok, true, result.message)
  assert.ok(result.admissibility.maxConcreteCompression < result.admissibility.concreteLimit)
})

const withSteelRuptureLimit = (epsU: number): MaterialStore => ({
  ...materials,
  steel: materials.steel.map((steel) => ({ ...steel, limits: { ...steel.limits, epsU } }))
})

/** Balances at eps_s = 7.9e-3 in the outermost bars — fine for ductile steel, not for a 4e-3 limit. */
const bendingDemand = createLoadCombination({ id: 3, name: 'pure bending', P: 0, Mx: 3000 * KNM, My: 0 })

test('a converged plane that breaks a steel rupture limit is not accepted', () => {
  const result = solve(bendingDemand, withSteelRuptureLimit(0.004))

  // This is the regression that matters: the residual test alone would have said "Converged".
  assert.equal(result.converged, true)
  assert.equal(result.admissibility.ok, false)
  assert.equal(result.ok, false, '`ok` must not be true for an inadmissible plane')
  assert.match(result.message, /material domain/)

  const violations = result.admissibility.violations
  assert.ok(violations.length > 0)
  assert.ok(violations.every((violation) => violation.code === 'STEEL_STRAIN_EXCEEDS_ULTIMATE'))
  for (const violation of violations) {
    assert.ok(Math.abs(violation.value) > 0.004)
    assert.ok(Number.isInteger(violation.rebarId), 'a violation must name the bar it came from')
  }
})

test('the same plane is admissible once the steel is ductile enough', () => {
  const strict = solve(bendingDemand, withSteelRuptureLimit(0.004))
  const ductile = solve(bendingDemand, withSteelRuptureLimit(0.025))

  // Same equilibrium state; only the declared limit changed.
  assert.equal(ductile.state.e0, strict.state.e0)
  assert.equal(ductile.admissibility.maxSteelTension, strict.admissibility.maxSteelTension)
  assert.equal(ductile.admissibility.ok, true)
  assert.equal(ductile.ok, true)
})

test('an over-capacity demand is rejected as well', () => {
  const beyond = createLoadCombination({
    id: 6,
    name: 'over-capacity',
    P: 30000 * KN,
    Mx: 9000 * KNM,
    My: 4000 * KNM
  })
  const result = solve(beyond)

  // The epsCu discontinuity in the concrete law stops the solver before it converges here, so this
  // demand fails the residual test rather than the domain test. Either way it must not read as ok.
  assert.equal(result.ok, false)
  assert.equal(result.converged, false)
})

test('no steel definition declares epsU in the reference case, and that is reported as unknown', () => {
  const onSurface = createLoadCombination({
    id: 5,
    name: 'ULS-1',
    P: 24942.922102452183 * KN,
    Mx: 3714.165943842699 * KNM,
    My: 1431.7807276950741 * KNM
  })
  // An absent rupture limit must read as "not declared", never as "admissible".
  assert.equal(solve(onSurface).admissibility.steelTensionLimit, null)
})
