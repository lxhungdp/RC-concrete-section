import type {
  BlockSectionState,
  CapacityResultants,
  PreparedEquivalentBlockSection,
  SteelLawRegistry
} from './types'
import { EquivalentBlockInputError } from './types'
import { projectedOuterExtents } from './geometry'
import { UNIFIED_DEPTH_RATIOS, UNIFIED_STEEL_STRAIN_YIELD_RATIOS } from '@pm/stations'

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
  | { type: 'bar-tension-strain'; strain: number }
  | { type: 'bar-tension-yield-ratio'; ratio: number }
  | { type: 'depth-ratio'; ratio: number }
  | { type: 'cover-gap-ratio'; ratio: number }
  | { type: 'tension-depth-ratio'; from: CapacityStation; ratio: number }
  | { type: 'adaptive-depth-interpolation'; left: CapacityStation; right: CapacityStation; ratio: number }

export type CapacitySurfacePoint = {
  id: number
  resultants: CapacityResultants
  state?: BlockSectionState
  /** Source station for physical state points; absent for poles and synthetic cap points. */
  station?: CapacityStation
  /** Monotone neutral-axis coordinate used to stitch unequal independent rows. */
  stationCoordinate?: number
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
  /** Exact neutral-axis midpoint direction governing the reported directional chord error. */
  worstDirection?: number
  maxStationInterpolationError: number
  directionRefinementPasses: number
  stationRefinementPasses: number
  directionRefinementConverged: boolean
  stationRefinementConverged: boolean
  minStationsPerDirection?: number
  maxStationsPerDirection?: number
  averageStationsPerDirection?: number
  evaluationCount?: number
  topology: CapacitySurfaceTopology
  axialCap?: number
}

export type BuildCapacitySurfaceOptions<TSource = unknown> = {
  samplingMode?: 'fixed' | 'adaptive'
  extremeCompressionStrain: number
  tensionPole: CapacityEndpoint
  compressionPole: CapacityEndpoint
  stations?: CapacityStation[]
  /** Exact geometry/material events that must split adaptive intervals but are not user-fixed stations. */
  adaptiveStationEvents?: readonly CapacityStation[]
  seedDirections?: number
  startAngle?: number
  directionTolerance?: number
  maxRefinementPasses?: number
  maxDirections?: number
  stationTolerance?: number
  maxStationRefinementPasses?: number
  maxStations?: number
  normalization?: Partial<CapacityResultants>
  /** Enables bar-based strain stations and clamps them to declared rupture limits. */
  steelLaws?: SteelLawRegistry
  /** Mandatory material-event layers evaluated against the actual extreme bar. */
  barStrainEvents?: readonly number[]
  /** Optional component ledger used to prevent concrete/steel cancellation in adaptive checks. */
  componentResultants?: (evaluation: CapacityEvaluation<TSource>) => CapacityResultants[]
  /** Optional exact directions used to audit station interpolation instead of the full surface. */
  stationProbeAngles?: readonly number[]
}

const TAU = Math.PI * 2

const wrapAngle = (angle: number) => {
  const wrapped = angle % TAU
  return wrapped < 0 ? wrapped + TAU : wrapped
}

const finiteResultants = (value: CapacityResultants) =>
  Number.isFinite(value.P) && Number.isFinite(value.Mx) && Number.isFinite(value.My)

export const createDefaultCapacityStations = (): CapacityStation[] => [
  ...[...UNIFIED_STEEL_STRAIN_YIELD_RATIOS].reverse().map((ratio) => ({
    type: 'bar-tension-yield-ratio' as const,
    ratio
  })),
  ...[...UNIFIED_DEPTH_RATIOS].reverse().map((ratio) => ({ type: 'depth-ratio' as const, ratio }))
]

export const capacityStationDepth = (
  station: CapacityStation,
  projectedDepth: number,
  extremeCompressionStrain: number,
  barDepths?: Array<{ depth: number; yieldStrain?: number; ultimateStrain?: number }>
): number => {
  if (station.type === 'depth-ratio') return projectedDepth * station.ratio
  const controllingBar = barDepths?.reduce<(typeof barDepths)[number] | undefined>(
    (current, bar) => !current || bar.depth > current.depth ? bar : current,
    undefined
  )
  if (station.type === 'cover-gap-ratio') {
    const barDepth = controllingBar?.depth ?? projectedDepth
    return projectedDepth + station.ratio * (barDepth - projectedDepth)
  }
  if (station.type === 'tension-depth-ratio') {
    return capacityStationDepth(
      station.from,
      projectedDepth,
      extremeCompressionStrain,
      barDepths
    ) * station.ratio
  }
  if (station.type === 'adaptive-depth-interpolation') {
    const left = capacityStationDepth(station.left, projectedDepth, extremeCompressionStrain, barDepths)
    const right = capacityStationDepth(station.right, projectedDepth, extremeCompressionStrain, barDepths)
    return left + (right - left) * station.ratio
  }
  return (() => {
      const controllingBarDepth =
        (station.type === 'bar-tension-strain' || station.type === 'bar-tension-yield-ratio') && controllingBar
        ? controllingBar.depth
        : projectedDepth
      const strain = station.type === 'bar-tension-yield-ratio'
        ? station.ratio * (controllingBar?.yieldStrain ?? 0.002)
        : station.strain
      const requestedDepth = controllingBarDepth / (1 + strain / extremeCompressionStrain)
      const ruptureDepth = (barDepths ?? []).reduce((minimum, bar) => bar.ultimateStrain === undefined
        ? minimum
        : Math.max(minimum, bar.depth / (1 + bar.ultimateStrain / extremeCompressionStrain)), 0)
      return Math.max(requestedDepth, ruptureDepth)
    })()
}

const stationDepthRatio = (station: CapacityStation, extremeCompressionStrain: number): number =>
  station.type === 'depth-ratio'
    ? station.ratio
    : station.type === 'bar-tension-yield-ratio'
      ? (1 / (1 + station.ratio * 0.002 / extremeCompressionStrain)) * (station.ratio === 0 ? 1 - 1e-9 : 1)
      : station.type === 'cover-gap-ratio'
        ? 1 + (station.ratio - 1) * 1e-3
        : station.type === 'tension-depth-ratio'
          ? stationDepthRatio(station.from, extremeCompressionStrain) * station.ratio
          : station.type === 'adaptive-depth-interpolation'
            ? stationDepthRatio(station.left, extremeCompressionStrain) +
              (stationDepthRatio(station.right, extremeCompressionStrain) -
                stationDepthRatio(station.left, extremeCompressionStrain)) * station.ratio
            : 1 / (1 + station.strain / extremeCompressionStrain)

const stationMidpoint = (
  left: CapacityStation | undefined,
  right: CapacityStation | undefined
): CapacityStation => {
  if (!left && right) {
    if (right.type === 'tension-depth-ratio') return { ...right, ratio: right.ratio / 2 }
    return { type: 'tension-depth-ratio', from: right, ratio: 0.5 }
  }
  if (left && !right) {
    if (left.type === 'depth-ratio') return { type: 'depth-ratio', ratio: left.ratio * 2 }
    return { type: 'adaptive-depth-interpolation', left, right: left, ratio: 0.5 }
  }
  if (!left || !right) throw new EquivalentBlockInputError('SOLVER_INPUT', 'Invalid station interval.')
  if (left.type === 'tension-depth-ratio' && JSON.stringify(left.from) === JSON.stringify(right)) {
    return { ...left, ratio: (left.ratio + 1) / 2 }
  }
  if (
    left.type === 'tension-depth-ratio' &&
    right.type === 'tension-depth-ratio' &&
    JSON.stringify(left.from) === JSON.stringify(right.from)
  ) {
    return { ...left, ratio: (left.ratio + right.ratio) / 2 }
  }
  if (left.type === 'bar-tension-yield-ratio' && right.type === 'bar-tension-yield-ratio') {
    return { type: 'bar-tension-yield-ratio', ratio: (left.ratio + right.ratio) / 2 }
  }
  const coverCoordinate = (station: CapacityStation): number | null =>
    station.type === 'bar-tension-yield-ratio' && station.ratio === 0
      ? 1
      : station.type === 'cover-gap-ratio'
        ? station.ratio
        : station.type === 'depth-ratio' && Math.abs(station.ratio - 1) <= 1e-12
          ? 0
          : null
  const leftCover = coverCoordinate(left)
  const rightCover = coverCoordinate(right)
  if (leftCover !== null && rightCover !== null) {
    return { type: 'cover-gap-ratio', ratio: (leftCover + rightCover) / 2 }
  }
  if (left.type === 'depth-ratio' && right.type === 'depth-ratio') {
    return { type: 'depth-ratio', ratio: 2 / (1 / left.ratio + 1 / right.ratio) }
  }
  return { type: 'adaptive-depth-interpolation', left, right, ratio: 0.5 }
}

const capacityScales = (
  evaluations: CapacityEvaluation[][],
  endpoints: CapacityEndpoint[],
  requested?: Partial<CapacityResultants>
): CapacityResultants => {
  const maximum = { P: 1, Mx: 1, My: 1 }
  const include = (value: CapacityResultants) => {
    maximum.P = Math.max(maximum.P, Math.abs(value.P))
    maximum.Mx = Math.max(maximum.Mx, Math.abs(value.Mx))
    maximum.My = Math.max(maximum.My, Math.abs(value.My))
  }
  for (const direction of evaluations) for (const evaluation of direction) include(evaluation.resultants)
  for (const endpoint of endpoints) include(endpoint.resultants)
  return {
    P: requested?.P && requested.P > 0 ? requested.P : maximum.P,
    Mx: requested?.Mx && requested.Mx > 0 ? requested.Mx : maximum.Mx,
    My: requested?.My && requested.My > 0 ? requested.My : maximum.My
  }
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

const buildCapacitySurfaceLegacy = <TSource>(
  section: PreparedEquivalentBlockSection,
  evaluator: CapacityEvaluator<TSource>,
  options: BuildCapacitySurfaceOptions<TSource>
): CapacitySurface => {
  if (!(options.extremeCompressionStrain > 0) || !finiteResultants(options.tensionPole.resultants) || !finiteResultants(options.compressionPole.resultants)) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'Surface endpoints and extreme compression strain must be valid.')
  }
  let stations = [...(options.stations ?? createDefaultCapacityStations())]
  if (stations.length < 2) throw new EquivalentBlockInputError('SOLVER_INPUT', 'At least two interior capacity stations are required.')
  for (const station of stations) {
    const value = 'ratio' in station ? station.ratio : station.strain
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
  const barEventStations: CapacityStation[] = [...new Set(options.barStrainEvents ?? [])]
    .filter((strain) => Number.isFinite(strain) && strain > 0)
    .sort((left, right) => right - left)
    .map((strain) => ({ type: 'bar-tension-strain', strain }))
  if (barEventStations.length > 0 && !options.steelLaws) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'Bar-strain event stations require registered steel laws.')
  }

  const seedDirections = Math.max(4, Math.round(options.seedDirections ?? 24))
  const startAngle = wrapAngle(options.startAngle ?? 0)
  let directions = Array.from({ length: seedDirections }, (_, index) => wrapAngle(startAngle + TAU * index / seedDirections))
    .sort((left, right) => left - right)
  const cache = new Map<string, CapacityEvaluation<TSource>[]>()
  const eventCache = new Map<string, CapacityEvaluation<TSource>[]>()
  const useBarBasedStrainStations = options.steelLaws !== undefined
  const directionGeometryCache = new Map<string, {
    projectedDepth: number
    barDepths?: Array<{ depth: number; yieldStrain?: number; ultimateStrain?: number }>
  }>()
  const directionGeometry = (angle: number) => {
    const key = angle.toPrecision(15)
    const cached = directionGeometryCache.get(key)
    if (cached) return cached
    const normalX = Math.cos(angle)
    const normalY = Math.sin(angle)
    const extents = projectedOuterExtents(section, normalX, normalY)
    const edge = extents.maximum
    const geometry = {
      projectedDepth: extents.depth,
      barDepths: useBarBasedStrainStations ? section.rebars.map((bar) => {
        const steelLaw = options.steelLaws![bar.steelLawId]
        if (!steelLaw) {
          throw new EquivalentBlockInputError('MISSING_STEEL_LAW', `Steel law ${bar.steelLawId} is not registered.`)
        }
        return {
          depth: edge - (normalX * bar.x + normalY * bar.y),
          yieldStrain: steelLaw.yieldStrain,
          ultimateStrain: steelLaw.ultimateStrain
        }
      }) : undefined
    }
    directionGeometryCache.set(key, geometry)
    return geometry
  }
  const evaluateStation = (angle: number, station: CapacityStation) => {
    const wrapped = wrapAngle(angle)
    const geometry = directionGeometry(wrapped)
    const evaluation = evaluator({
      neutralAxisAngle: wrapped,
      neutralAxisDepth: capacityStationDepth(
        station,
        geometry.projectedDepth,
        options.extremeCompressionStrain,
        geometry.barDepths
      )
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
  const evaluateEventDirection = (angle: number) => {
    const wrapped = wrapAngle(angle)
    const key = wrapped.toPrecision(15)
    const cached = eventCache.get(key)
    if (cached) return cached
    const evaluations = barEventStations.map((station) => evaluateStation(wrapped, station))
    eventCache.set(key, evaluations)
    return evaluations
  }
  directions.forEach(evaluateDirection)
  directions.forEach(evaluateEventDirection)
  const scaleEvaluations = () => [
    ...directions.map(evaluateDirection),
    ...directions.map(evaluateEventDirection)
  ]
  let scales = capacityScales(scaleEvaluations(), [options.tensionPole, options.compressionPole], options.normalization)
  const stationTolerance = Math.max(0, options.stationTolerance ?? 0.01)
  const maxStationPasses = Math.max(0, Math.round(options.maxStationRefinementPasses ?? 5))
  // Low-level stations exclude the two exact poles; 46 therefore matches the production cap of
  // 48 total stations when a caller does not provide an explicit resource limit.
  const maxStations = Math.max(stations.length, Math.round(options.maxStations ?? 46))
  const stationIntervals = () => Array.from({ length: stations.length + 1 }, (_, intervalIndex) => {
    const leftStation = intervalIndex === 0 ? undefined : stations[intervalIndex - 1]
    const rightStation = intervalIndex === stations.length ? undefined : stations[intervalIndex]
    return {
      intervalIndex,
      station: stationMidpoint(leftStation, rightStation),
      leftStation,
      rightStation
    }
  })
  const interpolationError = (
    middle: CapacityEvaluation<TSource>,
    left: CapacityEvaluation<TSource> | undefined,
    right: CapacityEvaluation<TSource> | undefined,
    leftResultants: CapacityResultants,
    rightResultants: CapacityResultants
  ) => {
    let error = normalizedDistance(
      middle.resultants,
      midpointResultants(leftResultants, rightResultants),
      scales
    )
    if (options.componentResultants && left && right) {
      const middleComponents = options.componentResultants(middle)
      const leftComponents = options.componentResultants(left)
      const rightComponents = options.componentResultants(right)
      const count = Math.min(middleComponents.length, leftComponents.length, rightComponents.length)
      for (let index = 0; index < count; index += 1) {
        error = Math.max(error, normalizedDistance(
          middleComponents[index],
          midpointResultants(leftComponents[index], rightComponents[index]),
          scales
        ))
      }
    }
    return error
  }
  const stationIntervalError = (
    interval: ReturnType<typeof stationIntervals>[number],
    angles: number[]
  ) => {
    let error = 0
    for (const angle of angles) {
      const evaluations = evaluateDirection(angle)
      const leftEvaluation = interval.leftStation
        ? evaluations[interval.intervalIndex - 1]
        : undefined
      const rightEvaluation = interval.rightStation
        ? evaluations[interval.intervalIndex]
        : undefined
      const middle = evaluateStation(angle, interval.station)
      error = Math.max(error, interpolationError(
        middle,
        leftEvaluation,
        rightEvaluation,
        leftEvaluation?.resultants ?? options.tensionPole.resultants,
        rightEvaluation?.resultants ?? options.compressionPole.resultants
      ))
    }
    return error
  }
  const stationProbeAngles = options.stationProbeAngles?.length
    ? [...new Set(options.stationProbeAngles.map(wrapAngle))]
    : directions
  const tolerance = Math.max(0, options.directionTolerance ?? 0.01)
  const maxPasses = Math.max(0, Math.round(options.maxRefinementPasses ?? 8))
  const maxDirections = Math.max(seedDirections, Math.round(options.maxDirections ?? 360))
  let stationPasses = 0
  let directionPasses = 0

  const refineStationsOnce = () => {
    if (stationPasses >= maxStationPasses || stations.length >= maxStations) return false
    const inserts = stationIntervals().map((interval) => ({
      interval: interval.intervalIndex,
      station: interval.station,
      error: stationIntervalError(interval, stationProbeAngles)
    })).filter((entry) => entry.error > stationTolerance)
    if (inserts.length === 0) return false
    inserts.sort((left, right) => right.error - left.error)
    const selected = inserts
      .slice(0, maxStations - stations.length)
      .sort((left, right) => left.interval - right.interval)
    if (selected.length === 0) return false
    stationPasses += 1
    const byInterval = new Map(selected.map((entry) => [entry.interval, entry.station]))
    const previousStations = stations
    stations = previousStations.flatMap((station, index) => {
      const inserted = byInterval.get(index)
      return inserted ? [inserted, station] : [station]
    })
    const afterLast = byInterval.get(previousStations.length)
    if (afterLast) stations.push(afterLast)
    cache.clear()
    directions.forEach(evaluateDirection)
    scales = capacityScales(scaleEvaluations(), [options.tensionPole, options.compressionPole], options.normalization)
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
      const leftEvents = evaluateEventDirection(leftAngle)
      const rightEvents = evaluateEventDirection(rightAngle)
      const middleEvents = evaluateEventDirection(midAngle)
      let error = 0
      for (let stationIndex = 0; stationIndex < stations.length; stationIndex += 1) {
        error = Math.max(error, interpolationError(
          middle[stationIndex],
          left[stationIndex],
          right[stationIndex],
          left[stationIndex].resultants,
          right[stationIndex].resultants
        ))
      }
      for (let eventIndex = 0; eventIndex < barEventStations.length; eventIndex += 1) {
        error = Math.max(error, normalizedDistance(
          middleEvents[eventIndex].resultants,
          midpointResultants(leftEvents[eventIndex].resultants, rightEvents[eventIndex].resultants),
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
    scales = capacityScales(scaleEvaluations(), [options.tensionPole, options.compressionPole], options.normalization)
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
  let worstDirection: number | undefined
  for (let index = 0; index < directions.length; index += 1) {
    const leftAngle = directions[index]
    const rightAngle = index === directions.length - 1 ? directions[0] + TAU : directions[index + 1]
    const middleAngle = wrapAngle((leftAngle + rightAngle) / 2)
    const left = evaluateDirection(leftAngle)
    const right = evaluateDirection(rightAngle)
    const middle = evaluateDirection(middleAngle)
    const leftEvents = evaluateEventDirection(leftAngle)
    const rightEvents = evaluateEventDirection(rightAngle)
    const middleEvents = evaluateEventDirection(middleAngle)
    let intervalError = 0
    for (let stationIndex = 0; stationIndex < stations.length; stationIndex += 1) {
      intervalError = Math.max(intervalError, interpolationError(
        middle[stationIndex],
        left[stationIndex],
        right[stationIndex],
        left[stationIndex].resultants,
        right[stationIndex].resultants
      ))
    }
    for (let eventIndex = 0; eventIndex < barEventStations.length; eventIndex += 1) {
      intervalError = Math.max(intervalError, normalizedDistance(
        middleEvents[eventIndex].resultants,
        midpointResultants(leftEvents[eventIndex].resultants, rightEvents[eventIndex].resultants),
        scales
      ))
    }
    if (intervalError > maxDirectionalInterpolationError) {
      maxDirectionalInterpolationError = intervalError
      worstDirection = middleAngle
    }
  }

  let maxStationInterpolationError = 0
  for (const interval of stationIntervals()) {
    maxStationInterpolationError = Math.max(
      maxStationInterpolationError,
      stationIntervalError(interval, stationProbeAngles)
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
  const points: CapacitySurfacePoint[] = [{
    id: 0,
    resultants: { ...options.tensionPole.resultants },
    kind: 'tension-pole',
    metadata: options.tensionPole.metadata
  }]
  const grid: Array<{ ids: number[]; ratios: number[] }> = []
  const activeStationIndexSet = new Set(activeStationIndices)
  for (const angle of directions) {
    const evaluations = evaluateDirection(angle)
    const entries = [
      ...activeStationIndices.map((stationIndex) => ({
        evaluation: evaluations[stationIndex],
        station: stations[stationIndex],
        event: false
      })),
      ...evaluateEventDirection(angle).map((evaluation, eventIndex) => ({
        evaluation,
        station: barEventStations[eventIndex],
        event: true
      }))
    ].sort((left, right) =>
      left.evaluation.state.neutralAxisDepth - right.evaluation.state.neutralAxisDepth
    )
    const unique: typeof entries = []
    for (const entry of entries) {
      const previous = unique.at(-1)
      if (previous && Math.abs(
        Math.log(entry.evaluation.state.neutralAxisDepth / previous.evaluation.state.neutralAxisDepth)
      ) <= 1e-12) {
        if (entry.event) unique[unique.length - 1] = entry
        continue
      }
      unique.push(entry)
    }
    const projectedDepth = directionGeometry(angle).projectedDepth
    const ids = unique.map(({ evaluation, station }) => {
      const id = points.length
      points.push({
        id,
        resultants: { ...evaluation.resultants },
        state: { ...evaluation.state },
        station: { ...station },
        kind: 'state',
        metadata: evaluation.metadata
      })
      return id
    })
    grid.push({
      ids,
      ratios: unique.map(({ evaluation }) => evaluation.state.neutralAxisDepth / projectedDepth)
    })
    // Keep every requested reporting state even when it collapses numerically onto a pole or a
    // neighbouring layer. These vertices are intentionally not referenced by the topology; they
    // preserve the fixed station schedule without creating degenerate triangles.
    for (let stationIndex = 0; stationIndex < stations.length; stationIndex += 1) {
      if (activeStationIndexSet.has(stationIndex)) continue
      const evaluation = evaluations[stationIndex]
      points.push({
        id: points.length,
        resultants: { ...evaluation.resultants },
        state: { ...evaluation.state },
        station: { ...stations[stationIndex] },
        kind: 'state',
        metadata: evaluation.metadata
      })
    }
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
    const left = grid[directionIndex]
    const right = grid[nextDirection]
    triangles.push({ a: 0, b: left.ids[0], c: right.ids[0] })
    let leftIndex = 0
    let rightIndex = 0
    while (leftIndex < left.ids.length - 1 || rightIndex < right.ids.length - 1) {
      const advanceLeft = rightIndex === right.ids.length - 1 || (
        leftIndex < left.ids.length - 1 &&
        left.ratios[leftIndex + 1] <= right.ratios[rightIndex + 1]
      )
      if (advanceLeft) {
        triangles.push({
          a: left.ids[leftIndex],
          b: left.ids[leftIndex + 1],
          c: right.ids[rightIndex]
        })
        leftIndex += 1
      } else {
        triangles.push({
          a: left.ids[leftIndex],
          b: right.ids[rightIndex + 1],
          c: right.ids[rightIndex]
        })
        rightIndex += 1
      }
    }
    triangles.push({
      a: left.ids[left.ids.length - 1],
      b: compressionPoleIndex,
      c: right.ids[right.ids.length - 1]
    })
  }
  const oriented = orientTrianglesOutward(triangles, points)
  const topology = evaluateSurfaceTopology(points, oriented)
  return {
    points,
    triangles: oriented,
    directions,
    // Keep the complete requested station schedule in the public surface
    // metadata. Some station layers can numerically collapse onto a pole or a
    // neighbouring layer and are intentionally omitted only from the mesh to
    // avoid degenerate triangles.
    stations: barEventStations.length === 0
      ? [...stations]
      : [...stations, ...barEventStations].sort((left, right) =>
        stationDepthRatio(left, options.extremeCompressionStrain) -
        stationDepthRatio(right, options.extremeCompressionStrain)
      ),
    normalization: scales,
    maxDirectionalInterpolationError,
    worstDirection,
    maxStationInterpolationError,
    directionRefinementPasses: directionPasses,
    stationRefinementPasses: stationPasses,
    directionRefinementConverged: maxDirectionalInterpolationError <= tolerance,
    stationRefinementConverged: maxStationInterpolationError <= stationTolerance,
    topology
  }
}

type IndependentCapacityNode<TSource> = {
  station: CapacityStation
  evaluation: CapacityEvaluation<TSource>
  coordinate: number
}

type IndependentCapacityRow<TSource> = {
  angle: number
  nodes: IndependentCapacityNode<TSource>[]
  meshNodes: IndependentCapacityNode<TSource>[]
  stationPasses: number
  maxStationError: number
}

const buildIndependentCapacitySurface = <TSource>(
  section: PreparedEquivalentBlockSection,
  evaluator: CapacityEvaluator<TSource>,
  options: BuildCapacitySurfaceOptions<TSource>
): CapacitySurface => {
  if (!(options.extremeCompressionStrain > 0) ||
    !finiteResultants(options.tensionPole.resultants) ||
    !finiteResultants(options.compressionPole.resultants)) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'Surface endpoints and extreme compression strain must be valid.')
  }
  const requestedStations = [...(options.stations ?? createDefaultCapacityStations())]
  const seedStations = [...requestedStations, ...(options.adaptiveStationEvents ?? [])]
    .sort((left, right) =>
      stationDepthRatio(left, options.extremeCompressionStrain) -
      stationDepthRatio(right, options.extremeCompressionStrain)
    )
    .filter((station, index, values) =>
      index === 0 || JSON.stringify(station) !== JSON.stringify(values[index - 1])
    )
  if (seedStations.length < 2) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'At least two interior capacity stations are required.')
  }
  for (let index = 1; index < seedStations.length; index += 1) {
    if (stationDepthRatio(seedStations[index], options.extremeCompressionStrain) <=
      stationDepthRatio(seedStations[index - 1], options.extremeCompressionStrain)) {
      throw new EquivalentBlockInputError('SOLVER_INPUT', 'Capacity stations must be ordered by strictly increasing neutral-axis depth.')
    }
  }

  const eventStations: CapacityStation[] = [...new Set(options.barStrainEvents ?? [])]
    .filter((strain) => Number.isFinite(strain) && strain > 0)
    .sort((left, right) => right - left)
    .map((strain) => ({ type: 'bar-tension-strain', strain }))
  if (eventStations.length > 0 && !options.steelLaws) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'Bar-strain event stations require registered steel laws.')
  }

  const directionCount = Math.max(4, Math.round(options.seedDirections ?? 12))
  const startAngle = wrapAngle(options.startAngle ?? 0)
  const seedDirections = Array.from(
    { length: directionCount },
    (_, index) => wrapAngle(startAngle + TAU * index / directionCount)
  ).sort((left, right) => left - right)
  const geometryCache = new Map<string, {
    projectedDepth: number
    barDepths?: Array<{ depth: number; yieldStrain?: number; ultimateStrain?: number }>
  }>()
  const directionGeometry = (angleInput: number) => {
    const angle = wrapAngle(angleInput)
    const key = angle.toPrecision(15)
    const cached = geometryCache.get(key)
    if (cached) return cached
    const normalX = Math.cos(angle)
    const normalY = Math.sin(angle)
    const extents = projectedOuterExtents(section, normalX, normalY)
    const edge = extents.maximum
    const geometry = {
      projectedDepth: extents.depth,
      barDepths: options.steelLaws ? section.rebars.map((bar) => {
        const law = options.steelLaws![bar.steelLawId]
        if (!law) throw new EquivalentBlockInputError('MISSING_STEEL_LAW', `Steel law ${bar.steelLawId} is not registered.`)
        return {
          depth: edge - (normalX * bar.x + normalY * bar.y),
          yieldStrain: law.yieldStrain,
          ultimateStrain: law.ultimateStrain
        }
      }) : undefined
    }
    geometryCache.set(key, geometry)
    return geometry
  }
  let evaluationCount = 0
  const evaluationCache = new Map<string, CapacityEvaluation<TSource>>()
  const evaluateAt = (angleInput: number, station: CapacityStation) => {
    const angle = wrapAngle(angleInput)
    const key = `${angle.toPrecision(15)}|${JSON.stringify(station)}`
    const cached = evaluationCache.get(key)
    if (cached) return cached
    const geometry = directionGeometry(angle)
    const evaluation = evaluator({
      neutralAxisAngle: angle,
      neutralAxisDepth: capacityStationDepth(
        station,
        geometry.projectedDepth,
        options.extremeCompressionStrain,
        geometry.barDepths
      )
    })
    if (!finiteResultants(evaluation.resultants)) {
      throw new EquivalentBlockInputError('SOLVER_INPUT', 'The capacity evaluator returned non-finite resultants.')
    }
    evaluationCount += 1
    evaluationCache.set(key, evaluation)
    return evaluation
  }
  const coordinateOf = (angle: number, evaluation: CapacityEvaluation<TSource>) => {
    const ratio = evaluation.state.neutralAxisDepth / directionGeometry(angle).projectedDepth
    return ratio / (1 + ratio)
  }
  const initialRow = (angleInput: number): IndependentCapacityRow<TSource> => {
    const angle = wrapAngle(angleInput)
    const nodes = seedStations.map((station) => {
      const evaluation = evaluateAt(angle, station)
      return { station, evaluation, coordinate: coordinateOf(angle, evaluation) }
    }).sort((left, right) => left.coordinate - right.coordinate)
    return { angle, nodes, meshNodes: nodes, stationPasses: 0, maxStationError: Number.NaN }
  }
  const initialRows = seedDirections.map(initialRow)
  const scales = capacityScales(
    initialRows.map((row) => row.nodes.map((node) => node.evaluation)),
    [options.tensionPole, options.compressionPole],
    options.normalization
  )
  const interpolationError = (
    middle: CapacityEvaluation<TSource>,
    left: CapacityEvaluation<TSource> | undefined,
    right: CapacityEvaluation<TSource> | undefined,
    leftResultants: CapacityResultants,
    rightResultants: CapacityResultants
  ) => {
    let error = normalizedDistance(middle.resultants, midpointResultants(leftResultants, rightResultants), scales)
    if (options.componentResultants && left && right) {
      const middleComponents = options.componentResultants(middle)
      const leftComponents = options.componentResultants(left)
      const rightComponents = options.componentResultants(right)
      const count = Math.min(middleComponents.length, leftComponents.length, rightComponents.length)
      for (let index = 0; index < count; index += 1) {
        error = Math.max(error, normalizedDistance(
          middleComponents[index],
          midpointResultants(leftComponents[index], rightComponents[index]),
          scales
        ))
      }
    }
    return error
  }
  const stationTolerance = Math.max(0, options.stationTolerance ?? 0.01)
  const maxStationPasses = Math.max(0, Math.round(options.maxStationRefinementPasses ?? 8))
  const maxStations = Math.max(seedStations.length, Math.round(options.maxStations ?? 46))
  const protectedStationKeys = new Set(seedStations.map((station) => JSON.stringify(station)))
  const refineRow = (source: IndependentCapacityRow<TSource>) => {
    const row: IndependentCapacityRow<TSource> = { ...source, nodes: [...source.nodes] }
    const candidates = () => Array.from({ length: row.nodes.length + 1 }, (_, interval) => {
      const left = interval === 0 ? undefined : row.nodes[interval - 1]
      const right = interval === row.nodes.length ? undefined : row.nodes[interval]
      const station = stationMidpoint(left?.station, right?.station)
      const evaluation = evaluateAt(row.angle, station)
      const error = interpolationError(
        evaluation,
        left?.evaluation,
        right?.evaluation,
        left?.evaluation.resultants ?? options.tensionPole.resultants,
        right?.evaluation.resultants ?? options.compressionPole.resultants
      )
      return { station, evaluation, coordinate: coordinateOf(row.angle, evaluation), error }
    })
    while (row.stationPasses < maxStationPasses && row.nodes.length < maxStations) {
      const selected = candidates()
        .filter((candidate) => candidate.error > stationTolerance)
        .sort((left, right) => right.error - left.error || left.coordinate - right.coordinate)
        .slice(0, maxStations - row.nodes.length)
      if (selected.length === 0) break
      row.nodes = [...row.nodes, ...selected.map(({ station, evaluation, coordinate }) => ({
        station,
        evaluation,
        coordinate
      }))].sort((left, right) => left.coordinate - right.coordinate)
      row.stationPasses += 1
    }
    // Refinement is additive, so an early parent midpoint can become redundant after the true
    // curve break has been resolved by later children. Remove generated points one at a time only
    // when the newly merged interval passes the same midpoint criterion. User seeds and exact
    // event stations are protected.
    let removed = true
    while (removed) {
      removed = false
      const removable = row.nodes.flatMap((node, index) => {
        if (protectedStationKeys.has(JSON.stringify(node.station))) return []
        const left = index === 0 ? undefined : row.nodes[index - 1]
        const right = index === row.nodes.length - 1 ? undefined : row.nodes[index + 1]
        const probeStation = stationMidpoint(left?.station, right?.station)
        const probe = evaluateAt(row.angle, probeStation)
        const error = interpolationError(
          probe,
          left?.evaluation,
          right?.evaluation,
          left?.evaluation.resultants ?? options.tensionPole.resultants,
          right?.evaluation.resultants ?? options.compressionPole.resultants
        )
        return error <= stationTolerance ? [{ index, error }] : []
      }).sort((left, right) => left.error - right.error || left.index - right.index)
      const best = removable[0]
      if (!best) break
      row.nodes.splice(best.index, 1)
      removed = true
    }
    row.maxStationError = candidates().reduce((maximum, candidate) => Math.max(maximum, candidate.error), 0)
    const events = eventStations.map((station) => {
      const evaluation = evaluateAt(row.angle, station)
      return { station, evaluation, coordinate: coordinateOf(row.angle, evaluation) }
    })
    row.meshNodes = [...row.nodes, ...events]
      .sort((left, right) => left.coordinate - right.coordinate)
      .filter((node, index, values) => index === 0 || Math.abs(node.coordinate - values[index - 1].coordinate) > 1e-12)
    return row
  }
  const rowCache = new Map<string, IndependentCapacityRow<TSource>>()
  const completedRow = (angleInput: number) => {
    const angle = wrapAngle(angleInput)
    const key = angle.toPrecision(15)
    const cached = rowCache.get(key)
    if (cached) return cached
    const source = initialRows.find((row) => row.angle.toPrecision(15) === key) ?? initialRow(angle)
    const completed = refineRow(source)
    rowCache.set(key, completed)
    return completed
  }
  const rows = new Map<number, IndependentCapacityRow<TSource>>()
  for (const row of initialRows) {
    const completed = completedRow(row.angle)
    rows.set(completed.angle, completed)
  }
  const interpolate = (row: IndependentCapacityRow<TSource>, coordinate: number): CapacityResultants => {
    const nodes = row.meshNodes
    if (coordinate <= nodes[0].coordinate) {
      const ratio = coordinate / Math.max(1e-15, nodes[0].coordinate)
      return {
        P: options.tensionPole.resultants.P + ratio * (nodes[0].evaluation.resultants.P - options.tensionPole.resultants.P),
        Mx: options.tensionPole.resultants.Mx + ratio * (nodes[0].evaluation.resultants.Mx - options.tensionPole.resultants.Mx),
        My: options.tensionPole.resultants.My + ratio * (nodes[0].evaluation.resultants.My - options.tensionPole.resultants.My)
      }
    }
    if (coordinate >= nodes[nodes.length - 1].coordinate) {
      const left = nodes[nodes.length - 1]
      const ratio = (coordinate - left.coordinate) / Math.max(1e-15, 1 - left.coordinate)
      return {
        P: left.evaluation.resultants.P + ratio * (options.compressionPole.resultants.P - left.evaluation.resultants.P),
        Mx: left.evaluation.resultants.Mx + ratio * (options.compressionPole.resultants.Mx - left.evaluation.resultants.Mx),
        My: left.evaluation.resultants.My + ratio * (options.compressionPole.resultants.My - left.evaluation.resultants.My)
      }
    }
    let high = 1
    while (nodes[high].coordinate < coordinate) high += 1
    const left = nodes[high - 1]
    const right = nodes[high]
    const ratio = (coordinate - left.coordinate) / Math.max(1e-15, right.coordinate - left.coordinate)
    return {
      P: left.evaluation.resultants.P + ratio * (right.evaluation.resultants.P - left.evaluation.resultants.P),
      Mx: left.evaluation.resultants.Mx + ratio * (right.evaluation.resultants.Mx - left.evaluation.resultants.Mx),
      My: left.evaluation.resultants.My + ratio * (right.evaluation.resultants.My - left.evaluation.resultants.My)
    }
  }
  const sortedDirections = () => [...rows.keys()].sort((left, right) => left - right)
  const measureDirections = () => {
    const directions = sortedDirections()
    return directions.map((leftAngle, index) => {
      const rightAngle = index === directions.length - 1 ? directions[0] + TAU : directions[index + 1]
      const rightKey = index === directions.length - 1 ? directions[0] : rightAngle
      const middle = completedRow((leftAngle + rightAngle) / 2)
      const left = rows.get(leftAngle)!
      const right = rows.get(rightKey)!
      let error = 0
      for (const node of middle.meshNodes) {
        error = Math.max(error, normalizedDistance(
          node.evaluation.resultants,
          midpointResultants(interpolate(left, node.coordinate), interpolate(right, node.coordinate)),
          scales
        ))
      }
      return { angle: middle.angle, row: middle, error }
    })
  }
  const directionTolerance = Math.max(0, options.directionTolerance ?? 0.01)
  const maxDirectionPasses = Math.max(0, Math.round(options.maxRefinementPasses ?? 8))
  const maxDirections = Math.max(directionCount, Math.round(options.maxDirections ?? 360))
  let directionPasses = 0
  while (directionPasses < maxDirectionPasses && rows.size < maxDirections) {
    const selected = measureDirections()
      .filter((candidate) => candidate.error > directionTolerance)
      .sort((left, right) => right.error - left.error || left.angle - right.angle)
      .slice(0, maxDirections - rows.size)
    if (selected.length === 0) break
    for (const candidate of selected) rows.set(candidate.angle, candidate.row)
    directionPasses += 1
  }
  const directionErrors = measureDirections()
  const worstDirectionError = directionErrors.reduce<(typeof directionErrors)[number] | undefined>(
    (worst, entry) => !worst || entry.error > worst.error ? entry : worst,
    undefined
  )
  const maxDirectionalInterpolationError = worstDirectionError?.error ?? Number.NaN
  const finalRows = sortedDirections().map((angle) => rows.get(angle)!)
  const points: CapacitySurfacePoint[] = [{
    id: 0,
    resultants: { ...options.tensionPole.resultants },
    kind: 'tension-pole',
    stationCoordinate: 0,
    metadata: options.tensionPole.metadata
  }]
  const grid: Array<{ ids: number[]; coordinates: number[] }> = []
  for (const row of finalRows) {
    const ids = row.meshNodes.map((node) => {
      const id = points.length
      points.push({
        id,
        resultants: { ...node.evaluation.resultants },
        state: { ...node.evaluation.state },
        station: { ...node.station },
        stationCoordinate: node.coordinate,
        kind: 'state',
        metadata: node.evaluation.metadata
      })
      return id
    })
    grid.push({ ids, coordinates: row.meshNodes.map((node) => node.coordinate) })
  }
  const compressionPole = points.length
  points.push({
    id: compressionPole,
    resultants: { ...options.compressionPole.resultants },
    kind: 'compression-pole',
    stationCoordinate: 1,
    metadata: options.compressionPole.metadata
  })
  const triangles: CapacitySurfaceTriangle[] = []
  for (let directionIndex = 0; directionIndex < finalRows.length; directionIndex += 1) {
    const left = grid[directionIndex]
    const right = grid[(directionIndex + 1) % finalRows.length]
    triangles.push({ a: 0, b: left.ids[0], c: right.ids[0] })
    let leftIndex = 0
    let rightIndex = 0
    while (leftIndex < left.ids.length - 1 || rightIndex < right.ids.length - 1) {
      const advanceLeft = rightIndex === right.ids.length - 1 || (
        leftIndex < left.ids.length - 1 &&
        left.coordinates[leftIndex + 1] <= right.coordinates[rightIndex + 1]
      )
      if (advanceLeft) {
        triangles.push({ a: left.ids[leftIndex], b: left.ids[leftIndex + 1], c: right.ids[rightIndex] })
        leftIndex += 1
      } else {
        triangles.push({ a: left.ids[leftIndex], b: right.ids[rightIndex + 1], c: right.ids[rightIndex] })
        rightIndex += 1
      }
    }
    triangles.push({
      a: left.ids[left.ids.length - 1],
      b: compressionPole,
      c: right.ids[right.ids.length - 1]
    })
  }
  const oriented = orientTrianglesOutward(triangles, points)
  const uniqueStations = new Map<string, CapacityStation>()
  for (const row of finalRows) for (const node of row.meshNodes) {
    uniqueStations.set(JSON.stringify(node.station), node.station)
  }
  const stationCounts = finalRows.map((row) => row.nodes.length + 2)
  const maxStationInterpolationError = Math.max(...finalRows.map((row) => row.maxStationError))
  return {
    points,
    triangles: oriented,
    directions: sortedDirections(),
    stations: [...uniqueStations.values()],
    normalization: scales,
    maxDirectionalInterpolationError,
    worstDirection: worstDirectionError?.angle,
    maxStationInterpolationError,
    directionRefinementPasses: directionPasses,
    stationRefinementPasses: Math.max(...finalRows.map((row) => row.stationPasses)),
    directionRefinementConverged: maxDirectionalInterpolationError <= directionTolerance,
    stationRefinementConverged: maxStationInterpolationError <= stationTolerance,
    minStationsPerDirection: Math.min(...stationCounts),
    maxStationsPerDirection: Math.max(...stationCounts),
    averageStationsPerDirection: stationCounts.reduce((sum, count) => sum + count, 0) / stationCounts.length,
    evaluationCount,
    topology: evaluateSurfaceTopology(points, oriented)
  }
}

export const buildCapacitySurface = <TSource>(
  section: PreparedEquivalentBlockSection,
  evaluator: CapacityEvaluator<TSource>,
  options: BuildCapacitySurfaceOptions<TSource>
): CapacitySurface => options.samplingMode === 'adaptive'
  ? buildIndependentCapacitySurface(section, evaluator, options)
  : buildCapacitySurfaceLegacy(section, evaluator, options)

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
  // Only a point strictly inside blocks an ear. Treating points on an ear edge as
  // interior can leave a numerically collinear final polygon with no selectable ear.
  return ab > tolerance && bc > tolerance && ca > tolerance
}

const triangulateCapLoop = (
  source: number[],
  points: CapacitySurfacePoint[],
  tolerance: number
): CapacitySurfaceTriangle[] => {
  let momentScale = 1
  for (const index of source) {
    momentScale = Math.max(
      momentScale,
      Math.abs(points[index].resultants.Mx),
      Math.abs(points[index].resultants.My)
    )
  }
  const distanceTolerance = Math.max(1e-12 * momentScale, tolerance)
  const crossTolerance = Math.max(1e-12 * momentScale ** 2, tolerance ** 2)
  const cleaned = source.filter((index, position, values) => {
    if (position === 0) return true
    const current = points[index].resultants
    const previous = points[values[position - 1]].resultants
    return Math.hypot(current.Mx - previous.Mx, current.My - previous.My) > distanceTolerance
  })
  if (cleaned.length > 1) {
    const first = points[cleaned[0]].resultants
    const last = points[cleaned[cleaned.length - 1]].resultants
    if (Math.hypot(first.Mx - last.Mx, first.My - last.My) <= distanceTolerance) cleaned.pop()
  }
  let removed = true
  while (removed && cleaned.length > 3) {
    removed = false
    for (let index = 0; index < cleaned.length; index += 1) {
      const previous = points[cleaned[(index - 1 + cleaned.length) % cleaned.length]].resultants
      const current = points[cleaned[index]].resultants
      const next = points[cleaned[(index + 1) % cleaned.length]].resultants
      const leftX = current.Mx - previous.Mx
      const leftY = current.My - previous.My
      const rightX = next.Mx - current.Mx
      const rightY = next.My - current.My
      const cross = leftX * rightY - leftY * rightX
      if (Math.abs(cross) > crossTolerance || leftX * rightX + leftY * rightY < 0) continue
      cleaned.splice(index, 1)
      removed = true
      break
    }
  }
  if (cleaned.length < 3) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'The axial-cap contour collapsed below three distinct moment points.')
  }
  const loop = signedAreaInMomentPlane(cleaned, points) >= 0 ? [...cleaned] : [...cleaned].reverse()
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
      if (convex <= crossTolerance) continue
      const contains = remaining.some((candidateIndex) =>
        candidateIndex !== previousIndex && candidateIndex !== currentIndex && candidateIndex !== nextIndex &&
        pointInMomentTriangle(points[candidateIndex].resultants, previous, current, next, crossTolerance)
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
    throw new EquivalentBlockInputError(
      'SOLVER_INPUT',
      `The axial-cap contour could not be triangulated reliably (${loop.length} vertices, ${remaining.length} unresolved).`
    )
  }
  return triangles
}

export const clipCapacitySurfaceByAxialCap = (
  surface: CapacitySurface,
  axialCap: number,
  tolerance = 1e-9
): CapacitySurface => {
  if (!Number.isFinite(axialCap)) throw new EquivalentBlockInputError('SOLVER_INPUT', 'Axial cap must be finite.')
  let maximum = Number.NEGATIVE_INFINITY
  let minimum = Number.POSITIVE_INFINITY
  for (const point of surface.points) {
    maximum = Math.max(maximum, point.resultants.P)
    minimum = Math.min(minimum, point.resultants.P)
  }
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
      ...(onCap ? {
        state: undefined,
        station: undefined,
        kind: 'axial-cap' as const,
        metadata: {
          ...old.metadata,
          ...(old.state ? { meridianAngle: wrapAngle(old.state.neutralAxisAngle) } : {})
        }
      } : {})
    })
    oldPointMap.set(oldIndex, id)
    return id
  }
  const intersectionPoint = (leftIndex: number, rightIndex: number) => {
    const key = leftIndex < rightIndex ? `${leftIndex}:${rightIndex}` : `${rightIndex}:${leftIndex}`
    const existing = edgeIntersectionMap.get(key)
    if (existing !== undefined) return existing
    const leftPoint = surface.points[leftIndex]
    const rightPoint = surface.points[rightIndex]
    const left = leftPoint.resultants
    const right = rightPoint.resultants
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
      kind: 'axial-cap',
      ...(
        leftPoint.state && rightPoint.state &&
        Math.abs(Math.sin(leftPoint.state.neutralAxisAngle - rightPoint.state.neutralAxisAngle)) <= 1e-12 &&
        Math.cos(leftPoint.state.neutralAxisAngle - rightPoint.state.neutralAxisAngle) > 0
          ? { metadata: { meridianAngle: wrapAngle(leftPoint.state.neutralAxisAngle) } }
          : {}
      )
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
