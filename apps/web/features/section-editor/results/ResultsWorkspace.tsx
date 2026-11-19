'use client'

import { fromCanonical, toCanonical } from '@pm/units'
import { QuantitySlider, QuantityValue, UnitLabel, useQuantityFormatters } from '../shared/DisplayUnits'

import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { EyeOff, Loader2, Maximize2, RotateCw } from 'lucide-react'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { DesignBasis } from '@pm/design'
import { CENTROID_LOAD_REFERENCE, type LoadCombination, type LoadReference } from '@pm/project'
import {
  activeDesignSurfaceDataset,
  activeNominalSurfaceDataset,
  axialCapExcludedPaths,
  contourStrainAngleSamples,
  intersectFixedPContourWithMomentRay,
  fixedPContourPaths,
  fixedPContourLinePoints,
  resultantMomentCoordinate,
  resolveLoadcaseField,
  sliceFixedPContour,
  strainGradientDirection,
  summarizeSectionField,
  type LoadDirectionCurve,
  type InversePreviewResult,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type Resultant,
  type SectionFieldMap
} from '@pm/analysis'
import {
  buildSectionFieldMapAsync,
  buildLoadDirectionCurveAsync,
  isAnalysisAbort
} from '../../../application/analysis/client'
import { PlotlyChart } from './PlotlyChart'
import { FieldOperatingPoints } from './FieldOperatingPoints'
import { DemandGridSplitHandle } from './DemandGridSplitHandle'
import { chartText, curvePointCriteria, detailPaneText, plottedPointsText,
  type DetailPaneGroup, type PlottedTrace2D } from './demand-chart-text'
import { demandPmTraces } from './demand-pm-chart'
import { DemandChartDataDialog, type DemandChartData } from './DemandChartDataDialog'
import {
  SECTION_CHART_IDS,
  toggleChartVisibility,
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
  buildClosedSurfaceTriangles,
  isMeridianOrParallelEdge,
  triangulatePlanarPolygon
} from './surface-plot-geometry'
import { buildDemandPmGeometry } from '@pm/analysis'
import {
  currentLoadcaseEvidence,
  currentLoadcaseFrame,
  sameLoadcaseAnalysisInputs,
  loadcaseFrameForTransition,
  sameLoadcaseDemand
} from './loadcase-calculation-trace'

type ResultsViewMode = 'overview' | 'loadcase'
type ResultsTheme = 'light' | 'dark'
/**
 * Recent load-direction curves kept on the main thread (the shown, the outgoing and revisits). A curve
 * is a few hundred points; the worker keeps 32 per surface, so revisits beyond this are a cache read.
 */
const LOAD_CURVE_FRAMES = 16
/** Delay before a moved Capacity θ requests its curve, so a drag builds only where it stops. */
const CAPACITY_THETA_SETTLE_MS = 120
const THETA_CHART_TITLE = 'P–M at θ'
const THETA_CHART_DESCRIPTION = 'Vertical cut of the capacity surface at the moment direction θ = atan2(My, Mx). Each point is a compatible ultimate state whose moment points along θ, with its own strain direction β. Mθ = Mx cos θ + My sin θ.'
const coordinateOriginTrace = (color: string, xLabel: string, yLabel: string) => ({
  type: 'scatter', name: 'Coordinate origin', mode: 'markers+text', x: [0], y: [0],
  text: ['O'], textposition: 'bottom left', textfont: { size: 10, color },
  marker: { size: 5, color }, showlegend: false, meta: { family: 'coordinate-origin' },
  hovertemplate: `O<br>${xLabel}=0<br>${yLabel}=0<extra>Coordinate origin</extra>`
})

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
  /** Capacity P–M at θ: the curve on screen, shared with the Chart data panel (null while building). */
  onCapacityCurveChange?: (curve: LoadDirectionCurve | null) => void
  fixedP: number
  onFixedPChange: (value: number) => void
  view: SectionResultsView
  demandView: DemandCheckView
  onViewChange: (patch: Partial<SectionResultsView>) => void
  onDemandViewChange: (patch: Partial<DemandCheckView>) => void
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
      {unit && <em>{unit}</em>}
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
/** A small value as `m × 10ⁿ` (e.g. curvatures of the order 10⁻⁷ mm⁻¹). */
const powerOfTen = (value: number, digits = 3): ReactNode => {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) < 1e-30) return '0'
  const [mantissa, exponent] = value.toExponential(digits).split('e')
  return <>{mantissa.replace('-', '−')} × 10<sup>{Number(exponent).toString().replace('-', '−')}</sup></>
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

const FieldMetricPlaceholder = ({ title }: { title: string }) => (
  <article className="pm-field-metric-card" data-text-group>
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
  onCapacityCurveChange,
  fixedP,
  onFixedPChange,
  view,
  demandView,
  onViewChange,
  onDemandViewChange,
  onLoadcaseUpdatingChange
}: Props) {
  const { displayUnits, qfmt, unit, force, moment, displayForce, displayMoment } = useQuantityFormatters()
  const [chartData, setChartData] = useState<DemandChartData | null>(null)
  useEffect(() => { setChartData(null) }, [viewMode, requestedLoadcaseId, requestedSurface])
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
    /** Checked moment direction θ of this frame; its load-direction curve is matched on it. */
    requestedTheta: number | null
  } | null>(null)
  /**
   * engineering/05 §3: Demand P–M curves by surface and θ, newest first. The curve is the slowest
   * part of a loadcase switch, so it is fetched beside the field frame rather than inside it; a frame
   * shows only the curve of its own surface and θ, never another loadcase's.
   */
  const [loadCurves, setLoadCurves] = useState<Array<{ surface: PreviewSurface; theta: number; curve: LoadDirectionCurve | null }>>([])
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
  const fieldCheckLabel = inverseResult?.designCheck.evaluated
    ? inverseResult.designCheck.adequacy === 'adequate' ? 'OK' : isNgCase ? 'NG' : 'Indeterminate'
    : 'Pending'
  const section = displayFieldSnapshot?.section ?? requestedSection
  const rebars = displayFieldSnapshot?.rebars ?? requestedRebars
  const materialStore = displayFieldSnapshot?.materialStore ?? requestedMaterialStore
  const designBasis = displayFieldSnapshot?.designBasis ?? requestedDesignBasis
  const curveEntryFor = (target: PreviewSurface | null | undefined, theta: number | null | undefined) =>
    target && theta != null ? loadCurves.find((entry) => entry.surface === target && entry.theta === theta) ?? null : null
  const demandLoadCurve = curveEntryFor(displayFieldSnapshot?.surface, displayFieldSnapshot?.requestedTheta)?.curve ?? null
  // θ of the requested loadcase's checked demand (code adjustment included); none for zero moment.
  const requestedCheckedDemand = requestedInverseResult && requestedSelectedLoadcase &&
    sameLoadcaseDemand(requestedInverseResult.demand, requestedSelectedLoadcase)
    ? requestedInverseResult.codeAdjustedDemand ?? requestedInverseResult.demand : null
  const requestedTheta = requestedCheckedDemand && Math.hypot(requestedCheckedDemand.Mx, requestedCheckedDemand.My) > 0
    ? Math.atan2(requestedCheckedDemand.My, requestedCheckedDemand.Mx) : null
  const curvePending = requestedIsLoadcaseMode && requestedSurface != null && requestedTheta !== null &&
    curveEntryFor(requestedSurface, requestedTheta) === null
  // Capacity P–M at θ (engineering/05 §3, root 05 §8): θ is the moment direction in Mx–My, never a
  // strain angle. The ± view adds the θ + 180° half of the same vertical plane.
  const capacityThetaDeg = normalizeAngleDeg(view.sliceAngle)
  const capacityTheta = capacityThetaDeg * Math.PI / 180
  const capacityOppositeTheta = normalizeAngleDeg(capacityThetaDeg + 180) * Math.PI / 180
  const capacityThetas = viewMode !== 'loadcase' && requestedSurface
    ? [capacityTheta, ...(view.includeOppositeMoment ? [capacityOppositeTheta] : [])] : []
  const requestedCapacityCurve = viewMode !== 'loadcase' ? curveEntryFor(requestedSurface, capacityTheta)?.curve ?? null : null
  const requestedCapacityOppositeCurve = viewMode !== 'loadcase' && view.includeOppositeMoment
    ? curveEntryFor(requestedSurface, capacityOppositeTheta)?.curve ?? null : null
  const capacityCurvePending = capacityThetas.some((theta) => curveEntryFor(requestedSurface, theta) === null)
  // While a new θ is being built, the chart, 3D view and Chart data keep the last complete pair of
  // curves (each drawn and labelled at its own θ) instead of going blank.
  const [lastCapacityCurves, setLastCapacityCurves] = useState<{
    surface: PreviewSurface; curve: LoadDirectionCurve | null; opposite: LoadDirectionCurve | null
  } | null>(null)
  useEffect(() => {
    if (!requestedSurface || capacityCurvePending || viewMode === 'loadcase') return
    setLastCapacityCurves({ surface: requestedSurface, curve: requestedCapacityCurve, opposite: requestedCapacityOppositeCurve })
  }, [capacityCurvePending, requestedCapacityCurve, requestedCapacityOppositeCurve, requestedSurface, viewMode])
  const heldCapacity = capacityCurvePending && lastCapacityCurves?.surface === requestedSurface ? lastCapacityCurves : null
  const capacityCurve = heldCapacity ? heldCapacity.curve : requestedCapacityCurve
  const capacityOppositeCurve = heldCapacity ? view.includeOppositeMoment ? heldCapacity.opposite : null : requestedCapacityOppositeCurve
  const [fieldMapWorking, setFieldMapWorking] = useState(false)
  const [thetaDraft, setThetaDraft] = useState(() => String(view.sliceAngle))
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
  const demandWorking = requestedIsLoadcaseMode && (busy || loadcaseUpdating || fieldMapWorking || curvePending)

  useEffect(() => {
    onLoadcaseUpdatingChange?.(demandWorking)
  }, [demandWorking, onLoadcaseUpdatingChange])

  useEffect(
    () => () => onLoadcaseUpdatingChange?.(false),
    [onLoadcaseUpdatingChange]
  )

  // engineering/05 §3: β is that of the strength point of the selected check (the displayed field).
  const strengthPointBeta = useMemo(() => {
    if (!isLoadcaseMode || !sectionField) return null
    return strainGradientDirection(sectionField.state)
  }, [sectionField, isLoadcaseMode])

  useEffect(() => {
    if (!requestedIsLoadcaseMode || !requestedSurface) {
      // Menu navigation does not invalidate a completed frame on the same immutable surface.
      // Keep the single frame, but withdraw it when its source surface or row disappears.
      if (!requestedSurface || fieldSnapshot && (fieldSnapshot.surface !== requestedSurface ||
        !requestedLoadcases.some(loadcase => loadcase.id === fieldSnapshot.selectedLoadcaseId))) {
        setFieldSnapshot(null)
      }
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
    const field = resolveLoadcaseField(requestedInverseResult, requestedSurface.analysisOptions.methodId)
    const physical = field.status === 'available' ? field : null
    // The checked demand direction, including any code adjustment (root 05 §9); none for zero moment.
    const theta = requestedTheta
    const completed = currentLoadcaseFrame(requestedSelectedLoadcase, requestedInverseResult, requestedSurface, fieldSnapshot)
    if (completed && completed.requestedTheta === theta && sameLoadcaseAnalysisInputs(completed, {
      surface: requestedSurface, section: requestedSection, rebars: requestedRebars,
      materialStore: requestedMaterialStore, designBasis: requestedDesignBasis
    })) {
      setFieldMapWorking(false)
      return
    }
    const controller = new AbortController()
    setFieldMapWorking(true)
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

    // Field and diagnostic result form one visual frame. The load-direction curve is fetched by its
    // own effect and joins the frame only when it was built for this frame's surface and θ.
    Promise.allSettled([fieldPromise])
      .then(([mapResult]) => {
        if (controller.signal.aborted) return
        const map = mapResult.status === 'fulfilled' ? mapResult.value : null
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
            requestedTheta: theta
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
    requestedLoadcases,
    requestedMaterialStore,
    requestedRebars,
    requestedSelectedLoadcase,
    requestedSection,
    requestedSurface,
    requestedTheta,
    fieldSnapshot
  ])

  // The load-direction curves the view needs: the checked θ in Demand Check (fetched beside the field
  // frame), the requested θ (and θ + 180°) in Capacity. One at a time; the worker keeps its own
  // per-surface cache, so returning to a θ is a cache read.
  const missingCurveTheta = requestedIsLoadcaseMode
    ? curvePending ? requestedTheta : null
    : capacityThetas.find((theta) => curveEntryFor(requestedSurface, theta) === null) ?? null
  useEffect(() => {
    if (!requestedSurface || missingCurveTheta === null) return
    const controller = new AbortController()
    const surfaceAtRequest = requestedSurface
    const thetaAtRequest = missingCurveTheta
    const store = (curve: LoadDirectionCurve | null) => setLoadCurves((current) => [
      { surface: surfaceAtRequest, theta: thetaAtRequest, curve },
      // Keep a few recent curves of this surface so an outgoing frame keeps its own curve.
      ...current.filter((entry) => entry.surface === surfaceAtRequest && entry.theta !== thetaAtRequest)
    ].slice(0, LOAD_CURVE_FRAMES))
    const request = () => buildLoadDirectionCurveAsync({
      calculationProfileId: surfaceAtRequest.calculationProfileId ?? 'kds-2024-stress-strain',
      section: requestedSection,
      rebars: requestedRebars,
      materialStore: requestedMaterialStore,
      designBasis: requestedDesignBasis,
      surface: surfaceAtRequest,
      theta: thetaAtRequest
    }, controller.signal)
      .then((curve) => { if (!controller.signal.aborted) startTransition(() => store(curve)) })
      // A failed curve is recorded as absent, so the chart states it instead of retrying forever.
      .catch((error) => { if (!isAnalysisAbort(error) && !controller.signal.aborted) store(null) })
    // A dragged Capacity θ slider settles before a curve is built; a loadcase switch starts at once.
    const timer = requestedIsLoadcaseMode ? null : window.setTimeout(request, CAPACITY_THETA_SETTLE_MS)
    if (requestedIsLoadcaseMode) void request()
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      controller.abort()
    }
  }, [
    missingCurveTheta,
    requestedDesignBasis,
    requestedIsLoadcaseMode,
    requestedMaterialStore,
    requestedRebars,
    requestedSection,
    requestedSurface
  ])

  // The Chart data panel tabulates the Capacity curve on screen.
  useEffect(() => {
    onCapacityCurveChange?.(capacityCurve)
  }, [capacityCurve, onCapacityCurveChange])

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

  const activeFixedP = isLoadcaseMode && checkedLoadcase ? checkedLoadcase.P : fixedP
  useEffect(() => {
    setThetaDraft(String(Number(capacityThetaDeg.toFixed(6))))
  }, [capacityThetaDeg])
  const demandProjection = useMemo(() => {
    if (!isLoadcaseMode || !checkedLoadcase) return null
    return {
      mx: displayMoment(checkedLoadcase.Mx),
      my: displayMoment(checkedLoadcase.My),
      p: displayForce(checkedLoadcase.P),
      name: checkedLoadcase.name
    }
  }, [displayUnits, isLoadcaseMode, checkedLoadcase])
  const checkBasis = inverseResult?.designCheck.evaluated ? inverseResult.designCheck.definition : null
  const constantAxialCheck = checkBasis === 'constantAxial'
  const checkBasisLabel = constantAxialCheck ? 'Constant P' : checkBasis ? '3D Load Ray' : 'Pending'
  const currentDemandPm = useMemo(() => isLoadcaseMode && surface ? {
    geometry: buildDemandPmGeometry({
      surface, curve: demandLoadCurve, demand: checkedLoadcase,
      governingPoint: inverseResult?.designCapacityPoint ?? null, basis: checkBasis ?? 'proportional3D'
    }),
    surface,
    constantP: constantAxialCheck,
    beforeCap: beforeCapField?.response ?? null
  } : null, [isLoadcaseMode, surface, demandLoadCurve, checkedLoadcase, inverseResult, checkBasis, constantAxialCheck, beforeCapField])
  // The P–M chart changes once per switch: while the new frame's curve is still being built, it keeps
  // the last complete P–M of the same surface (curve, demand and governing point together) instead of
  // first redrawing without a curve. The header says it is updating; the detail pane is never lagged.
  const currentPmComplete = currentDemandPm !== null &&
    (currentDemandPm.geometry.curveStatus !== 'missing-curve' || displayFieldSnapshot?.requestedTheta == null)
  const [lastCompletePm, setLastCompletePm] = useState<typeof currentDemandPm>(null)
  useEffect(() => { if (currentPmComplete) setLastCompletePm(currentDemandPm) }, [currentPmComplete, currentDemandPm])
  const shownDemandPm = currentPmComplete || !lastCompletePm || lastCompletePm.surface !== surface || !isLoadcaseMode
    ? currentDemandPm : lastCompletePm
  const demandPm = shownDemandPm?.geometry ?? null
  /** The current frame's own geometry: detail-pane readouts never come from a lagged chart. */
  const currentPm = currentDemandPm?.geometry ?? null
  const betaReadout = strengthPointBeta == null ? '—' : (strengthPointBeta * 180 / Math.PI).toFixed(3)
  const loadAngleReadout = currentPm?.theta == null ? '—' : (currentPm.theta * 180 / Math.PI).toFixed(3)
  const demandPmData = useMemo(() => shownDemandPm ? demandPmTraces(shownDemandPm.geometry, {
    ...plotPalette, showDesign: view.showDesignResistance, showNominal: view.showNominalReference,
    constantP: shownDemandPm.constantP,
    displayForce, displayMoment, forceUnit: unit('force'), momentUnit: unit('moment'),
    criterion: (point, stage) => curvePointCriteria(point.stationId, point.role,
      (stage === 'nominal' ? nominalDataset?.stations : designDataset?.stations) ?? surface?.stations ?? [], point.between)
  }, shownDemandPm.beforeCap) : [], [shownDemandPm, plotPalette, view.showDesignResistance,
    view.showNominalReference, displayForce, displayMoment, unit,
    nominalDataset, designDataset, surface])

  const activeDisplayP = displayForce(activeFixedP)
  const minDisplayP = surface ? displayForce(surface.bounds.P[0]) : 0
  const maxDisplayP = surface ? displayForce(surface.bounds.P[1]) : 0
  const thetaSliderMax = view.includeOppositeMoment ? 180 : 360
  /** θ is any moment direction: no snapping to the sampled strain directions of the surface. */
  const setCapacityTheta = (value: number) => {
    if (!Number.isFinite(value)) return
    const next = view.includeOppositeMoment ? ((value % 180) + 180) % 180 : normalizeAngleDeg(value)
    setThetaDraft(String(Number(next.toFixed(6))))
    onViewChange({ sliceAngle: next })
  }
  const applyThetaDraft = () => {
    const value = Number(thetaDraft)
    if (thetaDraft.trim() === '' || !Number.isFinite(value)) {
      setThetaDraft(String(Number(capacityThetaDeg.toFixed(6))))
      return
    }
    setCapacityTheta(value)
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
    if (!isLoadcaseMode || !checkedLoadcase || contour.length < 2) return null
    if (Math.hypot(checkedLoadcase.Mx, checkedLoadcase.My) < 1e-9) return null
    const point = intersectFixedPContourWithMomentRay(
      contour,
      Math.atan2(checkedLoadcase.My, checkedLoadcase.Mx)
    )
    return point
      ? { mx: displayMoment(point.Mx), my: displayMoment(point.My), p: displayForce(point.P) }
      : null
  }, [displayUnits, isLoadcaseMode, checkedLoadcase, contour])
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
    ? contour
    : nominalContour

  /** The ± view draws θ and θ + 180°, so θ itself stays within [0, 180). */
  useEffect(() => {
    if (!view.includeOppositeMoment) return
    const wrapped = normalizeAngleDeg(view.sliceAngle)
    if (wrapped >= 180) onViewChange({ sliceAngle: wrapped - 180 })
  }, [onViewChange, view.includeOppositeMoment, view.sliceAngle])

  const surfaceData = useMemo(() => {
    // The 3D surface is a Capacity chart; Demand Check never mounts it, so a loadcase switch (which
    // moves the P plane and β) must not rebuild its wireframe and mesh traces.
    if (!surface || surfacePoints3d.length === 0 || isLoadcaseMode) return []
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
          x: fixedPContourLinePoints(surfaceContour3d).map(point => point ? displayMoment(point.Mx) : null),
          y: fixedPContourLinePoints(surfaceContour3d).map(point => point ? displayMoment(point.My) : null),
          z: fixedPContourLinePoints(surfaceContour3d).map(point => point ? pPlane : null),
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
    // The Capacity P–M at θ curve (and θ + 180°) on the surface: each point is a physical state.
    const curvesFor3d = [capacityCurve, capacityOppositeCurve].filter((curve): curve is LoadDirectionCurve => curve !== null)
    const curvePaths3d = curvesFor3d.flatMap((curve) =>
      view.surfaceResistanceMode === 'design' ? curve.designPaths : curve.nominalPaths)
    const sliceTraces = curvePaths3d.length ? [{
      type: 'scatter3d',
      name: 'P–M at θ',
      mode: 'lines',
      x: curvePaths3d.flatMap((path) => [...path.map((point) => displayMoment(point.Mx)), null]),
      y: curvePaths3d.flatMap((path) => [...path.map((point) => displayMoment(point.My)), null]),
      z: curvePaths3d.flatMap((path) => [...path.map((point) => displayForce(point.P)), null]),
      line: { color: '#7c3aed', width: 7 },
      hoverinfo: 'skip'
    }] : []

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
          const excludedDirect = curvesFor3d.flatMap((curve) => curve.beforeAxialCapPaths)
          const trace = (paths: Resultant[][], name: string, color: string, width: number) => ({
            type: 'scatter3d', name, mode: 'lines',
            x: paths.flatMap(path => [...path.map(point => displayMoment(point.Mx)), null]),
            y: paths.flatMap(path => [...path.map(point => displayMoment(point.My)), null]),
            z: paths.flatMap(path => [...path.map(point => displayForce(point.P)), null]),
            line: { color, width, dash: 'dot' },
            hovertemplate: `P=%{z:.1f} ${unit('force')}<extra>Before Pmax cap · excluded from Design checks</extra>`
          })
          return [trace(excluded, 'Design grid before Pmax cap', plotPalette.surfaceWireframe, 1.05),
            trace(excludedDirect, 'P–M at θ before Pmax cap', '#7c3aed', 7)]
        })() : []

    const fixedPTopology = fixedPContourPaths(surfaceContour3d).length === 1 && surfaceContour3d[0]?.pathClosed !== false ? triangulatePlanarPolygon(
      surfaceContour3d.map((point) => ({ u: point.Mx, v: point.My }))
    ) : []
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

    return [
      capacityTrace,
      ...(fixedPSectionFill ? [fixedPSectionFill] : []),
      ...(surfaceGridWireframe ? [surfaceGridWireframe] : []),
      ...sliceTraces,
      ...beforeCapTraces,
      ...(ring ? [ring] : [])
    ]
  }, [displayUnits,
    activeDisplayP,
    capacityCurve,
    capacityOppositeCurve,
    isLoadcaseMode,
    plotPalette,
    surface,
    surfaceContour3d,
    surfaceGrid,
    surfacePoints3d,
    surfaceTriangles3d,
    axialCapLimit,
    beforeCapDataset,
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
    const closedX = fixedPContourLinePoints(contour).map(point => point ? displayMoment(point.Mx) : null)
    const closedY = fixedPContourLinePoints(contour).map(point => point ? displayMoment(point.My) : null)
    const nominalClosedX = fixedPContourLinePoints(nominalContour).map(point => point ? displayMoment(point.Mx) : null)
    const nominalClosedY = fixedPContourLinePoints(nominalContour).map(point => point ? displayMoment(point.My) : null)
    const pointData = (points: typeof contour) => fixedPContourLinePoints(points).map(point => point
      ? [displayMoment(resultantMomentCoordinate(point).M), displayForce(point.P)] : null)
    const pointMeta = (resistanceStage: 'nominal' | 'design') => ({ resistanceStage,
      resultantColumns: { Mx: 'x', My: 'y', MR: 0, P: 1 }, criteriaLabel: 'Fixed-P intersection' })
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
      coordinateOriginTrace(plotPalette.mutedText, `Mx (${unit('moment')})`, `My (${unit('moment')})`),
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
              type: 'scatter', name: constantAxialCheck ? 'Constant-P moment ray' : 'Fixed-P moment ray (secondary)', mode: 'lines',
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
            customdata: pointData(nominalContour), meta: pointMeta('nominal'),
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
            customdata: pointData(contour), meta: pointMeta('design'),
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
          `Strain direction β=%{customdata[0]}°<br>⊥ resultant α⊥=%{customdata[1]}°<br>Difference Δα=%{customdata[2]}°<br>Mx=%{x:.1f} ${unit('moment')}<br>My=%{y:.1f} ${unit('moment')}<extra></extra>`
      }] : []),
      ...(view.showDesignResistance && beforeCapContour.length ? [{
        type: 'scatter', name: 'Design before Pmax cap', mode: 'lines',
        x: fixedPContourLinePoints(beforeCapContour).map(point => point ? displayMoment(point.Mx) : null),
        y: fixedPContourLinePoints(beforeCapContour).map(point => point ? displayMoment(point.My) : null),
        customdata: pointData(beforeCapContour), meta: { ...pointMeta('design'), dataLabel: 'before Pmax (excluded)' },
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
    constantAxialCheck,
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

  // Capacity P–M at θ (root 05 §8): the same physical load-direction curve and traces as Demand Check,
  // without a demand. The ± view adds θ + 180° on the negative Mθ side of the same vertical plane.
  const capacityPm = useMemo(() => !isLoadcaseMode && surface ? buildDemandPmGeometry({
    surface, curve: capacityCurve, demand: null, governingPoint: null, basis: 'proportional3D', theta: capacityCurve?.theta ?? capacityTheta
  }) : null, [isLoadcaseMode, surface, capacityCurve, capacityTheta])
  const capacityOppositePm = useMemo(() => !isLoadcaseMode && surface && view.includeOppositeMoment ? buildDemandPmGeometry({
    surface, curve: capacityOppositeCurve, demand: null, governingPoint: null, basis: 'proportional3D', theta: capacityOppositeCurve?.theta ?? capacityOppositeTheta
  }) : null, [isLoadcaseMode, surface, capacityOppositeCurve, capacityOppositeTheta, view.includeOppositeMoment])
  const capacityPmData = useMemo(() => {
    if (!capacityPm) return []
    const traces = (geometry: NonNullable<typeof capacityPm>) => demandPmTraces(geometry, {
      ...plotPalette, showDesign: view.showDesignResistance, showNominal: view.showNominalReference,
      constantP: false, displayForce, displayMoment, forceUnit: unit('force'), momentUnit: unit('moment'),
      criterion: (point, stage) => curvePointCriteria(point.stationId, point.role,
        (stage === 'nominal' ? nominalDataset?.stations : designDataset?.stations) ?? surface?.stations ?? [], point.between)
    }, null)
    const primary = traces(capacityPm)
    if (!capacityOppositePm) return primary
    const opposite = traces(capacityOppositePm).map((trace) => {
      const record = trace as Record<string, unknown>
      return {
        ...record,
        name: `${String(record.name)} · θ + 180°`,
        x: Array.isArray(record.x) ? (record.x as number[]).map((value) => -value) : record.x,
        ...(record.meta && typeof record.meta === 'object' ? { meta: { ...(record.meta as object), dataLabel: 'θ + 180°' } } : {})
      }
    })
    return [...primary, ...opposite]
  }, [capacityPm, capacityOppositePm, plotPalette, view.showDesignResistance, view.showNominalReference,
    displayForce, displayMoment, unit, nominalDataset, designDataset, surface])

  const verticalData = useMemo(() => {
    const origin = coordinateOriginTrace(plotPalette.mutedText, `Mθ (${unit('moment')})`, `P (${unit('force')})`)
    return [origin, ...(isLoadcaseMode ? demandPmData : capacityPmData)]
  }, [plotPalette, unit, isLoadcaseMode, demandPmData, capacityPmData])

  const verticalLayout = useMemo(
    () => ({
      ...plotTheme,
      margin: { l: 42, r: 84, t: 18, b: 36 },
      uirevision: isLoadcaseMode
        // Keyed on the drawn P–M (not the requested loadcase), so a lagged chart is not reset twice.
        ? `demand-pm:${JSON.stringify([displayUnits, demandPm?.theta,
          demandPm?.demand, view.showDesignResistance, view.showNominalReference])}`
        : `capacity-theta:${JSON.stringify([displayUnits, capacityThetaDeg, view.includeOppositeMoment,
          view.showDesignResistance, view.showNominalReference])}`,
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
          text: `${!isLoadcaseMode && view.includeOppositeMoment ? '±Mθ' : 'Mθ'} (${unit('moment')})`,
          showarrow: false,
          xanchor: 'left',
          yanchor: 'top',
          font: { size: 11, color: plotPalette.mutedText }
        }
      ],
      hovermode: 'closest',
      showlegend: false
    }),
    [displayUnits, isLoadcaseMode, demandPm, checkedLoadcase,
      capacityThetaDeg, view.includeOppositeMoment, view.showDesignResistance, view.showNominalReference, plotPalette, plotTheme]
  )

  // Concrete and rebar extremes stay separate (2026-11-09 review items 6 and 9).
  const fieldSummary = useMemo(() => fieldMap && sectionField
    ? summarizeSectionField(fieldMap, sectionField.state,
      section.solids.flatMap((solid) => [solid.outer, ...solid.holes].flat()))
    : null, [fieldMap, sectionField, section.solids])
  const [showAllBars, setShowAllBars] = useState(false)
  const demandGridRef = useRef<HTMLDivElement>(null)
  const detailPaneRef = useRef<HTMLElement>(null)

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
    lead,
    controls,
    footer,
    children
  }: {
    id: string
    title: string
    meta?: string
    primary: boolean
    visible: boolean
    /** Capacity layout actions; Demand Check shows one chart and passes a chart switch as `lead`. */
    onMakePrimary?: () => void
    onToggleVisible?: () => void
    lead?: ReactNode
    controls?: ReactNode
    footer?: ReactNode
    children: ReactNode
  }) => {
    if (!visible) return null
    return (
      <article key={`${viewMode}-${id}`} className={`pm-results-plot${primary ? ' is-primary' : ''}${isNgCase ? ' is-ng' : ''}`} data-chart={id}>
        <div className="pm-results-plot-chrome ws-chart-controls">
          {lead}
          <div className="pm-results-plot-heading" data-text-heading>
            <span className={id === 'heatmap' ? 'pm-field-basis-label' : undefined}
              title={id === 'vertical' ? `${title}\n${THETA_CHART_DESCRIPTION}` : id === 'heatmap' ? title : undefined}
              data-basis={id === 'heatmap' ? fieldEvidence?.basis ?? 'pending' : undefined}>{title}</span>
            {meta ? <strong>{meta}</strong> : null}
          </div>
          <div className="pm-results-plot-tools" role="group" aria-label="Chart layout">
            {/* Demand Check lists its values and point tables in the detail pane instead of a Data dialog. */}
            {viewMode === 'overview' && id === 'vertical' && <button type="button" className="ws-action" aria-haspopup="dialog"
              aria-label={`Open ${title} data`} title="Open chart data to read, copy or save"
              data-chart-text-open
              onClick={event => {
                const chart = event.currentTarget.closest<HTMLElement>('[data-chart]')
                if (!chart) return
                const frame = busy ? 'Previous resistance preview — rebuilding' : 'Current resistance preview'
                setChartData({ title, name: `${projectName}-theta-${Number(capacityThetaDeg.toFixed(3))}-${id}`,
                  text: chartText(chart, frame, { moment: unit('moment'), force: unit('force') }) })
              }}>Data</button>}
            {onMakePrimary && <button
              type="button"
              className={`ws-action ws-action--quiet ws-action--icon pm-chart-tool${primary ? ' is-active' : ''}`}
              title="Make this the large chart"
              onClick={onMakePrimary}
            >
              <Maximize2 size={14} />
            </button>}
            {onToggleVisible && <button type="button" className="ws-action ws-action--quiet ws-action--icon pm-chart-tool" title="Hide chart" onClick={onToggleVisible}>
              <EyeOff size={14} />
            </button>}
          </div>
          {controls ? <div className="pm-results-plot-actions" data-text-controls>{controls}</div> : null}
        </div>
        <div className="pm-results-plot-body">
          <div className="pm-results-plot-canvas">
            <DeferredChart primary={primary}>{children}</DeferredChart>
            {id !== 'heatmap' && fieldFrameTransition.status === 'previous' &&
              <span className="pm-results-frame-status" role="status">Updating — previous completed result</span>}
          </div>
          {footer}
          {beforeCapDataset && (id === 'vertical' && view.showDesignResistance && ((isLoadcaseMode ? demandPm : capacityPm)?.beforeCap.length ?? 0) > 0 ||
            id === 'fixedP' && view.showDesignResistance && beforeCapContour.length > 0 ||
            id === 'surface3d' && view.surfaceResistanceMode === 'design') ? (
            <p className="pm-preview-hint" data-before-cap-legend>Dotted above Pmax: excluded from checks.</p>
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
    if (ready && section.solids.length > 0) return (
      <section className="pm-results-stage pm-results-stage--charts-only" aria-busy={false}>
        <div className="pm-results-grid pm-results-grid--dynamic primary-heatmap count-1">
          <article className="pm-results-plot is-primary" data-chart="heatmap">
            <div className="pm-results-plot-chrome ws-chart-controls"><div className="pm-results-plot-heading">
              <span>Load reference axes</span><strong>{isAxisPreview ? 'Axis preview — Apply to update the load reference.' : 'Centroid + applied load offsets'}</strong>
            </div></div>
            <div className="pm-results-plot-body"><div className="pm-results-plot-canvas">
              <SectionOutlineChart section={section} rebars={rebars} loadReference={previewReference} />
            </div><p className="pm-preview-hint">Select or add a load combination in Demand Check to view its calculation results.</p></div>
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
            ? 'Add a factored ULS combination in Demand Check to check it against the design surface.'
            : 'Select a combination in Demand Check to inspect its governing check.'}
        </p>
      </section>
    )
  }

  if (isLoadcaseMode && selectedLoadcase) {
    const resistance = inverseResult?.designCapacityPoint
    const ur = inverseResult?.utilization
    const forceValue = (value: number | undefined) => value == null || !Number.isFinite(value)
      ? '—' : `${fmt(displayForce(value))} ${unit('force')}`
    const momentValue = (value: number | undefined) => value == null || !Number.isFinite(value)
      ? '—' : `${fmt(displayMoment(value))} ${unit('moment')}`
    const summaryMessage = ur == null ? 'Check result unavailable.' : null
    const summaryGroups = [
      { title: 'Checked demand', rows: [
        ['Pu', forceValue(checkedLoadcase?.P)], ['Mux', momentValue(checkedLoadcase?.Mx)],
        ['Muy', momentValue(checkedLoadcase?.My)], ['Mu', momentValue(currentPm?.demand?.M)],
        ['θ load', loadAngleReadout === '—' ? '—' : `${loadAngleReadout}°`]
      ] },
      // The point where the checked load path meets the Design resistance surface (the strength point).
      { title: 'Design capacity on load path', rows: [
        ['Pr', forceValue(resistance?.P)], ['Mrx', momentValue(resistance?.Mx)],
        ['Mry', momentValue(resistance?.My)], ['Mr', momentValue(currentPm?.governing?.M)]
      ] },
      { title: 'Utilization', rows: [
        ['λ', inverseResult?.designCapacityMultiplier == null ? '—' : fmt(inverseResult.designCapacityMultiplier, 4)],
        ['UR', ur == null ? '—' : fmt(ur, 4)],
        ['Verdict', fieldCheckLabel],
        ['Fixed-P UR', inverseResult?.fixedPUtilization == null ? 'n/a' : fmt(inverseResult.fixedPUtilization, 3)]
      ], hint: `${checkBasisLabel}: λ scales the demand to the Design capacity on its load path, and UR = 1 / λ. ${constantAxialCheck ? 'Constant P scales the moment only.' : 'The 3D load ray scales P, Mx and My together.'} Fixed-P UR is a secondary moment ratio at Pu.`, solver: true }
    ]
    const fieldTitle = fieldEvidence?.basis === 'capacity' ? 'Field at capacity' : 'Field at demand'
    /**
     * Data: the whole pane as text, as the former chart Data dialogs gave it. Readouts are read from the
     * rendered groups (so the text is exactly what the pane shows, in its order); the bar list and both
     * point tables are written in full even while they are collapsed on screen.
     */
    const openDetailPaneData = () => {
      const pane = detailPaneRef.current
      if (!pane) return
      const groups: DetailPaneGroup[] = []
      for (const section of pane.querySelectorAll<HTMLElement>('.pm-demand-info-group')) {
        const sectionTitle = section.querySelector('h3')?.textContent?.trim() ?? ''
        for (const card of section.querySelectorAll<HTMLElement>('.pm-field-metric-card')) {
          const rows = [...card.querySelectorAll<HTMLElement>('.pm-field-metric-rows > div')].flatMap((row) => {
            const [label, value] = [...row.children].map((cell) => cell.textContent?.replace(/\s+/gu, ' ').trim() ?? '')
            return label ? [[label, value ?? ''] as const] : []
          })
          // The title without any control the header carries (e.g. the Rebar "All bars" toggle).
          const header = card.querySelector('header')?.cloneNode(true) as HTMLElement | undefined
          header?.querySelectorAll('button, label, input').forEach((control) => control.remove())
          if (rows.length) groups.push({ section: sectionTitle, title: header?.textContent?.replace(/\s+/gu, ' ').trim() ?? '', rows })
        }
      }
      const tables: string[] = []
      if (fieldMap && fieldMap.rebars.length > 0) {
        tables.push([`Rebar (${fieldMap.rebars.length} bars)`,
          ['id', `x (${unit('length')})`, `y (${unit('length')})`, `Ø (${unit('barDiameter')})`, 'εs', `σs (${unit('stress')})`, `Fs (${unit('force')})`].join('\t'),
          ...[...fieldMap.rebars].sort((a, b) => a.id - b.id).map((bar) => [bar.id, qfmt('length', bar.x, 1), qfmt('length', bar.y, 1),
            qfmt('barDiameter', bar.dia, 1), fmt(bar.strain, 6), qfmt('stress', bar.stress, 2), fmt(displayForce(bar.force), 2)].join('\t'))].join('\n'))
      }
      const pointUnits = { moment: unit('moment'), force: unit('force') }
      for (const [label, series] of [['P–M at θ points', verticalData], ['Mx–My points at Pu', contourData]] as const) {
        tables.push(`${label}\n${plottedPointsText(series as readonly PlottedTrace2D[], pointUnits).replace(/^PREVIEW\n\n/u, '')}`)
      }
      setChartData({
        title: 'Check details',
        name: `${projectName}-${checkedLoadcase?.name ?? 'loadcase'}-check-details`,
        text: detailPaneText([projectName, `${checkedLoadcase?.name ?? '—'} · ${checkBasisLabel}`], groups, tables)
      })
    }
    // docs/development/04: the right pane carries every readout, whichever chart is shown.
    const detailPane = (
      <aside ref={detailPaneRef} className="pm-demand-info" aria-label="Check details" data-demand-info data-mechanics={surface?.analysisOptions.methodId}>
          <div className="pm-section-field-status pm-preview-hint" role="status" aria-live="polite">
            {demandWorking && <p className="pm-demand-updating">
              Updating {requestedSelectedLoadcase?.name}.
              {fieldFrameTransition.status === 'previous'
                ? ` Showing previous completed result (${selectedLoadcase.name}).` : ' Preparing result.'}
            </p>}
            {isAxisPreview && <p>Axis preview — Apply to update the load reference.</p>}
            {beforeCapField && beforeCapField.boundary.kind === 'before-axial-cap' && <p data-before-cap-note>
              <strong>Pmax governs.</strong> Pre-cap field:
              {' '}P = {qfmt('force', beforeCapField.response.P, 1)} {unit('force')}
              {' > '}Pmax = {qfmt('force', beforeCapField.boundary.limit, 1)} {unit('force')}.
              {' '}UR uses capped capacity.
            </p>}
            {/* An unavailable-field reason is shown in the Field pane itself; only preparation is noted here. */}
            {!fieldMap && !fieldMapWorking && !displayFieldSnapshot?.fieldMessage && <p>Preparing section-field evidence.</p>}
          </div>
        <section className="pm-demand-info-group" aria-label="Check">
          <div className="pm-demand-info-head">
            <h3>Check · {checkBasisLabel}</h3>
            <button type="button" className="ws-action ws-action--compact" disabled={!inverseResult}
              title="All results of this pane as text" onClick={openDetailPaneData}>Data</button>
          </div>
          <div className="pm-section-field-metrics">
            {summaryGroups.map(group => <article key={group.title} className="pm-field-metric-card" data-text-group>
              <header title={group.hint}>{group.title}</header>
              <div className="pm-field-metric-rows">
                {group.rows.map(([label, value]) => <div key={label}>
                  <span>{label}</span><strong className="ws-num">{value}</strong>
                </div>)}
                {group.solver && inverseResult ? <div>
                  <span title="Inverse-solver diagnostic">Solver</span>
                  <strong className={solverStatus(inverseResult).tone} title={inverseResult.message}>
                    {solverStatus(inverseResult).label}
                  </strong>
                </div> : null}
              </div>
            </article>)}
          </div>
          {summaryMessage && <p className="pm-preview-hint" role="status">{summaryMessage}</p>}
        </section>
        <section className="pm-demand-info-group" aria-label="Field" data-field-basis={fieldEvidence?.basis ?? 'pending'}>
          <h3 data-basis={fieldEvidence?.basis ?? 'pending'}>{fieldTitle}</h3>
          {inverseResult ? <div className="pm-section-field-metrics">
            {sectionField && fieldMap ? <><article className="pm-field-metric-card" data-text-group>
              <header>Concrete</header>
              <div className="pm-field-metric-rows">
                <div title="Strain-gradient direction β of the displayed strength-point state.">
                  <span>β (N.A.)</span>
                  <strong className="ws-num">{betaReadout === '—' ? '—' : `${betaReadout}°`}</strong>
                </div>
                {sectionField.equivalentBlock ? (
                  <>
                    <div title="Neutral-axis depth measured from the extreme compression edge along the block normal.">
                      <span>c</span>
                      <strong className="ws-num">{qfmt('length', sectionField.equivalentBlock.neutralAxisDepth, 2)} {unit('length')}</strong>
                    </div>
                    <div>
                      <span>β<sub>1</sub></span>
                      <strong className="ws-num">{fmt(sectionField.equivalentBlock.beta1, 3)}</strong>
                    </div>
                    <div title="Equivalent rectangular compression-block depth.">
                      <span>a = β<sub>1</sub>·c</span>
                      <strong className="ws-num">{qfmt('length', sectionField.equivalentBlock.blockDepth, 2)} {unit('length')}</strong>
                    </div>
                    <div title="Full section depth projected onto the compression-block normal.">
                      <span>D<sub>θ</sub></span>
                      <strong className="ws-num">{qfmt('length', sectionField.equivalentBlock.projectedSectionDepth, 2)} {unit('length')}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span title="Concrete strain at the net-concrete centroid (calculation origin)">ε<sub>c,0</sub></span>
                      <strong className="ws-num">{fmt(sectionField.state.e0, 6)}</strong>
                    </div>
                    <div>
                      <span>κ<sub>x</sub></span>
                      <strong className="ws-num">{powerOfTen(fromCanonical('curvature', sectionField.state.kx, displayUnits))} {unit('curvature')}</strong>
                    </div>
                    <div>
                      <span>κ<sub>y</sub></span>
                      <strong className="ws-num">{powerOfTen(fromCanonical('curvature', sectionField.state.ky, displayUnits))} {unit('curvature')}</strong>
                    </div>
                  </>
                )}
                <div>
                  <span title="Extreme concrete strain, compression positive">ε<sub>c,max</sub></span>
                  <strong className="ws-num">{fieldSummary ? fmt(fieldSummary.concrete.maxStrain, 6) : '—'}</strong>
                </div>
                <div>
                  <span>ε<sub>c,min</sub></span>
                  <strong className="ws-num">{fieldSummary ? fmt(fieldSummary.concrete.minStrain, 6) : '—'}</strong>
                </div>
                {sectionField.equivalentBlock ? (
                  <>
                    <div>
                      <span title="Equivalent block stress">σ<sub>c,block</sub></span>
                      <strong className="ws-num">{qfmt('stress', sectionField.equivalentBlock.compressionStress, 3)} {unit('stress')}</strong>
                    </div>
                    <div>
                      <span title="Equivalent block area">A<sub>c,block</sub></span>
                      <strong className="ws-num">
                        {sectionField.equivalentBlock.concreteBlockArea == null
                          ? 'n/a'
                          : `${qfmt('area', sectionField.equivalentBlock.concreteBlockArea, 1)} ${unit('area')}`}
                      </strong>
                    </div>
                    <div>
                      <span>C<sub>c</sub></span>
                      <strong className="ws-num">
                        {sectionField.equivalentBlock.concreteForce == null
                          ? 'n/a'
                          : `${fmt(displayForce(sectionField.equivalentBlock.concreteForce), 1)} ${unit('force')}`}
                      </strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span>σ<sub>c,max</sub></span>
                      <strong className="ws-num">{fieldSummary ? `${qfmt('stress', fieldSummary.concrete.maxStress, 2)} ${unit('stress')}` : '—'}</strong>
                    </div>
                    <div>
                      <span>σ<sub>c,min</sub></span>
                      <strong className="ws-num">{fieldSummary ? `${qfmt('stress', fieldSummary.concrete.minStress, 2)} ${unit('stress')}` : '—'}</strong>
                    </div>
                  </>
                )}
              </div>
            </article>

            <article className="pm-field-metric-card pm-field-rebar" data-text-group>
              <header>
                <span>Rebar</span>
                {fieldMap.rebars.length > 0 && (
                  <button type="button" className="ws-action ws-action--compact pm-field-bars-toggle" aria-expanded={showAllBars}
                    aria-controls="pm-field-rebar-details" onClick={() => setShowAllBars((shown) => !shown)}>
                    {showAllBars ? 'Show less' : `All bars (${fieldMap.rebars.length})`}
                  </button>
                )}
              </header>
              <div className="pm-field-metric-rows">
                {fieldSummary?.rebar ? (
                  <>
                    <div>
                      <span>ε<sub>s,max</sub> <em className="pm-bar-id">id {fieldSummary.rebar.maxStrain.barId}</em></span>
                      <strong className="ws-num">{fmt(fieldSummary.rebar.maxStrain.value, 6)}</strong>
                    </div>
                    <div title={fieldSummary.rebar.outermostTension ? 'Outermost tension bar (compression positive)' : 'No bar is in tension; this is the least compressed bar.'}>
                      <span>ε<sub>s,min</sub> <em className="pm-bar-id">id {fieldSummary.rebar.minStrain.barId}</em></span>
                      <strong className="ws-num">{fmt(fieldSummary.rebar.minStrain.value, 6)}</strong>
                    </div>
                    {showAllBars && <>
                      <div>
                        <span>σ<sub>s,max</sub> <em className="pm-bar-id">id {fieldSummary.rebar.maxStress.barId}</em></span>
                        <strong className="ws-num">{qfmt('stress', fieldSummary.rebar.maxStress.value, 2)} {unit('stress')}</strong>
                      </div>
                      <div>
                        <span>σ<sub>s,min</sub> <em className="pm-bar-id">id {fieldSummary.rebar.minStress.barId}</em></span>
                        <strong className="ws-num">{qfmt('stress', fieldSummary.rebar.minStress.value, 2)} {unit('stress')}</strong>
                      </div>
                      <div title="Outermost tension bar: perpendicular distance from the neutral axis">
                        <span>d<sub>NA</sub>{fieldSummary.rebar.outermostTension ? <> <em className="pm-bar-id">id {fieldSummary.rebar.outermostTension.barId}</em></> : null}</span>
                        <strong className="ws-num">
                          {fieldSummary.rebar.outermostTension?.distanceFromNeutralAxis == null
                            ? 'n/a'
                            : `${qfmt('length', fieldSummary.rebar.outermostTension.distanceFromNeutralAxis, 1)} ${unit('length')}`}
                        </strong>
                      </div>
                    </>}
                  </>
                ) : <div><span>Bars</span><strong className="ws-num">n/a</strong></div>}
                {showAllBars && sectionField.equivalentBlock ? (
                  <div title="Controlling tensile strain of the code strength-reduction rule (tension positive)">
                    <span>ε<sub>t</sub> (code){sectionField.equivalentBlock.controllingBarId == null ? null
                      : <> <em className="pm-bar-id">id {sectionField.equivalentBlock.controllingBarId}</em></>}</span>
                    <strong className="ws-num">
                      {sectionField.equivalentBlock.controllingTensileStrain == null
                        ? 'n/a'
                        : fmt(sectionField.equivalentBlock.controllingTensileStrain, 6)}
                    </strong>
                  </div>
                ) : null}
              </div>
              {showAllBars && fieldMap.rebars.length > 0 && (
                <div id="pm-field-rebar-details" className="pm-chart-data-table-wrap pm-field-bar-table">
                  <table className="pm-chart-data-table" aria-label="Rebar strain and stress">
                    <thead><tr>
                      <th>id</th><th>x ({unit('length')})</th><th>y ({unit('length')})</th><th>Ø ({unit('barDiameter')})</th>
                      <th>ε<sub>s</sub></th><th>σ<sub>s</sub> ({unit('stress')})</th><th>F<sub>s</sub> ({unit('force')})</th>
                    </tr></thead>
                    <tbody>
                      {[...fieldMap.rebars].sort((a, b) => a.id - b.id).map((bar) => (
                        <tr key={bar.id}>
                          <td className="ws-num">{bar.id}</td>
                          <td className="ws-num">{qfmt('length', bar.x, 1)}</td>
                          <td className="ws-num">{qfmt('length', bar.y, 1)}</td>
                          <td className="ws-num">{qfmt('barDiameter', bar.dia, 1)}</td>
                          <td className="ws-num">{fmt(bar.strain, 6)}</td>
                          <td className="ws-num">{qfmt('stress', bar.stress, 2)}</td>
                          <td className="ws-num">{fmt(displayForce(bar.force), 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            </> : <><FieldMetricPlaceholder title="Concrete" /><FieldMetricPlaceholder title="Rebar" /></>}
            <article className="pm-field-metric-card" data-text-group>
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
            {['Concrete', 'Rebar', 'Demand at centroid'].map(title =>
              <FieldMetricPlaceholder key={title} title={title} />)}
          </div>}
        </section>
      </aside>
    )
    return (
      <section
        className={`pm-results-stage pm-results-stage--charts-only${busy ? ' is-recalculating' : ''}`}
        aria-busy={demandWorking}
        data-field-frame={fieldFrameTransition.status}
        data-curve-pending={curvePending}
        data-requested-loadcase={requestedLoadcaseId ?? undefined}
        data-displayed-loadcase={displayFieldSnapshot?.selectedLoadcaseId}
        data-field-basis={fieldEvidence?.basis ?? 'pending'}
        data-field-boundary={sectionField?.basis === 'capacity' ? sectionField.boundary.kind : undefined}
        data-demand-status={inverseResult?.designCheck.evaluated ? inverseResult.designCheck.adequacy : 'pending'}
      >
        <div className="pm-demand-layout">
          <div ref={demandGridRef} className="pm-demand-chart"
            style={{ '--pm-split-x': demandView.gridSplit.x, '--pm-split-y': demandView.gridSplit.y } as CSSProperties}>
          <DemandGridSplitHandle split={demandView.gridSplit} gridRef={demandGridRef}
            onChange={(gridSplit) => onDemandViewChange({ gridSplit })} />
          {renderChartShell({
            id: 'heatmap',
            title: fieldTitle,
            primary: true,
            visible: true,
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
              <>
                <SectionOutlineChart section={section} rebars={rebars} loadReference={previewReference} />
                {/* Say in the pane why no field is drawn (fail-closed evidence, docs/development/04). */}
                {!fieldMapWorking && !demandWorking && displayFieldSnapshot?.fieldMessage
                  ? <p className="pm-field-pane-note" role="status">{displayFieldSnapshot.fieldMessage}</p> : null}
              </>
            )
          })}

          {renderChartShell({
            id: 'curves',
            title: 'σ–ε operating points',
            primary: true,
            visible: true,
            children: fieldMap && sectionField && fieldSummary && materialStore && designBasis
              ? <FieldOperatingPoints fieldMap={fieldMap} summary={fieldSummary} materialStore={materialStore}
                designBasis={designBasis} profileId={surface?.calculationProfileId ?? 'kds-2024-stress-strain'} />
              : <div className="pm-results-plot-placeholder">{fieldMapWorking ? 'Preparing chart…' : 'No section field, so no σ–ε operating points.'}</div>
          })}

          {renderChartShell({
            id: 'vertical',
            // UR, basis and β are listed in the detail pane; the header keeps view controls only.
            title: 'P–M at θ load',
            // The frame is shown before its curve; say so while the curve is still being built.
            meta: displayFieldSnapshot?.requestedTheta != null &&
              !curveEntryFor(displayFieldSnapshot.surface, displayFieldSnapshot.requestedTheta) ? 'Building curve…' : undefined,
            primary: true,
            visible: true,
            controls: (
              <>
                <ResistanceVisibilityControls
                  showDesign={view.showDesignResistance}
                  showNominal={view.showNominalReference}
                  onShowDesign={(showDesignResistance) => setResistanceVisibility({ showDesignResistance })}
                  onShowNominal={(showNominalReference) => setResistanceVisibility({ showNominalReference })}
                />
              </>
            ),

            children: displayFieldSnapshot
              ? <PlotlyChart data={verticalData} layout={verticalLayout} config={plotConfig} />
              : <div className="pm-results-plot-placeholder">Preparing chart…</div>
          })}

          {renderChartShell({
            id: 'fixedP',
            // The checked Pu is listed in the detail pane; the header keeps view controls only.
            title: 'Mx–My at Pu',
            primary: true,
            visible: true,
            controls: (
              <>
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
              ? <p className="pm-preview-hint" role="status">{constantAxialCheck
                ? 'No Design contour at Pu; no constant-P capacity.'
                : 'No Design contour at Pu; 3D UR remains available.'}</p> : null,
            children: <PlotlyChart data={contourData} layout={contourLayout} config={plotConfig} />
          })}
          </div>
          {detailPane}
        </div>
        {chartData && <DemandChartDataDialog snapshot={chartData} onClose={() => setChartData(null)} />}
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
          title: THETA_CHART_TITLE,
          meta: capacityCurvePending ? 'Building curve…' : `θ = ${fmt(capacityThetaDeg, 1)}°`,
          primary: view.primaryChart === 'vertical',
          visible: view.visibleCharts.vertical,
          onMakePrimary: () => onViewChange({ primaryChart: 'vertical' }),
          onToggleVisible: () => toggleSectionChart('vertical'),
          controls: (
            <>
              <SyncedControl
                label="θ"
                title="Moment direction in Mx–My, θ = atan2(My, Mx); type any angle and press Enter"
                value={capacityThetaDeg}
                min={0}
                max={thetaSliderMax}
                step={1}
                unit="deg"
                inputValue={thetaDraft}
                inputStep="any"
                onInputChange={setThetaDraft}
                onInputCommit={applyThetaDraft}
                onInputBlur={applyThetaDraft}
                onChange={setCapacityTheta}
              />
              <label
                className={`ws-check pm-field-check${view.includeOppositeMoment ? ' is-on' : ''}`}
                title="Also draw θ + 180°, the other half of the same vertical plane, at negative Mθ"
              >
                <input
                  type="checkbox"
                  checked={view.includeOppositeMoment}
                  onChange={(event) => onViewChange({ includeOppositeMoment: event.target.checked })}
                />
                ±θ
              </label>
              <ResistanceVisibilityControls
                showDesign={view.showDesignResistance}
                showNominal={view.showNominalReference}
                onShowDesign={(showDesignResistance) => setResistanceVisibility({ showDesignResistance })}
                onShowNominal={(showNominalReference) => setResistanceVisibility({ showNominalReference })}
              />
            </>
          ),
          footer: <p className="pm-preview-hint">Mθ = Mx cos θ + My sin θ. Each point is a state with its own β; ±θ draws θ + 180° at negative Mθ.</p>,
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
          children: <PlotlyChart data={surfaceData} layout={surfaceLayout} config={plotConfig} />
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
      {chartData && <DemandChartDataDialog snapshot={chartData} onClose={() => setChartData(null)} />}
    </section>
  )
}
