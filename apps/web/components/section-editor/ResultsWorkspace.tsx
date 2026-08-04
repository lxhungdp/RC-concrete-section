'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Eye, EyeOff, FileSpreadsheet, Loader2, Maximize2, RotateCw } from 'lucide-react'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { DesignBasis } from '@pm/design'
import type { LoadCombination } from '@pm/project'
import {
  contourStrainAngleSamples,
  sliceFixedPContour,
  sliceMomentPlane,
  type InversePreviewResult,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type PreviewMomentPlanePoint,
  type PreviewMomentPlanePath,
  type SectionFieldMap
} from '@pm/analysis'
import { ExcelExportError, sectionWorkbookFileName } from '@pm/report'
import {
  buildSectionFieldMapAsync,
  exportSectionWorkbookAsync,
  isAnalysisAbort
} from '../../lib/workers/pm-analysis-client'
import { PlotlyChart, type PlotlyClickPayload } from './PlotlyChart'
import { SectionFieldChart } from './SectionFieldChart'
import {
  lineAngleDifferenceDeg,
  momentAngleDeg,
  perpendicularBendingAxisAngleDeg,
  sectionFieldAngleComparison,
  strainDirectionToNeutralAxisAngleDeg
} from './section-field-angles'

type ResultsViewMode = 'overview' | 'loadcase'
type OverviewChartId = 'vertical' | 'surface3d' | 'fixedP'
type LoadcaseChartId = 'heatmap' | 'fixedP' | 'vertical'
type FieldMode = 'strain' | 'stress'
type ResultsTheme = 'light' | 'dark'
type SurfaceResistanceMode = 'nominal' | 'design'

const OVERVIEW_CHARTS: OverviewChartId[] = ['vertical', 'surface3d', 'fixedP']
const LOADCASE_CHARTS: LoadcaseChartId[] = ['heatmap', 'fixedP', 'vertical']
const MAX_VISIBLE_CHARTS = 3

type Props = {
  theme: ResultsTheme
  ready: boolean
  viewMode: ResultsViewMode
  surface: PreviewSurface | null
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
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

const plotPalettes = {
  light: {
    text: '#475569',
    mutedText: '#64748b',
    grid: 'rgba(15, 23, 42, 0.08)',
    zeroLine: 'rgba(15, 23, 42, 0.24)',
    tick: 'rgba(15, 23, 42, 0.28)',
    primary: '#2563eb',
    guide: 'rgba(100, 116, 139, 0.55)',
    calloutText: '#b91c1c',
    markerOutline: '#ffffff'
  },
  dark: {
    text: '#cbd5e1',
    mutedText: '#94a3b8',
    grid: 'rgba(255, 255, 255, 0.055)',
    zeroLine: 'rgba(255, 255, 255, 0.18)',
    tick: 'rgba(255, 255, 255, 0.24)',
    primary: '#60a5fa',
    guide: 'rgba(148, 163, 184, 0.34)',
    calloutText: '#facc15',
    markerOutline: '#0e0f11'
  }
} as const

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

const pointBounds = (points: PreviewSurfacePoint[]) => ({
  P: [
    Math.min(...points.map((point) => point.P)),
    Math.max(...points.map((point) => point.P))
  ] as [number, number],
  Mx: [
    Math.min(...points.map((point) => point.Mx)),
    Math.max(...points.map((point) => point.Mx))
  ] as [number, number],
  My: [
    Math.min(...points.map((point) => point.My)),
    Math.max(...points.map((point) => point.My))
  ] as [number, number]
})

const normalizeAngleDeg = (degrees: number) => {
  const wrapped = ((degrees % 360) + 360) % 360
  return wrapped
}

/**
 * Clip connected moment-plane paths without turning the retained points back into a point cloud.
 * Crossing points at M=0 are interpolated explicitly, so hiding the opposite branch cannot leave a
 * gap or draw a chord between disconnected pieces.
 */
const clipMomentPlanePaths = (
  paths: PreviewMomentPlanePath[],
  side: 'positive' | 'negative'
): PreviewMomentPlanePoint[][] => {
  const scale = Math.max(...paths.flatMap((path) => path.points.map((point) => Math.abs(point.M))), 1)
  const tol = scale * 1e-12
  const inside = (point: PreviewMomentPlanePoint) =>
    side === 'positive' ? point.M >= -tol : point.M <= tol
  const crossing = (a: PreviewMomentPlanePoint, b: PreviewMomentPlanePoint): PreviewMomentPlanePoint => {
    const t = a.M / (a.M - b.M)
    return {
      beta: a.beta + (b.beta - a.beta) * t,
      P: a.P + (b.P - a.P) * t,
      Mx: a.Mx + (b.Mx - a.Mx) * t,
      My: a.My + (b.My - a.My) * t,
      station:
        a.station === undefined || b.station === undefined
          ? undefined
          : a.station + (b.station - a.station) * t,
      M: 0
    }
  }

  return paths.flatMap((path) => {
    if (path.points.length < 2) return []
    const unique = path.closed ? path.points.slice(0, -1) : [...path.points]
    if (unique.every(inside)) return [[...unique, ...(path.closed ? [unique[0]] : [])]]
    if (unique.every((point) => !inside(point))) return []

    // Start a mixed closed loop outside the retained half-plane. This prevents one clipped branch
    // from being split across the array wrap.
    if (path.closed) {
      const outsideIndex = unique.findIndex((point) => !inside(point))
      unique.push(...unique.splice(0, outsideIndex), unique[0])
    }

    const pieces: PreviewMomentPlanePoint[][] = []
    let piece: PreviewMomentPlanePoint[] = []
    for (let index = 0; index < unique.length - 1; index++) {
      const a = unique[index]
      const b = unique[index + 1]
      const aInside = inside(a)
      const bInside = inside(b)
      if (aInside && piece.length === 0) piece.push(a)
      if (aInside && bInside) {
        piece.push(b)
      } else if (aInside && !bInside) {
        piece.push(crossing(a, b))
        if (piece.length >= 2) pieces.push(piece)
        piece = []
      } else if (!aInside && bInside) {
        piece = [crossing(a, b), b]
      }
    }
    if (piece.length >= 2) pieces.push(piece)
    return pieces
  })
}

/**
 * Three outcomes, not two. A residual that converged onto a strain plane outside the material
 * domain is not an equilibrium state, and must not read the same as a valid solve.
 */
const solverStatus = (result: InversePreviewResult) => {
  if (!result.converged) return { label: 'Approx', tone: 'is-warn' }
  if (!result.admissibility.ok) return { label: 'Inadmissible', tone: 'is-bad' }
  return { label: 'Converged', tone: 'is-ok' }
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

const ResistanceVisibilityControls = ({
  showDesign,
  showNominal,
  onShowDesign,
  onShowNominal
}: {
  showDesign: boolean
  showNominal: boolean
  onShowDesign: (value: boolean) => void
  onShowNominal: (value: boolean) => void
}) => (
  <>
    <label className={`pm-field-check${showDesign ? ' is-on' : ''}`}>
      <input
        type="checkbox"
        checked={showDesign}
        onChange={(event) => {
          const next = event.target.checked
          if (next || showNominal) onShowDesign(next)
        }}
      />
      Design
    </label>
    <label className={`pm-field-check${showNominal ? ' is-on' : ''}`}>
      <input
        type="checkbox"
        checked={showNominal}
        onChange={(event) => {
          const next = event.target.checked
          if (next || showDesign) onShowNominal(next)
        }}
      />
      Nominal
    </label>
  </>
)

const SurfaceResistanceControl = ({
  value,
  onChange
}: {
  value: SurfaceResistanceMode
  onChange: (value: SurfaceResistanceMode) => void
}) => (
  <fieldset className="pm-result-radio-group" aria-label="3D resistance surface">
    {(['nominal', 'design'] as const).map((mode) => (
      <label key={mode} className={value === mode ? 'is-active' : ''}>
        <input
          type="radio"
          name="surface-resistance"
          value={mode}
          checked={value === mode}
          onChange={() => onChange(mode)}
        />
        {mode === 'nominal' ? 'Nominal' : 'Design'}
      </label>
    ))}
  </fieldset>
)

export function ResultsWorkspace({
  theme,
  ready,
  viewMode,
  surface,
  section,
  rebars,
  materialStore,
  designBasis,
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
  const [showFixedPAngleRays, setShowFixedPAngleRays] = useState(false)
  const [showDesignResistance, setShowDesignResistance] = useState(true)
  const [showNominalReference, setShowNominalReference] = useState(true)
  const [showSceneAxes, setShowSceneAxes] = useState(false)
  const [surfaceResistanceMode, setSurfaceResistanceMode] =
    useState<SurfaceResistanceMode>('design')
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
  const plotPalette = plotPalettes[theme]
  const plotTheme = useMemo(
    () => ({
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      autosize: true,
      font: {
        family: 'IBM Plex Sans, system-ui, sans-serif',
        size: 11,
        color: plotPalette.text
      },
      margin: { l: 48, r: 18, t: 10, b: 42 }
    }),
    [plotPalette.text]
  )

  const selectedLoadcase = loadcases.find((item) => item.id === selectedLoadcaseId) ?? null
  const isLoadcaseMode = viewMode === 'loadcase' && selectedLoadcase != null

  useEffect(() => {
    setFieldMap(null)

    if (!isLoadcaseMode || !inverseResult || !surface) {
      setFieldMapWorking(false)
      return
    }

    const controller = new AbortController()
    setFieldMapWorking(true)
    buildSectionFieldMapAsync(
      {
        calculationProfileId: surface.calculationProfileId ?? 'kds-2024-stress-strain',
        section,
        rebars,
        materialStore,
        designBasis,
        analysisOptions: surface.analysisOptions,
        state: inverseResult.state,
        blockState: inverseResult.equivalentBlock ? {
          neutralAxisAngle: inverseResult.equivalentBlock.neutralAxisAngle,
          neutralAxisDepth: inverseResult.equivalentBlock.neutralAxisDepth
        } : undefined
      },
      controller.signal
    )
      .then((map) => {
        setFieldMap(map)
        setFieldMapWorking(false)
      })
      .catch((error) => {
        if (isAnalysisAbort(error)) return
        setFieldMap(null)
        setFieldMapWorking(false)
      })

    return () => controller.abort()
  }, [designBasis, inverseResult, isLoadcaseMode, materialStore, rebars, section, surface])

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
    () => (surface ? sliceFixedPContour(surface.points, activeFixedP, surface.triangles) : []),
    [activeFixedP, surface]
  )
  const nominalContour = useMemo(
    () => (surface ? sliceFixedPContour(surface.nominalPoints, activeFixedP, surface.nominalTriangles) : []),
    [activeFixedP, surface]
  )
  const axialCapPKn = useMemo(() => {
    const capped = surface?.points.filter((point) => point.resistance?.axialCapApplied) ?? []
    return capped.length > 0 ? kn(Math.max(...capped.map((point) => point.P))) : null
  }, [surface])

  // Diagnostic markers, taken from the contour that is actually drawn — not from a second slice.
  const strainAngleSamples = useMemo(() => contourStrainAngleSamples(contour), [contour])
  const nominalStrainAngleSamples = useMemo(
    () => contourStrainAngleSamples(nominalContour),
    [nominalContour]
  )
  const surfacePoints3d = useMemo(
    () =>
      surface
        ? surfaceResistanceMode === 'design'
          ? surface.points
          : surface.nominalPoints
        : [],
    [surface, surfaceResistanceMode]
  )
  const surfaceGrid = useMemo(() => groupByBeta(surfacePoints3d), [surfacePoints3d])
  const surfaceBounds3d = useMemo(
    () => (surfacePoints3d.length > 0 ? pointBounds(surfacePoints3d) : null),
    [surfacePoints3d]
  )
  const surfaceContour3d = useMemo(
    () => sliceFixedPContour(
      surfacePoints3d,
      activeFixedP,
      surfaceResistanceMode === 'design' ? surface?.triangles : surface?.nominalTriangles
    ),
    [activeFixedP, surface, surfacePoints3d, surfaceResistanceMode]
  )

  useEffect(() => {
    if (!includeOppositeMoment) return
    const wrapped = normalizeAngleDeg(sliceAngle)
    if (wrapped > 180) setSliceAngle(wrapped - 180)
  }, [includeOppositeMoment, sliceAngle])

  const angleSliderMax = includeOppositeMoment ? 180 : 345

  const surfaceData = useMemo(() => {
    if (!surface || !surfaceBounds3d) return []
    const x = surfaceGrid.map((row) => row.curve.map((point) => knm(point.Mx)))
    const y = surfaceGrid.map((row) => row.curve.map((point) => knm(point.My)))
    const z = surfaceGrid.map((row) => row.curve.map((point) => kn(point.P)))
    const customdata = surfaceGrid.map((row) => row.curve.map((point) => point.id))

    const mxSpan = Math.max(Math.abs(surfaceBounds3d.Mx[0]), Math.abs(surfaceBounds3d.Mx[1]), 1)
    const mySpan = Math.max(Math.abs(surfaceBounds3d.My[0]), Math.abs(surfaceBounds3d.My[1]), 1)
    const radius = knm(Math.hypot(mxSpan, mySpan)) * 1.05
    const p0 = kn(surfaceBounds3d.P[0])
    const p1 = kn(surfaceBounds3d.P[1])
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

    const ring = surfaceContour3d.length
      ? {
          type: 'scatter3d',
          name: 'Fixed-P ring',
          mode: 'lines',
          x: [...surfaceContour3d.map((point) => knm(point.Mx)), knm(surfaceContour3d[0].Mx)],
          y: [...surfaceContour3d.map((point) => knm(point.My)), knm(surfaceContour3d[0].My)],
          z: [...surfaceContour3d.map(() => pPlane), pPlane],
          line: { color: '#2563eb', width: 5 },
          hoverinfo: 'skip'
        }
      : null

    const activeTriangles = surfaceResistanceMode === 'design' ? surface.triangles : surface.nominalTriangles
    const momentPlanePaths = sliceMomentPlane(surfacePoints3d, theta, activeTriangles)
    const visibleMomentPaths = includeOppositeMoment
      ? momentPlanePaths.map((path) => path.points)
      : clipMomentPlanePaths(momentPlanePaths, 'positive')
    const sliceTraces = visibleMomentPaths.map((path, index) => ({
      type: 'scatter3d',
      name: index === 0 ? 'Vertical slice' : `Vertical slice ${index + 1}`,
      mode: 'lines',
      x: path.map((point) => knm(point.Mx)),
      y: path.map((point) => knm(point.My)),
      z: path.map((point) => kn(point.P)),
      line: { color: '#7c3aed', width: 6 },
      hoverinfo: 'skip'
    }))

    const capacityTrace = activeTriangles
      ? {
        type: 'mesh3d',
        name: surfaceResistanceMode === 'design' ? 'Design surface' : 'Nominal surface',
        x: surfacePoints3d.map((point) => knm(point.Mx)),
        y: surfacePoints3d.map((point) => knm(point.My)),
        z: surfacePoints3d.map((point) => kn(point.P)),
        i: activeTriangles.map((triangle) => triangle.a),
        j: activeTriangles.map((triangle) => triangle.b),
        k: activeTriangles.map((triangle) => triangle.c),
        intensity: surfacePoints3d.map((point) => kn(point.P)),
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
        hovertemplate: `P=%{z:.1f} kN<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>${
          surfaceResistanceMode === 'design' ? 'Design' : 'Nominal'
        } surface</extra>`
      }
      : {
        type: 'surface',
        name: surfaceResistanceMode === 'design' ? 'Design surface' : 'Nominal surface',
        x,
        y,
        z,
        customdata,
        colorscale: fieldColorscale,
        opacity: 0.72,
        colorbar: { title: 'P (kN)', thickness: 15, len: 0.72, x: 1.02, xpad: 4, tickfont: { size: 10 } },
        hovertemplate: `P=%{z:.1f} kN<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>${surfaceResistanceMode === 'design' ? 'Design' : 'Nominal'} surface</extra>`
      }

    return [
      capacityTrace,
      verticalPlane,
      fixedPPlane,
      ...sliceTraces,
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
    includeOppositeMoment,
    loadcases,
    selectedLoadcaseId,
    surface,
    surfaceBounds3d,
    surfaceContour3d,
    surfaceGrid,
    surfacePoints3d,
    surfaceResistanceMode
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
            gridcolor: plotPalette.grid,
            zerolinecolor: plotPalette.zeroLine,
            tickfont: { size: 10, color: plotPalette.text }
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
  }, [plotPalette, plotTheme, showSceneAxes])

  const contourData = useMemo(() => {
    const nominalOnly = showNominalReference && !showDesignResistance
    const activeSamples = nominalOnly ? nominalStrainAngleSamples : strainAngleSamples
    const closedX = [...contour.map((point) => knm(point.Mx))]
    const closedY = [...contour.map((point) => knm(point.My))]
    if (contour[0]) {
      closedX.push(knm(contour[0].Mx))
      closedY.push(knm(contour[0].My))
    }
    const nominalClosedX = [...nominalContour.map((point) => knm(point.Mx))]
    const nominalClosedY = [...nominalContour.map((point) => knm(point.My))]
    if (nominalContour[0]) {
      nominalClosedX.push(knm(nominalContour[0].Mx))
      nominalClosedY.push(knm(nominalContour[0].My))
    }
    const rayRadius = Math.max(...contour.map((point) => knm(Math.hypot(point.Mx, point.My))), 1) * 1.18
    const radialX = activeSamples.flatMap((point) => [0, rayRadius * Math.cos(point.beta), null])
    const radialY = activeSamples.flatMap((point) => [0, rayRadius * Math.sin(point.beta), null])
    const demandGuideX = demandProjection
      ? [demandProjection.mx, demandProjection.mx, null, 0, demandProjection.mx]
      : []
    const demandGuideY = demandProjection
      ? [0, demandProjection.my, null, demandProjection.my, demandProjection.my]
      : []

    return [
      ...(showFixedPAngleRays
        ? [
            {
              type: 'scatter',
              name: 'Moment angle rays',
              mode: 'lines',
              x: radialX,
              y: radialY,
              line: { color: plotPalette.guide, width: 1, dash: 'dot' },
              hoverinfo: 'skip'
            }
          ]
        : []),
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
      ...(showNominalReference
        ? [{
            type: 'scatter',
            name: 'Nominal reference',
            mode: 'lines',
            x: nominalClosedX,
            y: nominalClosedY,
            line: nominalOnly
              ? { color: plotPalette.primary, width: 2.6, shape: 'linear', simplify: false }
              : { color: plotPalette.guide, width: 1.8, dash: 'dash', shape: 'linear', simplify: false },
            connectgaps: false,
            hovertemplate:
              'Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>Nominal reference</extra>'
          }]
        : []),
      ...(showDesignResistance
        ? [{
            type: 'scatter',
            name: `Design · P = ${fmt(activeFixedPKn, 1)} kN`,
            mode: 'lines',
            x: closedX,
            y: closedY,
            line: { color: plotPalette.primary, width: 2.6, shape: 'linear', simplify: false },
            connectgaps: false,
            hovertemplate:
              'Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>Design resistance</extra>'
          }]
        : []),
      ...(showDesignResistance || showNominalReference ? [{
        type: 'scatter',
        name: 'Strain-angle samples',
        mode: 'markers+text',
        x: activeSamples.map((point) => knm(point.Mx)),
        y: activeSamples.map((point) => knm(point.My)),
        text: activeSamples.map((point) => `${fmt((point.beta * 180) / Math.PI, 0)}°`),
        textposition: 'top center',
        textfont: {
          size: 10,
          color: plotPalette.calloutText,
          family: 'IBM Plex Sans, system-ui, sans-serif'
        },
        marker: {
          size: 8.5,
          color: '#ef4444',
          symbol: 'circle',
          line: { color: plotPalette.markerOutline, width: 1 }
        },
        customdata: activeSamples.map((point) => [
          (() => {
            const betaDeg = (point.beta * 180) / Math.PI
            return fmt(betaDeg, 0)
          })(),
          (() => {
            const betaDeg = (point.beta * 180) / Math.PI
            return fmt(strainDirectionToNeutralAxisAngleDeg(betaDeg), 1)
          })(),
          (() => {
            const angle = perpendicularBendingAxisAngleDeg(point.Mx, point.My)
            return angle == null ? 'n/a' : fmt(angle, 1)
          })(),
          (() => {
            const betaDeg = (point.beta * 180) / Math.PI
            const reference = perpendicularBendingAxisAngleDeg(point.Mx, point.My)
            return reference == null
              ? 'n/a'
              : fmt(
                  lineAngleDifferenceDeg(
                    strainDirectionToNeutralAxisAngleDeg(betaDeg),
                    reference
                  ),
                  1
                )
          })()
        ]),
        hovertemplate:
          'Strain direction β=%{customdata[0]}°<br>N.A. axis αNA=%{customdata[1]}°<br>⊥ resultant α⊥=%{customdata[2]}°<br>Difference Δα=%{customdata[3]}°<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra></extra>'
      }] : []),
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
                line: { color: plotPalette.markerOutline, width: 1 }
              },
              customdata: [[demandProjection.name, demandProjection.p]],
              hovertemplate:
                '%{customdata[0]}<br>Mux=%{x:.1f} kN.m<br>Muy=%{y:.1f} kN.m<br>Pu=%{customdata[1]:.1f} kN<extra>Demand</extra>'
            }
          ]
        : [])
    ]
  }, [
    activeFixedPKn,
    contour,
    demandProjection,
    nominalContour,
    nominalStrainAngleSamples,
    plotPalette,
    showDesignResistance,
    showFixedPAngleRays,
    showNominalReference,
    strainAngleSamples
  ])

  const displayedStrainAngleSamples = showDesignResistance
    ? strainAngleSamples
    : nominalStrainAngleSamples

  const contourAxisRange = useMemo(() => {
    const points = [
      ...(showDesignResistance ? contour : []),
      ...displayedStrainAngleSamples,
      ...(showNominalReference ? nominalContour : [])
    ]
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
  }, [
    contour,
    demandProjection,
    displayedStrainAngleSamples,
    nominalContour,
    showDesignResistance,
    showNominalReference
  ])

  const contourLayout = useMemo(
    () => ({
      ...plotTheme,
      margin: { l: 44, r: 48, t: 18, b: 40 },
      xaxis: {
        title: '',
        zeroline: true,
        zerolinecolor: plotPalette.zeroLine,
        gridcolor: plotPalette.grid,
        automargin: false,
        range: contourAxisRange?.x,
        tickfont: { size: 10, color: plotPalette.text },
        tickcolor: plotPalette.tick,
        titlefont: { size: 11 }
      },
      yaxis: {
        title: '',
        zeroline: true,
        zerolinecolor: plotPalette.zeroLine,
        gridcolor: plotPalette.grid,
        scaleanchor: 'x',
        automargin: false,
        range: contourAxisRange?.y,
        tickfont: { size: 10, color: plotPalette.text },
        tickcolor: plotPalette.tick
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
          font: { size: 11, color: plotPalette.mutedText }
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
          font: { size: 11, color: plotPalette.mutedText }
        }
      ],
      hovermode: 'closest',
      clickmode: 'event+select',
      showlegend: false
    }),
    [contourAxisRange, plotPalette, plotTheme]
  )

  const verticalSlice = useMemo(() => {
    const empty = {
      primaryPath: [] as Array<{ m: number; p: number; station: number }>,
      oppositePath: [] as Array<{ m: number; p: number; station: number }>,
      displayPaths: [] as Array<Array<{ m: number; p: number; station: number }>>,
      closed: true,
      stations: [] as Array<{ m: number; p: number; station: number }>,
      keys: [] as Array<{ m: number; p: number; station: number; label: string; side: 'primary' | 'opposite' }>
    }
    if (!surface || surfaceGrid.length === 0) return empty

    const theta = (normalizeAngleDeg(activeAngle) * Math.PI) / 180
    const momentPlane = sliceMomentPlane(surface.points, theta, surface.triangles)
    const project = (point: PreviewMomentPlanePoint) => ({
      m: knm(point.M),
      p: kn(point.P),
      station: point.station ?? -1
    })

    const primaryPaths = clipMomentPlanePaths(momentPlane, 'positive')
    const oppositePaths = includeOppositeMoment ? clipMomentPlanePaths(momentPlane, 'negative') : []
    const primaryPath = primaryPaths.flat().map(project)
    const oppositePath = oppositePaths.flat().map(project)
    const displayPaths = (
      includeOppositeMoment ? momentPlane.map((path) => path.points) : primaryPaths
    ).map((path) => path.map(project))

    const pickKeys = (
      curve: Array<{ m: number; p: number; station: number }>,
      side: 'primary' | 'opposite'
    ) =>
      (surface?.stations ?? []).flatMap((descriptor, station) => {
        const definition = descriptor.definition
        if (
          definition.kind !== 'steel-stress-ratio' ||
          (Math.abs(definition.ratio) > 1e-12 && Math.abs(definition.ratio - 1) > 1e-12)
        ) {
          return []
        }
        const label = descriptor.label
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
      (surface?.stations ?? []).flatMap((_, station) => {
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

    return { primaryPath, oppositePath, displayPaths, closed: momentPlane.every((path) => path.closed), stations, keys }
  }, [activeAngle, includeOppositeMoment, surface, surfaceGrid])

  const nominalVerticalPaths = useMemo(() => {
    if (!surface) return [] as Array<Array<{ m: number; p: number; station: number }>>
    const theta = (normalizeAngleDeg(activeAngle) * Math.PI) / 180
    const momentPlane = sliceMomentPlane(surface.nominalPoints, theta, surface.nominalTriangles)
    const visible = includeOppositeMoment
      ? momentPlane.map((path) => path.points)
      : clipMomentPlanePaths(momentPlane, 'positive')
    return visible.map((path) =>
      path.map((point) => ({
        m: knm(point.M),
        p: kn(point.P),
        station: point.station ?? -1
      }))
    )
  }, [activeAngle, includeOppositeMoment, surface])

  const nominalVerticalAnnotations = useMemo(() => {
    const curve = nominalVerticalPaths.flat()
    const stations = (surface?.stations ?? []).flatMap((_, station) => {
      const point = curve
        .map((item) => ({ point: item, delta: Math.abs(item.station - station) }))
        .filter((item) => item.delta <= 0.35)
        .sort((a, b) => a.delta - b.delta)[0]?.point
      return point ? [{ ...point, station }] : []
    })
    const keys = (surface?.stations ?? []).flatMap((descriptor, station) => {
      const definition = descriptor.definition
      if (
        definition.kind !== 'steel-stress-ratio' ||
        (Math.abs(definition.ratio) > 1e-12 && Math.abs(definition.ratio - 1) > 1e-12)
      ) {
        return []
      }
      const point = curve
        .map((item) => ({ point: item, delta: Math.abs(item.station - station) }))
        .filter((item) => item.delta <= 0.25)
        .sort((a, b) => a.delta - b.delta)[0]?.point
      return point
        ? [{
            ...point,
            label: descriptor.label,
            side: point.m < 0 ? 'opposite' as const : 'primary' as const
          }]
        : []
    })
    return { stations, keys }
  }, [nominalVerticalPaths, surface])

  const verticalData = useMemo(() => {
    const nominalOnly = showNominalReference && !showDesignResistance
    const selectedStations = nominalOnly ? nominalVerticalAnnotations.stations : verticalSlice.stations
    const selectedKeys = nominalOnly ? nominalVerticalAnnotations.keys : verticalSlice.keys
    const primaryKeys = selectedKeys.filter((point) => point.side === 'primary')
    const oppositeKeys = selectedKeys.filter((point) => point.side === 'opposite')
    const keyRays = selectedKeys.flatMap((point) => [0, point.m, null])
    const keyRayP = selectedKeys.flatMap((point) => [0, point.p, null])
    const demandGuideM = demandProjection ? [demandProjection.m, demandProjection.m, null, 0, demandProjection.m] : []
    const demandGuideP = demandProjection ? [0, demandProjection.p, null, demandProjection.p, demandProjection.p] : []
    const primaryLine = {
      color: plotPalette.primary,
      width: 2.4,
      shape: 'linear',
      simplify: false
    }

    return [
      {
        type: 'scatter',
        name: 'Key station rays',
        mode: 'lines',
        x: keyRays,
        y: keyRayP,
        line: { color: plotPalette.guide, width: 1, dash: 'dot' },
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
      ...(showNominalReference
        ? nominalVerticalPaths.map((path, index) => ({
            type: 'scatter',
            name: index === 0 ? 'Nominal reference' : `Nominal loop ${index + 1}`,
            mode: 'lines',
            x: path.map((point) => point.m),
            y: path.map((point) => point.p),
            line: nominalOnly
              ? primaryLine
              : { color: plotPalette.guide, width: 1.8, dash: 'dash', shape: 'linear', simplify: false },
            connectgaps: false,
            hovertemplate: 'M=%{x:.1f} kN.m<br>P=%{y:.1f} kN<extra>Nominal reference</extra>'
          }))
        : []),
      ...(showDesignResistance ? verticalSlice.displayPaths.map((path, index) => ({
        type: 'scatter',
        name:
          index === 0
            ? includeOppositeMoment
              ? `Plane ${fmt(activeAngle, 0)} / ${fmt(normalizeAngleDeg(activeAngle + 180), 0)} deg`
              : `Angle ${fmt(activeAngle, 0)} deg`
            : `Section loop ${index + 1}`,
        mode: 'lines',
        x: path.map((point) => point.m),
        y: path.map((point) => point.p),
        line: primaryLine,
        connectgaps: false,
        marker: { size: 0 },
        hovertemplate: 'M=%{x:.1f} kN.m<br>P=%{y:.1f} kN<extra>Design resistance</extra>'
      })) : []),
      ...(showDesignResistance || showNominalReference ? [{
        type: 'scatter',
        name: 'Stations',
        mode: 'markers',
        x: selectedStations.map((point) => point.m),
        y: selectedStations.map((point) => point.p),
        marker: {
          size: 6,
          color: '#ef4444',
          symbol: 'circle',
          line: { color: plotPalette.markerOutline, width: 0.8 }
        },
        customdata: selectedStations.map((point) => point.station),
        hovertemplate: 'P%{customdata}<br>M=%{x:.1f} kN.m<br>P=%{y:.1f} kN<extra>Station</extra>'
      }] : []),
      ...(showDesignResistance || showNominalReference ? [{
        type: 'scatter',
        name: 'Key stations',
        mode: 'markers+text',
        x: primaryKeys.map((point) => point.m),
        y: primaryKeys.map((point) => point.p),
        text: primaryKeys.map((point) => point.label),
        textposition: 'top center',
        textfont: {
          size: 10,
          color: plotPalette.calloutText,
          family: 'IBM Plex Sans, system-ui, sans-serif'
        },
        marker: {
          size: 8.5,
          color: '#ef4444',
          symbol: 'circle',
          line: { color: plotPalette.markerOutline, width: 1 }
        },
        hovertemplate: '%{text}<br>M=%{x:.1f} kN.m<br>P=%{y:.1f} kN<extra></extra>'
      }] : []),
      ...((showDesignResistance || showNominalReference) && oppositeKeys.length > 0
        ? [
            {
              type: 'scatter',
              name: 'Opposite keys',
              mode: 'markers+text',
              x: oppositeKeys.map((point) => point.m),
              y: oppositeKeys.map((point) => point.p),
              text: oppositeKeys.map((point) => point.label),
              textposition: 'top center',
              textfont: {
                size: 10,
                color: plotPalette.calloutText,
                family: 'IBM Plex Sans, system-ui, sans-serif'
              },
              marker: {
                size: 8,
                color: '#ef4444',
                symbol: 'circle',
                line: { color: plotPalette.markerOutline, width: 1 }
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
                line: { color: plotPalette.markerOutline, width: 1 }
              },
              customdata: [[demandProjection.name, demandProjection.mx, demandProjection.my]],
              hovertemplate:
                '%{customdata[0]}<br>Mθ=%{x:.1f} kN.m<br>Pu=%{y:.1f} kN<br>Mux=%{customdata[1]:.1f} kN.m<br>Muy=%{customdata[2]:.1f} kN.m<extra>Demand</extra>'
            }
          ]
        : [])
    ]
  }, [
    activeAngle,
    demandProjection,
    nominalVerticalAnnotations,
    nominalVerticalPaths,
    plotPalette,
    showDesignResistance,
    showNominalReference,
    verticalSlice
  ])

  const verticalLayout = useMemo(
    () => ({
      ...plotTheme,
      margin: { l: 42, r: 52, t: 18, b: 36 },
      xaxis: {
        title: '',
        zeroline: true,
        zerolinecolor: plotPalette.zeroLine,
        gridcolor: plotPalette.grid,
        automargin: false,
        tickfont: { size: 10, color: plotPalette.text },
        ticks: 'outside',
        ticklen: 4,
        tickcolor: plotPalette.tick
      },
      yaxis: {
        title: '',
        zeroline: true,
        zerolinecolor: plotPalette.zeroLine,
        gridcolor: plotPalette.grid,
        automargin: false,
        tickfont: { size: 10, color: plotPalette.text },
        ticks: 'outside',
        ticklen: 4,
        tickcolor: plotPalette.tick
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
          font: { size: 11, color: plotPalette.mutedText }
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
          font: { size: 11, color: plotPalette.mutedText }
        }
      ],
      hovermode: 'closest',
      showlegend: false
    }),
    [plotPalette, plotTheme]
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

  const fieldAngleComparison = useMemo(
    () =>
      inverseResult
        ? sectionFieldAngleComparison(
            inverseResult.state,
            inverseResult.demand.Mx,
            inverseResult.demand.My
          )
        : null,
    [inverseResult]
  )

  const handleExcelExport = async () => {
    if (!selectedLoadcase || !surface) return
    const analysisOptions = surface.analysisOptions
    if (analysisOptions.methodId === 'equivalent-block-surface-v1') {
      setExportState('error')
      setExportMessage('Equivalent-block Excel audit export will use a dedicated block ledger; the fiber workbook is intentionally not reused.')
      return
    }
    setExportState('working')
    setExportMessage('')
    try {
      // The detail sheets audit a strain-gradient direction, not an N.A. line angle and not the
      // demand moment direction. The workbook derives and labels all three independently.
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
        designBasis,
        analysisOptions,
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
      if (Object.values(next).every((visible) => !visible)) return current
      if (!current[id] && Object.values(current).filter(Boolean).length >= MAX_VISIBLE_CHARTS) {
        const replacement = [...OVERVIEW_CHARTS]
          .reverse()
          .find((chartId) => chartId !== overviewPrimary && current[chartId])
        if (replacement) next[replacement] = false
      }
      if (!next[overviewPrimary]) {
        const fallback = OVERVIEW_CHARTS.find((key) => next[key])
        if (fallback) setOverviewPrimary(fallback)
      }
      return next
    })
  }

  const toggleLoadcaseVisible = (id: LoadcaseChartId) => {
    setLoadcaseVisible((current) => {
      const next = { ...current, [id]: !current[id] }
      if (Object.values(next).every((visible) => !visible)) return current
      if (!current[id] && Object.values(current).filter(Boolean).length >= MAX_VISIBLE_CHARTS) {
        const replacement = [...LOADCASE_CHARTS]
          .reverse()
          .find((chartId) => chartId !== loadcasePrimary && current[chartId])
        if (replacement) next[replacement] = false
      }
      if (!next[loadcasePrimary]) {
        const fallback = LOADCASE_CHARTS.find((key) => next[key])
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

  const hiddenOverview = OVERVIEW_CHARTS.filter((id) => !overviewVisible[id])
  const hiddenLoadcase = LOADCASE_CHARTS.filter((id) => !loadcaseVisible[id])

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
            meta: inverseResult ? solverStatus(inverseResult).label : 'Solving…',
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
                  Resultant
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
                      <strong
                        className={solverStatus(inverseResult).tone}
                        title={inverseResult.message}
                      >
                        {solverStatus(inverseResult).label}
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
                      <span>Fixed-P UR</span>
                      <strong>
                        {inverseResult.fixedPUtilization == null
                          ? 'n/a'
                          : fmt(inverseResult.fixedPUtilization, 3)}
                      </strong>
                    </div>
                    <div>
                      <span>Resistance</span>
                      <strong title={inverseResult.resistance?.classification ?? undefined}>
                        {inverseResult.resistance?.factor == null
                          ? 'Material design'
                          : `φ = ${fmt(inverseResult.resistance.factor, 3)}`}
                      </strong>
                    </div>
                    <div>
                      <span>Residual</span>
                      <strong>{sci(inverseResult.residualNorm, 2)}</strong>
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

                {inverseResult.equivalentBlock && (
                  <article className="pm-field-metric-card">
                    <header>Equivalent block</header>
                    <div className="pm-field-metric-rows">
                      <div><span>θ / c</span><strong>{fmt(inverseResult.equivalentBlock.neutralAxisAngle * 180 / Math.PI, 2)}° · {fmt(inverseResult.equivalentBlock.neutralAxisDepth, 2)} mm</strong></div>
                      <div><span>a = β1·c</span><strong>{fmt(inverseResult.equivalentBlock.blockDepth, 2)} mm</strong></div>
                      <div><span>β1 / Dθ</span><strong>{fmt(inverseResult.equivalentBlock.beta1, 3)} · {fmt(inverseResult.equivalentBlock.projectedSectionDepth, 2)} mm</strong></div>
                      <div><span>Concrete block stress</span><strong>{fmt(inverseResult.equivalentBlock.compressionStress, 3)} MPa</strong></div>
                      <div><span>Ac,block / Cc</span><strong>{inverseResult.equivalentBlock.concreteBlockArea == null ? 'n/a' : `${fmt(inverseResult.equivalentBlock.concreteBlockArea, 1)} mm²`} · {inverseResult.equivalentBlock.concreteForce == null ? 'n/a' : `${fmt(kn(inverseResult.equivalentBlock.concreteForce), 1)} kN`}</strong></div>
                      <div><span>εt / controlling bar</span><strong>{inverseResult.equivalentBlock.controllingTensileStrain == null ? 'n/a' : fmt(inverseResult.equivalentBlock.controllingTensileStrain, 6)} · {inverseResult.equivalentBlock.controllingBarId ?? 'n/a'}</strong></div>
                      <div><span>Component assembly residual</span><strong>{inverseResult.equivalentBlock.componentForceResidual == null ? 'n/a' : sci(inverseResult.equivalentBlock.componentForceResidual, 2)}</strong></div>
                      <div><span>Component Mx / My residual</span><strong>{inverseResult.equivalentBlock.componentMomentXResidual == null ? 'n/a' : sci(inverseResult.equivalentBlock.componentMomentXResidual, 2)} / {inverseResult.equivalentBlock.componentMomentYResidual == null ? 'n/a' : sci(inverseResult.equivalentBlock.componentMomentYResidual, 2)}</strong></div>
                    </div>
                  </article>
                )}

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
                      <span title="θM = atan2(My,Mx) in Mx-My action space; it is not an N.A. line angle.">
                        |M| / θM (M-space)
                      </span>
                      <strong title="The M-space angle is used for P-Mx-My demand queries, not for comparison with N.A.">
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

                <article className="pm-field-metric-card pm-field-metric-card--angles">
                  <header>Section-axis comparison</header>
                  <div className="pm-field-metric-rows">
                    <div title="Actual epsilon=0 neutral-axis line, measured CCW from section +x modulo 180 degrees.">
                      <span>N.A. axis αNA</span>
                      <strong>
                        {fieldAngleComparison?.neutralAxis == null
                          ? 'n/a'
                          : `${fmt(fieldAngleComparison.neutralAxis, 1)}°`}
                      </strong>
                    </div>
                    <div title="Reference line perpendicular to the in-section resultant direction (Muy,Mux).">
                      <span>Reference ⊥Rₘ α⊥</span>
                      <strong>
                        {fieldAngleComparison?.perpendicularBendingAxis == null
                          ? 'n/a'
                          : `${fmt(fieldAngleComparison.perpendicularBendingAxis, 1)}°`}
                      </strong>
                    </div>
                    <div title="Smallest angle between the actual N.A. and the perpendicular reference line.">
                      <span>Angular deviation Δα</span>
                      <strong>
                        {fieldAngleComparison?.difference == null
                          ? 'n/a'
                          : `${fmt(fieldAngleComparison.difference, 1)}°`}
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
              <>
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
                <label className={`pm-field-check${showFixedPAngleRays ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={showFixedPAngleRays}
                    onChange={(event) => setShowFixedPAngleRays(event.target.checked)}
                  />
                  Angle rays
                </label>
                <ResistanceVisibilityControls
                  showDesign={showDesignResistance}
                  showNominal={showNominalReference}
                  onShowDesign={setShowDesignResistance}
                  onShowNominal={setShowNominalReference}
                />
              </>
            ),
            children: <PlotlyChart data={contourData} layout={contourLayout} config={plotConfig} />
          })}

          {renderChartShell({
            id: 'vertical',
            title: 'Vertical slice',
            meta: `${fmt(activeAngle, 0)}°${verticalSlice.closed ? '' : ' · OPEN'}${
              axialCapPKn == null ? '' : ` · axial cap ${fmt(axialCapPKn, 0)} kN`
            }`,
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
                <ResistanceVisibilityControls
                  showDesign={showDesignResistance}
                  showNominal={showNominalReference}
                  onShowDesign={setShowDesignResistance}
                  onShowNominal={setShowNominalReference}
                />
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
          meta: `${fmt(sliceAngle, 0)}°${verticalSlice.closed ? '' : ' · OPEN'}${
            axialCapPKn == null ? '' : ` · axial cap ${fmt(axialCapPKn, 0)} kN`
          }`,
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
              <ResistanceVisibilityControls
                showDesign={showDesignResistance}
                showNominal={showNominalReference}
                onShowDesign={setShowDesignResistance}
                onShowNominal={setShowNominalReference}
              />
            </>
          ),
          children: <PlotlyChart data={verticalData} layout={verticalLayout} config={plotConfig} />
        })}

        {renderChartShell({
          id: 'surface3d',
          title: '3D P-Mx-My',
          meta: `${surfacePoints3d.length} pts · ${surfaceResistanceMode === 'design' ? 'Design' : 'Nominal'}`,
          primary: overviewPrimary === 'surface3d',
          visible: overviewVisible.surface3d,
          onMakePrimary: () => setOverviewPrimary('surface3d'),
          onToggleVisible: () => toggleOverviewVisible('surface3d'),
          controls: (
            <>
              <SurfaceResistanceControl
                value={surfaceResistanceMode}
                onChange={setSurfaceResistanceMode}
              />
              <label className={`pm-field-check${showSceneAxes ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={showSceneAxes}
                  onChange={(event) => setShowSceneAxes(event.target.checked)}
                />
                Axes
              </label>
            </>
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
            <>
              <SyncedControl
                label="P"
                value={Number(kn(fixedP).toFixed(1))}
                min={minPKn}
                max={maxPKn}
                step={Math.max(1, Math.round((maxPKn - minPKn) / 240))}
                unit="kN"
                onChange={(value) => onFixedPChange(value * 1000)}
              />
              <label className={`pm-field-check${showFixedPAngleRays ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={showFixedPAngleRays}
                  onChange={(event) => setShowFixedPAngleRays(event.target.checked)}
                />
                Angle rays
              </label>
              <ResistanceVisibilityControls
                showDesign={showDesignResistance}
                showNominal={showNominalReference}
                onShowDesign={setShowDesignResistance}
                onShowNominal={setShowNominalReference}
              />
            </>
          ),
          children: <PlotlyChart data={contourData} layout={contourLayout} config={plotConfig} />
        })}

      </div>
    </section>
  )
}
