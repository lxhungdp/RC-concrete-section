import assert from 'node:assert/strict'
import test from 'node:test'
import { SECTION_LINE_OVERHANG, sectionLineChords, sectionLineSegment } from '../../features/section-editor/results/section-overlay-line'

// 400 x 600 rectangle with a 200 x 400 hole, centred on the origin.
const outer = [{ x: -200, y: -300 }, { x: 200, y: -300 }, { x: 200, y: 300 }, { x: -200, y: 300 }]
const hole = [{ x: -100, y: -200 }, { x: -100, y: 200 }, { x: 100, y: 200 }, { x: 100, y: -200 }]
const overhang = SECTION_LINE_OVERHANG * 600
const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) =>
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-9, `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)

test('a line crossing the section spans its outer chord plus a short overhang', () => {
  const horizontal = sectionLineSegment({ x: 0, y: 50 }, { x: 1, y: 0 }, [outer, hole])
  assert.ok(horizontal)
  close(horizontal[0], { x: -200 - overhang, y: 50 })
  close(horizontal[1], { x: 200 + overhang, y: 50 })
  // A vertical line through the hole still spans the whole outer depth.
  const vertical = sectionLineSegment({ x: 0, y: 0 }, { x: 0, y: -2 }, [outer, hole])
  assert.ok(vertical)
  close(vertical[0], { x: 0, y: 300 + overhang })
  close(vertical[1], { x: 0, y: -300 - overhang })
})

test('the segment is fixed in world coordinates, independent of the line anchor', () => {
  const a = sectionLineSegment({ x: -150, y: -150 }, { x: 1, y: 1 }, [outer])
  const b = sectionLineSegment({ x: 120, y: 120 }, { x: 3, y: 3 }, [outer])
  assert.ok(a && b)
  close(a[0], b[0])
  close(a[1], b[1])
})

test('a line that misses the section spans the section projection; degenerate input returns null', () => {
  const outside = sectionLineSegment({ x: 500, y: 0 }, { x: 0, y: 1 }, [outer])
  assert.ok(outside)
  close(outside[0], { x: 500, y: -300 - overhang })
  close(outside[1], { x: 500, y: 300 + overhang })
  assert.equal(sectionLineSegment({ x: 0, y: 0 }, { x: 0, y: 0 }, [outer]), null)
  assert.equal(sectionLineSegment({ x: 0, y: 0 }, { x: 1, y: 0 }, []), null)
})

test('block-edge chords stay inside the concrete and split at holes', () => {
  // Through the hole: two wall chords, no overhang.
  const split = sectionLineChords({ x: 0, y: 50 }, { x: 1, y: 0 }, [outer, hole])
  assert.equal(split.length, 2)
  close(split[0][0], { x: -200, y: 50 })
  close(split[0][1], { x: -100, y: 50 })
  close(split[1][0], { x: 100, y: 50 })
  close(split[1][1], { x: 200, y: 50 })
  // Below the hole: one full-width chord.
  const solid = sectionLineChords({ x: 0, y: -250 }, { x: -1, y: 0 }, [outer, hole])
  assert.equal(solid.length, 1)
  close(solid[0][0], { x: 200, y: -250 })
  close(solid[0][1], { x: -200, y: -250 })
  assert.deepEqual(sectionLineChords({ x: 0, y: 400 }, { x: 1, y: 0 }, [outer, hole]), [])
})
