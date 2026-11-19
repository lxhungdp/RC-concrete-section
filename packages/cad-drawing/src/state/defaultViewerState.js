const { isViewMode2d } = require('../navigation')

const createDefaultCadViewerState = (options = {}) => {
  const viewMode = options.viewMode || '3d'
  const orbitPivot = options.orbitPivot || 'structure'
  const navigationMode = options.navigationMode || (isViewMode2d(viewMode) ? 'select' : 'rotate')

  return {
    rendering: Object.assign({
      background: [1, 1, 1, 1],
      meshColor: [0, 0.6, 1, 1],
      autoRotate: false,
      autoZoom: true
    }, options.rendering || {}),
    grid: Object.assign({
      show: true,
      color: [1, 1, 1, 0.1],
      size: [200, 200],
      majorStep: 10,
      minorStep: 1
    }, options.grid || {}),
    axes: Object.assign({
      show: true
    }, options.axes || {}),
    camera: Object.assign({
      position: '',
      viewMode,
      orbitPivot
    }, options.camera || {}),
    drawing: Object.assign({
      mode: 'none',
      snapEnabled: true
    }, options.drawing || {}),
    navigation: Object.assign({
      mode: navigationMode
    }, options.navigation || {}),
    selection: Object.assign({
      selectedNodeIds: [],
      selectedElementIds: [],
      /** Generic selection for future entity kinds: node, element, plate, solid, etc. */
      selectedEntities: []
    }, options.selection || {}),
    results: Object.assign({
      mode: null,
      diagramAmplitude: 1,
      diagramFill: 'line',
      tableModal: null
    }, options.results || {})
  }
}

module.exports = { createDefaultCadViewerState }
