import type { SectionFieldMap, StrainState } from '@pm/results/contracts'

type Extreme = { value: number; barId: number }

export type SectionFieldSummary = {
  concrete: {
    /** Plane strain at the calculation origin, which is the net-concrete centroid (`e0`). */
    centroidStrain: number
    maxStrain: number
    minStrain: number
    maxStress: number
    minStress: number
  }
  /** Null for a section without bars. Strains and stresses are compression-positive. */
  rebar: {
    maxStrain: Extreme
    minStrain: Extreme
    maxStress: Extreme
    minStress: Extreme
    /**
     * The most tensile bar (review item 6). Its perpendicular distance from the neutral axis is
     * `-εs / κ` with `κ = hypot(kx, ky)`; null when the bar is not in tension or the plane is uniform.
     */
    outermostTension: { barId: number; strain: number; stress: number; distanceFromNeutralAxis: number | null } | null
  } | null
}

/**
 * Concrete and reinforcement extremes of one displayed section field (2026-11-09 review item 9).
 *
 * Concrete values come from the field map's mesh triangles. An equivalent block has no mesh: its
 * concrete strain is the plane evaluated at the exact section boundary vertices, and its stress is
 * zero or the declared block stress. Reinforcement values come from the map's bars. No resistance,
 * factor or constitutive law is evaluated here.
 */
export const summarizeSectionField = (
  map: SectionFieldMap,
  state: StrainState,
  boundary: ReadonlyArray<{ x: number; y: number }>
): SectionFieldSummary | null => {
  const strainAt = (x: number, y: number) => state.e0 + state.kx * (y - map.origin.y) + state.ky * (x - map.origin.x)
  const concreteStrains: number[] = []
  const concreteStresses: number[] = []
  if (map.equivalentBlock) {
    for (const point of boundary) concreteStrains.push(strainAt(point.x, point.y))
    concreteStresses.push(0, map.equivalentBlock.compressionStress)
  } else {
    for (const tri of map.triangles) {
      concreteStrains.push(tri.strainA, tri.strainB, tri.strainC)
      concreteStresses.push(tri.stressA, tri.stressB, tri.stressC)
    }
  }
  const values = [...concreteStrains, ...concreteStresses, state.e0, state.kx, state.ky]
  if (concreteStrains.length === 0 || !values.every(Number.isFinite)) return null
  const fold = (items: number[], pick: (a: number, b: number) => number) => items.reduce((a, b) => pick(a, b))
  const extreme = (key: 'strain' | 'stress', sign: 1 | -1): Extreme => map.rebars.reduce<Extreme | null>((best, bar) =>
    best === null || sign * bar[key] > sign * best.value ? { value: bar[key], barId: bar.id } : best, null)!
  let rebar: SectionFieldSummary['rebar'] = null
  if (map.rebars.length > 0 && map.rebars.every(bar => Number.isFinite(bar.strain) && Number.isFinite(bar.stress))) {
    const minStrain = extreme('strain', -1)
    const tensile = map.rebars.find(bar => bar.id === minStrain.barId && bar.strain < 0)
    const curvature = Math.hypot(state.kx, state.ky)
    rebar = {
      maxStrain: extreme('strain', 1), minStrain,
      maxStress: extreme('stress', 1), minStress: extreme('stress', -1),
      outermostTension: tensile ? { barId: tensile.id, strain: tensile.strain, stress: tensile.stress,
        distanceFromNeutralAxis: curvature > 0 ? -tensile.strain / curvature : null } : null
    }
  }
  return {
    concrete: {
      centroidStrain: state.e0,
      maxStrain: fold(concreteStrains, Math.max), minStrain: fold(concreteStrains, Math.min),
      maxStress: fold(concreteStresses, Math.max), minStress: fold(concreteStresses, Math.min)
    },
    rebar
  }
}
