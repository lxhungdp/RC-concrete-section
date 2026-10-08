import assert from 'node:assert/strict'
import test from 'node:test'
import { type Point2 } from '@pm/geometry'
import { prepareBoundaryDraftForApply } from '../../features/section-editor/geometry/boundary-draft'

const outer: Point2[] = [
  { id: 1, x: -200, y: -200 }, { id: 2, x: 200, y: -200 },
  { id: 3, x: 200, y: 200 }, { id: 4, x: -200, y: 200 }
]
const hole: Point2[] = [
  { id: 5, x: -40, y: -40 }, { id: 6, x: -40, y: 40 },
  { id: 7, x: 40, y: 40 }, { id: 8, x: 40, y: -40 }
]
const secondOuter = outer.map((point) => ({ ...point, id: point.id + 8, x: point.x + 600 }))
const draft = {
  id: 7, name: 'Draft with hole', outers: [[outer, hole], [secondOuter]],
  rebars: [{ id: 1, x: -100.125, y: -100.25, dia: 20, steelMaterialId: 3, solidIndex: 0 }]
}

test('ENG-GEO-001/002: valid draft preserves every ring and full-precision bar without mutating the draft', () => {
  const before = structuredClone(draft)
  const result = prepareBoundaryDraftForApply(draft)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('Expected valid fixture')
  assert.deepEqual(result.input, {
    id: 7, name: 'Draft with hole',
    outers: [
      { id: 1, points: outer, holes: [{ id: 1, points: hole }] },
      { id: 2, points: secondOuter, holes: [] }
    ],
    rebars: [{ id: 1, x: -100.125, y: -100.25, dia: 20, steelMaterialId: 3 }]
  })
  assert.deepEqual(draft, before)
  assert.notEqual(result.input.outers[0].points, outer)
})

test('ENG-GEO-001: a cleared or partially rebuilt outer cannot be silently dropped when another outer is valid', () => {
  for (const ring of [[], outer.slice(0, 1), outer.slice(0, 2)]) {
    const result = prepareBoundaryDraftForApply({ ...draft, outers: [[ring, hole], [secondOuter]] })
    assert.equal(result.ok, false)
    if (result.ok) throw new Error('Incomplete outer was accepted')
    assert.ok(result.issues.some((issue) => issue.code === 'RING_TOO_SHORT' && issue.path === 'solids[0].outer'))
  }
})

test('ENG-GEO-001: clearing a hole or every outer blocks Apply rather than removing the ring slot', () => {
  const clearedHole = prepareBoundaryDraftForApply({ ...draft, outers: [[outer, []], [secondOuter]] })
  assert.equal(clearedHole.ok, false)
  if (clearedHole.ok) throw new Error('Cleared hole was accepted')
  assert.ok(clearedHole.issues.some((issue) => issue.code === 'RING_TOO_SHORT' && issue.path === 'solids[0].holes[0]'))
  assert.equal(prepareBoundaryDraftForApply({ ...draft, outers: [] }).ok, false)
})

test('ENG-GEO-001/002: rebuilt rings still pass the canonical topology, reinforcement and identity gates', () => {
  const cases = [
    { input: { ...draft, outers: [[[outer[0], outer[2], outer[1], outer[3]]]] }, code: 'SELF_INTERSECTING_RING' },
    { input: { ...draft, rebars: [{ ...draft.rebars[0], x: 195 }] }, code: 'REBAR_CROSSES_BOUNDARY' },
    { input: { ...draft, outers: [[outer.map((point) => ({ ...point, id: 1 }))]] }, code: 'DUPLICATE_ENTITY_ID' }
  ]
  for (const { input, code } of cases) {
    const result = prepareBoundaryDraftForApply(input)
    assert.equal(result.ok, false)
    if (result.ok) throw new Error(`Invalid ${code} fixture was accepted`)
    assert.ok(result.issues.some((issue) => issue.code === code), JSON.stringify(result.issues))
  }
})
