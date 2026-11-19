import type { PreviewSurfacePoint, SurfaceIndexTriangle } from '@pm/analysis'

/**
 * Build the same periodic beta/station topology used by the analysis kernel when a surface does not
 * already carry explicit triangle indices. The final beta row is deliberately connected to row 0.
 */
export const buildClosedSurfaceTriangles = (
  points: readonly PreviewSurfacePoint[]
): SurfaceIndexTriangle[] => {
  const rows = new Map<number, Array<{ index: number; station: number }>>()
  points.forEach((point, index) => {
    const row = rows.get(point.beta) ?? []
    row.push({ index, station: point.station })
    rows.set(point.beta, row)
  })
  const orderedRows = [...rows.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, row]) => row.sort((left, right) => left.station - right.station))

  if (orderedRows.length < 2) return []
  const referenceStations = orderedRows[0].map((point) => point.station)
  const structured = orderedRows.every((row) =>
    row.length === referenceStations.length &&
    row.every((point, index) => {
      const reference = referenceStations[index]
      return Math.abs(point.station - reference) <= 1e-12 * Math.max(1, Math.abs(reference))
    })
  )
  if (!structured) {
    throw new Error(
      'Explicit surface topology is required when direction rows have unequal or independently adaptive station schedules.'
    )
  }
  const triangles: SurfaceIndexTriangle[] = []
  for (let rowIndex = 0; rowIndex < orderedRows.length; rowIndex += 1) {
    const current = orderedRows[rowIndex]
    const next = orderedRows[(rowIndex + 1) % orderedRows.length]
    const stationCount = current.length
    for (let station = 0; station < stationCount - 1; station += 1) {
      const a = current[station].index
      const b = next[station].index
      const c = next[station + 1].index
      const d = current[station + 1].index
      triangles.push({ a, b, c }, { a, b: c, c: d })
    }
  }
  return triangles
}

/** Visible grid edges only: station direction (meridian) or beta direction (parallel). */
export const isMeridianOrParallelEdge = (
  points: readonly PreviewSurfacePoint[],
  leftIndex: number,
  rightIndex: number
) => {
  const left = points[leftIndex]
  const right = points[rightIndex]
  if (!left || !right) return false
  if (left.onSampledDirection === false || right.onSampledDirection === false) return false
  const directionNeutral = (point: PreviewSurfacePoint) =>
    point.surfaceRole === 'pure-compression' ||
    point.surfaceRole === 'pure-tension' ||
    (point.surfaceRole === 'axial-cap' && Math.hypot(point.Mx, point.My) <= 1e-9)
  const meridian = left.beta === right.beta ||
    (directionNeutral(left) !== directionNeutral(right) && (directionNeutral(left) || directionNeutral(right)))
  const parallel = left.stationId !== null && left.stationId === right.stationId
  const capBoundary = left.surfaceRole === 'axial-cap' && right.surfaceRole === 'axial-cap' &&
    !directionNeutral(left) && !directionNeutral(right)
  return meridian || parallel || capBoundary
}

/** A vertical-slice vertex between two numbered station levels. */
export const isIntermediateStationValue = (
  station: number | undefined,
  tolerance = 1e-6
) =>
  station !== undefined &&
  Number.isFinite(station) &&
  Math.abs(station - Math.round(station)) > tolerance

// Transitional re-export: all consumers now share the kernel implementation and its provenance.
export { buildDirectMeridianSection } from '@pm/analysis'

export type PlanarPoint = { u: number; v: number }

const signedArea = (points: readonly PlanarPoint[]) => {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.u * next.v - next.u * current.v
  }
  return area / 2
}

const cross = (a: PlanarPoint, b: PlanarPoint, c: PlanarPoint) =>
  (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u)

const pointInTriangle = (
  point: PlanarPoint,
  a: PlanarPoint,
  b: PlanarPoint,
  c: PlanarPoint,
  orientation: number,
  tolerance: number
) => {
  const ab = cross(a, b, point) * orientation
  const bc = cross(b, c, point) * orientation
  const ca = cross(c, a, point) * orientation
  return ab > tolerance && bc > tolerance && ca > tolerance
}

/** Ear-clipping triangulation keeps a concave plane section inside its true boundary. */
export const triangulatePlanarPolygon = (
  points: readonly PlanarPoint[]
): SurfaceIndexTriangle[] => {
  if (points.length < 3) return []
  const span = Math.max(
    Math.max(...points.map((point) => point.u)) - Math.min(...points.map((point) => point.u)),
    Math.max(...points.map((point) => point.v)) - Math.min(...points.map((point) => point.v)),
    1
  )
  const tolerance = span * span * 1e-12
  const area = signedArea(points)
  if (Math.abs(area) <= tolerance) return []
  const orientation = area > 0 ? 1 : -1
  const remaining = points.map((_, index) => index)
  const triangles: SurfaceIndexTriangle[] = []
  let guard = points.length * points.length

  while (remaining.length > 3 && guard > 0) {
    guard -= 1
    let clipped = false
    for (let cursor = 0; cursor < remaining.length; cursor += 1) {
      const previous = remaining[(cursor - 1 + remaining.length) % remaining.length]
      const current = remaining[cursor]
      const next = remaining[(cursor + 1) % remaining.length]
      if (cross(points[previous], points[current], points[next]) * orientation <= tolerance) continue
      const containsVertex = remaining.some((candidate) =>
        candidate !== previous &&
        candidate !== current &&
        candidate !== next &&
        pointInTriangle(
          points[candidate],
          points[previous],
          points[current],
          points[next],
          orientation,
          tolerance
        )
      )
      if (containsVertex) continue
      triangles.push({ a: previous, b: current, c: next })
      remaining.splice(cursor, 1)
      clipped = true
      break
    }
    if (clipped) continue

    // A redundant collinear boundary point can remain after clipping. Removing it changes no area.
    const collinear = remaining.findIndex((current, cursor) => {
      const previous = remaining[(cursor - 1 + remaining.length) % remaining.length]
      const next = remaining[(cursor + 1) % remaining.length]
      return Math.abs(cross(points[previous], points[current], points[next])) <= tolerance
    })
    if (collinear < 0) return []
    remaining.splice(collinear, 1)
  }

  if (remaining.length === 3) {
    triangles.push({ a: remaining[0], b: remaining[1], c: remaining[2] })
  }
  return triangles
}
