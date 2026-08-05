import type { CompiledMaterial, ConcreteMaterial } from '../types'

/**
 * Storage/rendering compiler only. The fibre kernel blocks this resultant-equivalent law; the
 * AS 3600 calculation profile routes it through `@pm/analysis-equivalent-block`.
 */
export const compileAs3600BlockConcrete = (material: ConcreteMaterial): CompiledMaterial => {
  const model = material.stressStrain.type === 'as3600-equivalent-block' ? material.stressStrain : null
  const epsCu = model?.epsCu ?? material.limits.epsCu
  const peak = (model?.alpha2 ?? material.factors?.alpha ?? 0.67) * material.fck
  return {
    id: material.id,
    family: 'concrete',
    stress: (strain) => (strain <= 0 || strain > epsCu ? 0 : peak),
    tangent: () => 0,
    limits: { epsCompressionUltimate: epsCu }
  }
}
