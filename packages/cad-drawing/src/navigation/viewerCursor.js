/**
 * Resolve the CSS cursor for the drawing canvas.
 *
 * The shell owns only generic CAD states. Project-specific tools can override
 * this later, but select/pan/rotate remain stable across frame, shell, and plate
 * projects.
 */
const resolveViewerCursor = (navMode, drawingActive, panDragging, rotateDragging) => {
  if (drawingActive) return 'default'
  if (panDragging) return 'grabbing'
  if (rotateDragging) return 'move'
  if (navMode === 'select') return 'crosshair'
  if (navMode === 'pan') return 'grab'
  return 'move'
}

module.exports = { resolveViewerCursor }
