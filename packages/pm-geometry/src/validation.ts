import { isValidEntityId } from './ids'
import type { GeometryInput } from './section-input'

type Coordinate = { x: number; y: number }
type PolygonSolidLike = {
  outer: readonly Coordinate[]
  holes: readonly (readonly Coordinate[])[]
}

export type SectionValidationRebar = {
  id: number | string
  x: number
  y: number
  /** Circular-bar diameter, when the source contract stores diameter. */
  dia?: number
  /** Circular-bar area, when the source contract stores area. */
  area?: number
}

export type GeometryValidationIssueCode =
  | 'INVALID_ENTITY_ID'
  | 'DUPLICATE_ENTITY_ID'
  | 'NON_FINITE_COORDINATE'
  | 'RING_TOO_SHORT'
  | 'REPEATED_CLOSING_POINT'
  | 'ZERO_LENGTH_EDGE'
  | 'DEGENERATE_RING'
  | 'SELF_INTERSECTING_RING'
  | 'HOLE_OUTSIDE_OUTER'
  | 'HOLE_INTERSECTION'
  | 'SOLID_INTERSECTION'
  | 'INVALID_REBAR'
  | 'REBAR_OUTSIDE_CONCRETE'
  | 'REBAR_CROSSES_BOUNDARY'
  | 'REBAR_OVERLAP'

export type GeometryValidationIssue = {
  code: GeometryValidationIssueCode
  path: string
  message: string
}

export type PolygonSectionValidationInput = {
  solids: readonly PolygonSolidLike[]
  rebars?: readonly SectionValidationRebar[]
}

const BASE_TOLERANCE = 1e-9

const distance = (left: Coordinate, right: Coordinate) =>
  Math.hypot(right.x - left.x, right.y - left.y)

const sectionScale = (solids: readonly PolygonSolidLike[]) => {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const solid of solids) {
    for (const ring of [solid.outer, ...solid.holes]) {
      for (const point of ring) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
        if (point.x < minX) minX = point.x
        if (point.x > maxX) maxX = point.x
        if (point.y < minY) minY = point.y
        if (point.y > maxY) maxY = point.y
      }
    }
  }
  return Number.isFinite(minX)
    ? Math.max(maxX - minX, maxY - minY, 1)
    : 1
}

const signedArea = (ring: readonly Coordinate[]) => {
  const origin = ring[0]
  let sum = 0
  let correction = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    const term = (current.x - origin.x) * (next.y - origin.y) -
      (next.x - origin.x) * (current.y - origin.y)
    const updated = sum + term
    correction += Math.abs(sum) >= Math.abs(term)
      ? (sum - updated) + term
      : (term - updated) + sum
    sum = updated
  }
  return (sum + correction) / 2
}

const pointSegmentDistance = (point: Coordinate, start: Coordinate, end: Coordinate) => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return distance(point, start)
  const ratio = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
}

const orientation = (a: Coordinate, b: Coordinate, c: Coordinate, tolerance: number) => {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const scale = Math.max(distance(a, b), distance(a, c), distance(b, c), 1)
  return Math.abs(cross) <= tolerance * scale ? 0 : Math.sign(cross)
}

const pointOnSegment = (point: Coordinate, start: Coordinate, end: Coordinate, tolerance: number) =>
  pointSegmentDistance(point, start, end) <= tolerance

const segmentsIntersect = (
  a: Coordinate,
  b: Coordinate,
  c: Coordinate,
  d: Coordinate,
  tolerance: number
) => {
  const abC = orientation(a, b, c, tolerance)
  const abD = orientation(a, b, d, tolerance)
  const cdA = orientation(c, d, a, tolerance)
  const cdB = orientation(c, d, b, tolerance)
  if (abC !== abD && cdA !== cdB) return true
  return (abC === 0 && pointOnSegment(c, a, b, tolerance)) ||
    (abD === 0 && pointOnSegment(d, a, b, tolerance)) ||
    (cdA === 0 && pointOnSegment(a, c, d, tolerance)) ||
    (cdB === 0 && pointOnSegment(b, c, d, tolerance))
}

type PointClass = 'inside' | 'outside' | 'boundary'

const classifyPointInRing = (
  point: Coordinate,
  ring: readonly Coordinate[],
  tolerance: number
): PointClass => {
  for (let index = 0; index < ring.length; index += 1) {
    if (pointOnSegment(point, ring[index], ring[(index + 1) % ring.length], tolerance)) {
      return 'boundary'
    }
  }
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[previous]
    const b = ring[index]
    if ((a.y > point.y) !== (b.y > point.y)) {
      const crossingOffset = ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y)
      if (point.x - a.x < crossingOffset) inside = !inside
    }
  }
  return inside ? 'inside' : 'outside'
}

const ringsIntersect = (
  left: readonly Coordinate[],
  right: readonly Coordinate[],
  tolerance: number
) => {
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      if (segmentsIntersect(
        left[leftIndex],
        left[(leftIndex + 1) % left.length],
        right[rightIndex],
        right[(rightIndex + 1) % right.length],
        tolerance
      )) return true
    }
  }
  return false
}

const ringSelfIntersects = (ring: readonly Coordinate[], tolerance: number) => {
  for (let first = 0; first < ring.length; first += 1) {
    const firstNext = (first + 1) % ring.length
    for (let second = first + 1; second < ring.length; second += 1) {
      const secondNext = (second + 1) % ring.length
      if (first === second || firstNext === second || secondNext === first) continue
      if (segmentsIntersect(ring[first], ring[firstNext], ring[second], ring[secondNext], tolerance)) {
        return true
      }
    }
  }
  return false
}

const minimumRingDistance = (point: Coordinate, ring: readonly Coordinate[]) => {
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 0; index < ring.length; index += 1) {
    minimum = Math.min(minimum, pointSegmentDistance(point, ring[index], ring[(index + 1) % ring.length]))
  }
  return minimum
}

const pointInSolid = (point: Coordinate, solid: PolygonSolidLike, tolerance: number) =>
  classifyPointInRing(point, solid.outer, tolerance) === 'inside' &&
  solid.holes.every((hole) => classifyPointInRing(point, hole, tolerance) === 'outside')

const rebarRadius = (bar: SectionValidationRebar) => {
  if (bar.dia !== undefined) return bar.dia / 2
  if (bar.area !== undefined) return Math.sqrt(bar.area / Math.PI)
  return Number.NaN
}

export const validatePolygonSection = (
  input: PolygonSectionValidationInput
): GeometryValidationIssue[] => {
  const issues: GeometryValidationIssue[] = []
  const tolerance = BASE_TOLERANCE * sectionScale(input.solids)
  const validRings = new Set<readonly Coordinate[]>()

  const validateRing = (ring: readonly Coordinate[], path: string) => {
    if (ring.length < 3) {
      issues.push({ code: 'RING_TOO_SHORT', path, message: 'requires at least three vertices' })
      return
    }
    if (ring.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      issues.push({ code: 'NON_FINITE_COORDINATE', path, message: 'contains a non-finite coordinate' })
      return
    }
    if (distance(ring[0], ring[ring.length - 1]) <= tolerance) {
      issues.push({ code: 'REPEATED_CLOSING_POINT', path, message: 'must not repeat its closing vertex' })
    }
    let zeroLength = false
    for (let index = 0; index < ring.length; index += 1) {
      if (distance(ring[index], ring[(index + 1) % ring.length]) <= tolerance) zeroLength = true
    }
    if (zeroLength) issues.push({ code: 'ZERO_LENGTH_EDGE', path, message: 'contains a zero-length edge' })
    const area = Math.abs(signedArea(ring))
    if (area <= tolerance * tolerance) {
      issues.push({ code: 'DEGENERATE_RING', path, message: 'must have nonzero polygon area' })
    }
    const selfIntersects = ringSelfIntersects(ring, tolerance)
    if (selfIntersects) {
      issues.push({ code: 'SELF_INTERSECTING_RING', path, message: 'must be a simple, non-self-intersecting ring' })
    }
    if (!zeroLength && !selfIntersects && area > tolerance * tolerance) {
      validRings.add(ring)
    }
  }

  input.solids.forEach((solid, solidIndex) => {
    validateRing(solid.outer, `solids[${solidIndex}].outer`)
    solid.holes.forEach((hole, holeIndex) =>
      validateRing(hole, `solids[${solidIndex}].holes[${holeIndex}]`))
  })

  input.solids.forEach((solid, solidIndex) => {
    if (!validRings.has(solid.outer)) return
    solid.holes.forEach((hole, holeIndex) => {
      if (!validRings.has(hole)) return
      if (ringsIntersect(hole, solid.outer, tolerance) ||
        classifyPointInRing(hole[0], solid.outer, tolerance) !== 'inside') {
        issues.push({
          code: 'HOLE_OUTSIDE_OUTER',
          path: `solids[${solidIndex}].holes[${holeIndex}]`,
          message: 'must lie strictly inside its parent outer ring without touching it'
        })
      }
    })
    for (let first = 0; first < solid.holes.length; first += 1) {
      if (!validRings.has(solid.holes[first])) continue
      for (let second = first + 1; second < solid.holes.length; second += 1) {
        if (!validRings.has(solid.holes[second])) continue
        if (ringsIntersect(solid.holes[first], solid.holes[second], tolerance) ||
          classifyPointInRing(solid.holes[first][0], solid.holes[second], tolerance) !== 'outside' ||
          classifyPointInRing(solid.holes[second][0], solid.holes[first], tolerance) !== 'outside') {
          issues.push({
            code: 'HOLE_INTERSECTION',
            path: `solids[${solidIndex}].holes[${second}]`,
            message: `must not overlap or touch holes[${first}]`
          })
        }
      }
    }
  })

  for (let first = 0; first < input.solids.length; first += 1) {
    const left = input.solids[first]
    if (!validRings.has(left.outer)) continue
    for (let second = first + 1; second < input.solids.length; second += 1) {
      const right = input.solids[second]
      if (!validRings.has(right.outer)) continue
      const boundariesIntersect = [left.outer, ...left.holes].some((leftRing) =>
        validRings.has(leftRing) && [right.outer, ...right.holes].some((rightRing) =>
          validRings.has(rightRing) && ringsIntersect(leftRing, rightRing, tolerance)))
      if (boundariesIntersect ||
        pointInSolid(left.outer[0], right, tolerance) ||
        pointInSolid(right.outer[0], left, tolerance)) {
        issues.push({
          code: 'SOLID_INTERSECTION',
          path: `solids[${second}]`,
          message: `must not overlap or touch solids[${first}]`
        })
      }
    }
  }

  const rebars = input.rebars ?? []
  const validBars: Array<{ bar: SectionValidationRebar; radius: number; index: number }> = []
  rebars.forEach((bar, index) => {
    const radius = rebarRadius(bar)
    const path = `rebars[${index}]`
    if (!Number.isFinite(bar.x) || !Number.isFinite(bar.y) || !Number.isFinite(radius) || !(radius > 0)) {
      issues.push({ code: 'INVALID_REBAR', path, message: 'requires finite coordinates and a positive diameter or area' })
      return
    }
    const containing = input.solids.filter((solid) =>
      validRings.has(solid.outer) && solid.holes.every((hole) => validRings.has(hole)) &&
      pointInSolid(bar, solid, tolerance))
    if (containing.length !== 1) {
      issues.push({
        code: 'REBAR_OUTSIDE_CONCRETE',
        path,
        message: 'centre must lie strictly inside exactly one concrete solid and outside every hole'
      })
      return
    }
    const solid = containing[0]
    const clearance = Math.min(
      minimumRingDistance(bar, solid.outer),
      ...solid.holes.map((hole) => minimumRingDistance(bar, hole))
    )
    if (clearance <= radius + tolerance) {
      issues.push({
        code: 'REBAR_CROSSES_BOUNDARY',
        path,
        message: `circular bar disk crosses or touches a concrete boundary (radius ${radius}, clearance ${clearance})`
      })
      return
    }
    validBars.push({ bar, radius, index })
  })
  for (let first = 0; first < validBars.length; first += 1) {
    for (let second = first + 1; second < validBars.length; second += 1) {
      const left = validBars[first]
      const right = validBars[second]
      if (distance(left.bar, right.bar) + tolerance < left.radius + right.radius) {
        issues.push({
          code: 'REBAR_OVERLAP',
          path: `rebars[${right.index}]`,
          message: `overlaps rebars[${left.index}]`
        })
      }
    }
  }
  return issues
}

const duplicateIdIssues = (
  values: readonly { id: number }[],
  path: string
): GeometryValidationIssue[] => {
  const issues: GeometryValidationIssue[] = []
  const ids = new Set<number>()
  values.forEach((value, index) => {
    if (!isValidEntityId(value.id)) {
      issues.push({ code: 'INVALID_ENTITY_ID', path: `${path}[${index}].id`, message: 'must be a positive integer' })
    } else if (ids.has(value.id)) {
      issues.push({ code: 'DUPLICATE_ENTITY_ID', path: `${path}[${index}].id`, message: 'must be unique' })
    }
    ids.add(value.id)
  })
  return issues
}

export const validateGeometryInput = (input: GeometryInput): GeometryValidationIssue[] => {
  const issues: GeometryValidationIssue[] = []
  issues.push(...duplicateIdIssues(input.outers, 'outers'))
  issues.push(...duplicateIdIssues(input.outers.flatMap((outer) => outer.holes), 'holes'))
  issues.push(...duplicateIdIssues(
    input.outers.flatMap((outer) => [outer.points, ...outer.holes.map((hole) => hole.points)]).flat(),
    'points'
  ))
  issues.push(...duplicateIdIssues(input.rebars, 'rebars'))
  issues.push(...validatePolygonSection({
    solids: input.outers.map((outer) => ({
      outer: outer.points,
      holes: outer.holes.map((hole) => hole.points)
    })),
    rebars: input.rebars
  }))
  return issues
}
