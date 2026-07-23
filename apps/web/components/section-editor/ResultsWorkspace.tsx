'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Eye, EyeOff, Maximize2, RotateCw } from 'lucide-react'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { LoadCombination } from '@pm/project'
import {
  buildSectionFieldMap,
  sliceFixedP,
  type InversePreviewResult,
  type PreviewSurface,
  type PreviewSurfacePoint
} from '../../lib/pm-preview-analysis'
import { PlotlyChart, type PlotlyClickPayload } from './PlotlyChart'

type ResultsViewMode = 'overview' | 'loadcase'
type OverviewChartId = 'vertical' | 'surface3d' | 'fixedP'
type LoadcaseChartId = 'heatmap' | 'fixedP' | 'vertical'
type FieldMode = 'strain' | 'stress'

type Props = {
  ready: boolean
  viewMode: ResultsViewMode
  surface: PreviewSurface | null
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
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

  const plotTheme = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  autosize: true,
  font: { family: 'IBM Plex Sans, system-ui, sans-serif', size: 11, color: '#6b7280' },
  margin: { l: 48, r: 18, t: 10, b: 42 }
}

const plotConfig = {
  displaylogo: false,
  responsive: true,
  scrollZoom: true,
  modeBarButtonsToRemove: ['toImage', 'sendDataToCloud']
}

const fieldColorscale: Array<[number, string]> = [
  [0, '#0ea5e9'],
  [0.35, '#22c55e'],
  [0.7, '#eab308'],
  [1, '#ef4444']
]

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

const normalizeAngleDeg = (degrees: number) => {
  const wrapped = ((degrees % 360) + 360) % 360
  return wrapped
}

const loadcaseAngleDeg = (loadcase: LoadCombination) =>
  normalizeAngleDeg((Math.atan2(loadcase.My, loadcase.Mx) * 180) / Math.PI)

const SyncedControl = ({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  disabled?: boolean
  onChange: (value: number) => void
}) => (
  <label className={`pm-synced-control${disabled ? ' is-locked' : ''}`}>
    <span>{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={Math.min(max, Math.max(min, value))}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    />
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
    />
    <em>{unit}</em>
  </label>
)

export function ResultsWorkspace({
  ready,
  viewMode,
  surface,
  section,
  rebars,
  materialStore,
  loadcases,
  selectedLoadcaseId,
  inverseResult,
  fixedP,
  onFixedPChange,
  onSelectLoadcase
}: Props) {
  const [sliceAngle, setSliceAngle] = useState(0)
  const [fieldMode, setFieldMode] = useState<FieldMode>('strain')
  const [overviewPrimary, setOverviewPrimary] = useState<OverviewChartId>('vertical')
  const [overviewVisible, setOverviewVisible] = useState<Record<OverviewChartId, boolean>>({
    vertical: true,
    surface3d: true,
    fixedP: true
  })
  const [loadcasePrimary, setLoadcasePrimary] = useState<LoadcaseChartId>('heatmap')
  const [loadcaseVisible, setLoadcaseVisible] = useState<Record<LoadcaseChartId, boolean>>({
    heatmap: true,
    fixedP: true,
    vertical: true
  })

  const selectedLoadcase = loadcases.find((item) => item.id === selectedLoadcaseId) ?? null
  const isLoadcaseMode = viewMode === 'loadcase' && selectedLoadcase != null

  const activeFixedP = isLoadcaseMode ? selectedLoadcase.P : fixedP
  const activeAngle = isLoadcaseMode ? loadcaseAngleDeg(selectedLoadcase) : sliceAngle

  const pRange = surface?.bounds.P ?? [0, 0]
  const minPKn = Math.floor(kn(pRange[0]))
  const maxPKn = Math.ceil(kn(pRange[1]))
  const activeFixedPKn = kn(activeFixedP)

  const contour = useMemo(
    () => (surface ? sliceFixedP(surface.points, activeFixedP) : []),
    [activeFixedP, surface]
  )

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
        name: 'Design surface',
        x,
        y,
        z,
        customdata,
        colorscale: fieldColorscale,
        opacity: 0.78,
        colorbar: {
          title: 'P (kN)',
          thickness: 15,
          len: 0.72,
          x: 1.02,
          xpad: 4,
          tickfont: { size: 10 }
        },
        hovertemplate: 'P=%{z:.1f} kN<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>Surface</extra>'
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
        hovertemplate: '%{text}<br>P=%{z:.1f} kN<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>Demand</extra>'
      }
    ]
  }, [loadcases, selectedLoadcaseId, surface, surfaceGrid])

  const surfaceLayout = useMemo(
    () => ({
      ...plotTheme,
      margin: { l: 0, r: 28, t: 2, b: 0 },
      showlegend: false,
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
    const closedX = [...contour.map((point) => knm(point.Mx))]
    const closedY = [...contour.map((point) => knm(point.My))]
    if (contour[0]) {
      closedX.push(knm(contour[0].Mx))
      closedY.push(knm(contour[0].My))
    }

    const demandTrace =
      isLoadcaseMode && selectedLoadcase
        ? [
            {
              type: 'scatter',
              name: selectedLoadcase.name,
              mode: 'markers+text',
              x: [knm(selectedLoadcase.Mx)],
              y: [knm(selectedLoadcase.My)],
              text: [selectedLoadcase.name],
              textposition: 'top center',
              marker: { size: 12, color: '#f97316', line: { color: '#ffffff', width: 1 } },
              hovertemplate: '%{text}<br>Mx=%{x:.1f}<br>My=%{y:.1f}<extra>Demand</extra>'
            }
          ]
        : [
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
              hovertemplate: '%{text}<br>Mx=%{x:.1f}<br>My=%{y:.1f}<extra>Demand</extra>'
            }
          ]

    return [
      {
        type: 'scatter',
        name: `P = ${fmt(activeFixedPKn, 1)} kN`,
        mode: 'lines+markers',
        x: closedX,
        y: closedY,
        line: { color: '#2563eb', width: 2.25, shape: 'spline', smoothing: 1.05 },
        marker: { size: 5, color: '#0ea5e9' },
        hovertemplate: 'Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>Fixed P</extra>'
      },
      ...demandTrace
    ]
  }, [activeFixedPKn, contour, isLoadcaseMode, loadcases, selectedLoadcase, selectedLoadcaseId])

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
    if (!surface || surface.points.length === 0) return []
    const target = (normalizeAngleDeg(activeAngle) * Math.PI) / 180
    const rows = groupByBeta(surface.points)
    if (rows.length === 0) return []
    let best = rows[0]
    for (let i = 1; i < rows.length; i++) {
      const current = rows[i]
      if (Math.abs(current.beta - target) < Math.abs(best.beta - target)) best = current
    }
    return best.curve
  }, [activeAngle, surface])

  const verticalData = useMemo(() => {
    const curve = {
      type: 'scatter',
      name: `Angle ${fmt(activeAngle, 0)} deg`,
      mode: 'lines+markers',
      x: verticalCurve.map((point) => knm(Math.hypot(point.Mx, point.My))),
      y: verticalCurve.map((point) => kn(point.P)),
      line: { color: '#7c3aed', width: 2.25, shape: 'spline', smoothing: 1.05 },
      marker: { size: 5, color: '#a855f7' },
      hovertemplate: 'M=%{x:.1f} kN.m<br>P=%{y:.1f} kN<extra>Vertical slice</extra>'
    }

    if (!isLoadcaseMode || !selectedLoadcase) return [curve]

    const demandM = knm(Math.hypot(selectedLoadcase.Mx, selectedLoadcase.My))
    return [
      curve,
      {
        type: 'scatter',
        name: selectedLoadcase.name,
        mode: 'markers+text',
        x: [demandM],
        y: [kn(selectedLoadcase.P)],
        text: [selectedLoadcase.name],
        textposition: 'top center',
        marker: { size: 11, color: '#f97316', line: { color: '#ffffff', width: 1 } },
        hovertemplate: '%{text}<br>M=%{x:.1f}<br>P=%{y:.1f}<extra>Demand</extra>'
      },
      {
        type: 'scatter',
        name: 'Ray',
        mode: 'lines',
        x: [0, demandM * 1.15],
        y: [kn(selectedLoadcase.P), kn(selectedLoadcase.P)],
        line: { color: '#fb923c', width: 1, dash: 'dot' },
        hoverinfo: 'skip'
      }
    ]
  }, [activeAngle, isLoadcaseMode, selectedLoadcase, verticalCurve])

  const verticalLayout = useMemo(
    () => ({
      ...plotTheme,
      xaxis: { title: 'M (kN.m)', zeroline: true, zerolinecolor: '#94a3b8', gridcolor: '#e5e7eb' },
      yaxis: { title: 'P (kN)', zeroline: true, zerolinecolor: '#94a3b8', gridcolor: '#e5e7eb' },
      hovermode: 'closest',
      showlegend: false
    }),
    []
  )

  const fieldMap = useMemo(() => {
    if (!isLoadcaseMode || !inverseResult) return null
    return buildSectionFieldMap(section, rebars, materialStore, inverseResult.state)
  }, [inverseResult, isLoadcaseMode, materialStore, rebars, section])

  const heatmapData = useMemo(() => {
    if (!fieldMap) return []
    const concrete = fieldMap.samples.filter((sample) => sample.kind === 'concrete')
    const steel = fieldMap.samples.filter((sample) => sample.kind === 'rebar')
    const values = concrete.map((sample) => (fieldMode === 'strain' ? sample.strain : sample.stress))
    const outlineTraces = section.solids.flatMap((solid, solidIndex) => {
      const rings = [solid.outer, ...solid.holes]
      return rings.map((ring, ringIndex) => ({
        type: 'scatter',
        name: ringIndex === 0 ? `Outer ${solidIndex + 1}` : `Hole ${solidIndex + 1}.${ringIndex}`,
        mode: 'lines',
        x: [...ring.map((point) => point.x), ring[0]?.x],
        y: [...ring.map((point) => point.y), ring[0]?.y],
        line: { color: ringIndex === 0 ? '#111827' : '#64748b', width: ringIndex === 0 ? 1.6 : 1 },
        hoverinfo: 'skip',
        showlegend: false
      }))
    })

    return [
      {
        type: 'scatter',
        name: fieldMode === 'strain' ? 'Strain' : 'Stress',
        mode: 'markers',
        x: concrete.map((sample) => sample.x),
        y: concrete.map((sample) => sample.y),
        marker: {
          size: concrete.map((sample) => Math.max(4, Math.min(14, Math.sqrt(sample.area) * 0.35))),
          color: values,
          colorscale: fieldColorscale,
          colorbar: {
            title: fieldMode === 'strain' ? 'ε' : 'σ (MPa)',
            thickness: 12,
            len: 0.7
          },
          line: { width: 0 }
        },
        customdata: values,
        hovertemplate:
          fieldMode === 'strain'
            ? 'x=%{x:.1f}<br>y=%{y:.1f}<br>ε=%{customdata:.6f}<extra>Concrete</extra>'
            : 'x=%{x:.1f}<br>y=%{y:.1f}<br>σ=%{customdata:.2f} MPa<extra>Concrete</extra>'
      },
      {
        type: 'scatter',
        name: 'Rebar',
        mode: 'markers',
        x: steel.map((sample) => sample.x),
        y: steel.map((sample) => sample.y),
        marker: {
          size: 8,
          color: steel.map((sample) => (fieldMode === 'strain' ? sample.strain : sample.stress)),
          colorscale: fieldColorscale,
          symbol: 'circle-open',
          line: { width: 2, color: '#111827' }
        },
        hovertemplate: 'x=%{x:.1f}<br>y=%{y:.1f}<extra>Rebar</extra>'
      },
      ...outlineTraces
    ]
  }, [fieldMap, fieldMode, section.solids])

  const heatmapLayout = useMemo(
    () => ({
      ...plotTheme,
      margin: { l: 48, r: 70, t: 10, b: 42 },
      xaxis: { title: 'x (mm)', zeroline: true, zerolinecolor: '#94a3b8', gridcolor: '#e5e7eb', scaleanchor: 'y' },
      yaxis: { title: 'y (mm)', zeroline: true, zerolinecolor: '#94a3b8', gridcolor: '#e5e7eb' },
      hovermode: 'closest',
      showlegend: false
    }),
    []
  )

  const handle2dClick = (event: PlotlyClickPayload) => {
    if (isLoadcaseMode) return
    const point = event.points?.[0]
    if (typeof point?.customdata === 'number') onSelectLoadcase(point.customdata)
  }

  const handle3dClick = (event: PlotlyClickPayload) => {
    if (isLoadcaseMode) return
    const point = event.points?.[0]
    if (typeof point?.customdata === 'number') onSelectLoadcase(point.customdata)
  }

  const toggleOverviewVisible = (id: OverviewChartId) => {
    setOverviewVisible((current) => {
      const next = { ...current, [id]: !current[id] }
      const visibleCount = Object.values(next).filter(Boolean).length
      if (visibleCount === 0) return current
      if (!next[overviewPrimary]) {
        const fallback = (Object.keys(next) as OverviewChartId[]).find((key) => next[key])
        if (fallback) setOverviewPrimary(fallback)
      }
      return next
    })
  }

  const toggleLoadcaseVisible = (id: LoadcaseChartId) => {
    setLoadcaseVisible((current) => {
      const next = { ...current, [id]: !current[id] }
      const visibleCount = Object.values(next).filter(Boolean).length
      if (visibleCount === 0) return current
      if (!next[loadcasePrimary]) {
        const fallback = (Object.keys(next) as LoadcaseChartId[]).find((key) => next[key])
        if (fallback) setLoadcasePrimary(fallback)
      }
      return next
    })
  }

  if (!ready) {
    return (
      <section className="pm-results-empty">
        <RotateCw size={28} />
        <h2>Apply geometry and reinforcement first</h2>
        <p>Results need an applied section before charts and loadcase checks can run.</p>
      </section>
    )
  }

  const renderChartShell = ({
    id,
    title,
    meta,
    primary,
    visible,
    onMakePrimary,
    onToggleVisible,
    controls,
    footer,
    children
  }: {
    id: string
    title: string
    meta?: string
    primary: boolean
    visible: boolean
    onMakePrimary: () => void
    onToggleVisible: () => void
    controls?: ReactNode
    footer?: ReactNode
    children: ReactNode
  }) => {
    if (!visible) return null
    return (
      <article className={`pm-results-plot${primary ? ' is-primary' : ''}`} data-chart={id}>
        <div className="pm-results-plot-title">
          <div className="pm-results-plot-heading">
            <span>{title}</span>
            {meta ? <strong>{meta}</strong> : null}
          </div>
          <div className="pm-results-plot-actions">
            {controls}
            <button
              type="button"
              className={`pm-chart-tool${primary ? ' is-active' : ''}`}
              title="Make this the large chart"
              onClick={onMakePrimary}
            >
              <Maximize2 size={14} />
            </button>
            <button type="button" className="pm-chart-tool" title="Hide chart" onClick={onToggleVisible}>
              <EyeOff size={14} />
            </button>
          </div>
        </div>
        <div className="pm-results-plot-body">
          <div className="pm-results-plot-canvas">{children}</div>
          {footer}
        </div>
      </article>
    )
  }

  const hiddenOverview = (Object.keys(overviewVisible) as OverviewChartId[]).filter((id) => !overviewVisible[id])
  const hiddenLoadcase = (Object.keys(loadcaseVisible) as LoadcaseChartId[]).filter((id) => !loadcaseVisible[id])

  const overviewRestoreLabel = (id: OverviewChartId) =>
    id === 'vertical' ? 'Vertical' : id === 'surface3d' ? '3D' : 'Fixed-P'
  const loadcaseRestoreLabel = (id: LoadcaseChartId) =>
    id === 'heatmap' ? 'Section field' : id === 'fixedP' ? 'Fixed-P' : 'Vertical'

  const renderRestoreBar = (buttons: Array<{ id: string; label: string; onClick: () => void }>) => {
    if (buttons.length === 0) return null
    return (
      <div className="pm-chart-restore-bar" role="toolbar" aria-label="Show hidden charts">
        {buttons.map((button) => (
          <button key={button.id} type="button" className="pm-chart-restore" onClick={button.onClick}>
            <Eye size={13} />
            Show {button.label}
          </button>
        ))}
      </div>
    )
  }

  if (isLoadcaseMode && selectedLoadcase) {
    return (
      <section className="pm-results-stage pm-results-stage--charts-only">
        <div className="pm-results-toolbar">
          <div className="pm-results-toolbar-meta">
            <strong>{selectedLoadcase.name}</strong>
            <span>
              Pu {fmt(kn(selectedLoadcase.P), 1)} kN · Mux {fmt(knm(selectedLoadcase.Mx), 1)} · Muy{' '}
              {fmt(knm(selectedLoadcase.My), 1)} kN·m
            </span>
          </div>
        </div>

        {renderRestoreBar(
          hiddenLoadcase.map((id) => ({
            id,
            label: loadcaseRestoreLabel(id),
            onClick: () => toggleLoadcaseVisible(id)
          }))
        )}

        <div
          className={`pm-results-grid pm-results-grid--dynamic primary-${loadcasePrimary} count-${
            Object.values(loadcaseVisible).filter(Boolean).length
          }`}
        >
          {renderChartShell({
            id: 'heatmap',
            title: 'Section field',
            meta: inverseResult ? (inverseResult.ok ? 'Converged' : 'Approx') : 'Solving…',
            primary: loadcasePrimary === 'heatmap',
            visible: loadcaseVisible.heatmap,
            onMakePrimary: () => setLoadcasePrimary('heatmap'),
            onToggleVisible: () => toggleLoadcaseVisible('heatmap'),
            controls: (
              <div className="pm-field-mode-toggle" role="group" aria-label="Field mode">
                <button
                  type="button"
                  className={fieldMode === 'strain' ? 'is-active' : ''}
                  onClick={() => setFieldMode('strain')}
                >
                  Strain
                </button>
                <button
                  type="button"
                  className={fieldMode === 'stress' ? 'is-active' : ''}
                  onClick={() => setFieldMode('stress')}
                >
                  Stress
                </button>
              </div>
            ),
            footer: inverseResult ? (
              <div className="pm-strain-state-bar">
                <span>e0</span>
                <strong>{fmt(inverseResult.state.e0, 6)}</strong>
                <span>kx</span>
                <strong>{fmt(inverseResult.state.kx, 9)}</strong>
                <span>ky</span>
                <strong>{fmt(inverseResult.state.ky, 9)}</strong>
                <span>η</span>
                <strong>
                  {inverseResult.utilization == null ? 'n/a' : fmt(inverseResult.utilization, 3)}
                </strong>
              </div>
            ) : null,
            children: inverseResult ? (
              <PlotlyChart data={heatmapData} layout={heatmapLayout} config={plotConfig} />
            ) : (
              <div className="pm-results-plot-placeholder">Inverse solution is calculating…</div>
            )
          })}

          {renderChartShell({
            id: 'fixedP',
            title: 'Fixed-P Mx-My',
            meta: `${fmt(activeFixedPKn, 1)} kN`,
            primary: loadcasePrimary === 'fixedP',
            visible: loadcaseVisible.fixedP,
            onMakePrimary: () => setLoadcasePrimary('fixedP'),
            onToggleVisible: () => toggleLoadcaseVisible('fixedP'),
            controls: (
              <SyncedControl
                label="P"
                value={Number(activeFixedPKn.toFixed(1))}
                min={minPKn}
                max={maxPKn}
                step={Math.max(1, Math.round((maxPKn - minPKn) / 240))}
                unit="kN"
                disabled
                onChange={() => undefined}
              />
            ),
            children: <PlotlyChart data={contourData} layout={contourLayout} config={plotConfig} />
          })}

          {renderChartShell({
            id: 'vertical',
            title: 'Vertical slice',
            meta: `${fmt(activeAngle, 0)}°`,
            primary: loadcasePrimary === 'vertical',
            visible: loadcaseVisible.vertical,
            onMakePrimary: () => setLoadcasePrimary('vertical'),
            onToggleVisible: () => toggleLoadcaseVisible('vertical'),
            controls: (
              <SyncedControl
                label="Angle"
                value={Number(activeAngle.toFixed(0))}
                min={0}
                max={360}
                step={1}
                unit="deg"
                disabled
                onChange={() => undefined}
              />
            ),
            children: <PlotlyChart data={verticalData} layout={verticalLayout} config={plotConfig} />
          })}
        </div>
      </section>
    )
  }

  return (
    <section className="pm-results-stage pm-results-stage--charts-only">
      {renderRestoreBar(
        hiddenOverview.map((id) => ({
          id,
          label: overviewRestoreLabel(id),
          onClick: () => toggleOverviewVisible(id)
        }))
      )}

      <div
        className={`pm-results-grid pm-results-grid--dynamic primary-${overviewPrimary} count-${
          Object.values(overviewVisible).filter(Boolean).length
        }`}
      >
        {renderChartShell({
          id: 'vertical',
          title: 'Vertical slice',
          meta: `${fmt(sliceAngle, 0)}°`,
          primary: overviewPrimary === 'vertical',
          visible: overviewVisible.vertical,
          onMakePrimary: () => setOverviewPrimary('vertical'),
          onToggleVisible: () => toggleOverviewVisible('vertical'),
          controls: (
            <SyncedControl
              label="Angle"
              value={sliceAngle}
              min={0}
              max={345}
              step={15}
              unit="deg"
              onChange={setSliceAngle}
            />
          ),
          children: <PlotlyChart data={verticalData} layout={verticalLayout} config={plotConfig} />
        })}

        {renderChartShell({
          id: 'surface3d',
          title: '3D P-Mx-My',
          meta: `${surface?.points.length ?? 0} pts`,
          primary: overviewPrimary === 'surface3d',
          visible: overviewVisible.surface3d,
          onMakePrimary: () => setOverviewPrimary('surface3d'),
          onToggleVisible: () => toggleOverviewVisible('surface3d'),
          children: <PlotlyChart data={surfaceData} layout={surfaceLayout} config={plotConfig} onClick={handle3dClick} />
        })}

        {renderChartShell({
          id: 'fixedP',
          title: 'Fixed-P Mx-My',
          meta: `${fmt(kn(fixedP), 1)} kN`,
          primary: overviewPrimary === 'fixedP',
          visible: overviewVisible.fixedP,
          onMakePrimary: () => setOverviewPrimary('fixedP'),
          onToggleVisible: () => toggleOverviewVisible('fixedP'),
          controls: (
            <SyncedControl
              label="P"
              value={Number(kn(fixedP).toFixed(1))}
              min={minPKn}
              max={maxPKn}
              step={Math.max(1, Math.round((maxPKn - minPKn) / 240))}
              unit="kN"
              onChange={(value) => onFixedPChange(value * 1000)}
            />
          ),
          children: (
            <PlotlyChart data={contourData} layout={contourLayout} config={plotConfig} onClick={handle2dClick} />
          )
        })}
      </div>
    </section>
  )
}
