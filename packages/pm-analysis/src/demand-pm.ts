import type { Resultant, SurfaceStationId } from '@pm/results/contracts'
import type { DemandCheckBasis } from '@pm/project'
import { PREVIEW_GEOMETRY_TOL, PREVIEW_PARALLEL_TOL } from './geometry-criteria'

export type PmCoordinate = { M: number; P: number }
export type DemandPmPoint = PmCoordinate & {
  Mx: number
  My: number
  beta: number | null
  theta: number | null
  station: number | null
  stationId: SurfaceStationId | null
  sourceId: string | null
  role: 'physical-station' | 'cap-edge' | 'axial-center' | 'surface-cut' | 'before-cap'
}
export type PmIntersectionSource = { path: number; segment: number; fraction: number }
export type PmPathIntersection = PmCoordinate & {
  lambda: number
  kind: 'crossing' | 'contact'
  sources: PmIntersectionSource[]
}
export type PmLoadPathIntersections =
  | { status: 'intersections'; points: PmPathIntersection[] }
  | { status: 'overlap'; points: PmPathIntersection[]; segments: Array<{ path: number; segment: number }> }
  | { status: 'unavailable'; reason: 'missing-curve' | 'missing-demand' | 'zero-path' | 'invalid-arithmetic'; points: [] }
  | { status: 'no-intersection'; points: [] }

type PmSummaryUnavailableReason = Extract<PmLoadPathIntersections, { status: 'unavailable' }>['reason']
  | 'no-intersection' | 'multiple-intersections' | 'overlap' | 'contact' | 'ambiguous-components'

export type DemandPmSummary =
  | { status: 'available'; resistance: PmCoordinate & Resultant; lambda: number; utilization: number }
  | { status: 'unavailable'; reason: PmSummaryUnavailableReason }

/** Root 05 §9: summarize the drawn crossing and its signed source components. */
export const summarizeDemandPmCrossing = (
  paths: readonly (readonly DemandPmPoint[])[], query: PmLoadPathIntersections
): DemandPmSummary => {
  if (query.status === 'unavailable') return { status: 'unavailable', reason: query.reason }
  if (query.status !== 'intersections') return { status: 'unavailable', reason: query.status }
  const [hit] = query.points
  if (!hit) return { status: 'unavailable', reason: 'no-intersection' }
  if (query.points.length > 1) return { status: 'unavailable', reason: 'multiple-intersections' }
  if (hit.kind !== 'crossing' || hit.lambda <= 0) return { status: 'unavailable', reason: 'contact' }

  const utilization = 1 / hit.lambda
  if (![hit.P, hit.M, hit.lambda, utilization].every(Number.isFinite)) {
    return { status: 'unavailable', reason: 'invalid-arithmetic' }
  }
  let components: Pick<Resultant, 'Mx' | 'My'> | undefined
  for (const { path, segment, fraction } of hit.sources) {
    const a = paths[path]?.[segment], b = paths[path]?.[segment + 1]
    if (!a || !b || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      return { status: 'unavailable', reason: 'invalid-arithmetic' }
    }
    const Mx = (1 - fraction) * a.Mx + fraction * b.Mx
    const My = (1 - fraction) * a.My + fraction * b.My
    if (![Mx, My].every(Number.isFinite)) return { status: 'unavailable', reason: 'invalid-arithmetic' }
    if (components) {
      const scale = Math.max(1, hit.M, Math.abs(Mx), Math.abs(My), Math.abs(components.Mx), Math.abs(components.My))
      if (Math.hypot(Mx / scale - components.Mx / scale, My / scale - components.My / scale) > PREVIEW_GEOMETRY_TOL) {
        return { status: 'unavailable', reason: 'ambiguous-components' }
      }
    } else components = { Mx, My }
  }
  if (!components) return { status: 'unavailable', reason: 'ambiguous-components' }
  return { status: 'available', resistance: { P: hit.P, M: hit.M, ...components }, lambda: hit.lambda, utilization }
}

/** Root 05 §8: map the endpoint first, then join the mapped endpoints in P-M. */
export const resultantMomentCoordinate = (point: Resultant): PmCoordinate => ({
  M: Math.hypot(point.Mx, point.My), P: point.P
})

/** Root 05 §8: signed display sides retain the positive magnitude and original components. */
export const directMomentCoordinate = (point: Resultant, branch: 'primary' | 'opposite') => {
  const coordinate = resultantMomentCoordinate(point)
  const plotSign = branch === 'opposite' ? -1 : 1
  return { P: coordinate.P, M: plotSign * coordinate.M, MR: coordinate.M, plotSign }
}

/** Root 05 section 8: retain the forward theta half-section with geometric axis intersections. */
export const forwardMomentPaths = (paths: readonly (readonly DemandPmPoint[])[]): DemandPmPoint[][] => {
  const result: DemandPmPoint[][] = []
  for (const path of paths) {
    if (path.some(point => ![point.M, point.P, point.Mx, point.My].every(Number.isFinite))) {
      throw new RangeError('Moment-plane paths must contain finite coordinates.')
    }
    if (path.length < 2) continue
    const first = path[0], last = path[path.length - 1]
    const closed = first.M === last.M && first.P === last.P && first.Mx === last.Mx && first.My === last.My
    const outside = path.findIndex(point => point.M < 0)
    // Begin a clipped loop outside the retained half-plane so its forward path is not split at
    // the original loop seam. Open components keep their original start and end.
    const points = closed && outside >= 0
      ? [...path.slice(outside, -1), ...path.slice(0, outside + 1)] : path
    let current: DemandPmPoint[] = []
    const flush = () => { if (current.length > 1) result.push(current); current = [] }
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index]
      const aInside = a.M >= 0, bInside = b.M >= 0
      if (!aInside && !bInside) { flush(); continue }
      const crossing = (): DemandPmPoint => {
        if (a.M === 0) return a
        if (b.M === 0) return b
        const difference = a.M - b.M
        const fraction = a.M / difference
        const P = a.P + fraction * (b.P - a.P)
        if (![difference, fraction, P].every(Number.isFinite)) throw new RangeError('Invalid moment-axis intersection.')
        return { M: 0, P, Mx: 0, My: 0, beta: null, theta: null, station: null,
          stationId: null, sourceId: null, role: a.role === 'before-cap' ? 'before-cap' : 'surface-cut' }
      }
      if (!current.length) current.push(aInside ? a : crossing())
      const end = bInside ? b : crossing()
      if (current[current.length - 1] !== end) current.push(end)
      if (!bInside) flush()
    }
    flush()
  }
  return result
}

/**
 * Diagnostic only. Intersect open or closed displayed polylines with the forward load path.
 * Separate force/moment normalization and the existing geometric/parallel criteria are retained.
 * No strain, resistance, utilization or adequacy is inferred from this flattened construction.
 */
export const intersectPmLoadPath = (
  paths: readonly (readonly PmCoordinate[])[], demand: Resultant, basis: DemandCheckBasis
): PmLoadPathIntersections => {
  if (![demand.P, demand.Mx, demand.My].every(Number.isFinite) ||
    paths.some(path => path.some(point => !Number.isFinite(point.M) || !Number.isFinite(point.P)))) {
    return { status: 'unavailable', reason: 'invalid-arithmetic', points: [] }
  }
  if (!paths.some(path => path.length > 1)) return { status: 'unavailable', reason: 'missing-curve', points: [] }
  const md = Math.hypot(demand.Mx, demand.My)
  let forceScale = Math.max(1, Math.abs(demand.P)), momentScale = Math.max(1, md)
  for (const path of paths) for (const point of path) {
    forceScale = Math.max(forceScale, Math.abs(point.P))
    momentScale = Math.max(momentScale, Math.abs(point.M))
  }
  const dx = md / momentScale, dy = basis === 'constantAxial' ? 0 : demand.P / forceScale
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length)) return { status: 'unavailable', reason: 'invalid-arithmetic', points: [] }
  if (length === 0) return { status: 'unavailable', reason: 'zero-path', points: [] }
  const ux = dx / length, uy = dy / length, oy = basis === 'constantAxial' ? demand.P / forceScale : 0
  const distance = (point: PmCoordinate) => point.M / momentScale * uy - (point.P / forceScale - oy) * ux
  const along = (point: PmCoordinate) => (point.M / momentScale * ux + (point.P / forceScale - oy) * uy) / length
  const hits: Array<PmPathIntersection & { signs: Set<number> }> = []
  const segments: Array<{ path: number; segment: number }> = []
  for (const [pathIndex, path] of paths.entries()) for (let segment = 0; segment + 1 < path.length; segment++) {
    const a = path[segment], b = path[segment + 1]
    if (!a || !b) continue
    const sx = (b.M - a.M) / momentScale, sy = (b.P - a.P) / forceScale
    const segmentLength = Math.hypot(sx, sy)
    if (segmentLength === 0) continue
    const da = distance(a), db = distance(b)
    if (Math.abs(sx * uy - sy * ux) <= PREVIEW_PARALLEL_TOL * segmentLength) {
      if (Math.abs(da) <= PREVIEW_GEOMETRY_TOL && Math.max(along(a), along(b)) >= 0) {
        segments.push({ path: pathIndex, segment })
      }
      continue
    }
    const fraction = Math.abs(da) <= PREVIEW_GEOMETRY_TOL ? 0
      : Math.abs(db) <= PREVIEW_GEOMETRY_TOL ? 1 : da / (da - db)
    if (fraction < 0 || fraction > 1) continue
    const point = { M: a.M + fraction * (b.M - a.M), P: a.P + fraction * (b.P - a.P) }
    const lambda = along(point)
    if (![point.M, point.P, lambda].every(Number.isFinite)) {
      return { status: 'unavailable', reason: 'invalid-arithmetic', points: [] }
    }
    if (lambda < 0) continue
    hits.push({ ...point, lambda, kind: 'contact', sources: [{ path: pathIndex, segment, fraction }],
      signs: new Set([da, db].filter(value => Math.abs(value) > PREVIEW_GEOMETRY_TOL).map(Math.sign)) })
  }
  hits.sort((a, b) => a.lambda - b.lambda)
  const merged: typeof hits = []
  for (const hit of hits) {
    const previous = merged.at(-1)
    if (previous && Math.hypot((hit.M - previous.M) / momentScale, (hit.P - previous.P) / forceScale) <= PREVIEW_GEOMETRY_TOL) {
      previous.sources.push(...hit.sources)
      for (const sign of hit.signs) previous.signs.add(sign)
    } else merged.push(hit)
  }
  const points = merged.map(({ signs, ...hit }): PmPathIntersection => ({
    ...hit, kind: signs.has(-1) && signs.has(1) ? 'crossing' : 'contact'
  }))
  if (segments.length) return { status: 'overlap', points, segments }
  return points.length ? { status: 'intersections', points } : { status: 'no-intersection', points: [] }
}
