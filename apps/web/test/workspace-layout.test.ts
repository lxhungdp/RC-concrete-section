import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SIDEBAR_WIDTH, WORKSPACE_PANE_GAP, sidebarBounds, sidebarKeyboardWidth, visibleSidebarWidth } from '../features/section-editor/shared/workspace-layout'

test('sidebar clamping leaves CAD space without losing the preferred desktop width', () => {
  assert.deepEqual(sidebarBounds(1280), { min: 260, max: 720 })
  assert.equal(visibleSidebarWidth(DEFAULT_SIDEBAR_WIDTH, 600), 314)
  assert.equal(visibleSidebarWidth(DEFAULT_SIDEBAR_WIDTH, 1280), 378)
  assert.equal(visibleSidebarWidth(700, 800), 514)
  assert.ok(800 - visibleSidebarWidth(700, 800) - WORKSPACE_PANE_GAP >= 280)
  assert.deepEqual(sidebarBounds(500), { min: 247, max: 247 })
  assert.deepEqual(sidebarBounds(0), { min: 0, max: 0 })
})

test('sidebar keyboard resizing is bounded and supports coarse steps and endpoints', () => {
  assert.equal(sidebarKeyboardWidth('ArrowRight', false, 378, 1280), 388)
  assert.equal(sidebarKeyboardWidth('ArrowLeft', true, 378, 1280), 338)
  assert.equal(sidebarKeyboardWidth('ArrowRight', true, 710, 1280), 720)
  assert.equal(sidebarKeyboardWidth('ArrowLeft', false, 260, 1280), 260)
  assert.equal(sidebarKeyboardWidth('Home', false, 378, 1280), 260)
  assert.equal(sidebarKeyboardWidth('End', false, 378, 1280), 720)
  assert.equal(sidebarKeyboardWidth('Escape', false, 378, 1280), null)
})
