const VIEW_MODE_3D = '3d'
const VIEW_MODES_2D = ['xy', 'xz', 'yz']
const VIEW_MODES = [VIEW_MODE_3D, ...VIEW_MODES_2D]

const isViewMode2d = (viewMode) => VIEW_MODES_2D.includes(viewMode)
const isAllowedViewMode = (viewMode) => VIEW_MODES.includes(viewMode)

module.exports = {
  VIEW_MODE_3D,
  VIEW_MODES,
  VIEW_MODES_2D,
  isAllowedViewMode,
  isViewMode2d
}
