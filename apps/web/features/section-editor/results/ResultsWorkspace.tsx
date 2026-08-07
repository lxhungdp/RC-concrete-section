'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  activeDesignDirectionPoints,
  activeDesignSurfaceDataset,
  activeNominalDirectionPoints,
  activeNominalSurfaceDataset,
  contourStrainAngleSamples,
  sliceFixedPContour,
  strainGradientDirection,
  type ExactDirectionCurve,
  type InversePreviewResult,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type SectionFieldMap
} from '@pm/analysis'
import { ExcelExportError, equivalentBlockWorkbookFileName, sectionWorkbookFileName } from '@pm/report'
import {
  buildSectionFieldMapAsync,
  buildExactDirectionCurveAsync,
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
import {
  buildDirectMeridianSection,
  buildClosedSurfaceTriangles,
  isMeridianOrParallelEdge,
  triangulatePlanarPolygon
} from './surface-plot-geometry'

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
  exactDirectionCurve: ExactDirectionCurve | null
  onExactDirectionCurveChange: (curve: ExactDirectionCurve | null) => void
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
  inputValue,
  inputStep,
  inputDisabled,
  inputWorking,
  onInputChange,
  onInputCommit,
  onInputBlur,
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
  inputValue?: string
  inputStep?: number | 'any'
  inputDisabled?: boolean
  inputWorking?: boolean
  onInputChange?: (value: string) => void
  onInputCommit?: () => void
  onInputBlur?: () => void
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
        step={inputStep ?? step}
        value={inputValue ?? (Number.isFinite(value) ? value : 0)}
        disabled={disabled || inputDisabled}
        onChange={(event) => {
          if (onInputChange) onInputChange(event.target.value)
          else onChange(Number(event.target.value) || 0)
        }}
        onBlur={onInputBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onInputCommit) {
            event.preventDefault()
            onInputCommit()
          }
        }}
        aria-label={title ?? label}
      />
      {inputWorking ? <Loader2 size={11} className="pm-spin" aria-hidden="true" /> : null}
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
    surfaceWireframe: 'rgba(71, 85, 105, 0.62)',
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
    surfaceWireframe: 'rgba(203, 213, 225, 0.46)',
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
  for (const point of points) {
    if (point.onSampledDirection === false) continue
    groups.set(point.beta, [...(groups.get(point.beta) ?? []), point])
  }
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
  exactDirectionCurve,
  onExactDirectionCurveChange,
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
  const [exactAngleDraft, setExactAngleDraft] = useState(() => String(view.sliceAngle))
  const [exactCurveWorking, setExactCurveWorking] = useState(false)
  const [exactCurveMessage, setExactCurveMessage] = useState('')
  const [demandExactCurve, setDemandExactCurve] = useState<ExactDirectionCurve | null>(null)
  const exactRequestId = useRef(0)
  const exactController = useRef<AbortController | null>(null)
  const exactCurve = exactDirectionCurve
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
  const equilibriumBeta = useMemo(() => {
    if (!isLoadcaseMode || !inverseResult?.ok || !inverseResult.admissibility.evaluated) return null
    return strainGradientDirection(inverseResult.state)
  }, [inverseResult, isLoadcaseMode])

  useEffect(() => {
    setFieldMap(null)

    if (!isLoadcaseMode || !inverseResult?.ok || !surface) {
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

  useEffect(() => {
    setDemandExactCurve(null)
    if (!surface || equilibriumBeta == null) return
    const controller = new AbortController()
    buildExactDirectionCurveAsync({
      calculationProfileId: surface.calculationProfileId ?? 'kds-2024-stress-strain',
      section,
      rebars,
      materialStore,
      designBasis,
      analysisOptions: surface.analysisOptions,
      beta: equilibriumBeta
    }, controller.signal)
      .then(setDemandExactCurve)
      .catch((error) => {
        if (!isAnalysisAbort(error)) setDemandExactCurve(null)
      })
    return () => controller.abort()
  }, [designBasis, equilibriumBeta, materialStore, rebars, section, surface])

  useEffect(() => {
    exactController.current?.abort()
    exactController.current = null
    exactRequestId.current += 1
    setExactCurveWorking(false)
    onExactDirectionCurveChange(null)
    setExactCurveMessage('')
    return () => exactController.current?.abort()
  }, [onExactDirectionCurveChange, surface])

  const designDataset = useMemo(
    () => surface ? activeDesignSurfaceDataset(surface) : null,
    [surface]
  )
  const nominalDataset = useMemo(
    () => surface ? activeNominalSurfaceDataset(surface) : null,
    [surface]
  )

  const activeFixedP = isLoadcaseMode ? selectedLoadcase.P : fixedP
  const activeAngle = isLoadcaseMode
    ? equilibriumBeta == null ? loadcaseAngleDeg(selectedLoadcase) : equilibriumBeta * 180 / Math.PI
    : exactCurve ? exactCurve.beta * 180 / Math.PI : view.sliceAngle
  useEffect(() => {
    setExactAngleDraft(String(Number(activeAngle.toFixed(6))))
  }, [activeAngle])
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
  const capacityProjection = useMemo(() => {
    const point = inverseResult?.designCapacityPoint
    if (!isLoadcaseMode || !point) return null
    const theta = normalizeAngleDeg(activeAngle) * Math.PI / 180
    return {
      mx: knm(point.Mx),
      my: knm(point.My),
      p: kn(point.P),
      m: knm(point.Mx * Math.cos(theta) + point.My * Math.sin(theta))
    }
  }, [activeAngle, inverseResult, isLoadcaseMode])

  const activeFixedPKn = kn(activeFixedP)
  const minPKn = surface ? kn(surface.bounds.P[0]) : 0
  const maxPKn = surface ? kn(surface.bounds.P[1]) : 0
  const surfaceDirectionAnglesDeg = useMemo(
    () => (surface
      ? uniqueSurfaceDirectionAnglesDeg(designDataset?.directions ?? surface.directions)
      : []),
    [designDataset, surface]
  )
  const angleSliderStep = directionAngleStepDeg(surfaceDirectionAnglesDeg)
  const angleSliderMax = sliceAngleMax(view, surfaceDirectionAnglesDeg, angleSliderStep)
  const setSliceAngle = (value: number) => {
    const nextAngle = snapSliceAngleDeg(value, surfaceDirectionAnglesDeg, angleSliderMax, angleSliderStep)
    onExactDirectionCurveChange(null)
    setExactCurveMessage('')
    setExactAngleDraft(String(Number(nextAngle.toFixed(6))))
    onViewChange({ sliceAngle: nextAngle })
  }


  const applyExactAngle = () => {
    if (!surface || exactCurveWorking) return
    if (exactAngleDraft.trim() === '') {
      setExactCurveMessage('Enter a finite β angle.')
      return
    }
    const value = Number(exactAngleDraft)
    if (!Number.isFinite(value)) {
      setExactCurveMessage('Enter a finite β angle.')
      return
    }
    const normalizedDegrees = normalizeAngleDeg(value)
    setExactAngleDraft(String(Number(normalizedDegrees.toFixed(6))))
    const fixedAngle = surfaceDirectionAnglesDeg.find((candidate) => {
      const difference = Math.abs(candidate - normalizedDegrees)
      return Math.min(difference, 360 - difference) <= 1e-9
    })
    if (fixedAngle !== undefined) {
      setSliceAngle(fixedAngle)
      setExactAngleDraft(String(Number(fixedAngle.toFixed(6))))
      setExactCurveMessage(`${surface.analysisOptions.samplingMode === 'adaptive' ? 'Adaptive' : 'Fixed'} β · ${surface.stationError.maxStations ?? surface.stationError.stations} stations`)
      return
    }
    const beta = normalizedDegrees * Math.PI / 180
    const requestId = exactRequestId.current + 1
    exactRequestId.current = requestId
    const controller = new AbortController()
    exactController.current = controller
    setExactCurveWorking(true)
    setExactCurveMessage('Calculating exact β…')
    buildExactDirectionCurveAsync({
      calculationProfileId: surface.calculationProfileId ?? 'kds-2024-stress-strain',
      section,
      rebars,
      materialStore,
      designBasis,
      analysisOptions: surface.analysisOptions,
      beta
    }, controller.signal)
      .then((curve) => {
        if (exactRequestId.current !== requestId) return
        onExactDirectionCurveChange(curve)
        setExactAngleDraft(String(Number((curve.beta * 180 / Math.PI).toFixed(6))))
        setExactCurveMessage(`Exact β · ${activeDesignDirectionPoints(curve).length} ${surface.analysisOptions.samplingMode === 'adaptive' ? 'adaptive' : 'fixed'} stations`)
      })
      .catch((error) => {
        if (exactRequestId.current === requestId && !isAnalysisAbort(error)) {
          setExactCurveMessage(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (exactRequestId.current === requestId) {
          exactController.current = null
          setExactCurveWorking(false)
        }
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
    () => (designDataset ? sliceFixedPContour(
      designDataset.points,
      activeFixedP,
      designDataset.triangles
    ) : []),
    [activeFixedP, designDataset]
  )
  const nominalContour = useMemo(
    () => (nominalDataset ? sliceFixedPContour(
      nominalDataset.points,
      activeFixedP,
      nominalDataset.triangles
    ) : []),
    [activeFixedP, nominalDataset]
  )
  const axialCapPKn = useMemo(() => {
    const capped = surface?.points.filter((point) => point.resistance?.axialCapApplied) ?? []
    return capped.length > 0 ? kn(Math.max(...capped.map((point) => point.P))) : null
  }, [surface])

  // Fixed-P presentation cuts the active mode's authoritative Design/Nominal triangulations.
  const strainAngleSamples = useMemo(() => contourStrainAngleSamples(contour), [contour])
  const nominalStrainAngleSamples = useMemo(
    () => contourStrainAngleSamples(nominalContour),
    [nominalContour]
  )
  const surfacePoints3d = useMemo(
    () =>
      surface
        ? view.surfaceResistanceMode === 'design'
          ? designDataset?.points ?? []
          : nominalDataset?.points ?? []
        : [],
    [designDataset, nominalDataset, surface, view.surfaceResistanceMode]
  )
  const surfaceGrid = useMemo(() => groupByBeta(surfacePoints3d), [surfacePoints3d])
  const surfaceTriangles3d = useMemo(() => {
    const explicit = view.surfaceResistanceMode === 'design'
      ? designDataset?.triangles
      : nominalDataset?.triangles
    return explicit && explicit.length > 0 ? explicit : buildClosedSurfaceTriangles(surfacePoints3d)
  }, [designDataset, nominalDataset, surfacePoints3d, view.surfaceResistanceMode])
  const surfaceContour3d = view.surfaceResistanceMode === 'design'
    ? strainAngleSamples
    : nominalStrainAngleSamples

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
    if (!surface || surfacePoints3d.length === 0) return []
    const x = surfaceGrid.map((row) => row.curve.map((point) => knm(point.Mx)))
    const y = surfaceGrid.map((row) => row.curve.map((point) => knm(point.My)))
    const z = surfaceGrid.map((row) => row.curve.map((point) => kn(point.P)))
    const customdata = surfaceGrid.map((row) => row.curve.map((point) => point.id))
    const pPlane = activeFixedPKn

    const ring = surfaceContour3d.length
      ? {
          type: 'scatter3d',
          name: 'Fixed-P ring',
          mode: 'lines',
          x: [...surfaceContour3d.map((point) => knm(point.Mx)), knm(surfaceContour3d[0].Mx)],
          y: [...surfaceContour3d.map((point) => knm(point.My)), knm(surfaceContour3d[0].My)],
          z: [...surfaceContour3d.map(() => pPlane), pPlane],
          line: { color: plotPalette.primary, width: 7 },
          hoverinfo: 'skip'
        }
      : null

    const activeTriangles = surfaceTriangles3d
    const surfaceGridWireframe = activeTriangles.length > 0
      ? (() => {
          const seen = new Set<string>()
          const wireX: Array<number | null> = []
          const wireY: Array<number | null> = []
          const wireZ: Array<number | null> = []
          const appendEdge = (leftIndex: number, rightIndex: number) => {
            if (!isMeridianOrParallelEdge(surfacePoints3d, leftIndex, rightIndex)) return
            const a = Math.min(leftIndex, rightIndex)
            const b = Math.max(leftIndex, rightIndex)
            const key = `${a}:${b}`
            if (seen.has(key)) return
            seen.add(key)
            const left = surfacePoints3d[a]
            const right = surfacePoints3d[b]
            if (!left || !right) return
            wireX.push(knm(left.Mx), knm(right.Mx), null)
            wireY.push(knm(left.My), knm(right.My), null)
            wireZ.push(kn(left.P), kn(right.P), null)
          }
          for (const triangle of activeTriangles) {
            appendEdge(triangle.a, triangle.b)
            appendEdge(triangle.b, triangle.c)
            appendEdge(triangle.c, triangle.a)
          }
          return {
            type: 'scatter3d',
            name: 'Meridian and parallel grid',
            mode: 'lines',
            x: wireX,
            y: wireY,
            z: wireZ,
            line: { color: plotPalette.surfaceWireframe, width: 1.05 },
            opacity: 1,
            hoverinfo: 'skip'
          }
        })()
      : null
    const activeExactFor3d = isLoadcaseMode ? demandExactCurve : exactCurve
    const exactMeridianFor3d = activeExactFor3d
      ? view.surfaceResistanceMode === 'design'
        ? activeDesignDirectionPoints(activeExactFor3d)
        : activeNominalDirectionPoints(activeExactFor3d)
      : null
    const directSectionFor3d = buildDirectMeridianSection(
      exactMeridianFor3d ?? surfacePoints3d,
      activeAngle,
      !activeExactFor3d && view.includeOppositeMoment
    )
    const directMeridians = [
      directSectionFor3d.primary,
      ...(directSectionFor3d.opposite.length > 0 ? [directSectionFor3d.opposite] : [])
    ].filter((path) => path.length > 0)
    const sliceTraces = directMeridians.map((path, index) => {
      return {
        type: 'scatter3d',
        name: index === 0 ? 'Direct β meridian' : 'Opposite β meridian',
        mode: 'lines',
        x: path.map((point) => knm(point.Mx)),
        y: path.map((point) => knm(point.My)),
        z: path.map((point) => kn(point.P)),
        line: { color: '#7c3aed', width: 7 },
        hoverinfo: 'skip'
      }
    })

    const fixedPTopology = triangulatePlanarPolygon(
      surfaceContour3d.map((point) => ({ u: point.Mx, v: point.My }))
    )
    const fixedPSectionFill = fixedPTopology.length > 0
      ? {
          type: 'mesh3d',
          name: 'Fixed-P section fill',
          x: surfaceContour3d.map((point) => knm(point.Mx)),
          y: surfaceContour3d.map((point) => knm(point.My)),
          z: surfaceContour3d.map(() => pPlane),
          i: fixedPTopology.map((triangle) => triangle.a),
          j: fixedPTopology.map((triangle) => triangle.b),
          k: fixedPTopology.map((triangle) => triangle.c),
          color: plotPalette.primary,
          opacity: 0.14,
          flatshading: true,
          hoverinfo: 'skip'
        }
      : null

    const capacityTrace = activeTriangles.length > 0
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
        opacity: 0.52,
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
        opacity: 0.52,
        colorbar: { title: 'P (kN)', thickness: 15, len: 0.72, x: 1.02, xpad: 4, tickfont: { size: 10 } },
        hovertemplate: `P=%{z:.1f} kN<br>Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<extra>${view.surfaceResistanceMode === 'design' ? 'Design' : 'Nominal'} surface</extra>`
      }

    return [
      capacityTrace,
      ...(fixedPSectionFill ? [fixedPSectionFill] : []),
      ...(surfaceGridWireframe ? [surfaceGridWireframe] : []),
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
    demandExactCurve,
    exactCurve,
    isLoadcaseMode,
    view.includeOppositeMoment,
    loadcases,
    selectedLoadcaseId,
    plotPalette,
    surface,
    surfaceContour3d,
    surfaceGrid,
    surfacePoints3d,
    surfaceTriangles3d,
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
    const closedX = [...strainAngleSamples.map((point) => knm(point.Mx))]
    const closedY = [...strainAngleSamples.map((point) => knm(point.My))]
    if (strainAngleSamples[0]) {
      closedX.push(knm(strainAngleSamples[0].Mx))
      closedY.push(knm(strainAngleSamples[0].My))
    }
    const nominalClosedX = [...nominalStrainAngleSamples.map((point) => knm(point.Mx))]
    const nominalClosedY = [...nominalStrainAngleSamples.map((point) => knm(point.My))]
    if (nominalStrainAngleSamples[0]) {
      nominalClosedX.push(knm(nominalStrainAngleSamples[0].Mx))
      nominalClosedY.push(knm(nominalStrainAngleSamples[0].My))
    }
    const rayRadius = Math.max(...activeSamples.map((point) => knm(Math.hypot(point.Mx, point.My))), 1) * 1.18
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
        name: 'Sampled meridian intersections',
        mode: 'markers+text',
        x: activeSamples.map((point) => knm(point.Mx)),
        y: activeSamples.map((point) => knm(point.My)),
        text: activeSamples.map((point) => `${fmt((point.beta * 180) / Math.PI, 3)}°`),
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
            return fmt(betaDeg, 3)
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
        : []),
      ...(capacityProjection
        ? [{
            type: 'scatter',
            name: 'Capacity point',
            mode: 'markers',
            x: [capacityProjection.mx],
            y: [capacityProjection.my],
            marker: {
              size: 10,
              color: '#16a34a',
              symbol: 'diamond',
              line: { color: plotPalette.markerOutline, width: 1 }
            },
            customdata: [[capacityProjection.p]],
            hovertemplate:
              'Mx=%{x:.1f} kN.m<br>My=%{y:.1f} kN.m<br>P=%{customdata[0]:.1f} kN<extra>Capacity</extra>'
          }]
        : [])
    ]
  }, [
    activeFixedPKn,
    capacityProjection,
    demandProjection,
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
      ...(view.showDesignResistance ? strainAngleSamples : []),
      ...displayedStrainAngleSamples,
      ...(view.showNominalReference ? nominalStrainAngleSamples : [])
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
    demandProjection,
    displayedStrainAngleSamples,
    nominalStrainAngleSamples,
    strainAngleSamples,
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
      intermediatePoints: [] as Array<{ m: number; p: number; station: number }>,
      closed: true,
      stations: [] as Array<{ m: number; p: number; station: number }>,
      keys: [] as Array<{ m: number; p: number; station: number; label: string; side: 'primary' | 'opposite' }>
    }
    if (!surface) return empty
    if (isLoadcaseMode && (equilibriumBeta == null || !demandExactCurve)) return empty
    const theta = normalizeAngleDeg(activeAngle) * Math.PI / 180
    const project = (point: PreviewSurfacePoint) => ({
      m: knm(point.Mx * Math.cos(theta) + point.My * Math.sin(theta)),
      p: kn(point.P),
      station: point.station
    })
    const activeExact = isLoadcaseMode ? demandExactCurve : exactCurve
    const fixedPoints = designDataset?.points ?? surface.points
    const direct = buildDirectMeridianSection(
      activeExact ? activeDesignDirectionPoints(activeExact) : fixedPoints,
      activeAngle,
      !activeExact && view.includeOppositeMoment
    )
    const markerDirect = activeExact
      ? buildDirectMeridianSection(activeDesignDirectionPoints(activeExact), activeAngle, false)
      : direct
    const primaryPoints = direct.primary
    const markerPoints = markerDirect.primary
    const oppositePoints = direct.opposite
    const primaryPath = primaryPoints.map(project)
    const oppositePath = oppositePoints.map(project)
    const markerPath = markerPoints.map(project)
    const displayPaths = direct.displayPaths.map((path) => path.map(project))
    const keyDescriptors = designDataset?.stations ?? surface.stations
    const pickKeys = (
      curve: Array<{ m: number; p: number; station: number }>,
      side: 'primary' | 'opposite'
    ) => keyDescriptors.flatMap((descriptor, station) => {
      const definition = descriptor.definition
      if (
        definition.kind !== 'bar-tension-yield-ratio' ||
        (Math.abs(definition.ratio) > 1e-12 && Math.abs(definition.ratio - 1) > 1e-12)
      ) return []
      const point = curve.find((item) => Math.abs(item.station - station) <= 1e-9)
      return point ? [{ ...point, label: descriptor.label, side }] : []
    })
    return {
      primaryPath,
      oppositePath,
      displayPaths,
      intermediatePoints: [],
      closed: direct.closed,
      stations: [
        ...markerPath,
        ...(oppositePath.length > 0 ? oppositePath.filter((point) => Math.abs(point.m) > 1e-6) : [])
      ],
      keys: [
        ...pickKeys(markerPath, 'primary'),
        ...(oppositePath.length > 0 ? pickKeys(oppositePath, 'opposite') : [])
      ]
    }
  }, [activeAngle, demandExactCurve, designDataset, equilibriumBeta, exactCurve, isLoadcaseMode, surface, view.includeOppositeMoment])

  const nominalVerticalPaths = useMemo(() => {
    if (!surface) return [] as Array<Array<{ m: number; p: number; station: number }>>
    if (isLoadcaseMode && (equilibriumBeta == null || !demandExactCurve)) return []
    const theta = normalizeAngleDeg(activeAngle) * Math.PI / 180
    const project = (point: PreviewSurfacePoint) => ({
      m: knm(point.Mx * Math.cos(theta) + point.My * Math.sin(theta)),
      p: kn(point.P),
      station: point.station
    })
    const activeExact = isLoadcaseMode ? demandExactCurve : exactCurve
    const fixedPoints = nominalDataset?.points ?? surface.nominalPoints
    const direct = buildDirectMeridianSection(
      activeExact ? activeNominalDirectionPoints(activeExact) : fixedPoints,
      activeAngle,
      !activeExact && view.includeOppositeMoment
    )
    return direct.displayPaths.map((path) => path.map(project))
  }, [activeAngle, demandExactCurve, equilibriumBeta, exactCurve, isLoadcaseMode, nominalDataset, surface, view.includeOppositeMoment])

  const nominalVerticalAnnotations = useMemo(() => {
    const stations = nominalVerticalPaths.flat()
    const descriptors = nominalDataset?.stations ?? surface?.stations ?? []
    const keys = descriptors.flatMap((descriptor, station) => {
      const definition = descriptor.definition
      if (
        definition.kind !== 'bar-tension-yield-ratio' ||
        (Math.abs(definition.ratio) > 1e-12 && Math.abs(definition.ratio - 1) > 1e-12)
      ) return []
      const point = stations.find((item) => Math.abs(item.station - station) <= 1e-9)
      return point ? [{
        ...point,
        label: descriptor.label,
        side: point.m < 0 ? 'opposite' as const : 'primary' as const
      }] : []
    })
    return { stations, keys, intermediatePoints: [] }
  }, [nominalDataset, nominalVerticalPaths, surface])

  const verticalData = useMemo(() => {
    const nominalOnly = view.showNominalReference && !view.showDesignResistance
    const selectedStations = nominalOnly ? nominalVerticalAnnotations.stations : verticalSlice.stations
    const selectedIntermediatePoints = nominalOnly
      ? nominalVerticalAnnotations.intermediatePoints
      : verticalSlice.intermediatePoints
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
            ? `Direct β = ${fmt(activeAngle, exactCurve || demandExactCurve ? 3 : 0)}°`
            : `Direct β = ${fmt(normalizeAngleDeg(activeAngle + 180), 0)}°`,
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
        name: 'Intermediate intersections',
        mode: 'markers',
        x: selectedIntermediatePoints.map((point) => point.m),
        y: selectedIntermediatePoints.map((point) => point.p),
        marker: {
          size: 4,
          color: '#2563eb',
          symbol: 'circle',
          line: { color: '#2563eb', width: 0 }
        },
        customdata: selectedIntermediatePoints.map((point) => point.station),
        hovertemplate:
          'Intermediate station=%{customdata:.3f}<br>M=%{x:.1f} kN.m<br>P=%{y:.1f} kN<extra></extra>'
      }] : []),
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
                '%{customdata[0]}<br>Mβ=%{x:.1f} kN.m<br>Pu=%{y:.1f} kN<br>Mux=%{customdata[1]:.1f} kN.m<br>Muy=%{customdata[2]:.1f} kN.m<extra>Demand</extra>'
            }
          ]
        : []),
      ...(capacityProjection
        ? [{
            type: 'scatter',
            name: 'Capacity point',
            mode: 'markers',
            x: [capacityProjection.m],
            y: [capacityProjection.p],
            marker: {
              size: 10,
              color: '#16a34a',
              symbol: 'diamond',
              line: { color: plotPalette.markerOutline, width: 1 }
            },
            customdata: [[capacityProjection.mx, capacityProjection.my]],
            hovertemplate:
              'Mβ=%{x:.1f} kN.m<br>P=%{y:.1f} kN<br>Mx=%{customdata[0]:.1f} kN.m<br>My=%{customdata[1]:.1f} kN.m<extra>Capacity</extra>'
          }]
        : [])
    ]
  }, [
    activeAngle,
    capacityProjection,
    demandExactCurve,
    demandProjection,
    exactCurve,
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
          text: 'Mβ (kN.m)',
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
      <section
        className={`pm-results-stage pm-results-stage--charts-only${busy ? ' is-recalculating' : ''}`}
        aria-busy={busy}
      >
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
                      <div><span>NA normal θn / c</span><strong>{fmt(inverseResult.equivalentBlock.neutralAxisAngle * 180 / Math.PI, 2)}° · {fmt(inverseResult.equivalentBlock.neutralAxisDepth, 2)} mm</strong></div>
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
                    <div title="Exact strain-gradient direction recovered from the equilibrium state.">
                      <span>Strain direction βeq</span>
                      <strong>
                        {equilibriumBeta == null ? 'n/a' : `${fmt(equilibriumBeta * 180 / Math.PI, 3)}°`}
                      </strong>
                    </div>
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
            title: 'Direct β meridian',
            meta: equilibriumBeta == null
              ? 'N.A. direction is not unique for this state'
              : `βeq = ${fmt(equilibriumBeta * 180 / Math.PI, 3)}°`,
            primary: demandView.primaryChart === 'vertical',
            visible: demandView.visibleCharts.vertical,
            onMakePrimary: () => onDemandViewChange({ primaryChart: 'vertical' }),
            onToggleVisible: () => toggleDemandChart('vertical'),
            controls: (
              <>
                <SyncedControl
                  label="βeq"
                  title="Exact equilibrium strain-gradient direction"
                  value={Number(activeAngle.toFixed(3))}
                  min={0}
                  max={360}
                  step={0.001}
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
    <section
      className={`pm-results-stage pm-results-stage--charts-only${busy ? ' is-recalculating' : ''}`}
      aria-busy={busy}
    >
      {busy ? <StaleBanner /> : null}

      <div
        className={`pm-results-grid pm-results-grid--dynamic primary-${view.primaryChart} count-${
          Object.values(view.visibleCharts).filter(Boolean).length
        }`}
      >
        {renderChartShell({
          id: 'vertical',
          title: 'Direct β meridian',
          meta: exactCurveMessage || `Fixed β = ${fmt(view.sliceAngle, 0)}°`,
          primary: view.primaryChart === 'vertical',
          visible: view.visibleCharts.vertical,
          onMakePrimary: () => onViewChange({ primaryChart: 'vertical' }),
          onToggleVisible: () => toggleSectionChart('vertical'),
          controls: (
            <>
              <SyncedControl
                label="β"
                title="Strain-gradient direction; type an exact β and press Enter"
                value={view.sliceAngle}
                min={0}
                max={angleSliderMax}
                step={angleSliderStep}
                unit="deg"
                inputValue={exactAngleDraft}
                inputStep="any"
                inputDisabled={exactCurveWorking}
                inputWorking={exactCurveWorking}
                onInputChange={setExactAngleDraft}
                onInputCommit={applyExactAngle}
                onInputBlur={() => {
                  if (!exactCurveWorking) {
                    setExactAngleDraft(String(Number(activeAngle.toFixed(6))))
                  }
                }}
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
