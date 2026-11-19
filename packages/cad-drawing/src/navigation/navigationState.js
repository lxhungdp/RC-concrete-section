const { isViewMode2d, VIEW_MODES_2D } = require('./viewModes')

const NAVIGATION_MODES = ['select', 'rotate', 'pan']

const defaultNavigation = () => ({ mode: 'rotate' })

const defaultSelection = () => ({
  selectedNodeIds: [],
  selectedElementIds: []
})

const getViewMode = (state) =>
  (state && state.viewer && state.viewer.camera && state.viewer.camera.viewMode) || '3d'

const normalizeNavigationModeForViewMode = (mode, viewMode) => {
  const m = NAVIGATION_MODES.includes(mode) ? mode : 'rotate'
  return isViewMode2d(viewMode) && m === 'rotate' ? 'select' : m
}

const ensureSelection = (state) => {
  const s = (state.viewer && state.viewer.selection) || {}
  return Object.assign(defaultSelection(), s)
}

const getNavigationMode = (state) => {
  const m = state && state.viewer && state.viewer.navigation && state.viewer.navigation.mode
  if (NAVIGATION_MODES.includes(m)) return m
  if (state && state.viewer && state.viewer.selection && state.viewer.selection.mode === 'select') {
    return 'select'
  }
  return 'rotate'
}

const effectiveNavigationMode = (state) =>
  normalizeNavigationModeForViewMode(getNavigationMode(state), getViewMode(state))

const setNavigationMode = (state, mode) => {
  if (!state || !state.viewer) return {}
  const m = normalizeNavigationModeForViewMode(mode, getViewMode(state))
  const prevDrawing = state.viewer.drawing || { mode: 'none', snapEnabled: true }
  const drawing =
    m === 'select'
      ? Object.assign({}, prevDrawing, { mode: 'none' })
      : prevDrawing
  const prevSel = ensureSelection(state)
  const selection =
    m === 'select'
      ? Object.assign({}, prevSel, { selectedNodeIds: [], selectedElementIds: [] })
      : prevSel
  const navigation = Object.assign(defaultNavigation(), (state.viewer.navigation || {}), { mode: m })
  const viewer = Object.assign({}, state.viewer, { navigation, drawing, selection })
  return { viewer }
}

module.exports = {
  NAVIGATION_MODES,
  VIEW_MODES_2D,
  defaultNavigation,
  defaultSelection,
  ensureSelection,
  getViewMode,
  isViewMode2d,
  normalizeNavigationModeForViewMode,
  getNavigationMode,
  effectiveNavigationMode,
  setNavigationMode
}
