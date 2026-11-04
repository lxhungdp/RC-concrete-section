import { finiteCompiledMaterial } from '../compiled'
import { assertValidSteelMaterial } from '../validation'
import type { CompiledMaterial, SteelMaterial } from '../types'
import { clamp } from '../math'

const designFy = (material: SteelMaterial) =>
  material.fy /
  (material.factors?.gammaS ?? 1) *
  (material.factors?.resistanceScale ?? 1)

export const stressElasticPerfectlyPlasticSteel = (material: SteelMaterial, strain: number) =>
  clamp(material.elasticModulus * strain, -designFy(material), designFy(material))

export const compileElasticPerfectlyPlasticSteel = (material: SteelMaterial): CompiledMaterial => {
  assertValidSteelMaterial(material, 'elastic-perfectly-plastic')
  // Hoisted out of the fibre loop; the arithmetic per call is unchanged.
  const fyd = designFy(material)
  const elasticModulus = material.elasticModulus
  const epsY = fyd / elasticModulus
  return finiteCompiledMaterial({
    id: material.id,
    family: 'steel',
    stress: (strain) => clamp(elasticModulus * strain, -fyd, fyd),
    tangent: (strain) => (Math.abs(strain) < epsY ? elasticModulus : 0),
    limits: {
      epsYield: epsY,
      epsCompressionUltimate: material.limits?.epsU,
      epsTensionUltimate: material.limits?.epsU
    }
  })
}
