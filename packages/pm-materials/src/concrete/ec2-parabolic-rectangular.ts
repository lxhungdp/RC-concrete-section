import type { CompiledMaterial, ConcreteMaterial } from '../types'
import { numericalTangent, positiveOr } from '../math'

export const stressEc2ParabolicRectangularConcrete = (material: ConcreteMaterial, strain: number) => {
  const model = material.stressStrain.type === 'ec2-parabolic-rectangular' ? material.stressStrain : null
  const epsC2 = positiveOr(model?.epsC2 ?? material.limits.eps0, 0.002)
  const epsCu2 = positiveOr(model?.epsCu2 ?? material.limits.epsCu, 0.0035)
  const n = positiveOr(model?.n, 2)
  const alphaSource =
    material.factors?.gammaC !== undefined ? material.factors?.alpha ?? model?.alpha : model?.alpha ?? material.factors?.alpha
  const alpha = positiveOr(alphaSource, 1) / positiveOr(material.factors?.gammaC, 1)

  if (strain <= 0 && material.limits.ignoreTension) return 0
  if (strain <= 0 || strain > epsCu2) return 0
  if (strain <= epsC2) return alpha * material.fck * (1 - Math.pow(1 - strain / epsC2, n))
  return alpha * material.fck
}

export const compileEc2ParabolicRectangularConcrete = (material: ConcreteMaterial): CompiledMaterial => {
  const stress = (strain: number) => stressEc2ParabolicRectangularConcrete(material, strain)
  return {
    id: material.id,
    family: 'concrete',
    stress,
    tangent: (strain) => numericalTangent(stress, strain),
    limits: {
      epsCompressionUltimate: material.limits.epsCu
    }
  }
}
