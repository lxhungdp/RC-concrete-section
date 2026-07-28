import assert from 'node:assert/strict'
import test from 'node:test'
import {
  lineAngleDifferenceDeg,
  momentAngleDeg,
  neutralAxisAngleDeg,
  perpendicularBendingAxisAngleDeg,
  sectionBendingDirectionAngleDeg,
  sectionFieldAngleComparison,
  strainDirectionToNeutralAxisAngleDeg
} from './section-field-angles'

const closeTo = (actual: number | null, expected: number, tolerance = 1e-10) => {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}

test('pure Mx maps to a vertical section action and a horizontal reference/neutral axis', () => {
  closeTo(momentAngleDeg(10, 0), 0)
  closeTo(sectionBendingDirectionAngleDeg(10, 0), 90)
  closeTo(perpendicularBendingAxisAngleDeg(10, 0), 0)
  closeTo(neutralAxisAngleDeg({ e0: 0.001, kx: 2e-6, ky: 0 }), 0)
})

test('pure My maps to a horizontal section action and a vertical reference/neutral axis', () => {
  closeTo(momentAngleDeg(0, 10), 90)
  closeTo(sectionBendingDirectionAngleDeg(0, 10), 0)
  closeTo(perpendicularBendingAxisAngleDeg(0, 10), 90)
  closeTo(neutralAxisAngleDeg({ e0: 0.001, kx: 0, ky: 2e-6 }), 90)
})

test('reference-case comparison uses the axis perpendicular to (My,Mx), not the Mx-My angle', () => {
  const comparison = sectionFieldAngleComparison(
    { e0: 0.0005898965875996826, kx: 8.770305058928629e-7, ky: 2.1814143827122254e-7 },
    3_000_000_000,
    1_000_000_000
  )

  closeTo(comparison.momentSpace, 18.43494882292201)
  closeTo(comparison.sectionBendingDirection, 71.56505117707799)
  closeTo(comparison.perpendicularBendingAxis, 161.56505117707798)
  closeTo(comparison.neutralAxis, 166.03240744005882)
  closeTo(comparison.difference, 4.467356262980837)
})

test('line comparisons are undirected and wrap at 180 degrees', () => {
  closeTo(lineAngleDifferenceDeg(179, 1), 2)
  closeTo(lineAngleDifferenceDeg(10, 170), 20)
  closeTo(strainDirectionToNeutralAxisAngleDeg(15), 165)
  closeTo(strainDirectionToNeutralAxisAngleDeg(195), 165)
})

test('mixed signs preserve the section-axis mapping in every quadrant', () => {
  const comparison = sectionFieldAngleComparison(
    { e0: 0, kx: -3e-6, ky: 4e-6 },
    -3_000,
    4_000
  )
  closeTo(comparison.sectionBendingDirection, 323.13010235415595)
  closeTo(comparison.perpendicularBendingAxis, 53.13010235415598)
  closeTo(comparison.neutralAxis, 53.13010235415598)
  closeTo(comparison.difference, 0)

  assert.equal(momentAngleDeg(0, 0), null)
  assert.equal(perpendicularBendingAxisAngleDeg(0, 0), null)
  assert.equal(neutralAxisAngleDeg({ e0: 0.001, kx: 0, ky: 0 }), null)
})
