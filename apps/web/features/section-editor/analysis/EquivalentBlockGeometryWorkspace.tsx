'use client'

import { QuantityValue, UnitLabel, useQuantityFormatters } from '../shared/DisplayUnits'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type GeometryInputRebarView,
  type SectionGeometry
} from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { DesignBasis } from '@pm/design'
import type { CalculationProfileId } from '@pm/project'
import {
  clipPreparedSectionToHalfPlane,
  projectedOuterExtents,
  type Point2
} from '@pm/equivalent-block'
import { prepareBlockAnalysis } from '@pm/analysis-equivalent-block'
import { applySectionCamera } from '../results/section-camera'
import { OVERLAY_LINE_DASH, OVERLAY_LINE_WIDTH, sectionLineChords, sectionLineSegment } from '../results/section-overlay-line'
import { SectionCanvasNav, useSectionCanvasCamera } from '../results/SectionCanvasCamera'

type Props = {
  ready: boolean
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
  calculationProfileId: CalculationProfileId
}

/** CSS-pixel margin of the fitted view; zoom and pan start from this fit. */
const PAD = 44
/** Options CAD block colours, shared with the Demand Check stress field. */
const BLOCK_FILL = '#f97316'
const BLOCK_LABEL = '#ea580c'
const NA_COLOR = '#be123c'
const NORMAL_COLOR = '#2563eb'

const fmt = (value: number, digits = 2) =>
  Math.abs(value) < 1e-12 ? '0' : value.toLocaleString('en-US', { maximumFractionDigits: digits })

export function EquivalentBlockGeometryWorkspace({
  ready,
  section,
  rebars,
  materialStore,
  designBasis,
  calculationProfileId
}: Props) {
  const { qfmt, unit } = useQuantityFormatters()

  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef<() => void>(() => undefined)
  const [angleDeg, setAngleDeg] = useState(30)
  const [depthRatio, setDepthRatio] = useState(0.6)
  const [showRebars, setShowRebars] = useState(true)

  const preview = useMemo(() => {
    if (!ready || section.solids.length === 0) return null
    const analysis = prepareBlockAnalysis(
      calculationProfileId,
      section,
      [],
      materialStore,
      designBasis
    )
    const prepared = analysis.section
    const origin = prepared.referencePoint
    const theta = angleDeg * Math.PI / 180
    const nx = Math.cos(theta)
    const ny = Math.sin(theta)
    const extents = projectedOuterExtents(prepared, nx, ny)
    const c = Math.max(1e-9, depthRatio * extents.depth)
    const factor = {
      value: analysis.model.blockLaw.depthFactor,
      symbol: calculationProfileId === 'as-3600-2018-amd2-equivalent-block' ? 'γ' : 'β1'
    }
    const a = factor.value * c
    const neutralAxisOffset = extents.maximum - c
    const blockOffset = extents.maximum - a
    const clipped = clipPreparedSectionToHalfPlane(prepared, nx, ny, blockOffset)

    return {
      origin,
      nx,
      ny,
      bounds: prepared.bounds,
      blockGeometry: clipped.geometry,
      neutralAxisOffset,
      blockOffset,
      arrowLength: Math.min(Math.max(1, prepared.bounds.width), Math.max(1, prepared.bounds.height)) * 0.24,
      c,
      a,
      factor,
      projectedDepth: extents.depth,
      blockArea: clipped.moments.area,
      blockCentroid: clipped.moments.centroid
    }
  }, [angleDeg, calculationProfileId, depthRatio, designBasis, materialStore, ready, section])

  const fitKey = preview
    ? `${preview.bounds.minX}:${preview.bounds.maxX}:${preview.bounds.minY}:${preview.bounds.maxY}`
    : 'none'
  const camera = useSectionCanvasCamera(canvasRef, drawRef, fitKey)
  const { cameraRef, pivotRef } = camera

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas || !preview) return
    let frame = 0
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
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const theme = getComputedStyle(host)
      const foreground = theme.getPropertyValue('--foreground').trim() || '#0a0a0a'
      const accent = theme.getPropertyValue('--accent').trim() || '#2563eb'
      const card = theme.getPropertyValue('--card').trim() || '#ffffff'

      // Fit the exact section bounds, then apply the shared zoom/pan camera (CSS pixels).
      const { bounds } = preview
      const spanX = Math.max(1, bounds.maxX - bounds.minX)
      const spanY = Math.max(1, bounds.maxY - bounds.minY)
      const fitScale = Math.max(1e-9, Math.min((cssWidth - 2 * PAD) / spanX, (cssHeight - 2 * PAD) / spanY))
      const pivot = { x: cssWidth / 2, y: cssHeight / 2 }
      pivotRef.current = pivot
      const fit = {
        scale: fitScale,
        offsetX: pivot.x - spanX * fitScale / 2,
        offsetY: pivot.y - spanY * fitScale / 2
      }
      const view = applySectionCamera(fit, pivot, cameraRef.current)
      const scale = view.scale * dpr
      const px = (x: number) => (view.offsetX + (x - bounds.minX) * view.scale) * dpr
      const py = (y: number) => (view.offsetY + (bounds.maxY - y) * view.scale) * dpr

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const tracePolygons = (solids: ReadonlyArray<{ outer: readonly Point2[]; holes: ReadonlyArray<readonly Point2[]> }>) => {
        ctx.beginPath()
        for (const solid of solids) for (const ring of [solid.outer, ...solid.holes]) {
          if (ring.length < 2) continue
          ctx.moveTo(px(ring[0].x), py(ring[0].y))
          for (let index = 1; index < ring.length; index++) ctx.lineTo(px(ring[index].x), py(ring[index].y))
          ctx.closePath()
        }
      }
      const fillPolygons = (solids: Parameters<typeof tracePolygons>[0], color: string, alpha: number) => {
        tracePolygons(solids)
        ctx.globalAlpha = alpha
        ctx.fillStyle = color
        ctx.fill('evenodd')
        ctx.globalAlpha = 1
      }

      // Light section, then the exact clipped block filled at constant stress. The block edge is
      // the fill boundary; no separate block-edge line is drawn.
      fillPolygons(section.solids, accent, 0.12)
      fillPolygons(preview.blockGeometry, card, 1)
      fillPolygons(preview.blockGeometry, BLOCK_FILL, 0.42)
      tracePolygons(section.solids)
      ctx.strokeStyle = foreground
      ctx.lineWidth = 1.6 * dpr
      ctx.stroke()

      // Block edge a = beta1*c, drawn only across the concrete (no overhang).
      ctx.strokeStyle = BLOCK_LABEL
      ctx.lineWidth = OVERLAY_LINE_WIDTH * dpr
      for (const [start, end] of sectionLineChords(
        { x: preview.nx * preview.blockOffset, y: preview.ny * preview.blockOffset },
        { x: -preview.ny, y: preview.nx },
        section.solids.flatMap((solid) => [solid.outer, ...solid.holes])
      )) {
        ctx.beginPath()
        ctx.moveTo(px(start.x), py(start.y))
        ctx.lineTo(px(end.x), py(end.y))
        ctx.stroke()
      }

      const label = (text: string, x: number, y: number, color: string, align: CanvasTextAlign) => {
        ctx.font = `600 ${12 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
        ctx.textAlign = align
        ctx.lineJoin = 'round'
        ctx.lineWidth = 4 * dpr
        ctx.strokeStyle = card
        ctx.strokeText(text, x, y)
        ctx.fillStyle = color
        ctx.fillText(text, x, y)
      }

      if (showRebars) {
        // True bar diameter without an outline; sub-pixel bars keep a 1 px dot.
        ctx.fillStyle = foreground
        for (const bar of rebars) {
          ctx.beginPath()
          ctx.arc(px(bar.x), py(bar.y), Math.max(0.5 * dpr, (bar.dia / 2) * scale), 0, 2 * Math.PI)
          ctx.fill()
        }
      }

      // Neutral axis over the section plus a short overhang, in world coordinates (pans and zooms).
      const naSegment = sectionLineSegment(
        { x: preview.nx * preview.neutralAxisOffset, y: preview.ny * preview.neutralAxisOffset },
        { x: -preview.ny, y: preview.nx },
        section.solids.flatMap((solid) => [solid.outer, ...solid.holes])
      )
      if (naSegment) {
        const [start, end] = naSegment
        ctx.beginPath()
        ctx.moveTo(px(start.x), py(start.y))
        ctx.lineTo(px(end.x), py(end.y))
        ctx.strokeStyle = NA_COLOR
        ctx.lineWidth = OVERLAY_LINE_WIDTH * dpr
        ctx.setLineDash(OVERLAY_LINE_DASH.map((value) => value * dpr))
        ctx.stroke()
        ctx.setLineDash([])
        const t = 0.86
        label('N.A.', px(start.x + (end.x - start.x) * t), py(start.y + (end.y - start.y) * t) - 8 * dpr, NA_COLOR, 'end')
      }

      const { origin, nx, ny, arrowLength } = preview
      const x1 = px(origin.x)
      const y1 = py(origin.y)
      const x2 = px(origin.x + nx * arrowLength)
      const y2 = py(origin.y + ny * arrowLength)
      const head = Math.atan2(y2 - y1, x2 - x1)
      ctx.strokeStyle = NORMAL_COLOR
      ctx.fillStyle = NORMAL_COLOR
      ctx.lineWidth = 2 * dpr
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - 9 * dpr * Math.cos(head - 0.42), y2 - 9 * dpr * Math.sin(head - 0.42))
      ctx.lineTo(x2 - 9 * dpr * Math.cos(head + 0.42), y2 - 9 * dpr * Math.sin(head + 0.42))
      ctx.closePath()
      ctx.fill()
      label('θ', x2 + 8 * dpr, y2 - 6 * dpr, NORMAL_COLOR, 'start')

      ctx.beginPath()
      ctx.arc(x1, y1, 4 * dpr, 0, 2 * Math.PI)
      ctx.fillStyle = foreground
      ctx.fill()
      if (preview.blockArea > 0) {
        label('σc = constant', px(preview.blockCentroid.x), py(preview.blockCentroid.y), BLOCK_LABEL, 'center')
      }
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    drawRef.current = schedule
    schedule()
    const resize = new ResizeObserver(schedule)
    resize.observe(host)
    const themeObserver = new MutationObserver(schedule)
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-jscad-theme'] })
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      themeObserver.disconnect()
      drawRef.current = () => undefined
    }
  }, [cameraRef, pivotRef, preview, rebars, section.solids, showRebars])

  if (!ready || !preview) {
    return (
      <section className="pm-results-empty">
        <h2>Apply geometry and reinforcement first</h2>
        <p>The equivalent stress block needs an applied section before it can be displayed.</p>
      </section>
    )
  }

  return (
    <section className="pm-analysis-mesh-stage" aria-label="Equivalent stress block geometry">
      <article className="pm-results-plot pm-analysis-mesh-card">
        <div className="pm-results-plot-title ws-chart-controls">
          <div className="pm-results-plot-heading">
            <span>Equivalent stress block</span>
            <strong>Exact polygon clipping · no integration mesh</strong>
          </div>
          <div className="pm-equivalent-block-controls" role="group" aria-label="Equivalent block preview controls">
            <label title="Compression-block normal direction">
              <span>θ</span>
              <input
                type="range"
                min={0}
                max={355}
                step={5}
                value={angleDeg}
                onChange={(event) => setAngleDeg(Number(event.target.value))}
              />
              <strong className="ws-num">{angleDeg}°</strong>
            </label>
            <label title="Neutral-axis depth divided by projected section depth">
              <span>c/Dθ</span>
              <input
                type="range"
                min={0.1}
                max={1.2}
                step={0.05}
                value={depthRatio}
                onChange={(event) => setDepthRatio(Number(event.target.value))}
              />
              <strong className="ws-num">{fmt(depthRatio, 2)}</strong>
            </label>
            <label className={`ws-check pm-field-check${showRebars ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={showRebars}
                onChange={(event) => setShowRebars(event.target.checked)}
              />
              Rebar
            </label>
          </div>
        </div>
        <div className="pm-results-plot-body">
          <div className="pm-results-plot-canvas pm-equivalent-block-preview">
            <div ref={hostRef} className={`pm-section-field-host${camera.panning ? ' is-panning' : ''}`}>
              <canvas ref={canvasRef} className="pm-section-field-canvas" tabIndex={0}
                aria-label="Exact equivalent rectangular compression block; use the mouse wheel to zoom and drag to pan" />
              <SectionCanvasNav label="Equivalent block navigation" onZoom={(factor) => camera.zoomBy(factor)} onFit={camera.fit} />
            </div>
          </div>
          <div className="pm-section-mesh-quality">
            <span>θ = <span className="ws-num">{angleDeg}</span>°</span>
            <span>c = <span className="ws-num">{qfmt('length', preview.c)}</span> {unit('length')}</span>
            <span>{preview.factor.symbol} = <span className="ws-num">{fmt(preview.factor.value, 3)}</span></span>
            <span>a = <span className="ws-num">{qfmt('length', preview.a)}</span> {unit('length')}</span>
            <span>Dθ = <span className="ws-num">{qfmt('length', preview.projectedDepth)}</span> {unit('length')}</span>
            <span>Ac = <span className="ws-num">{qfmt('area', preview.blockArea, 1)}</span> {unit('area')}</span>
            <strong className="is-ok">Exact block</strong>
          </div>
        </div>
      </article>
    </section>
  )
}
