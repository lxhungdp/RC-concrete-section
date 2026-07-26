import type { CompiledMaterial, SteelMaterial } from '../types'
import { clamp } from '../math'

const designFy = (material: SteelMaterial) => material.fy / (material.factors?.gammaS ?? 1)

export const stressElasticPerfectlyPlasticSteel = (material: SteelMaterial, strain: number) =>
  clamp(material.elasticModulus * strain, -designFy(material), designFy(material))

export const compileElasticPerfectlyPlasticSteel = (material: SteelMaterial): CompiledMaterial => {
  // Hoisted out of the fibre loop; the arithmetic per call is unchanged.
  const fyd = designFy(material)
  const elasticModulus = material.elasticModulus
  const epsY = material.limits?.epsY ?? fyd / elasticModulus
  return {
    id: material.id,
    family: 'steel',
    stress: (strain) => clamp(elasticModulus * strain, -fyd, fyd),
    tangent: (strain) => (Math.abs(strain) < epsY ? elasticModulus : 0),
    limits: {
      epsYield: epsY,
      epsCompressionUltimate: material.limits?.epsU,
      epsTensionUltimate: material.limits?.epsU
    }
  }
}
