import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneRebars, equationRebarProperties, rebarArea, rebarAreaSource, parseRebarAreaSource, validatePolygonSection } from '../src/index'

test('REBAR-AS-001/002: an explicit area remains authoritative after diameter edits and copying', () => {
  const filled = equationRebarProperties(20)
  const bar = { id: 1, x: 0, y: 0, ...filled, area: 300 }
  const edited = { ...bar, dia: 25 }
  assert.equal(rebarArea(edited), 300)
  assert.equal(rebarArea(edited, 'equivalent-block'), 300)
  assert.deepEqual(rebarAreaSource(edited), { type: 'manual' })
  assert.equal(cloneRebars([edited])[0].area, 300)
  assert.deepEqual(cloneRebars([edited])[0].areaSource, { type: 'manual' })
  assert.equal(filled.area, Math.PI * 100)
})

test('REBAR-AS-003: legacy operation order is isolated; invalid explicit area never falls back', () => {
  assert.equal(rebarArea({ dia: 22 }), Math.PI * 22 * 22 / 4)
  assert.equal(rebarArea({ dia: 22 }, 'equivalent-block'), Math.PI * 22 ** 2 / 4)
  for (const area of [0, -1, NaN, Infinity]) assert.throws(() => rebarArea({ dia: 20, area }))
  assert.throws(() => parseRebarAreaSource({ type: 'catalog', dia: 20, area: NaN }))
})

test('ENG-GEO-005 / REBAR-AS-001: containment uses diameter while positive stored area is independent', () => {
  const solids = [{ outer: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }], holes: [] }]
  assert.deepEqual(validatePolygonSection({ solids, rebars: [{ id: 1, x: 40, y: 0, dia: 10, area: 2000 }] }), [])
  assert.ok(validatePolygonSection({ solids, rebars: [{ id: 1, x: 40, y: 0, dia: 30, area: 1 }] }).some(i => i.code === 'REBAR_CROSSES_BOUNDARY'))
  assert.ok(validatePolygonSection({ solids, rebars: [{ id: 1, x: 0, y: 0, dia: 10, area: NaN }] }).some(i => i.code === 'INVALID_REBAR'))
})
