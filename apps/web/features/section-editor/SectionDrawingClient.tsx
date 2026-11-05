'use client'

import { QuantityInput, QuantityValue, UnitLabel, useDisplayUnits, DisplayUnitsProvider, DisplayUnitsPanel } from './shared/DisplayUnits'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react'
import dynamic from 'next/dynamic'
import {
  BarChart3,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  File,
  Gauge,
  History,
  Lock,
  Minus,
  Moon,
  MousePointer2,
  Plus,
  RectangleHorizontal,
  RotateCw,
  SlidersHorizontal,
  SquaresIntersect,
  Sun,
  Unlock,
  X
} from 'lucide-react'
import webPackage from '../../package.json'
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
  intersectSectionGeometries,
  makePointId,
  nextAvailableId,
  sectionGeometryFromGeometryInput,
  solidRings,
  summarizeSection,
  updateGeometryInputRebars,
  rebarArea,
  withStoredRebarArea,
  type GeometryInput,
  type GeometryInputRebarView,
  type Point2,
  type SectionGeometry
} from '@pm/geometry'
import { createDefaultMaterialStore, type MaterialStore } from '@pm/materials'
import {
  createDefaultDesignBasis,
  withSteelModelModification,
  type DesignBasis
} from '@pm/design'
import {
  createEmptyLoadingsInput,
  DEFAULT_CALCULATION_PROFILE_ID,
  applyCalculationProfileToMaterials,
  calculationProfile,
  calculationProfileAcceptsDesignBasis,
  createAnalysisOptionsForProfile,
  createDesignBasisForCalculationProfile,
  createDefaultAnalysisOptions,
  createDefaultProjectInformation,
  createProjectDocument,
  isEquivalentBlockProfileId,
  parseProjectDocument,
  projectDocumentFileName,
  serializeProjectDocument,
  type LoadCombination,
  type CalculationAnalysisOptions,
  type CalculationProfileId,
  demandCheckBasisOf,
  type LoadingsInput,
  type LoadReference,
  type ParseProjectResult,
  type PmProjectDocument,
  type ProjectInformation
} from '@pm/project'
import {
  type ExactDirectionCurve,
  type InversePreviewResult,
  type LoadcaseQuickCheckResult,
  type PreviewSurface
} from '@pm/analysis'
import {
  buildPreviewSurfaceAsync,
  checkLoadcaseAsync,
  checkLoadcasesAsync,
  exportColumnReportPdfAsync,
  exportDemandCheckWorkbookAsync,
  isAnalysisAbort
} from '../../application/analysis/client'
import { ExcelExportError, demandCheckWorkbookFileName } from '@pm/report'
import { CalculationBasisToolbar } from './CalculationBasisToolbar'
import { WorkspaceFrame } from './shared/WorkspaceFrame'
import { WORKSPACE_PANE_GAP } from './shared/workspace-layout'
import { AddIcon, TransferIcon } from './shared/WorkspaceIcons'
import { projectSpreadsheetRevision } from './project/project-spreadsheet-state'
import { PROJECT_EXAMPLES, type ProjectExample } from './project-examples'
import {
  RECENT_PROJECT_STORAGE_KEY,
  recentProjectsFromStorage,
  recentProjectFromRaw,
  recentProjectFromValidatedDocument,
  serializeRecentProjects,
  upsertRecentProject,
  type RecentProject
} from './recent-project'

// The popup is browser-only; keep its DOM adapter outside the initial render bundle.
const WorkspaceComboboxes = dynamic(
  () => import('./shared/WorkspaceComboboxes').then((module) => module.WorkspaceComboboxes),
  { ssr: false }
)

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

const EquivalentBlockGeometryWorkspace = dynamic(
  () => import('./analysis/EquivalentBlockGeometryWorkspace').then((module) => module.EquivalentBlockGeometryWorkspace),
  {
    ssr: false,
    loading: () => <WorkspaceLoading title="Loading the equivalent block view…" charts={1} />
  }
)

const SectionResultsPanel = dynamic(
  () => import('./results/SectionResultsPanel').then((module) => module.SectionResultsPanel),
  { ssr: false }
)

const LoadingsPanel = dynamic(
  () => import('./loadings/LoadingsPanel').then((module) => module.LoadingsPanel),
  { ssr: false }
)

const LoadcaseCalculationDialog = dynamic(
  () => import('./results/LoadcaseCalculationDialog').then((module) => module.LoadcaseCalculationDialog),
  { ssr: false }
)
const AnalysisOptionsPanel = dynamic(
  () => import('./analysis/AnalysisOptionsPanel').then(module => module.AnalysisOptionsPanel),
  { ssr: false, loading: () => <p role="status">Loading analysis options…</p> }
)
const DesignBasisPanel = dynamic(
  () => import('./design/DesignBasisPanel').then(module => module.DesignBasisPanel),
  { ssr: false, loading: () => <p role="status">Loading resistance options…</p> }
)
const MaterialPanel = dynamic(
  () => import('./materials/MaterialPanel').then(module => module.MaterialPanel),
  { ssr: false, loading: () => <p role="status">Loading materials…</p> }
)
import { createRebarGeneratorState } from './geometry/rebar-generator-state'
const RebarPanel = dynamic(() => import('./geometry/RebarPanel').then(module => module.RebarPanel),
  { ssr: false, loading: () => <p role="status">Loading reinforcement…</p> })
const CoordinateSpreadsheetDialog = dynamic(() => import('./geometry/GeometrySpreadsheetDialog').then(module => module.CoordinateSpreadsheetDialog), { ssr: false })
const RebarSpreadsheetDialog = dynamic(() => import('./geometry/GeometrySpreadsheetDialog').then(module => module.RebarSpreadsheetDialog), { ssr: false })
const ProjectSpreadsheetWindow = dynamic(() => import('./project/ProjectSpreadsheetWindow').then(module => module.ProjectSpreadsheetWindow), { ssr: false })
import { boundarySelectionStatus, shouldHandleBoundaryDelete } from './geometry/boundary-selection'
import { prepareBoundaryDraftForApply } from './geometry/boundary-draft'
import { DemandCheckPanel } from './results/DemandCheckPanel'
import { ReportPanel } from './results/ReportPanel'
import { preloadPlotly } from './results/PlotlyChart'
import { WorkspaceLoading } from './shared/WorkspaceLoading'
import { ProjectInformationDialog } from './project/ProjectInformationDialog'
import type { SectionResultsSummary } from './results/SectionResultsPanel'
import {
  createDemandCheckView,
  createSectionResultsView,
  type DemandCheckView,
  type SectionResultsView
} from './results/results-view'
import {
  currentLoadcaseEvidence,
  currentLoadcaseEvidenceMap,
  sameLoadcaseDemand,
  sameLoadcaseAnalysisInputs
} from './results/loadcase-calculation-trace'
import { downloadSectionWorkbook } from './geometry/section-xlsx'
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

/** Constitutive σ–ε curve — the Materials module edits concrete/steel stress–strain models. */
const MaterialsIcon = ({ size = 16 }: { size?: number }) => (
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
    {/* Plot axes (ε horizontal, σ vertical) */}
    <path d="M5 4v15h15" />
    {/* Bilinear constitutive curve: elastic rise then yield plateau */}
    <path d="M5 19 L11 9h9" />
  </svg>
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
const THEME_STORAGE_KEY = 'pm-column-designer:theme:v1'
/**
 * Capacity and Demand Check are separate menus because they answer different questions and
 * need different sidebars: one owns the capacity surface and its presentation, the other owns the
 * load combinations checked against it.
 */
type WorkspaceModule = 'geometry' | 'materials' | 'analysis' | 'section' | 'demand' | 'report'

/** The Report sidebar keeps the current demand charts in view while selecting export details. */
const showsDemandCharts = (module: WorkspaceModule) => module === 'demand' || module === 'report'
const isResultsModule = (module: WorkspaceModule) => module === 'section' || showsDemandCharts(module)
const APP_VERSION = webPackage.version
type GeometrySubTab = 'concrete' | 'rebar'
type AnalysisSubTab = 'points' | 'mesh' | 'resistance' | 'units'
type BuilderShape = 'rectangle' | 'circle' | 'capsule'
type BooleanAction = 'union' | 'subtract' | 'intersect'
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

const normalizeAngleDeg = (degrees: number) => ((degrees % 360) + 360) % 360

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

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

/** Keep every 1px grid stroke on the same pixel boundary so minor lines rasterize uniformly. */
const alignOnePixelStroke = (coordinate: number) => Math.round(coordinate) + 0.5

/** Even-width geometry strokes stay crisp when their centerline lands on a whole pixel. */
const alignTwoPixelStroke = (coordinate: number) => Math.round(coordinate)

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
    const screenX = alignOnePixelStroke(worldToScreen(camera, { x, y: 0 }, size).x)
    lines.push({
      key: `x-${x}`,
      major: Math.abs(x % (spacing * MAJOR_GRID_INTERVAL)) < 1e-9,
      a: { x: screenX, y: 0 },
      b: { x: screenX, y: size.height }
    })
  }

  for (let y = startY; y <= endY; y += spacing) {
    const screenY = alignOnePixelStroke(worldToScreen(camera, { x: 0, y }, size).y)
    lines.push({
      key: `y-${y}`,
      major: Math.abs(y % (spacing * MAJOR_GRID_INTERVAL)) < 1e-9,
      a: { x: 0, y: screenY },
      b: { x: size.width, y: screenY }
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

const isEditableKeyboardTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))

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

export function SectionDrawingClient(props: { geometryOnly?: boolean }) {
  return <DisplayUnitsProvider><SectionDrawingWorkspace {...props} /></DisplayUnitsProvider>
}

function SectionDrawingWorkspace({ geometryOnly = false }: { geometryOnly?: boolean }) {
  const { selection: displayUnits } = useDisplayUnits()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const projectImportAbortRef = useRef<AbortController | null>(null)
  const drawingImportInputRef = useRef<HTMLInputElement | null>(null)
  const projectMenuRef = useRef<HTMLDivElement | null>(null)
  const projectMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const aboutMenuRef = useRef<HTMLDivElement | null>(null)
  const rotationSessionRef = useRef<BoundaryObject | null>(null)
  const pendingFitAfterImportRef = useRef(false)
  const pendingFitOnGeometryModuleRef = useRef(false)
  const recentAutosaveStartedRef = useRef(false)
  const projectBootstrapStartedRef = useRef(false)
  const analysisRevisionRef = useRef(0)
  const inverseAbortRef = useRef(new Map<number, AbortController>())
  const dragRef = useRef<
    | { kind: 'pan'; last: ScreenPoint }
    | { kind: 'vertex'; boundaryId: number; outerIndex: number; ringIndex: number; pointId: number; last: ScreenPoint }
    | { kind: 'boundary'; boundaryId: number; lastWorld: Point2 }
    | null
  >(null)
  const [theme, setTheme] = useState<Theme>('light')
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [projectFileFormat, setProjectFileFormat] = useState<'excel' | 'json'>('excel')
  const [projectFileBusy, setProjectFileBusy] = useState(false)
  const [drawingFileBusy, setDrawingFileBusy] = useState(false)
  const [aboutMenuOpen, setAboutMenuOpen] = useState(false)
  const [projectInformationOpen, setProjectInformationOpen] = useState(false)
  const [projectSpreadsheet, setProjectSpreadsheet] = useState<{ document: PmProjectDocument; units: typeof displayUnits; activation: number } | null>(null)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [recentStorageReady, setRecentStorageReady] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  const [activeModule, setActiveModule] = useState<WorkspaceModule>('geometry')
  const demandChartsVisible = showsDemandCharts(activeModule)
  const [moduleSwitching, startModuleTransition] = useTransition()
  const [geometrySubTab, setGeometrySubTab] = useState<GeometrySubTab>('concrete')
  const [selectedRebarId, setSelectedRebarId] = useState<number | null>(null)
  const [rebarGenerator, setRebarGenerator] = useState(createRebarGeneratorState)
  const [geometrySpreadsheet, setGeometrySpreadsheet] = useState<
    { kind: 'coordinates'; boundaryId: number; outerIndex: number; ringIndex: number } |
    { kind: 'rebars'; materials: MaterialStore } | null>(null)
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
  const [loadReferencePreview, setLoadReferencePreview] = useState<LoadReference | null>(null)
  const [loadReferenceEditorVersion, setLoadReferenceEditorVersion] = useState(0)
  const checkBasis = demandCheckBasisOf(loadingsInput)
  // The basis is part of this revision: changing it retires every check, inverse and field result.
  const loadcaseDemandRevision = `${checkBasis}|${loadingsInput.combinations
    .map((item) => `${item.id}:${item.P}:${item.Mx}:${item.My}:${item.actionBasis}`)
    .join('|')}`
  const [analysisOptions, setAnalysisOptions] = useState<CalculationAnalysisOptions>(() => createDefaultAnalysisOptions())
  const [designBasis, setDesignBasis] = useState<DesignBasis>(() =>
    createDefaultDesignBasis(createDefaultMaterialStore())
  )
  const [selectedLoadcaseId, setSelectedLoadcaseId] = useState<number | null>(null)
  const [calculationLoadcaseId, setCalculationLoadcaseId] = useState<number | null>(null)
  const [calculationExporting, setCalculationExporting] = useState(false)
  const [calculationExportError, setCalculationExportError] = useState<string | null>(null)
  const [reportDetailIds, setReportDetailIds] = useState<number[]>([])
  const [reportState, setReportState] = useState<'idle' | 'working' | 'error'>('idle')
  const [reportMessage, setReportMessage] = useState('')
  const [excelState, setExcelState] = useState<'idle' | 'working' | 'error'>('idle')
  const [excelMessage, setExcelMessage] = useState('')
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
  const fixedPInitializedSurfaceRef = useRef<PreviewSurface | null>(null)
  const [resultSurface, setResultSurface] = useState<PreviewSurface | null>(null)
  const [exactDirectionCurve, setExactDirectionCurve] = useState<ExactDirectionCurve | null>(null)
  const [surfaceStatus, setSurfaceStatus] = useState<'idle' | 'working' | 'error'>('idle')
  const [surfaceMessage, setSurfaceMessage] = useState('')
  const [inverseResults, setInverseResults] = useState<Record<number, InversePreviewResult>>({})
  const [loadcaseUpdating, setLoadcaseUpdating] = useState(false)
  const [lastResolvedChartSnapshot, setLastResolvedChartSnapshot] = useState<{
    loadcase: LoadCombination
    result: InversePreviewResult
    surface: PreviewSurface
    section: SectionGeometry
    rebars: GeometryInputRebarView[]
    materialStore: MaterialStore
    designBasis: DesignBasis
  } | null>(null)
  const [quickChecksById, setQuickChecksById] = useState<Record<number, LoadcaseQuickCheckResult>>({})
  const quickChecksRef = useRef<Record<number, LoadcaseQuickCheckResult>>({})
  const quickCheckSurfaceRef = useRef<PreviewSurface | null>(null)
  const [projectMeta, setProjectMeta] = useState(() => ({
    id: 1,
    name: 'Column project',
    information: createDefaultProjectInformation(),
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

  const buildCurrentProjectDocument = useCallback(
    () =>
      createProjectDocument({
        calculationProfileId,
        geometry: appliedGeometryInput,
        materials: materialStore,
        loadings: loadingsInput,
        analysis: analysisOptions,
        design: designBasis,
        meta: {
          id: projectMeta.id,
          name: projectMeta.name || appliedGeometryInput.name || 'Column project',
          information: projectMeta.information,
          createdAt: projectMeta.createdAt
        }
      }),
    [
      analysisOptions,
      appliedGeometryInput,
      calculationProfileId,
      designBasis,
      loadingsInput,
      materialStore,
      projectMeta.createdAt,
      projectMeta.id,
      projectMeta.information,
      projectMeta.name
    ]
  )

  const projectSpreadsheetTarget = useMemo(() => projectSpreadsheetRevision({
    inputs: { calculationProfileId, geometry: appliedGeometryInput, materials: materialStore,
      loadings: loadingsInput, analysis: analysisOptions, design: designBasis }, meta: projectMeta
  }), [calculationProfileId, appliedGeometryInput, materialStore, loadingsInput, analysisOptions, designBasis, projectMeta])

  const publishRecentEntry = useCallback((recent: RecentProject | null) => {
    if (!recent) return
    setRecentProjects((current) => {
      const next = upsertRecentProject(current, recent)
      try {
        window.localStorage.setItem(RECENT_PROJECT_STORAGE_KEY, serializeRecentProjects(next))
      } catch {
        // Storage can be unavailable in a restricted browser; keep Recent usable for this session.
      }
      return next
    })
  }, [])

  const publishRecentProject = useCallback((raw: unknown) =>
    publishRecentEntry(recentProjectFromRaw(raw)), [publishRecentEntry])

  const finalSection = useMemo(
    () => sectionGeometryFromGeometryInput(appliedGeometryInput),
    [appliedGeometryInput]
  )
  const rebars = useMemo(() => geometryInputRebars(appliedGeometryInput).map(bar => withStoredRebarArea(bar,
    isEquivalentBlockProfileId(calculationProfileId) ? 'equivalent-block' : 'stress-strain')), [appliedGeometryInput, calculationProfileId])
  const selectedLoadcase = selectedLoadcaseId == null
    ? null
    : loadingsInput.combinations.find((item) => item.id === selectedLoadcaseId) ?? null
  const selectedInverseResult = selectedLoadcaseId == null ? null : inverseResults[selectedLoadcaseId] ?? null
  const selectedResolvedChartSnapshot = useMemo(
    () => {
      if (
        !selectedLoadcase ||
        !selectedInverseResult ||
        !resultSurface ||
        !sameLoadcaseDemand(selectedInverseResult.demand, selectedLoadcase)
      ) return null

      // A material/geometry update renders once before its invalidation effect withdraws the old
      // inverse result. Keep the complete old analysis snapshot for that render instead of pairing
      // the old result with the new inputs.
      if (lastResolvedChartSnapshot?.result === selectedInverseResult) {
        return lastResolvedChartSnapshot.loadcase === selectedLoadcase
          ? lastResolvedChartSnapshot
          : { ...lastResolvedChartSnapshot, loadcase: selectedLoadcase }
      }

      return {
        loadcase: selectedLoadcase,
        result: selectedInverseResult,
        surface: resultSurface,
        section: finalSection,
        rebars,
        materialStore,
        designBasis
      }
    },
    [
      designBasis,
      finalSection,
      lastResolvedChartSnapshot,
      materialStore,
      rebars,
      resultSurface,
      selectedInverseResult,
      selectedLoadcase
    ]
  )
  // A loadcase transition must never borrow the previous row's completed solver frame. The last
  // snapshot is retained only to keep one analysis revision internally consistent while its own
  // geometry/material inputs are being invalidated.
  const chartSnapshot = selectedResolvedChartSnapshot
  const chartLoadcaseId = selectedLoadcaseId
  const calculationLoadcase = calculationLoadcaseId === null
    ? null
    : loadingsInput.combinations.find((item) => item.id === calculationLoadcaseId) ?? null
  const calculationCheckCandidate = calculationLoadcaseId === null
    ? null
    : quickChecksById[calculationLoadcaseId] ?? null
  const calculationCheck = calculationCheckCandidate?.utilizationDefinition === checkBasis
    ? currentLoadcaseEvidence(calculationLoadcase, calculationCheckCandidate) : null
  const calculationInverseCandidate = calculationLoadcaseId === null
    ? null
    : inverseResults[calculationLoadcaseId] ?? null
  const calculationInverse = calculationInverseCandidate?.designCheck.evaluated &&
    calculationInverseCandidate.designCheck.definition === checkBasis
    ? currentLoadcaseEvidence(calculationLoadcase, calculationInverseCandidate) : null
  const currentQuickChecksById = useMemo(
    () => currentLoadcaseEvidenceMap(loadingsInput.combinations, Object.fromEntries(
      Object.entries(quickChecksById).filter(([, result]) => result.utilizationDefinition === checkBasis))),
    [loadingsInput.combinations, quickChecksById, checkBasis]
  )

  useEffect(() => {
    if (activeModule === 'demand' && (calculationLoadcaseId === null || calculationLoadcase)) return
    setCalculationLoadcaseId(null)
    setCalculationExportError(null)
  }, [activeModule, calculationLoadcase, calculationLoadcaseId])

  useEffect(() => {
    if (selectedResolvedChartSnapshot) {
      if (
        lastResolvedChartSnapshot?.loadcase !== selectedResolvedChartSnapshot.loadcase ||
        lastResolvedChartSnapshot.result !== selectedResolvedChartSnapshot.result
      ) {
        setLastResolvedChartSnapshot(selectedResolvedChartSnapshot)
      }
    } else if (
      lastResolvedChartSnapshot &&
      !loadingsInput.combinations.some((item) => item.id === lastResolvedChartSnapshot.loadcase.id)
    ) {
      setLastResolvedChartSnapshot(null)
    }
  }, [lastResolvedChartSnapshot, loadingsInput.combinations, selectedResolvedChartSnapshot])

  const changeCalculationProfile = (profileId: CalculationProfileId) => {
    setCalculationProfileId(profileId)
    setMaterialStore((current) => applyCalculationProfileToMaterials(current, profileId))
    setAnalysisOptions(createAnalysisOptionsForProfile(profileId))
    setDesignBasis((current) => withSteelModelModification(
      calculationProfileAcceptsDesignBasis(profileId, current)
        ? current
        : createDesignBasisForCalculationProfile(profileId),
      applyCalculationProfileToMaterials(materialStore, profileId)
    ))
    setAnalysisSubTab('points')
  }

  useEffect(() => {
    document.body.dataset.jscadTheme = theme
  }, [theme])

  useLayoutEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (storedTheme !== 'light' && storedTheme !== 'dark') return
      document.body.dataset.jscadTheme = storedTheme
      setTheme(storedTheme)
    } catch {
      // Storage may be unavailable in a restricted/private browser context.
    }
  }, [])

  useEffect(() => {
    if (!projectMenuOpen) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!projectMenuRef.current?.contains(event.target as Node)) setProjectMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProjectMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [projectMenuOpen])

  useEffect(() => {
    if (!aboutMenuOpen) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!aboutMenuRef.current?.contains(event.target as Node)) setAboutMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAboutMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [aboutMenuOpen])

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
    setSurfaceMessage('')

    if (!hasAppliedSection) {
      setResultSurface(null)
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
    () => rebars.reduce((sum, bar) => sum + rebarArea(bar,
      isEquivalentBlockProfileId(calculationProfileId) ? 'equivalent-block' : 'stress-strain'), 0),
    [rebars, calculationProfileId]
  )
  const betaCount = useMemo(() => {
    if (!resultSurface) return 0
    return new Set(resultSurface.points.map((point) => point.beta)).size
  }, [resultSurface])
  const stationCount = useMemo(() => {
    if (!resultSurface) return 0
    return resultSurface.stationError.maxStations ?? resultSurface.stationError.stations
  }, [resultSurface])

  /** Everything the Capacity sidebar reports, assembled once per surface. */
  const sectionResultsSummary = useMemo<SectionResultsSummary>(() => {
    return {
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
      samplingMode: resultSurface?.analysisOptions.samplingMode ?? 'fixed',
      refinement: resultSurface && (
        Number.isFinite(resultSurface.directionError.maxRelativeComponent) ||
        Number.isFinite(resultSurface.stationError.maxRelative)
      )
        ? {
            tolerance: Math.min(
              resultSurface.directionError.tolerance,
              resultSurface.stationError.tolerance
            ),
            maxRelative: Math.max(
              Number.isFinite(resultSurface.directionError.maxRelativeComponent)
                ? resultSurface.directionError.maxRelativeComponent
                : 0,
              Number.isFinite(resultSurface.stationError.maxRelative)
                ? resultSurface.stationError.maxRelative
                : 0
            ),
            withinTolerance:
              resultSurface.directionError.withinTolerance &&
              resultSurface.stationError.withinTolerance
          }
        : null,
      warnings: resultSurface?.warnings ?? [],
      mechanics: resultSurface?.mechanics ?? null
    }
  }, [
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
      [solid.outer, ...solid.holes].map((ring) =>
        ring.map((point) => {
          const screen = worldToScreen(camera, point, size)
          return { x: alignTwoPixelStroke(screen.x), y: alignTwoPixelStroke(screen.y) }
        })
      )
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
              ring.map((point) => {
                const screen = worldToScreen(camera, point, size)
                return {
                  id: point.id,
                  wx: point.x,
                  wy: point.y,
                  x: alignTwoPixelStroke(screen.x),
                  y: alignTwoPixelStroke(screen.y)
                }
              })
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
    quickChecksRef.current = {}
    quickCheckSurfaceRef.current = null
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
    analysisRevisionRef.current += 1
    for (const controller of inverseAbortRef.current.values()) controller.abort()
    inverseAbortRef.current.clear()
    const currentLoadcases = new Map(loadingsInput.combinations.map((loadcase) => [loadcase.id, loadcase]))
    setInverseResults((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id, result]) => {
          const loadcase = currentLoadcases.get(Number(id))
          return Boolean(loadcase && sameLoadcaseDemand(result.demand, loadcase) &&
            result.designCheck.evaluated && result.designCheck.definition === checkBasis)
        })
      )
    )
  }, [loadcaseDemandRevision])

  useEffect(() => {
    if (!resultSurface || loadingsInput.combinations.length === 0) {
      quickChecksRef.current = {}
      quickCheckSurfaceRef.current = resultSurface
      setQuickChecksById({})
      return
    }

    const surfaceChanged = quickCheckSurfaceRef.current !== resultSurface
    quickCheckSurfaceRef.current = resultSurface
    const cached = surfaceChanged ? {} : quickChecksRef.current
    const retained = Object.fromEntries(
      loadingsInput.combinations.flatMap((loadcase) => {
        const result = cached[loadcase.id]
        return result && sameLoadcaseDemand(result.demand, loadcase) && result.utilizationDefinition === checkBasis
          ? [[loadcase.id, result]]
          : []
      })
    ) as Record<number, LoadcaseQuickCheckResult>
    quickChecksRef.current = retained
    setQuickChecksById(retained)

    const pending = loadingsInput.combinations.filter((loadcase) => !retained[loadcase.id])
    if (pending.length === 0) return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      checkLoadcasesAsync({ surface: resultSurface, loadcases: pending, checkBasis,
        ...(checkBasis === 'direct2D' ? { preparedInputs: { calculationProfileId, section: finalSection, rebars,
          materialStore, designBasis } } : {}) }, controller.signal)
        .then((results) => {
          const next = { ...quickChecksRef.current }
          for (const result of results) next[result.loadcaseId] = result
          quickChecksRef.current = next
          setQuickChecksById(next)
        })
        .catch((error) => {
          if (isAnalysisAbort(error)) return
          setSurfaceMessage(error instanceof Error ? error.message : String(error))
        })
    }, ANALYSIS_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadcaseDemandRevision, resultSurface])

  useEffect(() => {
    if (!resultSurface) {
      fixedPInitializedSurfaceRef.current = null
      return
    }
    if (fixedPInitializedSurfaceRef.current === resultSurface) return
    fixedPInitializedSurfaceRef.current = resultSurface
    const mid = (resultSurface.bounds.P[0] + resultSurface.bounds.P[1]) / 2
    setFixedResultP(mid)
  }, [resultSurface])

  const calculateInverseForLoadcase = (loadcase: LoadCombination, force = false) => {
    setSelectedLoadcaseId(loadcase.id)
    if (!hasAppliedSection || !resultSurface) return
    if (!force && inverseResults[loadcase.id]) return
    if (inverseAbortRef.current.has(loadcase.id)) return
    const revision = analysisRevisionRef.current
    inverseAbortRef.current.get(loadcase.id)?.abort()
    const controller = new AbortController()
    inverseAbortRef.current.set(loadcase.id, controller)
    checkLoadcaseAsync(
      { calculationProfileId, section: finalSection, rebars, materialStore, loadcase, surface: resultSurface, checkBasis, designBasis },
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
      })
  }

  const openLoadcaseCalculation = (loadcase: LoadCombination) => {
    setCalculationLoadcaseId(loadcase.id)
    setCalculationExportError(null)
    calculateInverseForLoadcase(loadcase)
  }

  const changeCalculationLoadcase = (id: number) => {
    const loadcase = loadingsInput.combinations.find((item) => item.id === id)
    if (!loadcase) return
    openLoadcaseCalculation(loadcase)
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
        loadReference: loadingsInput.reference,
        presentationUnits: displayUnits,
        projectName: projectMeta.name || appliedGeometryInput.name || 'Column project',
        projectInformation: projectMeta.information,
        sectionName: appliedGeometryInput.name || 'Section',
        calculationProfileId,
        section: finalSection,
        rebars,
        materialStore,
        designBasis,
        analysisOptions,
        surface: resultSurface,
        loadcases: loadingsInput.combinations,
        checkBasis,
        detailLoadcaseIds: reportDetailIds
      })
      downloadBlob(blob, fileName)
      setReportState('idle')
      setReportMessage(`Saved ${fileName}`)
    } catch (error) {
      setReportState('error')
      setReportMessage(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Build the demand-check workbook from the surface already on screen.
   *
   * Like the PDF, it re-solves the selected combinations rather than reading the UI's cache, and it
   * covers the same selection, so the two documents are two views of one check.
   */
  const exportExcelReport = async () => {
    if (!resultSurface || !hasAppliedSection) {
      setExcelState('error')
      setExcelMessage('Build the section resistance surface before exporting Excel.')
      return
    }
    const profileId = resultSurface.calculationProfileId ?? calculationProfileId

    setExcelState('working')
    setExcelMessage('')
    try {
      const payload = {
        loadReference: loadingsInput.reference,
        presentationUnits: displayUnits,
        projectName: projectMeta.name || appliedGeometryInput.name || 'Column project',
        projectInformation: projectMeta.information,
        sectionName: finalSection.name,
        calculationProfileId: profileId,
        section: finalSection,
        rebars,
        materialStore,
        designBasis,
        analysisOptions: resultSurface.analysisOptions,
        surface: resultSurface,
        loadcases: loadingsInput.combinations,
        checkBasis,
        detailLoadcaseIds: reportDetailIds
      }
      const blob = await exportDemandCheckWorkbookAsync(payload)
      const fileName = demandCheckWorkbookFileName(payload)

      downloadBlob(blob, fileName)
      setExcelState('idle')
      setExcelMessage(`Saved ${fileName}`)
    } catch (error) {
      setExcelState('error')
      setExcelMessage(
        error instanceof ExcelExportError
          ? error.message
          : `Export failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /** Reuse the Demand Check workbook owner, working through only the dialog's active combination. */
  const exportCalculationLoadcaseExcel = async () => {
    if (!resultSurface || !hasAppliedSection || !calculationLoadcase) {
      setCalculationExportError('Build the current Design surface and select a loadcase before exporting Excel.')
      return
    }
    const profileId = resultSurface.calculationProfileId ?? calculationProfileId
    setCalculationExporting(true)
    setCalculationExportError(null)
    try {
      const payload = {
        loadReference: loadingsInput.reference,
        presentationUnits: displayUnits,
        projectName: projectMeta.name || appliedGeometryInput.name || 'Column project',
        projectInformation: projectMeta.information,
        sectionName: finalSection.name,
        calculationProfileId: profileId,
        section: finalSection,
        rebars,
        materialStore,
        designBasis,
        analysisOptions: resultSurface.analysisOptions,
        surface: resultSurface,
        loadcases: [calculationLoadcase],
        checkBasis,
        detailLoadcaseIds: [calculationLoadcase.id]
      }
      const blob = await exportDemandCheckWorkbookAsync(payload)
      downloadBlob(blob, demandCheckWorkbookFileName(payload))
    } catch (error) {
      setCalculationExportError(
        error instanceof ExcelExportError
          ? error.message
          : `Export failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      setCalculationExporting(false)
    }
  }

  /** Selecting a combination opens its detail in the Demand Check workspace. */
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
    if (!resultSurface || !demandChartsVisible || selectedLoadcaseId == null) return
    const loadcase = loadingsInput.combinations.find((item) => item.id === selectedLoadcaseId)
    // A menu return is not a new analysis revision. Preserve the completed detail only when
    // its demand, check basis and every immutable applied input still belong to this request.
    if (selectedResolvedChartSnapshot &&
      selectedResolvedChartSnapshot.result.designCheck.evaluated &&
      selectedResolvedChartSnapshot.result.designCheck.definition === checkBasis &&
      sameLoadcaseAnalysisInputs(selectedResolvedChartSnapshot, {
        surface: resultSurface, section: finalSection, rebars, materialStore, designBasis
      })) return
    if (loadcase) calculateInverseForLoadcase(loadcase, true)
  }, [demandChartsVisible, loadcaseDemandRevision, resultSurface, selectedLoadcaseId])

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
    () =>
      draftRing.map((point) => {
        const screen = worldToScreen(camera, point, size)
        return { x: alignTwoPixelStroke(screen.x), y: alignTwoPixelStroke(screen.y) }
      }),
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
    const nextInput = updateGeometryInputRebars(appliedGeometryInput, nextRebars)
    setAppliedGeometryInput(nextInput)
    setBoundaries((current) =>
      current.map((boundary) =>
        boundary.id === appliedBoundaryId ? { ...boundary, rebars: nextRebars.map((bar) => ({ ...bar })) } : boundary
      )
    )
    return nextInput
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
        units: displayUnits,
        name: boundary.name,
        outers: boundary.outers,
        rebars: boundary.rebars,
        steelMaterials: materialStore.steel
      })
    } catch (error) {
      window.alert(`Excel export failed:\n${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const exportBoundaryDrawing = async (boundary: BoundaryObject) => {
    setDrawingFileBusy(true)
    try {
      const { buildSectionDxf, sectionDrawingFileName } = await import('./geometry/section-dxf')
      const result = buildSectionDxf(boundary)
      if (!result.ok) throw new Error(result.issue.message)
      downloadBlob(new Blob([result.value], { type: 'application/dxf' }), sectionDrawingFileName(boundary.name))
    } catch (error) {
      window.alert(`Drawing export failed:\n${error instanceof Error ? error.message : String(error)}`)
    } finally { setDrawingFileBusy(false) }
  }

  const importBoundaryDrawing = async (file: File) => {
    setDrawingFileBusy(true)
    try {
      const { importSectionDxf } = await import('./geometry/section-dxf')
      const { readSectionDrawingFile } = await import('./geometry/section-drawing-file')
      const decoded = await readSectionDrawingFile(file)
      if (!decoded.ok) throw new Error(decoded.issue.message)
      const text = decoded.value
      let result = importSectionDxf(text)
      if (!result.ok && result.issue.code === 'UNITS_REQUIRED') {
        if (!window.confirm('This drawing has no declared units. Import with 1 drawing unit = 1 mm?\nCancel if the drawing uses other units.')) return
        result = importSectionDxf(text, { unitlessMillimetres: true })
      }
      if (!result.ok) throw new Error(result.issue.message)
      const { prepareDrawingImport } = await import('./geometry/section-drawing-import')
      const prepared = prepareDrawingImport(result.value, materialStore, calculationProfileId)
      if (!prepared.ok) throw new Error(prepared.issue.message)
      const nextMaterials = prepared.value.materials
      if (nextMaterials.concrete !== materialStore.concrete || nextMaterials.steel !== materialStore.steel ||
        nextMaterials.defaults.steelMaterialId !== materialStore.defaults.steelMaterialId) setMaterialStore(nextMaterials)
      addBoundary({
        id: makeBoundaryId(boundaries.map(item => item.id)),
        name: file.name.replace(/\.(?:dxf|dwg)$/i, '').trim() || 'Imported drawing',
        ...prepared.value.drawing,
        sourceKind: 'manual', source: { kind: 'manual' }, visible: true, locked: false
      })
      setDrawingDraft(null)
      setSnapCursor(null)
      setTool('select')
      setLastBooleanWarning([...decoded.warnings, ...result.warnings, ...prepared.warnings].join(' '))
      pendingFitAfterImportRef.current = true
    } catch (error) {
      window.alert(`Drawing import failed:\n${error instanceof Error ? error.message : String(error)}`)
    } finally { setDrawingFileBusy(false) }
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

  const deleteBoundaries = (ids: readonly number[]) => {
    const deletedIds = new Set(ids)
    if (deletedIds.size === 0) return

    const remainingBoundaries = boundaries.filter((boundary) => !deletedIds.has(boundary.id))
    setBoundaries(remainingBoundaries)
    setSelectedBoundaryIds((current) => current.filter((selectedId) => !deletedIds.has(selectedId)))
    if (deletedIds.has(appliedBoundaryId)) {
      setAppliedGeometryInput(createEmptyGeometryInput({ id: 1, name: 'Column section' }))
      setSelectedRebarId(null)
    }
    if (deletedIds.has(activeBoundaryId)) {
      const nextBoundary = remainingBoundaries[0]
      setActiveBoundaryId(nextBoundary?.id ?? 0)
      setActiveOuterIndex(0)
      setActiveRingIndex(0)
      setSelectedPointId(nextBoundary?.outers[0]?.[0]?.[0]?.id ?? null)
    }
    if (rotationSessionRef.current && deletedIds.has(rotationSessionRef.current.id)) {
      rotationSessionRef.current = null
      setRotationDraft('0')
    }
  }

  const requestDeleteBoundaries = (ids: readonly number[]) => {
    const requestedIds = new Set(ids)
    const requestedBoundaries = boundaries.filter((boundary) => requestedIds.has(boundary.id))
    if (requestedBoundaries.length === 0) return

    const appliedBoundary = requestedBoundaries.find((boundary) => boundary.id === appliedBoundaryId)
    if (appliedBoundary) {
      const confirmed = window.confirm(
        requestedBoundaries.length === 1
          ? `“${appliedBoundary.name}” is the applied section. Remove it and clear the applied section?`
          : `Remove ${requestedBoundaries.length} selected regions, including applied section “${appliedBoundary.name}”, and clear the applied section?`
      )
      if (!confirmed) return
    }

    deleteBoundaries(requestedBoundaries.map((boundary) => boundary.id))
  }

  const requestDeleteBoundary = (id: number) => requestDeleteBoundaries([id])

  useEffect(() => {
    const handleBoundaryDeleteShortcut = (event: KeyboardEvent) => {
      const inBoundaryContext =
        activeModule === 'geometry' &&
        geometrySubTab === 'concrete' &&
        !projectMenuOpen &&
        !aboutMenuOpen &&
        !projectInformationOpen
      if (!shouldHandleBoundaryDelete({
        key: event.key,
        defaultPrevented: event.defaultPrevented,
        repeat: event.repeat,
        selectedCount: selectedBoundaryIds.length,
        inBoundaryContext,
        editableTarget: isEditableKeyboardTarget(event.target)
      })) return

      event.preventDefault()
      requestDeleteBoundaries(selectedBoundaryIds)
    }

    document.addEventListener('keydown', handleBoundaryDeleteShortcut)
    return () => document.removeEventListener('keydown', handleBoundaryDeleteShortcut)
  }, [
    aboutMenuOpen,
    activeBoundaryId,
    activeModule,
    appliedBoundaryId,
    boundaries,
    geometrySubTab,
    projectInformationOpen,
    projectMenuOpen,
    selectedBoundaryIds
  ])

  const applyBooleanAction = (action: BooleanAction) => {
    if (selectedBoundaries.length < 2) return

    const subtractBaseArea =
      action === 'subtract' ? summarizeSection(boundaryToSectionGeometry(selectedBoundaries[0])).area : null

    const resultOptions = {
      id: makeBoundaryId(boundaries.map((item) => item.id)),
      name: action === 'union' ? 'Union result' : action === 'subtract' ? 'Subtract result' : 'Intersection result'
    }
    const result = action === 'intersect'
      ? intersectSectionGeometries(selectedBoundaries.map(boundaryToSectionGeometry), resultOptions)
      : (() => {
          const usedPrimitiveIds: number[] = []
          const primitives = action === 'union'
            ? selectedBoundaries.flatMap((boundary) => boundaryToPrimitives(boundary, 'add', usedPrimitiveIds))
            : (() => {
                const [outer, ...inners] = selectedBoundaries
                return [
                  ...boundaryToPrimitives(outer, 'add', usedPrimitiveIds),
                  ...inners.flatMap((boundary) => boundaryToPrimitives(boundary, 'subtract', usedPrimitiveIds))
                ]
              })()
          return composeSectionPrimitives(primitives, resultOptions)
        })()
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
    if (!activeBoundary || activeBoundary.locked) return
    const selectedIndex = Math.max(0, activeRing.findIndex((point) => point.id === selectedPointId))
    const currentPoint = activeRing[selectedIndex] ?? { x: 0, y: 0 }
    const nextPoint = activeRing.length ? activeRing[(selectedIndex + 1) % activeRing.length] ?? currentPoint : currentPoint
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

  const removeAllRingPoints = () => {
    if (!activeBoundary || activeBoundary.locked || activeRing.length === 0) return
    setBoundaries((current) => current.map((boundary) =>
      boundary.id !== activeBoundary.id ? boundary : withEditedOuters(
        boundary,
        mapOuterRing(boundary.outers, activeOuterIndex, activeRingIndex, () => [])
      )
    ))
    setSelectedPointId(null)
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
    const prepared = prepareBoundaryDraftForApply(boundaryToApply)
    if (!prepared.ok) {
      setLastBooleanWarning(`Cannot apply boundary: ${prepared.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`)
      return
    }
    const summary = summarizeSection(boundaryToSectionGeometry(boundaryToApply))
    if (summary.area <= 0 || boundaryToApply.outers.every((outer) => (outer[0]?.length ?? 0) < 3)) return
    const appliedId = boundaryToApply.id
    const previousAppliedId = hasAppliedSection ? finalSection.id : 0

    setAppliedGeometryInput(prepared.input)
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

  useEffect(() => {
    if (!pendingFitAfterImportRef.current) return
    pendingFitAfterImportRef.current = false
    setCamera(fitCameraToPointsWithInsets(allVisiblePoints, size, DEFAULT_FIT_INSETS))
  }, [allVisiblePoints, size])

  const exportProjectFile = async () => {
    const draftCount = boundaries.filter((boundary) => boundary.id !== appliedBoundaryId).length
    if (!hasAppliedSection && boundaries.length > 0) {
      const proceed = window.confirm(
        'No applied section yet. Export will write empty geometry.\n\nApply a boundary first for a complete file.\nContinue export anyway?'
      )
      if (!proceed) return
    } else if (hasAppliedSection && draftCount > 0) {
      const proceed = window.confirm(
        `${draftCount} draft boundary(ies) are not applied and will not be included in the file.\n\nOnly the applied section is exported.\nContinue?`
      )
      if (!proceed) return
    }

    const document = buildCurrentProjectDocument()
    setProjectMeta({
      id: document.meta.id,
      name: document.meta.name,
      information: document.meta.information,
      createdAt: document.meta.createdAt
    })

    setProjectFileBusy(true)
    try {
      if (projectFileFormat === 'excel') {
        const { buildProjectWorkbook, projectWorkbookFileName } = await import('./project/project-xlsx')
        const bytes = await buildProjectWorkbook(document, displayUnits)
        const copy = new Uint8Array(bytes)
        downloadBlob(new Blob([copy.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), projectWorkbookFileName(document))
      } else {
        downloadBlob(new Blob([serializeProjectDocument(document)], { type: 'application/json' }), projectDocumentFileName(document))
      }
    } catch (error) {
      window.alert(`Export failed:\n${error instanceof Error ? error.message : 'Could not create the project file.'}`)
    } finally {
      setProjectFileBusy(false)
    }
  }

  const applyValidatedProject = (result: ParseProjectResult, workbookWarnings: string[] = []) => {
    if (!result.ok) {
      window.alert(`Import failed:\n${result.error}`)
      return
    }

    const { document } = result
    const warnings = [...new Set([...workbookWarnings, ...result.warnings])]
    publishRecentEntry(recentProjectFromValidatedDocument(document))
    const geometry = document.inputs.geometry
    const hasGeometry = geometry.outers.some((outer) => outer.points.length >= 3)

    setAppliedGeometryInput(geometry)
    setRebarGenerator(createRebarGeneratorState())
    setCalculationProfileId(document.inputs.calculationProfileId)
    setMaterialStore(document.inputs.materials)
    setLoadingsInput(document.inputs.loadings)
    setLoadReferencePreview(null)
    setLoadReferenceEditorVersion(current => current + 1)
    setAnalysisOptions(document.inputs.analysis)
    setDesignBasis(document.inputs.design)
    setSelectedLoadcaseId(document.inputs.loadings.combinations[0]?.id ?? null)
    setReportDetailIds([])
    setInverseResults({})
    setProjectMeta({
      id: document.meta.id,
      name: document.meta.name,
      information: document.meta.information,
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

  const applyImportedProject = (raw: unknown, workbookWarnings: string[] = []) =>
    applyValidatedProject(parseProjectDocument(raw), workbookWarnings)

  useEffect(() => () => {
    projectImportAbortRef.current?.abort()
    projectImportAbortRef.current = null
  }, [])

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    projectImportAbortRef.current?.abort()
    const controller = new AbortController()
    projectImportAbortRef.current = controller
    setProjectFileBusy(true)
    try {
      if (projectFileFormat === 'excel') {
        const { importProjectWorkbook, PROJECT_WORKBOOK_MAX_BYTES } = await import('./project/project-xlsx')
        if (file.size > PROJECT_WORKBOOK_MAX_BYTES) throw new Error('Project workbook exceeds 10 MiB.')
        const result = await importProjectWorkbook(await file.arrayBuffer())
        if (controller.signal.aborted) return
        if (!result.ok) throw new Error(result.error)
        applyImportedProject(result.document, result.warnings)
      } else {
        const { readProjectJsonText } = await import('./project/project-json')
        const { importProjectJsonAsync } = await import('../../application/project/import')
        const result = await importProjectJsonAsync(await readProjectJsonText(file), controller.signal)
        if (!controller.signal.aborted) applyValidatedProject(result)
      }
    } catch (error) {
      if (controller.signal.aborted) return
      window.alert(`Import failed:\n${error instanceof Error ? error.message : 'Could not read the selected file.'}`)
    } finally {
      if (projectImportAbortRef.current === controller) {
        projectImportAbortRef.current = null
        setProjectFileBusy(false)
      }
    }
  }

  const loadProjectExample = (example: ProjectExample) => {
    setProjectMenuOpen(false)
    applyImportedProject(example.document)
  }

  const loadRecentProject = (recent: RecentProject) => {
    setProjectMenuOpen(false)
    applyImportedProject(recent.raw)
  }

  const saveProjectInformation = (name: string, information: ProjectInformation) => {
    setProjectMeta((current) => ({ ...current, name, information }))
    setProjectInformationOpen(false)
  }

  useEffect(() => {
    if (projectBootstrapStartedRef.current) return
    projectBootstrapStartedRef.current = true

    let stored: RecentProject[] = []
    try {
      stored = recentProjectsFromStorage(window.localStorage.getItem(RECENT_PROJECT_STORAGE_KEY))
    } catch {
      // Fall through to the current default project when storage access is restricted.
    }
    if (stored.length > 0) setRecentProjects(stored)
    else publishRecentProject(buildCurrentProjectDocument())
    setRecentStorageReady(true)
  }, [buildCurrentProjectDocument, publishRecentProject])

  useEffect(() => {
    if (!recentStorageReady) return
    if (!recentAutosaveStartedRef.current) {
      recentAutosaveStartedRef.current = true
      return
    }
    const timer = window.setTimeout(() => publishRecentProject(buildCurrentProjectDocument()), 450)
    return () => window.clearTimeout(timer)
  }, [buildCurrentProjectDocument, publishRecentProject, recentStorageReady])

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
   * usually the whole perceived delay of opening a results menu for the first time. This is a
   * best-effort hint: next/dynamic owns retries and visible loading errors on actual navigation.
   */
  const preloadModule = (module: WorkspaceModule) => {
    if (isResultsModule(module)) {
      preloadPlotly()
      void import('./results/ResultsWorkspace').catch(() => {})
      return
    }
    if (module === 'analysis') {
      void Promise.all([
        import('./analysis/AnalysisMeshWorkspace'),
        import('./analysis/EquivalentBlockGeometryWorkspace')
      ]).catch(() => {})
    }
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

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'light' ? 'dark' : 'light'
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // Theme still changes for the current session when storage is unavailable.
      }
      return next
    })
  }

  return (
    <main className="pm-shell" id={geometryOnly ? 'geometry-workspace' : undefined}
      style={{ '--ws-pane-gap': `${WORKSPACE_PANE_GAP}px` } as CSSProperties}>
      <header className="pm-app-header">
        <div className="pm-brand pm-about-menu" ref={aboutMenuRef}>
          <button
            className="pm-brand-mark"
            type="button"
            title="About P-M Column Designer"
            aria-label="About P-M Column Designer"
            aria-haspopup="dialog"
            aria-expanded={aboutMenuOpen}
            onClick={() => {
              setProjectMenuOpen(false)
              setAboutMenuOpen((open) => !open)
            }}
          >
            <span aria-hidden="true">PM</span>
          </button>
          {aboutMenuOpen && (
            <div className="pm-about-popover" role="dialog" aria-label="About P-M Column Designer">
              <div className="pm-about-header">
                <span className="pm-about-mark" aria-hidden="true">PM</span>
                <div className="pm-about-title">
                  <div>
                    <h2>P-M Column Designer</h2>
                    <span>v{APP_VERSION}</span>
                  </div>
                  <p>Reinforced-concrete P–M–M section resistance analysis</p>
                  <p>Stage 1 · Section resistance only</p>
                </div>
              </div>
              <div className="pm-about-attribution">
                <strong>© 2026 Envico Co., Ltd.</strong>
                <span>Developed by Le Xuan Hung</span>
                <span>Open-source software licensed under the MIT License.</span>
              </div>
              <p className="pm-about-disclaimer">
                Engineering results require independent professional review.
              </p>
            </div>
          )}
        </div>

        <nav className="pm-module-tabs" aria-label="Design modules">
          <button
            className={activeModule === 'geometry' ? 'is-active' : ''}
            aria-label="Section"
            aria-pressed={activeModule === 'geometry'}
            onClick={() => switchModule('geometry')}
          >
            <RcSectionIcon size={16} />
            <span>Section</span>
          </button>
          {!geometryOnly && <>
          <button
            className={activeModule === 'materials' ? 'is-active' : ''}
            aria-label="Materials"
            aria-pressed={activeModule === 'materials'}
            onClick={() => switchModule('materials')}
          >
            <MaterialsIcon size={16} />
            <span>Materials</span>
          </button>
          <button
            className={activeModule === 'section' ? 'is-active' : ''}
            aria-label="Capacity"
            aria-pressed={activeModule === 'section'}
            onMouseEnter={() => preloadModule('section')}
            onFocus={() => preloadModule('section')}
            onClick={() => switchModule('section')}
          >
            <BarChart3 size={16} />
            <span>Capacity</span>
          </button>
          <button
            className={activeModule === 'demand' ? 'is-active' : ''}
            aria-label="Demand Check"
            aria-pressed={activeModule === 'demand'}
            onMouseEnter={() => preloadModule('demand')}
            onFocus={() => preloadModule('demand')}
            onClick={() => switchModule('demand')}
          >
            <Gauge size={16} />
            <span>Demand Check</span>
          </button>
          <button
            className={activeModule === 'report' ? 'is-active' : ''}
            aria-label="Report"
            aria-pressed={activeModule === 'report'}
            onMouseEnter={() => preloadModule('report')}
            onFocus={() => preloadModule('report')}
            onClick={() => switchModule('report')}
          >
            <File size={16} />
            <span>Report</span>
          </button>
          <button
            className={activeModule === 'analysis' ? 'is-active' : ''}
            aria-label="Options"
            aria-pressed={activeModule === 'analysis'}
            onMouseEnter={() => preloadModule('analysis')}
            onFocus={() => preloadModule('analysis')}
            onClick={() => switchModule('analysis')}
          >
            <SlidersHorizontal size={16} />
            <span>Options</span>
          </button>
          </>}
        </nav>

        {geometryOnly && (
          <span className="geometry-preview-label">Section editor <span>Preview</span></span>
        )}

        <CalculationBasisToolbar
          calculationProfileId={calculationProfileId}
          designBasis={designBasis}
          onCalculationProfileChange={changeCalculationProfile}
          onDesignBasisChange={setDesignBasis}
        />

        <div className="pm-toolbar" aria-label="Project and application tools">
          <div className="pm-project-menu" ref={projectMenuRef}>
            <button
              ref={projectMenuTriggerRef}
              className={`pm-project-menu__trigger${projectMenuOpen ? ' is-active' : ''}`}
              type="button"
              title="Project information and files"
              aria-label="Project menu"
              aria-haspopup="dialog"
              aria-expanded={projectMenuOpen}
              onClick={() => {
                setAboutMenuOpen(false)
                setProjectMenuOpen((open) => !open)
              }}
            >
              <File size={16} />
              <span>Project</span>
            </button>
            {projectMenuOpen && (
              <div className="pm-project-menu__popover" role="dialog" aria-label="Project information and files">
                <section className="pm-project-menu__section pm-project-menu__section--information">
                  <button
                    className="ws-row-action pm-project-menu__item pm-project-menu__information-row"
                    type="button"
                    onClick={() => {
                      setProjectMenuOpen(false)
                      setProjectInformationOpen(true)
                    }}
                  >
                    <strong>Project information</strong>
                  </button>
                </section>

                <section className="pm-project-menu__section">
                  <div className="pm-project-menu__section-head"><span>Import / Export / Open</span></div>
                  <div className="pm-project-menu__file-controls">
                    <select
                      className="pm-project-menu__format"
                      aria-label="Project file format"
                      value={projectFileFormat}
                      disabled={projectFileBusy}
                      onChange={(event) => setProjectFileFormat(event.target.value === 'json' ? 'json' : 'excel')}
                    >
                      <option value="excel">Excel (.xlsx)</option>
                      <option value="json">JSON (.json)</option>
                    </select>
                    <div className="pm-project-menu__actions">
                      <button
                        className="ws-action pm-project-menu__file-action"
                        type="button"
                        title={`Import project from ${projectFileFormat === 'excel' ? 'Excel' : 'JSON'}`}
                        aria-label={`Import project from ${projectFileFormat === 'excel' ? 'Excel' : 'JSON'}`}
                        disabled={projectFileBusy}
                        onClick={() => {
                          setProjectMenuOpen(false)
                          importInputRef.current?.click()
                        }}
                      >
                        <TransferIcon direction="import" />
                        <span>Import</span>
                      </button>
                      <button
                        className="ws-action pm-project-menu__file-action"
                        type="button"
                        title={`Export project to ${projectFileFormat === 'excel' ? 'Excel' : 'JSON'}`}
                        aria-label={`Export project to ${projectFileFormat === 'excel' ? 'Excel' : 'JSON'}`}
                        disabled={projectFileBusy}
                        onClick={() => {
                          setProjectMenuOpen(false)
                          void exportProjectFile()
                        }}
                      >
                        <TransferIcon direction="export" />
                        <span>Export</span>
                      </button>
                      <button
                        className="ws-action pm-project-menu__file-action"
                        type="button"
                        title="Open the current project spreadsheet"
                        disabled={projectFileBusy || drawingFileBusy}
                        onClick={() => {
                          projectMenuTriggerRef.current?.focus({ preventScroll: true })
                          setProjectMenuOpen(false)
                          if (projectSpreadsheet) {
                            setProjectSpreadsheet({ ...projectSpreadsheet, activation: projectSpreadsheet.activation + 1 })
                            return
                          }
                          const document = buildCurrentProjectDocument()
                          setProjectSpreadsheet({
                            document: { ...document, meta: { ...document.meta, name: projectMeta.name } },
                            units: displayUnits,
                            activation: 0,
                          })
                        }}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                </section>

                <section className="pm-project-menu__section">
                  <div className="pm-project-menu__section-head"><span>Recent files</span></div>
                  <div className="pm-project-menu__recent-list">
                    {recentProjects.map((recent) => (
                      <button
                        className="ws-row-action pm-project-menu__item pm-project-menu__recent"
                        type="button"
                        key={`${recent.id}:${recent.createdAt}`}
                        onClick={() => loadRecentProject(recent)}
                      >
                        <History size={15} />
                        <span>
                          <strong>{recent.name}</strong>
                          <small>
                            {isEquivalentBlockProfileId(recent.calculationProfileId)
                              ? 'Equivalent stress block'
                              : 'Stress–strain'}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="pm-project-menu__section">
                  <details className="pm-project-menu__example-group">
                    <summary className="pm-project-menu__item pm-project-menu__example-toggle">
                      <strong>Example files</strong>
                      <ChevronRight className="pm-project-menu__row-chevron" size={15} aria-hidden="true" />
                    </summary>
                    <div className="pm-project-menu__examples">
                      {PROJECT_EXAMPLES.map((example) => (
                        <button
                          className="ws-row-action pm-project-menu__item pm-project-menu__example"
                          type="button"
                          key={example.id}
                          onClick={() => loadProjectExample(example)}
                        >
                          <span>
                            <strong>{example.label}</strong>
                            <small>{example.description}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </details>
                </section>
              </div>
            )}
          </div>
          <span className="pm-toolbar-sep" aria-hidden="true" />
          <button onClick={toggleTheme} title="Theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept={projectFileFormat === 'excel' ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json,.json'}
            hidden
            onChange={handleImportFileChange}
          />
        </div>

      </header>

      {projectInformationOpen ? (
        <ProjectInformationDialog
          projectName={projectMeta.name}
          information={projectMeta.information}
          onClose={() => setProjectInformationOpen(false)}
          onSave={saveProjectInformation}
        />
      ) : null}

      {projectSpreadsheet && <ProjectSpreadsheetWindow activation={projectSpreadsheet.activation}
        document={projectSpreadsheet.document} units={projectSpreadsheet.units} revision={projectSpreadsheetTarget}
        onClose={() => setProjectSpreadsheet(null)} onUpdate={result => {
          applyValidatedProject(result)
          return projectSpreadsheetRevision(result.document)
        }} />}

      <WorkspaceComboboxes />
      <WorkspaceFrame>
      <aside className="pm-side-panel" id="pm-workspace-sidebar" aria-label={`${activeModule === 'geometry' ? 'Section' : activeModule === 'materials' ? 'Materials'
        : activeModule === 'section' ? 'Capacity' : activeModule === 'demand' ? 'Demand Check'
        : activeModule === 'report' ? 'Report' : 'Options'} workspace editor`}>
        <div className="pm-side-panel-body">
        {activeModule === 'geometry' && (
          <>
            <div className="ws-page-tabs pm-page-tabs" role="tablist" aria-label="Geometry tabs">
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
              <div className="pm-section-title pm-section-title--with-action pm-section-title--boolean-actions">
                <h2>Boundary list</h2>
                <div className="pm-boundary-list-actions">
                  <button
                    type="button"
                    className="ws-action ws-action--primary pm-table-add-btn"
                    onClick={() => applyBooleanAction('union')}
                    disabled={selectedBoundaries.length < 2}
                    title="Add regions (union)"
                  >
                    <span className="ws-action-content"><Plus size={14} /><span>Union</span></span>
                  </button>
                  <button
                    type="button"
                    className="ws-action ws-action--primary pm-table-add-btn"
                    onClick={() => applyBooleanAction('subtract')}
                    disabled={selectedBoundaries.length < 2}
                    title="Subtract later selections from the first selected boundary"
                  >
                    <span className="ws-action-content"><Minus size={14} /><span>Subtract</span></span>
                  </button>
                  <button
                    type="button"
                    className="ws-action ws-action--primary pm-table-add-btn"
                    onClick={() => applyBooleanAction('intersect')}
                    disabled={selectedBoundaries.length < 2}
                    title="Keep only the region shared by all selected boundaries"
                  >
                    <span className="ws-action-content"><SquaresIntersect size={14} /><span>Intersection</span></span>
                  </button>
                </div>
              </div>
              <div className="pm-boundary-list">
                {boundaries.length === 0 && (
                  <p className="pm-boundary-empty">Create a shape, import DXF, or draw on the canvas.</p>
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
                      <button className="ws-row-action pm-boundary-row-main" onClick={(event) => selectBoundary(boundary.id, event.shiftKey || event.metaKey)}>
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
                        <span className="pm-boundary-final-label ws-compact-status">Final</span>
                      ) : (
                        <button
                          type="button"
                          className="ws-action ws-action--primary ws-action--compact pm-boundary-apply-btn"
                          onClick={() => applyBoundaryAsSection(boundary)}
                          title="Use this boundary and its rebars as the final section"
                        >
                          Apply
                        </button>
                      )}
                      <button className="ws-action ws-action--quiet ws-action--compact ws-action--icon pm-table-icon-btn" title="Visibility" onClick={() => updateBoundary(boundary.id, { visible: !boundary.visible })}>
                        {boundary.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button className="ws-action ws-action--quiet ws-action--compact ws-action--icon pm-table-icon-btn" title="Lock" onClick={() => updateBoundary(boundary.id, { locked: !boundary.locked })}>
                        {boundary.locked ? <Lock size={14} /> : <Unlock size={14} />}
                      </button>
                      <button className="ws-action ws-action--quiet ws-action--danger-quiet ws-action--compact ws-action--icon pm-table-icon-btn pm-table-icon-btn--danger" title="Delete boundary" onClick={() => requestDeleteBoundary(boundary.id)}>
                        <X size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
              <div className="pm-boundary-selection-row">
                <p
                  className={`pm-boundary-selection-status${selectedBoundaryIds.length > 0 ? ' is-active' : ''}`}
                  role="status"
                  aria-live="polite"
                >
                  {boundarySelectionStatus(selectedBoundaryIds.length)}
                </p>
                <div className="pm-boundary-create-actions">
                  <span className="pm-boundary-create-label">Create boundary</span>
                  <button type="button" title="Create rectangle" aria-label="Create rectangle" onClick={() => createDefaultBoundary('rectangle')} className="ws-action ws-action--compact ws-action--icon">
                    <RectangleHorizontal size={14} />
                  </button>
                  <button type="button" title="Create circle" aria-label="Create circle" onClick={() => createDefaultBoundary('circle')} className="ws-action ws-action--compact ws-action--icon">
                    <Circle size={14} />
                  </button>
                  <button type="button" className="ws-action ws-action--compact pm-file-btn pm-boundary-drawing-import"
                    disabled={drawingFileBusy} aria-label="Import drawing from DXF"
                    title="Import ASCII DXF · mm · layer pm · closed polylines = boundaries, circles = rebars"
                    onClick={() => drawingImportInputRef.current?.click()}>
                    <TransferIcon direction="import" />DXF
                  </button>
                  <input ref={drawingImportInputRef} type="file" accept=".dxf" hidden
                    onChange={event => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) void importBoundaryDrawing(file)
                    }} />
                </div>
              </div>
              {lastBooleanWarning && <p className="pm-warning-text">{lastBooleanWarning}</p>}
            </section>

            {boundaries.length > 0 && (
            <section className={`pm-panel-section pm-vertex-section${activeBoundary && effectiveDetailTab === 'points' ? ' ws-table-editor' : ''}`}>
              <div className="ws-table-editor-heading">
              <div className="pm-section-title pm-section-title--with-action pm-boundary-detail-header">
                <div className="pm-boundary-detail-heading">
                  <h2>Detail</h2>
                  {activeBoundary && (
                    <span className="pm-boundary-detail-name" title={activeBoundary.name}>
                      {activeBoundary.name}
                    </span>
                  )}
                </div>
                {activeBoundary && (
                  <div className="pm-boundary-detail-actions">
                    <div className="pm-detail-tabs ws-joined-buttons" role="tablist" aria-label={`${activeBoundary.name} details`}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={effectiveDetailTab === 'basic'}
                        className={"ws-action " + (effectiveDetailTab === 'basic' ? 'is-active' : '')}
                        disabled={!showBasicDetailTab}
                        onClick={() => setDetailTab('basic')}
                      >
                        Basic
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={effectiveDetailTab === 'points'}
                        className={"ws-action " + (effectiveDetailTab === 'points' ? 'is-active' : '')}
                        onClick={() => setDetailTab('points')}
                      >
                        Point
                      </button>
                    </div>
                    <button
                      type="button"
                      className="ws-action pm-file-btn"
                      onClick={() => exportBoundaryExcel(activeBoundary)}
                      title="Export boundary to Excel"
                    >
                      <TransferIcon direction="export" />
                      Excel
                    </button>
                    <button type="button" className="ws-action pm-file-btn"
                      disabled={drawingFileBusy} aria-label="Export boundary and rebars to DXF"
                      title="Export boundary and rebars to DXF · mm · layer pm"
                      onClick={() => exportBoundaryDrawing(activeBoundary)}>
                      <TransferIcon direction="export" />DXF
                    </button>
                  </div>
                )}
              </div>

              {!activeBoundary && (
                <p className="pm-boundary-empty">Select a boundary to edit its details.</p>
              )}

              {activeBoundary && showBasicDetailTab && effectiveDetailTab === 'basic' && (
                <>
                <div className="pm-shape-params">
                  {activeBoundary.source.kind === 'rectangle' && (
                    <>
                      <label className="pm-field">
                        <span>Center X</span>
                        <QuantityInput quantity="length"
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.x}
                          onValueChange={(canonical) =>
                            updateActiveRectangleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'rectangle' }>).center,
                                x: canonical
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Center Y</span>
                        <QuantityInput quantity="length"
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.y}
                          onValueChange={(canonical) =>
                            updateActiveRectangleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'rectangle' }>).center,
                                y: canonical
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Width</span>
                        <QuantityInput quantity="length"
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.width}
                          onValueChange={(canonical) => updateActiveRectangleSource({ width: canonical })}
                        />
                      </label>
                      <label className="pm-field">
                        <span>Height</span>
                        <QuantityInput quantity="length"
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.height}
                          onValueChange={(canonical) => updateActiveRectangleSource({ height: canonical })}
                        />
                      </label>
                    </>
                  )}

                  {activeBoundary.source.kind === 'circle' && (
                    <>
                      <label className="pm-field">
                        <span>Center X</span>
                        <QuantityInput quantity="length"
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.x}
                          onValueChange={(canonical) =>
                            updateActiveCircleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'circle' }>).center,
                                x: canonical
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Center Y</span>
                        <QuantityInput quantity="length"
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.y}
                          onValueChange={(canonical) =>
                            updateActiveCircleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'circle' }>).center,
                                y: canonical
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Radius</span>
                        <QuantityInput quantity="length"
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.radius}
                          onValueChange={(canonical) => updateActiveCircleSource({ radius: canonical })}
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
                        <QuantityInput quantity="length"
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.x}
                          onValueChange={(canonical) =>
                            updateActiveCapsuleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'capsule' }>).center,
                                x: canonical
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Center Y</span>
                        <QuantityInput quantity="length"
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.center.y}
                          onValueChange={(canonical) =>
                            updateActiveCapsuleSource({
                              center: {
                                ...(activeBoundary.source as Extract<BoundarySource, { kind: 'capsule' }>).center,
                                y: canonical
                              }
                            })
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>Width</span>
                        <QuantityInput quantity="length"
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.width}
                          onValueChange={(canonical) => updateActiveCapsuleSource({ width: canonical })}
                        />
                      </label>
                      <label className="pm-field">
                        <span>Height</span>
                        <QuantityInput quantity="length"
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={activeBoundary.source.height}
                          onValueChange={(canonical) => updateActiveCapsuleSource({ height: canonical })}
                        />
                      </label>
                    </>
                  )}

                  {(activeBoundary.source.kind === 'manual') && (
                    <>
                      <label className="pm-field">
                        <span>Center X</span>
                        <QuantityInput quantity="length"
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeFreeformBounds.centerX}
                          onValueChange={(canonical) => updateActiveFreeformBounds({ centerX: canonical })}
                        />
                      </label>
                      <label className="pm-field">
                        <span>Center Y</span>
                        <QuantityInput quantity="length"
                          type="number"
                          disabled={activeBoundary.locked}
                          value={activeFreeformBounds.centerY}
                          onValueChange={(canonical) => updateActiveFreeformBounds({ centerY: canonical })}
                        />
                      </label>
                      <label className="pm-field">
                        <span>Width</span>
                        <QuantityInput quantity="length"
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={Math.max(1, activeFreeformBounds.width)}
                          onValueChange={(canonical) => updateActiveFreeformBounds({ width: canonical })}
                        />
                      </label>
                      <label className="pm-field">
                        <span>Height</span>
                        <QuantityInput quantity="length"
                          type="number"
                          min={1}
                          disabled={activeBoundary.locked}
                          value={Math.max(1, activeFreeformBounds.height)}
                          onValueChange={(canonical) => updateActiveFreeformBounds({ height: canonical })}
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
                        X <QuantityValue quantity="length" value={activeSummary.centroid.x} /> · Y <QuantityValue quantity="length" value={activeSummary.centroid.y} />
                      </small>
                    </span>
                    <span className="pm-boundary-rotation-input ws-field-group">
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
                            className={`pm-ring-nav__group ws-joined-buttons${isActiveOuter ? ' is-active' : ''}`}
                            role="group"
                            aria-label={`Outer ${outerIndex + 1}${holes.length > 0 ? ` with ${holes.length} hole(s)` : ''}`}
                          >
                            <button
                              type="button"
                              className={`ws-action pm-ring-nav__btn${isActiveOuter && activeRingIndex === 0 ? ' is-editing is-active' : ''}`}
                              aria-pressed={isActiveOuter && activeRingIndex === 0}
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
                                  className={`ws-action pm-ring-nav__btn pm-ring-nav__btn--hole${isEditingHole ? ' is-editing is-active' : ''}`}
                                  aria-pressed={isEditingHole}
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
                  <div className="pm-point-table-caption">
                      {activeRingIndex === 0
                        ? `Outer ${activeOuterIndex + 1}`
                        : `Outer ${activeOuterIndex + 1} · Hole ${activeRingIndex}`}
                      <span>{activeRing.length} pts</span>
                      <button type="button" className="ws-action" onClick={() => setGeometrySpreadsheet({
                        kind: 'coordinates', boundaryId: activeBoundary.id, outerIndex: activeOuterIndex, ringIndex: activeRingIndex
                      })}>Open XLSX</button>
                    </div>
                </>
              )}
              </div>
              {activeBoundary && effectiveDetailTab === 'points' && (
                <>
                  <div className="pm-point-table-wrap ws-table-scroll">
                    <table className="pm-point-table">
                      <thead>
                        <tr>
                          <th>id</th>
                          <th>X (<UnitLabel quantity="length" />)</th>
                          <th>Y (<UnitLabel quantity="length" />)</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {activeRing.length === 0 && (
                          <tr><td colSpan={4}>No points yet. Use Add to rebuild this ring.</td></tr>
                        )}
                        {activeRing.map((point) => (
                            <tr className={selectedPointId === point.id ? 'is-selected' : ''} key={point.id}>
                              <td>
                                <span className="pm-point-index">{point.id}</span>
                              </td>
                              <td>
                                <QuantityInput showUnit={false} quantity="length"
                                  aria-label={`Point ${point.id} X`}
                                  value={point.x}
                                  type="number"
                                  readOnly={activeBoundary.locked}
                                  onFocus={() => setSelectedPointId(point.id)}
                                  onValueChange={(canonical) => updateActivePoint(point.id, { x: canonical })}
                                />
                              </td>
                              <td>
                                <QuantityInput showUnit={false} quantity="length"
                                  aria-label={`Point ${point.id} Y`}
                                  value={point.y}
                                  type="number"
                                  readOnly={activeBoundary.locked}
                                  onFocus={() => setSelectedPointId(point.id)}
                                  onValueChange={(canonical) => updateActivePoint(point.id, { y: canonical })}
                                />
                              </td>
                              <td>
                                <button
                                  className="ws-action ws-action--quiet ws-action--danger-quiet ws-action--compact ws-action--icon pm-table-icon-btn pm-table-icon-btn--danger"
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
                  <div className="ws-table-actions">
                    <button type="button" className="ws-action ws-action--danger"
                      disabled={activeBoundary.locked || activeRing.length === 0}
                      onClick={removeAllRingPoints} title="Remove all points from the selected ring">
                      Remove all
                    </button>
                    <button type="button" className="ws-action ws-action--primary"
                      disabled={activeBoundary.locked} onClick={addPointAfterSelected} title="Add point">
                      <span className="ws-action-content"><AddIcon />Add</span>
                    </button>
                  </div>
                </>
              )}
            </section>
            )}
          </>
            )}

            {geometrySubTab === 'rebar' && (
              <RebarPanel
                generator={rebarGenerator}
                onGeneratorChange={setRebarGenerator}
                hasAppliedSection={hasAppliedSection}
                appliedSection={finalSection}
                rebars={rebars}
                steelMaterials={materialStore.steel}
                defaultSteelMaterialId={materialStore.defaults.steelMaterialId}
                selectedRebarId={selectedRebarId}
                onSelectRebar={setSelectedRebarId}
                onChangeRebars={updateAppliedRebars}
                onOpenSpreadsheet={() => setGeometrySpreadsheet({ kind: 'rebars', materials: materialStore })}
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
            onDesignBasisChange={setDesignBasis}
            onChange={setMaterialStore}
          />
        )}

        {activeModule === 'analysis' && (
          <>
            <div className="ws-page-tabs pm-analysis-tabs" role="tablist" aria-label="Analysis option groups">
              {([
                ['points', 'Points'],
                ['mesh', analysisOptions.methodId === 'equivalent-block-surface-v1' ? 'Block' : 'Mesh'],
                ['resistance', 'Resistance'],
                ['units', 'Units']
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
            {analysisSubTab === 'units' ? <DisplayUnitsPanel /> : analysisSubTab === 'resistance' ? (
              <DesignBasisPanel value={designBasis} onChange={setDesignBasis} />
            ) : (
              <AnalysisOptionsPanel
                options={analysisOptions}
                onChange={setAnalysisOptions}
                view={analysisSubTab}
              />
            )}
          </>
        )}

        {activeModule === 'section' && (
          <SectionResultsPanel
            loadReference={loadingsInput.reference}
            summary={sectionResultsSummary}
            view={sectionResultsView}
            onViewChange={updateSectionResultsView}
            surface={resultSurface}
            exactDirectionCurve={exactDirectionCurve}
            fixedP={fixedResultP}
            projectName={projectMeta.name || appliedGeometryInput.name || 'Column project'}
            projectInformation={projectMeta.information}
            section={finalSection}
            rebars={rebars}
            materialStore={materialStore}
            designBasis={designBasis}
            loadcases={loadingsInput.combinations}
          />
        )}

        {activeModule === 'demand' && (
          <>
            <DemandCheckPanel
              key={loadReferenceEditorVersion}
              loadingsInput={loadingsInput}
              onLoadingsChange={setLoadingsInput}
              onReferencePreviewChange={setLoadReferencePreview}
              view={demandCheckView}
              onViewChange={updateDemandCheckView}
            />
            <LoadingsPanel
              input={loadingsInput}
              selectedLoadcaseId={selectedLoadcaseId}
              checksById={currentQuickChecksById}
              updateStatus={{
                active: loadcaseUpdating,
                message: selectedLoadcase ? `Updating ${selectedLoadcase.name}…` : ''
              }}
              onSelectLoadcase={(id) => {
                if (id == null) {
                  setSelectedLoadcaseId(null)
                  return
                }
                runInverseForLoadcase(id)
              }}
              onOpenDetail={selectedLoadcase && hasAppliedSection && resultSurface && surfaceStatus === 'idle'
                ? () => openLoadcaseCalculation(selectedLoadcase)
                : undefined}
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
        {activeModule === 'report' && (
          <ReportPanel
            surfaceReady={Boolean(resultSurface)}
            loadcases={loadingsInput.combinations}
            reportDetailIds={reportDetailIds}
            onReportDetailIdsChange={setReportDetailIds}
            onExportReport={exportPdfReport}
            reportState={reportState}
            reportMessage={reportMessage}
            onExportExcel={exportExcelReport}
            excelState={excelState}
            excelMessage={excelMessage}
          />
        )}
        </div>

      </aside>

      <section
        className="pm-drawing-stage"
        aria-label={
          activeModule === 'section'
            ? 'Section capacity results'
            : demandChartsVisible
              ? 'Demand check results'
            : activeModule === 'analysis'
              ? analysisOptions.methodId === 'equivalent-block-surface-v1'
                ? 'Equivalent stress block geometry'
                : 'Analysis section mesh'
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
            axesReference={loadReferencePreview ?? loadingsInput.reference}
            loadReference={loadingsInput.reference}
            busy={surfaceStatus === 'working' || moduleSwitching}
            theme={theme}
            ready={hasAppliedSection}
            viewMode={demandChartsVisible ? 'loadcase' : 'overview'}
            surface={demandChartsVisible ? chartSnapshot?.surface ?? resultSurface : resultSurface}
            exactDirectionCurve={exactDirectionCurve}
            onExactDirectionCurveChange={setExactDirectionCurve}
            section={demandChartsVisible ? chartSnapshot?.section ?? finalSection : finalSection}
            rebars={demandChartsVisible ? chartSnapshot?.rebars ?? rebars : rebars}
            materialStore={demandChartsVisible ? chartSnapshot?.materialStore ?? materialStore : materialStore}
            designBasis={demandChartsVisible ? chartSnapshot?.designBasis ?? designBasis : designBasis}
            loadcases={loadingsInput.combinations}
            projectName={projectMeta.name || appliedGeometryInput.name || 'Column project'}
            selectedLoadcaseId={demandChartsVisible ? chartLoadcaseId : selectedLoadcaseId}
            inverseResult={demandChartsVisible
              ? chartSnapshot?.result ?? null
              : chartLoadcaseId == null ? null : inverseResults[chartLoadcaseId] ?? null}
            fixedP={fixedResultP}
            onFixedPChange={setFixedResultP}
            view={sectionResultsView}
            demandView={demandCheckView}
            onViewChange={updateSectionResultsView}
            onDemandViewChange={updateDemandCheckView}
            onLoadcaseUpdatingChange={setLoadcaseUpdating}
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
            <EquivalentBlockGeometryWorkspace
              ready={hasAppliedSection}
              section={finalSection}
              rebars={rebars}
              materialStore={materialStore}
              designBasis={designBasis}
              calculationProfileId={calculationProfileId}
            />
          )
        ) : (
        <>
        {geometryOnly && (
          <div className="geometry-drawing-heading">
            <div>
              <strong>Section drawing</strong>
              <span>{activeBoundary?.name ?? 'No boundary selected'}</span>
            </div>
            <button
              type="button"
              className="ws-action"
              onClick={() => setCamera(fitCameraToPointsWithInsets(allVisiblePoints, size, DEFAULT_FIT_INSETS))}
            >
              Fit view
            </button>
          </div>
        )}
        <div className="pm-canvas-toolbox" aria-label="Boundary drawing tools">
          {geometryOnly && (
            <button
              type="button"
              className={"ws-action ws-action--icon ws-action--cad " + (tool === 'select' ? 'is-active' : '')}
              aria-label="Select and pan"
              title="Select and pan"
              onClick={() => {
                setTool('select')
                setDrawingDraft(null)
                setSnapCursor(null)
              }}
            >
              <MousePointer2 size={16} />
            </button>
          )}
          <button
            className={"ws-action ws-action--icon ws-action--cad " + (tool === 'draw-rectangle' ? 'is-active' : '')}
            onClick={() => toggleDrawTool('draw-rectangle')}
            title="Draw rectangle: click two opposite corners"
          >
            <RectangleHorizontal size={16} />
          </button>
          <button
            className={"ws-action ws-action--icon ws-action--cad " + (tool === 'draw-circle' ? 'is-active' : '')}
            onClick={() => toggleDrawTool('draw-circle')}
            title="Draw circle: click center, then radius point"
          >
            <Circle size={16} />
          </button>
          <button
            className={"ws-action ws-action--icon ws-action--cad " + (tool === 'draw-polygon' ? 'is-active' : '')}
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
          aria-label="Section boundaries and reinforcement in millimetres"
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
                    <QuantityValue quantity="length" value={snapCursorView.world.x} digits={2} unit={false} />, <QuantityValue quantity="length" value={snapCursorView.world.y} digits={2} />
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
            <strong><QuantityValue quantity="area" value={activeSummary.area} digits={0} /></strong>
          </div>
          <div className="pm-boundary-hud-row">
            <span>Center X</span>
            <strong><QuantityValue quantity="length" value={activeSummary.centroid.x} /></strong>
          </div>
          <div className="pm-boundary-hud-row">
            <span>Center Y</span>
            <strong><QuantityValue quantity="length" value={activeSummary.centroid.y} /></strong>
          </div>
        </div>
        {geometryOnly && (
          <div className="geometry-drawing-footer">
            <span>
              {tool === 'select'
                ? 'Drag background to pan · Scroll to zoom · Shift-click for multiple selection'
                : tool === 'draw-polygon'
                  ? 'Click to place vertices · Right-click to close polygon'
                  : tool === 'draw-circle'
                    ? 'Click center, then radius point'
                    : 'Click two opposite corners'}
            </span>
            <span>Units: <UnitLabel quantity="length" /></span>
          </div>
        )}
        </>
        )}
      </section>
      </WorkspaceFrame>

      {geometrySpreadsheet?.kind === 'coordinates' && activeBoundary && (
        <CoordinateSpreadsheetDialog revision={activeBoundary} units={displayUnits} locked={activeBoundary.locked}
          target={{ ...activeBoundary, outerIndex: geometrySpreadsheet.outerIndex, ringIndex: geometrySpreadsheet.ringIndex }}
          onClose={() => setGeometrySpreadsheet(null)} onUpdate={points => {
            if (activeBoundary.locked || activeBoundary.id !== geometrySpreadsheet.boundaryId ||
                activeOuterIndex !== geometrySpreadsheet.outerIndex || activeRingIndex !== geometrySpreadsheet.ringIndex) {
              throw new Error('The selected ring changed or is locked. Close and reopen the spreadsheet.')
            }
            const next = withEditedOuters(activeBoundary, mapOuterRing(activeBoundary.outers, activeOuterIndex, activeRingIndex, () => points))
            setBoundaries(current => current.map(boundary => boundary.id === next.id ? next : boundary))
            setSelectedPointId(current => points.some(point => point.id === current) ? current : points[0]?.id ?? null)
            return next
          }} />
      )}
      {geometrySpreadsheet?.kind === 'rebars' && hasAppliedSection && (
        <RebarSpreadsheetDialog revision={appliedGeometryInput} units={displayUnits}
          target={{ section: finalSection, rebars, steelMaterials: materialStore.steel, defaultSteelMaterialId: materialStore.defaults.steelMaterialId }}
          onClose={() => setGeometrySpreadsheet(null)} onUpdate={bars => {
            if (geometrySpreadsheet.materials !== materialStore) throw new Error('Materials changed. Close and reopen the spreadsheet.')
            const next = updateAppliedRebars(bars)
            setSelectedRebarId(current => bars.some(bar => bar.id === current) ? current : bars[0]?.id ?? null)
            return next
          }} />
      )}

      {activeModule === 'demand' && calculationLoadcase && resultSurface ? (
        <LoadcaseCalculationDialog
          loadReference={loadingsInput.reference}
          projectName={projectMeta.name || appliedGeometryInput.name || 'Column project'}
          sectionName={finalSection.name}
          loadcase={calculationLoadcase}
          loadcases={loadingsInput.combinations}
          check={calculationCheck}
          inverseResult={calculationInverse}
          surface={resultSurface}
          designBasis={designBasis}
          exporting={calculationExporting}
          exportError={calculationExportError}
          onLoadcaseChange={changeCalculationLoadcase}
          onExportExcel={exportCalculationLoadcaseExcel}
          onClose={() => {
            setCalculationLoadcaseId(null)
            setCalculationExportError(null)
          }}
        />
      ) : null}

    </main>
  )
}
