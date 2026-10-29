'use client'

import { toCanonical } from '@pm/units'
import { QuantitySlider, QuantityValue, UnitLabel, useQuantityFormatters } from '../shared/DisplayUnits'

import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EyeOff, Loader2, Maximize2, RotateCw } from 'lucide-react'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { DesignBasis } from '@pm/design'
import { CENTROID_LOAD_REFERENCE, type LoadCombination, type LoadReference } from '@pm/project'
import {
  activeDesignDirectionPoints,
  activeDesignSurfaceDataset,
  activeNominalDirectionPoints,
  activeNominalSurfaceDataset,
  axialCapExcludedPaths,
  contourStrainAngleSamples,
  intersectFixedPContourWithMomentRay,
  resolveLoadcaseField,
  sliceFixedPContour,
  sliceMomentPlane,
  strainGradientDirection,
  type ExactDirectionCurve,
  type InversePreviewResult,
  type LoadcaseQuickCheckResult,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type Resultant,
  type SectionFieldMap
} from '@pm/analysis'
import {
  buildSectionFieldMapAsync,
  buildExactDirectionCurveAsync,
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
import { SectionOutlineChart } from './SectionOutlineChart'
import {
  lineAngleDifferenceDeg,
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
import {
  currentLoadcaseEvidence,
  loadcaseFrameForTransition,
  sameLoadcaseDemand
} from './loadcase-calculation-trace'

type ResultsViewMode = 'overview' | 'loadcase'
type ResultsTheme = 'light' | 'dark'

const DeferredChart = ({ primary, children }: { primary: boolean; children: ReactNode }) => {


  const [ready, setReady] = useState(primary)

  useEffect(() => {
    if (primary || ready) {
      if (primary && !ready) setReady(true)
      return
    }
    const browserWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (browserWindow.requestIdleCallback) {
      const id = browserWindow.requestIdleCallback(() => setReady(true), { timeout: 500 })
      return () => browserWindow.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(() => setReady(true), 120)
    return () => window.clearTimeout(id)
  }, [primary, ready])

  return ready ? children : <div className="pm-results-plot-placeholder">Preparing chart…</div>
}


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
  loadReference?: LoadReference
  axesReference?: LoadReference
  projectName: string
  selectedLoadcaseId: number | null
  inverseResult: InversePreviewResult | null
  checksById: Readonly<Record<number, LoadcaseQuickCheckResult>>
  exactDirectionCurve: ExactDirectionCurve | null
  onExactDirectionCurveChange: (curve: ExactDirectionCurve | null) => void
  fixedP: number
  onFixedPChange: (value: number) => void
  view: SectionResultsView
  demandView: DemandCheckView
  onViewChange: (patch: Partial<SectionResultsView>) => void
  onDemandViewChange: (patch: Partial<DemandCheckView>) => void
  onSelectLoadcase: (id: number) => void
  onLoadcaseUpdatingChange?: (updating: boolean) => void
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
}) => {
  return (
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
}

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
}) => {

  return (
  <>
    <label className={`ws-check pm-field-check${showDesign ? ' is-on' : ''}`} title="Design resistance">
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
    <label className={`ws-check pm-field-check${showNominal ? ' is-on' : ''}`} title="Nominal reference">
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
}

const SurfaceResistanceControl = ({
  value,
  onChange
}: {
  value: SurfaceResistanceMode
  onChange: (value: SurfaceResistanceMode) => void
}) => {

  return (
  <fieldset className="pm-result-radio-group ws-joined-buttons" aria-label="3D resistance surface">
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
}

const fmt = (value: number, digits = 1) =>
  Math.abs(value) < 1e-9 ? '0' : value.toLocaleString('en-US', { maximumFractionDigits: digits })
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
  if (!result.admissibility.evaluated && result.capacityField?.status === 'unavailable' && result.capacityField.reason === 'axial-cap') {
    return { label: 'Cap face', tone: 'is-warn' }
  }
  if (!result.converged && result.capacityField?.status === 'unavailable' && result.capacityField.reason === 'zero-demand') {
    return { label: 'Not applicable', tone: '' }
  }
  if (!result.converged) return { label: 'Approx', tone: 'is-warn' }
  if (!result.admissibility.ok) return { label: 'Inadmissible', tone: 'is-bad' }
  return { label: 'Converged', tone: 'is-ok' }
}

const loadcaseAngleDeg = (loadcase: LoadCombination) =>
  normalizeAngleDeg((Math.atan2(loadcase.My, loadcase.Mx) * 180) / Math.PI)

const FieldMetricPlaceholder = ({ title }: { title: string }) => (
  <article className="pm-field-metric-card">
    <header>{title}</header>
    <div className="pm-field-metric-rows"><div><span>Unavailable</span><strong>—</strong></div></div>
  </article>
)

export function ResultsWorkspace({
  theme,
  ready,
  busy,
  viewMode,
  surface: requestedSurface,
  section: requestedSection,
  rebars: requestedRebars,
  materialStore: requestedMaterialStore,
  designBasis: requestedDesignBasis,
  loadcases: requestedLoadcases,
  loadReference = CENTROID_LOAD_REFERENCE,
  axesReference,
  projectName,
  selectedLoadcaseId: requestedLoadcaseId,
  inverseResult: requestedInverseResult,
  checksById,
  exactDirectionCurve,
  onExactDirectionCurveChange,
  fixedP,
  onFixedPChange,
  view,
  demandView,
  onViewChange,
  onDemandViewChange,
  onSelectLoadcase,
  onLoadcaseUpdatingChange
}: Props) {
  const { displayUnits, qfmt, unit, force, moment, displayForce, displayMoment } = useQuantityFormatters()
  const previewReference = axesReference ?? loadReference
  const isAxisPreview = previewReference.offsetX !== loadReference.offsetX || previewReference.offsetY !== loadReference.offsetY

  const [fieldSnapshot, setFieldSnapshot] = useState<{
    map: SectionFieldMap | null
    fieldMessage: string
    result: InversePreviewResult
    selectedLoadcaseId: number
    surface: PreviewSurface
    section: SectionGeometry
    rebars: GeometryInputRebarView[]
    materialStore: MaterialStore
    designBasis: DesignBasis
    exactCurve: ExactDirectionCurve | null
  } | null>(null)
  const requestedSelectedLoadcase = requestedLoadcases.find((item) => item.id === requestedLoadcaseId) ?? null
  const requestedIsLoadcaseMode = viewMode === 'loadcase' && requestedSelectedLoadcase != null
  const currentInverseResult = currentLoadcaseEvidence(requestedSelectedLoadcase, requestedInverseResult)
  const fieldFrameTransition = viewMode === 'loadcase'
    ? loadcaseFrameForTransition(
        requestedLoadcases,
        requestedSelectedLoadcase,
        currentInverseResult,
        requestedSurface,
        fieldSnapshot
      )
    : { frame: null, status: 'pending' as const }
  const displayFieldSnapshot = fieldFrameTransition.frame
  const loadcases = requestedLoadcases
  const selectedLoadcaseId = displayFieldSnapshot?.selectedLoadcaseId ?? requestedLoadcaseId
  const selectedLoadcase = displayFieldSnapshot?.result.demand ?? requestedSelectedLoadcase
  const inverseResult = displayFieldSnapshot?.result ?? currentInverseResult
  const checkedLoadcase = inverseResult?.codeAdjustedDemand ?? selectedLoadcase
  const fieldMap = displayFieldSnapshot?.map ?? null
  const surface = displayFieldSnapshot?.surface ?? requestedSurface
  const fieldEvidence = useMemo(() => inverseResult && surface
    ? resolveLoadcaseField(inverseResult, surface.analysisOptions.methodId) : null, [inverseResult, surface])
  const sectionField = fieldEvidence?.status === 'available' ? fieldEvidence : null
  const isNgCase = requestedIsLoadcaseMode && inverseResult?.designCheck.evaluated === true &&
    inverseResult.designCheck.adequacy === 'inadequate'
  const section = displayFieldSnapshot?.section ?? requestedSection
  const rebars = displayFieldSnapshot?.rebars ?? requestedRebars
  const materialStore = displayFieldSnapshot?.materialStore ?? requestedMaterialStore
  const designBasis = displayFieldSnapshot?.designBasis ?? requestedDesignBasis
  const demandExactCurve = displayFieldSnapshot?.exactCurve ?? null
  const [fieldMapWorking, setFieldMapWorking] = useState(false)
  const [exactAngleDraft, setExactAngleDraft] = useState(() => String(view.sliceAngle))
  const [exactCurveWorking, setExactCurveWorking] = useState(false)
  const [exactCurveMessage, setExactCurveMessage] = useState('')
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

  const isLoadcaseMode = requestedIsLoadcaseMode
  const loadcaseUpdating = requestedIsLoadcaseMode && (
    !currentInverseResult || fieldFrameTransition.status !== 'current'
  )
  const demandWorking = requestedIsLoadcaseMode && (busy || loadcaseUpdating || fieldMapWorking)

  useEffect(() => {
    onLoadcaseUpdatingChange?.(demandWorking)
  }, [demandWorking, onLoadcaseUpdatingChange])

  useEffect(
    () => () => onLoadcaseUpdatingChange?.(false),
    [onLoadcaseUpdatingChange]
  )

  const equilibriumBeta = useMemo(() => {
    if (!isLoadcaseMode || !sectionField) return null
    return strainGradientDirection(sectionField.state)
  }, [sectionField, isLoadcaseMode])

  useEffect(() => {
    if (!requestedIsLoadcaseMode || !requestedSurface) {
      setFieldSnapshot(null)
      setFieldMapWorking(false)
      return
    }
    // A previous frame may remain visible only as the explicitly labelled outgoing frame. Never
    // mutate it or combine it with partial evidence from the newly selected loadcase.
    if (
      !requestedInverseResult ||
      requestedLoadcaseId == null ||
      !sameLoadcaseDemand(requestedInverseResult.demand, requestedSelectedLoadcase)
    ) {
      setFieldMapWorking(true)
      return
    }
    const controller = new AbortController()
    setFieldMapWorking(true)
    const field = resolveLoadcaseField(requestedInverseResult, requestedSurface.analysisOptions.methodId)
    const physical = field.status === 'available' ? field : null
    const exactBeta = (physical ? strainGradientDirection(physical.state) : null) ?? demandView.directAngle * Math.PI / 180
    const fieldPromise = physical ? buildSectionFieldMapAsync(
      {
        calculationProfileId: requestedSurface.calculationProfileId ?? 'kds-2024-stress-strain',
        section: requestedSection,
        rebars: requestedRebars,
        materialStore: requestedMaterialStore,
        designBasis: requestedDesignBasis,
        analysisOptions: requestedSurface.analysisOptions,
        state: physical.state,
        blockState: physical.equivalentBlock ? {
          neutralAxisAngle: physical.equivalentBlock.neutralAxisAngle,
          neutralAxisDepth: physical.equivalentBlock.neutralAxisDepth
        } : undefined
      },
      controller.signal
    ) : Promise.resolve(null)
    const exactCurvePromise = buildExactDirectionCurveAsync({
          calculationProfileId: requestedSurface.calculationProfileId ?? 'kds-2024-stress-strain',
          section: requestedSection,
          rebars: requestedRebars,
          materialStore: requestedMaterialStore,
          designBasis: requestedDesignBasis,
          analysisOptions: requestedSurface.analysisOptions,
          beta: exactBeta
        }, controller.signal)

    // Field, diagnostic result and exact meridian form one visual frame. Committing them together
    // prevents a new beta from ever projecting the previous loadcase's exact curve.
    Promise.allSettled([fieldPromise, exactCurvePromise])
      .then(([mapResult, curveResult]) => {
        if (controller.signal.aborted) return
        const map = mapResult.status === 'fulfilled' ? mapResult.value : null
        const exactCurve = curveResult.status === 'fulfilled' ? curveResult.value : null
        startTransition(() => {
          setFieldSnapshot({
            map,
            fieldMessage: map ? '' : field.status === 'unavailable' ? field.message
              : 'Section field rendering is unavailable; geometric checks remain available.',
            result: requestedInverseResult,
            selectedLoadcaseId: requestedLoadcaseId,
            surface: requestedSurface,
            section: requestedSection,
            rebars: requestedRebars,
            materialStore: requestedMaterialStore,
            designBasis: requestedDesignBasis,
            exactCurve
          })
          setFieldMapWorking(false)
        })
      })
      .catch((error) => {
        if (isAnalysisAbort(error)) return
        setFieldSnapshot(null)
        setFieldMapWorking(false)
      })

    return () => controller.abort()
  }, [
    requestedDesignBasis,
    requestedInverseResult,
    requestedIsLoadcaseMode,
    requestedLoadcaseId,
    requestedMaterialStore,
    requestedRebars,
    requestedSelectedLoadcase,
    requestedSection,
    requestedSurface,
    demandView.directAngle
  ])

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
  const beforeCapDataset = surface?.beforeAxialCap
  const axialCapLimit = beforeCapDataset && surface ? surface.bounds.P[1] : null
  const beforeCapField = sectionField?.basis === 'capacity' && sectionField.boundary.kind === 'before-axial-cap'
    ? sectionField : null

  const demandPlaneMode = isLoadcaseMode && demandView.verticalMode === 'demand-plane'
  const activeFixedP = isLoadcaseMode && checkedLoadcase ? checkedLoadcase.P : fixedP
  const activeAngle = isLoadcaseMode && checkedLoadcase
    ? demandPlaneMode ? loadcaseAngleDeg(checkedLoadcase)
      : equilibriumBeta == null ? (demandExactCurve?.beta ?? demandView.directAngle * Math.PI / 180) * 180 / Math.PI
        : equilibriumBeta * 180 / Math.PI
    : exactCurve ? exactCurve.beta * 180 / Math.PI : view.sliceAngle
  useEffect(() => {
    setExactAngleDraft(String(Number(activeAngle.toFixed(6))))
  }, [activeAngle])
  const demandProjection = useMemo(() => {
    if (!isLoadcaseMode || !checkedLoadcase) return null
    const theta = (normalizeAngleDeg(activeAngle) * Math.PI) / 180
    return {
      mx: displayMoment(checkedLoadcase.Mx),
      my: displayMoment(checkedLoadcase.My),
      p: displayForce(checkedLoadcase.P),
      m: displayMoment(checkedLoadcase.Mx * Math.cos(theta) + checkedLoadcase.My * Math.sin(theta)),
      name: checkedLoadcase.name
    }
  }, [displayUnits, activeAngle, isLoadcaseMode, checkedLoadcase])
  const capacityProjection = useMemo(() => {
    const point = inverseResult?.designCapacityPoint
    if (!isLoadcaseMode || !point || inverseResult?.utilization === 0) return null
    const theta = normalizeAngleDeg(activeAngle) * Math.PI / 180
    return {
      mx: displayMoment(point.Mx),
      my: displayMoment(point.My),
      p: displayForce(point.P),
      m: displayMoment(point.Mx * Math.cos(theta) + point.My * Math.sin(theta))
    }
  }, [displayUnits, activeAngle, inverseResult, isLoadcaseMode])
  const fieldProjection = useMemo(() => {
    if (!isLoadcaseMode || !beforeCapField) return null
    const point = beforeCapField.response
    const theta = normalizeAngleDeg(activeAngle) * Math.PI / 180
    return { p: displayForce(point.P), m: displayMoment(point.Mx * Math.cos(theta) + point.My * Math.sin(theta)) }
  }, [displayUnits, activeAngle, beforeCapField, isLoadcaseMode])

  const activeDisplayP = displayForce(activeFixedP)
  const minDisplayP = surface ? displayForce(surface.bounds.P[0]) : 0
  const maxDisplayP = surface ? displayForce(surface.bounds.P[1]) : 0
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
    return capped.length > 0 ? displayForce(Math.max(...capped.map((point) => point.P))) : null
  }, [displayUnits, surface])
  const beforeCapContour = useMemo(() => beforeCapDataset && axialCapLimit !== null && activeFixedP > axialCapLimit
    ? sliceFixedPContour(beforeCapDataset.points, activeFixedP, beforeCapDataset.triangles) : [],
  [activeFixedP, axialCapLimit, beforeCapDataset])

  // Fixed-P presentation cuts the active mode's authoritative Design/Nominal triangulations.
  const strainAngleSamples = useMemo(() => contourStrainAngleSamples(contour), [contour])
  const nominalStrainAngleSamples = useMemo(
    () => contourStrainAngleSamples(nominalContour),
    [nominalContour]
  )
  const fixedPCapacityProjection = useMemo(() => {
    if (!isLoadcaseMode || !checkedLoadcase || strainAngleSamples.length < 2) return null
    if (Math.hypot(checkedLoadcase.Mx, checkedLoadcase.My) < 1e-9) return null
    const point = intersectFixedPContourWithMomentRay(
      strainAngleSamples,
      Math.atan2(checkedLoadcase.My, checkedLoadcase.Mx)
    )
    return point
      ? { mx: displayMoment(point.Mx), my: displayMoment(point.My), p: displayForce(point.P) }
      : null
  }, [displayUnits, isLoadcaseMode, checkedLoadcase, strainAngleSamples])
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
    const x = surfaceGrid.map((row) => row.curve.map((point) => displayMoment(point.Mx)))
    const y = surfaceGrid.map((row) => row.curve.map((point) => displayMoment(point.My)))
    const z = surfaceGrid.map((row) => row.curve.map((point) => displayForce(point.P)))
    const customdata = surfaceGrid.map((row) => row.curve.map((point) => point.id))
    const pPlane = activeDisplayP

    const ring = surfaceContour3d.length
      ? {
          type: 'scatter3d',
          name: 'Fixed-P ring',
          mode: 'lines',
          x: [...surfaceContour3d.map((point) => displayMoment(point.Mx)), displayMoment(surfaceContour3d[0].Mx)],
          y: [...surfaceContour3d.map((point) => displayMoment(point.My)), displayMoment(surfaceContour3d[0].My)],
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
            wireX.push(displayMoment(left.Mx), displayMoment(right.Mx), null)
            wireY.push(displayMoment(left.My), displayMoment(right.My), null)
            wireZ.push(displayForce(left.P), displayForce(right.P), null)
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
        x: path.map((point) => displayMoment(point.Mx)),
        y: path.map((point) => displayMoment(point.My)),
        z: path.map((point) => displayForce(point.P)),
        line: { color: '#7c3aed', width: 7 },
        hoverinfo: 'skip'
      }
    })

    const beforeCapTraces = view.surfaceResistanceMode === 'design' && beforeCapDataset && axialCapLimit !== null
      ? (() => {
          const points = beforeCapDataset.points
          const triangles = beforeCapDataset.triangles ?? buildClosedSurfaceTriangles(points)
          const edges: Resultant[][] = []
          const seen = new Set<string>()
          for (const triangle of triangles) for (const [a, b] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]]) {
            const key = a < b ? `${a}:${b}` : `${b}:${a}`
            if (seen.has(key) || !isMeridianOrParallelEdge(points, a, b)) continue
            seen.add(key); edges.push([points[a], points[b]])
          }
          const excluded = axialCapExcludedPaths(edges, axialCapLimit)
          const direct = buildDirectMeridianSection(activeExactFor3d?.beforeAxialCap ?? points, activeAngle,
            !activeExactFor3d && view.includeOppositeMoment)
          const excludedDirect = axialCapExcludedPaths(direct.displayPaths, axialCapLimit)
          const trace = (paths: Resultant[][], name: string, color: string, width: number) => ({
            type: 'scatter3d', name, mode: 'lines',
            x: paths.flatMap(path => [...path.map(point => displayMoment(point.Mx)), null]),
            y: paths.flatMap(path => [...path.map(point => displayMoment(point.My)), null]),
            z: paths.flatMap(path => [...path.map(point => displayForce(point.P)), null]),
            line: { color, width, dash: 'dot' },
            hovertemplate: `P=%{z:.1f} ${unit('force')}<extra>Before Pmax cap · excluded from Design checks</extra>`
          })
          return [trace(excluded, 'Design grid before Pmax cap', plotPalette.surfaceWireframe, 1.05),
            trace(excludedDirect, 'Direct β before Pmax cap', '#7c3aed', 7)]
        })() : []

    const fixedPTopology = triangulatePlanarPolygon(
      surfaceContour3d.map((point) => ({ u: point.Mx, v: point.My }))
    )
    const fixedPSectionFill = fixedPTopology.length > 0
      ? {
          type: 'mesh3d',
          name: 'Fixed-P section fill',
          x: surfaceContour3d.map((point) => displayMoment(point.Mx)),
          y: surfaceContour3d.map((point) => displayMoment(point.My)),
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
        x: surfacePoints3d.map((point) => displayMoment(point.Mx)),
        y: surfacePoints3d.map((point) => displayMoment(point.My)),
        z: surfacePoints3d.map((point) => displayForce(point.P)),
        i: activeTriangles.map((triangle) => triangle.a),
        j: activeTriangles.map((triangle) => triangle.b),
        k: activeTriangles.map((triangle) => triangle.c),
        intensity: surfacePoints3d.map((point) => displayForce(point.P)),
        colorscale: fieldColorscale,
        opacity: 0.52,
        colorbar: {
          title: `P (${unit('force')})`,
          thickness: 15,
          len: 0.72,
          x: 1.02,
          xpad: 4,
          tickfont: { size: 10 }
        },
        hovertemplate: `P=%{z:.1f} ${unit('force')}<br>Mx=%{x:.1f} ${unit('moment')}<br>My=%{y:.1f} ${unit('moment')}<extra>${
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
        colorbar: { title: `P (${unit('force')})`, thickness: 15, len: 0.72, x: 1.02, xpad: 4, tickfont: { size: 10 } },
        hovertemplate: `P=%{z:.1f} ${unit('force')}<br>Mx=%{x:.1f} ${unit('moment')}<br>My=%{y:.1f} ${unit('moment')}<extra>${view.surfaceResistanceMode === 'design' ? 'Design' : 'Nominal'} surface</extra>`
      }

    const selectedCheck = currentLoadcaseEvidence(selectedLoadcase, selectedLoadcase ? checksById[selectedLoadcase.id] : null)
    const rayDemand = selectedCheck?.codeAdjustedDemand ?? selectedCheck?.demand
    const rayCapacity = selectedCheck?.capacityMultiplier != null ? selectedCheck.capacityPoint : null
    const designRay = view.surfaceResistanceMode === 'design' && selectedCheck && rayDemand && rayCapacity ? [{
      type: 'scatter3d', name: 'Proportional Design load path', mode: 'lines',
      x: [0, displayMoment(rayCapacity.Mx), displayMoment(rayDemand.Mx)],
      y: [0, displayMoment(rayCapacity.My), displayMoment(rayDemand.My)],
      z: [0, displayForce(rayCapacity.P), displayForce(rayDemand.P)],
      line: { color: '#ff1f3d', width: 5 }, hoverinfo: 'skip'
    }, {
      type: 'scatter3d', name: 'Design ray crossing', mode: 'markers',
      x: [displayMoment(rayCapacity.Mx)], y: [displayMoment(rayCapacity.My)], z: [displayForce(rayCapacity.P)],
      marker: { color: '#16a34a', size: 6, symbol: 'diamond' },
      customdata: [[selectedCheck.utilization]],
      hovertemplate: `UR=%{customdata[0]:.3f}<br>P=%{z:.1f} ${unit('force')}<extra>Design ray crossing</extra>`
    }] : []
    return [
      capacityTrace,
      ...designRay,
      ...(fixedPSectionFill ? [fixedPSectionFill] : []),
      ...(surfaceGridWireframe ? [surfaceGridWireframe] : []),
      ...sliceTraces,
      ...beforeCapTraces,
      ...(view.surfaceResistanceMode === 'design' && beforeCapField && inverseResult?.loadcaseId === selectedCheck?.loadcaseId ? [{
        type: 'scatter3d', name: 'Field point before Pmax cap', mode: 'markers',
        x: [displayMoment(beforeCapField.response.Mx)], y: [displayMoment(beforeCapField.response.My)],
        z: [displayForce(beforeCapField.response.P)],
        marker: { size: 7, color: plotPalette.primary, symbol: 'circle', line: { color: plotPalette.markerOutline, width: 1 } },
        hovertemplate: `P=%{z:.1f} ${unit('force')}<extra>Field before Pmax cap · exceeds permitted Design resistance</extra>`
      }] : []),
      ...(ring ? [ring] : []),
      {
        type: 'scatter3d',
        name: 'Loadcases',
        mode: 'markers',
        x: loadcases.map((item) => displayMoment(item.Mx)),
        y: loadcases.map((item) => displayMoment(item.My)),
        z: loadcases.map((item) => displayForce(item.P)),
        customdata: loadcases.map((item) => [item.id, item.name]),
        marker: {
          size: loadcases.map((item) => (item.id === selectedLoadcaseId ? 7 : 5)),
          color: loadcases.map((item) => (item.id === selectedLoadcaseId ? '#f97316' : '#dc2626')),
          line: { color: '#ffffff', width: 1 }
        },
        hovertemplate: `%{customdata[1]}<br>P=%{z:.1f} ${unit('force')}<br>Mx=%{x:.1f} ${unit('moment')}<br>My=%{y:.1f} ${unit('moment')}<extra>Demand</extra>`
      }
    ]
  }, [displayUnits,
    activeAngle,
    activeDisplayP,
    demandExactCurve,
    exactCurve,
    isLoadcaseMode,
    view.includeOppositeMoment,
    loadcases,
    selectedLoadcaseId,
    selectedLoadcase,
    checksById,
    plotPalette,
    surface,
    surfaceContour3d,
    surfaceGrid,
    surfacePoints3d,
    surfaceTriangles3d,
    axialCapLimit,
    beforeCapDataset,
    beforeCapField,
    inverseResult,
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
        bgcolor: 'rgba(0,0,0,0)',
        xaxis: axis(`Mx (${unit('moment')})`),
        yaxis: axis(`My (${unit('moment')})`),
        zaxis: axis(`P (${unit('force')})`),
        aspectmode: 'cube',
        camera: { eye: { x: 1.45, y: 1.35, z: 0.9 } }
      },
      hovermode: 'closest',
      clickmode: 'event+select'
    }
  }, [displayUnits, plotPalette, plotTheme, view.showSceneAxes])

  const contourData = useMemo(() => {
    const nominalOnly = view.showNominalReference && !view.showDesignResistance
    const activeSamples = nominalOnly ? nominalStrainAngleSamples : strainAngleSamples
    const closedX = [...strainAngleSamples.map((point) => displayMoment(point.Mx))]
    const closedY = [...strainAngleSamples.map((point) => displayMoment(point.My))]
    if (strainAngleSamples[0]) {
      closedX.push(displayMoment(strainAngleSamples[0].Mx))
      closedY.push(displayMoment(strainAngleSamples[0].My))
    }
    const nominalClosedX = [...nominalStrainAngleSamples.map((point) => displayMoment(point.Mx))]
    const nominalClosedY = [...nominalStrainAngleSamples.map((point) => displayMoment(point.My))]
    if (nominalStrainAngleSamples[0]) {
      nominalClosedX.push(displayMoment(nominalStrainAngleSamples[0].Mx))
      nominalClosedY.push(displayMoment(nominalStrainAngleSamples[0].My))
    }
    const rayRadius = Math.max(...activeSamples.map((point) => displayMoment(Math.hypot(point.Mx, point.My))), 1) * 1.18
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
              type: 'scatter', name: 'Fixed-P moment ray (secondary)', mode: 'lines',
              x: [0, ...(fixedPCapacityProjection ? [fixedPCapacityProjection.mx] : []), demandProjection.mx],
              y: [0, ...(fixedPCapacityProjection ? [fixedPCapacityProjection.my] : []), demandProjection.my],
              line: { color: '#ff1f3d', width: 1.8 }, hoverinfo: 'skip'
            },
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
              `Mx=%{x:.1f} ${unit('moment')}<br>My=%{y:.1f} ${unit('moment')}<extra>Nominal reference</extra>`
          }]
        : []),
      ...(view.showDesignResistance
        ? [{
            type: 'scatter',
            name: `Design · P = ${fmt(activeDisplayP, 1)} ${unit('force')}`,
            mode: 'lines',
            x: closedX,
            y: closedY,
            line: { color: plotPalette.primary, width: 2.6, shape: 'linear', simplify: false },
            connectgaps: false,
            hovertemplate:
              `Mx=%{x:.1f} ${unit('moment')}<br>My=%{y:.1f} ${unit('moment')}<extra>Design resistance</extra>`
          }]
        : []),
      ...(view.showDesignResistance || view.showNominalReference ? [{
        type: 'scatter',
        name: 'Sampled meridian intersections',
        mode: 'markers+text',
        x: activeSamples.map((point) => displayMoment(point.Mx)),
        y: activeSamples.map((point) => displayMoment(point.My)),
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
          `Strain direction β=%{customdata[0]}°<br>N.A. axis αNA=%{customdata[1]}°<br>⊥ resultant α⊥=%{customdata[2]}°<br>Difference Δα=%{customdata[3]}°<br>Mx=%{x:.1f} ${unit('moment')}<br>My=%{y:.1f} ${unit('moment')}<extra></extra>`
      }] : []),
      ...(view.showDesignResistance && beforeCapContour.length ? [{
        type: 'scatter', name: 'Design before Pmax cap', mode: 'lines',
        x: [...beforeCapContour.map(point => displayMoment(point.Mx)), displayMoment(beforeCapContour[0].Mx)],
        y: [...beforeCapContour.map(point => displayMoment(point.My)), displayMoment(beforeCapContour[0].My)],
        line: { color: plotPalette.primary, width: 2.6, dash: 'dot', shape: 'linear', simplify: false },
        hovertemplate: `Mx=%{x:.1f} ${unit('moment')}<br>My=%{y:.1f} ${unit('moment')}<extra>Before Pmax cap · excluded from Design checks</extra>`
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
                `%{customdata[0]}<br>Mux=%{x:.1f} ${unit('moment')}<br>Muy=%{y:.1f} ${unit('moment')}<br>Pu=%{customdata[1]:.1f} ${unit('force')}<extra>Demand</extra>`
            }
          ]
        : []),
      ...(fixedPCapacityProjection
        ? [{
            type: 'scatter',
            name: 'Fixed-P capacity point',
            mode: 'markers',
            x: [fixedPCapacityProjection.mx],
            y: [fixedPCapacityProjection.my],
            marker: {
              size: 10,
              color: '#16a34a',
              symbol: 'diamond',
              line: { color: plotPalette.markerOutline, width: 1 }
            },
            customdata: [[fixedPCapacityProjection.p]],
            hovertemplate:
              `Mx=%{x:.1f} ${unit('moment')}<br>My=%{y:.1f} ${unit('moment')}<br>P=%{customdata[0]:.1f} ${unit('force')}<extra>Fixed-P capacity</extra>`
          }]
        : [])
    ]
  }, [displayUnits,
    activeDisplayP,
    demandProjection,
    fixedPCapacityProjection,
    nominalStrainAngleSamples,
    beforeCapContour,
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
      ...(view.showDesignResistance ? beforeCapContour : []),
      ...displayedStrainAngleSamples,
      ...(view.showNominalReference ? nominalStrainAngleSamples : [])
    ]
    if (points.length === 0 && !demandProjection) return null
    const xs = points.map((point) => displayMoment(point.Mx))
    const ys = points.map((point) => displayMoment(point.My))
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
  }, [displayUnits,
    demandProjection,
    displayedStrainAngleSamples,
    beforeCapContour,
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
          text: `My (${unit('moment')})`,
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
          text: `Mx (${unit('moment')})`,
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
    [displayUnits, contourAxisRange, plotPalette, plotTheme]
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
    const theta = normalizeAngleDeg(activeAngle) * Math.PI / 180
    if (demandPlaneMode && designDataset) {
      const paths = sliceMomentPlane(designDataset.points, theta, designDataset.triangles)
        .map(path => path.points
          .map(point => ({ m: displayMoment(point.M), p: displayForce(point.P), station: point.station })))
      return { ...empty, displayPaths: paths }
    }
    const project = (point: PreviewSurfacePoint) => ({
      m: displayMoment(point.Mx * Math.cos(theta) + point.My * Math.sin(theta)),
      p: displayForce(point.P),
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
    const markerPath = markerPoints.filter(point => point.surfaceRole !== 'axial-cap').map(project)
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
        ...oppositePoints.filter(point => point.surfaceRole !== 'axial-cap').map(project)
      ],
      keys: [
        ...pickKeys(markerPath, 'primary'),
        ...(oppositePath.length > 0 ? pickKeys(oppositePath, 'opposite') : [])
      ]
    }
  }, [displayUnits, activeAngle, demandExactCurve, demandPlaneMode, designDataset, exactCurve, isLoadcaseMode, surface, view.includeOppositeMoment])

  const beforeCapVerticalPaths = useMemo(() => {
    if (!beforeCapDataset || axialCapLimit === null) return []
    const theta = normalizeAngleDeg(activeAngle) * Math.PI / 180
    const activeExact = isLoadcaseMode ? demandExactCurve : exactCurve
    const paths = demandPlaneMode
      ? sliceMomentPlane(beforeCapDataset.points, theta, beforeCapDataset.triangles).map(path => path.points)
      : buildDirectMeridianSection(activeExact?.beforeAxialCap ?? beforeCapDataset.points, activeAngle,
          !activeExact && view.includeOppositeMoment).displayPaths
    return axialCapExcludedPaths(paths, axialCapLimit).map(path => path.map(point => ({
      m: displayMoment(point.Mx * Math.cos(theta) + point.My * Math.sin(theta)), p: displayForce(point.P)
    })))
  }, [displayUnits, activeAngle, axialCapLimit, beforeCapDataset, demandExactCurve, demandPlaneMode,
    exactCurve, isLoadcaseMode, view.includeOppositeMoment])

  const nominalVerticalPaths = useMemo(() => {
    if (!surface) return [] as Array<Array<{ m: number; p: number; station: number }>>
    const theta = normalizeAngleDeg(activeAngle) * Math.PI / 180
    if (demandPlaneMode && nominalDataset) {
      return sliceMomentPlane(nominalDataset.points, theta, nominalDataset.triangles)
        .map(path => path.points
          .map(point => ({ m: displayMoment(point.M), p: displayForce(point.P), station: point.station })))
    }
    const project = (point: PreviewSurfacePoint) => ({
      m: displayMoment(point.Mx * Math.cos(theta) + point.My * Math.sin(theta)),
      p: displayForce(point.P),
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
  }, [displayUnits, activeAngle, demandExactCurve, demandPlaneMode, exactCurve, isLoadcaseMode, nominalDataset, surface, view.includeOppositeMoment])

  const capCutMarkers = useMemo(() => axialCapLimit === null ? []
    : beforeCapVerticalPaths.flat().filter(point => point.p === displayForce(axialCapLimit)),
  [displayUnits, axialCapLimit, beforeCapVerticalPaths])

  const nominalVerticalAnnotations = useMemo(() => {
    const stations = nominalVerticalPaths.flat()
    if (demandPlaneMode) return { stations: [], keys: [], intermediatePoints: [] }
    const descriptors = nominalDataset?.stations ?? surface?.stations ?? []
    const keys = descriptors.flatMap((descriptor, station) => {
      const definition = descriptor.definition
      if (
        definition.kind !== 'bar-tension-yield-ratio' ||
        (Math.abs(definition.ratio) > 1e-12 && Math.abs(definition.ratio - 1) > 1e-12)
      ) return []
      const point = stations.find((item) => item.station !== undefined && Math.abs(item.station - station) <= 1e-9)
      return point ? [{
        ...point,
        label: descriptor.label,
        side: point.m < 0 ? 'opposite' as const : 'primary' as const
      }] : []
    })
    return { stations, keys, intermediatePoints: [] }
  }, [demandPlaneMode, nominalDataset, nominalVerticalPaths, surface])

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
      ...(demandProjection ? [{
        type: 'scatter', name: demandPlaneMode ? 'Proportional load path' : 'Projected proportional load path', mode: 'lines',
        x: [0, ...(capacityProjection ? [capacityProjection.m] : []), demandProjection.m],
        y: [0, ...(capacityProjection ? [capacityProjection.p] : []), demandProjection.p],
        line: { color: '#ff1f3d', width: 1.8 }, hoverinfo: 'skip'
      }] : []),
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
            hovertemplate: `M=%{x:.1f} ${unit('moment')}<br>P=%{y:.1f} ${unit('force')}<extra>Nominal reference</extra>`
          }))
        : []),
      ...(view.showDesignResistance ? verticalSlice.displayPaths.map((path, index) => ({
        type: 'scatter',
        name:
          demandPlaneMode ? index === 0 ? `Design demand plane θ = ${fmt(activeAngle, 3)}°` : `Design demand-plane loop ${index + 1}`
            : index === 0
              ? `Direct β = ${fmt(activeAngle, exactCurve || demandExactCurve ? 3 : 0)}°`
            : `Direct β = ${fmt(normalizeAngleDeg(activeAngle + 180), 0)}°`,
        mode: 'lines',
        x: path.map((point) => point.m),
        y: path.map((point) => point.p),
        line: primaryLine,
        connectgaps: false,
        marker: { size: 0 },
        hovertemplate: `M=%{x:.1f} ${unit('moment')}<br>P=%{y:.1f} ${unit('force')}<extra>Design resistance</extra>`
      })) : []),
      ...(view.showDesignResistance ? beforeCapVerticalPaths.map(path => ({
        type: 'scatter', name: 'Design before Pmax cap', mode: 'lines',
        x: path.map(point => point.m), y: path.map(point => point.p),
        line: { ...primaryLine, dash: 'dot' }, connectgaps: false,
        hovertemplate: `M=%{x:.1f} ${unit('moment')}<br>P=%{y:.1f} ${unit('force')}<extra>Before Pmax cap · excluded from Design checks</extra>`
      })) : []),
      ...(view.showDesignResistance && capCutMarkers.length ? [{
        type: 'scatter', name: 'Pmax edge intersections', mode: 'markers',
        x: capCutMarkers.map(point => point.m), y: capCutMarkers.map(point => point.p),
        marker: { size: 6, color: plotPalette.primary, symbol: 'circle',
          line: { color: plotPalette.markerOutline, width: 0.8 } },
        hovertemplate: `M=%{x:.1f} ${unit('moment')}<br>P=%{y:.1f} ${unit('force')}<extra>Exact Pmax edge intersection</extra>`
      }] : []),
      ...(view.showDesignResistance || view.showNominalReference ? [{
        type: 'scatter',
        name: demandPlaneMode ? 'Surface intersections' : 'Intermediate intersections',
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
          `Intermediate station=%{customdata:.3f}<br>M=%{x:.1f} ${unit('moment')}<br>P=%{y:.1f} ${unit('force')}<extra></extra>`
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
        hovertemplate: `P%{customdata}<br>M=%{x:.1f} ${unit('moment')}<br>P=%{y:.1f} ${unit('force')}<extra>Station</extra>`
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
        hovertemplate: `%{text}<br>M=%{x:.1f} ${unit('moment')}<br>P=%{y:.1f} ${unit('force')}<extra></extra>`
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
              hovertemplate: `%{text}<br>M=%{x:.1f} ${unit('moment')}<br>P=%{y:.1f} ${unit('force')}<extra></extra>`
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
                `%{customdata[0]}<br>${demandPlaneMode ? 'Mθ' : 'Mβ'}=%{x:.1f} ${unit('moment')}<br>Pu=%{y:.1f} ${unit('force')}<br>Mux=%{customdata[1]:.1f} ${unit('moment')}<br>Muy=%{customdata[2]:.1f} ${unit('moment')}<extra>Demand</extra>`
            }
          ]
        : []),
      ...(capacityProjection
        ? [{
            type: 'scatter',
            name: 'Design ray crossing',
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
              `${demandPlaneMode ? 'Mθ' : 'Mβ'}=%{x:.1f} ${unit('moment')}<br>P=%{y:.1f} ${unit('force')}<br>Mx=%{customdata[0]:.1f} ${unit('moment')}<br>My=%{customdata[1]:.1f} ${unit('moment')}<extra>Design ray crossing</extra>`
          }]
        : []),
      ...(fieldProjection ? [{
        type: 'scatter', name: 'Field point before Pmax cap', mode: 'markers',
        x: [fieldProjection.m], y: [fieldProjection.p],
        marker: { size: 10, color: plotPalette.primary, symbol: 'circle', line: { color: plotPalette.markerOutline, width: 1 } },
        hovertemplate: `M=%{x:.1f} ${unit('moment')}<br>P=%{y:.1f} ${unit('force')}<extra>Field before Pmax cap · exceeds permitted Design resistance</extra>`
      }] : [])
    ]
  }, [displayUnits,
    activeAngle,
    beforeCapVerticalPaths,
    capCutMarkers,
    capacityProjection,
    demandExactCurve,
    demandPlaneMode,
    demandProjection,
    exactCurve,
    fieldProjection,
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
          text: `P (${unit('force')})`,
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
          text: `${demandPlaneMode ? 'Mθ' : 'Mβ'} (${unit('moment')})`,
          showarrow: false,
          xanchor: 'left',
          yanchor: 'top',
          font: { size: 11, color: plotPalette.mutedText }
        }
      ],
      hovermode: 'closest',
      showlegend: false
    }),
    [displayUnits, demandPlaneMode, plotPalette, plotTheme]
  )

  const fieldExtremes = useMemo(() => {
    if (!fieldMap || !sectionField) return null
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
    if (fieldMap.equivalentBlock) {
      const strainAt = (x: number, y: number) =>
        sectionField.state.e0 +
        sectionField.state.kx * (y - fieldMap.origin.y) +
        sectionField.state.ky * (x - fieldMap.origin.x)
      for (const solid of section.solids) {
        for (const ring of [solid.outer, ...solid.holes]) {
          for (const point of ring) push(strainAt(point.x, point.y), 0)
        }
      }
      sigMin = Math.min(sigMin, 0, fieldMap.equivalentBlock.compressionStress)
      sigMax = Math.max(sigMax, 0, fieldMap.equivalentBlock.compressionStress)
    } else {
      for (const tri of fieldMap.triangles) {
        push(tri.strainA, tri.stressA)
        push(tri.strainB, tri.stressB)
        push(tri.strainC, tri.stressC)
      }
    }
    for (const bar of fieldMap.rebars) push(bar.strain, bar.stress)
    if (!Number.isFinite(epsMin)) return null
    return { epsMin, epsMax, sigMin, sigMax }
  }, [fieldMap, sectionField, section.solids])

  const fieldAngleComparison = useMemo(
    () =>
      sectionField && checkedLoadcase
        ? sectionFieldAngleComparison(
            sectionField.state,
            checkedLoadcase.Mx,
            checkedLoadcase.My
          )
        : null,
    [sectionField, checkedLoadcase]
  )

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
      <article className={`pm-results-plot${primary ? ' is-primary' : ''}${isNgCase ? ' is-ng' : ''}`} data-chart={id}>
        <div className="pm-results-plot-chrome ws-chart-controls">
          <div className="pm-results-plot-heading">
            <span className={id === 'heatmap' ? 'pm-field-basis-label' : undefined}
              title={id === 'heatmap' ? title : undefined}
              data-basis={id === 'heatmap' ? fieldEvidence?.basis ?? 'pending' : undefined}>{title}</span>
            {meta ? <strong>{meta}</strong> : null}
          </div>
          <div className="pm-results-plot-tools" role="group" aria-label="Chart layout">
            <button
              type="button"
              className={`ws-action ws-action--quiet ws-action--icon pm-chart-tool${primary ? ' is-active' : ''}`}
              title="Make this the large chart"
              onClick={onMakePrimary}
            >
              <Maximize2 size={14} />
            </button>
            <button type="button" className="ws-action ws-action--quiet ws-action--icon pm-chart-tool" title="Hide chart" onClick={onToggleVisible}>
              <EyeOff size={14} />
            </button>
          </div>
          {controls ? <div className="pm-results-plot-actions">{controls}</div> : null}
        </div>
        <div className="pm-results-plot-body">
          <div className="pm-results-plot-canvas">
            <DeferredChart primary={primary}>{children}</DeferredChart>
            {id !== 'heatmap' && fieldFrameTransition.status === 'previous' &&
              <span className="pm-results-frame-status" role="status">Updating — previous completed result</span>}
          </div>
          {footer}
          {beforeCapDataset && (id === 'vertical' && view.showDesignResistance && beforeCapVerticalPaths.length > 0 ||
            id === 'fixedP' && view.showDesignResistance && beforeCapContour.length > 0 ||
            id === 'surface3d' && view.surfaceResistanceMode === 'design') ? (
            <p className="pm-preview-hint" data-before-cap-legend>Dotted: Design resistance before Pmax cap; excluded from checks.</p>
          ) : null}
        </div>
      </article>
    )
  }

  /**
   * Demand Check with nothing selected must not fall through to the capacity charts: those belong
   * to Section Results only.
   */
  if (viewMode === 'loadcase' && !selectedLoadcase) {
    if (ready && section.solids.length > 0 && demandView.visibleCharts.heatmap) return (
      <section className="pm-results-stage pm-results-stage--charts-only" aria-busy={false}>
        <div className="pm-results-grid pm-results-grid--dynamic primary-heatmap count-1">
          <article className="pm-results-plot is-primary" data-chart="heatmap">
            <div className="pm-results-plot-chrome ws-chart-controls"><div className="pm-results-plot-heading">
              <span>Load reference axes</span><strong>{isAxisPreview ? 'Axis preview — Apply to update the load reference.' : 'Centroid + applied load offsets'}</strong>
            </div></div>
            <div className="pm-results-plot-body"><div className="pm-results-plot-canvas">
              <SectionOutlineChart section={section} rebars={rebars} loadReference={previewReference} />
            </div><p className="pm-preview-hint">Select or add a load combination to view its calculation results.</p></div>
          </article>
        </div>
      </section>
    )
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
        aria-busy={demandWorking}
        data-field-frame={fieldFrameTransition.status}
        data-requested-loadcase={requestedLoadcaseId ?? undefined}
        data-displayed-loadcase={displayFieldSnapshot?.selectedLoadcaseId}
        data-field-basis={fieldEvidence?.basis ?? 'pending'}
        data-field-boundary={sectionField?.basis === 'capacity' ? sectionField.boundary.kind : undefined}
        data-demand-status={inverseResult?.designCheck.evaluated ? inverseResult.designCheck.adequacy : 'pending'}
      >
        <div
          className={`pm-results-grid pm-results-grid--dynamic primary-${demandView.primaryChart} count-${
            Object.values(demandView.visibleCharts).filter(Boolean).length
          }`}
        >
          {renderChartShell({
            id: 'heatmap',
            title: fieldEvidence?.basis === 'capacity' ? 'Field at capacity' : 'Field at demand',
            meta: isNgCase
              ? sectionField ? `NG · λfield = ${fmt(sectionField.loadFactor, 3)}` : 'NG · field unavailable'
              : sectionField ? 'Checked entered demand' : 'Demand field unavailable',
            primary: demandView.primaryChart === 'heatmap',
            visible: demandView.visibleCharts.heatmap,
            onMakePrimary: () => onDemandViewChange({ primaryChart: 'heatmap' }),
            onToggleVisible: () => toggleDemandChart('heatmap'),
            controls: (
              <div className="pm-section-field-toolbar" role="group" aria-label="Section field options">
                <div className="pm-field-mode-toggle ws-joined-buttons" role="group" aria-label="Field mode">
                  <button
                    type="button"
                    className={"ws-action " + (demandView.fieldMode === 'strain' ? 'is-active' : '')}
                    aria-pressed={demandView.fieldMode === 'strain'}
                    title="Strain field"
                    onClick={() => onDemandViewChange({ fieldMode: 'strain' })}
                  >
                    ε
                  </button>
                  <button
                    type="button"
                    className={"ws-action " + (demandView.fieldMode === 'stress' ? 'is-active' : '')}
                    aria-pressed={demandView.fieldMode === 'stress'}
                    title="Stress field"
                    onClick={() => onDemandViewChange({ fieldMode: 'stress' })}
                  >
                    σ
                  </button>
                </div>
                <label
                  className={`ws-check pm-field-check${demandView.showNeutralAxis ? ' is-on' : ''}`}
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
                  className={`ws-check pm-field-check${demandView.showMoments ? ' is-on' : ''}`}
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
                  className={`ws-check pm-field-check${demandView.includeRebar ? ' is-on' : ''}`}
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
            footer: <div className="pm-section-field-footer" data-mechanics={surface?.analysisOptions.methodId}>
              <div className="pm-section-field-status pm-preview-hint" role="status" aria-live="polite">
                {demandWorking && <p>
                  Updating {requestedSelectedLoadcase?.name}.
                  {fieldFrameTransition.status === 'previous'
                    ? ` Showing previous completed result (${selectedLoadcase.name}).` : ' Preparing result.'}
                </p>}
                {isAxisPreview && <p>Axis preview — Apply to update the load reference.</p>}
                {beforeCapField && beforeCapField.boundary.kind === 'before-axial-cap' && <p data-before-cap-note>
                  <strong>Pmax governs.</strong> Field before Pmax cap at the uncapped boundary:
                  {' '}P = {qfmt('force', beforeCapField.response.P, 1)} {unit('force')}
                  {' > '}Pmax = {qfmt('force', beforeCapField.boundary.limit, 1)} {unit('force')}.
                  {' '}This field exceeds permitted Design resistance; UR uses the capped crossing.
                </p>}
                {!fieldMap && !fieldMapWorking && <p>
                  {displayFieldSnapshot?.fieldMessage ?? 'Preparing section-field evidence.'}
                </p>}
              </div>
              {inverseResult ? <div className="pm-section-field-metrics">
                <article className="pm-field-metric-card">
                  <header>Design check / field</header>
                  <div className="pm-field-metric-rows">
                    <div>
                      <span>Solver diagnostic</span>
                      <strong
                        className={solverStatus(inverseResult).tone}
                        title={inverseResult.message}
                      >
                        {solverStatus(inverseResult).label}
                      </strong>
                    </div>
                    <div>
                      <span>UR</span>
                      <strong className="ws-num">
                        {inverseResult.utilization == null ? 'n/a' : fmt(inverseResult.utilization, 3)}
                      </strong>
                    </div>
                    <div>
                      <span>Fixed-P UR</span>
                      <strong className="ws-num">
                        {inverseResult.fixedPUtilization == null
                          ? 'n/a'
                          : fmt(inverseResult.fixedPUtilization, 3)}
                      </strong>
                    </div>
                    <div>
                      <span>Field residual</span>
                      <strong className="ws-num">{sectionField ? sci(sectionField.residualNorm, 2) : '—'}</strong>
                    </div>
                    <div title="Actual epsilon=0 neutral-axis line, measured CCW from section +x modulo 180 degrees.">
                      <span>N.A. axis αNA</span>
                      <strong className="ws-num">
                        {fieldAngleComparison?.neutralAxis == null
                          ? 'n/a'
                          : `${fmt(fieldAngleComparison.neutralAxis, 1)}°`}
                      </strong>
                    </div>
                  </div>
                </article>

                {sectionField && fieldMap ? <><article className="pm-field-metric-card">
                  <header>Strain</header>
                  <div className="pm-field-metric-rows">
                    {sectionField.equivalentBlock ? (
                      <>
                        <div title="Neutral-axis depth measured from the extreme compression edge along the block normal.">
                          <span>N.A. depth c</span>
                          <strong className="ws-num">{qfmt('length', sectionField.equivalentBlock.neutralAxisDepth, 2)} {unit('length')}</strong>
                        </div>
                        <div>
                          <span>Block factor β1</span>
                          <strong className="ws-num">{fmt(sectionField.equivalentBlock.beta1, 3)}</strong>
                        </div>
                        <div title="Equivalent rectangular compression-block depth.">
                          <span>a = β1·c</span>
                          <strong className="ws-num">{qfmt('length', sectionField.equivalentBlock.blockDepth, 2)} {unit('length')}</strong>
                        </div>
                        <div title="Full section depth projected onto the compression-block normal.">
                          <span>Depth Dθ</span>
                          <strong className="ws-num">{qfmt('length', sectionField.equivalentBlock.projectedSectionDepth, 2)} {unit('length')}</strong>
                        </div>
                        <div>
                          <span>εt / bar</span>
                          <strong className="ws-num">
                            {sectionField.equivalentBlock.controllingTensileStrain == null
                              ? 'n/a'
                              : fmt(sectionField.equivalentBlock.controllingTensileStrain, 6)}
                            {' · '}
                            {sectionField.equivalentBlock.controllingBarId ?? 'n/a'}
                          </strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span title="Strain at the centroidal calculation origin">εC</span>
                          <strong className="ws-num">{fmt(sectionField.state.e0, 6)}</strong>
                        </div>
                        <div>
                          <span>kx</span>
                          <strong className="ws-num">{qfmt('curvature', sectionField.state.kx, 8)} {unit('curvature')}</strong>
                        </div>
                        <div>
                          <span>ky</span>
                          <strong className="ws-num">{qfmt('curvature', sectionField.state.ky, 8)} {unit('curvature')}</strong>
                        </div>
                      </>
                    )}
                    <div>
                      <span>ε max</span>
                      <strong className="ws-num">
                        {fieldExtremes ? fmt(fieldExtremes.epsMax, 6) : '—'}
                      </strong>
                    </div>
                    <div>
                      <span>ε min</span>
                      <strong className="ws-num">
                        {fieldExtremes ? fmt(fieldExtremes.epsMin, 6) : '—'}
                      </strong>
                    </div>
                  </div>
                </article>

                <article className="pm-field-metric-card">
                  <header>Stress</header>
                  <div className="pm-field-metric-rows">
                    {sectionField.equivalentBlock ? (
                      <>
                        <div>
                          <span>Block stress</span>
                          <strong className="ws-num">{qfmt('stress', sectionField.equivalentBlock.compressionStress, 3)} {unit('stress')}</strong>
                        </div>
                        <div>
                          <span>Block area Ac</span>
                          <strong className="ws-num">
                            {sectionField.equivalentBlock.concreteBlockArea == null
                              ? 'n/a'
                              : `${qfmt('area', sectionField.equivalentBlock.concreteBlockArea, 1)} ${unit('area')}`}
                          </strong>
                        </div>
                        <div>
                          <span>Cc</span>
                          <strong className="ws-num">
                            {sectionField.equivalentBlock.concreteForce == null
                              ? 'n/a'
                              : `${fmt(displayForce(sectionField.equivalentBlock.concreteForce), 1)} ${unit('force')}`}
                          </strong>
                        </div>
                      </>
                    ) : null}
                    <div>
                      <span>σ max</span>
                      <strong className="ws-num">{fieldExtremes ? `${qfmt('stress', fieldExtremes.sigMax, 2)} ${unit('stress')}` : '—'}</strong>
                    </div>
                    <div>
                      <span>σ min</span>
                      <strong className="ws-num">{fieldExtremes ? `${qfmt('stress', fieldExtremes.sigMin, 2)} ${unit('stress')}` : '—'}</strong>
                    </div>
                    <div>
                      <span>Δσ</span>
                      <strong className="ws-num">
                        {fieldExtremes
                          ? `${qfmt('stress', fieldExtremes.sigMax - fieldExtremes.sigMin, 2)} ${unit('stress')}`
                          : '—'}
                      </strong>
                    </div>
                  </div>
                </article>

                </> : <><FieldMetricPlaceholder title="Strain" /><FieldMetricPlaceholder title="Stress" /></>}
                <article className="pm-field-metric-card">
                  <header>Demand at centroid</header>
                  <div className="pm-field-metric-rows">
                    <div>
                      <span>Pu</span>
                      <strong className="ws-num">{inverseResult.demand.P > 0 ? '+' : ''}{fmt(displayForce(inverseResult.demand.P), 1)} {unit('force')}</strong>
                    </div>
                    <div>
                      <span>Mux</span>
                      <strong className="ws-num">{inverseResult.demand.Mx > 0 ? '+' : ''}{fmt(displayMoment(inverseResult.demand.Mx), 1)} {unit('moment')}</strong>
                    </div>
                    <div>
                      <span>Muy</span>
                      <strong className="ws-num">{inverseResult.demand.My > 0 ? '+' : ''}{fmt(displayMoment(inverseResult.demand.My), 1)} {unit('moment')}</strong>
                    </div>
                    <div>
                      <span>|M|</span>
                      <strong className="ws-num">
                        {fmt(displayMoment(Math.hypot(inverseResult.demand.Mx, inverseResult.demand.My)), 1)} {unit('moment')}
                      </strong>
                    </div>
                    <div
                      title="Reference line perpendicular to the in-section resultant direction (Muy,Mux)."
                    >
                      <span>Ref. ⊥Rₘ · α⊥</span>
                      <strong className="ws-num">
                        {fieldAngleComparison?.perpendicularBendingAxis == null
                          ? 'n/a'
                          : `${fmt(fieldAngleComparison.perpendicularBendingAxis, 1)}°`}
                      </strong>
                    </div>
                  </div>
                </article>
              </div> : <div className="pm-section-field-metrics">
                {['Design check / field', 'Strain', 'Stress', 'Demand at centroid'].map(title =>
                  <FieldMetricPlaceholder key={title} title={title} />)}
              </div>}
            </div>,
            children: displayFieldSnapshot?.map && sectionField ? (
              <SectionFieldChart
                axesReference={previewReference}
                loadReference={loadReference}
                fieldMap={displayFieldSnapshot.map}
                section={section}
                fieldMode={demandView.fieldMode}
                state={sectionField.state}
                Mx={checkedLoadcase?.Mx ?? 0}
                My={checkedLoadcase?.My ?? 0}
                showNeutralAxis={demandView.showNeutralAxis}
                showMoments={demandView.showMoments}
                includeRebar={demandView.includeRebar}
              />
            ) : (
              <SectionOutlineChart section={section} rebars={rebars} loadReference={previewReference} />
            )
          })}

          {renderChartShell({
            id: 'fixedP',
            title: 'Fixed-P Mx-My',
            meta: `P = ${fmt(activeDisplayP, 1)} ${unit('force')}`,
            primary: demandView.primaryChart === 'fixedP',
            visible: demandView.visibleCharts.fixedP,
            onMakePrimary: () => onDemandViewChange({ primaryChart: 'fixedP' }),
            onToggleVisible: () => toggleDemandChart('fixedP'),
            controls: (
              <>
                <QuantitySlider quantity="force" label="P" value={activeFixedP} min={surface?.bounds.P[0] ?? 0} max={surface?.bounds.P[1] ?? 0} disabled onValueChange={onFixedPChange} />
                <label
                  className={`ws-check pm-field-check${view.showFixedPAngleRays ? ' is-on' : ''}`}
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
            footer: strainAngleSamples.length === 0
              ? <p className="pm-preview-hint" role="status">No Design contour exists at this Pu. Governing 3D UR remains available.</p> : null,
            children: <PlotlyChart data={contourData} layout={contourLayout} config={plotConfig} />
          })}

          {renderChartShell({
            id: 'vertical',
            title: demandPlaneMode ? 'Demand-direction P–M' : 'Direct β meridian',
            meta: `${demandPlaneMode ? checkedLoadcase && Math.hypot(checkedLoadcase.Mx, checkedLoadcase.My) > 0 ? 'θload' : 'θinspect' : equilibriumBeta == null ? 'βselected' : sectionField?.basis === 'capacity' ? 'βcapacity' : 'βdemand'} = ${fmt(activeAngle, 3)}° · UR = ${inverseResult?.utilization == null ? 'n/a' : fmt(inverseResult.utilization, 3)}`,
            primary: demandView.primaryChart === 'vertical',
            visible: demandView.visibleCharts.vertical,
            onMakePrimary: () => onDemandViewChange({ primaryChart: 'vertical' }),
            onToggleVisible: () => toggleDemandChart('vertical'),
            controls: (
              <>
                <fieldset className="pm-result-radio-group ws-joined-buttons" aria-label="Demand vertical slice">
                  <label className={demandPlaneMode ? 'is-active' : ''}>
                    <input type="radio" name="demand-vertical-slice" checked={demandPlaneMode}
                      onChange={() => onDemandViewChange({ verticalMode: 'demand-plane' })} />Demand θ
                  </label>
                  <label className={!demandPlaneMode ? 'is-active' : ''}>
                    <input type="radio" name="demand-vertical-slice" checked={!demandPlaneMode}
                      onChange={() => onDemandViewChange({ verticalMode: 'direct-beta' })} />Direct β
                  </label>
                </fieldset>
                <SyncedControl
                  label={demandPlaneMode ? 'θload' : 'β'}
                  title={demandPlaneMode ? 'Checked demand moment direction' : 'Section-field strain-gradient direction, or selected inspection angle'}
                  value={Number(activeAngle.toFixed(3))}
                  min={0}
                  max={360}
                  step={0.001}
                  unit="deg"
                  disabled={demandPlaneMode || equilibriumBeta != null}
                  inputValue={!demandPlaneMode && equilibriumBeta == null ? String(demandView.directAngle) : undefined}
                  inputWorking={!demandPlaneMode && fieldMapWorking}
                  onChange={value => onDemandViewChange({ directAngle: normalizeAngleDeg(value) })}
                />
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
                className={`ws-check pm-field-check${view.includeOppositeMoment ? ' is-on' : ''}`}
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
                className={`ws-check pm-field-check${view.showSceneAxes ? ' is-on' : ''}`}
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
          meta: `P = ${fmt(displayForce(fixedP), 1)} ${unit('force')}`,
          primary: view.primaryChart === 'fixedP',
          visible: view.visibleCharts.fixedP,
          onMakePrimary: () => onViewChange({ primaryChart: 'fixedP' }),
          onToggleVisible: () => toggleSectionChart('fixedP'),
          controls: (
            <>
              <QuantitySlider quantity="force" label="P" value={fixedP} min={surface?.bounds.P[0] ?? 0} max={surface?.bounds.P[1] ?? 0} onValueChange={onFixedPChange} />
              <label
                className={`ws-check pm-field-check${view.showFixedPAngleRays ? ' is-on' : ''}`}
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
