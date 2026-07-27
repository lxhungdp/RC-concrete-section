'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Focus, ZoomIn, ZoomOut } from 'lucide-react'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import {
  sectionMeshRenderPlan,
  type SectionMeshView
} from '../../lib/section-mesh-view'

type Props = {
  theme: 'light' | 'dark'
  mesh: SectionMeshView
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  showQuadraturePoints: boolean
  showRebars: boolean
}

type Camera = { centerX: number; centerY: number; zoom: number }

type ViewTransform = {
  dpr: number
  scale: number
  plotCenterX: number
  plotCenterY: number
  plotWidth: number
  plotHeight: number
  visibleMinX: number
  visibleMaxX: number
  visibleMinY: number
  visibleMaxY: number
}

type HoverInfo = {
  xCss: number
  yCss: number
  worldX: number
  worldY: number
  cellI: number
  cellJ: number
  triangleIndex: number
  depth: number
  component: number
  localTriangle: number
  area: number
}

const MIN_ZOOM = 1
const MAX_ZOOM = 8192
const fmt = (value: number, digits = 3) =>
  Math.abs(value) < 1e-12 ? '0' : value.toLocaleString('en-US', { maximumFractionDigits: digits })

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const niceScaleLength = (target: number) => {
  const positive = Math.max(target, 1e-12)
  const power = 10 ** Math.floor(Math.log10(positive))
  const normalized = positive / power
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1
  return step * power
}

const triangleContains = (mesh: SectionMeshView, triangleIndex: number, x: number, y: number) => {
  const offset = triangleIndex * 6
  const ax = mesh.coordinates[offset]
  const ay = mesh.coordinates[offset + 1]
  const bx = mesh.coordinates[offset + 2]
  const by = mesh.coordinates[offset + 3]
  const cx = mesh.coordinates[offset + 4]
  const cy = mesh.coordinates[offset + 5]
  const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
  if (Math.abs(denominator) < 1e-18) return false
  const w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator
  const w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator
  const w2 = 1 - w0 - w1
  return w0 >= -1e-8 && w1 >= -1e-8 && w2 >= -1e-8
}

/**
 * Interactive renderer for the exact clipped-cell mesh.
 *
 * At inspection zoom it draws every visible integration triangle. At overview scales, where a base
 * cell is sub-pixel or the frame would exceed its work budget, it draws an explicitly labelled
 * clipped grid LOD. The exact buffers remain resident and appear automatically as the user zooms.
 */
export function SectionMeshChart({
  theme,
  mesh,
  section,
  rebars,
  showQuadraturePoints,
  showRebars
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const statusRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<ViewTransform | null>(null)
  const cameraRef = useRef<Camera>({
    centerX: (mesh.grid.minX + mesh.grid.maxX) / 2,
    centerY: (mesh.grid.minY + mesh.grid.maxY) / 2,
    zoom: 1
  })
  const drawRef = useRef<() => void>(() => undefined)
  const zoomRef = useRef<(factor: number, clientX?: number, clientY?: number) => void>(() => undefined)
  const resetRef = useRef<() => void>(() => undefined)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const bounds = useMemo(
    () => ({
      minX: mesh.grid.minX,
      maxX: mesh.grid.maxX,
      minY: mesh.grid.minY,
      maxY: mesh.grid.maxY
    }),
    [mesh.grid.maxX, mesh.grid.maxY, mesh.grid.minX, mesh.grid.minY]
  )

  useEffect(() => {
    cameraRef.current = {
      centerX: (bounds.minX + bounds.maxX) / 2,
      centerY: (bounds.minY + bounds.maxY) / 2,
      zoom: 1
    }
    setHover(null)
    drawRef.current()
  }, [bounds])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    let frame = 0
    let dragging: { pointerId: number; clientX: number; clientY: number } | null = null
    const spanX = Math.max(bounds.maxX - bounds.minX, 1e-9)
    const spanY = Math.max(bounds.maxY - bounds.minY, 1e-9)
    const meshCellSize = Math.max(mesh.grid.cellSize, 1e-12)

    const drawSectionPath = (
      ctx: CanvasRenderingContext2D,
      px: (x: number) => number,
      py: (y: number) => number
    ) => {
      ctx.beginPath()
      for (const solid of section.solids) {
        for (const ring of [solid.outer, ...solid.holes]) {
          if (ring.length < 3) continue
          ctx.moveTo(px(ring[0].x), py(ring[0].y))
          for (let index = 1; index < ring.length; index++) ctx.lineTo(px(ring[index].x), py(ring[index].y))
          ctx.closePath()
        }
      }
    }

    const draw = () => {
      const cssWidth = Math.max(1, host.clientWidth)
      const cssHeight = Math.max(1, host.clientHeight)
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const width = Math.max(1, Math.floor(cssWidth * dpr))
      const height = Math.max(1, Math.floor(cssHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return
      const styles = getComputedStyle(document.body)
      const foreground = styles.getPropertyValue('--foreground').trim() || '#111827'
      const muted = styles.getPropertyValue('--foreground-muted').trim() || '#64748b'
      const border = styles.getPropertyValue('--border').trim() || '#cbd5e1'
      const card = styles.getPropertyValue('--card').trim() || '#ffffff'
      const canvasBackground =
        styles.getPropertyValue('--mesh-canvas-bg').trim() ||
        (theme === 'dark' ? '#0b0d10' : '#ffffff')
      const accent = styles.getPropertyValue('--accent').trim() || '#2563eb'

      const padLeft = 38 * dpr
      const padRight = 16 * dpr
      const padTop = 12 * dpr
      const padBottom = 34 * dpr
      const plotWidth = Math.max(1, width - padLeft - padRight)
      const plotHeight = Math.max(1, height - padTop - padBottom)
      const plotCenterX = padLeft + plotWidth / 2
      const plotCenterY = padTop + plotHeight / 2
      const fitScale = Math.min((plotWidth * 0.92) / spanX, (plotHeight * 0.92) / spanY)
      const camera = cameraRef.current
      const scale = fitScale * camera.zoom
      const px = (x: number) => plotCenterX + (x - camera.centerX) * scale
      const py = (y: number) => plotCenterY - (y - camera.centerY) * scale
      const visibleMinX = camera.centerX - plotWidth / (2 * scale)
      const visibleMaxX = camera.centerX + plotWidth / (2 * scale)
      const visibleMinY = camera.centerY - plotHeight / (2 * scale)
      const visibleMaxY = camera.centerY + plotHeight / (2 * scale)
      viewRef.current = {
        dpr,
        scale,
        plotCenterX,
        plotCenterY,
        plotWidth,
        plotHeight,
        visibleMinX,
        visibleMaxX,
        visibleMinY,
        visibleMaxY
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = canvasBackground
      ctx.fillRect(0, 0, width, height)

      drawSectionPath(ctx, px, py)
      ctx.globalAlpha = 0.08
      ctx.fillStyle = accent
      ctx.fill('evenodd')
      ctx.globalAlpha = 1

      const i0 = clamp(Math.floor((visibleMinX - mesh.grid.minX) / meshCellSize), 0, mesh.grid.gridX - 1)
      const i1 = clamp(Math.floor((visibleMaxX - mesh.grid.minX) / meshCellSize), 0, mesh.grid.gridX - 1)
      const j0 = clamp(Math.floor((visibleMinY - mesh.grid.minY) / meshCellSize), 0, mesh.grid.gridY - 1)
      const j1 = clamp(Math.floor((visibleMaxY - mesh.grid.minY) / meshCellSize), 0, mesh.grid.gridY - 1)
      const intersectsGrid =
        visibleMaxX >= mesh.grid.minX &&
        visibleMinX <= mesh.grid.maxX &&
        visibleMaxY >= mesh.grid.minY &&
        visibleMinY <= mesh.grid.maxY
      let visibleTriangles = 0
      if (intersectsGrid) {
        for (let i = i0; i <= i1; i++) {
          const firstCell = i * mesh.grid.gridY + j0
          const lastCell = i * mesh.grid.gridY + j1
          visibleTriangles += mesh.cellOffsets[lastCell + 1] - mesh.cellOffsets[firstCell]
        }
      }

      const cellPixels = meshCellSize * scale
      const renderPlan = sectionMeshRenderPlan(cellPixels, visibleTriangles)
      const exact = intersectsGrid && renderPlan.exact

      if (exact) {
        ctx.beginPath()
        for (let i = i0; i <= i1; i++) {
          for (let j = j0; j <= j1; j++) {
            const cell = i * mesh.grid.gridY + j
            for (
              let triangleIndex = mesh.cellOffsets[cell];
              triangleIndex < mesh.cellOffsets[cell + 1];
              triangleIndex++
            ) {
              const offset = triangleIndex * 6
              ctx.moveTo(px(mesh.coordinates[offset]), py(mesh.coordinates[offset + 1]))
              ctx.lineTo(px(mesh.coordinates[offset + 2]), py(mesh.coordinates[offset + 3]))
              ctx.lineTo(px(mesh.coordinates[offset + 4]), py(mesh.coordinates[offset + 5]))
              ctx.closePath()
            }
          }
        }
        ctx.strokeStyle = muted
        ctx.globalAlpha = 0.48
        ctx.lineWidth = Math.max(0.55, Math.min(1.15, cellPixels * 0.045)) * dpr
        ctx.stroke()
        ctx.globalAlpha = 1

        if (showQuadraturePoints) {
          ctx.fillStyle = accent
          const pointSize = Math.max(1.2, Math.min(3, cellPixels * 0.08)) * dpr
          for (let i = i0; i <= i1; i++) {
            for (let j = j0; j <= j1; j++) {
              const cell = i * mesh.grid.gridY + j
              for (
                let triangleIndex = mesh.cellOffsets[cell];
                triangleIndex < mesh.cellOffsets[cell + 1];
                triangleIndex++
              ) {
                const offset = triangleIndex * 6
                const ax = mesh.coordinates[offset]
                const ay = mesh.coordinates[offset + 1]
                const bx = mesh.coordinates[offset + 2]
                const by = mesh.coordinates[offset + 3]
                const cx = mesh.coordinates[offset + 4]
                const cy = mesh.coordinates[offset + 5]
                for (let rule = 0; rule < mesh.quadratureRule.length; rule += 3) {
                  const x =
                    mesh.quadratureRule[rule] * ax +
                    mesh.quadratureRule[rule + 1] * bx +
                    mesh.quadratureRule[rule + 2] * cx
                  const y =
                    mesh.quadratureRule[rule] * ay +
                    mesh.quadratureRule[rule + 1] * by +
                    mesh.quadratureRule[rule + 2] * cy
                  ctx.fillRect(px(x) - pointSize / 2, py(y) - pointSize / 2, pointSize, pointSize)
                }
              }
            }
          }
        }
      } else if (intersectsGrid) {
        const stride = renderPlan.stride
        ctx.save()
        drawSectionPath(ctx, px, py)
        ctx.clip('evenodd')
        ctx.beginPath()
        const firstI = Math.ceil(i0 / stride) * stride
        const firstJ = Math.ceil(j0 / stride) * stride
        for (let i = firstI; i <= i1 + 1; i += stride) {
          const x = mesh.grid.minX + i * meshCellSize
          ctx.moveTo(px(x), py(visibleMinY))
          ctx.lineTo(px(x), py(visibleMaxY))
        }
        for (let j = firstJ; j <= j1 + 1; j += stride) {
          const y = mesh.grid.minY + j * meshCellSize
          ctx.moveTo(px(visibleMinX), py(y))
          ctx.lineTo(px(visibleMaxX), py(y))
        }
        ctx.strokeStyle = border
        ctx.globalAlpha = 0.72
        ctx.lineWidth = 0.8 * dpr
        ctx.stroke()
        ctx.restore()
        if (statusRef.current) {
          statusRef.current.textContent =
            `Overview LOD ×${stride} · zoom for exact triangles` +
            (showQuadraturePoints ? ' and Gauss points' : '')
        }
      }

      if (statusRef.current) {
        if (!intersectsGrid) statusRef.current.textContent = 'Outside mesh · use Fit to return'
        else if (exact) {
          statusRef.current.textContent = `Exact · ${visibleTriangles.toLocaleString('en-US')} visible triangles`
        }
      }

      // Exact section outlines stay visible at every LOD.
      for (const solid of section.solids) {
        ;[solid.outer, ...solid.holes].forEach((ring, ringIndex) => {
          if (ring.length < 2) return
          ctx.beginPath()
          ctx.moveTo(px(ring[0].x), py(ring[0].y))
          for (let index = 1; index < ring.length; index++) ctx.lineTo(px(ring[index].x), py(ring[index].y))
          ctx.closePath()
          ctx.strokeStyle = ringIndex === 0 ? foreground : muted
          ctx.lineWidth = (ringIndex === 0 ? 1.8 : 1.2) * dpr
          ctx.stroke()
        })
      }

      if (showRebars) {
        for (const bar of rebars) {
          const radius = Math.max(2.5 * dpr, (bar.dia / 2) * scale)
          const screenX = px(bar.x)
          const screenY = py(bar.y)
          if (
            screenX + radius < padLeft ||
            screenX - radius > padLeft + plotWidth ||
            screenY + radius < padTop ||
            screenY - radius > padTop + plotHeight
          ) {
            continue
          }
          ctx.beginPath()
          ctx.arc(screenX, screenY, radius, 0, 2 * Math.PI)
          ctx.fillStyle = foreground
          ctx.globalAlpha = 0.72
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.strokeStyle = card
          ctx.lineWidth = 1.2 * dpr
          ctx.stroke()
        }
      }

      const exactProperties = mesh.report.exact
      if (Math.abs(exactProperties.area) > 1e-12) {
        const centroidX = exactProperties.firstMomentY / exactProperties.area
        const centroidY = exactProperties.firstMomentX / exactProperties.area
        const screenX = px(centroidX)
        const screenY = py(centroidY)
        if (
          screenX >= padLeft &&
          screenX <= padLeft + plotWidth &&
          screenY >= padTop &&
          screenY <= padTop + plotHeight
        ) {
          ctx.beginPath()
          ctx.arc(screenX, screenY, 3.4 * dpr, 0, 2 * Math.PI)
          ctx.fillStyle = accent
          ctx.fill()
          ctx.strokeStyle = card
          ctx.lineWidth = 1.2 * dpr
          ctx.stroke()
        }
      }

      const scaleLength = niceScaleLength(plotWidth / scale / 4)
      const scaleX1 = padLeft + 10 * dpr
      const scaleX2 = scaleX1 + scaleLength * scale
      const scaleY = height - 18 * dpr
      ctx.strokeStyle = foreground
      ctx.lineWidth = 1.4 * dpr
      ctx.beginPath()
      ctx.moveTo(scaleX1, scaleY)
      ctx.lineTo(scaleX2, scaleY)
      ctx.moveTo(scaleX1, scaleY - 4 * dpr)
      ctx.lineTo(scaleX1, scaleY + 4 * dpr)
      ctx.moveTo(scaleX2, scaleY - 4 * dpr)
      ctx.lineTo(scaleX2, scaleY + 4 * dpr)
      ctx.stroke()
      ctx.fillStyle = muted
      ctx.font = `${10 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(`${fmt(scaleLength, scaleLength < 1 ? 3 : 0)} mm`, (scaleX1 + scaleX2) / 2, scaleY - 6 * dpr)
      ctx.textAlign = 'right'
      ctx.fillText('x →', width - 9 * dpr, height - 9 * dpr)
      ctx.save()
      ctx.translate(13 * dpr, padTop + 12 * dpr)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText('y →', 0, 0)
      ctx.restore()
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    drawRef.current = schedule

    const reset = () => {
      cameraRef.current = {
        centerX: (bounds.minX + bounds.maxX) / 2,
        centerY: (bounds.minY + bounds.maxY) / 2,
        zoom: 1
      }
      setHover(null)
      schedule()
    }
    resetRef.current = reset

    const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
      const transform = viewRef.current
      if (!transform) return
      const camera = cameraRef.current
      const nextZoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM)
      if (nextZoom === camera.zoom) return
      const rect = host.getBoundingClientRect()
      const screenX =
        clientX === undefined ? transform.plotCenterX : (clientX - rect.left) * transform.dpr
      const screenY =
        clientY === undefined ? transform.plotCenterY : (clientY - rect.top) * transform.dpr
      const worldX = camera.centerX + (screenX - transform.plotCenterX) / transform.scale
      const worldY = camera.centerY - (screenY - transform.plotCenterY) / transform.scale
      const nextScale = transform.scale * (nextZoom / camera.zoom)
      cameraRef.current = {
        centerX: worldX - (screenX - transform.plotCenterX) / nextScale,
        centerY: worldY + (screenY - transform.plotCenterY) / nextScale,
        zoom: nextZoom
      }
      setHover(null)
      schedule()
    }
    zoomRef.current = zoomAt

    const resolveHover = (clientX: number, clientY: number): HoverInfo | null => {
      const transform = viewRef.current
      if (!transform) return null
      const rect = host.getBoundingClientRect()
      const xCss = clientX - rect.left
      const yCss = clientY - rect.top
      const screenX = xCss * transform.dpr
      const screenY = yCss * transform.dpr
      const worldX =
        cameraRef.current.centerX + (screenX - transform.plotCenterX) / transform.scale
      const worldY =
        cameraRef.current.centerY - (screenY - transform.plotCenterY) / transform.scale
      const cellI = Math.floor((worldX - mesh.grid.minX) / meshCellSize)
      const cellJ = Math.floor((worldY - mesh.grid.minY) / meshCellSize)
      if (cellI < 0 || cellI >= mesh.grid.gridX || cellJ < 0 || cellJ >= mesh.grid.gridY) return null
      const cell = cellI * mesh.grid.gridY + cellJ
      for (
        let triangleIndex = mesh.cellOffsets[cell];
        triangleIndex < mesh.cellOffsets[cell + 1];
        triangleIndex++
      ) {
        if (!triangleContains(mesh, triangleIndex, worldX, worldY)) continue
        const metadataOffset = triangleIndex * 3
        return {
          xCss,
          yCss,
          worldX,
          worldY,
          cellI,
          cellJ,
          triangleIndex,
          depth: mesh.metadata[metadataOffset],
          component: mesh.metadata[metadataOffset + 1],
          localTriangle: mesh.metadata[metadataOffset + 2],
          area: mesh.areas[triangleIndex]
        }
      }
      return null
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = clamp(Math.exp(-event.deltaY * 0.0015), 0.5, 2)
      zoomAt(factor, event.clientX, event.clientY)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 1) return
      dragging = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY }
      canvas.setPointerCapture(event.pointerId)
      host.classList.add('is-panning')
      setHover(null)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (dragging?.pointerId === event.pointerId) {
        const transform = viewRef.current
        if (!transform) return
        const dx = (event.clientX - dragging.clientX) * transform.dpr
        const dy = (event.clientY - dragging.clientY) * transform.dpr
        cameraRef.current.centerX -= dx / transform.scale
        cameraRef.current.centerY += dy / transform.scale
        dragging.clientX = event.clientX
        dragging.clientY = event.clientY
        schedule()
        return
      }
      setHover(resolveHover(event.clientX, event.clientY))
    }
    const stopDragging = (event: PointerEvent) => {
      if (dragging?.pointerId !== event.pointerId) return
      dragging = null
      host.classList.remove('is-panning')
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomAt(1.6)
      } else if (event.key === '-') {
        event.preventDefault()
        zoomAt(1 / 1.6)
      } else if (event.key === '0') {
        event.preventDefault()
        reset()
      }
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', stopDragging)
    canvas.addEventListener('pointercancel', stopDragging)
    canvas.addEventListener('dblclick', reset)
    canvas.addEventListener('keydown', onKeyDown)
    const observer = new ResizeObserver(schedule)
    observer.observe(host)
    schedule()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', stopDragging)
      canvas.removeEventListener('pointercancel', stopDragging)
      canvas.removeEventListener('dblclick', reset)
      canvas.removeEventListener('keydown', onKeyDown)
      host.classList.remove('is-panning')
    }
  }, [bounds, mesh, rebars, section.solids, showQuadraturePoints, showRebars, theme])

  return (
    <div ref={hostRef} className="pm-section-mesh-host">
      <canvas
        ref={canvasRef}
        className="pm-section-field-canvas"
        tabIndex={0}
        aria-label="Interactive exact section mesh; use the mouse wheel to zoom and drag to pan"
      />
      <div className="pm-section-mesh-nav" role="toolbar" aria-label="Section mesh navigation">
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => zoomRef.current(1.6)}>
          <ZoomIn size={14} />
        </button>
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => zoomRef.current(1 / 1.6)}>
          <ZoomOut size={14} />
        </button>
        <button type="button" title="Fit mesh" aria-label="Fit mesh" onClick={() => resetRef.current()}>
          <Focus size={14} />
        </button>
      </div>
      <div ref={statusRef} className="pm-section-mesh-lod" role="status" />
      <div className="pm-section-mesh-hint">Wheel to zoom · drag to pan · double-click to fit</div>
      {hover ? (
        <div
          className="pm-section-field-tooltip"
          style={{
            left: Math.min(hover.xCss + 14, (hostRef.current?.clientWidth ?? 0) - 190),
            top: Math.max(8, hover.yCss - 12)
          }}
        >
          <strong>
            Cell {hover.cellI}, {hover.cellJ}
          </strong>
          <span>
            Triangle {hover.localTriangle + 1} · component {hover.component + 1}
          </span>
          <span>
            x {fmt(hover.worldX, 3)} · y {fmt(hover.worldY, 3)} mm
          </span>
          <span>Area {fmt(hover.area, 4)} mm²</span>
          <span>Subdivision depth {hover.depth}</span>
        </div>
      ) : null}
    </div>
  )
}
