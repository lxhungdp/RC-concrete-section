'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Focus, ZoomIn, ZoomOut } from 'lucide-react'
import {
  SECTION_CAMERA_FIT,
  SECTION_CAMERA_STEP,
  panSectionCamera,
  sectionWheelZoomFactor,
  zoomSectionCamera,
  type SectionCamera
} from './section-camera'

/**
 * Wheel zoom, drag pan, double-click fit and `+` / `-` / `0` keys on a section canvas, matching the
 * Options mesh view. The renderer reads `cameraRef` and writes the zoom pivot into `pivotRef`
 * (CSS pixels) on every frame; `redrawRef` schedules its next frame. `resetKey` refits the view
 * when the drawn section changes.
 */
export function useSectionCanvasCamera(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  redrawRef: RefObject<() => void>,
  resetKey: string
) {
  const cameraRef = useRef<SectionCamera>(SECTION_CAMERA_FIT)
  const pivotRef = useRef({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)

  const zoomBy = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const point = clientX === undefined || clientY === undefined
      ? pivotRef.current
      : { x: clientX - rect.left, y: clientY - rect.top }
    const next = zoomSectionCamera(cameraRef.current, factor, point, pivotRef.current)
    if (next === cameraRef.current) return
    cameraRef.current = next
    redrawRef.current()
  }, [canvasRef, redrawRef])

  const fit = useCallback(() => {
    cameraRef.current = SECTION_CAMERA_FIT
    redrawRef.current()
  }, [redrawRef])

  useEffect(() => {
    cameraRef.current = SECTION_CAMERA_FIT
    redrawRef.current()
  }, [redrawRef, resetKey])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let drag: { pointerId: number; x: number; y: number } | null = null
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomBy(sectionWheelZoomFactor(event.deltaY), event.clientX, event.clientY)
    }
    const onPointerDown = (event: PointerEvent) => {
      if ((event.button !== 0 && event.button !== 1) || drag) return
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      canvas.setPointerCapture(event.pointerId)
      setPanning(true)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (drag?.pointerId !== event.pointerId) return
      cameraRef.current = panSectionCamera(cameraRef.current, event.clientX - drag.x, event.clientY - drag.y)
      drag.x = event.clientX
      drag.y = event.clientY
      redrawRef.current()
    }
    const stop = (event: PointerEvent) => {
      if (drag?.pointerId !== event.pointerId) return
      drag = null
      setPanning(false)
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '+' || event.key === '=') zoomBy(SECTION_CAMERA_STEP)
      else if (event.key === '-') zoomBy(1 / SECTION_CAMERA_STEP)
      else if (event.key === '0') fit()
      else return
      event.preventDefault()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', stop)
    canvas.addEventListener('pointercancel', stop)
    canvas.addEventListener('dblclick', fit)
    canvas.addEventListener('keydown', onKeyDown)
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', stop)
      canvas.removeEventListener('pointercancel', stop)
      canvas.removeEventListener('dblclick', fit)
      canvas.removeEventListener('keydown', onKeyDown)
    }
    // `resetKey` also re-attaches the listeners when the canvas mounts after an empty state.
  }, [canvasRef, fit, redrawRef, resetKey, zoomBy])

  return { cameraRef, pivotRef, panning, zoomBy, fit }
}

/** Zoom in, zoom out and fit buttons shared with the Options mesh view. */
export function SectionCanvasNav({ label, onZoom, onFit }: {
  label: string
  onZoom: (factor: number) => void
  onFit: () => void
}) {
  return (
    <div className="pm-section-mesh-nav ws-chart-controls" role="toolbar" aria-label={label}>
      <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => onZoom(SECTION_CAMERA_STEP)} className="ws-action ws-action--icon">
        <ZoomIn size={14} />
      </button>
      <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => onZoom(1 / SECTION_CAMERA_STEP)} className="ws-action ws-action--icon">
        <ZoomOut size={14} />
      </button>
      <button type="button" title="Fit section · double-click" aria-label="Fit section" onClick={onFit} className="ws-action ws-action--icon">
        <Focus size={14} />
      </button>
    </div>
  )
}
