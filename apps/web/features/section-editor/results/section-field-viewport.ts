/** Display-only fit shared by physical fields and the geometry-only fallback. */
export const sectionFieldViewport = (
  width: number,
  height: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  visibleOrigin: { x: number; y: number },
  padding: { left: number; right: number; top: number; bottom: number }
) => {
  const { minX, maxX, minY, maxY } = bounds
  const marginX = (maxX - minX) * 0.04
  const marginY = (maxY - minY) * 0.04
  const worldMinX = Math.min(minX, visibleOrigin.x) - marginX
  const worldMaxX = Math.max(maxX, visibleOrigin.x) + marginX
  const worldMinY = Math.min(minY, visibleOrigin.y) - marginY
  const worldMaxY = Math.max(maxY, visibleOrigin.y) + marginY
  const plotWidth = Math.max(1, width - padding.left - padding.right)
  const plotHeight = Math.max(1, height - padding.top - padding.bottom)
  const scale = Math.min(plotWidth / (worldMaxX - worldMinX), plotHeight / (worldMaxY - worldMinY))
  const offsetX = padding.left + (plotWidth - (worldMaxX - worldMinX) * scale) / 2
  const offsetY = padding.top + (plotHeight - (worldMaxY - worldMinY) * scale) / 2
  return { worldMinX, worldMaxX, worldMinY, worldMaxY, scale, offsetX, offsetY }
}
