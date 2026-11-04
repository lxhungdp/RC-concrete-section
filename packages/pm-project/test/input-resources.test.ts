import assert from 'node:assert/strict'
import test from 'node:test'
import { GEOMETRY_INPUT_LIMITS, validatePolygonSection } from '@pm/geometry'
import { MATERIAL_INPUT_LIMITS } from '@pm/materials'
import {
  assertProjectJsonSize, createEmptyProjectDocument, parseProjectDocument,
  PROJECT_INPUT_LIMITS, ProjectResourceLimitError
} from '../src/index'

test('ENG-GEO-001 AUD-004: oversized geometry is rejected before coordinate or topology work', () => {
  const document = createEmptyProjectDocument()
  const points = Array(GEOMETRY_INPUT_LIMITS.verticesPerRing + 1).fill(null)
  const input = { ...document, inputs: { ...document.inputs, geometry: {
    ...document.inputs.geometry, outers: [{ id: 1, points, holes: [] }]
  } } }
  const result = parseProjectDocument(input)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'PROJECT_RESOURCE_LIMIT')
  const guarded = { get x(): number { throw new Error('Coordinate must not be evaluated') }, y: 0 }
  const issues = validatePolygonSection({ solids: [{ outer: points.map(() => guarded), holes: [] }] })
  assert.equal(issues[0]?.code, 'GEOMETRY_RESOURCE_LIMIT')
})

test('ENG-GEO-001 AUD-004: direct object material and demand collections have preflight bounds', () => {
  const document = createEmptyProjectDocument()
  for (const patch of [
    { materials: { ...document.inputs.materials, steel: Array(MATERIAL_INPUT_LIMITS.steelMaterials + 1).fill(null) } },
    { loadings: { ...document.inputs.loadings, combinations: Array(PROJECT_INPUT_LIMITS.combinations + 1).fill(null) } }
  ]) {
    const result = parseProjectDocument({ ...document, inputs: { ...document.inputs, ...patch } })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.code, 'PROJECT_RESOURCE_LIMIT')
  }
})

test('AUD-004: JSON text uses UTF-8 bytes and handles surrogate pairs without a second allocation', () => {
  const limit = PROJECT_INPUT_LIMITS.jsonBytes
  assert.doesNotThrow(() => assertProjectJsonSize('a'.repeat(limit)))
  assert.throws(() => assertProjectJsonSize('a'.repeat(limit + 1)), ProjectResourceLimitError)
  assert.throws(() => assertProjectJsonSize('한'.repeat(Math.floor(limit / 3) + 1)), ProjectResourceLimitError)
  assert.throws(() => assertProjectJsonSize('😀'.repeat(Math.floor(limit / 4) + 1)), ProjectResourceLimitError)
  assert.doesNotThrow(() => assertProjectJsonSize('한😀\ud800'))
})

test('ENG-MAT-001 AUD-003: parsing rejects a contradictory declared elastic yield snapshot', () => {
  const document = createEmptyProjectDocument()
  document.inputs.materials.steel[0].limits = { epsY: 0.02 }
  const result = parseProjectDocument(document)
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /derived snapshot/)
})
