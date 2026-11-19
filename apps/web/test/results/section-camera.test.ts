import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SECTION_CAMERA_FIT,
  SECTION_CAMERA_ZOOM_LIMITS,
  applySectionCamera,
  panSectionCamera,
  sectionWheelZoomFactor,
  zoomSectionCamera
} from '../../features/section-editor/results/section-camera'

const fit = { scale: 0.5, offsetX: 40, offsetY: 30 }
const pivot = { x: 200, y: 150 }
const toScreen = (view: typeof fit, x: number, y: number, worldMinX = -400, worldMaxY = 300) =>
  ({ x: view.offsetX + (x - worldMinX) * view.scale, y: view.offsetY + (worldMaxY - y) * view.scale })

test('the fit camera leaves the fitted transform unchanged', () => {
  assert.deepEqual(applySectionCamera(fit, pivot, SECTION_CAMERA_FIT), fit)
})

test('zoom keeps the world point under the cursor fixed on screen', () => {
  const cursor = { x: 260, y: 90 }
  const before = applySectionCamera(fit, pivot, SECTION_CAMERA_FIT)
  // World point currently under the cursor.
  const worldX = -400 + (cursor.x - before.offsetX) / before.scale
  const worldY = 300 - (cursor.y - before.offsetY) / before.scale
  let camera = zoomSectionCamera(SECTION_CAMERA_FIT, 2.5, cursor, pivot)
  camera = zoomSectionCamera(camera, 1.6, cursor, pivot)
  const after = applySectionCamera(fit, pivot, camera)
  assert.ok(Math.abs(after.scale - fit.scale * 4) < 1e-12)
  const screen = toScreen(after, worldX, worldY)
  assert.ok(Math.abs(screen.x - cursor.x) < 1e-9 && Math.abs(screen.y - cursor.y) < 1e-9)
})

test('zoom is limited, rejects invalid factors, and pan translates in CSS pixels', () => {
  assert.equal(zoomSectionCamera(SECTION_CAMERA_FIT, 0.5, pivot, pivot), SECTION_CAMERA_FIT)
  assert.equal(zoomSectionCamera(SECTION_CAMERA_FIT, Number.NaN, pivot, pivot), SECTION_CAMERA_FIT)
  const far = zoomSectionCamera({ zoom: SECTION_CAMERA_ZOOM_LIMITS.max / 2, panX: 0, panY: 0 }, 10, pivot, pivot)
  assert.equal(far.zoom, SECTION_CAMERA_ZOOM_LIMITS.max)
  const panned = applySectionCamera(fit, pivot, panSectionCamera(SECTION_CAMERA_FIT, 12, -7))
  assert.deepEqual(panned, { scale: fit.scale, offsetX: fit.offsetX + 12, offsetY: fit.offsetY - 7 })
  assert.equal(sectionWheelZoomFactor(0), 1)
  assert.ok(sectionWheelZoomFactor(-100) > 1 && sectionWheelZoomFactor(100) < 1)
})
