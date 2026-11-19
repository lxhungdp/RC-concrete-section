/**
 * Display-only zoom and pan for the section canvases (design standard, Surfaces). The camera
 * scales a fitted world-to-CSS-pixel transform about a pivot and translates it; it never changes
 * geometry, mesh, sampling or any engineering value.
 */
export type SectionCamera = { zoom: number; panX: number; panY: number }

/** World-to-CSS-pixel fit: `X = offsetX + (x - worldMinX) * scale`, `Y = offsetY + (worldMaxY - y) * scale`. */
export type SectionFitTransform = { scale: number; offsetX: number; offsetY: number }

export const SECTION_CAMERA_FIT: SectionCamera = { zoom: 1, panX: 0, panY: 0 }
export const SECTION_CAMERA_ZOOM_LIMITS = { min: 1, max: 8192 } as const
/** Toolbar and keyboard zoom step; the wheel uses `sectionWheelZoomFactor`. */
export const SECTION_CAMERA_STEP = 1.6

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Applies the camera to a fit: zoom about `pivot`, then translate by the pan, all in CSS pixels. */
export const applySectionCamera = (
  fit: SectionFitTransform,
  pivot: { x: number; y: number },
  camera: SectionCamera
): SectionFitTransform => ({
  scale: fit.scale * camera.zoom,
  offsetX: pivot.x + (fit.offsetX - pivot.x) * camera.zoom + camera.panX,
  offsetY: pivot.y + (fit.offsetY - pivot.y) * camera.zoom + camera.panY
})

/** Zooms by `factor`, keeping the world point under `point` (CSS pixels) fixed on screen. */
export const zoomSectionCamera = (
  camera: SectionCamera,
  factor: number,
  point: { x: number; y: number },
  pivot: { x: number; y: number }
): SectionCamera => {
  if (!Number.isFinite(factor) || factor <= 0) return camera
  const zoom = clamp(camera.zoom * factor, SECTION_CAMERA_ZOOM_LIMITS.min, SECTION_CAMERA_ZOOM_LIMITS.max)
  if (zoom === camera.zoom) return camera
  const ratio = zoom / camera.zoom
  return {
    zoom,
    panX: point.x - pivot.x - (point.x - pivot.x - camera.panX) * ratio,
    panY: point.y - pivot.y - (point.y - pivot.y - camera.panY) * ratio
  }
}

export const panSectionCamera = (camera: SectionCamera, dx: number, dy: number): SectionCamera =>
  Number.isFinite(dx) && Number.isFinite(dy) ? { ...camera, panX: camera.panX + dx, panY: camera.panY + dy } : camera

/** Same wheel response as the Options mesh view. */
export const sectionWheelZoomFactor = (deltaY: number) => clamp(Math.exp(-deltaY * 0.0015), 0.5, 2)
