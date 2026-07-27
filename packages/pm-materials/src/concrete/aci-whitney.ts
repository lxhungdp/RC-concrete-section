import type { CompiledMaterial, ConcreteMaterial } from '../types'

export const aciBeta1 = (fc: number) => Math.max(0.65, Math.min(0.85, 0.85 - Math.max(0, fc - 28) * 0.05 / 7))

export const stressAciWhitneyConcrete = (material: ConcreteMaterial, strain: number) => {
  const model = material.stressStrain.type === 'aci-whitney-block' ? material.stressStrain : null
  const epsCu = model?.epsCu ?? material.limits.epsCu
  const alphaSource =
    material.factors?.gammaC !== undefined ? material.factors?.alpha ?? model?.alpha : model?.alpha ?? material.factors?.alpha
  const alpha = (alphaSource ?? 0.85) / (material.factors?.gammaC ?? 1)
  if (strain <= 0 && material.limits.ignoreTension) return 0
  if (strain <= 0 || strain > epsCu) return 0
  return alpha * material.fck
}

export const compileAciWhitneyConcrete = (material: ConcreteMaterial): CompiledMaterial => {
  const model = material.stressStrain.type === 'aci-whitney-block' ? material.stressStrain : null
  const epsCu = model?.epsCu ?? material.limits.epsCu
  const alphaSource =
    material.factors?.gammaC !== undefined
      ? material.factors?.alpha ?? model?.alpha
      : model?.alpha ?? material.factors?.alpha
  const peak = ((alphaSource ?? 0.85) / (material.factors?.gammaC ?? 1)) * material.fck
  return {
    id: material.id,
    family: 'concrete',
    stress: (strain) => (strain <= 0 || strain > epsCu ? 0 : peak),
    tangent: () => 0,
    limits: {
      epsCompressionUltimate: material.limits.epsCu
    }
  }
}
