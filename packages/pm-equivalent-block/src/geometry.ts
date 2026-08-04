import {
  EquivalentBlockInputError,
  type ClippedBlockSolid,
  type EquivalentBlockSection,
  type Point2,
  type PolygonMoments,
  type PreparedEquivalentBlockSection,
  type PreparedPolygonSolid
} from './types'

const BASE_TOLERANCE = 1e-10

const finitePoint = (point: Point2) => Number.isFinite(point.x) && Number.isFinite(point.y)

const distance = (a: Point2, b: Point2) => Math.hypot(b.x - a.x, b.y - a.y)

export const signedRingArea = (ring: readonly Point2[]) => {
  let twiceArea = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    twiceArea += current.x * next.y - next.x * current.y
  }
  return twiceArea / 2
}

const normalizeRing = (source: readonly Point2[], tolerance: number) => {
  if (source.some((point) => !finitePoint(point))) {
    throw new EquivalentBlockInputError('INVALID_GEOMETRY', 'Polygon coordinates must be finite.')
  }
  const ring: Point2[] = []
  for (const point of source) {
    if (ring.length === 0 || distance(ring[ring.length - 1], point) > tolerance) {
      ring.push({ x: point.x, y: point.y })
    }
  }
  if (ring.length > 1 && distance(ring[0], ring[ring.length - 1]) <= tolerance) ring.pop()
  if (ring.length < 3) {
    throw new EquivalentBlockInputError('INVALID_GEOMETRY', 'Every polygon ring requires at least three distinct points.')
  }
  return ring
}

const orientRing = (ring: Point2[], ccw: boolean) => {
  const isCcw = signedRingArea(ring) > 0
  return isCcw === ccw ? ring : [...ring].reverse()
}

const cross = (a: Point2, b: Point2, c: Point2) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

const pointOnSegment = (point: Point2, a: Point2, b: Point2, tolerance: number) => {
  if (Math.abs(cross(a, b, point)) > tolerance) return false
  return (
    point.x >= Math.min(a.x, b.x) - tolerance &&
    point.x <= Math.max(a.x, b.x) + tolerance &&
    point.y >= Math.min(a.y, b.y) - tolerance &&
    point.y <= Math.max(a.y, b.y) + tolerance
  )
}

const segmentsIntersect = (a: Point2, b: Point2, c: Point2, d: Point2, tolerance: number) => {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  if (((abC > tolerance && abD < -tolerance) || (abC < -tolerance && abD > tolerance)) &&
      ((cdA > tolerance && cdB < -tolerance) || (cdA < -tolerance && cdB > tolerance))) return true
  return (
    pointOnSegment(c, a, b, tolerance) ||
    pointOnSegment(d, a, b, tolerance) ||
    pointOnSegment(a, c, d, tolerance) ||
    pointOnSegment(b, c, d, tolerance)
  )
}

const assertSimpleRing = (ring: Point2[], tolerance: number) => {
  const count = ring.length
  for (let first = 0; first < count; first += 1) {
    const firstNext = (first + 1) % count
    for (let second = first + 1; second < count; second += 1) {
      const secondNext = (second + 1) % count
      if (first === second || firstNext === second || secondNext === first) continue
      if (first === 0 && secondNext === 0) continue
      if (segmentsIntersect(ring[first], ring[firstNext], ring[second], ring[secondNext], tolerance)) {
        throw new EquivalentBlockInputError('INVALID_GEOMETRY', 'Polygon rings must not self-intersect.')
      }
    }
  }
}

export const pointInRing = (point: Point2, ring: readonly Point2[], tolerance = BASE_TOLERANCE) => {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[previous]
    const b = ring[index]
    if (pointOnSegment(point, a, b, tolerance)) return true
    const crosses = (a.y > point.y) !== (b.y > point.y)
    if (crosses) {
      const atX = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      if (point.x < atX) inside = !inside
    }
  }
  return inside
}

const ringsIntersect = (left: Point2[], right: Point2[], tolerance: number) => {
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]
    const b = left[(i + 1) % left.length]
    for (let j = 0; j < right.length; j += 1) {
      const c = right[j]
      const d = right[(j + 1) % right.length]
      if (segmentsIntersect(a, b, c, d, tolerance)) return true
    }
  }
  return false
}

const ringSignedMoments = (ring: readonly Point2[]) => {
  let twiceArea = 0
  let firstMomentXTimes6 = 0
  let firstMomentYTimes6 = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    const edgeCross = current.x * next.y - next.x * current.y
    twiceArea += edgeCross
    firstMomentXTimes6 += (current.x + next.x) * edgeCross
    firstMomentYTimes6 += (current.y + next.y) * edgeCross
  }
  return {
    area: twiceArea / 2,
    firstMomentX: firstMomentXTimes6 / 6,
    firstMomentY: firstMomentYTimes6 / 6
  }
}

export const polygonSetMoments = (solids: readonly PreparedPolygonSolid[]): PolygonMoments => {
  let area = 0
  let firstMomentX = 0
  let firstMomentY = 0
  for (const solid of solids) {
    for (const ring of [solid.outer, ...solid.holes]) {
      const moments = ringSignedMoments(ring)
      area += moments.area
      firstMomentX += moments.firstMomentX
      firstMomentY += moments.firstMomentY
    }
  }
  const safeArea = Math.abs(area) > 1e-18 ? area : 1
  return {
    area,
    firstMomentX,
    firstMomentY,
    centroid: {
      x: firstMomentX / safeArea,
      y: firstMomentY / safeArea
    }
  }
}

const stableHash = (value: unknown) => {
  const source = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const pointInSolid = (point: Point2, solid: PreparedPolygonSolid, tolerance: number) =>
  pointInRing(point, solid.outer, tolerance) && !solid.holes.some((hole) => pointInRing(point, hole, tolerance))

export const pointInPreparedSection = (point: Point2, section: PreparedEquivalentBlockSection) => {
  const tolerance = BASE_TOLERANCE * Math.max(1, section.characteristicLength)
  return section.solids.some((solid) => pointInSolid(point, solid, tolerance))
}

export const prepareEquivalentBlockSection = (
  input: EquivalentBlockSection
): PreparedEquivalentBlockSection => {
  if (input.units !== 'N-mm-MPa' || input.signConvention !== 'compression-positive') {
    throw new EquivalentBlockInputError('INVALID_GEOMETRY', 'The kernel requires N-mm-MPa and compression-positive conventions.')
  }
  if (!finitePoint(input.referencePoint) || input.solids.length === 0) {
    throw new EquivalentBlockInputError('INVALID_GEOMETRY', 'A finite reference point and at least one concrete solid are required.')
  }

  const rawPoints = input.solids.flatMap((solid) => [solid.outer, ...(solid.holes ?? [])]).flat()
  const rawMinX = Math.min(...rawPoints.map((point) => point.x))
  const rawMaxX = Math.max(...rawPoints.map((point) => point.x))
  const rawMinY = Math.min(...rawPoints.map((point) => point.y))
  const rawMaxY = Math.max(...rawPoints.map((point) => point.y))
  const initialLength = Math.max(rawMaxX - rawMinX, rawMaxY - rawMinY, 1)
  const tolerance = BASE_TOLERANCE * initialLength

  const solids = input.solids.map((source): PreparedPolygonSolid => {
    const outer = orientRing(normalizeRing(source.outer, tolerance), true)
    assertSimpleRing(outer, tolerance)
    if (Math.abs(signedRingArea(outer)) <= tolerance * tolerance) {
      throw new EquivalentBlockInputError('INVALID_GEOMETRY', 'Concrete solids must have nonzero area.')
    }
    const holes = (source.holes ?? []).map((sourceHole) => {
      const hole = orientRing(normalizeRing(sourceHole, tolerance), false)
      assertSimpleRing(hole, tolerance)
      if (!pointInRing(hole[0], outer, tolerance) || ringsIntersect(hole, outer, tolerance)) {
        throw new EquivalentBlockInputError('INVALID_GEOMETRY', 'Every hole must lie strictly inside its concrete solid.')
      }
      return hole
    })
    for (let first = 0; first < holes.length; first += 1) {
      for (let second = first + 1; second < holes.length; second += 1) {
        if (
          ringsIntersect(holes[first], holes[second], tolerance) ||
          pointInRing(holes[first][0], holes[second], tolerance) ||
          pointInRing(holes[second][0], holes[first], tolerance)
        ) {
          throw new EquivalentBlockInputError('INVALID_GEOMETRY', 'Concrete holes must not overlap.')
        }
      }
    }
    return { outer, holes }
  })

  for (let first = 0; first < solids.length; first += 1) {
    for (let second = first + 1; second < solids.length; second += 1) {
      const left = solids[first]
      const right = solids[second]
      if (
        ringsIntersect(left.outer, right.outer, tolerance) ||
        pointInSolid(left.outer[0], right, tolerance) ||
        pointInSolid(right.outer[0], left, tolerance)
      ) {
        throw new EquivalentBlockInputError('INVALID_GEOMETRY', 'Concrete solids must not overlap.')
      }
    }
  }

  const moments = polygonSetMoments(solids)
  if (!(moments.area > tolerance * tolerance)) {
    throw new EquivalentBlockInputError('INVALID_GEOMETRY', 'Net concrete area must be positive.')
  }
  const allOuterPoints = solids.flatMap((solid) => solid.outer)
  const minX = Math.min(...allOuterPoints.map((point) => point.x))
  const maxX = Math.max(...allOuterPoints.map((point) => point.x))
  const minY = Math.min(...allOuterPoints.map((point) => point.y))
  const maxY = Math.max(...allOuterPoints.map((point) => point.y))
  const bounds = {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  }
  const characteristicLength = Math.max(bounds.width, bounds.height, 1)
  const ids = new Set<string>()
  const rebars = input.rebars.map((bar) => {
    if (ids.has(bar.id) || !Number.isFinite(bar.x) || !Number.isFinite(bar.y) || !(bar.area > 0) || !bar.steelLawId) {
      throw new EquivalentBlockInputError('INVALID_REBAR', 'Rebars require unique ids, finite coordinates, positive area, and a steel law id.')
    }
    ids.add(bar.id)
    return { ...bar }
  })

  const prepared: PreparedEquivalentBlockSection = {
    solids,
    rebars,
    referencePoint: { ...input.referencePoint },
    units: input.units,
    signConvention: input.signConvention,
    grossArea: moments.area,
    centroid: moments.centroid,
    bounds,
    characteristicLength,
    inputHash: ''
  }
  for (const bar of rebars) {
    if (!pointInPreparedSection(bar, prepared)) {
      throw new EquivalentBlockInputError('INVALID_REBAR', `Rebar ${bar.id} is outside concrete or inside a void.`)
    }
  }
  prepared.inputHash = stableHash({
    solids,
    rebars,
    referencePoint: prepared.referencePoint,
    units: prepared.units,
    signConvention: prepared.signConvention
  })
  return prepared
}

export const clipRingToHalfPlane = (
  ring: readonly Point2[],
  normalX: number,
  normalY: number,
  offset: number,
  tolerance: number
) => {
  const clipped: Point2[] = []
  const signedDistance = (point: Point2) => normalX * point.x + normalY * point.y - offset
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    const currentDistance = signedDistance(current)
    const nextDistance = signedDistance(next)
    const currentInside = currentDistance >= -tolerance
    const nextInside = nextDistance >= -tolerance
    if (currentInside) clipped.push({ ...current })
    if (currentInside !== nextInside) {
      const denominator = currentDistance - nextDistance
      const ratio = Math.abs(denominator) <= tolerance ? 0.5 : currentDistance / denominator
      clipped.push({
        x: current.x + (next.x - current.x) * ratio,
        y: current.y + (next.y - current.y) * ratio
      })
    }
  }
  const cleaned: Point2[] = []
  for (const point of clipped) {
    if (cleaned.length === 0 || distance(cleaned[cleaned.length - 1], point) > tolerance) cleaned.push(point)
  }
  if (cleaned.length > 1 && distance(cleaned[0], cleaned[cleaned.length - 1]) <= tolerance) cleaned.pop()
  return cleaned.length >= 3 ? cleaned : []
}

export const clipPreparedSectionToHalfPlane = (
  section: PreparedEquivalentBlockSection,
  normalX: number,
  normalY: number,
  offset: number
): { geometry: ClippedBlockSolid[]; moments: PolygonMoments } => {
  const tolerance = BASE_TOLERANCE * section.characteristicLength
  const geometry: ClippedBlockSolid[] = []
  for (const solid of section.solids) {
    const outer = clipRingToHalfPlane(solid.outer, normalX, normalY, offset, tolerance)
    if (outer.length < 3) continue
    const holes = solid.holes
      .map((hole) => clipRingToHalfPlane(hole, normalX, normalY, offset, tolerance))
      .filter((hole) => hole.length >= 3)
    geometry.push({ outer, holes })
  }
  const moments = polygonSetMoments(geometry)
  if (Math.abs(moments.area) <= tolerance * tolerance) {
    return {
      geometry: [],
      moments: { area: 0, firstMomentX: 0, firstMomentY: 0, centroid: { ...section.referencePoint } }
    }
  }
  return { geometry, moments }
}
