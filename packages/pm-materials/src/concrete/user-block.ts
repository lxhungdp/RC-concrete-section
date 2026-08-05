import type { CompiledMaterial, ConcreteMaterial } from '../types'

export const DEFAULT_USER_BLOCK_ALPHA = 0.85
export const DEFAULT_USER_BLOCK_BETA1 = 0.8
export const DEFAULT_USER_BLOCK_EPS_CU = 0.003

/**
 * Uniform block stress used by the equivalent-block adapter.
 *
 * `alpha` is the complete stress factor the user owns: KDS writes it as `eta * 0.85`, ACI as
 * `0.85`. The kernel never reconstructs it from a code table.
 */
export const userBlockCompressionStress = (material: ConcreteMaterial) => {
  const model = material.stressStrain.type === 'user-block' ? material.stressStrain : null
  const alpha = model?.alpha ?? material.factors?.alpha ?? DEFAULT_USER_BLOCK_ALPHA
  return (
    alpha /
    (material.factors?.gammaC ?? 1) *
    (material.factors?.resistanceScale ?? 1) *
    material.fck
  )
}

/**
 * Rendered so the Materials preview can draw the block, never evaluated as a fibre law: the
 * compile route is guarded by `UNSUPPORTED_CONCRETE_MODELS`, exactly as for the Whitney block.
 */
export const compileUserBlockConcrete = (material: ConcreteMaterial): CompiledMaterial => {
  const model = material.stressStrain.type === 'user-block' ? material.stressStrain : null
  const epsCu = model?.epsCu ?? material.limits.epsCu
  const peak = userBlockCompressionStress(material)
  return {
    id: material.id,
    family: 'concrete',
    stress: (strain) => (strain <= 0 || strain > epsCu ? 0 : peak),
    tangent: () => 0,
    limits: {
      epsCompressionUltimate: epsCu
    }
  }
}
