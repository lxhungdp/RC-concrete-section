const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
const { cameras } = require('@jscad/regl-renderer')
const perspectiveCamera = cameras.perspective
const orbitControls = require('@jscad/regl-renderer').controls.orbit
const {
  CAD_2D_AXES,
  CAD_2D_DISTANCE,
  DEFAULT_3D_FOV,
  DEFAULT_CAD_2D_UNITS_PER_PIXEL,
  INITIAL_3D_CAMERA_POSITION
} = require('./constants')

const cloneControlsDefaults = (rotateAllowed) => {
  const c = Object.assign({}, orbitControls.defaults)
  c.userControl = Object.assign({}, orbitControls.defaults.userControl, { rotate: rotateAllowed })
  return c
}

const cad2dAxes = (camera) => CAD_2D_AXES[camera.cad2dPlane] || CAD_2D_AXES.xy

const setCad2dProjection = (camera, width, height) => {
  if (!width || !height) return
  const unitsPerPixel =
    camera.unitsPerPixel && isFinite(camera.unitsPerPixel) && camera.unitsPerPixel > 0
      ? camera.unitsPerPixel
      : DEFAULT_CAD_2D_UNITS_PER_PIXEL
  const halfW = width * unitsPerPixel * 0.5
  const halfH = height * unitsPerPixel * 0.5
  camera.projection = mat4.ortho([], -halfW, halfW, -halfH, halfH, camera.near || 0.1, camera.far || 5000)
  camera.aspect = width / height
  camera.viewport = [0, 0, width, height]
}

const setCad2dView = (camera) => {
  const center = camera.target || [0, 0, 0]
  const axes = cad2dAxes(camera)
  camera.up = axes.up
  camera.position = [
    center[0] + axes.normal[0] * CAD_2D_DISTANCE,
    center[1] + axes.normal[1] * CAD_2D_DISTANCE,
    center[2] + axes.normal[2] * CAD_2D_DISTANCE
  ]
  camera.view = mat4.lookAt(mat4.create(), camera.position, center, camera.up)
}

const updateCad2dCamera = (camera, canvasEl) => {
  if (!camera || camera.projectionType !== 'orthographic') return
  if (canvasEl && canvasEl.width && canvasEl.height) {
    setCad2dProjection(camera, canvasEl.width, canvasEl.height)
  }
  setCad2dView(camera)
}

const rebuildProjection = (camera, canvasEl) => {
  if (!canvasEl || !canvasEl.width || !canvasEl.height) return
  if (camera.projectionType === 'orthographic') {
    updateCad2dCamera(camera, canvasEl)
    return
  }
  perspectiveCamera.setProjection(camera, camera, { width: canvasEl.width, height: canvasEl.height })
}

const applyViewMode = (mode, camera, controls, resizeFn, canvasEl) => {
  if (mode === '3d') {
    const nextControls = cloneControlsDefaults(true)
    camera.projectionType = 'perspective'
    camera.fov = DEFAULT_3D_FOV
    camera.target = [0, 0, 0]
    camera.up = [0, 0, 1]
    camera.position = [...INITIAL_3D_CAMERA_POSITION]
    resizeFn(canvasEl)
    rebuildProjection(camera, canvasEl)
    return nextControls
  }

  if (CAD_2D_AXES[mode]) {
    const nextControls = cloneControlsDefaults(false)
    camera.projectionType = 'orthographic'
    camera.cad2dPlane = mode
    camera.target = [0, 0, 0]
    camera.unitsPerPixel = camera.unitsPerPixel || DEFAULT_CAD_2D_UNITS_PER_PIXEL
    camera.near = camera.near || 0.1
    camera.far = Math.max(camera.far || 0, CAD_2D_DISTANCE * 2)
    resizeFn(canvasEl)
    updateCad2dCamera(camera, canvasEl)
    return nextControls
  }

  return controls
}

const resizeCanvas = (viewerElement, camera, onSizeChange) => {
  const pixelRatio = window.devicePixelRatio || 1
  const bounds = viewerElement.getBoundingClientRect()
  const width = (bounds.right - bounds.left) * pixelRatio
  const height = (bounds.bottom - bounds.top) * pixelRatio
  const prevWidth = viewerElement.width
  const prevHeight = viewerElement.height

  if (prevWidth !== width || prevHeight !== height) {
    viewerElement.width = width
    viewerElement.height = height
    if (onSizeChange) onSizeChange()

    if (camera.projectionType === 'orthographic') {
      setCad2dProjection(camera, width, height)
      setCad2dView(camera)
    } else {
      perspectiveCamera.setProjection(camera, camera, { width, height })
      perspectiveCamera.update(camera, camera)
    }
  }
}

const panCad2d = (camera, delta, speed = 1) => {
  const unitsPerPixel =
    camera.unitsPerPixel && isFinite(camera.unitsPerPixel) && camera.unitsPerPixel > 0
      ? camera.unitsPerPixel
      : DEFAULT_CAD_2D_UNITS_PER_PIXEL
  const axes = cad2dAxes(camera)
  const dx = delta[0] * unitsPerPixel * speed
  const dy = delta[1] * unitsPerPixel * speed
  const offset = [
    axes.right[0] * dx + axes.up[0] * dy,
    axes.right[1] * dx + axes.up[1] * dy,
    axes.right[2] * dx + axes.up[2] * dy
  ]
  camera.target = vec3.add([], camera.target || [0, 0, 0], offset)
  setCad2dView(camera)
  return camera
}

const zoomCad2d = (camera, zoomDelta, speed = 0.08) => {
  if (!zoomDelta || !isFinite(zoomDelta)) return camera
  const current =
    camera.unitsPerPixel && isFinite(camera.unitsPerPixel) && camera.unitsPerPixel > 0
      ? camera.unitsPerPixel
      : DEFAULT_CAD_2D_UNITS_PER_PIXEL
  const factor = zoomDelta > 0 ? (1 + speed) : (1 / (1 + speed))
  camera.unitsPerPixel = Math.max(0.0001, Math.min(1000, current * factor))
  return camera
}

const collectNodeFitPoints = (structure) => {
  const points = []
  if (structure && Array.isArray(structure.nodes)) {
    structure.nodes.forEach((n) => {
      const p = [Number(n.x), Number(n.y), Number(n.z || 0)]
      if (p.every((v) => isFinite(v))) points.push(p)
    })
  }
  return points
}

const boundsFromPoints = (points) => {
  if (!points || !points.length) return null
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  points.forEach((p) => {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i])
      max[i] = Math.max(max[i], p[i])
    }
  })
  if (!min.every(isFinite) || !max.every(isFinite)) return null
  const center = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2
  ]
  return { min, max, center }
}

const boundsCorners = (bounds) => {
  const out = []
  for (let x = 0; x < 2; x++) {
    for (let y = 0; y < 2; y++) {
      for (let z = 0; z < 2; z++) {
        out.push([
          x ? bounds.max[0] : bounds.min[0],
          y ? bounds.max[1] : bounds.min[1],
          z ? bounds.max[2] : bounds.min[2]
        ])
      }
    }
  }
  return out
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const normalize3 = (v, fallback) => {
  const len = Math.sqrt(dot3(v, v))
  if (!isFinite(len) || len < 1e-9) return fallback
  return [v[0] / len, v[1] / len, v[2] / len]
}

const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]

const fitCad2dToBounds = (camera, bounds, canvasEl, tightness = 1.25) => {
  if (!bounds || !canvasEl || !canvasEl.width || !canvasEl.height) return false
  const axes = cad2dAxes(camera)
  const a = axes.coords[0]
  const b = axes.coords[1]
  const minA = bounds.min[a]
  const minB = bounds.min[b]
  const maxA = bounds.max[a]
  const maxB = bounds.max[b]
  if (!isFinite(minA) || !isFinite(minB) || !isFinite(maxA) || !isFinite(maxB)) return false
  const w = Math.max(maxA - minA, 1)
  const h = Math.max(maxB - minB, 1)
  const center = [0, 0, 0]
  center[a] = (minA + maxA) / 2
  center[b] = (minB + maxB) / 2
  camera.target = center
  camera.unitsPerPixel = Math.max(
    w / Math.max(canvasEl.width, 1),
    h / Math.max(canvasEl.height, 1)
  ) * tightness
  updateCad2dCamera(camera, canvasEl)
  return true
}

const perspectivePivotFromBounds = (bounds, pivotMode) => pivotMode === 'origin' ? [0, 0, 0] : bounds.center

const fitPerspectiveToBounds = (camera, bounds, canvasEl, tightness = 1.25, pivotMode = 'structure') => {
  if (!bounds || !canvasEl || !canvasEl.width || !canvasEl.height) return false
  const pivot = perspectivePivotFromBounds(bounds, pivotMode)
  const viewDir = normalize3(vec3.subtract([], camera.position || INITIAL_3D_CAMERA_POSITION, camera.target || [0, 0, 0]), [1, 1, 1])
  const up = normalize3(camera.up || [0, 0, 1], [0, 0, 1])
  let right = normalize3(cross3(up, viewDir), [1, 0, 0])
  let screenUp = normalize3(cross3(viewDir, right), up)
  if (Math.abs(dot3(right, right)) < 1e-9) right = [1, 0, 0]
  if (Math.abs(dot3(screenUp, screenUp)) < 1e-9) screenUp = up

  let halfW = 0
  let halfH = 0
  let halfD = 0
  boundsCorners(bounds).forEach((p) => {
    const v = vec3.subtract([], p, pivot)
    halfW = Math.max(halfW, Math.abs(dot3(v, right)))
    halfH = Math.max(halfH, Math.abs(dot3(v, screenUp)))
    halfD = Math.max(halfD, Math.abs(dot3(v, viewDir)))
  })

  halfW = Math.max(halfW, 0.5)
  halfH = Math.max(halfH, 0.5)
  const aspect = canvasEl.width / canvasEl.height || camera.aspect || 1
  const fov = camera.fov || DEFAULT_3D_FOV
  const tanHalf = Math.tan(fov / 2)
  const distance = (halfD + Math.max(halfH / tanHalf, halfW / (tanHalf * aspect))) * tightness
  const safeDistance = Math.max(distance, 1)
  camera.target = pivot
  camera.position = [
    pivot[0] + viewDir[0] * safeDistance,
    pivot[1] + viewDir[1] * safeDistance,
    pivot[2] + viewDir[2] * safeDistance
  ]
  camera.near = Math.max(camera.near || 1, 1)
  camera.far = Math.max(camera.far || 0, safeDistance + halfD * 4 + 100)
  perspectiveCamera.setProjection(camera, camera, { width: canvasEl.width, height: canvasEl.height })
  perspectiveCamera.update(camera, camera)
  return true
}

const zoomToFitView = (camera, canvasEl, tightness = 1.25, structure, orbitPivot = 'structure') => {
  const bounds = boundsFromPoints(collectNodeFitPoints(structure))
  if (!bounds) return false
  if (camera.projectionType === 'orthographic') {
    return fitCad2dToBounds(camera, bounds, canvasEl, tightness)
  }
  return fitPerspectiveToBounds(camera, bounds, canvasEl, tightness, orbitPivot)
}

module.exports = {
  cloneControlsDefaults,
  applyViewMode,
  resizeCanvas,
  orbitControls,
  perspectiveCamera,
  panCad2d,
  zoomCad2d,
  zoomToFitCad2d: zoomToFitView,
  zoomToFitView,
  updateCad2dCamera,
  collectNodeFitPoints,
  boundsFromPoints,
  boundsCorners,
  fitCad2dToBounds,
  fitPerspectiveToBounds,
  cad2dAxes,
  DEFAULT_3D_FOV
}
