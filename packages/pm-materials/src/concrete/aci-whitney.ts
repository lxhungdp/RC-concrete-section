import type { CompiledMaterial, ConcreteMaterial } from '../types'

export const aciBeta1 = (fc: number) => Math.max(0.65, Math.min(0.85, 0.85 - Math.max(0, fc - 28) * 0.05 / 7))

export const stressAciWhitneyConcrete = (material: ConcreteMaterial, strain: number) => {
  const model = material.stressStrain.type === 'aci-whitney-block' ? material.stressStrain : null
  const epsCu = model?.epsCu ?? material.limits.epsCu
  const alpha = model?.alpha ?? material.factors?.alpha ?? 0.85
  if (strain <= 0 && material.limits.ignoreTension) return 0
  if (strain <= 0 || strain > epsCu) return 0
  return alpha * material.fck
}

export const compileAciWhitneyConcrete = (material: ConcreteMaterial): CompiledMaterial => {
  const stress = (strain: number) => stressAciWhitneyConcrete(material, strain)
  return {
    id: material.id,
    family: 'concrete',
    stress,
    tangent: () => 0,
    limits: {
      epsCompressionUltimate: material.limits.epsCu
    }
  }
}
