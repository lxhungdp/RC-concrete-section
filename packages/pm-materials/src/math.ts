export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const positiveOr = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback

export const interpolateLinear = (
  points: Array<{ strain: number; stress: number }>,
  strain: number
) => {
  const sorted = [...points].sort((a, b) => a.strain - b.strain)
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

export const numericalTangent = (stress: (strain: number) => number, strain: number) => {
  const h = 1e-7
  return (stress(strain + h) - stress(strain - h)) / (2 * h)
}
