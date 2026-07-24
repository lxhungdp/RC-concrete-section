'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Eye, EyeOff, FileSpreadsheet, Loader2, Maximize2, RotateCw } from 'lucide-react'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { LoadCombination } from '@pm/project'
import {
  sliceFixedP,
  sliceFixedPContour,
  sliceMomentPlane,
  PREVIEW_STATIONS,
  VERTICAL_SLICE_KEY_STATIONS,
  type InversePreviewResult,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type PreviewMomentPlanePoint,
  type SectionFieldMap
} from '../../lib/pm-preview-analysis'
import { ExcelExportError, sectionWorkbookFileName } from '../../lib/pm-excel-export'
import { buildSectionFieldMapAsync, exportSectionWorkbookAsync } from '../../lib/workers/pm-analysis-client'
import { PlotlyChart, type PlotlyClickPayload } from './PlotlyChart'
import { momentAngleDeg, neutralAxisAngleDeg, SectionFieldChart } from './SectionFieldChart'

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
  projectName: string
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
const sci = (value: number, digits = 3) => {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-16) return '0'
  return value.toExponential(digits)
}

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

const pickBetaCurve = (rows: ReturnType<typeof groupByBeta>, angleDeg: number) => {
  if (rows.length === 0) return []
  const target = (normalizeAngleDeg(angleDeg) * Math.PI) / 180
  let best = rows[0]
  for (let i = 1; i < rows.length; i++) {
    const current = rows[i]
    const delta = Math.abs(current.beta - target)
    const wrap = Math.min(delta, Math.abs(delta - 2 * Math.PI))
    const bestDelta = Math.abs(best.beta - target)
    const bestWrap = Math.min(bestDelta, Math.abs(bestDelta - 2 * Math.PI))
    if (wrap < bestWrap) best = current
  }
  return best.curve
}

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
  projectName,
  selectedLoadcaseId,
  inverseResult,
  fixedP,
  onFixedPChange,
  onSelectLoadcase
}: Props) {
  const [sliceAngle, setSliceAngle] = useState(0)
  const [includeOppositeMoment, setIncludeOppositeMoment] = useState(false)
  const [showSceneAxes, setShowSceneAxes] = useState(false)
  const [fieldMode, setFieldMode] = useState<FieldMode>('strain')
  const [showNeutralAxis, setShowNeutralAxis] = useState(true)
  const [showMoments, setShowMoments] = useState(true)
  const [includeRebar, setIncludeRebar] = useState(false)
  const [overviewPrimary, setOverviewPrimary] = useState<OverviewChartId>('vertical')
  const [overviewVisible, setOverviewVisible] = useState<Record<OverviewChartId, boolean>>({
    vertical: true,
    surface3d: true,
    fixedP: true
  })
  const [exportState, setExportState] = useState<'idle' | 'working' | 'error'>('idle')
  const [exportMessage, setExportMessage] = useState('')
  const [loadcasePrimary, setLoadcasePrimary] = useState<LoadcaseChartId>('heatmap')
  const [loadcaseVisible, setLoadcaseVisible] = useState<Record<LoadcaseChartId, boolean>>({
    heatmap: true,
    fixedP: true,
    vertical: true
  })
  const [fieldMap, setFieldMap] = useState<SectionFieldMap | null>(null)
  const [fieldMapWorking, setFieldMapWorking] = useState(false)

  const selectedLoadcase = loadcases.find((item) => item.id === selectedLoadcaseId) ?? null
  const isLoadcaseMode = viewMode === 'loadcase' && selectedLoadcase != null

  useEffect(() => {
    let cancelled = false
    setFieldMap(null)

    if (!isLoadcaseMode || !inverseResult) {
      setFieldMapWorking(false)
      return () => {
        cancelled = true
      }
    }

    setFieldMapWorking(true)
    buildSectionFieldMapAsync({ section, rebars, materialStore, state: inverseResult.state })
      .then((map) => {
        if (cancelled) return
        setFieldMap(map)
      })
      .catch(() => {
        if (cancelled) return
        setFieldMap(null)
      })
      .finally(() => {
        if (cancelled) return
        setFieldMapWorking(false)
      })

    return () => {
      cancelled = true
    }
  }, [inverseResult, isLoadcaseMode, materialStore, rebars, section])

  const activeFixedP = isLoadcaseMode ? selectedLoadcase.P : fixedP
  const activeAngle = isLoadcaseMode ? loadcaseAngleDeg(selectedLoadcase) : sliceAngle
  const demandProjection = useMemo(() => {
    if (!isLoadcaseMode || !selectedLoadcase) return null
    const theta = (normalizeAngleDeg(activeAngle) * Math.PI) / 180
    return {
      mx: knm(selectedLoadcase.Mx),
      my: knm(selectedLoadcase.My),
      p: kn(selectedLoadcase.P),
      m: knm(selectedLoadcase.Mx * Math.cos(theta) + selectedLoadcase.My * Math.sin(theta)),
      name: selectedLoadcase.name
    }
  }, [activeAngle, isLoadcaseMode, selectedLoadcase])

  const pRange = surface?.bounds.P ?? [0, 0]
  const minPKn = Math.floor(kn(pRange[0]))
  const maxPKn = Math.ceil(kn(pRange[1]))
  const activeFixedPKn = kn(activeFixedP)

  const contour = useMemo(
    () => (surface ? sliceFixedPContour(surface.points, activeFixedP) : []),
    [activeFixedP, surface]
  )

  const strainAngleSamples = useMemo(
    () => (surface ? sliceFixedP(surface.points, activeFixedP) : []),
    [activeFixedP, surface]
  )

  const surfaceGrid = useMemo(() => (surface ? groupByBeta(surface.points) : []), [surface])

  useEffect(() => {
    if (!includeOppositeMoment) return
    const wrapped = normalizeAngleDeg(sliceAngle)
    if (wrapped > 180) setSliceAngle(wrapped - 180)
  }, [includeOppositeMoment, sliceAngle])

  const angleSliderMax = includeOppositeMoment ? 180 : 345

  const surfaceData = useMemo(() => {
    if (!surface) return []
    const x = surfaceGrid.map((row) => row.curve.map((point) => knm(point.Mx)))
    const y = surfaceGrid.map((row) => row.curve.map((point) => knm(point.My)))
    const z = surfaceGrid.map((row) => row.curve.map((point) => kn(point.P)))
    const customdata = surfaceGrid.map((row) => row.curve.map((point) => point.id))

    const mxSpan = Math.max(Math.abs(surface.bounds.Mx[0]), Math.abs(surface.bounds.Mx[1]), 1)
    const mySpan = Math.max(Math.abs(surface.bounds.My[0]), Math.abs(surface.bounds.My[1]), 1)
    const radius = knm(Math.hypot(mxSpan, mySpan)) * 1.05
    const p0 = kn(surface.bounds.P[0])
    const p1 = kn(surface.bounds.P[1])
    const theta = (normalizeAngleDeg(activeAngle) * Math.PI) / 180
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    const m0 = includeOppositeMoment ? -radius : 0
    const m1 = radius
    const pPlane = activeFixedPKn

    const verticalPlane = {
      type: 'surface',
      name: 'Vertical plane',
      x: [
        [m0 * c, m1 * c],
        [m0 * c, m1 * c]
      ],
      y: [
        [m0 * s, m1 * s],
        [m0 * s, m1 * s]
      ],
      z: [
        [p0, p0],
        [p1, p1]
      ],
      opacity: 0.22,
      showscale: false,
      colorscale: [
        [0, '#7c3aed'],
        [1, '#7c3aed']
      ],
      hoverinfo: 'skip',
      contours: { x: { highlight: false }, y: { highlight: false }, z: { highlight: false } }
    }

    const mxMin = -knm(mxSpan) * 1.05
    const mxMax = knm(mxSpan) * 1.05
    const myMin = -knm(mySpan) * 1.05
    const myMax = knm(mySpan) * 1.05
    const fixedPPlane = {
      type: 'surface',
      name: 'Fixed-P plane',
      x: [
        [mxMin, mxMax],
        [mxMin, mxMax]
      ],
      y: [
        [myMin, myMin],
        [myMax, myMax]
      ],
      z: [
        [pPlane, pPlane],
        [pPlane, pPlane]
      ],
      opacity: 0.18,
      showscale: false,
      colorscale: [
        [0, '#2563eb'],
        [1, '#2563eb']
      ],
      hoverinfo: 'skip',
      contours: { x: { highlight: false }, y: { highlight: false }, z: { highlight: false } }
    }

    const ring = contour.length
      ? {
          type: 'scatter3d',
          name: 'Fixed-P ring',
          mode: 'lines',
          x: [...contour.map((point) => knm(point.Mx)), knm(contour[0].Mx)],
          y: [...contour.map((point) => knm(point.My)), knm(contour[0].My)],
          z: [...contour.map(() => pPlane), pPlane],
          line: { color: '#2563eb', width: 5 },
          hoverinfo: 'skip'
        }
      : null

    const momentPlanePoints = sliceMomentPlane(surface.points, theta)
    const momentScale = Math.max(...momentPlanePoints.map((point) => Math.abs(point.M)), 1)
    const momentTol = momentScale * 1e-9
    const sliceCurve = momentPlanePoints.filter((point) => point.M >= -momentTol)
    const sliceTrace = {
      type: 'scatter3d',
      name: 'Vertical slice',
      mode: 'lines',
      x: sliceCurve.map((point) => knm(point.Mx)),
      y: sliceCurve.map((point) => knm(point.My)),
      z: sliceCurve.map((point) => kn(point.P)),
      line: { color: '#7c3aed', width: 6 },
      hoverinfo: 'skip'
    }

    const oppositeCurve = includeOppositeMoment ? momentPlanePoints.filter((point) => point.M <= momentTol) : []
    const oppositeTrace =
      oppositeCurve.length > 0
        ? {
            type: 'scatter3d',
            name: 'Opposite slice',
            mode: 'lines',
            x: oppositeCurve.map((point) => knm(point.Mx)),
            y: oppositeCurve.map((point) => knm(point.My)),
            z: oppositeCurve.map((point) => kn(point.P)),
            line: { color: '#c4b5fd', width: 5 },
            hoverinfo: 'skip'
          }
        : null

    return [
      {
        type: 'surface',
        name: 'Design surface',
        x,
        y,
        z,
        customdata,
        colorscale: fieldColorscale,
        opacity: 0.72,
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
      verticalPlane,
      fixedPPlane,
      sliceTrace,
      ...(oppositeTrace ? [oppositeTrace] : []),
      ...(ring ? [ring] : []),
      {
        type: 'scatter3d',
        name: 'Loadcases',
        mode: 'markers',
        x: loadcases.map((item) => knm(item.Mx)),
        y: loadcases.map((item) => knm(item.My)),
        z: loadcases.map((item) => kn(item.P)),
        customdata: loadcases.map((item) => [item.id, item.name]),
        marker: {
          size: loadcases.map((item) => (item.id === selectedLoadcaseId ? 7 : 5)),
          color: loadcases.map((item) => (item.id === selectedLoadcaseId ? '#f97316' : '#dc2626')),
          line: { color: '#ffffff', width: 1 }
        },
        hovertemplate: '%{customdata[1]}<br>P=%{z:.1f} kN<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>Demand</extra>'
      }
    ]
  }, [
    activeAngle,
    activeFixedPKn,
    contour,
    includeOppositeMoment,
    loadcases,
    selectedLoadcaseId,
    surface,
    surfaceGrid
  ])

  const surfaceLayout = useMemo(() => {
    const axis = (title: string) =>
      showSceneAxes
        ? {
            title,
            showbackground: false,
            showgrid: true,
            zeroline: true,
            showticklabels: true,
            gridcolor: '#e5e7eb',
            zerolinecolor: '#94a3b8',
            tickfont: { size: 10 }
          }
        : {
            title: '',
            showbackground: false,
            showgrid: false,
            zeroline: false,
            showticklabels: false,
            showspikes: false,
            visible: false
          }

    return {
      ...plotTheme,
      margin: { l: 0, r: showSceneAxes ? 28 : 8, t: 2, b: 0 },
      showlegend: false,
      scene: {
        xaxis: axis('Mx (kN.m)'),
        yaxis: axis('My (kN.m)'),
        zaxis: axis('P (kN)'),
        aspectmode: 'cube',
        camera: { eye: { x: 1.45, y: 1.35, z: 0.9 } }
      },
      hovermode: 'closest',
      clickmode: 'event+select'
    }
  }, [showSceneAxes])

  const contourData = useMemo(() => {
    const closedX = [...contour.map((point) => knm(point.Mx))]
    const closedY = [...contour.map((point) => knm(point.My))]
    if (contour[0]) {
      closedX.push(knm(contour[0].Mx))
      closedY.push(knm(contour[0].My))
    }
    const rayRadius = Math.max(...contour.map((point) => knm(Math.hypot(point.Mx, point.My))), 1) * 1.18
    const radialX = strainAngleSamples.flatMap((point) => [0, rayRadius * Math.cos(point.beta), null])
    const radialY = strainAngleSamples.flatMap((point) => [0, rayRadius * Math.sin(point.beta), null])
    const demandGuideX = demandProjection
      ? [demandProjection.mx, demandProjection.mx, null, 0, demandProjection.mx]
      : []
    const demandGuideY = demandProjection
      ? [0, demandProjection.my, null, demandProjection.my, demandProjection.my]
      : []

    return [
      {
        type: 'scatter',
        name: 'Moment angle rays',
        mode: 'lines',
        x: radialX,
        y: radialY,
        line: { color: '#9ca3af', width: 1, dash: 'dot' },
        hoverinfo: 'skip'
      },
      ...(demandProjection
        ? [
            {
              type: 'scatter',
              name: 'Demand guides',
              mode: 'lines',
              x: demandGuideX,
              y: demandGuideY,
              line: { color: '#ff1f3d', width: 1, dash: 'dot' },
              hoverinfo: 'skip'
            }
          ]
        : []),
      {
        type: 'scatter',
        name: `P = ${fmt(activeFixedPKn, 1)} kN`,
        mode: 'lines',
        x: closedX,
        y: closedY,
        line: { color: '#2563eb', width: 2.4 },
        hovertemplate: 'Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>Fixed P</extra>'
      },
      {
        type: 'scatter',
        name: 'Strain-angle samples',
        mode: 'markers+text',
        x: strainAngleSamples.map((point) => knm(point.Mx)),
        y: strainAngleSamples.map((point) => knm(point.My)),
        text: strainAngleSamples.map((point) => `${fmt((point.beta * 180) / Math.PI, 0)}°`),
        textposition: 'top center',
        textfont: { size: 10, color: '#b91c1c', family: 'IBM Plex Sans, system-ui, sans-serif' },
        marker: {
          size: 8.5,
          color: '#ef4444',
          symbol: 'circle',
          line: { color: '#ffffff', width: 1 }
        },
        customdata: strainAngleSamples.map((point) => [
          fmt((point.beta * 180) / Math.PI, 0),
          fmt((Math.atan2(point.My, point.Mx) * 180) / Math.PI, 1)
        ]),
        hovertemplate:
          'N.A. sample α=%{customdata[0]}°<br>Moment angle θ=%{customdata[1]}°<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra></extra>'
      },
      ...(demandProjection
        ? [
            {
              type: 'scatter',
              name: 'Demand point',
              mode: 'markers',
              x: [demandProjection.mx],
              y: [demandProjection.my],
              marker: {
                size: 10,
                color: '#ff1f3d',
                symbol: 'circle',
                line: { color: '#ffffff', width: 1 }
              },
              customdata: [[demandProjection.name, demandProjection.p]],
              hovertemplate:
                '%{customdata[0]}<br>Mux=%{x:.1f} kN.m<br>Muy=%{y:.1f} kN.m<br>Pu=%{customdata[1]:.1f} kN<extra>Demand</extra>'
            }
          ]
        : [])
    ]
  }, [activeFixedPKn, contour, demandProjection, strainAngleSamples])

  const contourAxisRange = useMemo(() => {
    const points = [...contour, ...strainAngleSamples]
    if (points.length === 0 && !demandProjection) return null
    const xs = points.map((point) => knm(point.Mx))
    const ys = points.map((point) => knm(point.My))
    if (demandProjection) {
      xs.push(demandProjection.mx)
      ys.push(demandProjection.my)
    }
    const minX = Math.min(...xs, 0)
    const maxX = Math.max(...xs, 0)
    const minY = Math.min(...ys, 0)
    const maxY = Math.max(...ys, 0)
    const span = Math.max(maxX - minX, maxY - minY, 1)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const half = (span * 1.08) / 2
    return {
      x: [centerX - half, centerX + half] as [number, number],
      y: [centerY - half, centerY + half] as [number, number]
    }
  }, [contour, demandProjection, strainAngleSamples])

  const contourLayout = useMemo(
    () => ({
      ...plotTheme,
      margin: { l: 44, r: 48, t: 18, b: 40 },
      xaxis: {
        title: '',
        zeroline: true,
        zerolinecolor: '#94a3b8',
        gridcolor: '#e5e7eb',
        automargin: false,
        range: contourAxisRange?.x,
        tickfont: { size: 10 },
        titlefont: { size: 11 }
      },
      yaxis: {
        title: '',
        zeroline: true,
        zerolinecolor: '#94a3b8',
        gridcolor: '#e5e7eb',
        scaleanchor: 'x',
        automargin: false,
        range: contourAxisRange?.y,
        tickfont: { size: 10 }
      },
      annotations: [
        {
          xref: 'paper',
          x: 0.02,
          yref: 'paper',
          y: 0.98,
          text: 'My (kN.m)',
          showarrow: false,
          xanchor: 'left',
          yanchor: 'top',
          font: { size: 11, color: '#6b7280' }
        },
        {
          xref: 'paper',
          x: 0.96,
          yref: 'paper',
          y: 0.04,
          text: 'Mx (kN.m)',
          showarrow: false,
          xanchor: 'right',
          yanchor: 'bottom',
          font: { size: 11, color: '#6b7280' }
        }
      ],
      hovermode: 'closest',
      clickmode: 'event+select',
      showlegend: false
    }),
    [contourAxisRange]
  )

  const verticalSlice = useMemo(() => {
    const empty = {
      primaryPath: [] as Array<{ m: number; p: number; station: number }>,
      oppositePath: [] as Array<{ m: number; p: number; station: number }>,
      stations: [] as Array<{ m: number; p: number; station: number }>,
      keys: [] as Array<{ m: number; p: number; station: number; label: string; side: 'primary' | 'opposite' }>
    }
    if (!surface || surfaceGrid.length === 0) return empty

    const theta = (normalizeAngleDeg(activeAngle) * Math.PI) / 180
    const momentPlane = sliceMomentPlane(surface.points, theta)
    const project = (point: PreviewMomentPlanePoint) => ({
      m: knm(point.M),
      p: kn(point.P),
      station: point.station ?? -1
    })

    const momentScale = Math.max(...momentPlane.map((point) => Math.abs(point.M)), 1)
    const momentTol = momentScale * 1e-9
    const primaryPath = momentPlane.filter((point) => point.M >= -momentTol).map(project)
    const oppositePath = includeOppositeMoment ? momentPlane.filter((point) => point.M <= momentTol).map(project) : []

    const pickKeys = (
      curve: Array<{ m: number; p: number; station: number }>,
      side: 'primary' | 'opposite'
    ) =>
      VERTICAL_SLICE_KEY_STATIONS.flatMap(({ station, label }) => {
        const point = curve.reduce<Array<{ point: { m: number; p: number; station: number }; delta: number }>>(
          (matches, item) => {
            const delta = Math.abs(item.station - station)
            return delta <= 0.25 ? [...matches, { point: item, delta }] : matches
          },
          []
        ).sort((a, b) => a.delta - b.delta)[0]?.point
        return point ? [{ ...point, label, side }] : []
      })

    const pickStations = (curve: Array<{ m: number; p: number; station: number }>) =>
      PREVIEW_STATIONS.flatMap((_, station) => {
        const point = curve
          .map((item) => ({ point: item, delta: Math.abs(item.station - station) }))
          .filter((item) => item.delta <= 0.35)
          .sort((a, b) => a.delta - b.delta)[0]?.point
        return point ? [{ ...point, station }] : []
      })

    const keys = [
      ...pickKeys(primaryPath, 'primary'),
      ...(includeOppositeMoment
        ? pickKeys(oppositePath, 'opposite').filter((item) => Math.abs(item.m) > 1e-6)
        : [])
    ]
    const stations =
      includeOppositeMoment && oppositePath.length > 0
        ? [...pickStations(primaryPath), ...pickStations(oppositePath).filter((item) => Math.abs(item.m) > 1e-6)]
        : pickStations(primaryPath)

    return { primaryPath, oppositePath, stations, keys }
  }, [activeAngle, includeOppositeMoment, surface, surfaceGrid])

  const verticalData = useMemo(() => {
    const primaryKeys = verticalSlice.keys.filter((point) => point.side === 'primary')
    const oppositeKeys = verticalSlice.keys.filter((point) => point.side === 'opposite')
    const keyRays = verticalSlice.keys.flatMap((point) => [0, point.m, null])
    const keyRayP = verticalSlice.keys.flatMap((point) => [0, point.p, null])
    const demandGuideM = demandProjection ? [demandProjection.m, demandProjection.m, null, 0, demandProjection.m] : []
    const demandGuideP = demandProjection ? [0, demandProjection.p, null, demandProjection.p, demandProjection.p] : []
    const smoothLine = {
      color: '#2563eb',
      width: 2.4
    }

    return [
      {
        type: 'scatter',
        name: 'Key station rays',
        mode: 'lines',
        x: keyRays,
        y: keyRayP,
        line: { color: '#9ca3af', width: 1, dash: 'dot' },
        hoverinfo: 'skip'
      },
      ...(demandProjection
        ? [
            {
              type: 'scatter',
              name: 'Demand guides',
              mode: 'lines',
              x: demandGuideM,
              y: demandGuideP,
              line: { color: '#ff1f3d', width: 1, dash: 'dot' },
              hoverinfo: 'skip'
            }
          ]
        : []),
      {
        type: 'scatter',
        name: `Angle ${fmt(activeAngle, 0)} deg`,
        mode: 'lines',
        x: verticalSlice.primaryPath.map((point) => point.m),
        y: verticalSlice.primaryPath.map((point) => point.p),
        line: smoothLine,
        marker: { size: 0 },
        hoverinfo: 'skip'
      },
      ...(verticalSlice.oppositePath.length > 0
        ? [
            {
              type: 'scatter',
              name: `Angle ${fmt(normalizeAngleDeg(activeAngle + 180), 0)} deg`,
              mode: 'lines',
              x: verticalSlice.oppositePath.map((point) => point.m),
              y: verticalSlice.oppositePath.map((point) => point.p),
              line: { ...smoothLine, color: '#60a5fa' },
              marker: { size: 0 },
              hoverinfo: 'skip'
            }
          ]
        : []),
      {
        type: 'scatter',
        name: 'Stations',
        mode: 'markers',
        x: verticalSlice.stations.map((point) => point.m),
        y: verticalSlice.stations.map((point) => point.p),
        marker: {
          size: 6,
          color: '#ef4444',
          symbol: 'circle',
          line: { color: '#ffffff', width: 0.8 }
        },
        customdata: verticalSlice.stations.map((point) => point.station),
        hovertemplate: 'P%{customdata}<br>M=%{x:.1f} kN.m<br>P=%{y:.1f} kN<extra>Station</extra>'
      },
      {
        type: 'scatter',
        name: 'Key stations',
        mode: 'markers+text',
        x: primaryKeys.map((point) => point.m),
        y: primaryKeys.map((point) => point.p),
        text: primaryKeys.map((point) => point.label),
        textposition: 'top center',
        textfont: { size: 10, color: '#b91c1c', family: 'IBM Plex Sans, system-ui, sans-serif' },
        marker: {
          size: 8.5,
          color: '#ef4444',
          symbol: 'circle',
          line: { color: '#ffffff', width: 1 }
        },
        hovertemplate: '%{text}<br>M=%{x:.1f} kN.m<br>P=%{y:.1f} kN<extra></extra>'
      },
      ...(oppositeKeys.length > 0
        ? [
            {
              type: 'scatter',
              name: 'Opposite keys',
              mode: 'markers+text',
              x: oppositeKeys.map((point) => point.m),
              y: oppositeKeys.map((point) => point.p),
              text: oppositeKeys.map((point) => point.label),
              textposition: 'top center',
              textfont: { size: 10, color: '#b91c1c', family: 'IBM Plex Sans, system-ui, sans-serif' },
              marker: {
                size: 8,
                color: '#ef4444',
                symbol: 'circle',
                line: { color: '#ffffff', width: 1 }
              },
              hovertemplate: '%{text}<br>M=%{x:.1f} kN.m<br>P=%{y:.1f} kN<extra></extra>'
            }
          ]
        : []),
      ...(demandProjection
        ? [
            {
              type: 'scatter',
              name: 'Demand point',
              mode: 'markers',
              x: [demandProjection.m],
              y: [demandProjection.p],
              marker: {
                size: 10,
                color: '#ff1f3d',
                symbol: 'circle',
                line: { color: '#ffffff', width: 1 }
              },
              customdata: [[demandProjection.name, demandProjection.mx, demandProjection.my]],
              hovertemplate:
                '%{customdata[0]}<br>Mθ=%{x:.1f} kN.m<br>Pu=%{y:.1f} kN<br>Mux=%{customdata[1]:.1f} kN.m<br>Muy=%{customdata[2]:.1f} kN.m<extra>Demand</extra>'
            }
          ]
        : [])
    ]
  }, [activeAngle, demandProjection, verticalSlice])

  const verticalLayout = useMemo(
    () => ({
      ...plotTheme,
      margin: { l: 42, r: 52, t: 18, b: 36 },
      xaxis: {
        title: '',
        zeroline: true,
        zerolinecolor: '#94a3b8',
        gridcolor: '#e5e7eb',
        automargin: false,
        tickfont: { size: 10 },
        ticks: 'outside',
        ticklen: 4,
        tickcolor: '#cbd5e1'
      },
      yaxis: {
        title: '',
        zeroline: true,
        zerolinecolor: '#94a3b8',
        gridcolor: '#e5e7eb',
        automargin: false,
        tickfont: { size: 10 },
        ticks: 'outside',
        ticklen: 4,
        tickcolor: '#cbd5e1'
      },
      annotations: [
        {
          xref: 'paper',
          x: 0,
          yref: 'paper',
          y: 1.02,
          text: 'P (kN)',
          showarrow: false,
          xanchor: 'left',
          yanchor: 'bottom',
          font: { size: 11, color: '#6b7280' }
        },
        {
          xref: 'paper',
          x: 1.01,
          yref: 'paper',
          y: 0,
          text: 'M (kN.m)',
          showarrow: false,
          xanchor: 'left',
          yanchor: 'top',
          font: { size: 11, color: '#6b7280' }
        }
      ],
      hovermode: 'closest',
      showlegend: false
    }),
    []
  )

  const fieldExtremes = useMemo(() => {
    if (!fieldMap) return null
    let epsMin = Number.POSITIVE_INFINITY
    let epsMax = Number.NEGATIVE_INFINITY
    let sigMin = Number.POSITIVE_INFINITY
    let sigMax = Number.NEGATIVE_INFINITY
    const push = (eps: number, sig: number) => {
      epsMin = Math.min(epsMin, eps)
      epsMax = Math.max(epsMax, eps)
      sigMin = Math.min(sigMin, sig)
      sigMax = Math.max(sigMax, sig)
    }
    for (const tri of fieldMap.triangles) {
      push(tri.strainA, tri.stressA)
      push(tri.strainB, tri.stressB)
      push(tri.strainC, tri.stressC)
    }
    for (const bar of fieldMap.rebars) push(bar.strain, bar.stress)
    if (!Number.isFinite(epsMin)) return null
    return { epsMin, epsMax, sigMin, sigMax }
  }, [fieldMap])

  const handleExcelExport = async () => {
    if (!selectedLoadcase) return
    setExportState('working')
    setExportMessage('')
    try {
      // The detail sheets audit a strain plane, so they must use the neutral-axis orientation of
      // the equilibrium state — not the demand moment direction, which the workbook derives itself.
      const equilibrium = inverseResult?.state
      const curvature = equilibrium ? Math.hypot(equilibrium.kx, equilibrium.ky) : 0
      const betaDeg =
        equilibrium && curvature > 1e-12
          ? normalizeAngleDeg((Math.atan2(equilibrium.ky, equilibrium.kx) * 180) / Math.PI)
          : activeAngle
      const payload = {
        projectName,
        sectionName: section.name,
        section,
        rebars,
        materialStore,
        betaDeg,
        fixedP: activeFixedP,
        loadcase: selectedLoadcase,
        equilibrium: equilibrium ?? null
      }
      const blob = await exportSectionWorkbookAsync(payload)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = sectionWorkbookFileName(payload)
      anchor.click()
      URL.revokeObjectURL(url)
      setExportState('idle')
      setExportMessage(`Saved ${sectionWorkbookFileName(payload)}`)
    } catch (error) {
      setExportState('error')
      setExportMessage(
        error instanceof ExcelExportError
          ? error.message
          : `Export failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  const handle3dClick = (event: PlotlyClickPayload) => {
    if (isLoadcaseMode) return
    const point = event.points?.[0]
    const data = point?.customdata
    const id = Array.isArray(data) ? data[0] : data
    if (typeof id === 'number') onSelectLoadcase(id)
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
          <div className="pm-results-export" role="toolbar" aria-label="Export results">
            <button
              type="button"
              className="pm-export-button"
              onClick={handleExcelExport}
              disabled={exportState === 'working' || !surface}
              title="Export the full section calculation to Excel, with live formulas"
            >
              {exportState === 'working' ? <Loader2 size={14} className="pm-spin" /> : <FileSpreadsheet size={14} />}
              {exportState === 'working' ? 'Building…' : 'Excel'}
            </button>
            {exportMessage ? (
              <span className={`pm-export-message${exportState === 'error' ? ' is-error' : ''}`} role="status">
                {exportMessage}
              </span>
            ) : null}
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
              <div className="pm-section-field-toolbar" role="group" aria-label="Section field options">
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
                <label className={`pm-field-check${showNeutralAxis ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={showNeutralAxis}
                    onChange={(event) => setShowNeutralAxis(event.target.checked)}
                  />
                  N.A.
                </label>
                <label className={`pm-field-check${showMoments ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={showMoments}
                    onChange={(event) => setShowMoments(event.target.checked)}
                  />
                  Moments
                </label>
                <label className={`pm-field-check${includeRebar ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={includeRebar}
                    onChange={(event) => setIncludeRebar(event.target.checked)}
                  />
                  Rebar
                </label>
              </div>
            ),
            footer: inverseResult ? (
              <div className="pm-section-field-metrics">
                <article className="pm-field-metric-card">
                  <header>Solver</header>
                  <div className="pm-field-metric-rows">
                    <div>
                      <span>Status</span>
                      <strong className={inverseResult.ok ? 'is-ok' : 'is-warn'}>
                        {inverseResult.ok ? 'Converged' : 'Approx'}
                      </strong>
                    </div>
                    <div>
                      <span>Iter / η</span>
                      <strong>
                        {inverseResult.iterations}
                        {' · '}
                        {inverseResult.utilization == null ? 'n/a' : fmt(inverseResult.utilization, 3)}
                      </strong>
                    </div>
                    <div>
                      <span>Residual</span>
                      <strong>{sci(inverseResult.residualNorm, 2)}</strong>
                    </div>
                    <div>
                      <span>N.A.</span>
                      <strong>
                        {(() => {
                          const angle = neutralAxisAngleDeg(inverseResult.state)
                          return angle == null ? 'n/a' : `${fmt(angle, 1)}°`
                        })()}
                      </strong>
                    </div>
                  </div>
                </article>

                <article className="pm-field-metric-card">
                  <header>Strain</header>
                  <div className="pm-field-metric-rows">
                    <div>
                      <span>ε₀</span>
                      <strong>{fmt(inverseResult.state.e0, 6)}</strong>
                    </div>
                    <div>
                      <span>kx / ky</span>
                      <strong>
                        {sci(inverseResult.state.kx, 2)} / {sci(inverseResult.state.ky, 2)}
                      </strong>
                    </div>
                    <div>
                      <span>ε max</span>
                      <strong>{fieldExtremes ? fmt(fieldExtremes.epsMax, 6) : '—'}</strong>
                    </div>
                    <div>
                      <span>ε min</span>
                      <strong>{fieldExtremes ? fmt(fieldExtremes.epsMin, 6) : '—'}</strong>
                    </div>
                  </div>
                </article>

                <article className="pm-field-metric-card">
                  <header>Stress</header>
                  <div className="pm-field-metric-rows">
                    <div>
                      <span>σ max</span>
                      <strong>{fieldExtremes ? `${fmt(fieldExtremes.sigMax, 2)} MPa` : '—'}</strong>
                    </div>
                    <div>
                      <span>σ min</span>
                      <strong>{fieldExtremes ? `${fmt(fieldExtremes.sigMin, 2)} MPa` : '—'}</strong>
                    </div>
                    <div>
                      <span>Δσ</span>
                      <strong>
                        {fieldExtremes
                          ? `${fmt(fieldExtremes.sigMax - fieldExtremes.sigMin, 2)} MPa`
                          : '—'}
                      </strong>
                    </div>
                  </div>
                </article>

                <article className="pm-field-metric-card">
                  <header>Demand</header>
                  <div className="pm-field-metric-rows">
                    <div>
                      <span>Pu</span>
                      <strong>{fmt(kn(inverseResult.demand.P), 1)} kN</strong>
                    </div>
                    <div>
                      <span>Mux</span>
                      <strong>{fmt(knm(inverseResult.demand.Mx), 1)} kN·m</strong>
                    </div>
                    <div>
                      <span>Muy</span>
                      <strong>{fmt(knm(inverseResult.demand.My), 1)} kN·m</strong>
                    </div>
                    <div>
                      <span>|M| / ∠M</span>
                      <strong>
                        {fmt(knm(Math.hypot(inverseResult.demand.Mx, inverseResult.demand.My)), 1)}
                        {' · '}
                        {(() => {
                          const angle = momentAngleDeg(inverseResult.demand.Mx, inverseResult.demand.My)
                          return angle == null ? 'n/a' : `${fmt(angle, 1)}°`
                        })()}
                      </strong>
                    </div>
                  </div>
                </article>
              </div>
            ) : null,
            children: fieldMap && inverseResult ? (
              <SectionFieldChart
                fieldMap={fieldMap}
                section={section}
                fieldMode={fieldMode}
                state={inverseResult.state}
                Mx={inverseResult.demand.Mx}
                My={inverseResult.demand.My}
                showNeutralAxis={showNeutralAxis}
                showMoments={showMoments}
                includeRebar={includeRebar}
              />
            ) : (
              <div className="pm-results-plot-placeholder">
                {fieldMapWorking ? 'Field map is calculating...' : 'Inverse solution is calculating...'}
              </div>
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
              <>
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
                <label className={`pm-field-check${includeOppositeMoment ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={includeOppositeMoment}
                    onChange={(event) => setIncludeOppositeMoment(event.target.checked)}
                  />
                  Opposite
                </label>
              </>
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
            <>
              <SyncedControl
                label="Angle"
                value={sliceAngle}
                min={0}
                max={angleSliderMax}
                step={15}
                unit="deg"
                onChange={setSliceAngle}
              />
              <label className={`pm-field-check${includeOppositeMoment ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={includeOppositeMoment}
                  onChange={(event) => setIncludeOppositeMoment(event.target.checked)}
                />
                Opposite
              </label>
            </>
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
          controls: (
            <label className={`pm-field-check${showSceneAxes ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={showSceneAxes}
                onChange={(event) => setShowSceneAxes(event.target.checked)}
              />
              Axes
            </label>
          ),
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
          children: <PlotlyChart data={contourData} layout={contourLayout} config={plotConfig} />
        })}
      </div>
    </section>
  )
}
