'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, EyeOff, Loader2, Maximize2, RotateCw } from 'lucide-react'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { DesignBasis } from '@pm/design'
import {
  isEquivalentBlockProfileId,
  type EquivalentBlockAnalysisOptions,
  type LoadCombination
} from '@pm/project'
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
import { ExcelExportError, equivalentBlockWorkbookFileName, sectionWorkbookFileName } from '@pm/report'
import {
  buildSectionFieldMapAsync,
  exportEquivalentBlockWorkbookAsync,
  exportSectionWorkbookAsync,
  isAnalysisAbort
} from '../../../application/analysis/client'
import { PlotlyChart, type PlotlyClickPayload } from './PlotlyChart'
import {
  DEMAND_CHART_IDS,
  SECTION_CHART_IDS,
  sliceAngleMax,
  snapSliceAngleDeg,
  toggleChartVisibility,
  uniqueSurfaceDirectionAnglesDeg,
  directionAngleStepDeg,
  type DemandChartId,
  type DemandCheckView,
  type SectionChartId,
  type SectionResultsView,
  type SurfaceResistanceMode
} from './results-view'
import { SectionFieldChart } from './SectionFieldChart'
import {
  lineAngleDifferenceDeg,
  momentAngleDeg,
  perpendicularBendingAxisAngleDeg,
  sectionFieldAngleComparison,
  strainDirectionToNeutralAxisAngleDeg
} from './section-field-angles'

type ResultsViewMode = 'overview' | 'loadcase'
type ResultsTheme = 'light' | 'dark'


type Props = {
  theme: ResultsTheme
  ready: boolean
  /** A surface rebuild or a stage transition is in flight; the charts below are the previous ones. */
  busy: boolean
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
  view: SectionResultsView
  demandView: DemandCheckView
  onViewChange: (patch: Partial<SectionResultsView>) => void
  onDemandViewChange: (patch: Partial<DemandCheckView>) => void
  onSelectLoadcase: (id: number) => void
}

const SyncedControl = ({
  label,
  title,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange
}: {
  /** Compact visible label (e.g. φ, P). */
  label: string
  /** Full name shown on hover. */
  title?: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  disabled?: boolean
  onChange: (value: number) => void
}) => (
  <label className={`pm-synced-control${disabled ? ' is-locked' : ''}`} title={title ?? label}>
    <span className="pm-synced-control-label">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={Math.min(max, Math.max(min, value))}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-label={title ?? label}
    />
    <span className="pm-synced-control-value">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        aria-label={title ?? label}
      />
      <em>{unit}</em>
    </span>
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
    <label className={`pm-field-check${showDesign ? ' is-on' : ''}`} title="Design resistance">
      <input
        type="checkbox"
        checked={showDesign}
        onChange={(event) => {
          const next = event.target.checked
          if (next || showNominal) onShowDesign(next)
        }}
      />
      Mr
    </label>
    <label className={`pm-field-check${showNominal ? ' is-on' : ''}`} title="Nominal reference">
      <input
        type="checkbox"
        checked={showNominal}
        onChange={(event) => {
          const next = event.target.checked
          if (next || showDesign) onShowNominal(next)
        }}
      />
      Mn
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
    <label className={value === 'design' ? 'is-active' : ''} title="Design resistance surface">
      <input
        type="radio"
        name="surface-resistance"
        value="design"
        checked={value === 'design'}
        onChange={() => onChange('design')}
      />
      Mr
    </label>
    <label className={value === 'nominal' ? 'is-active' : ''} title="Nominal reference surface">
      <input
        type="radio"
        name="surface-resistance"
        value="nominal"
        checked={value === 'nominal'}
        onChange={() => onChange('nominal')}
      />
      Mn
    </label>
  </fieldset>
)

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

/**
 * Says plainly that the plots below are the previous surface.
 *
 * Keeping the old charts on screen during a rebuild is better than blanking them, but only if the
 * user is told; otherwise a stale plot is indistinguishable from a fresh one.
 */
const StaleBanner = () => (
  <div className="pm-results-stale" role="status">
    <Loader2 size={13} className="pm-spin" />
    <span>Recalculating — the charts below are the previous result.</span>
  </div>
)

export function ResultsWorkspace({
  theme,
  ready,
  busy,
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
  view,
  demandView,
  onViewChange,
  onDemandViewChange,
  onSelectLoadcase
}: Props) {
  const [exportState, setExportState] = useState<'idle' | 'working' | 'error'>('idle')
  const [exportMessage, setExportMessage] = useState('')
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
  const activeAngle = isLoadcaseMode ? loadcaseAngleDeg(selectedLoadcase) : view.sliceAngle
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

  const activeFixedPKn = kn(activeFixedP)
  const minPKn = surface ? kn(surface.bounds.P[0]) : 0
  const maxPKn = surface ? kn(surface.bounds.P[1]) : 0
  const surfaceDirectionAnglesDeg = useMemo(
    () => (surface ? uniqueSurfaceDirectionAnglesDeg(surface.points.map((point) => point.beta)) : []),
    [surface]
  )
  const angleSliderStep = directionAngleStepDeg(surfaceDirectionAnglesDeg)
  const angleSliderMax = sliceAngleMax(view, surfaceDirectionAnglesDeg, angleSliderStep)
  const setSliceAngle = (value: number) => {
    onViewChange({
      sliceAngle: snapSliceAngleDeg(value, surfaceDirectionAnglesDeg, angleSliderMax, angleSliderStep)
    })
  }

  const setResistanceVisibility = (
    patch: Partial<Pick<SectionResultsView, 'showDesignResistance' | 'showNominalReference'>>
  ) => {
    const next = { ...view, ...patch }
    if (!next.showDesignResistance && !next.showNominalReference) return
    onViewChange(patch)
  }

  const toggleSectionChart = (id: SectionChartId) => {
    onViewChange(toggleChartVisibility(view, SECTION_CHART_IDS, id))
  }

  const toggleDemandChart = (id: DemandChartId) => {
    onDemandViewChange(toggleChartVisibility(demandView, DEMAND_CHART_IDS, id))
  }

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
        ? view.surfaceResistanceMode === 'design'
          ? surface.points
          : surface.nominalPoints
        : [],
    [surface, view.surfaceResistanceMode]
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
      view.surfaceResistanceMode === 'design' ? surface?.triangles : surface?.nominalTriangles
    ),
    [activeFixedP, surface, surfacePoints3d, view.surfaceResistanceMode]
  )

  /** Drawing the opposite half already covers angles past 180°, so the slider range halves with it. */
  useEffect(() => {
    if (!view.includeOppositeMoment) return
    const wrapped = normalizeAngleDeg(view.sliceAngle)
    if (wrapped > 180) {
      onViewChange({
        sliceAngle: snapSliceAngleDeg(
          wrapped - 180,
          surfaceDirectionAnglesDeg,
          180,
          angleSliderStep
        )
      })
    }
  }, [
    angleSliderStep,
    onViewChange,
    surfaceDirectionAnglesDeg,
    view.includeOppositeMoment,
    view.sliceAngle
  ])

  /** Keep the stored angle on a solved direction once the surface (and its β ring) is known. */
  useEffect(() => {
    if (surfaceDirectionAnglesDeg.length === 0) return
    const snapped = snapSliceAngleDeg(
      view.sliceAngle,
      surfaceDirectionAnglesDeg,
      angleSliderMax,
      angleSliderStep
    )
    if (Math.abs(snapped - view.sliceAngle) > 1e-6) onViewChange({ sliceAngle: snapped })
  }, [
    angleSliderMax,
    angleSliderStep,
    onViewChange,
    surfaceDirectionAnglesDeg,
    view.sliceAngle
  ])


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
    const m0 = view.includeOppositeMoment ? -radius : 0
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

    const activeTriangles = view.surfaceResistanceMode === 'design' ? surface.triangles : surface.nominalTriangles
    const momentPlanePaths = sliceMomentPlane(surfacePoints3d, theta, activeTriangles)
    const visibleMomentPaths = view.includeOppositeMoment
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
        name: view.surfaceResistanceMode === 'design' ? 'Design surface' : 'Nominal surface',
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
          view.surfaceResistanceMode === 'design' ? 'Design' : 'Nominal'
        } surface</extra>`
      }
      : {
        type: 'surface',
        name: view.surfaceResistanceMode === 'design' ? 'Design surface' : 'Nominal surface',
        x,
        y,
        z,
        customdata,
        colorscale: fieldColorscale,
        opacity: 0.72,
        colorbar: { title: 'P (kN)', thickness: 15, len: 0.72, x: 1.02, xpad: 4, tickfont: { size: 10 } },
        hovertemplate: `P=%{z:.1f} kN<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>${view.surfaceResistanceMode === 'design' ? 'Design' : 'Nominal'} surface</extra>`
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
    view.includeOppositeMoment,
    loadcases,
    selectedLoadcaseId,
    surface,
    surfaceBounds3d,
    surfaceContour3d,
    surfaceGrid,
    surfacePoints3d,
    view.surfaceResistanceMode
  ])

  const surfaceLayout = useMemo(() => {
    const axis = (title: string) =>
      view.showSceneAxes
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
      margin: { l: 0, r: view.showSceneAxes ? 28 : 8, t: 2, b: 0 },
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
  }, [plotPalette, plotTheme, view.showSceneAxes])

  const contourData = useMemo(() => {
    const nominalOnly = view.showNominalReference && !view.showDesignResistance
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
      ...(view.showFixedPAngleRays
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
      ...(view.showNominalReference
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
      ...(view.showDesignResistance
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
      ...(view.showDesignResistance || view.showNominalReference ? [{
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
    view.showDesignResistance,
    view.showFixedPAngleRays,
    view.showNominalReference,
    strainAngleSamples
  ])

  const displayedStrainAngleSamples = view.showDesignResistance
    ? strainAngleSamples
    : nominalStrainAngleSamples

  const contourAxisRange = useMemo(() => {
    const points = [
      ...(view.showDesignResistance ? contour : []),
      ...displayedStrainAngleSamples,
      ...(view.showNominalReference ? nominalContour : [])
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
    view.showDesignResistance,
    view.showNominalReference
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
    const oppositePaths = view.includeOppositeMoment ? clipMomentPlanePaths(momentPlane, 'negative') : []
    const primaryPath = primaryPaths.flat().map(project)
    const oppositePath = oppositePaths.flat().map(project)
    const displayPaths = (
      view.includeOppositeMoment ? momentPlane.map((path) => path.points) : primaryPaths
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
      ...(view.includeOppositeMoment
        ? pickKeys(oppositePath, 'opposite').filter((item) => Math.abs(item.m) > 1e-6)
        : [])
    ]
    const stations =
      view.includeOppositeMoment && oppositePath.length > 0
        ? [...pickStations(primaryPath), ...pickStations(oppositePath).filter((item) => Math.abs(item.m) > 1e-6)]
        : pickStations(primaryPath)

    return { primaryPath, oppositePath, displayPaths, closed: momentPlane.every((path) => path.closed), stations, keys }
  }, [activeAngle, view.includeOppositeMoment, surface, surfaceGrid])

  const nominalVerticalPaths = useMemo(() => {
    if (!surface) return [] as Array<Array<{ m: number; p: number; station: number }>>
    const theta = (normalizeAngleDeg(activeAngle) * Math.PI) / 180
    const momentPlane = sliceMomentPlane(surface.nominalPoints, theta, surface.nominalTriangles)
    const visible = view.includeOppositeMoment
      ? momentPlane.map((path) => path.points)
      : clipMomentPlanePaths(momentPlane, 'positive')
    return visible.map((path) =>
      path.map((point) => ({
        m: knm(point.M),
        p: kn(point.P),
        station: point.station ?? -1
      }))
    )
  }, [activeAngle, view.includeOppositeMoment, surface])

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
    const nominalOnly = view.showNominalReference && !view.showDesignResistance
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
      ...(view.showNominalReference
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
      ...(view.showDesignResistance ? verticalSlice.displayPaths.map((path, index) => ({
        type: 'scatter',
        name:
          index === 0
            ? view.includeOppositeMoment
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
      ...(view.showDesignResistance || view.showNominalReference ? [{
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
      ...(view.showDesignResistance || view.showNominalReference ? [{
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
      ...((view.showDesignResistance || view.showNominalReference) && oppositeKeys.length > 0
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
    view.showDesignResistance,
    view.showNominalReference,
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

  /**
   * The block route has its own ledger workbook. It is a separate builder rather than a branch
   * inside the fibre one because the two mechanics share inputs, not sheets: there is no
   * integration mesh to audit here, and the concrete resultant comes from a clipped polygon.
   */
  const exportBlockWorkbook = async (analysisOptions: EquivalentBlockAnalysisOptions) => {
    if (!selectedLoadcase || !surface) return
    const profileId = surface.calculationProfileId
    if (!profileId || !isEquivalentBlockProfileId(profileId)) {
      setExportState('error')
      setExportMessage('The current result was not produced by an equivalent-block profile, so the block workbook cannot describe it.')
      return
    }
    setExportState('working')
    setExportMessage('')
    try {
      // The block ledger audits a block-normal direction. Prefer the solved state's own direction
      // so the exported stations bracket the governing one.
      const thetaDeg = inverseResult?.equivalentBlock
        ? normalizeAngleDeg((inverseResult.equivalentBlock.neutralAxisAngle * 180) / Math.PI)
        : activeAngle
      const payload = {
        projectName,
        sectionName: section.name,
        calculationProfileId: profileId,
        section,
        rebars,
        materialStore,
        designBasis,
        analysisOptions,
        thetaDeg,
        fixedP: activeFixedP,
        loadcase: selectedLoadcase
      }
      const blob = await exportEquivalentBlockWorkbookAsync(payload)
      const name = equivalentBlockWorkbookFileName(payload)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name
      anchor.click()
      URL.revokeObjectURL(url)
      setExportState('idle')
      setExportMessage(`Saved ${name}`)
    } catch (error) {
      setExportState('error')
      setExportMessage(
        error instanceof ExcelExportError
          ? error.message
          : `Export failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  const handleExcelExport = async () => {
    if (!selectedLoadcase || !surface) return
    const analysisOptions = surface.analysisOptions
    if (analysisOptions.methodId === 'equivalent-block-surface-v1') {
      await exportBlockWorkbook(analysisOptions)
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

  if (!ready) {
    return (
      <section className="pm-results-empty">
        <RotateCw size={28} />
        <h2>Apply geometry and reinforcement first</h2>
        <p>Results need an applied section before charts and loadcase checks can run.</p>
      </section>
    )
  }

  /**
   * Chart frame: one compact header row — abbreviated controls with full names on hover.
   */
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
        <div className="pm-results-plot-chrome">
          <div className="pm-results-plot-heading">
            <span>{title}</span>
            {meta ? <strong>{meta}</strong> : null}
          </div>
          <div className="pm-results-plot-tools" role="group" aria-label="Chart layout">
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
          {controls ? <div className="pm-results-plot-actions">{controls}</div> : null}
        </div>
        <div className="pm-results-plot-body">
          <div className="pm-results-plot-canvas">{children}</div>
          {footer}
        </div>
      </article>
    )
  }

  /**
   * Demand Check with nothing selected must not fall through to the capacity charts: those belong
   * to Section Results only.
   */
  if (viewMode === 'loadcase' && !selectedLoadcase) {
    return (
      <section className="pm-results-empty">
        <RotateCw size={28} />
        <h2>Select a load combination</h2>
        <p>
          {loadcases.length === 0
            ? 'Add a factored ULS combination in the sidebar to check it against the design surface.'
            : 'Pick a combination from the list in the sidebar to solve and inspect its governing check.'}
        </p>
      </section>
    )
  }

  if (isLoadcaseMode && selectedLoadcase) {
    return (
      <section className="pm-results-stage pm-results-stage--charts-only">
        {busy ? <StaleBanner /> : null}
        <div className="pm-results-toolbar">
          <div className="pm-results-export" role="toolbar" aria-label="Export results">
            <button
              type="button"
              className="pm-export-button"
              onClick={handleExcelExport}
              disabled={exportState === 'working' || !surface}
              title="Export the full section calculation to Excel, with live formulas"
            >
              {exportState === 'working' ? <Loader2 size={14} className="pm-spin" /> : <Download size={14} />}
              {exportState === 'working' ? 'Building…' : 'Excel'}
            </button>
            {exportMessage ? (
              <span className={`pm-export-message${exportState === 'error' ? ' is-error' : ''}`} role="status">
                {exportMessage}
              </span>
            ) : null}
          </div>
        </div>


        <div
          className={`pm-results-grid pm-results-grid--dynamic primary-${demandView.primaryChart} count-${
            Object.values(demandView.visibleCharts).filter(Boolean).length
          }`}
        >
          {renderChartShell({
            id: 'heatmap',
            title: 'Section field',
            meta: inverseResult ? solverStatus(inverseResult).label : 'Solving…',
            primary: demandView.primaryChart === 'heatmap',
            visible: demandView.visibleCharts.heatmap,
            onMakePrimary: () => onDemandViewChange({ primaryChart: 'heatmap' }),
            onToggleVisible: () => toggleDemandChart('heatmap'),
            controls: (
              <div className="pm-section-field-toolbar" role="group" aria-label="Section field options">
                <div className="pm-field-mode-toggle" role="group" aria-label="Field mode">
                  <button
                    type="button"
                    className={demandView.fieldMode === 'strain' ? 'is-active' : ''}
                    title="Strain field"
                    onClick={() => onDemandViewChange({ fieldMode: 'strain' })}
                  >
                    ε
                  </button>
                  <button
                    type="button"
                    className={demandView.fieldMode === 'stress' ? 'is-active' : ''}
                    title="Stress field"
                    onClick={() => onDemandViewChange({ fieldMode: 'stress' })}
                  >
                    σ
                  </button>
                </div>
                <label
                  className={`pm-field-check${demandView.showNeutralAxis ? ' is-on' : ''}`}
                  title="Neutral axis"
                >
                  <input
                    type="checkbox"
                    checked={demandView.showNeutralAxis}
                    onChange={(event) => onDemandViewChange({ showNeutralAxis: event.target.checked })}
                  />
                  N.A.
                </label>
                <label
                  className={`pm-field-check${demandView.showMoments ? ' is-on' : ''}`}
                  title="Resultant"
                >
                  <input
                    type="checkbox"
                    checked={demandView.showMoments}
                    onChange={(event) => onDemandViewChange({ showMoments: event.target.checked })}
                  />
                  R
                </label>
                <label
                  className={`pm-field-check${demandView.includeRebar ? ' is-on' : ''}`}
                  title="Rebar"
                >
                  <input
                    type="checkbox"
                    checked={demandView.includeRebar}
                    onChange={(event) => onDemandViewChange({ includeRebar: event.target.checked })}
                  />
                  As
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
                fieldMode={demandView.fieldMode}
                state={inverseResult.state}
                Mx={inverseResult.demand.Mx}
                My={inverseResult.demand.My}
                showNeutralAxis={demandView.showNeutralAxis}
                showMoments={demandView.showMoments}
                includeRebar={demandView.includeRebar}
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
            meta: `P = ${fmt(activeFixedPKn, 1)} kN`,
            primary: demandView.primaryChart === 'fixedP',
            visible: demandView.visibleCharts.fixedP,
            onMakePrimary: () => onDemandViewChange({ primaryChart: 'fixedP' }),
            onToggleVisible: () => toggleDemandChart('fixedP'),
            controls: (
              <>
                <SyncedControl
                  label="P"
                  title="Axial force"
                  value={Number(activeFixedPKn.toFixed(1))}
                  min={minPKn}
                  max={maxPKn}
                  step={Math.max(1, Math.round((maxPKn - minPKn) / 240))}
                  unit="kN"
                  disabled
                  onChange={() => undefined}
                />
                <label
                  className={`pm-field-check${view.showFixedPAngleRays ? ' is-on' : ''}`}
                  title="Angle rays"
                >
                  <input
                    type="checkbox"
                    checked={view.showFixedPAngleRays}
                    onChange={(event) => onViewChange({ showFixedPAngleRays: event.target.checked })}
                  />
                  Rays
                </label>
                <ResistanceVisibilityControls
                  showDesign={view.showDesignResistance}
                  showNominal={view.showNominalReference}
                  onShowDesign={(showDesignResistance) => setResistanceVisibility({ showDesignResistance })}
                  onShowNominal={(showNominalReference) => setResistanceVisibility({ showNominalReference })}
                />
              </>
            ),
            children: <PlotlyChart data={contourData} layout={contourLayout} config={plotConfig} />
          })}

          {renderChartShell({
            id: 'vertical',
            title: 'Vertical slice',
            meta: axialCapPKn == null ? undefined : `P = ${fmt(axialCapPKn, 0)} kN`,
            primary: demandView.primaryChart === 'vertical',
            visible: demandView.visibleCharts.vertical,
            onMakePrimary: () => onDemandViewChange({ primaryChart: 'vertical' }),
            onToggleVisible: () => toggleDemandChart('vertical'),
            controls: (
              <>
                <SyncedControl
                  label="φ"
                  title="Angle"
                  value={Number(activeAngle.toFixed(0))}
                  min={0}
                  max={360}
                  step={1}
                  unit="deg"
                  disabled
                  onChange={() => undefined}
                />
                <label
                  className={`pm-field-check${view.includeOppositeMoment ? ' is-on' : ''}`}
                  title="Opposite half"
                >
                  <input
                    type="checkbox"
                    checked={view.includeOppositeMoment}
                    onChange={(event) => onViewChange({ includeOppositeMoment: event.target.checked })}
                  />
                  Opp
                </label>
                <ResistanceVisibilityControls
                  showDesign={view.showDesignResistance}
                  showNominal={view.showNominalReference}
                  onShowDesign={(showDesignResistance) => setResistanceVisibility({ showDesignResistance })}
                  onShowNominal={(showNominalReference) => setResistanceVisibility({ showNominalReference })}
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
      {busy ? <StaleBanner /> : null}

      <div
        className={`pm-results-grid pm-results-grid--dynamic primary-${view.primaryChart} count-${
          Object.values(view.visibleCharts).filter(Boolean).length
        }`}
      >
        {renderChartShell({
          id: 'vertical',
          title: 'Vertical slice',
          meta: axialCapPKn == null ? undefined : `P = ${fmt(axialCapPKn, 0)} kN`,
          primary: view.primaryChart === 'vertical',
          visible: view.visibleCharts.vertical,
          onMakePrimary: () => onViewChange({ primaryChart: 'vertical' }),
          onToggleVisible: () => toggleSectionChart('vertical'),
          controls: (
            <>
              <SyncedControl
                label="φ"
                title="Angle"
                value={view.sliceAngle}
                min={0}
                max={angleSliderMax}
                step={angleSliderStep}
                unit="deg"
                onChange={setSliceAngle}
              />
              <label
                className={`pm-field-check${view.includeOppositeMoment ? ' is-on' : ''}`}
                title="Opposite half"
              >
                <input
                  type="checkbox"
                  checked={view.includeOppositeMoment}
                  onChange={(event) => onViewChange({ includeOppositeMoment: event.target.checked })}
                />
                Opp
              </label>
              <ResistanceVisibilityControls
                showDesign={view.showDesignResistance}
                showNominal={view.showNominalReference}
                onShowDesign={(showDesignResistance) => setResistanceVisibility({ showDesignResistance })}
                onShowNominal={(showNominalReference) => setResistanceVisibility({ showNominalReference })}
              />
            </>
          ),
          children: <PlotlyChart data={verticalData} layout={verticalLayout} config={plotConfig} />
        })}

        {renderChartShell({
          id: 'surface3d',
          title: '3D P-Mx-My',
          meta: `${surfacePoints3d.length} pts · ${view.surfaceResistanceMode === 'design' ? 'Mr' : 'Mn'}`,
          primary: view.primaryChart === 'surface3d',
          visible: view.visibleCharts.surface3d,
          onMakePrimary: () => onViewChange({ primaryChart: 'surface3d' }),
          onToggleVisible: () => toggleSectionChart('surface3d'),
          controls: (
            <>
              <SurfaceResistanceControl
                value={view.surfaceResistanceMode}
                onChange={(surfaceResistanceMode) => onViewChange({ surfaceResistanceMode })}
              />
              <label
                className={`pm-field-check${view.showSceneAxes ? ' is-on' : ''}`}
                title="Scene axes"
              >
                <input
                  type="checkbox"
                  checked={view.showSceneAxes}
                  onChange={(event) => onViewChange({ showSceneAxes: event.target.checked })}
                />
                XYZ
              </label>
            </>
          ),
          children: <PlotlyChart data={surfaceData} layout={surfaceLayout} config={plotConfig} onClick={handle3dClick} />
        })}

        {renderChartShell({
          id: 'fixedP',
          title: 'Fixed-P Mx-My',
          meta: `P = ${fmt(kn(fixedP), 1)} kN`,
          primary: view.primaryChart === 'fixedP',
          visible: view.visibleCharts.fixedP,
          onMakePrimary: () => onViewChange({ primaryChart: 'fixedP' }),
          onToggleVisible: () => toggleSectionChart('fixedP'),
          controls: (
            <>
              <SyncedControl
                label="P"
                title="Axial force"
                value={Number(kn(fixedP).toFixed(1))}
                min={minPKn}
                max={maxPKn}
                step={Math.max(1, Math.round((maxPKn - minPKn) / 240))}
                unit="kN"
                onChange={(value) => onFixedPChange(value * 1000)}
              />
              <label
                className={`pm-field-check${view.showFixedPAngleRays ? ' is-on' : ''}`}
                title="Angle rays"
              >
                <input
                  type="checkbox"
                  checked={view.showFixedPAngleRays}
                  onChange={(event) => onViewChange({ showFixedPAngleRays: event.target.checked })}
                />
                Rays
              </label>
              <ResistanceVisibilityControls
                showDesign={view.showDesignResistance}
                showNominal={view.showNominalReference}
                onShowDesign={(showDesignResistance) => setResistanceVisibility({ showDesignResistance })}
                onShowNominal={(showNominalReference) => setResistanceVisibility({ showNominalReference })}
              />
            </>
          ),
          children: <PlotlyChart data={contourData} layout={contourLayout} config={plotConfig} />
        })}

      </div>
    </section>
  )
}
