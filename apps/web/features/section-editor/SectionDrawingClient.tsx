'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import {
  ChartLine,
  Circle,
  Eye,
  EyeOff,
  FileInput,
  FileOutput,
  Gauge,
  Lock,
  Minus,
  Moon,
  Plus,
  RectangleHorizontal,
  RotateCw,
  Settings,
  Sun,
  Unlock,
  X
} from 'lucide-react'
import {
  allocateIds,
  composeSectionPrimitives,
  createEmptyGeometryInput,
  createCapsuleRing,
  createCircleRing,
  createPrimitive,
  createRectangleRing,
  createSectionSolid,
  geometryInputFromOuterRings,
  geometryInputRebars,
  makePointId,
  nextAvailableId,
  sectionGeometryFromGeometryInput,
  solidRings,
  summarizeSection,
  updateGeometryInputRebars,
  type GeometryInput,
  type GeometryInputRebarView,
  type Point2,
  type SectionGeometry
} from '@pm/geometry'
import { createDefaultMaterialStore, type MaterialStore } from '@pm/materials'
import {
  createDefaultDesignBasis,
  type DesignBasis
} from '@pm/design'
import {
  createEmptyLoadingsInput,
  DEFAULT_CALCULATION_PROFILE_ID,
  applyCalculationProfileToMaterials,
  createAnalysisOptionsForProfile,
  createDesignBasisForCalculationProfile,
  createDefaultAnalysisOptions,
  createProjectDocument,
  parseProjectDocument,
  projectDocumentFileName,
  serializeProjectDocument,
  type LoadCombination,
  type CalculationAnalysisOptions,
  type CalculationProfileId,
  type LoadingsInput
} from '@pm/project'
import {
  type InversePreviewResult,
  type LoadcaseQuickCheckResult,
  type PreviewSurface
} from '@pm/analysis'
import {
  buildPreviewSurfaceAsync,
  checkLoadcaseAsync,
  checkLoadcasesAsync,
  exportColumnReportPdfAsync,
  isAnalysisAbort
} from '../../application/analysis/client'
import { LoadingsPanel } from './loadings/LoadingsPanel'

/**
 * The results and mesh stages carry Plotly and the analysis kernels. Loading them on demand keeps
 * them out of the first paint, and the `loading` placeholder is what makes the wait legible: the
 * menu switches immediately and the stage says it is working.
 */
const ResultsWorkspace = dynamic(
  () => import('./results/ResultsWorkspace').then((module) => module.ResultsWorkspace),
  {
    ssr: false,
    loading: () => <WorkspaceLoading title="Loading result charts…" detail="Preparing the plotting engine." />
  }
)

const AnalysisMeshWorkspace = dynamic(
  () => import('./analysis/AnalysisMeshWorkspace').then((module) => module.AnalysisMeshWorkspace),
  {
    ssr: false,
    loading: () => <WorkspaceLoading title="Loading the section mesh view…" charts={1} />
  }
)
import { AnalysisOptionsPanel } from './analysis/AnalysisOptionsPanel'
import { MaterialPanel } from './materials/MaterialPanel'
import { RebarPanel } from './geometry/RebarPanel'
import { DemandCheckPanel } from './results/DemandCheckPanel'
import { preloadPlotly } from './results/PlotlyChart'
import { WorkspaceLoading } from './shared/WorkspaceLoading'
import { SectionResultsPanel, type SectionResultsSummary } from './results/SectionResultsPanel'
import {
  createDemandCheckView,
  createSectionResultsView,
  sliceAngleMax,
  type DemandCheckView,
  type SectionResultsView
} from './results/results-view'
import { DesignBasisPanel } from './design/DesignBasisPanel'
import {
  downloadRebarWorkbook,
  downloadSectionWorkbook,
  importRebarWorkbook,
  importSectionWorkbook,
  type ImportedSectionWorkbook
} from './geometry/section-xlsx'
import {
  createSectionCamera2d,
  panSectionCamera2d,
  screenToWorld,
  snapWorldPoint,
  worldToScreen,
  zoomSectionCamera2d
} from '@structures/cad-drawing/section2d'

const RcSectionIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="16" cy="8" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="8" cy="16" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="16" cy="16" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)

const SteelStressStrainIcon = ({ size = 16 }: { size?: number }) => (
  <span
    className="pm-steel-stress-strain-icon"
    style={{ width: size, height: size }}
    aria-hidden="true"
  />
)

type Camera2d = {
  target: [number, number]
  unitsPerPixel: number
}

type ScreenPoint = {
  x: number
  y: number
}

type Tool = 'select' | 'draw-rectangle' | 'draw-circle' | 'draw-polygon'
type Theme = 'light' | 'dark'
/**
 * Section Results and Demand Check are separate menus because they answer different questions and
 * need different sidebars: one owns the capacity surface and its presentation, the other owns the
 * load combinations checked against it.
 */
type WorkspaceModule = 'geometry' | 'materials' | 'analysis' | 'section' | 'demand'

/** Both result menus render the same stage component in different modes. */
const isResultsModule = (module: WorkspaceModule) => module === 'section' || module === 'demand'
type GeometrySubTab = 'concrete' | 'rebar'
type AnalysisSubTab = 'points' | 'mesh' | 'design'
type BuilderShape = 'rectangle' | 'circle' | 'capsule'
type BooleanAction = 'union' | 'subtract'
type BoundarySource =
  | { kind: 'rectangle'; center: Point2; width: number; height: number }
  | { kind: 'circle'; center: Point2; radius: number; segments: number }
  | { kind: 'capsule'; center: Point2; width: number; height: number; segments: number }
  | { kind: 'manual' | 'boolean' }
type DrawingDraft =
  | { tool: 'draw-rectangle'; start: Point2; cursor?: Point2 }
  | { tool: 'draw-circle'; center: Point2; cursor?: Point2 }
  | { tool: 'draw-polygon'; points: Point2[]; cursor?: Point2 }
  | null

type BoundaryObject = {
  id: number
  name: string
  /** List of outers; each entry is [outerRing, ...holeRings]. */
  outers: Point2[][][]
  sourceKind: BuilderShape | 'manual' | 'boolean'
  source: BoundarySource
  /** Reinforcement travels with this editor boundary and becomes active when the boundary is applied. */
  rebars: GeometryInputRebarView[]
  visible: boolean
  locked: boolean
}

type BoundaryScreenData = {
  boundary: BoundaryObject
  outers: Array<Array<Array<ScreenPoint & { id: number; wx: number; wy: number }>>>
  path: string
}

const GRID_SPACING_MM = 100
const MAJOR_GRID_INTERVAL = 10
const MAJOR_GRID_SPACING_MM = GRID_SPACING_MM * MAJOR_GRID_INTERVAL
const DEFAULT_VIEW_MAJOR_COUNT = 4
const DEFAULT_DRAWING_SIZE = { width: 900, height: 620 }
const DEFAULT_DRAWING_UNITS_PER_PIXEL =
  (MAJOR_GRID_SPACING_MM * DEFAULT_VIEW_MAJOR_COUNT) / DEFAULT_DRAWING_SIZE.width
const DEFAULT_CIRCLE_SEGMENTS = 32
/** Quiet period before an edit is allowed to start a surface build. */
const ANALYSIS_DEBOUNCE_MS = 250

const formatNumber = (value: number, digits = 1) =>
  Math.abs(value) < 1e-9 ? '0' : value.toLocaleString('en-US', { maximumFractionDigits: digits })

const eventPoint = (event: React.PointerEvent<SVGSVGElement> | React.WheelEvent<SVGSVGElement>, svg: SVGSVGElement) => {
  const rect = svg.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

const polygonPath = (points: ScreenPoint[]) => {
  if (points.length === 0) return ''
  return `${points.map((p, index) => `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} Z`
}

const compoundPolygonPath = (rings: ScreenPoint[][]) => rings.map((ring) => polygonPath(ring)).filter(Boolean).join(' ')

const boundaryHoleCount = (boundary: BoundaryObject) =>
  boundary.outers.reduce((sum, outer) => sum + Math.max(0, outer.length - 1), 0)

const boundaryPointCount = (boundary: BoundaryObject) =>
  boundary.outers.reduce((sum, outer) => sum + outer.reduce((ringSum, ring) => ringSum + ring.length, 0), 0)

const collectBoundaryPointIds = (boundary: BoundaryObject): number[] =>
  boundary.outers.flatMap((outer) => outer.flatMap((ring) => ring.map((point) => point.id)))

const cloneRing = (ring: Point2[]): Point2[] => ring.map((point) => ({ ...point }))

const boundaryToSectionGeometry = (boundary: BoundaryObject): SectionGeometry => ({
  id: boundary.id,
  name: boundary.name,
  solids: boundary.outers
    .filter((outer) => (outer[0]?.length ?? 0) >= 3)
    .map((outer) => createSectionSolid(cloneRing(outer[0] ?? []), outer.slice(1).map(cloneRing)))
})

const sectionGeometryToBoundary = (
  geometry: SectionGeometry,
  patch: Pick<BoundaryObject, 'id' | 'name' | 'sourceKind'> &
    Partial<Pick<BoundaryObject, 'visible' | 'locked'>> & {
      source?: BoundarySource
    }
): BoundaryObject => ({
  id: patch.id,
  name: patch.name,
  sourceKind: patch.sourceKind,
  source: patch.source ?? { kind: 'manual' },
  outers: geometry.solids.map((solid) => solidRings(solid)),
  rebars: [],
  visible: patch.visible ?? true,
  locked: patch.locked ?? false
})

const geometryInputToBoundary = (input: GeometryInput): BoundaryObject => ({
  id: input.id,
  name: input.name,
  sourceKind: 'manual',
  source: { kind: 'manual' },
  outers: input.outers
    .filter((outer) => outer.points.length >= 3)
    .map((outer) => [cloneRing(outer.points), ...outer.holes.map((hole) => cloneRing(hole.points))]),
  rebars: geometryInputRebars(input),
  visible: true,
  locked: true
})

const makeBoundaryId = (used: Iterable<number>) => nextAvailableId(used)

const remapBoundaryPoints = (
  outers: Point2[][][],
  dx = 0,
  dy = 0,
  usedPointIds: Iterable<number> = []
): Point2[][][] => {
  const count = outers.reduce((sum, outer) => sum + outer.reduce((ringSum, ring) => ringSum + ring.length, 0), 0)
  const ids = allocateIds(count, usedPointIds)
  let index = 0
  return outers.map((outer) =>
    outer.map((ring) =>
      ring.map((point) => ({
        id: ids[index++]!,
        x: point.x + dx,
        y: point.y + dy
      }))
    )
  )
}

const pointInRing = (point: Pick<Point2, 'x' | 'y'>, ring: Point2[]) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    const crosses = (a.y > point.y) !== (b.y > point.y)
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

const barCenterInsideOuters = (outers: Point2[][][], bar: Pick<GeometryInputRebarView, 'x' | 'y'>) =>
  outers.some((outer) => {
    if (!outer?.[0] || !pointInRing(bar, outer[0])) return false
    return outer.slice(1).every((hole) => !pointInRing(bar, hole))
  })

const barCenterInsideBoundary = (boundary: BoundaryObject, bar: GeometryInputRebarView) =>
  barCenterInsideOuters(boundary.outers, bar)

const ringBounds = (ring: Point2[]) => {
  if (ring.length === 0) return { centerX: 0, centerY: 0, width: 0, height: 0 }
  const xs = ring.map((point) => point.x)
  const ys = ring.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  }
}

const isParametricSource = (source: BoundarySource) =>
  source.kind === 'rectangle' || source.kind === 'circle' || source.kind === 'capsule'

/** Point edits update outers only; parametric Basic source is kept until Basic is edited (then outers regenerate). */
const withEditedOuters = (boundary: BoundaryObject, outers: Point2[][][]): BoundaryObject => {
  if (isParametricSource(boundary.source)) {
    return { ...boundary, outers }
  }
  return {
    ...boundary,
    sourceKind: boundary.source.kind === 'boolean' ? 'boolean' : 'manual',
    source: boundary.source.kind === 'boolean' ? boundary.source : { kind: 'manual' },
    outers
  }
}

const mapOuterRing = (
  outers: Point2[][][],
  outerIndex: number,
  ringIndex: number,
  mapRing: (ring: Point2[]) => Point2[]
) =>
  outers.map((outer, currentOuterIndex) =>
    currentOuterIndex !== outerIndex
      ? outer
      : outer.map((ring, currentRingIndex) => (currentRingIndex !== ringIndex ? ring : mapRing(ring)))
  )

const boundaryToPrimitives = (boundary: BoundaryObject, operation: 'add' | 'subtract', usedIds: number[]) =>
  boundary.outers.map((outer) => {
    const id = nextAvailableId(usedIds)
    usedIds.push(id)
    return createPrimitive(id, operation, outer, boundary.name)
  })

const rectangleSourceFromCorners = (a: Point2, b: Point2): Extract<BoundarySource, { kind: 'rectangle' }> => ({
  kind: 'rectangle',
  center: { id: makePointId([]), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  width: Math.max(1, Math.abs(b.x - a.x)),
  height: Math.max(1, Math.abs(b.y - a.y))
})

const createRectangleRingFromCorners = (a: Point2, b: Point2) => {
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return createRectangleRing({
    center,
    width: Math.max(1, Math.abs(b.x - a.x)),
    height: Math.max(1, Math.abs(b.y - a.y))
  })
}

const circleSourceFromRadiusPoint = (
  center: Point2,
  radiusPoint: Point2,
  segments = DEFAULT_CIRCLE_SEGMENTS
): Extract<BoundarySource, { kind: 'circle' }> => ({
  kind: 'circle',
  center,
  radius: Math.max(1, Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y)),
  segments
})

const createCircleRingFromRadiusPoint = (
  center: Point2,
  radiusPoint: Point2,
  segments = DEFAULT_CIRCLE_SEGMENTS
) =>
  createCircleRing({
    center,
    radius: Math.max(1, Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y)),
    segments
  })

const buildGridLines = (camera: Camera2d, size: { width: number; height: number }) => {
  const min = screenToWorld(camera, { x: 0, y: size.height }, size)
  const max = screenToWorld(camera, { x: size.width, y: 0 }, size)
  const spacing = GRID_SPACING_MM
  const lines: { key: string; major: boolean; a: ScreenPoint; b: ScreenPoint }[] = []
  const startX = Math.floor(min.x / spacing) * spacing
  const endX = Math.ceil(max.x / spacing) * spacing
  const startY = Math.floor(min.y / spacing) * spacing
  const endY = Math.ceil(max.y / spacing) * spacing

  for (let x = startX; x <= endX; x += spacing) {
    lines.push({
      key: `x-${x}`,
      major: Math.abs(x % (spacing * MAJOR_GRID_INTERVAL)) < 1e-9,
      a: worldToScreen(camera, { x, y: min.y }, size),
      b: worldToScreen(camera, { x, y: max.y }, size)
    })
  }

  for (let y = startY; y <= endY; y += spacing) {
    lines.push({
      key: `y-${y}`,
      major: Math.abs(y % (spacing * MAJOR_GRID_INTERVAL)) < 1e-9,
      a: worldToScreen(camera, { x: min.x, y }, size),
      b: worldToScreen(camera, { x: max.x, y }, size)
    })
  }

  return lines
}

const createDefaultDrawingCamera = (): Camera2d =>
  createSectionCamera2d({
    unitsPerPixel: DEFAULT_DRAWING_UNITS_PER_PIXEL
  }) as Camera2d

const measuredDrawingSize = (rect: Pick<DOMRectReadOnly, 'width' | 'height'>) => ({
  width: Math.max(320, Math.round(rect.width)),
  height: Math.max(280, Math.round(rect.height))
})

const measureSvgContentSize = (svg: SVGSVGElement) =>
  measuredDrawingSize({
    width: svg.clientWidth,
    height: svg.clientHeight
  })

const DEFAULT_FIT_INSETS = {
  top: 74,
  right: 36,
  bottom: 96,
  left: 36
}

const fitCameraToPointsWithInsets = (
  points: Point2[],
  size: { width: number; height: number },
  insets: { top: number; right: number; bottom: number; left: number }
): Camera2d => {
  if (!points.length || !size.width || !size.height) return createDefaultDrawingCamera()

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const usableW = Math.max(1, size.width - insets.left - insets.right)
  const usableH = Math.max(1, size.height - insets.top - insets.bottom)
  const unitsPerPixel = Math.max((maxX - minX || 1) / usableW, (maxY - minY || 1) / usableH, 0.05)
  const worldCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  const screenCenter = {
    x: insets.left + usableW / 2,
    y: insets.top + usableH / 2
  }

  return {
    target: [
      worldCenter.x - (screenCenter.x - size.width / 2) * unitsPerPixel,
      worldCenter.y + (screenCenter.y - size.height / 2) * unitsPerPixel
    ],
    unitsPerPixel
  }
}

export function SectionDrawingClient() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const boundaryExcelInputRef = useRef<HTMLInputElement | null>(null)
  const rotationSessionRef = useRef<BoundaryObject | null>(null)
  const pendingFitAfterImportRef = useRef(false)
  const pendingFitOnGeometryModuleRef = useRef(false)
  const analysisRevisionRef = useRef(0)
  const inverseAbortRef = useRef(new Map<number, AbortController>())
  const dragRef = useRef<
    | { kind: 'pan'; last: ScreenPoint }
    | { kind: 'vertex'; boundaryId: number; outerIndex: number; ringIndex: number; pointId: number; last: ScreenPoint }
    | { kind: 'boundary'; boundaryId: number; lastWorld: Point2 }
    | null
  >(null)
  const [theme, setTheme] = useState<Theme>('light')
  const [tool, setTool] = useState<Tool>('select')
  const [activeModule, setActiveModule] = useState<WorkspaceModule>('geometry')
  const [moduleSwitching, startModuleTransition] = useTransition()
  const [geometrySubTab, setGeometrySubTab] = useState<GeometrySubTab>('concrete')
  const [selectedRebarId, setSelectedRebarId] = useState<number | null>(null)
  const [boundaries, setBoundaries] = useState<BoundaryObject[]>([])
  const [selectedBoundaryIds, setSelectedBoundaryIds] = useState<number[]>([])
  const [activeBoundaryId, setActiveBoundaryId] = useState<number>(0)
  const [activeRingIndex, setActiveRingIndex] = useState(0)
  const [activeOuterIndex, setActiveOuterIndex] = useState(0)
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null)
  const [drawingDraft, setDrawingDraft] = useState<DrawingDraft>(null)
  const [snapCursor, setSnapCursor] = useState<Point2 | null>(null)
  const [appliedGeometryInput, setAppliedGeometryInput] = useState<GeometryInput>(() =>
    createEmptyGeometryInput({ id: 1, name: 'Column section' })
  )
  const [materialStore, setMaterialStore] = useState<MaterialStore>(() => createDefaultMaterialStore())
  const [calculationProfileId, setCalculationProfileId] = useState<CalculationProfileId>(DEFAULT_CALCULATION_PROFILE_ID)
  const [loadingsInput, setLoadingsInput] = useState<LoadingsInput>(() => createEmptyLoadingsInput())
  const [analysisOptions, setAnalysisOptions] = useState<CalculationAnalysisOptions>(() => createDefaultAnalysisOptions())
  const [designBasis, setDesignBasis] = useState<DesignBasis>(() =>
    createDefaultDesignBasis(createDefaultMaterialStore())
  )
  const [selectedLoadcaseId, setSelectedLoadcaseId] = useState<number | null>(null)
  const [reportDetailIds, setReportDetailIds] = useState<number[]>([])
  const [reportState, setReportState] = useState<'idle' | 'working' | 'error'>('idle')
  const [reportMessage, setReportMessage] = useState('')
  const [sectionResultsView, setSectionResultsView] = useState<SectionResultsView>(createSectionResultsView)
  const [demandCheckView, setDemandCheckView] = useState<DemandCheckView>(createDemandCheckView)
  const updateSectionResultsView = useCallback(
    (patch: Partial<SectionResultsView>) => setSectionResultsView((current) => ({ ...current, ...patch })),
    []
  )
  const updateDemandCheckView = useCallback(
    (patch: Partial<DemandCheckView>) => setDemandCheckView((current) => ({ ...current, ...patch })),
    []
  )
  const [fixedResultP, setFixedResultP] = useState(0)
  const [resultSurface, setResultSurface] = useState<PreviewSurface | null>(null)
  const [surfaceStatus, setSurfaceStatus] = useState<'idle' | 'working' | 'error'>('idle')
  const [surfaceMessage, setSurfaceMessage] = useState('')
  const [inverseResults, setInverseResults] = useState<Record<number, InversePreviewResult>>({})
  const [inverseWorkingById, setInverseWorkingById] = useState<Record<number, boolean>>({})
  const [quickChecksById, setQuickChecksById] = useState<Record<number, LoadcaseQuickCheckResult>>({})
  const [quickCheckWorking, setQuickCheckWorking] = useState(false)
  const [projectMeta, setProjectMeta] = useState(() => ({
    id: 1,
    name: 'Column project',
    createdAt: new Date().toISOString()
  }))
  const [lastBooleanWarning, setLastBooleanWarning] = useState<string>('')
  const [detailTab, setDetailTab] = useState<'basic' | 'points'>('basic')
  const [analysisSubTab, setAnalysisSubTab] = useState<AnalysisSubTab>('points')
  const [circleSegmentsDraft, setCircleSegmentsDraft] = useState<string | null>(null)
  const [rotationDraft, setRotationDraft] = useState('0')
  const [size, setSize] = useState(DEFAULT_DRAWING_SIZE)
  const [isDrawingMeasured, setIsDrawingMeasured] = useState(false)
  const [camera, setCamera] = useState<Camera2d>(() => createDefaultDrawingCamera())

  const changeCalculationProfile = (profileId: CalculationProfileId) => {
    setCalculationProfileId(profileId)
    setMaterialStore((current) => applyCalculationProfileToMaterials(current, profileId))
    setAnalysisOptions(createAnalysisOptionsForProfile(profileId))
    setDesignBasis(createDesignBasisForCalculationProfile(profileId))
    setAnalysisSubTab('points')
  }

  useEffect(() => {
    document.body.dataset.jscadTheme = theme
  }, [theme])

  useLayoutEffect(() => {
    if (isResultsModule(activeModule)) return
    const svg = svgRef.current
    if (!svg) return

    setSize(measureSvgContentSize(svg))
    setIsDrawingMeasured(true)

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const nextSize = measuredDrawingSize(entry.contentRect)
      setSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize
      )
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [activeModule])

  const activeBoundary = useMemo(
    () => boundaries.find((boundary) => boundary.id === activeBoundaryId) ?? boundaries[0],
    [activeBoundaryId, boundaries]
  )
  const showBasicDetailTab = Boolean(activeBoundary && activeBoundary.source.kind !== 'boolean')
  const effectiveDetailTab = showBasicDetailTab ? detailTab : 'points'

  useEffect(() => {
    if (!showBasicDetailTab && detailTab === 'basic') setDetailTab('points')
  }, [showBasicDetailTab, detailTab])

  const finalSection = useMemo(
    () => sectionGeometryFromGeometryInput(appliedGeometryInput),
    [appliedGeometryInput]
  )
  const rebars = useMemo(() => geometryInputRebars(appliedGeometryInput), [appliedGeometryInput])
  const activeOuter = activeBoundary?.outers[activeOuterIndex] ?? activeBoundary?.outers[0] ?? []
  const activeRing = activeOuter[activeRingIndex] ?? activeOuter[0] ?? []
  const activeSection = activeBoundary ? boundaryToSectionGeometry(activeBoundary) : finalSection
  const activeFreeformBounds = useMemo(
    () => ringBounds(activeBoundary?.outers[0]?.[0] ?? []),
    [activeBoundary?.outers]
  )
  const activeOuterHoleCount = Math.max(0, activeOuter.length - 1)
  const hasAppliedSection = finalSection.solids.some((solid) => solid.outer.length >= 3)
  const appliedBoundaryId = hasAppliedSection ? finalSection.id : 0
  const activeSummary = useMemo(() => summarizeSection(activeSection), [activeSection])

  useEffect(() => {
    setResultSurface(null)
    setSurfaceMessage('')

    if (!hasAppliedSection) {
      setSurfaceStatus('idle')
      return
    }

    // Coalesce a burst of edits — dragging a vertex used to enqueue one full surface build per
    // pointer move, and the worker had no way to drop the ones already overtaken.
    const controller = new AbortController()
    setSurfaceStatus('working')
    const timer = window.setTimeout(() => {
      buildPreviewSurfaceAsync(
        { calculationProfileId, section: finalSection, rebars, materialStore, analysisOptions, designBasis },
        controller.signal
      )
        .then((surface) => {
          setResultSurface(surface)
          setSurfaceStatus('idle')
        })
        .catch((error) => {
          if (isAnalysisAbort(error)) return
          setResultSurface(null)
          setSurfaceStatus('error')
          setSurfaceMessage(error instanceof Error ? error.message : String(error))
        })
    }, ANALYSIS_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [analysisOptions, calculationProfileId, designBasis, finalSection, hasAppliedSection, materialStore, rebars])
  const appliedSummary = useMemo(() => summarizeSection(finalSection), [finalSection])
  const steelArea = useMemo(
    () => rebars.reduce((sum, bar) => sum + (Math.PI * bar.dia * bar.dia) / 4, 0),
    [rebars]
  )
  const betaCount = useMemo(() => {
    if (!resultSurface) return 0
    return new Set(resultSurface.points.map((point) => point.beta)).size
  }, [resultSurface])
  const stationCount = useMemo(() => {
    if (!resultSurface) return 0
    return new Set(resultSurface.points.map((point) => point.station)).size
  }, [resultSurface])

  /** Everything the Section Results sidebar reports, assembled once per surface. */
  const sectionResultsSummary = useMemo<SectionResultsSummary>(() => ({
    hasAppliedSection,
    status: surfaceStatus,
    message: surfaceMessage,
    concreteArea: appliedSummary.area,
    steelArea,
    rebarCount: rebars.length,
    meshCells: resultSurface?.mesh.cells ?? 0,
    meshPoints: resultSurface?.mesh.points ?? 0,
    surfacePoints: resultSurface?.points.length ?? 0,
    directionCount: betaCount,
    stationCount,
    refinement: resultSurface
      ? {
          tolerance: resultSurface.directionError.tolerance,
          maxRelative: Math.max(
            resultSurface.directionError.maxRelativeP,
            resultSurface.directionError.maxRelativeMoment
          ),
          withinTolerance: resultSurface.directionError.withinTolerance
        }
      : null,
    warnings: resultSurface?.warnings ?? [],
    mechanics: resultSurface?.mechanics ?? null
  }), [
    appliedSummary.area,
    betaCount,
    hasAppliedSection,
    rebars.length,
    resultSurface,
    stationCount,
    steelArea,
    surfaceMessage,
    surfaceStatus
  ])

  /** Slider bounds for the fixed-P contour; a missing surface collapses to a disabled range. */
  const fixedPRange = useMemo(
    () => ({
      min: resultSurface ? resultSurface.bounds.P[0] : 0,
      max: resultSurface ? resultSurface.bounds.P[1] : 0
    }),
    [resultSurface]
  )
  const gridLines = useMemo(() => buildGridLines(camera, size), [camera, size])
  const activeCentroidScreen = useMemo(
    () => worldToScreen(camera, activeSummary.centroid, size),
    [camera, size, activeSummary.centroid]
  )
  const allVisiblePoints = useMemo(
    () =>
      boundaries
        .filter((boundary) => boundary.visible)
        .flatMap((boundary) => boundary.outers.flatMap((outer) => outer.flat())),
    [boundaries]
  )

  useLayoutEffect(() => {
    if (activeModule !== 'geometry') return
    if (!pendingFitOnGeometryModuleRef.current) return
    if (!isDrawingMeasured) return
    if (!allVisiblePoints.length) return
    pendingFitOnGeometryModuleRef.current = false
    setCamera(fitCameraToPointsWithInsets(allVisiblePoints, size, DEFAULT_FIT_INSETS))
  }, [activeModule, allVisiblePoints, isDrawingMeasured, size])

  const appliedSectionPath = useMemo(() => {
    if (!hasAppliedSection) return ''
    const screenRings = finalSection.solids.flatMap((solid) =>
      [solid.outer, ...solid.holes].map((ring) => ring.map((point) => worldToScreen(camera, point, size)))
    )
    return compoundPolygonPath(screenRings)
  }, [camera, finalSection, hasAppliedSection, size])

  const appliedSourceBoundary = useMemo(
    () => boundaries.find((boundary) => boundary.id === appliedBoundaryId) ?? null,
    [appliedBoundaryId, boundaries]
  )
  const showAppliedGhost = Boolean(appliedSectionPath && appliedSourceBoundary && !appliedSourceBoundary.locked)

  const boundaryScreenData = useMemo<BoundaryScreenData[]>(
    () =>
      boundaries
        .filter((boundary) => boundary.visible)
        .map((boundary) => {
          const outers = boundary.outers.map((outer) =>
            outer.map((ring) =>
              ring.map((point) => ({
                id: point.id,
                wx: point.x,
                wy: point.y,
                ...worldToScreen(camera, point, size)
              }))
            )
          )
          return {
            boundary,
            outers,
            path: compoundPolygonPath(outers.flat())
          }
        }),
    [boundaries, camera, size]
  )

  const selectedBoundaries = selectedBoundaryIds
    .map((id) => boundaries.find((boundary) => boundary.id === id))
    .filter((boundary): boundary is BoundaryObject => Boolean(boundary))

  useEffect(() => {
    analysisRevisionRef.current += 1
    // Withdraw every loadcase solve still queued against the previous input revision.
    for (const controller of inverseAbortRef.current.values()) controller.abort()
    inverseAbortRef.current.clear()
    setInverseResults({})
    setInverseWorkingById({})
    setQuickChecksById({})
  }, [analysisOptions, appliedGeometryInput, designBasis, materialStore])

  useEffect(() => {
    const controllers = inverseAbortRef.current
    return () => {
      for (const controller of controllers.values()) controller.abort()
      controllers.clear()
    }
  }, [])

  useEffect(() => {
    setInverseResults({})
  }, [loadingsInput])

  useEffect(() => {
    setQuickChecksById({})

    if (!resultSurface || loadingsInput.combinations.length === 0) {
      setQuickCheckWorking(false)
      return
    }

    const controller = new AbortController()
    setQuickCheckWorking(true)
    const timer = window.setTimeout(() => {
      checkLoadcasesAsync({ surface: resultSurface, loadcases: loadingsInput.combinations }, controller.signal)
        .then((results) => {
          setQuickChecksById(Object.fromEntries(results.map((result) => [result.loadcaseId, result])))
          setQuickCheckWorking(false)
        })
        .catch((error) => {
          if (isAnalysisAbort(error)) return
          setSurfaceMessage(error instanceof Error ? error.message : String(error))
          setQuickCheckWorking(false)
        })
    }, ANALYSIS_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadingsInput.combinations, resultSurface])

  useEffect(() => {
    if (!resultSurface) return
    if (fixedResultP !== 0) return
    const mid = (resultSurface.bounds.P[0] + resultSurface.bounds.P[1]) / 2
    setFixedResultP(mid)
  }, [fixedResultP, resultSurface])

  const calculateInverseForLoadcase = (loadcase: LoadCombination, force = false) => {
    setSelectedLoadcaseId(loadcase.id)
    if (!hasAppliedSection || !resultSurface) return
    if (!force && inverseResults[loadcase.id]) return
    if (inverseWorkingById[loadcase.id]) return
    const revision = analysisRevisionRef.current
    inverseAbortRef.current.get(loadcase.id)?.abort()
    const controller = new AbortController()
    inverseAbortRef.current.set(loadcase.id, controller)
    setInverseWorkingById((current) => ({ ...current, [loadcase.id]: true }))
    checkLoadcaseAsync(
      { calculationProfileId, section: finalSection, rebars, materialStore, loadcase, surface: resultSurface, designBasis },
      controller.signal
    )
      .then((result) => {
        if (analysisRevisionRef.current !== revision) return
        setInverseResults((current) => ({ ...current, [loadcase.id]: result }))
      })
      .catch((error) => {
        if (isAnalysisAbort(error) || analysisRevisionRef.current !== revision) return
        setSurfaceMessage(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (inverseAbortRef.current.get(loadcase.id) === controller) inverseAbortRef.current.delete(loadcase.id)
        if (analysisRevisionRef.current !== revision) return
        setInverseWorkingById((current) => {
          const next = { ...current }
          delete next[loadcase.id]
          return next
        })
      })
  }

  /**
   * Build the PDF from the surface already on screen.
   *
   * The report re-solves each selected combination rather than reading the UI's cache, so a report
   * can never publish a check the current surface would not reproduce.
   */
  const exportPdfReport = async () => {
    if (!resultSurface || !hasAppliedSection) {
      setReportState('error')
      setReportMessage('Build the section resistance surface before exporting a report.')
      return
    }
    setReportState('working')
    setReportMessage('')
    try {
      const { blob, fileName } = await exportColumnReportPdfAsync({
        projectName: projectMeta.name || appliedGeometryInput.name || 'Column project',
        sectionName: appliedGeometryInput.name || 'Section',
        calculationProfileId,
        section: finalSection,
        rebars,
        materialStore,
        designBasis,
        analysisOptions,
        surface: resultSurface,
        loadcases: loadingsInput.combinations,
        detailLoadcaseIds: reportDetailIds
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(url)
      setReportState('idle')
      setReportMessage(`Saved ${fileName}`)
    } catch (error) {
      setReportState('error')
      setReportMessage(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Selecting a combination is a demand-check action wherever it comes from — including a click on
   * a demand marker in the Section Results 3D plot — so it also moves the user to that menu.
   */
  const runInverseForLoadcase = (id: number) => {
    setActiveModule('demand')
    const loadcase = loadingsInput.combinations.find((item) => item.id === id)
    if (!loadcase) {
      setSelectedLoadcaseId(id)
      return
    }
    calculateInverseForLoadcase(loadcase)
  }

  // Rebuild the selected detail after either the resistance surface or the loadcase list changes.
  // The latter matters when a new row is created: selection can be emitted before React has committed
  // the new loadcase to parent state, so the first direct lookup legitimately finds no row yet.
  useEffect(() => {
    if (!resultSurface || activeModule !== 'demand' || selectedLoadcaseId == null) return
    const loadcase = loadingsInput.combinations.find((item) => item.id === selectedLoadcaseId)
    if (loadcase) calculateInverseForLoadcase(loadcase, true)
  }, [activeModule, loadingsInput.combinations, resultSurface, selectedLoadcaseId])

  const draftRing = useMemo(() => {
    if (!drawingDraft) return []
    if (drawingDraft.tool === 'draw-rectangle' && drawingDraft.cursor) {
      return createRectangleRingFromCorners(drawingDraft.start, drawingDraft.cursor)
    }
    if (drawingDraft.tool === 'draw-circle' && drawingDraft.cursor) {
      return createCircleRingFromRadiusPoint(drawingDraft.center, drawingDraft.cursor, DEFAULT_CIRCLE_SEGMENTS)
    }
    if (drawingDraft.tool === 'draw-polygon') {
      return drawingDraft.cursor ? [...drawingDraft.points, drawingDraft.cursor] : drawingDraft.points
    }
    return []
  }, [drawingDraft])

  const draftScreenRing = useMemo(
    () => draftRing.map((point) => worldToScreen(camera, point, size)),
    [camera, draftRing, size]
  )
  const draftPath = useMemo(() => {
    if (!drawingDraft || draftScreenRing.length === 0) return ''
    if (drawingDraft.tool === 'draw-polygon') {
      return `${draftScreenRing.map((p, index) => `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}${drawingDraft.points.length >= 3 ? ' Z' : ''}`
    }
    return polygonPath(draftScreenRing)
  }, [draftScreenRing, drawingDraft])
  const snapCursorView = useMemo(
    () => (snapCursor && tool !== 'select' ? { world: snapCursor, screen: worldToScreen(camera, snapCursor, size) } : null),
    [camera, size, snapCursor, tool]
  )

  const updateAppliedRebars = (nextRebars: GeometryInputRebarView[]) => {
    setAppliedGeometryInput((current) => updateGeometryInputRebars(current, nextRebars))
    setBoundaries((current) =>
      current.map((boundary) =>
        boundary.id === appliedBoundaryId ? { ...boundary, rebars: nextRebars.map((bar) => ({ ...bar })) } : boundary
      )
    )
  }

  const addBoundary = (boundary: BoundaryObject) => {
    setBoundaries((current) => [...current, boundary])
    setSelectedBoundaryIds([boundary.id])
    setActiveBoundaryId(boundary.id)
    setActiveOuterIndex(0)
    setActiveRingIndex(0)
    setSelectedPointId(boundary.outers[0]?.[0]?.[0]?.id ?? null)
    setDetailTab(boundary.source.kind === 'boolean' ? 'points' : 'basic')
  }

  const createDefaultBoundary = (kind: 'rectangle' | 'circle') => {
    const id = makeBoundaryId(boundaries.map((item) => item.id))
    const usedPointIds = boundaries.flatMap(collectBoundaryPointIds)
    const center = { id: makePointId(usedPointIds), x: 0, y: 0 }
    const source: BoundarySource =
      kind === 'rectangle'
        ? { kind: 'rectangle', center, width: 400, height: 400 }
        : { kind: 'circle', center, radius: 200, segments: DEFAULT_CIRCLE_SEGMENTS }
    const ring =
      source.kind === 'rectangle'
        ? createRectangleRing({ center: source.center, width: source.width, height: source.height, usedIds: usedPointIds })
        : createCircleRing({ center: source.center, radius: source.radius, segments: source.segments, usedIds: usedPointIds })
    addBoundary({
      id,
      name: `${kind === 'rectangle' ? 'Rectangle' : 'Circle'} ${id}`,
      outers: [[ring]],
      sourceKind: kind,
      source,
      rebars: [],
      visible: true,
      locked: false
    })
    pendingFitAfterImportRef.current = true
  }

  const exportBoundaryExcel = async (boundary: BoundaryObject) => {
    try {
      await downloadSectionWorkbook({
        name: boundary.name,
        outers: boundary.outers,
        rebars: boundary.rebars,
        steelMaterials: materialStore.steel
      })
    } catch (error) {
      window.alert(`Excel export failed:\n${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const addImportedBoundary = (imported: ImportedSectionWorkbook) => {
    const id = makeBoundaryId(boundaries.map((item) => item.id))
    const usedPointIds = boundaries.flatMap(collectBoundaryPointIds)
    const boundary: BoundaryObject = {
      id,
      name: imported.name,
      outers: remapBoundaryPoints(imported.outers, 0, 0, usedPointIds),
      sourceKind: 'manual',
      source: { kind: 'manual' },
      rebars: imported.rebars.map((bar) => ({ ...bar })),
      visible: true,
      locked: false
    }
    addBoundary(boundary)
    pendingFitAfterImportRef.current = true
  }

  const handleBoundaryExcelFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const fallbackName = file.name.replace(/\.xlsx$/i, '').replace(/-section$/i, '') || 'Imported section'
      const imported = await importSectionWorkbook(
        await file.arrayBuffer(),
        materialStore.steel,
        materialStore.defaults.steelMaterialId,
        fallbackName
      )
      const pointCount = imported.outers.reduce(
        (sum, outer) => sum + outer.reduce((ringSum, ring) => ringSum + ring.length, 0),
        0
      )
      const outside = imported.rebars.filter((bar) => !barCenterInsideOuters(imported.outers, bar))
      const warnings = [...imported.warnings]
      if (outside.length > 0) {
        warnings.push(
          `${outside.length} bar(s) outside concrete or inside a hole (ids: ${outside.map((bar) => bar.id).join(', ')}). You can edit them after import.`
        )
      }
      const warningText = warnings.length ? `\n\nWarnings:\n${warnings.join('\n')}` : ''
      const confirmed = window.confirm(
        `Import "${imported.name}" as a new draft boundary?\n\n${imported.outers.length} outer(s), ${pointCount} point(s), ${imported.rebars.length} rebar(s).${warningText}`
      )
      if (confirmed) addImportedBoundary(imported)
    } catch (error) {
      window.alert(`Excel import failed:\n${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const commitDrawnBoundary = (name: string, sourceKind: BoundaryObject['sourceKind'], ring: Point2[], source?: BoundarySource) => {
    if (ring.length < 3) return
    const boundary: BoundaryObject = {
      id: makeBoundaryId(boundaries.map((item) => item.id)),
      name,
      outers: [[ring]],
      sourceKind,
      source: source ?? { kind: 'manual' },
      rebars: [],
      visible: true,
      locked: false
    }
    addBoundary(boundary)
    setDrawingDraft(null)
    setSnapCursor(null)
    setTool('select')
  }

  const worldPointFromPointer = (
    event: React.PointerEvent<SVGSVGElement> | React.WheelEvent<SVGSVGElement>,
    svg: SVGSVGElement,
    used: Iterable<number> = []
  ) => {
    const point = snapWorldPoint(screenToWorld(camera, eventPoint(event, svg), size), GRID_SPACING_MM)
    return { id: makePointId(used), x: point.x, y: point.y }
  }

  const selectBoundary = (id: number, additive = false) => {
    setCircleSegmentsDraft(null)
    setActiveBoundaryId(id)
    setActiveOuterIndex(0)
    setActiveRingIndex(0)
    setSelectedPointId(boundaries.find((boundary) => boundary.id === id)?.outers[0]?.[0]?.[0]?.id ?? null)
    setSelectedBoundaryIds((current) => {
      if (!additive) return [id]
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id)
      return [...current, id]
    })
  }

  const commitCircleSegmentsDraft = () => {
    if (circleSegmentsDraft === null) return
    const segments = Math.max(8, Math.min(256, Math.round(Number(circleSegmentsDraft) || 8)))
    updateActiveCircleSource({ segments })
    setCircleSegmentsDraft(null)
  }

  const updateBoundary = (id: number, patch: Partial<BoundaryObject>) => {
    setBoundaries((current) => current.map((boundary) => (boundary.id === id ? { ...boundary, ...patch } : boundary)))
  }

  const updateActiveBoundarySource = (source: BoundarySource) => {
    if (!activeBoundary || activeBoundary.locked) return

    const existingHoles = activeBoundary.outers[0]?.slice(1) ?? []
    const usedHolePointIds = existingHoles.flatMap((ring) => ring.map((point) => point.id))

    const outers: Point2[][][] =
      source.kind === 'rectangle'
        ? [
            [
              createRectangleRing({
                center: source.center,
                width: source.width,
                height: source.height,
                usedIds: usedHolePointIds
              }),
              ...existingHoles.map(cloneRing)
            ]
          ]
        : source.kind === 'circle'
          ? [
              [
                createCircleRing({
                  center: source.center,
                  radius: source.radius,
                  segments: source.segments,
                  usedIds: usedHolePointIds
                }),
                ...existingHoles.map(cloneRing)
              ]
            ]
          : source.kind === 'capsule'
            ? [
                [
                  createCapsuleRing({
                    center: source.center,
                    width: source.width,
                    height: source.height,
                    segmentsPerCap: Math.max(4, Math.round(source.segments / 2)),
                    usedIds: usedHolePointIds
                  }),
                  ...existingHoles.map(cloneRing)
                ]
              ]
            : activeBoundary.outers

    setBoundaries((current) =>
      current.map((boundary) =>
        boundary.id === activeBoundary.id
          ? {
              ...boundary,
              source,
              sourceKind: source.kind === 'boolean' ? 'boolean' : source.kind === 'manual' ? 'manual' : source.kind,
              outers
            }
          : boundary
      )
    )
    setSelectedPointId(outers[0]?.[0]?.[0]?.id ?? null)
    setActiveOuterIndex(0)
    setActiveRingIndex(0)
  }

  const updateActiveRectangleSource = (patch: Partial<Extract<BoundarySource, { kind: 'rectangle' }>>) => {
    if (activeBoundary?.source?.kind !== 'rectangle') return
    updateActiveBoundarySource({ ...activeBoundary.source, ...patch })
  }

  const updateActiveCircleSource = (patch: Partial<Extract<BoundarySource, { kind: 'circle' }>>) => {
    if (activeBoundary?.source?.kind !== 'circle') return
    updateActiveBoundarySource({ ...activeBoundary.source, ...patch })
  }

  const updateActiveCapsuleSource = (patch: Partial<Extract<BoundarySource, { kind: 'capsule' }>>) => {
    if (activeBoundary?.source?.kind !== 'capsule') return
    updateActiveBoundarySource({ ...activeBoundary.source, ...patch })
  }

  const updateActiveFreeformBounds = (patch: {
    centerX?: number
    centerY?: number
    width?: number
    height?: number
  }) => {
    if (!activeBoundary || activeBoundary.locked) return
    const outer = activeBoundary.outers[0]?.[0] ?? []
    if (outer.length < 3) return
    const bounds = ringBounds(outer)
    const nextCenterX = patch.centerX ?? bounds.centerX
    const nextCenterY = patch.centerY ?? bounds.centerY
    const nextWidth = Math.max(1, patch.width ?? Math.max(bounds.width, 1))
    const nextHeight = Math.max(1, patch.height ?? Math.max(bounds.height, 1))
    const scaleX = bounds.width > 1e-9 ? nextWidth / bounds.width : 1
    const scaleY = bounds.height > 1e-9 ? nextHeight / bounds.height : 1
    const dx = nextCenterX - bounds.centerX
    const dy = nextCenterY - bounds.centerY

    setBoundaries((current) =>
      current.map((boundary) => {
        if (boundary.id !== activeBoundary.id) return boundary
        return {
          ...boundary,
          sourceKind: 'manual',
          source: { kind: 'manual' },
          outers: boundary.outers.map((outer) =>
            outer.map((ring) =>
              ring.map((point) => ({
                ...point,
                x: (point.x - bounds.centerX) * scaleX + bounds.centerX + dx,
                y: (point.y - bounds.centerY) * scaleY + bounds.centerY + dy
              }))
            )
          )
        }
      })
    )
  }

  const rotatedBoundary = (boundary: BoundaryObject, angleDeg: number): BoundaryObject => {
    const centroid = summarizeSection(boundaryToSectionGeometry(boundary)).centroid
    const angle = (angleDeg * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const rotate = <T extends { x: number; y: number }>(value: T): T => ({
      ...value,
      x: centroid.x + (value.x - centroid.x) * cos - (value.y - centroid.y) * sin,
      y: centroid.y + (value.x - centroid.x) * sin + (value.y - centroid.y) * cos
    })
    return {
      ...boundary,
      sourceKind: boundary.source.kind === 'boolean' ? 'boolean' : 'manual',
      source: boundary.source.kind === 'boolean' ? boundary.source : { kind: 'manual' },
      outers: boundary.outers.map((outer) => outer.map((ring) => ring.map(rotate))),
      rebars: boundary.rebars.map(rotate)
    }
  }

  const beginRotationPreview = () => {
    if (!activeBoundary || activeBoundary.locked) return
    rotationSessionRef.current = {
      ...activeBoundary,
      outers: activeBoundary.outers.map((outer) => outer.map(cloneRing)),
      rebars: activeBoundary.rebars.map((bar) => ({ ...bar }))
    }
    setRotationDraft('0')
  }

  const previewRotation = (value: string) => {
    setRotationDraft(value)
    const baseline = rotationSessionRef.current
    const angle = Number(value)
    if (!baseline || !Number.isFinite(angle)) return
    setBoundaries((current) =>
      current.map((boundary) => (boundary.id === baseline.id ? rotatedBoundary(baseline, angle) : boundary))
    )
  }

  const commitRotationDraft = () => {
    rotationSessionRef.current = null
    setRotationDraft('0')
  }

  const deleteBoundary = (id: number) => {
    setBoundaries((current) => current.filter((boundary) => boundary.id !== id))
    setSelectedBoundaryIds((current) => current.filter((selectedId) => selectedId !== id))
    if (finalSection.id === id) {
      setAppliedGeometryInput(createEmptyGeometryInput({ id: 1, name: 'Column section' }))
      setSelectedRebarId(null)
    }
    if (activeBoundaryId === id) {
      const nextBoundary = boundaries.find((boundary) => boundary.id !== id)
      setActiveBoundaryId(nextBoundary?.id ?? 0)
      setActiveOuterIndex(0)
      setActiveRingIndex(0)
      setSelectedPointId(nextBoundary?.outers[0]?.[0]?.[0]?.id ?? null)
    }
  }

  const requestDeleteBoundary = (id: number) => {
    const boundary = boundaries.find((item) => item.id === id)
    if (!boundary) return

    if (id === appliedBoundaryId) {
      const confirmed = window.confirm(
        `“${boundary.name}” is the applied section. Remove it and clear the applied section?`
      )
      if (!confirmed) return
    }

    deleteBoundary(id)
  }

  const applyBooleanAction = (action: BooleanAction) => {
    if (selectedBoundaries.length < 2) return

    const subtractBaseArea =
      action === 'subtract' ? summarizeSection(boundaryToSectionGeometry(selectedBoundaries[0])).area : null

    const usedPrimitiveIds: number[] = []
    const primitives =
      action === 'union'
        ? selectedBoundaries.flatMap((boundary) => boundaryToPrimitives(boundary, 'add', usedPrimitiveIds))
        : (() => {
            const [outer, ...inners] = selectedBoundaries
            return [
              ...boundaryToPrimitives(outer, 'add', usedPrimitiveIds),
              ...inners.flatMap((boundary) => boundaryToPrimitives(boundary, 'subtract', usedPrimitiveIds))
            ]
          })()

    const result = composeSectionPrimitives(primitives, {
      id: makeBoundaryId(boundaries.map((item) => item.id)),
      name: action === 'union' ? 'Union result' : 'Subtract result'
    })
    setLastBooleanWarning(result.warnings.join(' '))
    if (!result.geometry.solids.some((solid) => solid.outer.length >= 3)) return
    if (action === 'subtract' && subtractBaseArea !== null) {
      const resultArea = summarizeSection(result.geometry).area
      const areaTolerance = Math.max(1e-6, subtractBaseArea * 1e-9)
      if (Math.abs(resultArea - subtractBaseArea) <= areaTolerance) {
        setLastBooleanWarning(
          result.warnings.join(' ') || 'Subtract ignored because the later selections do not overlap the first selected boundary.'
        )
        return
      }
    }

    const resultBoundary = sectionGeometryToBoundary(result.geometry, {
      id: result.geometry.id,
      name: result.geometry.name,
      sourceKind: 'boolean',
      source: { kind: 'boolean' }
    })
    addBoundary(resultBoundary)
  }

  const updateActivePoint = (id: number, patch: Partial<Point2>) => {
    if (!activeBoundary || activeBoundary.locked) return
    setBoundaries((current) =>
      current.map((boundary) => {
        if (boundary.id !== activeBoundary.id) return boundary
        return withEditedOuters(
          boundary,
          mapOuterRing(boundary.outers, activeOuterIndex, activeRingIndex, (ring) =>
            ring.map((point) => (point.id === id ? { ...point, ...patch } : point))
          )
        )
      })
    )
  }

  const moveBoundary = (id: number, delta: { x: number; y: number }) => {
    setBoundaries((current) =>
      current.map((boundary) => {
        if (boundary.id !== id || boundary.locked) return boundary
        const source =
          boundary.source.kind === 'rectangle' || boundary.source.kind === 'circle' || boundary.source.kind === 'capsule'
            ? {
                ...boundary.source,
                center: {
                  ...boundary.source.center,
                  x: boundary.source.center.x + delta.x,
                  y: boundary.source.center.y + delta.y
                }
              }
            : boundary.source

        return {
          ...boundary,
          source,
          outers: boundary.outers.map((outer) =>
            outer.map((ring) =>
              ring.map((point) => ({
                ...point,
                x: point.x + delta.x,
                y: point.y + delta.y
              }))
            )
          )
        }
      })
    )
  }

  const updateBoundaryPoint = (
    boundaryId: number,
    outerIndex: number,
    ringIndex: number,
    pointId: number,
    patch: Partial<Point2>
  ) => {
    setBoundaries((current) =>
      current.map((boundary) => {
        if (boundary.id !== boundaryId || boundary.locked) return boundary
        return withEditedOuters(
          boundary,
          mapOuterRing(boundary.outers, outerIndex, ringIndex, (ring) =>
            ring.map((point) => (point.id === pointId ? { ...point, ...patch } : point))
          )
        )
      })
    )
  }

  const addPointAfterSelected = () => {
    if (!activeBoundary || activeBoundary.locked || activeRing.length < 3) return
    const selectedIndex = Math.max(0, activeRing.findIndex((point) => point.id === selectedPointId))
    const currentPoint = activeRing[selectedIndex] ?? { x: 0, y: 0 }
    const nextPoint = activeRing[(selectedIndex + 1) % activeRing.length] ?? currentPoint
    const point = {
      id: makePointId(collectBoundaryPointIds(activeBoundary)),
      x: Math.round((currentPoint.x + nextPoint.x) / 2 / GRID_SPACING_MM) * GRID_SPACING_MM,
      y: Math.round((currentPoint.y + nextPoint.y) / 2 / GRID_SPACING_MM) * GRID_SPACING_MM
    }
    setBoundaries((current) =>
      current.map((boundary) => {
        if (boundary.id !== activeBoundary.id) return boundary
        return withEditedOuters(
          boundary,
          mapOuterRing(boundary.outers, activeOuterIndex, activeRingIndex, (ring) => {
            const nextRing = [...ring]
            nextRing.splice(selectedIndex + 1, 0, point)
            return nextRing
          })
        )
      })
    )
    setSelectedPointId(point.id)
  }

  const deleteSelectedPoint = (pointId = selectedPointId) => {
    if (!activeBoundary || activeBoundary.locked || !pointId || activeRing.length <= 3) return
    const nextRing = activeRing.filter((point) => point.id !== pointId)
    setBoundaries((current) =>
      current.map((boundary) => {
        if (boundary.id !== activeBoundary.id) return boundary
        return withEditedOuters(
          boundary,
          mapOuterRing(boundary.outers, activeOuterIndex, activeRingIndex, () => nextRing)
        )
      })
    )
    setSelectedPointId(nextRing[0]?.id ?? null)
  }

  const applyBoundaryAsSection = (boundaryToApply: BoundaryObject) => {
    const summary = summarizeSection(boundaryToSectionGeometry(boundaryToApply))
    if (summary.area <= 0 || boundaryToApply.outers.every((outer) => (outer[0]?.length ?? 0) < 3)) return
    const appliedId = boundaryToApply.id
    const previousAppliedId = hasAppliedSection ? finalSection.id : 0

    setAppliedGeometryInput(
      geometryInputFromOuterRings(
        appliedId,
        boundaryToApply.name,
        boundaryToApply.outers,
        boundaryToApply.rebars
      )
    )
    setLastBooleanWarning('')
    if (previousAppliedId && previousAppliedId !== appliedId) {
      setSelectedRebarId(null)
    }
    setBoundaries((current) =>
      current.map((boundary) => {
        if (boundary.id === appliedId) return { ...boundary, locked: true }
        if (previousAppliedId && boundary.id === previousAppliedId) return { ...boundary, locked: false }
        return boundary
      })
    )
  }

  const exportAppliedRebarsExcel = async () => {
    if (!hasAppliedSection) return
    try {
      await downloadRebarWorkbook({
        sectionName: finalSection.name,
        rebars,
        steelMaterials: materialStore.steel
      })
    } catch (error) {
      window.alert(`Rebar Excel export failed:\n${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const importAppliedRebarsExcel = async (file: File) => {
    if (!hasAppliedSection) return
    try {
      const imported = await importRebarWorkbook(
        await file.arrayBuffer(),
        materialStore.steel,
        materialStore.defaults.steelMaterialId,
        finalSection.solids.length
      )
      const appliedBoundary = boundaries.find((boundary) => boundary.id === appliedBoundaryId)
      if (!appliedBoundary) throw new Error('The applied boundary is not available in the editor.')
      const outside = imported.rebars.filter((bar) => !barCenterInsideBoundary(appliedBoundary, bar))
      const warnings = [...imported.warnings]
      if (outside.length > 0) {
        warnings.push(
          `${outside.length} bar(s) outside concrete or inside a hole (ids: ${outside.map((bar) => bar.id).join(', ')}). You can edit them after import.`
        )
      }
      const warningText = warnings.length ? `\n\nWarnings:\n${warnings.join('\n')}` : ''
      const confirmed = window.confirm(
        `Replace the current ${rebars.length} rebar(s) with ${imported.rebars.length} imported rebar(s)?\nConcrete geometry will not change.${warningText}`
      )
      if (!confirmed) return
      updateAppliedRebars(imported.rebars)
      setSelectedRebarId(imported.rebars[0]?.id ?? null)
    } catch (error) {
      window.alert(`Rebar Excel import failed:\n${error instanceof Error ? error.message : String(error)}`)
    }
  }

  useEffect(() => {
    if (!pendingFitAfterImportRef.current) return
    pendingFitAfterImportRef.current = false
    setCamera(fitCameraToPointsWithInsets(allVisiblePoints, size, DEFAULT_FIT_INSETS))
  }, [allVisiblePoints, size])

  const exportProjectJson = () => {
    const draftCount = boundaries.filter((boundary) => boundary.id !== appliedBoundaryId).length
    if (!hasAppliedSection && boundaries.length > 0) {
      const proceed = window.confirm(
        'No applied section yet. Export will write empty geometry.\n\nApply a boundary first for a complete file.\nContinue export anyway?'
      )
      if (!proceed) return
    } else if (hasAppliedSection && draftCount > 0) {
      const proceed = window.confirm(
        `${draftCount} draft boundary(ies) are not applied and will not be included in the JSON.\n\nOnly the applied section is exported.\nContinue?`
      )
      if (!proceed) return
    }

    const document = createProjectDocument({
      calculationProfileId,
      geometry: appliedGeometryInput,
      materials: materialStore,
      loadings: loadingsInput,
      analysis: analysisOptions,
      design: designBasis,
      meta: {
        id: projectMeta.id,
        name: projectMeta.name || appliedGeometryInput.name || 'Column project',
        createdAt: projectMeta.createdAt
      }
    })
    setProjectMeta({
      id: document.meta.id,
      name: document.meta.name,
      createdAt: document.meta.createdAt
    })

    const blob = new Blob([serializeProjectDocument(document)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = projectDocumentFileName(document)
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const applyImportedProject = (raw: string) => {
    const result = parseProjectDocument(raw)
    if (!result.ok) {
      window.alert(`Import failed:\n${result.error}`)
      return
    }

    const { document, warnings } = result
    const geometry = document.inputs.geometry
    const hasGeometry = geometry.outers.some((outer) => outer.points.length >= 3)

    setAppliedGeometryInput(geometry)
    setCalculationProfileId(document.inputs.calculationProfileId)
    setMaterialStore(document.inputs.materials)
    setLoadingsInput(document.inputs.loadings)
    setAnalysisOptions(document.inputs.analysis)
    setDesignBasis(document.inputs.design)
    setSelectedLoadcaseId(document.inputs.loadings.combinations[0]?.id ?? null)
    setInverseResults({})
    setProjectMeta({
      id: document.meta.id,
      name: document.meta.name,
      createdAt: document.meta.createdAt
    })
    setSelectedRebarId(null)
    setDrawingDraft(null)
    setSnapCursor(null)
    setTool('select')
    setLastBooleanWarning(warnings.join(' '))

    if (hasGeometry) {
      const boundary = geometryInputToBoundary(geometry)
      setBoundaries([boundary])
      setSelectedBoundaryIds([boundary.id])
      setActiveBoundaryId(boundary.id)
      setActiveOuterIndex(0)
      setActiveRingIndex(0)
      setSelectedPointId(boundary.outers[0]?.[0]?.[0]?.id ?? null)
      pendingFitAfterImportRef.current = true
    } else {
      setBoundaries([])
      setSelectedBoundaryIds([])
      setActiveBoundaryId(0)
      setActiveOuterIndex(0)
      setActiveRingIndex(0)
      setSelectedPointId(null)
    }
  }

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      applyImportedProject(text)
    } catch {
      window.alert('Import failed: could not read the selected file.')
    }
  }

  const toggleDrawTool = (nextTool: Exclude<Tool, 'select'>) => {
    setTool((current) => (current === nextTool ? 'select' : nextTool))
    setDrawingDraft(null)
    setSnapCursor(null)
  }

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    setCamera((current) => zoomSectionCamera2d(current, event.deltaY, eventPoint(event, svg), size) as Camera2d)
  }

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const point = eventPoint(event, svg)
    const world = worldPointFromPointer(event, svg)
    const target = event.target as Element
    const pointIdAttr = target.getAttribute('data-point-id')
    const boundaryIdAttr = target.getAttribute('data-boundary-id')
    const rebarIdAttr = target.getAttribute('data-rebar-id')
    const pointId = pointIdAttr != null ? Number(pointIdAttr) : null
    const boundaryId = boundaryIdAttr != null ? Number(boundaryIdAttr) : null
    const rebarId = rebarIdAttr != null ? Number(rebarIdAttr) : null
    const outerIndex = Number(target.getAttribute('data-outer-index') ?? '0')
    const ringIndex = Number(target.getAttribute('data-ring-index') ?? '0')

    svg.setPointerCapture(event.pointerId)

    if (event.button === 2) return

    if (rebarId != null && Number.isFinite(rebarId)) {
      setSelectedRebarId(rebarId)
      setGeometrySubTab('rebar')
      return
    }
    if (tool === 'draw-rectangle') {
      setSnapCursor(world)
      if (drawingDraft?.tool === 'draw-rectangle') {
        commitDrawnBoundary(
          `Rectangle ${boundaries.length + 1}`,
          'rectangle',
          createRectangleRingFromCorners(drawingDraft.start, world),
          rectangleSourceFromCorners(drawingDraft.start, world)
        )
      } else {
        setDrawingDraft({ tool: 'draw-rectangle', start: world, cursor: world })
      }
      return
    }

    if (tool === 'draw-circle') {
      setSnapCursor(world)
      if (drawingDraft?.tool === 'draw-circle') {
        commitDrawnBoundary(
          `Circle ${boundaries.length + 1}`,
          'circle',
          createCircleRingFromRadiusPoint(drawingDraft.center, world, DEFAULT_CIRCLE_SEGMENTS),
          circleSourceFromRadiusPoint(drawingDraft.center, world, DEFAULT_CIRCLE_SEGMENTS)
        )
      } else {
        setDrawingDraft({ tool: 'draw-circle', center: world, cursor: world })
      }
      return
    }

    if (tool === 'draw-polygon') {
      setSnapCursor(world)
      setDrawingDraft((current) => {
        if (current?.tool === 'draw-polygon') {
          const nextPoint = worldPointFromPointer(
            event,
            svg,
            current.points.map((item) => item.id)
          )
          return { ...current, points: [...current.points, nextPoint], cursor: nextPoint }
        }
        const firstPoint = worldPointFromPointer(event, svg)
        return { tool: 'draw-polygon', points: [firstPoint], cursor: firstPoint }
      })
      return
    }

    if (pointId != null && Number.isFinite(pointId) && boundaryId != null && Number.isFinite(boundaryId)) {
      selectBoundary(boundaryId, event.shiftKey || event.metaKey)
      setActiveOuterIndex(Number.isFinite(outerIndex) ? outerIndex : 0)
      setActiveRingIndex(Number.isFinite(ringIndex) ? ringIndex : 0)
      setSelectedPointId(pointId)
      dragRef.current = {
        kind: 'vertex',
        boundaryId,
        outerIndex: Number.isFinite(outerIndex) ? outerIndex : 0,
        ringIndex: Number.isFinite(ringIndex) ? ringIndex : 0,
        pointId,
        last: point
      }
      return
    }

    if (boundaryId != null && Number.isFinite(boundaryId)) {
      selectBoundary(boundaryId, event.shiftKey || event.metaKey)
      const boundary = boundaries.find((item) => item.id === boundaryId)
      if (!event.shiftKey && !event.metaKey && boundary && !boundary.locked) {
        dragRef.current = { kind: 'boundary', boundaryId, lastWorld: world }
      }
      return
    }

    dragRef.current = { kind: 'pan', last: point }
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    handlePointerHover(event)
    const svg = svgRef.current
    const drag = dragRef.current
    if (!svg || !drag) return
    const point = eventPoint(event, svg)

    if (drag.kind === 'pan') {
      setCamera((current) => panSectionCamera2d(current, { x: point.x - drag.last.x, y: point.y - drag.last.y }) as Camera2d)
      dragRef.current = { ...drag, last: point }
      return
    }

    if (drag.kind === 'vertex' && drag.pointId) {
      const world = snapWorldPoint(screenToWorld(camera, point, size), GRID_SPACING_MM)
      updateBoundaryPoint(drag.boundaryId, drag.outerIndex, drag.ringIndex, drag.pointId, world)
      return
    }

    if (drag.kind === 'boundary') {
      const world = worldPointFromPointer(event, svg)
      const delta = { x: world.x - drag.lastWorld.x, y: world.y - drag.lastWorld.y }
      moveBoundary(drag.boundaryId, delta)
      dragRef.current = { ...drag, lastWorld: world }
    }
  }

  const handlePointerHover = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const world = worldPointFromPointer(event, svg)
    if (tool !== 'select') setSnapCursor(world)
    if (!drawingDraft) return
    setDrawingDraft((current) => (current ? { ...current, cursor: world } : current))
  }

  const handleContextMenu = (event: React.MouseEvent<SVGSVGElement>) => {
    event.preventDefault()
    if (drawingDraft?.tool === 'draw-polygon' && drawingDraft.points.length >= 3) {
      commitDrawnBoundary(`Polygon ${boundaries.length + 1}`, 'manual', drawingDraft.points, { kind: 'manual' })
      return
    }
    setDrawingDraft(null)
    setSnapCursor(null)
  }

  const handlePointerLeave = () => {
    setSnapCursor(null)
  }

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (svg && svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId)
    dragRef.current = null
  }

  /**
   * Start the results chunk download on intent, not on click.
   *
   * Hover or keyboard focus gives the browser a head start of a few hundred milliseconds, which is
   * usually the whole perceived delay of opening a results menu for the first time.
   */
  const preloadModule = (module: WorkspaceModule) => {
    if (isResultsModule(module)) {
      preloadPlotly()
      void import('./results/ResultsWorkspace')
      return
    }
    if (module === 'analysis') void import('./analysis/AnalysisMeshWorkspace')
  }

  const switchModule = (nextModule: WorkspaceModule) => {
    if (nextModule === activeModule) return
    if (!isResultsModule(activeModule) && isResultsModule(nextModule)) {
      setIsDrawingMeasured(false)
    }
    if (nextModule === 'geometry') {
      pendingFitOnGeometryModuleRef.current = true
    }
    preloadModule(nextModule)
    // The nav highlight updates immediately; mounting the new stage is the non-urgent part.
    startModuleTransition(() => setActiveModule(nextModule))
  }

  return (
    <main className="pm-shell">
      <header className="pm-app-header">
        <div className="pm-brand">
          <span className="pm-brand-mark">PM</span>
          <div>
            <h1>P-M Column Designer</h1>
            <p>Column section design workspace</p>
          </div>
        </div>

        <nav className="pm-module-tabs" aria-label="Design modules">
          <button className={activeModule === 'geometry' ? 'is-active' : ''} onClick={() => switchModule('geometry')}>
            <RcSectionIcon size={16} />
            <span>Geometry</span>
          </button>
          <button className={activeModule === 'materials' ? 'is-active' : ''} onClick={() => switchModule('materials')}>
            <SteelStressStrainIcon size={16} />
            <span>Materials</span>
          </button>
          <button
            className={activeModule === 'section' ? 'is-active' : ''}
            onMouseEnter={() => preloadModule('section')}
            onFocus={() => preloadModule('section')}
            onClick={() => switchModule('section')}
          >
            <ChartLine size={16} />
            <span>Section Results</span>
          </button>
          <button
            className={activeModule === 'demand' ? 'is-active' : ''}
            onMouseEnter={() => preloadModule('demand')}
            onFocus={() => preloadModule('demand')}
            onClick={() => switchModule('demand')}
          >
            <Gauge size={16} />
            <span>Demand Check</span>
          </button>
          <button
            className={activeModule === 'analysis' ? 'is-active' : ''}
            onMouseEnter={() => preloadModule('analysis')}
            onFocus={() => preloadModule('analysis')}
            onClick={() => switchModule('analysis')}
          >
            <Settings size={16} />
            <span>Analysis Options</span>
          </button>
        </nav>

        <div className="pm-toolbar" aria-label="Project tools">
          <button onClick={() => importInputRef.current?.click()} title="Import project JSON">
            <FileInput size={18} />
          </button>
          <button onClick={exportProjectJson} title="Export project JSON">
            <FileOutput size={18} />
          </button>
          <span className="pm-toolbar-sep" aria-hidden="true" />
          <button onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))} title="Theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={handleImportFileChange}
          />
        </div>
      </header>

      <aside className="pm-side-panel">
        <div className="pm-side-panel-body">
        {activeModule === 'geometry' && (
          <>
            <div className="pm-page-tabs" role="tablist" aria-label="Geometry tabs">
              <button
                type="button"
                role="tab"
                aria-selected={geometrySubTab === 'concrete'}
                className={geometrySubTab === 'concrete' ? 'is-active' : ''}
                onClick={() => setGeometrySubTab('concrete')}
              >
                Concrete
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={geometrySubTab === 'rebar'}
                className={geometrySubTab === 'rebar' ? 'is-active' : ''}
                onClick={() => setGeometrySubTab('rebar')}
              >
                Rebar
              </button>
            </div>

            {geometrySubTab === 'concrete' && (
          <>
            <section className="pm-panel-section pm-boundary-list-section">
              <div className="pm-section-title pm-section-title--with-action">
                <h2>Boundary List</h2>
                <div className="pm-boundary-list-actions">
                  <button
                    type="button"
                    className="pm-table-add-btn"
                    onClick={() => applyBooleanAction('union')}
                    disabled={selectedBoundaries.length < 2}
                    title="Add regions (union)"
                  >
                    <Plus size={14} />
                    Union
                  </button>
                  <button
                    type="button"
                    className="pm-table-add-btn"
                    onClick={() => applyBooleanAction('subtract')}
                    disabled={selectedBoundaries.length < 2}
                    title="Subtract later selections from the first selected boundary"
                  >
                    <Minus size={14} />
                    Subtract
                  </button>
                </div>
              </div>
              <div className="pm-boundary-list">
                {boundaries.length === 0 && (
                  <p className="pm-boundary-empty">Create a default shape, import Excel, or draw on the canvas.</p>
                )}
                {boundaries.map((boundary) => {
                  const isSelected = selectedBoundaryIds.includes(boundary.id)
                  const isActive = boundary.id === activeBoundaryId
                  const isApplied = boundary.id === appliedBoundaryId
                  const isFinal = isApplied && boundary.locked
                  return (
                    <div
                      className={`pm-boundary-row${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}${isFinal ? ' is-applied' : ''}`}
                      key={boundary.id}
                    >
                      <button className="pm-boundary-row-main" onClick={(event) => selectBoundary(boundary.id, event.shiftKey || event.metaKey)}>
                        <span className={`pm-selection-badge${isSelected ? ' is-on' : ''}${isFinal ? ' is-applied' : ''}`} />
                        <span className="pm-boundary-row-name">
                          {boundary.name}
                        </span>
                        <span className="pm-boundary-row-meta">
                          {boundaryPointCount(boundary)} pts
                          {boundary.rebars.length > 0 ? ` · ${boundary.rebars.length} bars` : ''}
                          {boundary.outers.length > 1 ? ` · ${boundary.outers.length} outers` : ''}
                          {boundaryHoleCount(boundary) > 0 ? ` · ${boundaryHoleCount(boundary)} holes` : ''}
                        </span>
                      </button>
                      {isFinal ? (
                        <span className="pm-boundary-final-label">Final</span>
                      ) : (
                        <button
                          type="button"
                          className="pm-boundary-apply-btn"
                          onClick={() => applyBoundaryAsSection(boundary)}
                          title="Use this boundary and its rebars as the final section"
                        >
                          Apply
                        </button>
                      )}
                      <button className="pm-table-icon-btn" title="Visibility" onClick={() => updateBoundary(boundary.id, { visible: !boundary.visible })}>
                        {boundary.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button className="pm-table-icon-btn" title="Lock" onClick={() => updateBoundary(boundary.id, { locked: !boundary.locked })}>
                        {boundary.locked ? <Lock size={14} /> : <Unlock size={14} />}
                      </button>
                      <button className="pm-table-icon-btn pm-table-icon-btn--danger" title="Delete boundary" onClick={() => requestDeleteBoundary(boundary.id)}>
                        <X size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
              {lastBooleanWarning && <p className="pm-warning-text">{lastBooleanWarning}</p>}
            </section>

            <section className="pm-panel-section pm-boundary-create-section">
              <div className="pm-boundary-create">
                <span>Create Boundary</span>
                <div className="pm-boundary-create-actions">
                  <button type="button" title="Create rectangle" aria-label="Create rectangle" onClick={() => createDefaultBoundary('rectangle')}>
                    <RectangleHorizontal size={14} />
                  </button>
                  <button type="button" title="Create circle" aria-label="Create circle" onClick={() => createDefaultBoundary('circle')}>
                    <Circle size={14} />
                  </button>
                  <button type="button" title="Import XLSX" aria-label="Import XLSX" onClick={() => boundaryExcelInputRef.current?.click()}>
                    <FileInput size={14} />
                  </button>
                </div>
              </div>
              <input
                ref={boundaryExcelInputRef}
                type="file"
                accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
                hidden
                onChange={handleBoundaryExcelFileChange}
              />
            </section>

            {boundaries.length > 0 && (
            <section className="pm-panel-section pm-vertex-section">
              <div className="pm-section-title pm-section-title--with-action">
                <h2>Boundary Details</h2>
                {activeBoundary && (
                  <button
                    type="button"
                    className="pm-boundary-export-btn"
                    onClick={() => exportBoundaryExcel(activeBoundary)}
                    title="Export boundary Excel"
                  >
                    <FileOutput size={13} />
                    Export
                  </button>
                )}
              </div>

              {activeBoundary ? (
                <div className="pm-boundary-detail-toolbar">
                  <span className="pm-boundary-detail-name" title={activeBoundary.name}>
                    {activeBoundary.name}
                  </span>
                  <div className="pm-detail-tabs" role="tablist" aria-label={`${activeBoundary.name} details`}>
                    {showBasicDetailTab && (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={effectiveDetailTab === 'basic'}
                        className={effectiveDetailTab === 'basic' ? 'is-active' : ''}
                        onClick={() => setDetailTab('basic')}
                      >
                        Basic
                      </button>
                    )}
                    <button
                      type="button"
                      role="tab"
                      aria-selected={effectiveDetailTab === 'points'}
                      className={effectiveDetailTab === 'points' ? 'is-active' : ''}
                      onClick={() => setDetailTab('points')}
                    >
                      Points
                    </button>
                  </div>
                </div>
              ) : (
                <p className="pm-boundary-empty">Select a boundary to edit its details.</p>
              )}

              {activeBoundary && showBasicDetailTab && effectiveDetailTab === 'basic' && (
                <>
                <div className="pm-shape-params">
                  {activeBoundary.source.kind === 'rectangle' && (
                    <>
                      <label className="pm-field">
                        <span>Center X</span>
                        <input
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.x}
                          onChange={(event) =>
                            updateActiveRectangleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'rectangle' }>).center,
                                x: Number(event.target.value) || 0
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Center Y</span>
                        <input
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.y}
                          onChange={(event) =>
                            updateActiveRectangleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'rectangle' }>).center,
                                y: Number(event.target.value) || 0
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Width</span>
                        <input
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.width}
                          onChange={(event) => updateActiveRectangleSource({ width: Number(event.target.value) || 1 })}
                        />
                      </label>
                      <label className="pm-field">
                        <span>Height</span>
                        <input
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.height}
                          onChange={(event) => updateActiveRectangleSource({ height: Number(event.target.value) || 1 })}
                        />
                      </label>
                    </>
                  )}

                  {activeBoundary.source.kind === 'circle' && (
                    <>
                      <label className="pm-field">
                        <span>Center X</span>
                        <input
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.x}
                          onChange={(event) =>
                            updateActiveCircleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'circle' }>).center,
                                x: Number(event.target.value) || 0
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Center Y</span>
                        <input
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.y}
                          onChange={(event) =>
                            updateActiveCircleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'circle' }>).center,
                                y: Number(event.target.value) || 0
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Radius</span>
                        <input
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.radius}
                          onChange={(event) => updateActiveCircleSource({ radius: Number(event.target.value) || 1 })}
                        />
                      </label>
                      <label className="pm-field">
                        <span>Segments</span>
                        <input
                          type="number"
                          min={8}
                          max={256}
                          disabled={activeBoundary.locked}
                          value={
                            circleSegmentsDraft ??
                            String((activeBoundary.source as Extract<BoundarySource, { kind: 'circle' }>).segments)
                          }
                          onFocus={() =>
                            setCircleSegmentsDraft(
                              String((activeBoundary.source as Extract<BoundarySource, { kind: 'circle' }>).segments)
                            )
                          }
                          onChange={(event) => setCircleSegmentsDraft(event.target.value)}
                          onBlur={commitCircleSegmentsDraft}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur()
                          }}
                        />
                      </label>
                    </>
                  )}

                  {activeBoundary.source.kind === 'capsule' && (
                    <>
                      <label className="pm-field">
                        <span>Center X</span>
                        <input
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.x}
                          onChange={(event) =>
                            updateActiveCapsuleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'capsule' }>).center,
                                x: Number(event.target.value) || 0
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Center Y</span>
                        <input
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.y}
                          onChange={(event) =>
                            updateActiveCapsuleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'capsule' }>).center,
                                y: Number(event.target.value) || 0
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Width</span>
                        <input
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.width}
                          onChange={(event) => updateActiveCapsuleSource({ width: Number(event.target.value) || 1 })}
                        />
                      </label>
                      <label className="pm-field">
                        <span>Height</span>
                        <input
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.height}
                          onChange={(event) => updateActiveCapsuleSource({ height: Number(event.target.value) || 1 })}
                        />
                      </label>
                    </>
                  )}

                  {(activeBoundary.source.kind === 'manual') && (
                    <>
                      <label className="pm-field">
                        <span>Center X</span>
                        <input
                          type="number"
                          disabled={activeBoundary.locked}
                          value={Number(activeFreeformBounds.centerX.toFixed(3))}
                          onChange={(event) => updateActiveFreeformBounds({ centerX: Number(event.target.value) || 0 })}
                        />
                      </label>
                      <label className="pm-field">
                        <span>Center Y</span>
                        <input
                          type="number"
                          disabled={activeBoundary.locked}
                          value={Number(activeFreeformBounds.centerY.toFixed(3))}
                          onChange={(event) => updateActiveFreeformBounds({ centerY: Number(event.target.value) || 0 })}
                        />
                      </label>
                      <label className="pm-field">
                        <span>Width</span>
                        <input
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={Number(Math.max(1, activeFreeformBounds.width).toFixed(3))}
                          onChange={(event) => updateActiveFreeformBounds({ width: Number(event.target.value) || 1 })}
                        />
                      </label>
                      <label className="pm-field">
                        <span>Height</span>
                        <input
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={Number(Math.max(1, activeFreeformBounds.height).toFixed(3))}
                          onChange={(event) => updateActiveFreeformBounds({ height: Number(event.target.value) || 1 })}
                        />
                      </label>
                    </>
                  )}
                </div>
                </>
              )}

              {activeBoundary && effectiveDetailTab === 'points' && (
                <>
                  <label className="pm-boundary-rotation">
                    <span>
                      Rotate
                      <small>
                        X {formatNumber(activeSummary.centroid.x, 3)} · Y {formatNumber(activeSummary.centroid.y, 3)}
                      </small>
                    </span>
                    <span className="pm-boundary-rotation-input">
                      <RotateCw size={13} />
                      <input
                        type="number"
                        step="any"
                        disabled={activeBoundary.locked}
                        value={rotationDraft}
                        aria-label="Rotate boundary by degrees"
                        onFocus={beginRotationPreview}
                        onChange={(event) => previewRotation(event.target.value)}
                        onBlur={commitRotationDraft}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur()
                        }}
                      />
                      <em>°</em>
                    </span>
                  </label>
                  {(activeBoundary.outers.length > 1 || activeBoundary.outers.some((outer) => outer.length > 1)) && (
                    <div className="pm-ring-nav" aria-label="Ring navigation">
                      {activeBoundary.outers.map((outer, outerIndex) => {
                        const isActiveOuter = activeOuterIndex === outerIndex
                        const holes = outer.slice(1)
                        return (
                          <div
                            key={`outer-group-${outerIndex}`}
                            className={`pm-ring-nav__group${isActiveOuter ? ' is-active' : ''}`}
                            role="group"
                            aria-label={`Outer ${outerIndex + 1}${holes.length > 0 ? ` with ${holes.length} hole(s)` : ''}`}
                          >
                            <button
                              type="button"
                              className={`pm-ring-nav__btn${isActiveOuter && activeRingIndex === 0 ? ' is-editing' : ''}${isActiveOuter ? ' is-active' : ''}`}
                              onClick={() => {
                                setActiveOuterIndex(outerIndex)
                                setActiveRingIndex(0)
                                setSelectedPointId(outer[0]?.[0]?.id ?? null)
                              }}
                            >
                              Outer {outerIndex + 1}
                            </button>
                            {holes.map((hole, holeIndex) => {
                              const ringIndex = holeIndex + 1
                              const isEditingHole = isActiveOuter && activeRingIndex === ringIndex
                              return (
                                <button
                                  type="button"
                                  key={`hole-${outerIndex}-${ringIndex}`}
                                  className={`pm-ring-nav__btn pm-ring-nav__btn--hole${isEditingHole ? ' is-editing is-active' : ''}`}
                                  onClick={() => {
                                    setActiveOuterIndex(outerIndex)
                                    setActiveRingIndex(ringIndex)
                                    setSelectedPointId(hole[0]?.id ?? null)
                                  }}
                                >
                                  Hole {ringIndex}
                                </button>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="pm-point-table-wrap">
                    <div className="pm-point-table-caption">
                      {activeRingIndex === 0
                        ? `Outer ${activeOuterIndex + 1}`
                        : `Outer ${activeOuterIndex + 1} · Hole ${activeRingIndex}`}
                      <span>{activeRing.length} pts</span>
                    </div>
                    <table className="pm-point-table">
                      <thead>
                        <tr>
                          <th>id</th>
                          <th>X</th>
                          <th>Y</th>
                          <th>
                            <button
                              type="button"
                              className="pm-table-add-icon-btn"
                              onClick={addPointAfterSelected}
                              disabled={activeBoundary.locked}
                              title="Add point"
                            >
                              <Plus size={14} />
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeRing.map((point) => (
                            <tr className={selectedPointId === point.id ? 'is-selected' : ''} key={point.id}>
                              <td>
                                <span className="pm-point-index">{point.id}</span>
                              </td>
                              <td>
                                <input
                                  aria-label={`Point ${point.id} X`}
                                  value={point.x}
                                  type="number"
                                  readOnly={activeBoundary.locked}
                                  onFocus={() => setSelectedPointId(point.id)}
                                  onChange={(event) => updateActivePoint(point.id, { x: Number(event.target.value) })}
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`Point ${point.id} Y`}
                                  value={point.y}
                                  type="number"
                                  readOnly={activeBoundary.locked}
                                  onFocus={() => setSelectedPointId(point.id)}
                                  onChange={(event) => updateActivePoint(point.id, { y: Number(event.target.value) })}
                                />
                              </td>
                              <td>
                                <button
                                  className="pm-table-icon-btn pm-table-icon-btn--danger"
                                  disabled={activeBoundary.locked || activeRing.length <= 3}
                                  onClick={() => deleteSelectedPoint(point.id)}
                                  title="Delete point"
                                >
                                  <X size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
            )}
          </>
            )}

            {geometrySubTab === 'rebar' && (
              <RebarPanel
                hasAppliedSection={hasAppliedSection}
                appliedSection={finalSection}
                rebars={rebars}
                steelMaterials={materialStore.steel}
                defaultSteelMaterialId={materialStore.defaults.steelMaterialId}
                selectedRebarId={selectedRebarId}
                onSelectRebar={setSelectedRebarId}
                onChangeRebars={updateAppliedRebars}
                onImportExcel={importAppliedRebarsExcel}
                onExportExcel={exportAppliedRebarsExcel}
              />
            )}
          </>
        )}

        {activeModule === 'materials' && (
          <MaterialPanel
            store={materialStore}
            calculationProfileId={calculationProfileId}
            designBasis={designBasis}
            usedSteelMaterialIds={new Set(rebars.map((bar) => bar.steelMaterialId ?? materialStore.defaults.steelMaterialId))}
            onCalculationProfileChange={changeCalculationProfile}
            onDesignBasisChange={setDesignBasis}
            onChange={setMaterialStore}
          />
        )}

        {activeModule === 'analysis' && (
          <>
            <div className="pm-analysis-tabs" role="tablist" aria-label="Analysis option groups">
              {([
                ['points', 'Points'],
                ['mesh', 'Mesh'],
                ['design', 'Design Resistance']
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={analysisSubTab === id}
                  className={analysisSubTab === id ? 'is-active' : ''}
                  onClick={() => setAnalysisSubTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {analysisSubTab !== 'design' && (
              <AnalysisOptionsPanel
                options={analysisOptions}
                onChange={setAnalysisOptions}
                view={analysisSubTab}
              />
            )}
            {analysisSubTab === 'design' && (
              <DesignBasisPanel value={designBasis} onChange={setDesignBasis} />
            )}
          </>
        )}

        {activeModule === 'section' && (
          <SectionResultsPanel
            summary={sectionResultsSummary}
            view={sectionResultsView}
            onViewChange={updateSectionResultsView}
            angleSliderMax={sliceAngleMax(sectionResultsView)}
            fixedP={fixedResultP}
            fixedPRange={fixedPRange}
            onFixedPChange={setFixedResultP}
          />
        )}

        {activeModule === 'demand' && (
          <>
            <DemandCheckPanel
              view={demandCheckView}
              onViewChange={updateDemandCheckView}
              inverseResult={selectedLoadcaseId == null ? null : inverseResults[selectedLoadcaseId] ?? null}
              working={selectedLoadcaseId != null && Boolean(inverseWorkingById[selectedLoadcaseId])}
              surfaceReady={Boolean(resultSurface)}
              quickCheck={{
                working: quickCheckWorking,
                checked: Object.keys(quickChecksById).length,
                total: loadingsInput.combinations.length
              }}
              loadcases={loadingsInput.combinations}
              reportDetailIds={reportDetailIds}
              onReportDetailIdsChange={setReportDetailIds}
              onExportReport={exportPdfReport}
              reportState={reportState}
              reportMessage={reportMessage}
            />
            <LoadingsPanel
              input={loadingsInput}
              selectedLoadcaseId={selectedLoadcaseId}
              utilizationById={Object.fromEntries(
                Object.entries(quickChecksById).map(([id, result]) => [Number(id), result.utilization])
              )}
              onSelectLoadcase={(id) => {
                if (id == null) {
                  setSelectedLoadcaseId(null)
                  return
                }
                runInverseForLoadcase(id)
              }}
              onDemandChanged={(loadcase) => {
                setInverseResults((current) => {
                  if (!(loadcase.id in current)) return current
                  const next = { ...current }
                  delete next[loadcase.id]
                  return next
                })
              }}
              onChange={setLoadingsInput}
            />
          </>
        )}
        </div>

      </aside>

      <section
        className="pm-drawing-stage"
        aria-label={
          activeModule === 'section'
            ? 'Section capacity results'
            : activeModule === 'demand'
              ? 'Demand check results'
            : activeModule === 'analysis'
              ? 'Analysis section mesh'
              : 'Section drawing'
        }
      >
        {isResultsModule(activeModule) && hasAppliedSection && !resultSurface && surfaceStatus !== 'error' ? (
          <WorkspaceLoading
            title="Building the resistance surface…"
            detail="Sampling stations and directions in a background worker."
          />
        ) : isResultsModule(activeModule) ? (
          <ResultsWorkspace
            busy={surfaceStatus === 'working' || moduleSwitching}
            theme={theme}
            ready={hasAppliedSection}
            viewMode={activeModule === 'demand' ? 'loadcase' : 'overview'}
            surface={resultSurface}
            section={finalSection}
            rebars={rebars}
            materialStore={materialStore}
            designBasis={designBasis}
            loadcases={loadingsInput.combinations}
            projectName={projectMeta.name || appliedGeometryInput.name || 'Column project'}
            selectedLoadcaseId={selectedLoadcaseId}
            inverseResult={selectedLoadcaseId == null ? null : inverseResults[selectedLoadcaseId] ?? null}
            fixedP={fixedResultP}
            view={sectionResultsView}
            demandView={demandCheckView}
            onViewChange={updateSectionResultsView}
            onSelectLoadcase={runInverseForLoadcase}
          />
        ) : activeModule === 'analysis' ? (
          analysisOptions.methodId === 'strain-domain-surface-v1' ? (
            <AnalysisMeshWorkspace
              theme={theme}
              projectName={projectMeta.name || appliedGeometryInput.name || 'Column project'}
              ready={hasAppliedSection}
              section={finalSection}
              rebars={rebars}
              materialStore={materialStore}
              analysisOptions={analysisOptions}
            />
          ) : (
            <div className="pm-empty-stage">
              <strong>Exact equivalent-block geometry</strong>
              <span>No concrete integration mesh is used. The compression polygon is clipped exactly at a = β1·c.</span>
            </div>
          )
        ) : (
        <>
        <div className="pm-canvas-toolbox" aria-label="Boundary drawing tools">
          <button
            className={tool === 'draw-rectangle' ? 'is-active' : ''}
            onClick={() => toggleDrawTool('draw-rectangle')}
            title="Draw rectangle: click two opposite corners"
          >
            <RectangleHorizontal size={16} />
          </button>
          <button
            className={tool === 'draw-circle' ? 'is-active' : ''}
            onClick={() => toggleDrawTool('draw-circle')}
            title="Draw circle: click center, then radius point"
          >
            <Circle size={16} />
          </button>
          <button
            className={tool === 'draw-polygon' ? 'is-active' : ''}
            onClick={() => toggleDrawTool('draw-polygon')}
            title="Draw polygon: click points, right-click to close"
          >
            <Plus size={16} />
          </button>
        </div>
        <svg
          ref={svgRef}
          className="pm-cad-surface"
          role="img"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={handleContextMenu}
        >
          <rect className="pm-canvas-bg" x="0" y="0" width="100%" height="100%" />
          {isDrawingMeasured && (
            <>
              <g className="pm-grid">
                {gridLines.map((line) => (
                  <line
                    key={line.key}
                    className={line.major ? 'is-major' : ''}
                    x1={line.a.x}
                    y1={line.a.y}
                    x2={line.b.x}
                    y2={line.b.y}
                  />
                ))}
              </g>
              <g className="pm-axes">
                <line x1={worldToScreen(camera, { x: -100000, y: 0 }, size).x} y1={worldToScreen(camera, { x: 0, y: 0 }, size).y} x2={worldToScreen(camera, { x: 100000, y: 0 }, size).x} y2={worldToScreen(camera, { x: 0, y: 0 }, size).y} />
                <line x1={worldToScreen(camera, { x: 0, y: 0 }, size).x} y1={worldToScreen(camera, { x: 0, y: -100000 }, size).y} x2={worldToScreen(camera, { x: 0, y: 0 }, size).x} y2={worldToScreen(camera, { x: 0, y: 100000 }, size).y} />
              </g>
              <g className="pm-boundary-layer">
                {showAppliedGhost && (
                  <path className="pm-applied-section" d={appliedSectionPath} fillRule="evenodd" pointerEvents="none" />
                )}
                {boundaryScreenData.map(({ boundary, path }) => {
                  const isSelected = selectedBoundaryIds.includes(boundary.id)
                  const isActive = boundary.id === activeBoundaryId
                  const isAppliedSource = boundary.id === appliedBoundaryId
                  const showLiveAsApplied = isAppliedSource && boundary.locked
                  return (
                    <path
                      key={boundary.id}
                      data-boundary-id={boundary.id}
                      className={`pm-workspace-boundary${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}${boundary.locked ? ' is-locked' : ''}${showLiveAsApplied ? ' is-applied' : ''}`}
                      d={path}
                      fillRule="evenodd"
                    />
                  )
                })}
                {draftPath && <path className="pm-drawing-preview" d={draftPath} fillRule="evenodd" />}
              </g>
              {snapCursorView && (
                <g className="pm-snap-cursor">
                  <line x1={snapCursorView.screen.x - 10} y1={snapCursorView.screen.y} x2={snapCursorView.screen.x + 10} y2={snapCursorView.screen.y} />
                  <line x1={snapCursorView.screen.x} y1={snapCursorView.screen.y - 10} x2={snapCursorView.screen.x} y2={snapCursorView.screen.y + 10} />
                  <circle cx={snapCursorView.screen.x} cy={snapCursorView.screen.y} r="4" />
                  <text x={snapCursorView.screen.x + 12} y={snapCursorView.screen.y - 12}>
                    {formatNumber(snapCursorView.world.x, 0)}, {formatNumber(snapCursorView.world.y, 0)}
                  </text>
                </g>
              )}
              <g className="pm-centroid" pointerEvents="none">
                <line
                  x1={activeCentroidScreen.x - 8}
                  y1={activeCentroidScreen.y}
                  x2={activeCentroidScreen.x + 8}
                  y2={activeCentroidScreen.y}
                />
                <line
                  x1={activeCentroidScreen.x}
                  y1={activeCentroidScreen.y - 8}
                  x2={activeCentroidScreen.x}
                  y2={activeCentroidScreen.y + 8}
                />
              </g>
              <g className="pm-rebar-layer" pointerEvents="none">
                {hasAppliedSection &&
                  rebars.map((bar) => {
                    const screen = worldToScreen(camera, { x: bar.x, y: bar.y }, size)
                    const radiusPx = Math.max(2.5, bar.dia / (2 * camera.unitsPerPixel))
                    const selected = bar.id === selectedRebarId
                    return (
                      <g key={bar.id} className={selected ? 'is-selected' : ''}>
                        <circle
                          className="pm-rebar-dot"
                          cx={screen.x}
                          cy={screen.y}
                          r={radiusPx}
                          data-rebar-id={bar.id}
                          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                        />
                        {(selected || geometrySubTab === 'rebar') && (
                          <text className="pm-rebar-label" x={screen.x + radiusPx + 3} y={screen.y - radiusPx - 2}>
                            {bar.id}
                          </text>
                        )}
                      </g>
                    )
                  })}
              </g>
              <g className="pm-handles">
                {geometrySubTab === 'concrete' &&
                  boundaryScreenData
                  .filter(({ boundary }) => boundary.id === activeBoundaryId)
                  .flatMap(({ boundary, outers }) =>
                    outers.flatMap((outer, outerIndex) =>
                      outer.flatMap((ring, ringIndex) =>
                        ring.map((point) => {
                          const isActiveRing = outerIndex === activeOuterIndex && ringIndex === activeRingIndex
                          return (
                            <g key={point.id}>
                              <circle
                                className={selectedPointId === point.id ? 'is-selected' : ''}
                                data-boundary-id={boundary.id}
                                data-outer-index={outerIndex}
                                data-ring-index={ringIndex}
                                data-point-id={point.id}
                                cx={point.x}
                                cy={point.y}
                                r={isActiveRing || selectedPointId === point.id ? 4 : 3.5}
                              />
                              <text className="pm-point-label" x={point.x + 5} y={point.y - 5}>
                                {point.id}
                              </text>
                            </g>
                          )
                        })
                      )
                    )
                  )}
              </g>
            </>
          )}
        </svg>
        <div className="pm-boundary-hud" aria-label="Active boundary summary">
          <div className="pm-boundary-hud-row">
            <span>Area</span>
            <strong>{formatNumber(activeSummary.area, 0)} mm²</strong>
          </div>
          <div className="pm-boundary-hud-row">
            <span>Center X</span>
            <strong>{formatNumber(activeSummary.centroid.x)} mm</strong>
          </div>
          <div className="pm-boundary-hud-row">
            <span>Center Y</span>
            <strong>{formatNumber(activeSummary.centroid.y)} mm</strong>
          </div>
        </div>
        </>
        )}
      </section>

    </main>
  )
}
