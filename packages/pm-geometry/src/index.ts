import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Pair, Polygon, Ring } from 'polygon-clipping'
import { allocateIds, isValidEntityId, nextAvailableId } from './ids'

export type Point2 = {
  id: number
  x: number
  y: number
}

/** One contiguous concrete region: exterior ring + optional holes. */
export type SectionSolid = {
  outer: Point2[]
  holes: Point2[][]
}

/** Section may contain multiple disconnected solids (e.g. twin bridge pier columns). */
export type SectionGeometry = {
  id: number
  name: string
  solids: SectionSolid[]
}

export type GeometrySummary = {
  area: number
  signedArea: number
  centroid: { x: number; y: number }
  perimeter: number
  isClosed: boolean
  isValid: boolean
  warnings: string[]
}

export type OuterShapeKind = 'rectangle' | 'circle' | 'chamfered-rectangle'

export type RectangleParams = {
  width: number
  height: number
}

export type CircleParams = {
  radius: number
  segments: number
}

export type ChamferedRectangleParams = {
  width: number
  height: number
  chamfer: number
}

export type SectionPrimitiveOperation = 'add' | 'subtract' | 'intersect'

export type SectionPrimitive = {
  id: number
  name?: string
  operation: SectionPrimitiveOperation
  rings: Point2[][]
}

export type SectionComposeOptions = {
  id?: number
  name?: string
  coordinatePrecision?: number
  collinearTolerance?: number
}

export type SectionComposeResult = {
  geometry: SectionGeometry
  warnings: string[]
  multipolygon: Point2[][][]
}

export type RectangleRingParams = RectangleParams & {
  center?: { x: number; y: number }
  usedIds?: Iterable<number>
}

export type CircleRingParams = CircleParams & {
  center?: { x: number; y: number }
  usedIds?: Iterable<number>
}

export type SemicircleRingParams = {
  center?: { x: number; y: number }
  radius: number
  startAngle: number
  endAngle: number
  segments?: number
  usedIds?: Iterable<number>
}

export type CapsuleRingParams = {
  center?: { x: number; y: number }
  width: number
  height: number
  segmentsPerCap?: number
  usedIds?: Iterable<number>
}

export const DEFAULT_RECTANGLE_PARAMS: RectangleParams = { width: 400, height: 300 }
export const DEFAULT_CIRCLE_PARAMS: CircleParams = { radius: 200, segments: 32 }
export const DEFAULT_CHAMFERED_RECTANGLE_PARAMS: ChamferedRectangleParams = {
  width: 400,
  height: 300,
  chamfer: 40
}

export { allocateIds, collectIds, isValidEntityId, nextAvailableId, type EntityId } from './ids'

/** Next point id against already-used point ids. */
export const makePointId = (used: Iterable<number> = []) => nextAvailableId(used)

const pointsFromCoords = (coords: Array<{ x: number; y: number }>, used: Iterable<number> = []): Point2[] => {
  const ids = allocateIds(coords.length, used)
  return coords.map((coord, index) => ({
    id: ids[index],
    x: Math.round(coord.x * 1000) / 1000,
    y: Math.round(coord.y * 1000) / 1000
  }))
}

export const createRectangleOuter = (params: RectangleParams = DEFAULT_RECTANGLE_PARAMS): Point2[] => {
  const width = Math.max(1, params.width)
  const height = Math.max(1, params.height)
  const hx = width / 2
  const hy = height / 2
  return pointsFromCoords([
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: hx, y: hy },
    { x: -hx, y: hy }
  ])
}

export const createCircleOuter = (params: CircleParams = DEFAULT_CIRCLE_PARAMS): Point2[] => {
  const radius = Math.max(1, params.radius)
  const segments = Math.max(3, Math.round(params.segments))
  const coords: Array<{ x: number; y: number }> = []
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    coords.push({
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle)
    })
  }
  return pointsFromCoords(coords)
}

export const createChamferedRectangleOuter = (
  params: ChamferedRectangleParams = DEFAULT_CHAMFERED_RECTANGLE_PARAMS
): Point2[] => {
  const width = Math.max(1, params.width)
  const height = Math.max(1, params.height)
  const maxChamfer = Math.min(width, height) / 2 - 0.5
  const chamfer = Math.max(0, Math.min(params.chamfer, maxChamfer))
  const hx = width / 2
  const hy = height / 2

  if (chamfer < 1e-9) return createRectangleOuter({ width, height })

  return pointsFromCoords([
    { x: -hx + chamfer, y: -hy },
    { x: hx - chamfer, y: -hy },
    { x: hx, y: -hy + chamfer },
    { x: hx, y: hy - chamfer },
    { x: hx - chamfer, y: hy },
    { x: -hx + chamfer, y: hy },
    { x: -hx, y: hy - chamfer },
    { x: -hx, y: -hy + chamfer }
  ])
}

export const createOuterFromShape = (
  kind: OuterShapeKind,
  params: {
    rectangle?: RectangleParams
    circle?: CircleParams
    chamferedRectangle?: ChamferedRectangleParams
  } = {}
): Point2[] => {
  switch (kind) {
    case 'circle':
      return createCircleOuter(params.circle)
    case 'chamfered-rectangle':
      return createChamferedRectangleOuter(params.chamferedRectangle)
    case 'rectangle':
    default:
      return createRectangleOuter(params.rectangle)
  }
}

export const createRectangleRing = (params: RectangleRingParams): Point2[] => {
  const center = params.center ?? { x: 0, y: 0 }
  const width = Math.max(1, params.width)
  const height = Math.max(1, params.height)
  const hx = width / 2
  const hy = height / 2

  return pointsFromCoords(
    [
      { x: center.x - hx, y: center.y - hy },
      { x: center.x + hx, y: center.y - hy },
      { x: center.x + hx, y: center.y + hy },
      { x: center.x - hx, y: center.y + hy }
    ],
    params.usedIds
  )
}

export const createCircleRing = (params: CircleRingParams): Point2[] => {
  const center = params.center ?? { x: 0, y: 0 }
  const radius = Math.max(1, params.radius)
  const segments = Math.max(8, Math.round(params.segments))
  const coords: Array<{ x: number; y: number }> = []

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    coords.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    })
  }

  return pointsFromCoords(coords, params.usedIds)
}

export const createSemicircleRing = (params: SemicircleRingParams): Point2[] => {
  const center = params.center ?? { x: 0, y: 0 }
  const radius = Math.max(1, params.radius)
  const segments = Math.max(4, Math.round(params.segments ?? 24))
  const coords: Array<{ x: number; y: number }> = []

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = params.startAngle + (params.endAngle - params.startAngle) * t
    coords.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    })
  }

  return pointsFromCoords(coords, params.usedIds)
}

export const createCapsuleRing = (params: CapsuleRingParams): Point2[] => {
  const center = params.center ?? { x: 0, y: 0 }
  const width = Math.max(1, params.width)
  const height = Math.max(1, params.height)
  const radius = Math.min(width, height) / 2
  const straight = Math.max(0, width - 2 * radius)
  const leftCenter = { x: center.x - straight / 2, y: center.y }
  const rightCenter = { x: center.x + straight / 2, y: center.y }
  const segments = Math.max(4, Math.round(params.segmentsPerCap ?? 24))
  const coords: Array<{ x: number; y: number }> = []

  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI / 2 - (Math.PI * i) / segments
    coords.push({
      x: rightCenter.x + radius * Math.cos(angle),
      y: rightCenter.y + radius * Math.sin(angle)
    })
  }

  for (let i = 0; i <= segments; i++) {
    const angle = -Math.PI / 2 - (Math.PI * i) / segments
    coords.push({
      x: leftCenter.x + radius * Math.cos(angle),
      y: leftCenter.y + radius * Math.sin(angle)
    })
  }

  return pointsFromCoords(coords, params.usedIds)
}

export const createPrimitive = (
  id: number,
  operation: SectionPrimitiveOperation,
  rings: Point2[][],
  name?: string
): SectionPrimitive => ({
  id,
  name,
  operation,
  rings
})

export const createSectionSolid = (outer: Point2[], holes: Point2[][] = []): SectionSolid => ({
  outer,
  holes
})

export const solidRings = (solid: SectionSolid): Point2[][] => [solid.outer, ...solid.holes]

export const solidNetArea = (solid: SectionSolid) => {
  const outerArea = Math.abs(signedPolygonArea(solid.outer))
  const holeArea = solid.holes.reduce((sum, hole) => sum + Math.abs(signedPolygonArea(hole)), 0)
  return Math.max(0, outerArea - holeArea)
}

export const solidCentroid = (solid: SectionSolid) => {
  const outerArea = Math.abs(signedPolygonArea(solid.outer))
  const outerCentroid = polygonCentroid(solid.outer)
  let areaSum = outerArea
  let xSum = outerCentroid.x * outerArea
  let ySum = outerCentroid.y * outerArea

  for (const hole of solid.holes) {
    const holeArea = Math.abs(signedPolygonArea(hole))
    const holeCentroid = polygonCentroid(hole)
    areaSum -= holeArea
    xSum -= holeCentroid.x * holeArea
    ySum -= holeCentroid.y * holeArea
  }

  if (Math.abs(areaSum) < 1e-9) return { x: 0, y: 0 }
  return { x: xSum / areaSum, y: ySum / areaSum }
}

export const defaultSectionGeometry = (): SectionGeometry => ({
  id: 1,
  name: 'Column section',
  solids: [createSectionSolid(createRectangleOuter(DEFAULT_RECTANGLE_PARAMS))]
})

export const signedPolygonArea = (points: Point2[]) => {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

const samePoint = (a: Point2, b: Point2, tolerance = 1e-9) =>
  Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance

const roundCoordinate = (value: number, precision: number) => Number(value.toFixed(precision))

const stripClosingPoint = (points: Point2[]) => {
  if (points.length > 1 && samePoint(points[0], points[points.length - 1])) return points.slice(0, -1)
  return points
}

const removeAdjacentDuplicatePoints = (points: Point2[], tolerance = 1e-9) => {
  const result: Point2[] = []
  for (const point of stripClosingPoint(points)) {
    const previous = result[result.length - 1]
    if (!previous || !samePoint(previous, point, tolerance)) result.push(point)
  }
  if (result.length > 1 && samePoint(result[0], result[result.length - 1], tolerance)) result.pop()
  return result
}

const isCollinear = (a: Point2, b: Point2, c: Point2, tolerance: number) =>
  Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) <= tolerance

const removeCollinearPoints = (points: Point2[], tolerance: number) => {
  if (points.length <= 3) return points
  const result: Point2[] = []

  for (let i = 0; i < points.length; i++) {
    const previous = points[(i - 1 + points.length) % points.length]
    const current = points[i]
    const next = points[(i + 1) % points.length]
    if (!isCollinear(previous, current, next, tolerance)) result.push(current)
  }

  return result.length >= 3 ? result : points
}

const normalizeRing = (
  points: Point2[],
  options: Pick<Required<SectionComposeOptions>, 'coordinatePrecision' | 'collinearTolerance'>
) => {
  const rounded = removeAdjacentDuplicatePoints(points).map((point, index) => ({
    id: isValidEntityId(point.id) ? point.id : index + 1,
    x: roundCoordinate(point.x, options.coordinatePrecision),
    y: roundCoordinate(point.y, options.coordinatePrecision)
  }))
  return removeCollinearPoints(removeAdjacentDuplicatePoints(rounded), options.collinearTolerance)
}

const ensureOrientation = (points: Point2[], direction: 'ccw' | 'cw') => {
  const area = signedPolygonArea(points)
  if ((direction === 'ccw' && area < 0) || (direction === 'cw' && area > 0)) return [...points].reverse()
  return points
}

const toClippingRing = (
  points: Point2[],
  options: Pick<Required<SectionComposeOptions>, 'coordinatePrecision' | 'collinearTolerance'>
): Ring => {
  const normalized = normalizeRing(points, options)
  if (normalized.length < 3) return []
  const ring = normalized.map((point) => [point.x, point.y] as Pair)
  ring.push([...ring[0]] as Pair)
  return ring
}

const primitiveToClippingPolygon = (
  primitive: SectionPrimitive,
  options: Pick<Required<SectionComposeOptions>, 'coordinatePrecision' | 'collinearTolerance'>
): Polygon => primitive.rings.map((ring) => toClippingRing(ring, options)).filter((ring) => ring.length >= 4)

const polygonAreaAbs = (polygon: Polygon) => {
  const [outer] = polygon
  if (!outer) return 0
  const area = (ring: Ring) =>
    Math.abs(signedPolygonArea(ring.slice(0, -1).map(([x, y], index) => ({ id: index + 1, x, y }))))
  const holes = polygon.slice(1).reduce((sum, ring) => sum + area(ring), 0)
  return Math.max(0, area(outer) - holes)
}

const multiPolygonAreaAbs = (multiPolygon: MultiPolygon) =>
  multiPolygon.reduce((sum, polygon) => sum + polygonAreaAbs(polygon), 0)

const clippingRingToPoints = (
  ring: Ring,
  usedPointIds: number[],
  options: Pick<Required<SectionComposeOptions>, 'coordinatePrecision' | 'collinearTolerance'>
) => {
  const coords = ring.slice(0, -1).map(([x, y]) => ({ x, y }))
  const points = pointsFromCoords(coords, usedPointIds)
  for (const point of points) usedPointIds.push(point.id)
  return normalizeRing(points, options)
}

const normalizeClippingResult = (
  solid: MultiPolygon,
  options: Required<SectionComposeOptions>
): SectionComposeResult => {
  const warnings: string[] = []

  if (solid.length === 0) {
    warnings.push('Boolean composition produced an empty section.')
    return {
      geometry: { id: options.id, name: options.name, solids: [] },
      warnings,
      multipolygon: []
    }
  }

  const polygons = [...solid].sort((a, b) => polygonAreaAbs(b) - polygonAreaAbs(a))
  const usedPointIds: number[] = []

  const solids: SectionSolid[] = polygons.map((polygon) => {
    const outer = ensureOrientation(clippingRingToPoints(polygon[0], usedPointIds, options), 'ccw')
    const holes = polygon
      .slice(1)
      .map((ring) => ensureOrientation(clippingRingToPoints(ring, usedPointIds, options), 'cw'))
    return createSectionSolid(outer, holes)
  })

  const multipolygon = solids.map((sectionSolid) => solidRings(sectionSolid))

  return {
    geometry: {
      id: options.id,
      name: options.name,
      solids
    },
    warnings,
    multipolygon
  }
}

export const composeSectionPrimitives = (
  primitives: SectionPrimitive[],
  options: SectionComposeOptions = {}
): SectionComposeResult => {
  const resolvedOptions: Required<SectionComposeOptions> = {
    id: options.id ?? 1,
    name: options.name ?? 'Composed section',
    coordinatePrecision: options.coordinatePrecision ?? 6,
    collinearTolerance: options.collinearTolerance ?? 1e-9
  }
  const warnings: string[] = []
  let solid: MultiPolygon | null = null

  for (const primitive of primitives) {
    const polygon = primitiveToClippingPolygon(primitive, resolvedOptions)
    if (polygon.length === 0) {
      warnings.push(`Primitive "${primitive.name ?? primitive.id}" has no valid polygon rings.`)
      continue
    }

    if (primitive.operation === 'add') {
      solid = solid ? polygonClipping.union(solid, polygon) : polygonClipping.union(polygon)
      continue
    }

    if (primitive.operation === 'subtract') {
      if (!solid) {
        warnings.push(`Subtract primitive "${primitive.name ?? primitive.id}" was ignored because no solid exists yet.`)
        continue
      }
      const overlap = polygonClipping.intersection(solid, polygon)
      if (multiPolygonAreaAbs(overlap) <= 1e-9) {
        warnings.push(`Subtract primitive "${primitive.name ?? primitive.id}" was ignored because it does not overlap the current solid.`)
        continue
      }
      solid = polygonClipping.difference(solid, polygon)
      continue
    }

    if (!solid) {
      solid = polygonClipping.union(polygon)
      continue
    }
    solid = polygonClipping.intersection(solid, polygon)
  }

  const result = normalizeClippingResult(solid ?? [], resolvedOptions)
  return { ...result, warnings: [...warnings, ...result.warnings] }
}

export const createExampleCapsuleSectionWithHoles = () => {
  const outerRect = createPrimitive(
    1,
    'add',
    [createRectangleRing({ center: { x: 0, y: 0 }, width: 420, height: 260 })],
    'Outer rectangle'
  )
  const leftCap = createPrimitive(
    2,
    'add',
    [
      createSemicircleRing({
        center: { x: -210, y: 0 },
        radius: 130,
        startAngle: Math.PI / 2,
        endAngle: (Math.PI * 3) / 2,
        segments: 32
      })
    ],
    'Outer left semicircle'
  )
  const rightCap = createPrimitive(
    3,
    'add',
    [
      createSemicircleRing({
        center: { x: 210, y: 0 },
        radius: 130,
        startAngle: -Math.PI / 2,
        endAngle: Math.PI / 2,
        segments: 32
      })
    ],
    'Outer right semicircle'
  )
  const leftHole = createPrimitive(
    4,
    'subtract',
    [createCapsuleRing({ center: { x: -105, y: 0 }, width: 130, height: 70, segmentsPerCap: 20 })],
    'Left rectangle + semicircle hole'
  )
  const rightHole = createPrimitive(
    5,
    'subtract',
    [createCapsuleRing({ center: { x: 105, y: 0 }, width: 130, height: 70, segmentsPerCap: 20 })],
    'Right rectangle + semicircle hole'
  )

  return composeSectionPrimitives([outerRect, leftCap, rightCap, leftHole, rightHole], {
    id: 1,
    name: 'Rectangle and semicircle section with two holes'
  })
}

export const polygonPerimeter = (points: Point2[]) => {
  if (points.length < 2) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return sum
}

export const polygonCentroid = (points: Point2[]) => {
  // Detailed reference: docs/02-meshing-2d.md §2 (polygon properties).
  // D_i = x_i*y_{i+1} - x_{i+1}*y_i
  // Cx = Σ((x_i + x_{i+1}) * D_i) / (3 * ΣD_i)
  // Cy = Σ((y_i + y_{i+1}) * D_i) / (3 * ΣD_i)
  if (points.length < 3) return { x: 0, y: 0 }

  let sumD = 0
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const d = a.x * b.y - b.x * a.y
    sumD += d
    sumX += (a.x + b.x) * d
    sumY += (a.y + b.y) * d
  }

  if (Math.abs(sumD) < 1e-9) return { x: 0, y: 0 }
  return {
    x: sumX / (3 * sumD),
    y: sumY / (3 * sumD)
  }
}

export const sectionCentroid = (geometry: SectionGeometry) => {
  let areaSum = 0
  let xSum = 0
  let ySum = 0

  for (const solid of geometry.solids) {
    const area = solidNetArea(solid)
    const centroid = solidCentroid(solid)
    areaSum += area
    xSum += centroid.x * area
    ySum += centroid.y * area
  }

  if (Math.abs(areaSum) < 1e-9) return { x: 0, y: 0 }
  return { x: xSum / areaSum, y: ySum / areaSum }
}

const hasDuplicatePoints = (points: Point2[]) => {
  const seen = new Set<string>()
  for (const point of points) {
    const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

export const summarizeSection = (geometry: SectionGeometry): GeometrySummary => {
  const warnings: string[] = []
  let area = 0
  let signedArea = 0
  let perimeter = 0

  if (geometry.solids.length === 0) {
    warnings.push('Section has no solids.')
  }

  geometry.solids.forEach((solid, solidIndex) => {
    const label = geometry.solids.length > 1 ? `Solid ${solidIndex + 1}` : 'Outer boundary'
    const outerArea = signedPolygonArea(solid.outer)
    signedArea += outerArea
    area += solidNetArea(solid)
    perimeter += polygonPerimeter(solid.outer)
    solid.holes.forEach((hole) => {
      perimeter += polygonPerimeter(hole)
    })

    if (solid.outer.length < 3) warnings.push(`${label} needs at least 3 points.`)
    if (Math.abs(outerArea) < 1e-9) warnings.push(`${label} area is zero.`)
    if (hasDuplicatePoints(solid.outer)) warnings.push(`${label} has duplicate points.`)
    if (outerArea < 0) warnings.push(`${label} is clockwise; P-M kernel will normalize it later.`)
    solid.holes.forEach((hole, index) => {
      if (hole.length < 3) warnings.push(`${label} hole ${index + 1} needs at least 3 points.`)
      if (Math.abs(signedPolygonArea(hole)) < 1e-9) warnings.push(`${label} hole ${index + 1} area is zero.`)
      if (hasDuplicatePoints(hole)) warnings.push(`${label} hole ${index + 1} has duplicate points.`)
    })
  })

  return {
    area,
    signedArea,
    centroid: sectionCentroid(geometry),
    perimeter,
    isClosed: geometry.solids.length > 0 && geometry.solids.every((solid) => solid.outer.length >= 3),
    isValid: warnings.length === 0,
    warnings
  }
}

export * from './rebar'
export * from './section-input'
export * from './mesh'
export * from './containment'
