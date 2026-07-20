import type { CompiledMaterial, SteelMaterial } from '../types'

export const stressBilinearSteel = (material: SteelMaterial, strain: number) => {
  const model = material.stressStrain.type === 'bilinear' ? material.stressStrain : null
  const hardeningRatio = Math.max(0, model?.hardeningRatio ?? 0.01)
  const epsY = material.limits?.epsY ?? material.fy / material.elasticModulus
  const absStrain = Math.abs(strain)
  const sign = strain < 0 ? -1 : 1
  if (absStrain <= epsY) return material.elasticModulus * strain
  return sign * (material.fy + material.elasticModulus * hardeningRatio * (absStrain - epsY))
}

export const compileBilinearSteel = (material: SteelMaterial): CompiledMaterial => {
  const model = material.stressStrain.type === 'bilinear' ? material.stressStrain : null
  const epsY = material.limits?.epsY ?? material.fy / material.elasticModulus
  return {
    id: material.id,
    family: 'steel',
    stress: (strain) => stressBilinearSteel(material, strain),
    tangent: (strain) =>
      Math.abs(strain) <= epsY ? material.elasticModulus : material.elasticModulus * Math.max(0, model?.hardeningRatio ?? 0.01),
    limits: {
      epsYield: epsY,
      epsCompressionUltimate: material.limits?.epsU,
      epsTensionUltimate: material.limits?.epsU
    }
  }
}
