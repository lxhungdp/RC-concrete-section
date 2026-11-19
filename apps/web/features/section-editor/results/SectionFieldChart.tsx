'use client'

import { QuantityValue, UnitLabel, useQuantityFormatters } from '../shared/DisplayUnits'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SectionGeometry } from '@pm/geometry'
import { CENTROID_LOAD_REFERENCE, resolveLoadOrigin, type LoadReference } from '@pm/project'
import type { SectionFieldMap, SectionFieldRebar, SectionFieldTriangle } from '@pm/analysis'
import {
  sectionFieldAngleComparison
} from './section-field-angles'
import { sectionFieldViewport } from './section-field-viewport'
import { SectionMomentAxes, SECTION_MOMENT_AXES_PADDING, type SectionAxesFrame } from './SectionMomentAxes'
import { applySectionCamera } from './section-camera'
import { OVERLAY_LINE_DASH, OVERLAY_LINE_WIDTH, sectionLineChords, sectionLineSegment } from './section-overlay-line'
import { SectionCanvasNav, useSectionCanvasCamera } from './SectionCanvasCamera'

type FieldMode = 'strain' | 'stress'

type Props = {
  fieldMap: SectionFieldMap
  section: SectionGeometry
  fieldMode: FieldMode
  /** Strain plane from inverse solution — used for the ε=0 neutral axis. */
  state: { e0: number; kx: number; ky: number }
  /** Demand moments at the section centroid (N·mm). */
  Mx: number
  My: number
  showNeutralAxis: boolean
  showMoments: boolean
  includeRebar: boolean
  loadReference?: LoadReference
  axesReference?: LoadReference
}

type Rgb = [number, number, number]

type ViewTransform = {
  dpr: number
  width: number
  height: number
  worldMinX: number
  worldMaxX: number
  worldMinY: number
  worldMaxY: number
  scale: number
  offsetX: number
  offsetY: number
}

type HoverInfo = {
  xCss: number
  yCss: number
  worldX: number
  worldY: number
  strain: number
  stress: number
  kind: 'concrete' | 'rebar'
  rebar?: SectionFieldRebar
}

const STOPS: Array<{ t: number; rgb: Rgb }> = [
  { t: 0, rgb: [14, 165, 233] },
  { t: 0.35, rgb: [34, 197, 94] },
  { t: 0.7, rgb: [234, 179, 8] },
  { t: 1, rgb: [239, 68, 68] }
]

/** Options CAD block colours (EquivalentBlockGeometryWorkspace): same fill and label hues. */
const BLOCK_FILL = '#f97316'
const BLOCK_LABEL = '#ea580c'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const sampleStops = (stops: Array<{ t: number; rgb: Rgb }>, tRaw: number): Rgb => {
  const t = Math.min(1, Math.max(0, tRaw))
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / Math.max(1e-9, b.t - a.t)
      return [lerp(a.rgb[0], b.rgb[0], u), lerp(a.rgb[1], b.rgb[1], u), lerp(a.rgb[2], b.rgb[2], u)]
    }
  }
  return stops[stops.length - 1].rgb
}

const valueToRgb = (tRaw: number): Rgb => sampleStops(STOPS, tRaw)

const rangeFromValues = (values: number[]) => {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 1e-15) {
    return { min: 0, max: 1 }
  }
  return { min, max }
}

const normInRange = (value: number, range: { min: number; max: number }) =>
  (value - range.min) / Math.max(1e-15, range.max - range.min)

type Ring = Array<{ x: number; y: number }>

const fmt = (value: number, digits = 4) =>
  Math.abs(value) < 1e-12 ? '0' : value.toLocaleString('en-US', { maximumFractionDigits: digits })

const drawArrow = (
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dpr: number,
  color: string
) => {
  const ang = Math.atan2(y1 - y0, x1 - x0)
  const head = 10 * dpr
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2.2 * dpr
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - head * Math.cos(ang - 0.4), y1 - head * Math.sin(ang - 0.4))
  ctx.lineTo(x1 - head * Math.cos(ang + 0.4), y1 - head * Math.sin(ang + 0.4))
  ctx.closePath()
  ctx.fill()
}

const barycentric = (x: number, y: number, tri: SectionFieldTriangle) => {
  const { ax, ay, bx, by, cx, cy } = tri
  const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
  if (Math.abs(denom) < 1e-18) return null
  const w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denom
  const w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denom
  const w2 = 1 - w0 - w1
  if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) return null
  return { w0, w1, w2 }
}

const pointInRing = (x: number, y: number, ring: Array<{ x: number; y: number }>) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (((a.y > y) !== (b.y > y)) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

const pointInBlockGeometry = (
  x: number,
  y: number,
  geometry: NonNullable<SectionFieldMap['equivalentBlock']>['geometry']
) => geometry.some((solid) =>
  pointInRing(x, y, solid.outer) && !solid.holes.some((hole) => pointInRing(x, y, hole))
)

const strainAtWorld = (
  state: Props['state'],
  origin: SectionFieldMap['origin'],
  x: number,
  y: number
) => state.e0 + state.kx * (y - origin.y) + state.ky * (x - origin.x)

const buildTriangleIndex = (triangles: SectionFieldTriangle[], cellSize: number) => {
  const size = Math.max(1e-6, cellSize)
  const buckets = new Map<string, number[]>()
  triangles.forEach((tri, index) => {
    const minX = Math.min(tri.ax, tri.bx, tri.cx)
    const maxX = Math.max(tri.ax, tri.bx, tri.cx)
    const minY = Math.min(tri.ay, tri.by, tri.cy)
    const maxY = Math.max(tri.ay, tri.by, tri.cy)
    const i0 = Math.floor(minX / size)
    const i1 = Math.floor(maxX / size)
    const j0 = Math.floor(minY / size)
    const j1 = Math.floor(maxY / size)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = `${i}:${j}`
        const list = buckets.get(key)
        if (list) list.push(index)
        else buckets.set(key, [index])
      }
    }
  })
  return { size, buckets }
}

/**
 * Stress-strain profiles render their integration mesh. Equivalent-block profiles instead render
 * the analytic strain plane and exact clipped compression polygon: no analysis mesh exists there.
 */
export function SectionFieldChart({
  fieldMap,
  section,
  fieldMode,
  state,
  Mx,
  My,
  showNeutralAxis,
  showMoments,
  includeRebar,
  loadReference = CENTROID_LOAD_REFERENCE,
  axesReference
}: Props) {
  const { displayUnits, qfmt, unit, force } = useQuantityFormatters()

  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewRef = useRef<ViewTransform | null>(null)
  const drawRef = useRef<() => void>(() => undefined)
  const { minX: fitMinX, maxX: fitMaxX, minY: fitMinY, maxY: fitMaxY } = fieldMap.bounds
  const camera = useSectionCanvasCamera(canvasRef, drawRef, `${fitMinX}:${fitMaxX}:${fitMinY}:${fitMaxY}`)
  const { cameraRef, pivotRef } = camera
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [axesFrame, setAxesFrame] = useState<SectionAxesFrame | null>(null)
  const angleComparison = useMemo(
    () => sectionFieldAngleComparison(state, Mx, My),
    [Mx, My, state]
  )

  const fieldRange = useMemo((): { min: number; max: number } | null => {
    const values: number[] = []
    if (fieldMap.equivalentBlock) {
      // Stress view: the block is drawn as a filled region (Options CAD), so the scale covers bars only.
      if (fieldMode !== 'stress') {
        for (const solid of section.solids) {
          for (const ring of [solid.outer, ...solid.holes]) {
            for (const point of ring) {
              values.push(strainAtWorld(state, fieldMap.origin, point.x, point.y))
            }
          }
        }
      }
    } else {
      for (const tri of fieldMap.triangles) {
        if (fieldMode === 'strain') values.push(tri.strainA, tri.strainB, tri.strainC)
        else values.push(tri.stressA, tri.stressB, tri.stressC)
      }
    }
    if (includeRebar) {
      for (const bar of fieldMap.rebars) values.push(fieldMode === 'strain' ? bar.strain : bar.stress)
    }
    return values.length ? rangeFromValues(values) : null
  }, [fieldMap.equivalentBlock, fieldMap.origin, fieldMap.rebars, fieldMap.triangles, fieldMode, includeRebar, section.solids, state])

  const triangleIndex = useMemo(
    () => buildTriangleIndex(fieldMap.triangles, fieldMap.mesh.cellSize || 50),
    [fieldMap.mesh.cellSize, fieldMap.triangles]
  )

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

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

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      const themeStyle = getComputedStyle(host)
      const foreground = themeStyle.getPropertyValue('--foreground').trim() || '#0a0a0a'
      const foregroundMuted = themeStyle.getPropertyValue('--foreground-muted').trim() || '#6b7280'
      const border = themeStyle.getPropertyValue('--border').trim() || '#ededee'
      const accent = themeStyle.getPropertyValue('--accent').trim() || '#2563eb'
      const card = themeStyle.getPropertyValue('--card').trim() || '#ffffff'

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const padL = SECTION_MOMENT_AXES_PADDING.left * dpr
      const padT = SECTION_MOMENT_AXES_PADDING.top * dpr
      const plotW = Math.max(1, width - padL - SECTION_MOMENT_AXES_PADDING.right * dpr)
      const plotH = Math.max(1, height - padT - SECTION_MOMENT_AXES_PADDING.bottom * dpr)
      const { minX, maxX, minY, maxY } = fieldMap.bounds
      const axesOrigin = resolveLoadOrigin(fieldMap.origin, axesReference ?? loadReference)
      const fit = sectionFieldViewport(cssWidth, cssHeight, fieldMap.bounds, axesOrigin, SECTION_MOMENT_AXES_PADDING)
      const pivot = {
        x: SECTION_MOMENT_AXES_PADDING.left + (cssWidth - SECTION_MOMENT_AXES_PADDING.left - SECTION_MOMENT_AXES_PADDING.right) / 2,
        y: SECTION_MOMENT_AXES_PADDING.top + (cssHeight - SECTION_MOMENT_AXES_PADDING.top - SECTION_MOMENT_AXES_PADDING.bottom) / 2
      }
      pivotRef.current = pivot
      const viewport = { ...fit, ...applySectionCamera(fit, pivot, cameraRef.current) }
      const { worldMinX, worldMaxX, worldMinY, worldMaxY } = viewport
      const scale = viewport.scale * dpr
      const offsetX = viewport.offsetX * dpr
      const offsetY = viewport.offsetY * dpr

      viewRef.current = {
        dpr,
        width,
        height,
        worldMinX,
        worldMaxX,
        worldMinY,
        worldMaxY,
        scale,
        offsetX,
        offsetY
      }

      const toPixelX = (x: number) => offsetX + (x - worldMinX) * scale
      const toPixelY = (y: number) => offsetY + (worldMaxY - y) * scale
      const toCssX = (x: number) => toPixelX(x) / dpr
      const toCssY = (y: number) => toPixelY(y) / dpr

      setAxesFrame({
        width: cssWidth, height: cssHeight,
        origin: { x: toCssX(axesOrigin.x), y: toCssY(axesOrigin.y) },
        centroid: { x: toCssX(fieldMap.origin.x), y: toCssY(fieldMap.origin.y) },
        bounds: { left: toCssX(minX), right: toCssX(maxX), top: toCssY(maxY), bottom: toCssY(minY) },
        worldOrigin: axesOrigin
      })

      const range = fieldRange ?? { min: 0, max: 1 }
      const norm = (value: number) => normInRange(value, range)

      const image = ctx.createImageData(width, height)
      const data = image.data

      if (fieldMap.equivalentBlock && fieldMode === 'strain') {
        // Sample the analytic strain plane only for canvas pixels inside the exact section polygon.
        // These pixels are a display raster, not an integration mesh and never enter equilibrium.
        const minPx = Math.max(0, Math.floor(toPixelX(minX)))
        const maxPx = Math.min(width - 1, Math.ceil(toPixelX(maxX)))
        const minPy = Math.max(0, Math.floor(toPixelY(maxY)))
        const maxPy = Math.min(height - 1, Math.ceil(toPixelY(minY)))
        for (let py = minPy; py <= maxPy; py++) {
          const worldY = worldMaxY - (py - offsetY) / scale
          for (let px = minPx; px <= maxPx; px++) {
            const worldX = worldMinX + (px - offsetX) / scale
            if (!pointInBlockGeometry(worldX, worldY, section.solids)) continue
            const [r, g, b] = valueToRgb(norm(strainAtWorld(state, fieldMap.origin, worldX, worldY)))
            const idx = (py * width + px) * 4
            data[idx] = r
            data[idx + 1] = g
            data[idx + 2] = b
            data[idx + 3] = 255
          }
        }
      } else if (!fieldMap.equivalentBlock) {
        for (const tri of fieldMap.triangles) {
          const x0 = toPixelX(tri.ax)
          const y0 = toPixelY(tri.ay)
          const x1 = toPixelX(tri.bx)
          const y1 = toPixelY(tri.by)
          const x2 = toPixelX(tri.cx)
          const y2 = toPixelY(tri.cy)
          const v0 = norm(fieldMode === 'strain' ? tri.strainA : tri.stressA)
          const v1 = norm(fieldMode === 'strain' ? tri.strainB : tri.stressB)
          const v2 = norm(fieldMode === 'strain' ? tri.strainC : tri.stressC)

          const minPx = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
          const maxPx = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)))
          const minPy = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
          const maxPy = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)))

          const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
          if (Math.abs(denom) < 1e-12) continue
          const invDen = 1 / denom

          for (let py = minPy; py <= maxPy; py++) {
            for (let px = minPx; px <= maxPx; px++) {
              const w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) * invDen
              const w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) * invDen
              const w2 = 1 - w0 - w1
              if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue
              const t = w0 * v0 + w1 * v1 + w2 * v2
              const [r, g, b] = valueToRgb(t)
              const idx = (py * width + px) * 4
              data[idx] = r
              data[idx + 1] = g
              data[idx + 2] = b
              data[idx + 3] = 255
            }
          }
        }
      }

      ctx.putImageData(image, 0, 0)

      if (fieldMode === 'stress' && fieldMap.equivalentBlock) {
        const appendRing = (ring: Array<{ x: number; y: number }>) => {
          if (ring.length === 0) return
          ctx.moveTo(toPixelX(ring[0].x), toPixelY(ring[0].y))
          for (let index = 1; index < ring.length; index += 1) {
            ctx.lineTo(toPixelX(ring[index].x), toPixelY(ring[index].y))
          }
          ctx.closePath()
        }
        const fillSolids = (solids: Array<{ outer: Ring; holes: Ring[] }>, color: string, alpha: number) => {
          ctx.beginPath()
          for (const solid of solids) {
            appendRing(solid.outer)
            solid.holes.forEach(appendRing)
          }
          ctx.globalAlpha = alpha
          ctx.fillStyle = color
          ctx.fill('evenodd')
          ctx.globalAlpha = 1
        }
        // Same fills as the Options CAD block view: a light section and the exact block polygon
        // (a = beta1*c) filled at constant stress. No separate block-edge line is drawn.
        fillSolids(section.solids, accent, 0.12)
        fillSolids(fieldMap.equivalentBlock.geometry, card, 1)
        fillSolids(fieldMap.equivalentBlock.geometry, BLOCK_FILL, 0.42)
      }

      for (const solid of section.solids) {
        const rings = [solid.outer, ...solid.holes]
        rings.forEach((ring, ringIndex) => {
          if (ring.length < 2) return
          ctx.beginPath()
          ctx.moveTo(toPixelX(ring[0].x), toPixelY(ring[0].y))
          for (let i = 1; i < ring.length; i++) ctx.lineTo(toPixelX(ring[i].x), toPixelY(ring[i].y))
          ctx.closePath()
          ctx.strokeStyle = ringIndex === 0 ? foreground : foregroundMuted
          ctx.lineWidth = (ringIndex === 0 ? 1.6 : 1) * dpr
          ctx.stroke()
        })
      }

      const block = fieldMap.equivalentBlock
      const gradient = Math.hypot(state.kx, state.ky)
      if (fieldMode === 'stress' && block && gradient >= 1e-16 && block.neutralAxisDepth > block.blockDepth) {
        // Block edge a = beta1*c: parallel to the N.A., (c - a) toward compression, drawn only
        // across the concrete (no overhang). The strain gradient (ky, kx) points to compression.
        const shift = (block.neutralAxisDepth - block.blockDepth) / gradient
        const useX = Math.abs(state.ky) >= Math.abs(state.kx)
        const edgePoint = {
          x: fieldMap.origin.x + (useX ? -state.e0 / state.ky : 0) + state.ky * shift,
          y: fieldMap.origin.y + (useX ? 0 : -state.e0 / state.kx) + state.kx * shift
        }
        ctx.strokeStyle = BLOCK_LABEL
        ctx.lineWidth = OVERLAY_LINE_WIDTH * dpr
        for (const [start, end] of sectionLineChords(edgePoint, { x: -state.kx, y: state.ky },
          section.solids.flatMap((solid) => [solid.outer, ...solid.holes]))) {
          ctx.beginPath()
          ctx.moveTo(toPixelX(start.x), toPixelY(start.y))
          ctx.lineTo(toPixelX(end.x), toPixelY(end.y))
          ctx.stroke()
        }
      }

      if (!fieldMap.equivalentBlock) {
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)'
        ctx.lineWidth = 0.6 * dpr
        for (const tri of fieldMap.triangles) {
          ctx.beginPath()
          ctx.moveTo(toPixelX(tri.ax), toPixelY(tri.ay))
          ctx.lineTo(toPixelX(tri.bx), toPixelY(tri.by))
          ctx.lineTo(toPixelX(tri.cx), toPixelY(tri.cy))
          ctx.closePath()
          ctx.stroke()
        }
      }
      // Bars at true diameter without an outline; sub-pixel bars keep a 1 px dot.
      for (const bar of fieldMap.rebars) {
        const radius = Math.max(0.5 * dpr, (bar.dia / 2) * scale)
        ctx.beginPath()
        ctx.arc(toPixelX(bar.x), toPixelY(bar.y), radius, 0, Math.PI * 2)
        if (includeRebar) {
          const [r, g, b] = valueToRgb(norm(fieldMode === 'strain' ? bar.strain : bar.stress))
          ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
        } else {
          // Geometry-only marker when rebar is excluded from the field scale.
          ctx.fillStyle = foreground
        }
        ctx.fill()
      }

      // Resultant and neutral-axis overlays remain centroidal; the load axes are separate.
      const ox = fieldMap.origin.x
      const oy = fieldMap.origin.y
      // Overlay lines span the section plus a short overhang, in world coordinates (they pan and zoom).
      const sectionRings = section.solids.flatMap((solid) => [solid.outer, ...solid.holes])
      const minSpan = Math.min(maxX - minX, maxY - minY)
      const kappa = Math.hypot(state.kx, state.ky)

      const mMag = Math.hypot(Mx, My)
      if (showMoments && mMag > 1e-9) {
        // The physical section direction is (My,Mx), because Mx=∫σy dA and My=∫σx dA.
        // The (Mx,My) direction belongs to action space and must not be drawn directly on x-y.
        const sectionX = My
        const sectionY = Mx
        const theta = Math.atan2(sectionY, sectionX)
        // Display scale for the in-section resultant; the fixed sign loops belong to the axes.
        const mScale = (0.4 * minSpan) / Math.max(mMag, Math.abs(Mx), Math.abs(My), 1)

        drawArrow(
          ctx,
          toPixelX(ox),
          toPixelY(oy),
          toPixelX(ox + sectionX * mScale),
          toPixelY(oy + sectionY * mScale),
          dpr,
          '#ea580c'
        )
        ctx.fillStyle = '#ea580c'
        ctx.font = `600 ${11 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
        ctx.textAlign = 'left'
        ctx.fillText(
          'Rₘ',
          toPixelX(ox + sectionX * mScale) + 6 * dpr,
          toPixelY(oy + sectionY * mScale) - 4 * dpr
        )

        const perpSeg = sectionLineSegment({ x: ox, y: oy }, { x: -Math.sin(theta), y: Math.cos(theta) }, sectionRings)
        if (perpSeg) {
          ctx.beginPath()
          ctx.moveTo(toPixelX(perpSeg[0].x), toPixelY(perpSeg[0].y))
          ctx.lineTo(toPixelX(perpSeg[1].x), toPixelY(perpSeg[1].y))
          ctx.strokeStyle = '#2563eb'
          ctx.lineWidth = OVERLAY_LINE_WIDTH * dpr
          ctx.setLineDash(OVERLAY_LINE_DASH.map((value) => value * dpr))
          ctx.stroke()
          ctx.setLineDash([])
          // Keep the reference label away from the centroid, where the component arrows meet.
          const labelT = 0.78
          const labelX = toPixelX(lerp(perpSeg[0].x, perpSeg[1].x, labelT))
          const labelY = toPixelY(lerp(perpSeg[0].y, perpSeg[1].y, labelT))
          ctx.fillStyle = '#2563eb'
          ctx.font = `600 ${11 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
          ctx.textAlign = 'left'
          const referenceAngle = angleComparison.perpendicularBendingAxis
          ctx.fillText(
            referenceAngle == null ? '⊥ Rₘ' : `⊥ Rₘ  α⊥=${fmt(referenceAngle, 1)}°`,
            labelX + 6 * dpr,
            labelY + 12 * dpr
          )
          if (angleComparison.difference != null) {
            ctx.fillText(
              `Δα=${fmt(angleComparison.difference, 1)}°`,
              labelX + 6 * dpr,
              labelY + 25 * dpr
            )
          }
        }
      }

      // Draw the actual equilibrium neutral axis last so it remains visible when the two lines
      // are close. Its offset comes from e0; its angular difference from the blue reference is real.
      if (showNeutralAxis && kappa >= 1e-16) {
        const xl = Math.abs(state.ky) >= Math.abs(state.kx) ? -state.e0 / state.ky : 0
        const yl = Math.abs(state.ky) >= Math.abs(state.kx) ? 0 : -state.e0 / state.kx
        const naPoint = { x: fieldMap.origin.x + xl, y: fieldMap.origin.y + yl }
        const naSeg = sectionLineSegment(naPoint, { x: -state.kx, y: state.ky }, sectionRings)
        if (naSeg) {
          ctx.beginPath()
          ctx.moveTo(toPixelX(naSeg[0].x), toPixelY(naSeg[0].y))
          ctx.lineTo(toPixelX(naSeg[1].x), toPixelY(naSeg[1].y))
          ctx.strokeStyle = '#be123c'
          ctx.lineWidth = OVERLAY_LINE_WIDTH * dpr
          ctx.setLineDash(OVERLAY_LINE_DASH.map((value) => value * dpr))
          ctx.stroke()
          ctx.setLineDash([])
          const midX = toPixelX((naSeg[0].x + naSeg[1].x) / 2)
          const midY = toPixelY((naSeg[0].y + naSeg[1].y) / 2)
          ctx.fillStyle = '#be123c'
          ctx.font = `600 ${11 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
          ctx.textAlign = 'left'
          ctx.fillText(
            // β in the detail pane carries the direction; the line label names the line only.
            'N.A. (ε=0)',
            midX + 6 * dpr,
            midY - 6 * dpr
          )
        }
      }

      ctx.fillStyle = foregroundMuted
      ctx.font = `${11 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(`x (${unit('length')})`, padL + plotW / 2, height - 10 * dpr)
      ctx.save()
      ctx.translate(14 * dpr, padT + plotH / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(`y (${unit('length')})`, 0, 0)
      ctx.restore()

      if (fieldMode === 'stress' && fieldMap.equivalentBlock) {
        // Block legend in the lower-right margin, clear of the section labels.
        const text = `σc = ${qfmt('stress', fieldMap.equivalentBlock.compressionStress, 2)} ${unit('stress')}`
        ctx.font = `600 ${11 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
        ctx.textAlign = 'right'
        const textX = width - 8 * dpr
        const textY = height - 10 * dpr
        const swatch = 10 * dpr
        const swatchX = textX - ctx.measureText(text).width - swatch - 5 * dpr
        ctx.fillStyle = card
        ctx.fillRect(swatchX, textY - swatch + 1 * dpr, swatch, swatch)
        ctx.globalAlpha = 0.42
        ctx.fillStyle = BLOCK_FILL
        ctx.fillRect(swatchX, textY - swatch + 1 * dpr, swatch, swatch)
        ctx.globalAlpha = 1
        ctx.fillStyle = BLOCK_LABEL
        ctx.fillText(text, textX, textY)
      }

      if (!fieldRange) return
      const barX = width - 22 * dpr
      const barY = padT + 8 * dpr
      const barH = plotH - 16 * dpr
      const barW = 10 * dpr
      const digits = fieldMode === 'strain' ? 5 : 2
      for (let i = 0; i < barH; i++) {
        const t = 1 - i / Math.max(1, barH - 1)
        const [r, g, b] = valueToRgb(t)
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.fillRect(barX, barY + i, barW, 1.5)
      }
      ctx.strokeStyle = border
      ctx.lineWidth = 1 * dpr
      ctx.strokeRect(barX, barY, barW, barH)
      ctx.fillStyle = foregroundMuted
      ctx.font = `${10 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
      const title = fieldMode === 'strain' ? 'ε' : `${fieldMap.equivalentBlock ? 'σs' : 'σ'} (${unit('stress')})`
      ctx.textAlign = 'center'
      ctx.fillText(title, barX + barW / 2, barY - 4 * dpr)
      ctx.textAlign = 'right'
      ctx.fillText(fieldMode === 'strain' ? fmt(fieldRange.max, digits) : qfmt('stress', fieldRange.max, digits), barX - 4 * dpr, barY + 8 * dpr)
      ctx.fillText(fieldMode === 'strain' ? fmt(fieldRange.min, digits) : qfmt('stress', fieldRange.min, digits), barX - 4 * dpr, barY + barH)
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    drawRef.current = schedule

    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(host)
    const themeObserver = new MutationObserver(schedule)
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-jscad-theme']
    })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      themeObserver.disconnect()
    }
  }, [displayUnits,
    Mx,
    My,
    angleComparison,
    fieldMap,
    fieldMode,
    fieldRange,
    includeRebar,
    loadReference,
    axesReference,
    section.solids,
    showMoments,
    showNeutralAxis,
    state,
    cameraRef,
    pivotRef
  ])

  const resolveHover = (clientX: number, clientY: number): HoverInfo | null => {
    const host = hostRef.current
    const view = viewRef.current
    if (!host || !view) return null

    const rect = host.getBoundingClientRect()
    const xCss = clientX - rect.left
    const yCss = clientY - rect.top
    const px = xCss * view.dpr
    const py = yCss * view.dpr
    const worldX = view.worldMinX + (px - view.offsetX) / view.scale
    const worldY = view.worldMaxY - (py - view.offsetY) / view.scale

    // Prefer nearest rebar within a padded hit radius so steel is easy to inspect.
    let bestBar: SectionFieldRebar | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const bar of fieldMap.rebars) {
      const dist = Math.hypot(worldX - bar.x, worldY - bar.y)
      const hitMm = Math.max(bar.dia / 2, 10)
      if (dist <= hitMm && dist < bestDist) {
        bestDist = dist
        bestBar = bar
      }
    }
    if (bestBar) {
      return {
        xCss,
        yCss,
        worldX: bestBar.x,
        worldY: bestBar.y,
        strain: bestBar.strain,
        stress: bestBar.stress,
        kind: 'rebar',
        rebar: bestBar
      }
    }

    if (fieldMap.equivalentBlock) {
      if (!pointInBlockGeometry(worldX, worldY, section.solids)) return null
      return {
        xCss,
        yCss,
        worldX,
        worldY,
        strain: strainAtWorld(state, fieldMap.origin, worldX, worldY),
        stress: pointInBlockGeometry(worldX, worldY, fieldMap.equivalentBlock.geometry)
          ? fieldMap.equivalentBlock.compressionStress
          : 0,
        kind: 'concrete'
      }
    }

    const i = Math.floor(worldX / triangleIndex.size)
    const j = Math.floor(worldY / triangleIndex.size)
    const candidates = triangleIndex.buckets.get(`${i}:${j}`)
    if (!candidates) return null

    for (const index of candidates) {
      const tri = fieldMap.triangles[index]
      const weights = barycentric(worldX, worldY, tri)
      if (!weights) continue
      const { w0, w1, w2 } = weights
      return {
        xCss,
        yCss,
        worldX,
        worldY,
        strain: w0 * tri.strainA + w1 * tri.strainB + w2 * tri.strainC,
        stress: w0 * tri.stressA + w1 * tri.stressB + w2 * tri.stressC,
        kind: 'concrete'
      }
    }
    return null
  }

  return (
    <div
      ref={hostRef}
      className={`pm-section-field-host${camera.panning ? ' is-panning' : ''}`}
      onPointerMove={(event) => setHover(camera.panning ? null : resolveHover(event.clientX, event.clientY))}
      onPointerLeave={() => setHover(null)}
    >
      <canvas ref={canvasRef} className="pm-section-field-canvas" tabIndex={0}
        aria-label="Section field; use the mouse wheel to zoom and drag to pan" />
      {axesFrame && <SectionMomentAxes frame={axesFrame} />}
      <SectionCanvasNav label="Section field navigation" onZoom={(factor) => camera.zoomBy(factor)} onFit={camera.fit} />
      {hover && !camera.panning && (
        <div
          className="pm-section-field-tooltip"
          style={{
            left: Math.min(hover.xCss + 14, (hostRef.current?.clientWidth ?? 0) - 190),
            top: Math.max(8, hover.yCss - 12)
          }}
        >
          {hover.kind === 'rebar' && hover.rebar ? (
            <>
              <strong>Rebar #{hover.rebar.id}</strong>
              <span>
                Ø{qfmt('barDiameter', hover.rebar.dia, 1)} {unit('barDiameter')} · As {qfmt('area', hover.rebar.area, 1)} {unit('area')}
              </span>
              <span>
                x {qfmt('length', hover.rebar.x, 1)} · y {qfmt('length', hover.rebar.y, 1)} {unit('length')}
              </span>
              <span>ε {fmt(hover.rebar.strain, 6)}</span>
              <span>σ {qfmt('stress', hover.rebar.stress, 2)} {unit('stress')}</span>
              <span className="pm-section-field-tooltip-secondary">
                Fs {qfmt('force', hover.rebar.force, 2)} {unit('force')}
              </span>
            </>
          ) : (
            <>
              <strong>Concrete</strong>
              <span>
                x {qfmt('length', hover.worldX, 1)} {unit('length')} · y {qfmt('length', hover.worldY, 1)} {unit('length')}
              </span>
              <span>ε {fmt(hover.strain, 6)}</span>
              <span>σ {qfmt('stress', hover.stress, 2)} {unit('stress')}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
