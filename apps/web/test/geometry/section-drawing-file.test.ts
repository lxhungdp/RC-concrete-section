import assert from 'node:assert/strict'
import test from 'node:test'
import { DRAWING_LIMITS, importSectionDxf } from '../../features/section-editor/geometry/section-dxf'
import { readSectionDrawingBytes } from '../../features/section-editor/geometry/section-drawing-file'

const bytes = (text: string) => new TextEncoder().encode(text).buffer
const rectangle = '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\npm\n90\n4\n70\n1\n10\n0\n20\n0\n10\n400\n20\n0\n10\n400\n20\n600\n10\n0\n20\n600\n0\nENDSEC\n0\nEOF\n'

test('Drawing file input: ASCII DXF still reaches shared geometry validation unchanged', () => {
  const result = readSectionDrawingBytes(bytes(rectangle), 'section.DXF')
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal(result.value, rectangle)
  assert.deepEqual(result.warnings, [])
  const geometry = importSectionDxf(result.value)
  assert.ok(geometry.ok)
  if (geometry.ok) assert.equal(geometry.value.outers[0][0].length, 4)
})

test('Drawing file input: DWG and a renamed binary DWG return actionable blocking issues', () => {
  for (const name of ['section.dwg', 'section.DWG', 'renamed.dxf']) {
    const result = readSectionDrawingBytes(bytes('AC1032\0binary drawing'), name)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.issue.code, 'FORMAT')
      assert.match(result.issue.message, /Save the drawing as ASCII DXF/)
      assert.match(result.issue.message, /ZWCAD/)
    }
  }
  const direct = importSectionDxf('AC1032\0binary drawing')
  assert.equal(direct.ok, false)
  if (!direct.ok) assert.match(direct.issue.message, /Save the drawing as ASCII DXF/)
})

test('Drawing file input: binary DXF, other extensions and oversized files fail before geometry parsing', () => {
  for (const [content, name] of [['AutoCAD Binary DXF\r\n\u001a\0', 'section.dxf'], [rectangle, 'section.txt']]) {
    const result = readSectionDrawingBytes(bytes(content), name)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.issue.code, 'FORMAT')
  }
  const large = readSectionDrawingBytes(new ArrayBuffer(DRAWING_LIMITS.bytes + 1), 'section.dxf')
  assert.equal(large.ok, false)
  if (!large.ok) assert.equal(large.issue.code, 'RESOURCE_LIMIT')
})
