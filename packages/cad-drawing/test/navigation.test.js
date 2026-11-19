const test = require('ava')
const {
  effectiveNavigationMode,
  setNavigationMode,
  setViewMode,
  resolveViewerCursor
} = require('../src')

const base = () => ({
  viewer: {
    camera: { viewMode: '3d' },
    navigation: { mode: 'rotate' },
    drawing: { mode: 'none' },
    selection: { selectedNodeIds: [], selectedElementIds: [] }
  }
})

test('2d views normalize rotate navigation to select', (t) => {
  const state = base()
  state.viewer.camera.viewMode = 'xy'
  state.viewer.navigation.mode = 'rotate'
  t.is(effectiveNavigationMode(state), 'select')
})

test('setNavigationMode clears drawing state when selecting', (t) => {
  const state = base()
  state.viewer.drawing.mode = 'node'
  const next = setNavigationMode(state, 'select')
  t.is(next.viewer.navigation.mode, 'select')
  t.is(next.viewer.drawing.mode, 'none')
})

test('view mode transition stores 3d nav and restores it', (t) => {
  const in2d = setViewMode(base(), 'xz')
  t.is(in2d.viewer.camera.viewMode, 'xz')
  t.is(in2d.viewer.navigation.mode, 'select')
  t.is(in2d.viewer.navigation.modeBefore2d, 'rotate')

  const back = setViewMode({ viewer: in2d.viewer }, '3d')
  t.is(back.viewer.camera.viewMode, '3d')
  t.is(back.viewer.navigation.mode, 'rotate')
})

test('cursor contract stays stable for select pan rotate', (t) => {
  t.is(resolveViewerCursor('select', false, false, false), 'crosshair')
  t.is(resolveViewerCursor('pan', false, false, false), 'grab')
  t.is(resolveViewerCursor('rotate', false, false, false), 'move')
  t.is(resolveViewerCursor('rotate', false, true, true), 'grabbing')
})
