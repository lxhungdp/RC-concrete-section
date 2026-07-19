const DEFAULT_SECTION_UNITS_PER_PIXEL = 1

const createSectionCamera2d = (patch = {}) => ({
  target: Array.isArray(patch.target) ? patch.target.slice(0, 2) : [0, 0],
  unitsPerPixel: Number.isFinite(patch.unitsPerPixel) && patch.unitsPerPixel > 0
    ? patch.unitsPerPixel
    : DEFAULT_SECTION_UNITS_PER_PIXEL
})

const worldToScreen = (camera, point, size) => {
  const upp = camera.unitsPerPixel || DEFAULT_SECTION_UNITS_PER_PIXEL
  return {
    x: size.width / 2 + (point.x - camera.target[0]) / upp,
    y: size.height / 2 - (point.y - camera.target[1]) / upp
  }
}

const screenToWorld = (camera, point, size) => {
  const upp = camera.unitsPerPixel || DEFAULT_SECTION_UNITS_PER_PIXEL
  return {
    x: camera.target[0] + (point.x - size.width / 2) * upp,
    y: camera.target[1] - (point.y - size.height / 2) * upp
  }
}

const panSectionCamera2d = (camera, delta) => ({
  ...camera,
  target: [
    camera.target[0] - delta.x * camera.unitsPerPixel,
    camera.target[1] + delta.y * camera.unitsPerPixel
  ]
})

const zoomSectionCamera2d = (camera, wheelDelta, anchor, size, speed = 0.0012) => {
  const before = screenToWorld(camera, anchor, size)
  const factor = Math.exp(wheelDelta * speed)
  const unitsPerPixel = Math.max(0.05, Math.min(100, camera.unitsPerPixel * factor))
  const next = { ...camera, unitsPerPixel }
  const after = screenToWorld(next, anchor, size)

  return {
    ...next,
    target: [
      next.target[0] + before.x - after.x,
      next.target[1] + before.y - after.y
    ]
  }
}

const fitSectionCamera2dToPoints = (points, size, padding = 80) => {
  if (!points || points.length === 0 || !size.width || !size.height) return createSectionCamera2d()
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const usableW = Math.max(1, size.width - padding * 2)
  const usableH = Math.max(1, size.height - padding * 2)
  const unitsPerPixel = Math.max((maxX - minX || 1) / usableW, (maxY - minY || 1) / usableH, 0.05)

  return {
    target: [(minX + maxX) / 2, (minY + maxY) / 2],
    unitsPerPixel
  }
}

const snapWorldPoint = (point, spacing = 25) => ({
  x: Math.round(point.x / spacing) * spacing,
  y: Math.round(point.y / spacing) * spacing
})

module.exports = {
  DEFAULT_SECTION_UNITS_PER_PIXEL,
  createSectionCamera2d,
  fitSectionCamera2dToPoints,
  panSectionCamera2d,
  screenToWorld,
  snapWorldPoint,
  worldToScreen,
  zoomSectionCamera2d
}
