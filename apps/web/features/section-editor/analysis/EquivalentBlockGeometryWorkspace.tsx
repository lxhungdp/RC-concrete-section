'use client'

import { useId, useMemo, useState } from 'react'
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

type Props = {
  ready: boolean
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
  calculationProfileId: CalculationProfileId
}

const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 620
const PAD = 64

const fmt = (value: number, digits = 2) =>
  Math.abs(value) < 1e-12 ? '0' : value.toLocaleString('en-US', { maximumFractionDigits: digits })

const ringPath = (ring: readonly Point2[], toX: (x: number) => number, toY: (y: number) => number) => {
  if (ring.length === 0) return ''
  return `${ring.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${toX(point.x)} ${toY(point.y)}`).join(' ')} Z`
}

export function EquivalentBlockGeometryWorkspace({
  ready,
  section,
  rebars,
  materialStore,
  designBasis,
  calculationProfileId
}: Props) {
  const clipId = useId().replace(/:/g, '')
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

    const spanX = Math.max(1, prepared.bounds.width)
    const spanY = Math.max(1, prepared.bounds.height)
    const scale = Math.min((VIEW_WIDTH - 2 * PAD) / spanX, (VIEW_HEIGHT - 2 * PAD) / spanY)
    const worldWidth = (VIEW_WIDTH - 2 * PAD) / scale
    const worldHeight = (VIEW_HEIGHT - 2 * PAD) / scale
    const centerX = (prepared.bounds.minX + prepared.bounds.maxX) / 2
    const centerY = (prepared.bounds.minY + prepared.bounds.maxY) / 2
    const worldMinX = centerX - worldWidth / 2
    const worldMaxX = centerX + worldWidth / 2
    const worldMinY = centerY - worldHeight / 2
    const worldMaxY = centerY + worldHeight / 2
    const toX = (x: number) => PAD + (x - worldMinX) * scale
    const toY = (y: number) => PAD + (worldMaxY - y) * scale
    const geometryPath = section.solids.map((solid) =>
      [ringPath(solid.outer, toX, toY), ...solid.holes.map((hole) => ringPath(hole, toX, toY))].join(' ')
    ).join(' ')
    const blockPath = clipped.geometry.map((solid) =>
      [ringPath(solid.outer, toX, toY), ...solid.holes.map((hole) => ringPath(hole, toX, toY))].join(' ')
    ).join(' ')
    const lineAt = (offset: number) => {
      const points: Point2[] = []
      const add = (x: number, y: number) => {
        if (
          x < worldMinX - 1e-8 || x > worldMaxX + 1e-8 ||
          y < worldMinY - 1e-8 || y > worldMaxY + 1e-8 ||
          points.some((point) => Math.hypot(point.x - x, point.y - y) < 1e-7)
        ) return
        points.push({ x, y })
      }
      if (Math.abs(ny) > 1e-12) {
        add(worldMinX, (offset - nx * worldMinX) / ny)
        add(worldMaxX, (offset - nx * worldMaxX) / ny)
      }
      if (Math.abs(nx) > 1e-12) {
        add((offset - ny * worldMinY) / nx, worldMinY)
        add((offset - ny * worldMaxY) / nx, worldMaxY)
      }
      const first = points[0] ?? { x: worldMinX, y: worldMinY }
      const second = points[1] ?? { x: worldMaxX, y: worldMaxY }
      const x1 = toX(first.x)
      const y1 = toY(first.y)
      const x2 = toX(second.x)
      const y2 = toY(second.y)
      return {
        x1,
        y1,
        x2,
        y2,
        labelX: x1 + (x2 - x1) * 0.86,
        labelY: y1 + (y2 - y1) * 0.86
      }
    }
    const arrowLength = Math.min(spanX, spanY) * 0.24
    const arrow = {
      x1: toX(origin.x),
      y1: toY(origin.y),
      x2: toX(origin.x + nx * arrowLength),
      y2: toY(origin.y + ny * arrowLength)
    }

    return {
      origin,
      scale,
      toX,
      toY,
      geometryPath,
      blockPath,
      neutralAxisLine: lineAt(neutralAxisOffset),
      blockLine: lineAt(blockOffset),
      arrow,
      c,
      a,
      factor,
      projectedDepth: extents.depth,
      blockArea: clipped.moments.area,
      blockCentroid: clipped.moments.centroid
    }
  }, [angleDeg, calculationProfileId, depthRatio, designBasis, materialStore, ready, section])

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
        <div className="pm-results-plot-title">
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
              <strong>{angleDeg}°</strong>
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
              <strong>{fmt(depthRatio, 2)}</strong>
            </label>
            <label className={`pm-field-check${showRebars ? ' is-on' : ''}`}>
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
            <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} role="img" aria-label="Exact equivalent rectangular compression block">
              <defs>
                <clipPath id={clipId}>
                  <path d={preview.geometryPath} fillRule="evenodd" clipRule="evenodd" />
                </clipPath>
                <marker id={`${clipId}-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M 0 0 L 8 4 L 0 8 Z" className="pm-equivalent-block-arrow-head" />
                </marker>
              </defs>
              <path className="pm-equivalent-section-fill" d={preview.geometryPath} fillRule="evenodd" />
              <path className="pm-equivalent-block-fill" d={preview.blockPath} fillRule="evenodd" />
              <g clipPath={`url(#${clipId})`}>
                <line
                  className="pm-equivalent-block-boundary"
                  x1={preview.blockLine.x1}
                  y1={preview.blockLine.y1}
                  x2={preview.blockLine.x2}
                  y2={preview.blockLine.y2}
                />
                <line
                  className="pm-equivalent-na-line"
                  x1={preview.neutralAxisLine.x1}
                  y1={preview.neutralAxisLine.y1}
                  x2={preview.neutralAxisLine.x2}
                  y2={preview.neutralAxisLine.y2}
                />
              </g>
              <path className="pm-equivalent-section-outline" d={preview.geometryPath} fillRule="evenodd" />
              {showRebars ? rebars.map((bar) => (
                <circle
                  key={bar.id}
                  className="pm-equivalent-rebar"
                  cx={preview.toX(bar.x)}
                  cy={preview.toY(bar.y)}
                  r={Math.min(18, Math.max(4, bar.dia * 0.5 * preview.scale))}
                />
              )) : null}
              <line
                className="pm-equivalent-normal-arrow"
                {...preview.arrow}
                markerEnd={`url(#${clipId}-arrow)`}
              />
              <circle
                className="pm-equivalent-origin"
                cx={preview.toX(preview.origin.x)}
                cy={preview.toY(preview.origin.y)}
                r={5}
              />
              <text className="pm-equivalent-na-label" x={preview.neutralAxisLine.labelX} y={preview.neutralAxisLine.labelY - 10}>N.A.</text>
              <text className="pm-equivalent-block-label" x={preview.blockLine.labelX} y={preview.blockLine.labelY + 20}>a</text>
              <text className="pm-equivalent-normal-label" x={preview.arrow.x2 + 10} y={preview.arrow.y2 - 8}>θ</text>
              <text
                className="pm-equivalent-stress-label"
                x={preview.toX(preview.blockCentroid.x)}
                y={preview.toY(preview.blockCentroid.y)}
              >σc = constant</text>
            </svg>
          </div>
          <div className="pm-section-mesh-quality">
            <span>θ = {angleDeg}°</span>
            <span>c = {fmt(preview.c)} mm</span>
            <span>{preview.factor.symbol} = {fmt(preview.factor.value, 3)}</span>
            <span>a = {fmt(preview.a)} mm</span>
            <span>Dθ = {fmt(preview.projectedDepth)} mm</span>
            <span>Ac = {fmt(preview.blockArea, 1)} mm²</span>
            <strong className="is-ok">Exact block</strong>
          </div>
        </div>
      </article>
    </section>
  )
}
