const {
  getNavigationMode,
  NAVIGATION_MODES,
  setNavigationMode
} = require('./navigationState')
const { isAllowedViewMode } = require('./viewModes')

/**
 * Shared 2D/3D view-mode transition.
 *
 * Entering any 2D plane stores the current 3D navigation mode and switches to
 * selection. Leaving 2D restores the stored 3D mode. The host may pass
 * `onPersistViewMode` to save the final mode in localStorage or another store.
 */
const setViewMode = (state, viewMode, options = {}) => {
  if (!state || !state.viewer) return {}
  const prevViewMode = (state.viewer.camera && state.viewer.camera.viewMode) || '3d'
  const vm = isAllowedViewMode(viewMode) ? viewMode : prevViewMode
  if (typeof options.onPersistViewMode === 'function') options.onPersistViewMode(vm)

  let merged = Object.assign({}, state, {
    viewer: Object.assign({}, state.viewer, {
      camera: Object.assign({}, state.viewer.camera, { viewMode: vm })
    })
  })

  if (vm !== '3d' && prevViewMode === '3d') {
    const saved = getNavigationMode(state)
    merged.viewer = Object.assign({}, merged.viewer, {
      navigation: Object.assign(
        {},
        merged.viewer.navigation || {},
        { modeBefore2d: saved }
      )
    })
    merged = Object.assign(merged, setNavigationMode(merged, 'select'))
  } else if (vm === '3d' && prevViewMode !== '3d') {
    const restore = (state.viewer.navigation && state.viewer.navigation.modeBefore2d) || 'rotate'
    const mode = NAVIGATION_MODES.includes(restore) ? restore : 'rotate'
    merged = Object.assign(merged, setNavigationMode(merged, mode))
  }

  return { viewer: merged.viewer }
}

module.exports = { setViewMode }
