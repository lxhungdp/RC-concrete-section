import type { CompiledMaterial, SteelMaterial } from '../types'
import { clamp } from '../math'

const designFy = (material: SteelMaterial) => material.fy / (material.factors?.gammaS ?? 1)

export const stressElasticPerfectlyPlasticSteel = (material: SteelMaterial, strain: number) =>
  clamp(material.elasticModulus * strain, -designFy(material), designFy(material))

export const compileElasticPerfectlyPlasticSteel = (material: SteelMaterial): CompiledMaterial => {
  const epsY = material.limits?.epsY ?? designFy(material) / material.elasticModulus
  return {
    id: material.id,
    family: 'steel',
    stress: (strain) => stressElasticPerfectlyPlasticSteel(material, strain),
    tangent: (strain) => (Math.abs(strain) < epsY ? material.elasticModulus : 0),
    limits: {
      epsYield: epsY,
      epsCompressionUltimate: material.limits?.epsU,
      epsTensionUltimate: material.limits?.epsU
    }
  }
}
