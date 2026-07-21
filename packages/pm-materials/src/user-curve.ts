import type { CompiledMaterial, ConcreteMaterial, SteelMaterial, StressStrainPoint } from './types'
import { interpolateLinear, numericalTangent } from './math'

const compileUserCurve = (
  id: number,
  family: 'concrete' | 'steel',
  points: StressStrainPoint[],
  limits: CompiledMaterial['limits'],
  zeroTension = false
): CompiledMaterial => {
  const stress = (strain: number) => {
    if (zeroTension && strain <= 0) return 0
    return interpolateLinear(points, strain)
  }

  return {
    id,
    family,
    stress,
    tangent: (strain) => numericalTangent(stress, strain),
    limits
  }
}

export const compileConcreteUserCurve = (material: ConcreteMaterial) => {
  const model = material.stressStrain.type === 'user-curve' ? material.stressStrain : null
  return compileUserCurve(
    material.id,
    'concrete',
    model?.points ?? [],
    { epsCompressionUltimate: material.limits.epsCu },
    model?.zeroTension ?? material.limits.ignoreTension
  )
}

export const compileSteelUserCurve = (material: SteelMaterial) => {
  const model = material.stressStrain.type === 'user-curve' ? material.stressStrain : null
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
