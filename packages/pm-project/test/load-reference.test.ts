import assert from 'node:assert/strict'
import test from 'node:test'
import { applyLoadReference, CENTROID_LOAD_REFERENCE, createEmptyProjectDocument, createLoadCombination,
  editLoadAtReference, parseLoadReference, parseProjectDocument, resultantAtCentroid,
  resultantAtLoadReference, serializeProjectDocument, type LoadReference } from '../src/index'

const reference: LoadReference = { kind: 'centroid-offset', offsetX: 100, offsetY: -50 }

test('ENG-LOAD-001: reference translations agree with independent force-times-lever-arm sums', () => {
  const forces = [{ F: 1000, x: 200, y: 300 }, { F: -400, x: -50, y: 70 }]
  const atC = forces.reduce((r, f) => ({ P: r.P + f.F, Mx: r.Mx + f.F * f.y, My: r.My + f.F * f.x }), { P: 0, Mx: 0, My: 0 })
  const expected = forces.reduce((r, f) => ({ P: r.P + f.F, Mx: r.Mx + f.F * (f.y + 50), My: r.My + f.F * (f.x - 100) }), { P: 0, Mx: 0, My: 0 })
  assert.deepEqual(resultantAtLoadReference(atC, reference), expected)
  assert.deepEqual(resultantAtCentroid(expected, reference), atC)
  assert.equal(resultantAtLoadReference(atC, CENTROID_LOAD_REFERENCE), atC, 'zero offset is an exact identity')
})

test('ENG-LOAD-001: Apply is atomic; Convert exactly preserves canonical actions; unchecked Apply preserves input numbers', () => {
  const combinations = [createLoadCombination({ P: 1e6, Mx: 20e6, My: -30e6 }), createLoadCombination({ id: 2, P: -2e5, Mx: 4e6, My: 0 })]
  const input = { reference: CENTROID_LOAD_REFERENCE, combinations }
  const converted = applyLoadReference(input, reference, true)
  assert.equal(converted.combinations, combinations)
  assert.deepEqual(input.reference, CENTROID_LOAD_REFERENCE)
  const reinterpreted = applyLoadReference(input, reference, false)
  assert.deepEqual(reinterpreted.combinations.map(load => resultantAtLoadReference(load, reference)), combinations)
  assert.deepEqual(reinterpreted.combinations[0], { ...combinations[0], Mx: -30e6, My: 70e6 })
  const back = applyLoadReference(converted, CENTROID_LOAD_REFERENCE, true)
  assert.equal(back.combinations, combinations)
  assert.equal(applyLoadReference(input, CENTROID_LOAD_REFERENCE, false).combinations, combinations)
  const pureBending = { combinations: [createLoadCombination({ P: 0, Mx: 100, My: -300 })] }
  assert.equal(applyLoadReference(pureBending, reference, false).combinations[0], pureBending.combinations[0])
})

test('ENG-LOAD-001: new and edited loads are authored at the applied origin without altering untouched components', () => {
  const authored = createLoadCombination({ P: 1e6, Mx: 0, My: 0 })
  const canonical = resultantAtCentroid(authored, reference)
  assert.deepEqual({ P: canonical.P, Mx: canonical.Mx, My: canonical.My }, { P: 1e6, Mx: -50e6, My: 100e6 })
  const edited = editLoadAtReference(canonical, { Mx: 25e6 }, reference)
  assert.equal(edited.Mx, -25e6); assert.equal(edited.My, canonical.My)
  const changedP = editLoadAtReference(canonical, { P: 2e6 }, reference)
  assert.deepEqual(resultantAtLoadReference(changedP, reference), { ...authored, P: 2e6 })
  assert.equal(editLoadAtReference(canonical, { name: 'Renamed' }, reference).My, canonical.My)
})

test('ENG-LOAD-001: v3 persists the reference and centroidal vectors; explicit v1/v2 readers retain centroidal meaning', () => {
  const project = createEmptyProjectDocument()
  project.inputs.loadings = applyLoadReference({ combinations: [createLoadCombination({ P: 1234, Mx: 5678, My: -9012 })] }, reference, true)
  const read = parseProjectDocument(serializeProjectDocument(project))
  assert.ok(read.ok)
  assert.deepEqual(read.document.inputs.loadings, project.inputs.loadings)
  for (const version of [1, 2] as const) {
    const legacy = { ...project, version, inputs: { ...project.inputs, loadings: { combinations: project.inputs.loadings.combinations } } }
    const result = parseProjectDocument(legacy)
    assert.ok(result.ok)
    assert.equal(result.document.inputs.loadings.reference, undefined)
    assert.deepEqual(result.document.inputs.loadings.combinations, project.inputs.loadings.combinations)
  }
  for (const invalid of [undefined, null, { ...reference, kind: 'world-origin' }, { ...reference, offsetX: Infinity }]) {
    assert.equal(parseProjectDocument({ ...project, inputs: { ...project.inputs, loadings: { ...project.inputs.loadings, reference: invalid } } }).ok, false)
  }
})

test('ENG-LOAD-001: invalid frames and overflowing translations fail without mutating loads', () => {
  assert.throws(() => parseLoadReference({ ...reference, offsetY: NaN }))
  const load = createLoadCombination({ P: 1e308 })
  assert.throws(() => applyLoadReference({ combinations: [load] }, reference, false))
  assert.equal(load.Mx, 0)
  assert.throws(() => resultantAtLoadReference({ ...load, My: NaN }, reference))
})
