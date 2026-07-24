import type { CompiledMaterial, ConcreteMaterial } from '../types'
import { numericalTangent, positiveOr } from '../math'

export const stressKdsParabolicConcrete = (material: ConcreteMaterial, strain: number) => {
  const model = material.stressStrain.type === 'kds-parabolic' ? material.stressStrain : null
  const eps0 = positiveOr(model?.eps0 ?? material.limits.eps0, 0.002)
  const epsCu = positiveOr(model?.epsCu ?? material.limits.epsCu, 0.0033)
  const n = positiveOr(model?.n, 2)
  const alphaSource =
    material.factors?.gammaC !== undefined ? material.factors?.alpha ?? model?.alpha : model?.alpha ?? material.factors?.alpha
  const alpha = positiveOr(alphaSource, 0.85) / positiveOr(material.factors?.gammaC, 1)

  if (strain <= 0 && material.limits.ignoreTension) return 0
  if (strain <= 0 || strain > epsCu) return 0
  if (strain <= eps0) return alpha * material.fck * (1 - Math.pow(1 - strain / eps0, n))
  return alpha * material.fck
}

export const compileKdsParabolicConcrete = (material: ConcreteMaterial): CompiledMaterial => {
  const stress = (strain: number) => stressKdsParabolicConcrete(material, strain)
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
