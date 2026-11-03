import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareGroupedPointSupports } from '@pm/geometry'
import { compileSteelMaterial, type SteelMaterial } from '@pm/materials'
import { createSteelStrainBoundary } from '../src/steel-strain-boundary'

test('the finite steel boundary reaches an independently computed joint limit and changes governing grade', () => {
  const points = [0.009, 0.006].map((limit, id) => {
    const material: SteelMaterial = { id: id + 1, name: 'Synthetic grade', standard: 'CUSTOM', fy: 400, elasticModulus: 200000,
      stressStrain: { type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: 1.1 }, epsUk: 0.05, strainLimit: { type: 'absolute', value: limit } } }
    return { x: 0, y: id === 0 ? -290 : -100, steel: compileSteelMaterial(material) }
  })
  const groups = prepareGroupedPointSupports(points, (point) => String(point.steel.id))(0, 1)
  const boundary = createSteelStrainBoundary(groups, 350, 0.0035, 0, 1, 1e-9)
  assert.ok(boundary)
  // Grade 1 at y=-290 and concrete at y=350: (0.0035 + 0.009) / 640.
  assert.ok(Math.abs(boundary.maxCurvature - 0.00001953125) < 1e-19)
  const joint = boundary.transition({ e0: 0, kx: 0, ky: 0 }, 0.5)
  assert.ok(Math.abs(joint.e0 + joint.kx * -290 + 0.009) < 1e-15)
  assert.ok(Math.abs(joint.e0 + joint.kx * 350 - 0.0035) < 1e-15)
  // At kappa=0.00001, grade 2 controls e0=-0.005; grade 1 is still below 0.009.
  const tension = boundary.transition(joint, 1 - 0.00001 / (2 * boundary.maxCurvature))
  assert.ok(Math.abs(tension.e0 + 0.005) < 1e-15)
  assert.ok(Math.abs(tension.kx - 0.00001) < 1e-15)
  assert.ok(Math.abs(tension.e0 - tension.kx * 290) < 0.009)
  assert.equal(boundary.transition(joint, 1).e0, -0.006)
})
