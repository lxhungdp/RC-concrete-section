/**
 * Geometry-derived supplementary strain-gradient directions for Fixed surface sampling.
 *
 * Every angle here is a gradient angle `theta`: the compression-increasing strain direction is
 * `g = (cos theta, sin theta)` in the section x-y frame, counter-clockwise from +x, in [0, 2 pi).
 * Each mechanics maps it to its own convention (fibre beta = pi/2 - theta; block normal = theta).
 * The rules and their evidence are recorded in docs/05-pm-diagram-stations-angles-plotting.md §3.
 * No numerical tolerance other than the coincidence test below is involved: the directions are exact
 * geometric events, not sampled estimates.
 */
import { convexHull } from './mesh'

type XY = { readonly x: number; readonly y: number }

const TAU = 2 * Math.PI

export const wrapGradientAngle = (angle: number) => {
  const wrapped = angle % TAU
  return wrapped < 0 ? wrapped + TAU : wrapped
}

export type SamplingDirectionSource = 'seed' | 'tension-control-event' | 'normalized-gap'
export type SamplingDirection = { angle: number; source: SamplingDirectionSource }

/**
 * Directions at which the deepest (minimum-projection) point of `points` changes. With
 * `g . p` minimised by a convex-hull vertex, the minimiser switches exactly when `g` is opposite
 * an outward hull-edge normal. Station states and the controlling tensile strain both have a
 * crease there (audit finding F-02, docs/task-packets/2026-11-11-f02-tension-control-event-directions.md).
 * Fewer than two distinct points have no switch; collinear points give the two directions
 * perpendicular to their line.
 */
export const supportSwitchGradientAngles = (points: readonly XY[]): number[] => {
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new RangeError('Support-switch directions require finite coordinates.')
  }
  const hull = convexHull(points.map(({ x, y }) => ({ x, y })))
  if (hull.length < 2) return []
  const angles: number[] = []
  for (let index = 0; index < hull.length; index += 1) {
    const a = hull[index]
    const b = hull[(index + 1) % hull.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    if (Math.hypot(dx, dy) === 0) continue
    // The hull is counter-clockwise, so (dy, -dx) points outward; the minimiser switches at g = -n.
    angles.push(wrapGradientAngle(Math.atan2(dx, -dy)))
  }
  return [...new Set(angles)].sort((left, right) => left - right)
}

type Covariance = { readonly xx: number; readonly yy: number; readonly xy: number }

/** `C^(1/2)` of a symmetric positive-definite 2x2 matrix: `(C + sqrt(det) I) / sqrt(tr + 2 sqrt(det))`. */
const covarianceRoot = ({ xx, yy, xy }: Covariance) => {
  const scale = Math.max(xx, yy, Math.abs(xy))
  xx /= scale; yy /= scale; xy /= scale
  const det = xx * yy - xy * xy
  if (!(xx > 0) || !(det > 0)) return null
  const s = Math.sqrt(det)
  const t = Math.sqrt(xx + yy + 2 * s)
  const a = (xx + s) / t, b = xy / t, c = (yy + s) / t
  return { a, b, c, det: a * c - b * b }
}

/**
 * F-03(a): directions that keep every gap of the inertia-normalized gradient angle at or below
 * `maxGap`. The map `g -> S g` with `S = C^(1/2)` of the net-concrete area covariance turns an
 * elongated section into an isotropic one, where a uniform angular step cuts the section uniformly.
 * The map is linear with a positive determinant, so it preserves the cyclic order of directions.
 * Each gap of normalized width `d` receives `ceil(d / maxGap) - 1` equally spaced directions, so the
 * total row count never exceeds twice the existing rows. Returned angles are gradient angles.
 */
export const normalizedGapGradientAngles = (
  angles: readonly number[],
  covariance: Covariance,
  maxGap: number
): number[] => {
  if (![covariance.xx, covariance.yy, covariance.xy, maxGap, ...angles].every(Number.isFinite) || !(maxGap > 0)) {
    throw new RangeError('Normalized-gap directions require finite angles, covariance and a positive gap.')
  }
  const root = covarianceRoot(covariance)
  const sorted = [...new Set(angles.map(wrapGradientAngle))].sort((left, right) => left - right)
  if (!root) throw new RangeError('Normalized-gap directions require positive-definite covariance.')
  if (sorted.length === 0) return []
  const normalized = (theta: number) =>
    wrapGradientAngle(Math.atan2(root.b * Math.cos(theta) + root.c * Math.sin(theta), root.a * Math.cos(theta) + root.b * Math.sin(theta)))
  const original = (phi: number) => {
    const u = Math.cos(phi), v = Math.sin(phi)
    return wrapGradientAngle(Math.atan2(-root.b * u + root.a * v, root.c * u - root.b * v))
  }
  const added: number[] = []
  sorted.forEach((theta, index) => {
    const start = normalized(theta)
    const next = sorted.length === 1 ? theta : sorted[(index + 1) % sorted.length]
    const width = sorted.length === 1 ? TAU : wrapGradientAngle(normalized(next) - start)
    const inserts = Math.max(0, Math.ceil(width / maxGap - 1e-9) - 1)
    for (let k = 1; k <= inserts; k += 1) added.push(original(start + k * width / (inserts + 1)))
  })
  return added
}

const angularDistance = (left: number, right: number) => {
  const difference = Math.abs(wrapGradientAngle(left) - wrapGradientAngle(right))
  return Math.min(difference, TAU - difference)
}

/**
 * Sorted union of sampling directions. An added direction within `tolerance` radians of one
 * already present is the same row: the earlier entry, and so a seed, keeps its exact value.
 */
export const mergeSamplingDirections = (
  base: readonly SamplingDirection[],
  added: readonly SamplingDirection[],
  tolerance = 1e-9
): SamplingDirection[] => {
  const merged: SamplingDirection[] = base.map(({ angle, source }) => ({ angle: wrapGradientAngle(angle), source }))
  for (const candidate of added) {
    const angle = wrapGradientAngle(candidate.angle)
    if (merged.some((existing) => angularDistance(existing.angle, angle) <= tolerance)) continue
    merged.push({ angle, source: candidate.source })
  }
  return merged.sort((left, right) => left.angle - right.angle)
}
