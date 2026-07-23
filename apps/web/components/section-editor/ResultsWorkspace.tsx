'use client'

import { useMemo, useState } from 'react'
import { Activity, RotateCw } from 'lucide-react'
import type { LoadCombination } from '@pm/project'
import type { InversePreviewResult, PreviewSurface, PreviewSurfacePoint } from '../../lib/pm-preview-analysis'
import { PlotlyChart, type PlotlyClickPayload } from './PlotlyChart'

type Props = {
  ready: boolean
  surface: PreviewSurface | null
  loadcases: LoadCombination[]
  selectedLoadcaseId: number | null
  inverseResult: InversePreviewResult | null
  fixedP: number
  onFixedPChange: (value: number) => void
  onSelectLoadcase: (id: number) => void
}

const fmt = (value: number, digits = 1) =>
  Math.abs(value) < 1e-9 ? '0' : value.toLocaleString('en-US', { maximumFractionDigits: digits })
const kn = (value: number) => value / 1000
const knm = (value: number) => value / 1_000_000
const deg = (radians: number) => Math.round((radians * 180) / Math.PI)

const plotTheme = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, system-ui, sans-serif', size: 11, color: '#6b7280' },
  margin: { l: 48, r: 18, t: 10, b: 42 }
}

const plotConfig = {
  displaylogo: false,
  responsive: true,
  scrollZoom: true,
  modeBarButtonsToRemove: ['toImage', 'sendDataToCloud']
}

const groupByBeta = (points: PreviewSurfacePoint[]) => {
  const groups = new Map<number, PreviewSurfacePoint[]>()
  for (const point of points) groups.set(point.beta, [...(groups.get(point.beta) ?? []), point])
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([beta, curve]) => ({
      beta,
      curve: curve.sort((a, b) => a.station - b.station)
    }))
}

const closestSurfacePoint = (surface: PreviewSurface, payload: PlotlyClickPayload) => {
  const point = payload.points?.[0]
  if (!point) return null
  const custom = point.customdata
  if (typeof custom === 'string') return surface.points.find((item) => item.id === custom) ?? null
  return null
}

export function ResultsWorkspace({
  ready,
  surface,
  loadcases,
  selectedLoadcaseId,
  inverseResult,
  fixedP,
  onFixedPChange,
  onSelectLoadcase
}: Props) {
  const [sliceAngle, setSliceAngle] = useState(0)
  const [selectedSurfacePoint, setSelectedSurfacePoint] = useState<PreviewSurfacePoint | null>(null)

  const pRange = surface?.bounds.P ?? [0, 0]
  const fixedPKn = kn(fixedP)
  const minPKn = Math.floor(kn(pRange[0]))
  const maxPKn = Math.ceil(kn(pRange[1]))

  const surfaceGrid = useMemo(() => (surface ? groupByBeta(surface.points) : []), [surface])

  const surfaceData = useMemo(() => {
    if (!surface) return []
    const x = surfaceGrid.map((row) => row.curve.map((point) => knm(point.Mx)))
    const y = surfaceGrid.map((row) => row.curve.map((point) => knm(point.My)))
    const z = surfaceGrid.map((row) => row.curve.map((point) => kn(point.P)))
    const customdata = surfaceGrid.map((row) => row.curve.map((point) => point.id))

    return [
      {
        type: 'surface',
        name: 'Design surface preview',
        x,
        y,
        z,
        customdata,
        colorscale: [
          [0, '#0ea5e9'],
          [0.45, '#22c55e'],
          [1, '#f97316']
        ],
        opacity: 0.78,
        contours: {
          x: { show: true, color: '#ffffff', width: 1, highlight: false },
          y: { show: true, color: '#ffffff', width: 1, highlight: false },
          z: { show: true, color: '#111827', width: 1, highlight: false }
        },
        hovertemplate:
          'P=%{z:.1f} kN<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>Surface</extra>'
      },
      {
        type: 'scatter3d',
        name: 'Loadcases',
        mode: 'markers+text',
        x: loadcases.map((item) => knm(item.Mx)),
        y: loadcases.map((item) => knm(item.My)),
        z: loadcases.map((item) => kn(item.P)),
        text: loadcases.map((item) => item.name),
        textposition: 'top center',
        customdata: loadcases.map((item) => item.id),
        marker: {
          size: loadcases.map((item) => (item.id === selectedLoadcaseId ? 7 : 5)),
          color: loadcases.map((item) => (item.id === selectedLoadcaseId ? '#f97316' : '#dc2626')),
          line: { color: '#ffffff', width: 1 }
        },
        hovertemplate:
          '%{text}<br>P=%{z:.1f} kN<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>Demand</extra>'
      }
    ]
  }, [loadcases, selectedLoadcaseId, surface, surfaceGrid])

  const surfaceLayout = useMemo(
    () => ({
      ...plotTheme,
      margin: { l: 0, r: 0, t: 2, b: 0 },
      showlegend: true,
      legend: { orientation: 'h', x: 0, y: 1 },
      scene: {
        xaxis: { title: 'Mx (kN.m)', gridcolor: '#e5e7eb', zerolinecolor: '#94a3b8' },
        yaxis: { title: 'My (kN.m)', gridcolor: '#e5e7eb', zerolinecolor: '#94a3b8' },
        zaxis: { title: 'P (kN)', gridcolor: '#e5e7eb', zerolinecolor: '#94a3b8' },
        aspectmode: 'cube',
        camera: { eye: { x: 1.45, y: 1.35, z: 0.9 } }
      },
      hovermode: 'closest',
      clickmode: 'event+select'
    }),
    []
  )

  const contourData = useMemo(() => {
    if (!surface) return []
    return [
      {
        type: 'scatter',
        name: `P = ${fmt(fixedPKn, 1)} kN`,
        mode: 'lines+markers',
        x: [...surface.contour.map((point) => knm(point.Mx)), surface.contour[0] ? knm(surface.contour[0].Mx) : undefined].filter(
          (value) => value !== undefined
        ),
        y: [...surface.contour.map((point) => knm(point.My)), surface.contour[0] ? knm(surface.contour[0].My) : undefined].filter(
          (value) => value !== undefined
        ),
        line: { color: '#2563eb', width: 2 },
        marker: { size: 5, color: '#0ea5e9' },
        hovertemplate: 'Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>Fixed P</extra>'
      },
      {
        type: 'scatter',
        name: 'Loadcases',
        mode: 'markers+text',
        x: loadcases.map((item) => knm(item.Mx)),
        y: loadcases.map((item) => knm(item.My)),
        text: loadcases.map((item) => item.name),
        textposition: 'top center',
        customdata: loadcases.map((item) => item.id),
        marker: {
          size: loadcases.map((item) => (item.id === selectedLoadcaseId ? 12 : 8)),
          color: loadcases.map((item) => (item.id === selectedLoadcaseId ? '#f97316' : '#dc2626')),
          line: { color: '#ffffff', width: 1 }
        },
        hovertemplate: '%{text}<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>Demand</extra>'
      }
    ]
  }, [fixedPKn, loadcases, selectedLoadcaseId, surface])

  const contourLayout = useMemo(
    () => ({
      ...plotTheme,
      xaxis: { title: 'Mx (kN.m)', zeroline: true, zerolinecolor: '#94a3b8', gridcolor: '#e5e7eb' },
      yaxis: { title: 'My (kN.m)', zeroline: true, zerolinecolor: '#94a3b8', gridcolor: '#e5e7eb', scaleanchor: 'x' },
      hovermode: 'closest',
      clickmode: 'event+select',
      showlegend: false
    }),
    []
  )

  const verticalCurve = useMemo(() => {
    if (!surface) return []
    const target = (sliceAngle * Math.PI) / 180
    const rows = groupByBeta(surface.points)
    return rows.reduce((best, current) => {
      const currentDelta = Math.abs(Math.atan2(Math.sin(current.beta - target), Math.cos(current.beta - target)))
      const bestDelta = Math.abs(Math.atan2(Math.sin(best.beta - target), Math.cos(best.beta - target)))
      return currentDelta < bestDelta ? current : best
    }, rows[0] ?? { beta: 0, curve: [] }).curve
  }, [sliceAngle, surface])

  const verticalData = useMemo(
    () => [
      {
        type: 'scatter',
        name: `Angle ${sliceAngle} deg`,
        mode: 'lines+markers',
        x: verticalCurve.map((point) => knm(Math.hypot(point.Mx, point.My))),
        y: verticalCurve.map((point) => kn(point.P)),
        customdata: verticalCurve.map((point) => point.id),
        line: { color: '#16a34a', width: 2 },
        marker: { size: 5, color: '#22c55e' },
        hovertemplate: 'M=%{x:.1f} kN.m<br>P=%{y:.1f} kN<extra>Vertical slice</extra>'
      }
    ],
    [sliceAngle, verticalCurve]
  )

  const verticalLayout = useMemo(
    () => ({
      ...plotTheme,
      xaxis: { title: 'M resultant (kN.m)', zeroline: true, zerolinecolor: '#94a3b8', gridcolor: '#e5e7eb' },
      yaxis: { title: 'P (kN)', zeroline: true, zerolinecolor: '#94a3b8', gridcolor: '#e5e7eb' },
      hovermode: 'closest',
      clickmode: 'event+select',
      showlegend: false
    }),
    []
  )

  const handlePlotClick = (event: PlotlyClickPayload) => {
    const point = event.points?.[0]
    if (!point) return
    if (point.curveNumber === 1 && typeof point.customdata === 'number') {
      onSelectLoadcase(point.customdata)
      return
    }
    if (surface) {
      const surfacePoint = closestSurfacePoint(surface, event)
      if (surfacePoint) setSelectedSurfacePoint(surfacePoint)
    }
  }

  const handle2dClick = (event: PlotlyClickPayload) => {
    const point = event.points?.[0]
    if (typeof point?.customdata === 'number') onSelectLoadcase(point.customdata)
  }

  if (!ready) {
    return (
      <section className="pm-results-empty">
        <Activity size={28} />
        <h2>Apply geometry and reinforcement first</h2>
        <p>Results need an applied section, materials, and at least one usable integration model.</p>
      </section>
    )
  }

  return (
    <section className="pm-results-stage">
      <div className="pm-results-topbar">
        <div>
          <h2>Preview Results</h2>
          <p>Interactive Plotly charts: rotate/zoom/pan, hover values, and click loadcases.</p>
        </div>
        <div className="pm-results-control-strip">
          <label className="pm-slider-field">
            <span>Fixed P</span>
            <input
              type="range"
              min={minPKn}
              max={maxPKn}
              step={Math.max(1, Math.round((maxPKn - minPKn) / 240))}
              value={Math.min(maxPKn, Math.max(minPKn, fixedPKn))}
              onChange={(event) => onFixedPChange(Number(event.target.value) * 1000)}
            />
            <strong>{fmt(fixedPKn, 1)} kN</strong>
          </label>
          <label className="pm-slider-field">
            <span>Angle</span>
            <input
              type="range"
              min={0}
              max={345}
              step={15}
              value={sliceAngle}
              onChange={(event) => setSliceAngle(Number(event.target.value) || 0)}
            />
            <strong>{sliceAngle} deg</strong>
          </label>
        </div>
      </div>

      <div className="pm-results-grid">
        <article className="pm-results-plot pm-results-plot--wide">
          <div className="pm-results-plot-title">
            <span>3D P-Mx-My Surface</span>
            <strong>{surface?.points.length ?? 0} pts</strong>
          </div>
          <PlotlyChart data={surfaceData} layout={surfaceLayout} config={plotConfig} onClick={handlePlotClick} />
        </article>

        <article className="pm-results-plot">
          <div className="pm-results-plot-title">
            <span>Fixed-P Mx-My</span>
            <strong>{fmt(fixedPKn, 1)} kN</strong>
          </div>
          <PlotlyChart data={contourData} layout={contourLayout} config={plotConfig} onClick={handle2dClick} />
        </article>

        <article className="pm-results-plot">
          <div className="pm-results-plot-title">
            <span>Vertical Slice</span>
            <label className="pm-slice-control">
              <RotateCw size={13} />
              <input
                type="number"
                min={0}
                max={345}
                step={15}
                value={sliceAngle}
                onChange={(event) => setSliceAngle(Number(event.target.value) || 0)}
              />
            </label>
          </div>
          <PlotlyChart data={verticalData} layout={verticalLayout} config={plotConfig} />
        </article>
      </div>

      <div className="pm-results-bottom">
        <div className="pm-inverse-detail">
          <h3>Inverse Detail</h3>
          {!selectedLoadcaseId && <p>Select a loadcase to run inverse preview.</p>}
          {selectedLoadcaseId && !inverseResult && <p>Click registered; inverse preview is calculating.</p>}
          {inverseResult && (
            <div className="pm-inverse-grid">
              <span>Status</span>
              <strong>{inverseResult.ok ? 'Converged' : 'Preview only'}</strong>
              <span>Utilization</span>
              <strong>{inverseResult.utilization == null ? 'n/a' : fmt(inverseResult.utilization, 3)}</strong>
              <span>Iterations</span>
              <strong>{inverseResult.iterations}</strong>
              <span>Residual</span>
              <strong>{fmt(inverseResult.residualNorm, 6)}</strong>
              <span>e0</span>
              <strong>{fmt(inverseResult.state.e0, 6)}</strong>
              <span>kx</span>
              <strong>{fmt(inverseResult.state.kx, 9)}</strong>
              <span>ky</span>
              <strong>{fmt(inverseResult.state.ky, 9)}</strong>
              <span>Response</span>
              <strong>
                {fmt(kn(inverseResult.response.P), 1)} kN, {fmt(knm(inverseResult.response.Mx), 1)}, {fmt(knm(inverseResult.response.My), 1)} kN.m
              </strong>
            </div>
          )}
          {selectedSurfacePoint && (
            <div className="pm-surface-point-detail">
              <span>Surface pick</span>
              <strong>
                beta {deg(selectedSurfacePoint.beta)} deg, station {selectedSurfacePoint.station}: P {fmt(kn(selectedSurfacePoint.P), 1)} kN, Mx{' '}
                {fmt(knm(selectedSurfacePoint.Mx), 1)}, My {fmt(knm(selectedSurfacePoint.My), 1)} kN.m
              </strong>
            </div>
          )}
        </div>
      </div>

      {surface && (
        <div className="pm-results-notes">
          {surface.comparison.notes.map((note) => (
            <span key={note}>{note}</span>
          ))}
          {surface.warnings.map((warning) => (
            <strong key={warning}>{warning}</strong>
          ))}
        </div>
      )}
    </section>
  )
}
