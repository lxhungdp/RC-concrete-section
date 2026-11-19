/**
 * Concrete/reinforcement field summary (2026-11-09 review items 6 and 9). Oracle: hand values of a
 * known plane, ε = e0 + kx·(y − y0) + ky·(x − x0), compression positive.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { SectionFieldMap } from '@pm/results/contracts'
import { summarizeSectionField } from '../src/index'

const state = { e0: 0.001, kx: 1e-5, ky: 0 } // ε = 0.001 + 1e-5·(y − 100)
const origin = { x: 0, y: 100 }
const bar = (id: number, y: number, stress: number) => ({ id, x: 0, y, dia: 20, area: 314, strain: state.e0 + state.kx * (y - origin.y), stress, force: stress * 314 })
const map = (block = false): SectionFieldMap => ({
  origin, samples: [], bounds: { minX: -100, maxX: 100, minY: -100, maxY: 300 },
  mesh: {} as SectionFieldMap['mesh'],
  triangles: block ? [] : [{ ax: 0, ay: -100, bx: 100, by: 300, cx: -100, cy: 300,
    strainA: -0.001, strainB: 0.003, strainC: 0.003, stressA: 0, stressB: 20, stressC: 20 }],
  rebars: [bar(1, -50, -300), bar(2, 250, 400), bar(3, -80, -360)],
  ...(block ? { equivalentBlock: { neutralAxisAngle: 0, neutralAxisDepth: 200, blockDepth: 160, compressionStress: 17, geometry: [] } } : {})
})

test('fibre summary separates concrete and rebar extremes and locates the outermost tension bar', () => {
  const summary = summarizeSectionField(map(), state, [])
  assert.ok(summary && summary.rebar)
  assert.equal(summary.concrete.centroidStrain, 0.001)
  assert.deepEqual([summary.concrete.maxStrain, summary.concrete.minStrain], [0.003, -0.001])
  assert.deepEqual([summary.concrete.maxStress, summary.concrete.minStress], [20, 0])
  assert.deepEqual(summary.rebar.maxStrain, { value: state.e0 + state.kx * 150, barId: 2 })
  assert.deepEqual(summary.rebar.minStrain, { value: state.e0 + state.kx * -180, barId: 3 })
  assert.deepEqual([summary.rebar.maxStress.barId, summary.rebar.minStress.barId], [2, 3])
  // Bar 3: ε = 0.001 − 0.0018 = −0.0008; the neutral axis is y = 0, 80 mm from the bar.
  const tension = summary.rebar.outermostTension
  assert.ok(tension)
  assert.equal(tension.barId, 3)
  assert.ok(Math.abs((tension.distanceFromNeutralAxis ?? NaN) - 80) < 1e-9)
})

test('block summary evaluates the plane at the exact boundary and uses the declared block stress', () => {
  const boundary = [{ x: -100, y: -100 }, { x: 100, y: 300 }]
  const summary = summarizeSectionField(map(true), state, boundary)
  assert.ok(summary)
  assert.ok(Math.abs(summary.concrete.maxStrain - 0.003) < 1e-15)
  assert.ok(Math.abs(summary.concrete.minStrain + 0.001) < 1e-15)
  assert.deepEqual([summary.concrete.maxStress, summary.concrete.minStress], [17, 0])
})

test('no tension bar, no bars, a uniform plane and non-finite data stay explicit', () => {
  const compressed = map()
  compressed.rebars = [bar(2, 250, 400)]
  assert.equal(summarizeSectionField(compressed, state, [])?.rebar?.outermostTension, null)
  const empty = map()
  empty.rebars = []
  assert.equal(summarizeSectionField(empty, state, [])?.rebar, null)
  const uniform = { e0: -0.002, kx: 0, ky: 0 }
  const tensionOnly = map()
  tensionOnly.rebars = [{ ...bar(1, 0, -400), strain: -0.002 }]
  assert.equal(summarizeSectionField(tensionOnly, uniform, [])?.rebar?.outermostTension?.distanceFromNeutralAxis, null)
  assert.equal(summarizeSectionField(map(), { ...state, e0: Number.NaN }, []), null)
  assert.equal(summarizeSectionField(map(true), state, []), null)
})
