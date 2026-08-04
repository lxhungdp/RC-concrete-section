import type {
  BlockSectionState,
  CapacityResultants,
  PreparedEquivalentBlockSection
} from './types'
import { EquivalentBlockInputError } from './types'

export type CapacityEvaluation<TSource = unknown> = {
  resultants: CapacityResultants
  state: BlockSectionState
  source?: TSource
  metadata?: Record<string, unknown>
}

export type CapacityEndpoint = {
  resultants: CapacityResultants
  metadata?: Record<string, unknown>
}

export type CapacityEvaluator<TSource = unknown> = (
  state: BlockSectionState
) => CapacityEvaluation<TSource>

export type CapacityStation =
  | { type: 'extreme-tension-strain'; strain: number }
  | { type: 'depth-ratio'; ratio: number }

export type CapacitySurfacePoint = {
  id: number
  resultants: CapacityResultants
  state?: BlockSectionState
  kind: 'tension-pole' | 'state' | 'compression-pole' | 'axial-cap'
  metadata?: Record<string, unknown>
}

export type CapacitySurfaceTriangle = {
  a: number
  b: number
  c: number
}

export type CapacitySurfaceTopology = {
  closed: boolean
  boundaryEdges: number
  nonManifoldEdges: number
  degenerateTriangles: number
}

export type CapacitySurface = {
  points: CapacitySurfacePoint[]
  triangles: CapacitySurfaceTriangle[]
  directions: number[]
  stations: CapacityStation[]
  normalization: CapacityResultants
  maxDirectionalInterpolationError: number
  maxStationInterpolationError: number
  directionRefinementConverged: boolean
  stationRefinementConverged: boolean
  topology: CapacitySurfaceTopology
  axialCap?: number
}

export type BuildCapacitySurfaceOptions = {
  extremeCompressionStrain: number
  tensionPole: CapacityEndpoint
  compressionPole: CapacityEndpoint
  stations?: CapacityStation[]
  seedDirections?: number
  startAngle?: number
  directionTolerance?: number
  maxRefinementPasses?: number
  maxDirections?: number
  stationTolerance?: number
  maxStationRefinementPasses?: number
  maxStations?: number
  normalization?: Partial<CapacityResultants>
}

const TAU = Math.PI * 2

const wrapAngle = (angle: number) => {
  const wrapped = angle % TAU
  return wrapped < 0 ? wrapped + TAU : wrapped
}

const finiteResultants = (value: CapacityResultants) =>
  Number.isFinite(value.P) && Number.isFinite(value.Mx) && Number.isFinite(value.My)

export const createDefaultCapacityStations = (): CapacityStation[] => [
  { type: 'extreme-tension-strain', strain: 0.1 },
  { type: 'extreme-tension-strain', strain: 0.075 },
  { type: 'extreme-tension-strain', strain: 0.05 },
  { type: 'extreme-tension-strain', strain: 0.04 },
  { type: 'extreme-tension-strain', strain: 0.03 },
  { type: 'extreme-tension-strain', strain: 0.025 },
  { type: 'extreme-tension-strain', strain: 0.02 },
  { type: 'extreme-tension-strain', strain: 0.0175 },
  { type: 'extreme-tension-strain', strain: 0.015 },
  { type: 'extreme-tension-strain', strain: 0.0125 },
  { type: 'extreme-tension-strain', strain: 0.01 },
  { type: 'extreme-tension-strain', strain: 0.00875 },
  { type: 'extreme-tension-strain', strain: 0.0075 },
  { type: 'extreme-tension-strain', strain: 0.00625 },
  { type: 'extreme-tension-strain', strain: 0.005 },
  { type: 'extreme-tension-strain', strain: 0.004 },
  { type: 'extreme-tension-strain', strain: 0.003 },
  { type: 'extreme-tension-strain', strain: 0.0025 },
  { type: 'extreme-tension-strain', strain: 0.002 },
  { type: 'extreme-tension-strain', strain: 0.0015 },
  { type: 'extreme-tension-strain', strain: 0.001 },
  { type: 'extreme-tension-strain', strain: 0.0005 },
  { type: 'extreme-tension-strain', strain: 0 },
  { type: 'depth-ratio', ratio: 1.1 },
  { type: 'depth-ratio', ratio: 1.2 },
  { type: 'depth-ratio', ratio: 1.35 },
  { type: 'depth-ratio', ratio: 1.5 },
  { type: 'depth-ratio', ratio: 1.75 },
  { type: 'depth-ratio', ratio: 2 },
  { type: 'depth-ratio', ratio: 2.5 },
  { type: 'depth-ratio', ratio: 3 },
  { type: 'depth-ratio', ratio: 4 },
  { type: 'depth-ratio', ratio: 5 },
  { type: 'depth-ratio', ratio: 7.5 },
  { type: 'depth-ratio', ratio: 10 },
  { type: 'depth-ratio', ratio: 20 },
  { type: 'depth-ratio', ratio: 50 }
]

const projectedDepthAt = (section: PreparedEquivalentBlockSection, angle: number) => {
  const normalX = Math.cos(angle)
  const normalY = Math.sin(angle)
  const projections = section.solids.flatMap((solid) => solid.outer.map((point) => normalX * point.x + normalY * point.y))
  return Math.max(...projections) - Math.min(...projections)
}

const stationDepth = (
  station: CapacityStation,
  projectedDepth: number,
  extremeCompressionStrain: number
) => station.type === 'depth-ratio'
  ? projectedDepth * station.ratio
  : projectedDepth / (1 + station.strain / extremeCompressionStrain)

const stationDepthRatio = (station: CapacityStation, extremeCompressionStrain: number) =>
  station.type === 'depth-ratio'
    ? station.ratio
    : 1 / (1 + station.strain / extremeCompressionStrain)

const capacityScales = (
  evaluations: CapacityEvaluation[][],
  endpoints: CapacityEndpoint[],
  requested?: Partial<CapacityResultants>
): CapacityResultants => {
  const values = [
    ...evaluations.flatMap((direction) => direction.map((evaluation) => evaluation.resultants)),
    ...endpoints.map((endpoint) => endpoint.resultants)
  ]
  const scale = (key: keyof CapacityResultants) =>
    requested?.[key] && requested[key]! > 0
      ? requested[key]!
      : Math.max(1, ...values.map((value) => Math.abs(value[key])))
  return { P: scale('P'), Mx: scale('Mx'), My: scale('My') }
}

const normalizedDistance = (
  left: CapacityResultants,
  right: CapacityResultants,
  scale: CapacityResultants
) => Math.hypot(
  (left.P - right.P) / scale.P,
  (left.Mx - right.Mx) / scale.Mx,
  (left.My - right.My) / scale.My
)

const midpointResultants = (left: CapacityResultants, right: CapacityResultants): CapacityResultants => ({
  P: (left.P + right.P) / 2,
  Mx: (left.Mx + right.Mx) / 2,
  My: (left.My + right.My) / 2
})

const normalizedPointToSegmentDistance = (
  point: CapacityResultants,
  left: CapacityResultants,
  right: CapacityResultants,
  scale: CapacityResultants
) => {
  const p = { P: point.P / scale.P, Mx: point.Mx / scale.Mx, My: point.My / scale.My }
  const a = { P: left.P / scale.P, Mx: left.Mx / scale.Mx, My: left.My / scale.My }
  const b = { P: right.P / scale.P, Mx: right.Mx / scale.Mx, My: right.My / scale.My }
  const ab = { P: b.P - a.P, Mx: b.Mx - a.Mx, My: b.My - a.My }
  const ap = { P: p.P - a.P, Mx: p.Mx - a.Mx, My: p.My - a.My }
  const denominator = ab.P ** 2 + ab.Mx ** 2 + ab.My ** 2
  const parameter = denominator <= 1e-30
    ? 0
    : Math.max(0, Math.min(1, (ap.P * ab.P + ap.Mx * ab.Mx + ap.My * ab.My) / denominator))
  return Math.hypot(
    ap.P - parameter * ab.P,
    ap.Mx - parameter * ab.Mx,
    ap.My - parameter * ab.My
  )
}

const triangleNormal = (
  triangle: CapacitySurfaceTriangle,
  points: CapacitySurfacePoint[]
) => {
  const a = points[triangle.a].resultants
  const b = points[triangle.b].resultants
  const c = points[triangle.c].resultants
  const ab = { P: b.P - a.P, Mx: b.Mx - a.Mx, My: b.My - a.My }
  const ac = { P: c.P - a.P, Mx: c.Mx - a.Mx, My: c.My - a.My }
  return {
    P: ab.Mx * ac.My - ab.My * ac.Mx,
    Mx: ab.My * ac.P - ab.P * ac.My,
    My: ab.P * ac.Mx - ab.Mx * ac.P
  }
}

const orientTrianglesOutward = (
  triangles: CapacitySurfaceTriangle[],
  points: CapacitySurfacePoint[]
) => {
  const center = points.reduce((sum, point) => ({
    P: sum.P + point.resultants.P / points.length,
    Mx: sum.Mx + point.resultants.Mx / points.length,
    My: sum.My + point.resultants.My / points.length
  }), { P: 0, Mx: 0, My: 0 })
  return triangles.map((triangle) => {
    const normal = triangleNormal(triangle, points)
    const a = points[triangle.a].resultants
    const b = points[triangle.b].resultants
    const c = points[triangle.c].resultants
    const triangleCenter = {
      P: (a.P + b.P + c.P) / 3,
      Mx: (a.Mx + b.Mx + c.Mx) / 3,
      My: (a.My + b.My + c.My) / 3
    }
    const outward =
      normal.P * (triangleCenter.P - center.P) +
      normal.Mx * (triangleCenter.Mx - center.Mx) +
      normal.My * (triangleCenter.My - center.My)
    return outward >= 0 ? triangle : { a: triangle.a, b: triangle.c, c: triangle.b }
  })
}

export const evaluateSurfaceTopology = (
  points: CapacitySurfacePoint[],
  triangles: CapacitySurfaceTriangle[]
): CapacitySurfaceTopology => {
  const edges = new Map<string, number>()
  let degenerateTriangles = 0
  for (const triangle of triangles) {
    const normal = triangleNormal(triangle, points)
    const normalLength = Math.hypot(normal.P, normal.Mx, normal.My)
    if (triangle.a === triangle.b || triangle.b === triangle.c || triangle.c === triangle.a || normalLength <= 1e-12) {
      degenerateTriangles += 1
    }
    for (const [left, right] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]]) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
  }
  const boundaryEdges = [...edges.values()].filter((count) => count === 1).length
  const nonManifoldEdges = [...edges.values()].filter((count) => count > 2).length
  return {
    closed: boundaryEdges === 0 && nonManifoldEdges === 0,
    boundaryEdges,
    nonManifoldEdges,
    degenerateTriangles
  }
}

export const buildCapacitySurface = <TSource>(
  section: PreparedEquivalentBlockSection,
  evaluator: CapacityEvaluator<TSource>,
  options: BuildCapacitySurfaceOptions
): CapacitySurface => {
  if (!(options.extremeCompressionStrain > 0) || !finiteResultants(options.tensionPole.resultants) || !finiteResultants(options.compressionPole.resultants)) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'Surface endpoints and extreme compression strain must be valid.')
  }
  let stations = [...(options.stations ?? createDefaultCapacityStations())]
  if (stations.length < 2) throw new EquivalentBlockInputError('SOLVER_INPUT', 'At least two interior capacity stations are required.')
  for (const station of stations) {
    const value = station.type === 'depth-ratio' ? station.ratio : station.strain
    if (!Number.isFinite(value) || value < 0 || (station.type === 'depth-ratio' && value <= 0)) {
      throw new EquivalentBlockInputError('SOLVER_INPUT', 'Capacity stations must be finite and nonnegative.')
    }
  }
  for (let index = 1; index < stations.length; index += 1) {
    if (
      stationDepthRatio(stations[index], options.extremeCompressionStrain) <=
      stationDepthRatio(stations[index - 1], options.extremeCompressionStrain)
    ) {
      throw new EquivalentBlockInputError('SOLVER_INPUT', 'Capacity stations must be ordered by strictly increasing neutral-axis depth.')
    }
  }

  const seedDirections = Math.max(4, Math.round(options.seedDirections ?? 24))
  const startAngle = wrapAngle(options.startAngle ?? 0)
  let directions = Array.from({ length: seedDirections }, (_, index) => wrapAngle(startAngle + TAU * index / seedDirections))
    .sort((left, right) => left - right)
  const cache = new Map<string, CapacityEvaluation<TSource>[]>()
  const evaluateStation = (angle: number, station: CapacityStation) => {
    const wrapped = wrapAngle(angle)
    const evaluation = evaluator({
      neutralAxisAngle: wrapped,
      neutralAxisDepth: stationDepth(station, projectedDepthAt(section, wrapped), options.extremeCompressionStrain)
    })
    if (!finiteResultants(evaluation.resultants)) {
      throw new EquivalentBlockInputError('SOLVER_INPUT', 'The capacity evaluator returned non-finite resultants.')
    }
    return evaluation
  }
  const evaluateDirection = (angle: number) => {
    const wrapped = wrapAngle(angle)
    const key = wrapped.toPrecision(15)
    const cached = cache.get(key)
    if (cached) return cached
    const evaluations = stations.map((station) => evaluateStation(wrapped, station))
    cache.set(key, evaluations)
    return evaluations
  }
  directions.forEach(evaluateDirection)
  let scales = capacityScales([...cache.values()], [options.tensionPole, options.compressionPole], options.normalization)
  const stationTolerance = Math.max(0, options.stationTolerance ?? 0.01)
  const maxStationPasses = Math.max(0, Math.round(options.maxStationRefinementPasses ?? 5))
  const maxStations = Math.max(stations.length, Math.round(options.maxStations ?? 128))
  const stationIntervals = () => Array.from({ length: stations.length + 1 }, (_, intervalIndex) => {
    const leftStation = intervalIndex === 0 ? undefined : stations[intervalIndex - 1]
    const rightStation = intervalIndex === stations.length ? undefined : stations[intervalIndex]
    const leftRatio = leftStation ? stationDepthRatio(leftStation, options.extremeCompressionStrain) : 0
    const rightRatio = rightStation ? stationDepthRatio(rightStation, options.extremeCompressionStrain) : Number.POSITIVE_INFINITY
    const ratio = !leftStation
      ? rightRatio / 2
      : !rightStation
        ? leftRatio * 2
        : Math.sqrt(leftRatio * rightRatio)
    return {
      intervalIndex,
      station: { type: 'depth-ratio' as const, ratio },
      leftStation,
      rightStation
    }
  })
  const stationIntervalError = (
    interval: ReturnType<typeof stationIntervals>[number],
    angles: number[]
  ) => {
    let error = 0
    for (const angle of angles) {
      const evaluations = evaluateDirection(angle)
      const left = interval.leftStation
        ? evaluations[interval.intervalIndex - 1].resultants
        : options.tensionPole.resultants
      const right = interval.rightStation
        ? evaluations[interval.intervalIndex].resultants
        : options.compressionPole.resultants
      const middle = evaluateStation(angle, interval.station).resultants
      error = Math.max(error, normalizedPointToSegmentDistance(middle, left, right, scales))
    }
    return error
  }
  const tolerance = Math.max(0, options.directionTolerance ?? 0.01)
  const maxPasses = Math.max(0, Math.round(options.maxRefinementPasses ?? 8))
  const maxDirections = Math.max(seedDirections, Math.round(options.maxDirections ?? 360))
  let stationPasses = 0
  let directionPasses = 0

  const refineStationsOnce = () => {
    if (stationPasses >= maxStationPasses || stations.length >= maxStations) return false
    const inserts = stationIntervals().map((interval) => ({
      station: interval.station,
      error: stationIntervalError(interval, directions)
    })).filter((entry) => entry.error > stationTolerance)
    if (inserts.length === 0) return false
    inserts.sort((left, right) => right.error - left.error)
    const selected = inserts.slice(0, maxStations - stations.length).map((entry) => entry.station)
    if (selected.length === 0) return false
    stationPasses += 1
    stations = [...stations, ...selected]
      .sort((left, right) =>
        stationDepthRatio(left, options.extremeCompressionStrain) -
        stationDepthRatio(right, options.extremeCompressionStrain)
      )
      .filter((station, index, values) => index === 0 || Math.abs(
        Math.log(
          stationDepthRatio(station, options.extremeCompressionStrain) /
          stationDepthRatio(values[index - 1], options.extremeCompressionStrain)
        )
      ) > 1e-12)
    cache.clear()
    directions.forEach(evaluateDirection)
    scales = capacityScales([...cache.values()], [options.tensionPole, options.compressionPole], options.normalization)
    return true
  }

  const refineDirectionsOnce = () => {
    if (directionPasses >= maxPasses || directions.length >= maxDirections) return false
    const inserts: Array<{ angle: number; error: number }> = []
    for (let index = 0; index < directions.length; index += 1) {
      const leftAngle = directions[index]
      const rightAngle = index === directions.length - 1 ? directions[0] + TAU : directions[index + 1]
      const midAngle = wrapAngle((leftAngle + rightAngle) / 2)
      const left = evaluateDirection(leftAngle)
      const right = evaluateDirection(rightAngle)
      const middle = evaluateDirection(midAngle)
      let error = 0
      for (let stationIndex = 0; stationIndex < stations.length; stationIndex += 1) {
        error = Math.max(error, normalizedDistance(
          middle[stationIndex].resultants,
          midpointResultants(left[stationIndex].resultants, right[stationIndex].resultants),
          scales
        ))
      }
      if (error > tolerance) inserts.push({ angle: midAngle, error })
    }
    if (inserts.length === 0) return false
    inserts.sort((left, right) => right.error - left.error)
    const available = maxDirections - directions.length
    if (available === 0) return false
    directionPasses += 1
    directions = [...directions, ...inserts.slice(0, available).map((insert) => insert.angle)]
      .sort((left, right) => left - right)
      .filter((angle, index, values) => index === 0 || Math.abs(angle - values[index - 1]) > 1e-12)
    scales = capacityScales(directions.map(evaluateDirection), [options.tensionPole, options.compressionPole], options.normalization)
    return true
  }

  // Refinement is coupled: new angular samples can expose a station interval that
  // was benign at the previous directions, while new stations can expose angular
  // curvature. Alternate the two coordinates instead of refining them only once.
  while (true) {
    const stationsChanged = refineStationsOnce()
    const directionsChanged = refineDirectionsOnce()
    if (!stationsChanged && !directionsChanged) break
  }

  let maxDirectionalInterpolationError = 0
  for (let index = 0; index < directions.length; index += 1) {
    const leftAngle = directions[index]
    const rightAngle = index === directions.length - 1 ? directions[0] + TAU : directions[index + 1]
    const left = evaluateDirection(leftAngle)
    const right = evaluateDirection(rightAngle)
    const middle = evaluateDirection(wrapAngle((leftAngle + rightAngle) / 2))
    for (let stationIndex = 0; stationIndex < stations.length; stationIndex += 1) {
      maxDirectionalInterpolationError = Math.max(maxDirectionalInterpolationError, normalizedDistance(
        middle[stationIndex].resultants,
        midpointResultants(left[stationIndex].resultants, right[stationIndex].resultants),
        scales
      ))
    }
  }

  let maxStationInterpolationError = 0
  for (const interval of stationIntervals()) {
    maxStationInterpolationError = Math.max(
      maxStationInterpolationError,
      stationIntervalError(interval, directions)
    )
  }

  const meshEqualityTolerance = 1e-11
  const activeStationIndices: number[] = []
  for (let stationIndex = 0; stationIndex < stations.length; stationIndex += 1) {
    const layer = directions.map((angle) => evaluateDirection(angle)[stationIndex].resultants)
    const equalsCompressionPole = layer.every((resultants) =>
      normalizedDistance(resultants, options.compressionPole.resultants, scales) <= meshEqualityTolerance
    )
    if (equalsCompressionPole) continue
    const previousIndex = activeStationIndices.at(-1)
    const equalsPreviousLayer = previousIndex === undefined
      ? layer.every((resultants) =>
        normalizedDistance(resultants, options.tensionPole.resultants, scales) <= meshEqualityTolerance
      )
      : layer.every((resultants, directionIndex) => normalizedDistance(
        resultants,
        evaluateDirection(directions[directionIndex])[previousIndex].resultants,
        scales
      ) <= meshEqualityTolerance)
    if (!equalsPreviousLayer) activeStationIndices.push(stationIndex)
  }
  if (activeStationIndices.length === 0) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'All interior capacity stations collapsed onto the supplied endpoints.')
  }
  const activeStations = activeStationIndices.map((index) => stations[index])

  const points: CapacitySurfacePoint[] = [{
    id: 0,
    resultants: { ...options.tensionPole.resultants },
    kind: 'tension-pole',
    metadata: options.tensionPole.metadata
  }]
  const grid: number[][] = []
  for (const angle of directions) {
    const evaluations = evaluateDirection(angle)
    const row = activeStationIndices.map((stationIndex) => {
      const evaluation = evaluations[stationIndex]
      const id = points.length
      points.push({
        id,
        resultants: { ...evaluation.resultants },
        state: { ...evaluation.state },
        kind: 'state',
        metadata: evaluation.metadata
      })
      return id
    })
    grid.push(row)
  }
  const compressionPoleIndex = points.length
  points.push({
    id: compressionPoleIndex,
    resultants: { ...options.compressionPole.resultants },
    kind: 'compression-pole',
    metadata: options.compressionPole.metadata
  })

  const triangles: CapacitySurfaceTriangle[] = []
  for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
    const nextDirection = (directionIndex + 1) % directions.length
    triangles.push({ a: 0, b: grid[directionIndex][0], c: grid[nextDirection][0] })
    for (let stationIndex = 0; stationIndex < activeStations.length - 1; stationIndex += 1) {
      const lowerLeft = grid[directionIndex][stationIndex]
      const lowerRight = grid[nextDirection][stationIndex]
      const upperLeft = grid[directionIndex][stationIndex + 1]
      const upperRight = grid[nextDirection][stationIndex + 1]
      triangles.push({ a: lowerLeft, b: upperLeft, c: upperRight })
      triangles.push({ a: lowerLeft, b: upperRight, c: lowerRight })
    }
    triangles.push({
      a: grid[directionIndex][activeStations.length - 1],
      b: compressionPoleIndex,
      c: grid[nextDirection][activeStations.length - 1]
    })
  }
  const oriented = orientTrianglesOutward(triangles, points)
  const topology = evaluateSurfaceTopology(points, oriented)
  return {
    points,
    triangles: oriented,
    directions,
    stations: activeStations,
    normalization: scales,
    maxDirectionalInterpolationError,
    maxStationInterpolationError,
    directionRefinementConverged: maxDirectionalInterpolationError <= tolerance,
    stationRefinementConverged: maxStationInterpolationError <= stationTolerance,
    topology
  }
}

const normalizedPoint = (resultants: CapacityResultants, scale: CapacityResultants) => ({
  P: resultants.P / scale.P,
  Mx: resultants.Mx / scale.Mx,
  My: resultants.My / scale.My
})

const cross3 = (left: CapacityResultants, right: CapacityResultants): CapacityResultants => ({
  P: left.Mx * right.My - left.My * right.Mx,
  Mx: left.My * right.P - left.P * right.My,
  My: left.P * right.Mx - left.Mx * right.P
})

const dot3 = (left: CapacityResultants, right: CapacityResultants) =>
  left.P * right.P + left.Mx * right.Mx + left.My * right.My

export type SurfaceRayIntersection = {
  loadFactor: number
  triangleIndex: number
  barycentric: [number, number, number]
  point: CapacityResultants
}

export const intersectCapacitySurfaceWithRay = (
  surface: CapacitySurface,
  demand: CapacityResultants,
  tolerance = 1e-10
): SurfaceRayIntersection | null => {
  if (!finiteResultants(demand) || Math.hypot(demand.P, demand.Mx, demand.My) <= tolerance) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'A nonzero finite demand vector is required.')
  }
  const direction = normalizedPoint(demand, surface.normalization)
  let best: SurfaceRayIntersection | null = null
  for (let triangleIndex = 0; triangleIndex < surface.triangles.length; triangleIndex += 1) {
    const triangle = surface.triangles[triangleIndex]
    const a = normalizedPoint(surface.points[triangle.a].resultants, surface.normalization)
    const b = normalizedPoint(surface.points[triangle.b].resultants, surface.normalization)
    const c = normalizedPoint(surface.points[triangle.c].resultants, surface.normalization)
    const edge1 = { P: b.P - a.P, Mx: b.Mx - a.Mx, My: b.My - a.My }
    const edge2 = { P: c.P - a.P, Mx: c.Mx - a.Mx, My: c.My - a.My }
    const h = cross3(direction, edge2)
    const determinant = dot3(edge1, h)
    if (Math.abs(determinant) <= tolerance) continue
    const inverse = 1 / determinant
    const s = { P: -a.P, Mx: -a.Mx, My: -a.My }
    const u = inverse * dot3(s, h)
    if (u < -tolerance || u > 1 + tolerance) continue
    const q = cross3(s, edge1)
    const v = inverse * dot3(direction, q)
    if (v < -tolerance || u + v > 1 + tolerance) continue
    const loadFactor = inverse * dot3(edge2, q)
    if (!(loadFactor > tolerance) || (best && loadFactor >= best.loadFactor)) continue
    const w = 1 - u - v
    best = {
      loadFactor,
      triangleIndex,
      barycentric: [w, u, v],
      point: {
        P: demand.P * loadFactor,
        Mx: demand.Mx * loadFactor,
        My: demand.My * loadFactor
      }
    }
  }
  return best
}

const signedAreaInMomentPlane = (indices: number[], points: CapacitySurfacePoint[]) => {
  let area = 0
  for (let index = 0; index < indices.length; index += 1) {
    const current = points[indices[index]].resultants
    const next = points[indices[(index + 1) % indices.length]].resultants
    area += current.Mx * next.My - next.Mx * current.My
  }
  return area / 2
}

const pointInMomentTriangle = (
  point: CapacityResultants,
  a: CapacityResultants,
  b: CapacityResultants,
  c: CapacityResultants,
  tolerance: number
) => {
  const cross2 = (p: CapacityResultants, q: CapacityResultants, r: CapacityResultants) =>
    (q.Mx - p.Mx) * (r.My - p.My) - (q.My - p.My) * (r.Mx - p.Mx)
  const ab = cross2(a, b, point)
  const bc = cross2(b, c, point)
  const ca = cross2(c, a, point)
  return ab >= -tolerance && bc >= -tolerance && ca >= -tolerance
}

const triangulateCapLoop = (
  source: number[],
  points: CapacitySurfacePoint[],
  tolerance: number
): CapacitySurfaceTriangle[] => {
  const loop = signedAreaInMomentPlane(source, points) >= 0 ? [...source] : [...source].reverse()
  const remaining = [...loop]
  const triangles: CapacitySurfaceTriangle[] = []
  let guard = 0
  while (remaining.length > 3 && guard < loop.length * loop.length) {
    let clipped = false
    for (let index = 0; index < remaining.length; index += 1) {
      const previousIndex = remaining[(index - 1 + remaining.length) % remaining.length]
      const currentIndex = remaining[index]
      const nextIndex = remaining[(index + 1) % remaining.length]
      const previous = points[previousIndex].resultants
      const current = points[currentIndex].resultants
      const next = points[nextIndex].resultants
      const convex =
        (current.Mx - previous.Mx) * (next.My - current.My) -
        (current.My - previous.My) * (next.Mx - current.Mx)
      if (convex <= tolerance) continue
      const contains = remaining.some((candidateIndex) =>
        candidateIndex !== previousIndex && candidateIndex !== currentIndex && candidateIndex !== nextIndex &&
        pointInMomentTriangle(points[candidateIndex].resultants, previous, current, next, tolerance)
      )
      if (contains) continue
      triangles.push({ a: previousIndex, b: currentIndex, c: nextIndex })
      remaining.splice(index, 1)
      clipped = true
      break
    }
    if (!clipped) break
    guard += 1
  }
  if (remaining.length === 3) triangles.push({ a: remaining[0], b: remaining[1], c: remaining[2] })
  if (triangles.length !== loop.length - 2) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'The axial-cap contour could not be triangulated reliably.')
  }
  return triangles
}

export const clipCapacitySurfaceByAxialCap = (
  surface: CapacitySurface,
  axialCap: number,
  tolerance = 1e-9
): CapacitySurface => {
  if (!Number.isFinite(axialCap)) throw new EquivalentBlockInputError('SOLVER_INPUT', 'Axial cap must be finite.')
  const maximum = Math.max(...surface.points.map((point) => point.resultants.P))
  const minimum = Math.min(...surface.points.map((point) => point.resultants.P))
  const absoluteTolerance = tolerance * Math.max(1, Math.abs(maximum), Math.abs(minimum), Math.abs(axialCap))
  if (axialCap >= maximum - absoluteTolerance) return { ...surface, axialCap }
  if (axialCap <= minimum + absoluteTolerance) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'Axial cap must lie above the tension end of the surface.')
  }

  const points: CapacitySurfacePoint[] = []
  const oldPointMap = new Map<number, number>()
  const edgeIntersectionMap = new Map<string, number>()
  const mappedOldPoint = (oldIndex: number) => {
    const existing = oldPointMap.get(oldIndex)
    if (existing !== undefined) return existing
    const old = surface.points[oldIndex]
    const id = points.length
    const onCap = Math.abs(old.resultants.P - axialCap) <= absoluteTolerance
    points.push({
      ...old,
      id,
      resultants: { ...old.resultants, ...(onCap ? { P: axialCap } : {}) },
      ...(onCap ? { state: undefined, kind: 'axial-cap' as const } : {})
    })
    oldPointMap.set(oldIndex, id)
    return id
  }
  const intersectionPoint = (leftIndex: number, rightIndex: number) => {
    const key = leftIndex < rightIndex ? `${leftIndex}:${rightIndex}` : `${rightIndex}:${leftIndex}`
    const existing = edgeIntersectionMap.get(key)
    if (existing !== undefined) return existing
    const left = surface.points[leftIndex].resultants
    const right = surface.points[rightIndex].resultants
    const denominator = right.P - left.P
    const ratio = Math.abs(denominator) <= absoluteTolerance ? 0.5 : (axialCap - left.P) / denominator
    const id = points.length
    points.push({
      id,
      resultants: {
        P: axialCap,
        Mx: left.Mx + (right.Mx - left.Mx) * ratio,
        My: left.My + (right.My - left.My) * ratio
      },
      kind: 'axial-cap'
    })
    edgeIntersectionMap.set(key, id)
    return id
  }

  const triangles: CapacitySurfaceTriangle[] = []
  const capSegments: Array<[number, number]> = []
  for (const triangle of surface.triangles) {
    const original = [triangle.a, triangle.b, triangle.c]
    const clipped: number[] = []
    for (let index = 0; index < original.length; index += 1) {
      const currentIndex = original[index]
      const nextIndex = original[(index + 1) % original.length]
      const current = surface.points[currentIndex]
      const next = surface.points[nextIndex]
      const currentInside = current.resultants.P <= axialCap + absoluteTolerance
      const nextInside = next.resultants.P <= axialCap + absoluteTolerance
      if (currentInside) clipped.push(mappedOldPoint(currentIndex))
      if (currentInside !== nextInside) clipped.push(intersectionPoint(currentIndex, nextIndex))
    }
    const clean = clipped.filter((value, index, values) => index === 0 || value !== values[index - 1])
    if (clean.length > 1 && clean[0] === clean[clean.length - 1]) clean.pop()
    if (clean.length >= 3) {
      for (let index = 1; index < clean.length - 1; index += 1) {
        triangles.push({ a: clean[0], b: clean[index], c: clean[index + 1] })
      }
      const capVertices = [...new Set(clean.filter((pointIndex) =>
        Math.abs(points[pointIndex].resultants.P - axialCap) <= absoluteTolerance
      ))]
      if (capVertices.length === 2 && capVertices[0] !== capVertices[1]) capSegments.push([capVertices[0], capVertices[1]])
    }
  }

  const adjacency = new Map<number, number[]>()
  for (const [left, right] of capSegments) {
    adjacency.set(left, [...(adjacency.get(left) ?? []), right])
    adjacency.set(right, [...(adjacency.get(right) ?? []), left])
  }
  const unusedEdges = new Set(capSegments.map(([left, right]) => left < right ? `${left}:${right}` : `${right}:${left}`))
  const loops: number[][] = []
  while (unusedEdges.size > 0) {
    const firstEdge = unusedEdges.values().next().value as string
    const [start, nextStart] = firstEdge.split(':').map(Number)
    const loop = [start]
    let previous = start
    let current = nextStart
    unusedEdges.delete(firstEdge)
    let guard = 0
    while (current !== start && guard <= adjacency.size + 1) {
      loop.push(current)
      const candidates = adjacency.get(current) ?? []
      const next = candidates.find((candidate) => {
        if (candidate === previous) return false
        const key = current < candidate ? `${current}:${candidate}` : `${candidate}:${current}`
        return unusedEdges.has(key)
      })
      if (next === undefined) break
      const key = current < next ? `${current}:${next}` : `${next}:${current}`
      unusedEdges.delete(key)
      previous = current
      current = next
      guard += 1
    }
    if (current !== start || loop.length < 3) {
      throw new EquivalentBlockInputError('SOLVER_INPUT', 'Axial-cap intersection did not form a closed contour.')
    }
    loops.push(loop)
  }
  for (const loop of loops) triangles.push(...triangulateCapLoop(loop, points, absoluteTolerance))
  const oriented = orientTrianglesOutward(triangles, points)
  return {
    ...surface,
    points,
    triangles: oriented,
    topology: evaluateSurfaceTopology(points, oriented),
    axialCap
  }
}
