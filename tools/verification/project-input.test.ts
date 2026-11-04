import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createEmptyProjectDocument } from '@pm/project'
import { canonicalVerificationProject, verificationInputMismatch } from './project-input'

test('AUD-005 ENG-RES-002: explicit v1 P16 input exports as v3 without changing identity or actions', () => {
  const raw = JSON.parse(readFileSync('docs/examples/reference-case/projects/P16_Column_ULS.pm-project.json', 'utf8'))
  const canonical = canonicalVerificationProject(raw)
  assert.equal(raw.version, 1)
  assert.equal(canonical.version, 3)
  assert.deepEqual(canonical.meta, raw.meta)
  assert.deepEqual(canonical.inputs.loadings.combinations, raw.inputs.loadings.combinations)
  assert.deepEqual(canonical.inputs.loadings.reference, { kind: 'centroid-offset', offsetX: 0, offsetY: 0 })
  assert.deepEqual(canonical.inputs.geometry.outers, raw.inputs.geometry.outers)
  assert.deepEqual(canonical.inputs.geometry.rebars.map(({ area, areaSource, ...bar }) => {
    assert.ok(typeof area === 'number' && area > 0)
    assert.equal(areaSource?.type, 'equation')
    return bar
  }), raw.inputs.geometry.rebars)
  assert.deepEqual(canonicalVerificationProject(canonical), canonical)
})

test('AUD-005: canonical comparison retains every changed action and metadata value', () => {
  const source = createEmptyProjectDocument()
  const changed = structuredClone(source)
  changed.meta.name = 'Changed identity'
  assert.notDeepEqual(canonicalVerificationProject(changed), canonicalVerificationProject(source))
  assert.throws(() => canonicalVerificationProject({ ...source, version: 999 }), /Invalid verification project/)
  assert.equal(verificationInputMismatch({ x: 1, y: 2 }, { y: 2, x: 1 }), null)
  assert.notEqual(verificationInputMismatch([1, 2], [2, 1]), null)
  assert.notEqual(verificationInputMismatch(1, 1 + Number.EPSILON), null)
})
