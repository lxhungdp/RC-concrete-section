export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const positiveOr = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback

export type SortedCurve = ReadonlyArray<{ strain: number; stress: number }>

/** Sort once, so a tabulated law does not re-sort its table on every fibre of every strain plane. */
export const sortCurvePoints = (points: Array<{ strain: number; stress: number }>): SortedCurve =>
  [...points].sort((a, b) => a.strain - b.strain)

/**
 * Interpolate on an already-sorted table. Identical arithmetic to the unsorted entry point below,
 * including the first-matching-interval rule, which matters when the table repeats a strain.
 */
export const interpolateSorted = (sorted: SortedCurve, strain: number) => {
  if (sorted.length === 0) return 0
  if (strain <= sorted[0].strain) return sorted[0].stress
  if (strain >= sorted[sorted.length - 1].strain) return sorted[sorted.length - 1].stress

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (strain >= a.strain && strain <= b.strain) {
      const t = (strain - a.strain) / Math.max(1e-12, b.strain - a.strain)
      return a.stress + (b.stress - a.stress) * t
    }
  }

  return 0
}

/**
 * Deterministic derivative of {@link interpolateSorted}.
 *
 * The interpolator clamps outside the tabulated domain, so the tangent is zero there. At an
 * interior breakpoint it uses the segment on the left, matching interpolateSorted's
 * first-matching-interval rule. Strict material validation will eventually reject duplicate
 * strains; until then the same 1e-12 denominator guard as the stress interpolation keeps preview
 * evaluation finite and deterministic.
 */
export const interpolateSortedTangent = (sorted: SortedCurve, strain: number) => {
  if (sorted.length < 2 || strain <= sorted[0].strain || strain >= sorted[sorted.length - 1].strain) return 0

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (strain >= a.strain && strain <= b.strain) {
      return (b.stress - a.stress) / Math.max(1e-12, b.strain - a.strain)
    }
  }

  return 0
}

export const interpolateLinear = (
  points: Array<{ strain: number; stress: number }>,
  strain: number
) => interpolateSorted(sortCurvePoints(points), strain)

export const numericalTangent = (stress: (strain: number) => number, strain: number) => {
  const h = 1e-7
  return (stress(strain + h) - stress(strain - h)) / (2 * h)
}
