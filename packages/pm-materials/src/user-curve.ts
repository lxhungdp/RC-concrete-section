import type { CompiledMaterial, ConcreteMaterial, SteelMaterial, StressStrainPoint } from './types'
import { interpolateSorted, interpolateSortedTangent, type SortedCurve } from './math'

const validatedCurve = (points: readonly StressStrainPoint[]): SortedCurve => {
  if (points.length < 2) throw new Error('A user curve requires at least two points.')
  const curve = points.map((point, index) => {
    if (!Number.isFinite(point.strain) || !Number.isFinite(point.stress)) {
      throw new Error(`User-curve point ${index} must contain finite strain and stress.`)
    }
    if (index > 0 && !(point.strain > points[index - 1].strain)) {
      throw new Error(`User-curve strain at point ${index} must be strictly increasing.`)
    }
    return { ...point }
  })
  return curve
}

const compileUserCurve = (
  id: number,
  family: 'concrete' | 'steel',
  points: StressStrainPoint[],
  limits: CompiledMaterial['limits'],
  zeroTension = false
): CompiledMaterial => {
  const sorted = validatedCurve(points)
  const stress = (strain: number) => {
    if (zeroTension && strain <= 0) return 0
    return interpolateSorted(sorted, strain)
  }

  return {
    id,
    family,
    stress,
    tangent: (strain) => (zeroTension && strain <= 0 ? 0 : interpolateSortedTangent(sorted, strain)),
    limits
  }
}

export const compileConcreteUserCurve = (material: ConcreteMaterial) => {
  const model = material.stressStrain.type === 'user-curve' ? material.stressStrain : null
  if (model?.interpolation !== 'linear' || model.extrapolation !== 'clamp') {
    throw new Error('A concrete user curve requires linear interpolation and clamp extrapolation.')
  }
  const scale = material.factors?.resistanceScale ?? 1
  return compileUserCurve(
    material.id,
    'concrete',
    (model?.points ?? []).map((point) => ({ ...point, stress: point.stress * scale })),
    { epsCompressionUltimate: material.limits.epsCu },
    model?.zeroTension ?? material.limits.ignoreTension
  )
}

export const compileSteelUserCurve = (material: SteelMaterial) => {
  const model = material.stressStrain.type === 'user-curve' ? material.stressStrain : null
  if (model?.interpolation !== 'linear' || model.extrapolation !== 'clamp') {
    throw new Error('A steel user curve requires linear interpolation and clamp extrapolation.')
  }
  return compileUserCurve(
    material.id,
    'steel',
    model?.points ?? [],
    {
      epsYield: material.limits?.epsY,
      epsCompressionUltimate: material.limits?.epsU,
      epsTensionUltimate: material.limits?.epsU
    }
  )
}
