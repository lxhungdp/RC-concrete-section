'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SectionGeometry } from '@pm/geometry'
import type { SectionFieldMap, SectionFieldRebar, SectionFieldTriangle } from '@pm/analysis'

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

const fmt = (value: number, digits = 4) =>
  Math.abs(value) < 1e-12 ? '0' : value.toLocaleString('en-US', { maximumFractionDigits: digits })

const normalizeAngleDeg = (degrees: number) => ((degrees % 360) + 360) % 360

/** Orientation of the ε=0 line (tangent direction), degrees CCW from +x. */
export const neutralAxisAngleDeg = (state: { e0: number; kx: number; ky: number }) => {
  const kappa = Math.hypot(state.kx, state.ky)
  if (kappa < 1e-16) return null
  // Line: ky·x + kx·y + e0 = 0 (local). Tangent ⟂ (ky, kx) → (-kx, ky).
  return normalizeAngleDeg((Math.atan2(state.ky, -state.kx) * 180) / Math.PI)
}

export const momentAngleDeg = (Mx: number, My: number) => {
  if (Math.hypot(Mx, My) < 1e-9) return null
  return normalizeAngleDeg((Math.atan2(My, Mx) * 180) / Math.PI)
}

/** Clip infinite line through (px,py) with direction (dx,dy) to an AABB. */
const clipLineToBounds = (
  px: number,
  py: number,
  dx: number,
  dy: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): [{ x: number; y: number }, { x: number; y: number }] | null => {
  const len = Math.hypot(dx, dy)
  if (len < 1e-15) return null
  const ux = dx / len
  const uy = dy / len
  const span = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 2
  let x0 = px - ux * span
  let y0 = py - uy * span
  let x1 = px + ux * span
  let y1 = py + uy * span

  // Liang–Barsky against AABB
  const xmin = bounds.minX
  const xmax = bounds.maxX
  const ymin = bounds.minY
  const ymax = bounds.maxY
  let t0 = 0
  let t1 = 1
  const dxs = x1 - x0
  const dys = y1 - y0
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-15) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  if (
    clip(-dxs, x0 - xmin) &&
    clip(dxs, xmax - x0) &&
    clip(-dys, y0 - ymin) &&
    clip(dys, ymax - y0) &&
    t0 <= t1
  ) {
    return [
      { x: x0 + t0 * dxs, y: y0 + t0 * dys },
      { x: x0 + t1 * dxs, y: y0 + t1 * dys }
    ]
  }
  return null
}

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
 * Rasterizes clipped-cell triangles with barycentric vertex shading so the section field is both
 * mesh-true and visually continuous. Pointer hover reports interpolated ε/σ at the cursor.
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
  includeRebar
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewRef = useRef<ViewTransform | null>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const fieldRange = useMemo(() => {
    const values: number[] = []
    for (const tri of fieldMap.triangles) {
      if (fieldMode === 'strain') values.push(tri.strainA, tri.strainB, tri.strainC)
      else values.push(tri.stressA, tri.stressB, tri.stressC)
    }
    if (includeRebar) {
      for (const bar of fieldMap.rebars) values.push(fieldMode === 'strain' ? bar.strain : bar.stress)
    }
    return rangeFromValues(values)
  }, [fieldMap.rebars, fieldMap.triangles, fieldMode, includeRebar])

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

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const padL = 48 * dpr
      const padR = 58 * dpr
      const padT = 12 * dpr
      const padB = 36 * dpr
      const plotW = Math.max(1, width - padL - padR)
      const plotH = Math.max(1, height - padT - padB)

      const { minX, maxX, minY, maxY } = fieldMap.bounds
      const spanX = Math.max(1e-9, maxX - minX)
      const spanY = Math.max(1e-9, maxY - minY)
      const margin = 0.04
      const worldMinX = minX - spanX * margin
      const worldMaxX = maxX + spanX * margin
      const worldMinY = minY - spanY * margin
      const worldMaxY = maxY + spanY * margin
      const worldW = worldMaxX - worldMinX
      const worldH = worldMaxY - worldMinY
      const scale = Math.min(plotW / worldW, plotH / worldH)
      const offsetX = padL + (plotW - worldW * scale) / 2
      const offsetY = padT + (plotH - worldH * scale) / 2

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

      const norm = (value: number) => normInRange(value, fieldRange)

      const image = ctx.createImageData(width, height)
      const data = image.data
      for (let py = Math.floor(padT); py < Math.floor(padT + plotH); py++) {
        for (let px = Math.floor(padL); px < Math.floor(padL + plotW); px++) {
          const idx = (py * width + px) * 4
          data[idx] = 241
          data[idx + 1] = 245
          data[idx + 2] = 249
          data[idx + 3] = 255
        }
      }

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

      ctx.putImageData(image, 0, 0)

      for (const solid of section.solids) {
        const rings = [solid.outer, ...solid.holes]
        rings.forEach((ring, ringIndex) => {
          if (ring.length < 2) return
          ctx.beginPath()
          ctx.moveTo(toPixelX(ring[0].x), toPixelY(ring[0].y))
          for (let i = 1; i < ring.length; i++) ctx.lineTo(toPixelX(ring[i].x), toPixelY(ring[i].y))
          ctx.closePath()
          ctx.strokeStyle = ringIndex === 0 ? '#111827' : '#64748b'
          ctx.lineWidth = (ringIndex === 0 ? 1.6 : 1) * dpr
          ctx.stroke()
        })
      }

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

      for (const bar of fieldMap.rebars) {
        const radius = Math.max(3 * dpr, (bar.dia / 2) * scale)
        const cx = toPixelX(bar.x)
        const cy = toPixelY(bar.y)
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        if (includeRebar) {
          const t = norm(fieldMode === 'strain' ? bar.strain : bar.stress)
          const [r, g, b] = valueToRgb(t)
          ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
        } else {
          // Geometry-only marker when rebar is excluded from the field scale.
          ctx.fillStyle = 'rgba(15, 23, 42, 0.55)'
        }
        ctx.fill()
        ctx.strokeStyle = '#0f172a'
        ctx.lineWidth = 1.6 * dpr
        ctx.stroke()
      }

      // --- Analysis overlays at the net-concrete centroid ---
      const ox = fieldMap.origin.x
      const oy = fieldMap.origin.y
      const clipBounds = {
        minX: worldMinX,
        maxX: worldMaxX,
        minY: worldMinY,
        maxY: worldMaxY
      }
      const minSpan = Math.min(spanX, spanY)
      const kappa = Math.hypot(state.kx, state.ky)

      if (showNeutralAxis && kappa >= 1e-16) {
        const xl = Math.abs(state.ky) >= Math.abs(state.kx) ? -state.e0 / state.ky : 0
        const yl = Math.abs(state.ky) >= Math.abs(state.kx) ? 0 : -state.e0 / state.kx
        const naPoint = { x: ox + xl, y: oy + yl }
        const naSeg = clipLineToBounds(naPoint.x, naPoint.y, -state.kx, state.ky, clipBounds)
        if (naSeg) {
          ctx.beginPath()
          ctx.moveTo(toPixelX(naSeg[0].x), toPixelY(naSeg[0].y))
          ctx.lineTo(toPixelX(naSeg[1].x), toPixelY(naSeg[1].y))
          ctx.strokeStyle = '#be123c'
          ctx.lineWidth = 2.4 * dpr
          ctx.setLineDash([7 * dpr, 5 * dpr])
          ctx.stroke()
          ctx.setLineDash([])
          const midX = toPixelX((naSeg[0].x + naSeg[1].x) / 2)
          const midY = toPixelY((naSeg[0].y + naSeg[1].y) / 2)
          ctx.fillStyle = '#be123c'
          ctx.font = `600 ${11 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
          ctx.textAlign = 'left'
          ctx.fillText('N.A. (ε=0)', midX + 6 * dpr, midY - 6 * dpr)
        }
      }

      const mMag = Math.hypot(Mx, My)
      if (showMoments && mMag > 1e-9) {
        const theta = Math.atan2(My, Mx)
        // Shared scale so Mux, Muy, and |M| stay proportional.
        const mScale = (0.4 * minSpan) / Math.max(mMag, Math.abs(Mx), Math.abs(My), 1)

        if (Math.abs(Mx) > 1e-9) {
          drawArrow(ctx, toPixelX(ox), toPixelY(oy), toPixelX(ox + Mx * mScale), toPixelY(oy), dpr, '#0d9488')
          ctx.fillStyle = '#0d9488'
          ctx.font = `600 ${10 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
          ctx.textAlign = 'left'
          ctx.fillText('Mux', toPixelX(ox + Mx * mScale) + 5 * dpr, toPixelY(oy) + 4 * dpr)
        }
        if (Math.abs(My) > 1e-9) {
          drawArrow(ctx, toPixelX(ox), toPixelY(oy), toPixelX(ox), toPixelY(oy + My * mScale), dpr, '#7c3aed')
          ctx.fillStyle = '#7c3aed'
          ctx.font = `600 ${10 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
          ctx.textAlign = 'left'
          ctx.fillText('Muy', toPixelX(ox) + 5 * dpr, toPixelY(oy + My * mScale) - 4 * dpr)
        }

        drawArrow(
          ctx,
          toPixelX(ox),
          toPixelY(oy),
          toPixelX(ox + Mx * mScale),
          toPixelY(oy + My * mScale),
          dpr,
          '#ea580c'
        )
        ctx.fillStyle = '#ea580c'
        ctx.font = `600 ${11 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
        ctx.textAlign = 'left'
        ctx.fillText('M', toPixelX(ox + Mx * mScale) + 6 * dpr, toPixelY(oy + My * mScale) - 4 * dpr)

        const perpSeg = clipLineToBounds(ox, oy, -Math.sin(theta), Math.cos(theta), clipBounds)
        if (perpSeg) {
          ctx.beginPath()
          ctx.moveTo(toPixelX(perpSeg[0].x), toPixelY(perpSeg[0].y))
          ctx.lineTo(toPixelX(perpSeg[1].x), toPixelY(perpSeg[1].y))
          ctx.strokeStyle = '#2563eb'
          ctx.lineWidth = 2 * dpr
          ctx.setLineDash([4 * dpr, 4 * dpr])
          ctx.stroke()
          ctx.setLineDash([])
          const midX = toPixelX((perpSeg[0].x + perpSeg[1].x) / 2)
          const midY = toPixelY((perpSeg[0].y + perpSeg[1].y) / 2)
          ctx.fillStyle = '#2563eb'
          ctx.font = `600 ${11 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
          ctx.textAlign = 'left'
          ctx.fillText('⊥M', midX + 6 * dpr, midY + 12 * dpr)
        }
      }

      // Centroid marker
      ctx.beginPath()
      ctx.arc(toPixelX(ox), toPixelY(oy), 3.5 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = '#111827'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.2 * dpr
      ctx.stroke()

      ctx.fillStyle = '#6b7280'
      ctx.font = `${11 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('x (mm)', padL + plotW / 2, height - 10 * dpr)
      ctx.save()
      ctx.translate(14 * dpr, padT + plotH / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText('y (mm)', 0, 0)
      ctx.restore()

      const barX = width - 34 * dpr
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
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 1 * dpr
      ctx.strokeRect(barX, barY, barW, barH)
      ctx.fillStyle = '#6b7280'
      ctx.textAlign = 'left'
      ctx.font = `${10 * dpr}px "IBM Plex Sans", system-ui, sans-serif`
      const title = fieldMode === 'strain' ? 'ε' : 'σ (MPa)'
      ctx.fillText(title, barX - 2 * dpr, barY - 4 * dpr)
      ctx.fillText(fmt(fieldRange.max, digits), barX + barW + 4 * dpr, barY + 8 * dpr)
      ctx.fillText(fmt(fieldRange.min, digits), barX + barW + 4 * dpr, barY + barH)
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }

    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(host)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [Mx, My, fieldMap, fieldMode, fieldRange, includeRebar, section.solids, showMoments, showNeutralAxis, state])

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
      className="pm-section-field-host"
      onPointerMove={(event) => setHover(resolveHover(event.clientX, event.clientY))}
      onPointerLeave={() => setHover(null)}
    >
      <canvas ref={canvasRef} className="pm-section-field-canvas" />
      {hover && (
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
                Ø{fmt(hover.rebar.dia, 1)} mm · As {fmt(hover.rebar.area, 1)} mm²
              </span>
              <span>
                x {fmt(hover.rebar.x, 1)} · y {fmt(hover.rebar.y, 1)} mm
              </span>
              <span>ε {fmt(hover.rebar.strain, 6)}</span>
              <span>σ {fmt(hover.rebar.stress, 2)} MPa</span>
              <span className="pm-section-field-tooltip-secondary">
                Fs {fmt(hover.rebar.force / 1000, 2)} kN
              </span>
            </>
          ) : (
            <>
              <strong>Concrete</strong>
              <span>
                x {fmt(hover.worldX, 1)} mm · y {fmt(hover.worldY, 1)} mm
              </span>
              <span>ε {fmt(hover.strain, 6)}</span>
              <span>σ {fmt(hover.stress, 2)} MPa</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
