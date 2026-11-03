import type { GroupSupport } from '@pm/geometry'
import type { CompiledMaterial } from '@pm/materials'

type Plane = { e0: number; kx: number; ky: number }
type Point = { x: number; y: number; steel: CompiledMaterial }
type Bound = { strain: number; projection: number }

/** Boundary of the compatible steel/concrete strain inequalities for one actual direction. */
export const createSteelStrainBoundary = <T extends Point>(
  groups: readonly GroupSupport<T>[],
  concreteProjection: number,
  concreteLimit: number,
  normalX: number,
  normalY: number,
  tolerance: number
) => {
  const lower: Bound[] = []
  const upper: Bound[] = [{ strain: concreteLimit, projection: concreteProjection }]
  for (const group of groups) {
    const limits = group.minimum.steel.limits
    if (limits.epsTensionUltimate !== undefined) lower.push({ strain: -limits.epsTensionUltimate, projection: group.minimumProjection })
    if (limits.epsCompressionUltimate !== undefined) upper.push({ strain: limits.epsCompressionUltimate, projection: group.maximumProjection })
  }
  if (lower.length === 0) return null
  let maxCurvature = Number.POSITIVE_INFINITY
  for (const a of lower) {
    for (const b of upper) {
      const span = b.projection - a.projection
      if (span > 0) maxCurvature = Math.min(maxCurvature, (b.strain - a.strain) / span)
    }
  }
  if (!Number.isFinite(maxCurvature) || maxCurvature <= 0) throw new RangeError('The declared steel strain domain has no finite compatible boundary.')
  const minimumE0 = (curvature: number) => lower.reduce((value, bound) => Math.max(value, bound.strain - curvature * bound.projection), Number.NEGATIVE_INFINITY)
  const maximumE0 = (curvature: number) => upper.reduce((value, bound) => Math.min(value, bound.strain - curvature * bound.projection), Number.POSITIVE_INFINITY)
  const plane = (e0: number, curvature: number): Plane => ({ e0, kx: curvature * normalY, ky: curvature * normalX })
  const constrain = (state: Plane): Plane => {
    const requestedCurvature = Math.hypot(state.kx, state.ky)
    const curvature = Math.min(maxCurvature, requestedCurvature)
    const min = minimumE0(curvature)
    const max = maximumE0(curvature)
    if (curvature === requestedCurvature && state.e0 >= min && state.e0 <= max) return state
    return plane(Math.max(min, Math.min(max, state.e0)), curvature)
  }
  const transition = (source: Plane, ratio: number): Plane => {
    const start = constrain(source)
    const position = Math.max(0, Math.min(1, ratio)) * 2
    if (position <= 1) {
      const curvature = Math.hypot(start.kx, start.ky) * (1 - position) + maxCurvature * position
      return plane(start.e0 * (1 - position) + minimumE0(maxCurvature) * position, curvature)
    }
    const curvature = maxCurvature * (2 - position)
    return plane(minimumE0(curvature), curvature)
  }
  const interpolate = (left: Plane, right: Plane, ratio: number): Plane => {
    const a = Math.hypot(left.kx, left.ky)
    const b = Math.hypot(right.kx, right.ky)
    const curvature = a + (b - a) * ratio
    const steelControlled = (state: Plane, value: number) => Math.abs(state.e0 - minimumE0(value)) <= tolerance * Math.max(concreteLimit, Math.abs(state.e0))
    if (steelControlled(left, a) && steelControlled(right, b)) return plane(minimumE0(curvature), curvature)
    return constrain(plane(left.e0 + (right.e0 - left.e0) * ratio, curvature))
  }
  return { constrain, transition, interpolate, minimumE0, maxCurvature }
}

export type SteelStrainBoundary = NonNullable<ReturnType<typeof createSteelStrainBoundary>>
