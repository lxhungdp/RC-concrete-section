import assert from 'node:assert/strict'
import test from 'node:test'
import { sectionFieldViewport } from '../../features/section-editor/results/section-field-viewport'

const padding = { left: 48, right: 132, top: 78, bottom: 36 }
const bounds = { minX: -200, maxX: 200, minY: -300, maxY: 300 }

test('field and outline share the same section-to-pixel fit with display margins', () => {
  const view = sectionFieldViewport(612, 762, bounds, { x: 0, y: 0 }, padding)
  assert.equal(view.scale, 1)
  assert.deepEqual([view.offsetX, view.offsetY], [48, 78])
  const pixel = (x: number, y: number) => [
    view.offsetX + (x - view.worldMinX) * view.scale,
    view.offsetY + (view.worldMaxY - y) * view.scale
  ]
  assert.deepEqual(pixel(-200, 300), [64, 102])
  assert.deepEqual(pixel(200, -300), [464, 702])
  assert.deepEqual(pixel(0, 0), [264, 402])
})

test('visible axes determine the fit before and after Apply, including outside origins', () => {
  for (const [width, height] of [[612, 762], [320, 420]]) {
    const previewOrigin = { x: -800, y: 900 }
    const preview = sectionFieldViewport(width, height, bounds, previewOrigin, padding)
    const applied = sectionFieldViewport(width, height, bounds, { ...previewOrigin }, padding)
    assert.deepEqual(applied, preview)
    assert.ok(preview.scale > 0)
    for (const point of [{ x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.maxY }, previewOrigin]) {
      const x = preview.offsetX + (point.x - preview.worldMinX) * preview.scale
      const y = preview.offsetY + (preview.worldMaxY - point.y) * preview.scale
      assert.ok(x >= padding.left && x <= width - padding.right)
      assert.ok(y >= padding.top && y <= height - padding.bottom)
    }
  }
})
