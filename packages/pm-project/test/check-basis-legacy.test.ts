import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { LEGACY_DIRECT_2D_WARNING, parseProjectDocument, serializeProjectDocument } from '../src/index'

/** development/02 §7: the removed 2D Load Ray basis is a documented reader rule, not a migration. */
const stored = (checkBasis: unknown) => {
  const value = JSON.parse(readFileSync('docs/examples/reference-case/projects/P16_Column_ULS.pm-project.json', 'utf8'))
  value.inputs.loadings.checkBasis = checkBasis
  return JSON.stringify(value)
}

test('ENG-AN-003: a stored direct2D basis reads as the 3D Load Ray with a warning and is never written back', () => {
  const parsed = parseProjectDocument(stored('direct2D'))
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
  assert.equal(parsed.document.inputs.loadings.checkBasis, 'proportional3D')
  assert.ok(parsed.warnings.includes(LEGACY_DIRECT_2D_WARNING))
  const written = serializeProjectDocument(parsed.document)
  assert.doesNotMatch(written, /direct2D/u)
  const reread = parseProjectDocument(written)
  assert.ok(reread.ok)
  assert.ok(!reread.warnings.includes(LEGACY_DIRECT_2D_WARNING))
})

test('ENG-AN-003: the current bases read without the warning and any other value is rejected', () => {
  for (const basis of ['proportional3D', 'constantAxial'] as const) {
    const parsed = parseProjectDocument(stored(basis))
    assert.ok(parsed.ok)
    assert.equal(parsed.document.inputs.loadings.checkBasis, basis)
    assert.ok(!parsed.warnings.includes(LEGACY_DIRECT_2D_WARNING))
  }
  for (const value of ['direct3D', 'Direct2D', 2, null]) {
    assert.equal(parseProjectDocument(stored(value)).ok, false, String(value))
  }
})
