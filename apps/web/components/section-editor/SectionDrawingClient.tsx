'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Atom,
  Boxes,
  Circle,
  Eraser,
  Eye,
  EyeOff,
  Layers3,
  Lock,
  Maximize2,
  Moon,
  MousePointer2,
  Plus,
  RectangleHorizontal,
  Sun,
  Unlock,
  X
} from 'lucide-react'
import {
  composeSectionPrimitives,
  createEmptyGeometryInput,
  createCapsuleRing,
  createCircleRing,
  createPrimitive,
  createRectangleRing,
  createSectionSolid,
  geometryInputFromSectionGeometry,
  geometryInputRebars,
  makePointId,
  sectionGeometryFromGeometryInput,
  solidRings,
  summarizeSection,
  updateGeometryInputRebars,
  type GeometryInput,
  type GeometryInputRebarView,
  type Point2,
  type SectionGeometry
} from '@pm/geometry'
import { RebarPanel } from './RebarPanel'
import {
  createSectionCamera2d,
  panSectionCamera2d,
  screenToWorld,
  snapWorldPoint,
  worldToScreen,
  zoomSectionCamera2d
} from '@structures/cad-drawing/section2d'

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
type WorkspaceModule = 'geometry' | 'materials' | 'loadings'
type GeometrySubTab = 'concrete' | 'rebar'
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
  id: string
  name: string
  /** List of outers; each entry is [outerRing, ...holeRings]. */
  outers: Point2[][][]
  sourceKind: BuilderShape | 'manual' | 'boolean'
  source: BoundarySource
  visible: boolean
  locked: boolean
}

type BoundaryScreenData = {
  boundary: BoundaryObject
  outers: Array<Array<Array<ScreenPoint & { id: string; wx: number; wy: number }>>>
  path: string
}

const GRID_SPACING_MM = 25
const DEFAULT_CIRCLE_SEGMENTS = 64

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

/** Global 1..N labels matching canvas order: Outer1 points, then its holes, then Outer2, … */
const buildPointDisplayIndexMap = (outers: Point2[][][]) => {
  const map = new Map<string, number>()
  let index = 0
  for (const outer of outers) {
    for (const ring of outer) {
      for (const point of ring) {
        index += 1
        map.set(point.id, index)
      }
    }
  }
  return map
}

const cloneRing = (ring: Point2[]): Point2[] => ring.map((point) => ({ ...point }))

const boundaryToSectionGeometry = (boundary: BoundaryObject): SectionGeometry => ({
  id: boundary.id,
  name: boundary.name,
  unit: 'mm',
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
  visible: patch.visible ?? true,
  locked: patch.locked ?? false
})

const makeBoundaryId = () => `b-${Math.random().toString(36).slice(2, 9)}`

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

const boundaryToPrimitives = (boundary: BoundaryObject, operation: 'add' | 'subtract') =>
  boundary.outers.map((outer, index) =>
    createPrimitive(`${boundary.id}-o${index}`, operation, outer, boundary.name)
  )

const rectangleSourceFromCorners = (a: Point2, b: Point2): Extract<BoundarySource, { kind: 'rectangle' }> => ({
  kind: 'rectangle',
  center: { id: makePointId(), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
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
  segments = 64
): Extract<BoundarySource, { kind: 'circle' }> => ({
  kind: 'circle',
  center,
  radius: Math.max(1, Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y)),
  segments
})

const createCircleRingFromRadiusPoint = (center: Point2, radiusPoint: Point2, segments = 64) =>
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
      major: Math.abs(x % (spacing * 4)) < 1e-9,
      a: worldToScreen(camera, { x, y: min.y }, size),
      b: worldToScreen(camera, { x, y: max.y }, size)
    })
  }

  for (let y = startY; y <= endY; y += spacing) {
    lines.push({
      key: `y-${y}`,
      major: Math.abs(y % (spacing * 4)) < 1e-9,
      a: worldToScreen(camera, { x: min.x, y }, size),
      b: worldToScreen(camera, { x: max.x, y }, size)
    })
  }

  return lines
}

const fitCameraToPointsWithInsets = (
  points: Point2[],
  size: { width: number; height: number },
  insets: { top: number; right: number; bottom: number; left: number }
): Camera2d => {
  if (!points.length || !size.width || !size.height) return createSectionCamera2d() as Camera2d

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
  const dragRef = useRef<
    | { kind: 'pan'; last: ScreenPoint }
    | { kind: 'vertex'; boundaryId: string; outerIndex: number; ringIndex: number; pointId: string; last: ScreenPoint }
    | { kind: 'boundary'; boundaryId: string; lastWorld: Point2 }
    | null
  >(null)
  const [theme, setTheme] = useState<Theme>('light')
  const [tool, setTool] = useState<Tool>('select')
  const [activeModule, setActiveModule] = useState<WorkspaceModule>('geometry')
  const [geometrySubTab, setGeometrySubTab] = useState<GeometrySubTab>('concrete')
  const [selectedRebarId, setSelectedRebarId] = useState<string | null>(null)
  const [boundaries, setBoundaries] = useState<BoundaryObject[]>([])
  const [selectedBoundaryIds, setSelectedBoundaryIds] = useState<string[]>([])
  const [activeBoundaryId, setActiveBoundaryId] = useState<string>('')
  const [activeRingIndex, setActiveRingIndex] = useState(0)
  const [activeOuterIndex, setActiveOuterIndex] = useState(0)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [drawingDraft, setDrawingDraft] = useState<DrawingDraft>(null)
  const [snapCursor, setSnapCursor] = useState<Point2 | null>(null)
  const [appliedGeometryInput, setAppliedGeometryInput] = useState<GeometryInput>(() =>
    createEmptyGeometryInput({ id: 'section-1', name: 'Column section' })
  )
  const [lastBooleanWarning, setLastBooleanWarning] = useState<string>('')
  const [detailTab, setDetailTab] = useState<'basic' | 'points'>('basic')
  const [circleSegmentsDraft, setCircleSegmentsDraft] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 900, height: 620 })
  const [camera, setCamera] = useState<Camera2d>(() => createSectionCamera2d({ unitsPerPixel: 1.15 }) as Camera2d)

  useEffect(() => {
    document.body.dataset.jscadTheme = theme
  }, [theme])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setSize({
        width: Math.max(320, entry.contentRect.width),
        height: Math.max(280, entry.contentRect.height)
      })
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

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
  const pointDisplayIndexById = useMemo(
    () => (activeBoundary ? buildPointDisplayIndexMap(activeBoundary.outers) : new Map<string, number>()),
    [activeBoundary]
  )
  const activeOuterHoleCount = Math.max(0, activeOuter.length - 1)
  const hasAppliedSection = finalSection.solids.some((solid) => solid.outer.length >= 3)
  const appliedBoundaryId = hasAppliedSection ? finalSection.id : ''
  const canApplySection = Boolean(
    activeBoundary && !(activeBoundary.id === appliedBoundaryId && activeBoundary.locked)
  )
  const activeSummary = useMemo(() => summarizeSection(activeSection), [activeSection])
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
  }

  const addBoundary = (boundary: BoundaryObject) => {
    setBoundaries((current) => [...current, boundary])
    setSelectedBoundaryIds([boundary.id])
    setActiveBoundaryId(boundary.id)
    setActiveOuterIndex(0)
    setActiveRingIndex(0)
    setSelectedPointId(boundary.outers[0]?.[0]?.[0]?.id ?? null)
  }

  const commitDrawnBoundary = (name: string, sourceKind: BoundaryObject['sourceKind'], ring: Point2[], source?: BoundarySource) => {
    if (ring.length < 3) return
    const boundary: BoundaryObject = {
      id: makeBoundaryId(),
      name,
      outers: [[ring]],
      sourceKind,
      source: source ?? { kind: 'manual' },
      visible: true,
      locked: false
    }
    addBoundary(boundary)
    setDrawingDraft(null)
    setSnapCursor(null)
    setTool('select')
  }

  const worldPointFromPointer = (event: React.PointerEvent<SVGSVGElement>, svg: SVGSVGElement) =>
    (() => {
      const point = snapWorldPoint(screenToWorld(camera, eventPoint(event, svg), size), GRID_SPACING_MM)
      return { id: makePointId(), x: point.x, y: point.y }
    })()

  const selectBoundary = (id: string, additive = false) => {
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

  const updateBoundary = (id: string, patch: Partial<BoundaryObject>) => {
    setBoundaries((current) => current.map((boundary) => (boundary.id === id ? { ...boundary, ...patch } : boundary)))
  }

  const updateActiveBoundarySource = (source: BoundarySource) => {
    if (!activeBoundary || activeBoundary.locked) return
    const outers: Point2[][][] =
      source.kind === 'rectangle'
        ? [[createRectangleRing({ center: source.center, width: source.width, height: source.height })]]
        : source.kind === 'circle'
          ? [[createCircleRing({ center: source.center, radius: source.radius, segments: source.segments })]]
          : source.kind === 'capsule'
            ? [
                [
                  createCapsuleRing({
                    center: source.center,
                    width: source.width,
                    height: source.height,
                    segmentsPerCap: Math.max(4, Math.round(source.segments / 2))
                  })
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

  const deleteBoundary = (id: string) => {
    setBoundaries((current) => current.filter((boundary) => boundary.id !== id))
    setSelectedBoundaryIds((current) => current.filter((selectedId) => selectedId !== id))
    if (finalSection.id === id) {
      setAppliedGeometryInput(createEmptyGeometryInput({ id: 'section-1', name: 'Column section' }))
      setSelectedRebarId(null)
    }
    if (activeBoundaryId === id) {
      const nextBoundary = boundaries.find((boundary) => boundary.id !== id)
      setActiveBoundaryId(nextBoundary?.id ?? '')
      setActiveOuterIndex(0)
      setActiveRingIndex(0)
      setSelectedPointId(nextBoundary?.outers[0]?.[0]?.[0]?.id ?? null)
    }
  }

  const requestDeleteBoundary = (id: string) => {
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

  const duplicateBoundary = (boundary: BoundaryObject) => {
    const id = makeBoundaryId()
    const duplicate: BoundaryObject = {
      ...boundary,
      id,
      name: `${boundary.name} Copy`,
      outers: boundary.outers.map((outer) =>
        outer.map((ring) => ring.map((point) => ({ ...point, id: makePointId(), x: point.x + 25, y: point.y + 25 })))
      ),
      sourceKind: 'manual',
      source: { kind: 'manual' }
    }
    setBoundaries((current) => [...current, duplicate])
    setSelectedBoundaryIds([id])
    setActiveBoundaryId(id)
    setActiveOuterIndex(0)
    setActiveRingIndex(0)
    setSelectedPointId(duplicate.outers[0]?.[0]?.[0]?.id ?? null)
  }

  const applyBooleanAction = (action: BooleanAction) => {
    if (selectedBoundaries.length < 2) return

    const rankedByArea = [...selectedBoundaries].sort((a, b) => {
      const areaA = summarizeSection(boundaryToSectionGeometry(a)).area
      const areaB = summarizeSection(boundaryToSectionGeometry(b)).area
      return areaB - areaA
    })

    const primitives =
      action === 'union'
        ? selectedBoundaries.flatMap((boundary) => boundaryToPrimitives(boundary, 'add'))
        : (() => {
            const [outer, ...inners] = rankedByArea
            return [
              ...boundaryToPrimitives(outer, 'add'),
              ...inners.flatMap((boundary) => boundaryToPrimitives(boundary, 'subtract'))
            ]
          })()

    const result = composeSectionPrimitives(primitives, {
      id: makeBoundaryId(),
      name: action === 'union' ? 'Union result' : 'Subtract result'
    })
    setLastBooleanWarning(result.warnings.join(' '))
    if (!result.geometry.solids.some((solid) => solid.outer.length >= 3)) return

    const resultBoundary = sectionGeometryToBoundary(result.geometry, {
      id: result.geometry.id,
      name: result.geometry.name,
      sourceKind: 'boolean',
      source: { kind: 'boolean' }
    })
    addBoundary(resultBoundary)
  }

  const updateActivePoint = (id: string, patch: Partial<Point2>) => {
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

  const moveBoundary = (id: string, delta: { x: number; y: number }) => {
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
    boundaryId: string,
    outerIndex: number,
    ringIndex: number,
    pointId: string,
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
      id: makePointId(),
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

  const applyActiveAsSection = () => {
    if (!activeBoundary || !canApplySection) return
    const appliedId = activeBoundary.id
    const previousAppliedId = hasAppliedSection ? finalSection.id : ''

    setAppliedGeometryInput(
      geometryInputFromSectionGeometry(
        boundaryToSectionGeometry(activeBoundary),
        previousAppliedId === appliedId ? geometryInputRebars(appliedGeometryInput) : []
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

  const fitView = () => {
    setCamera(
      fitCameraToPointsWithInsets(allVisiblePoints, size, {
        top: 74,
        right: 36,
        bottom: 96,
        left: 36
      })
    )
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
    const pointId = target.getAttribute('data-point-id')
    const boundaryId = target.getAttribute('data-boundary-id')
    const rebarId = target.getAttribute('data-rebar-id')
    const outerIndex = Number(target.getAttribute('data-outer-index') ?? '0')
    const ringIndex = Number(target.getAttribute('data-ring-index') ?? '0')

    svg.setPointerCapture(event.pointerId)

    if (event.button === 2) return

    if (rebarId) {
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
          return { ...current, points: [...current.points, world], cursor: world }
        }
        return { tool: 'draw-polygon', points: [world], cursor: world }
      })
      return
    }

    if (pointId && boundaryId) {
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

    if (boundaryId) {
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
          <button className={activeModule === 'geometry' ? 'is-active' : ''} onClick={() => setActiveModule('geometry')}>
            <Boxes size={16} />
            <span>Geometry</span>
          </button>
          <button className={activeModule === 'materials' ? 'is-active' : ''} onClick={() => setActiveModule('materials')}>
            <Atom size={16} />
            <span>Materials</span>
          </button>
          <button className={activeModule === 'loadings' ? 'is-active' : ''} onClick={() => setActiveModule('loadings')}>
            <Layers3 size={16} />
            <span>Loadings</span>
          </button>
        </nav>

        <div className="pm-toolbar" aria-label="Drawing tools">
          <button className={tool === 'select' ? 'is-active' : ''} onClick={() => setTool('select')} title="Select boundary">
            <MousePointer2 size={18} />
          </button>
          <button onClick={fitView} title="Fit view">
            <Maximize2 size={18} />
          </button>
          <button onClick={() => deleteSelectedPoint()} disabled={!selectedPointId || activeRing.length <= 3 || Boolean(activeBoundary?.locked)} title="Delete point">
            <Eraser size={18} />
          </button>
          <button onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))} title="Theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      <aside className="pm-side-panel">
        <div className="pm-side-panel-body">
        {activeModule === 'geometry' && (
          <>
            <div className="pm-geometry-tabs" role="tablist" aria-label="Geometry tabs">
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
            {boundaries.length === 0 && (
              <section className="pm-panel-section">
                <div className="pm-section-title">
                  <h2>No Boundary</h2>
                </div>
                <p className="pm-preview-hint">
                  Use the drawing toolbar on the canvas to create a rectangle, circle, or polygon boundary.
                </p>
              </section>
            )}

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
                    Union
                  </button>
                  <button
                    type="button"
                    className="pm-table-add-btn"
                    onClick={() => applyBooleanAction('subtract')}
                    disabled={selectedBoundaries.length < 2}
                    title="Subtract inner regions from the largest outer"
                  >
                    Subtract
                  </button>
                </div>
              </div>
              <div className="pm-boundary-list">
                {boundaries.map((boundary) => {
                  const isSelected = selectedBoundaryIds.includes(boundary.id)
                  const isActive = boundary.id === activeBoundaryId
                  const isApplied = boundary.id === appliedBoundaryId
                  return (
                    <div
                      className={`pm-boundary-row${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}${isApplied ? ' is-applied' : ''}`}
                      key={boundary.id}
                    >
                      <button className="pm-boundary-row-main" onClick={(event) => selectBoundary(boundary.id, event.shiftKey || event.metaKey)}>
                        <span className={`pm-selection-badge${isSelected ? ' is-on' : ''}${isApplied ? ' is-applied' : ''}`} />
                        <span className="pm-boundary-row-name">
                          {boundary.name}
                          {isApplied && <span className="pm-boundary-row-badge">Applied</span>}
                        </span>
                        <span className="pm-boundary-row-meta">
                          {boundaryPointCount(boundary)} pts
                          {boundary.outers.length > 1 ? ` · ${boundary.outers.length} outers` : ''}
                          {boundaryHoleCount(boundary) > 0 ? ` · ${boundaryHoleCount(boundary)} holes` : ''}
                        </span>
                      </button>
                      <button className="pm-table-icon-btn" title="Visibility" onClick={() => updateBoundary(boundary.id, { visible: !boundary.visible })}>
                        {boundary.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button className="pm-table-icon-btn" title="Lock" onClick={() => updateBoundary(boundary.id, { locked: !boundary.locked })}>
                        {boundary.locked ? <Lock size={14} /> : <Unlock size={14} />}
                      </button>
                      <button className="pm-table-icon-btn" title="Duplicate" onClick={() => duplicateBoundary(boundary)}>
                        <Plus size={14} />
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

            <section className="pm-panel-section pm-vertex-section">
              <div className="pm-section-title pm-section-title--with-action">
                <h2>Boundary Details</h2>
                {showBasicDetailTab && (
                  <div className="pm-detail-tabs" role="tablist" aria-label="Boundary detail tabs">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={effectiveDetailTab === 'basic'}
                      className={effectiveDetailTab === 'basic' ? 'is-active' : ''}
                      onClick={() => setDetailTab('basic')}
                    >
                      Basic
                    </button>
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
                )}
              </div>

              {!activeBoundary && <p className="pm-preview-hint">Select or draw a boundary.</p>}

              {activeBoundary && showBasicDetailTab && effectiveDetailTab === 'basic' && (
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
              )}

              {activeBoundary && effectiveDetailTab === 'points' && (
                <>
                  {(activeBoundary.outers.length > 1 || activeOuterHoleCount > 0) && (
                    <div className="pm-ring-nav" aria-label="Ring navigation">
                      {activeBoundary.outers.length > 1 ? (
                        <div className="pm-ring-nav__outers" role="tablist" aria-label="Outers">
                          {activeBoundary.outers.map((outer, index) => {
                            const isActiveOuter = activeOuterIndex === index
                            const isEditingOuterRing = isActiveOuter && activeRingIndex === 0
                            return (
                              <button
                                type="button"
                                role="tab"
                                key={`outer-${index}`}
                                aria-selected={isActiveOuter}
                                className={`pm-ring-nav__outer${isActiveOuter ? ' is-active' : ''}${isEditingOuterRing ? ' is-editing' : ''}`}
                                onClick={() => {
                                  setActiveOuterIndex(index)
                                  setActiveRingIndex(0)
                                  setSelectedPointId(outer[0]?.[0]?.id ?? null)
                                }}
                              >
                                Outer {index + 1}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`pm-ring-nav__context${activeRingIndex === 0 ? ' is-editing' : ''}`}
                          onClick={() => {
                            setActiveRingIndex(0)
                            setSelectedPointId(activeOuter[0]?.[0]?.id ?? null)
                          }}
                        >
                          Outer 1
                        </button>
                      )}
                      {activeOuterHoleCount > 0 && (
                        <div className="pm-ring-nav__holes" role="group" aria-label={`Holes of Outer ${activeOuterIndex + 1}`}>
                          {activeOuter.slice(1).map((hole, holeIndex) => (
                            <button
                              type="button"
                              key={`hole-${holeIndex + 1}`}
                              className={activeRingIndex === holeIndex + 1 ? 'is-active' : ''}
                              onClick={() => {
                                setActiveRingIndex(holeIndex + 1)
                                setSelectedPointId(hole[0]?.id ?? null)
                              }}
                            >
                              Hole {holeIndex + 1}
                            </button>
                          ))}
                        </div>
                      )}
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
                          <th>#</th>
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
                        {activeRing.map((point) => {
                          const displayIndex = pointDisplayIndexById.get(point.id) ?? 0
                          return (
                            <tr className={selectedPointId === point.id ? 'is-selected' : ''} key={point.id}>
                              <td>
                                <span className="pm-point-index">{displayIndex}</span>
                              </td>
                              <td>
                                <input
                                  aria-label={`Point ${displayIndex} X`}
                                  value={point.x}
                                  type="number"
                                  readOnly={activeBoundary.locked}
                                  onFocus={() => setSelectedPointId(point.id)}
                                  onChange={(event) => updateActivePoint(point.id, { x: Number(event.target.value) })}
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`Point ${displayIndex} Y`}
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
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </>
            )}

            {geometrySubTab === 'rebar' && (
              <RebarPanel
                hasAppliedSection={hasAppliedSection}
                appliedSection={finalSection}
                rebars={rebars}
                selectedRebarId={selectedRebarId}
                onSelectRebar={setSelectedRebarId}
                onChangeRebars={updateAppliedRebars}
              />
            )}
          </>
        )}

        {activeModule === 'materials' && (
          <section className="pm-panel-section">
            <div className="pm-section-title">
              <h2>Materials</h2>
            </div>
            <div className="pm-placeholder-panel">
              <span>Concrete, steel, and code models will live here.</span>
            </div>
          </section>
        )}

        {activeModule === 'loadings' && (
          <section className="pm-panel-section">
            <div className="pm-section-title">
              <h2>Loadings</h2>
            </div>
            <div className="pm-placeholder-panel">
              <span>Axial load, moments, and load combinations will live here.</span>
            </div>
          </section>
        )}
        </div>

        {activeModule === 'geometry' && geometrySubTab === 'concrete' && (
          <div className="pm-panel-footer">
            <button
              type="button"
              className="pm-primary-action"
              onClick={applyActiveAsSection}
              disabled={!canApplySection}
              title="Commit the active boundary as the section used by later design steps"
            >
              Apply
            </button>
          </div>
        )}
      </aside>

      <section className="pm-drawing-stage" aria-label="Section drawing">
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
              rebars.map((bar, index) => {
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
                        {index + 1}
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
                      const label = pointDisplayIndexById.get(point.id) ?? 0
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
                            {label}
                          </text>
                        </g>
                      )
                    })
                  )
                )
              )}
          </g>
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
      </section>
    </main>
  )
}
