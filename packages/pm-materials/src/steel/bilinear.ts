import type { CompiledMaterial, SteelMaterial } from '../types'

const designFy = (material: SteelMaterial) =>
  material.fy /
  (material.factors?.gammaS ?? 1) *
  (material.factors?.resistanceScale ?? 1)

type BilinearParams = {
  elasticModulus: number
  fy: number
  epsY: number
  /** `Es * hardeningRatio` — left-associative in the original expression, so hoisting is exact. */
  hardeningModulus: number
  hardeningRatio: number
}

const resolveBilinearParams = (material: SteelMaterial): BilinearParams => {
  const model = material.stressStrain.type === 'bilinear' ? material.stressStrain : null
  const hardeningRatio = Math.max(0, model?.hardeningRatio ?? 0.01)
  const fy = designFy(material)
  return {
    elasticModulus: material.elasticModulus,
    fy,
    epsY: material.limits?.epsY ?? fy / material.elasticModulus,
    hardeningModulus: material.elasticModulus * hardeningRatio,
    hardeningRatio
  }
}

const stressFrom = (params: BilinearParams, strain: number) => {
  const absStrain = Math.abs(strain)
  const sign = strain < 0 ? -1 : 1
  if (absStrain <= params.epsY) return params.elasticModulus * strain
  return sign * (params.fy + params.hardeningModulus * (absStrain - params.epsY))
}

export const stressBilinearSteel = (material: SteelMaterial, strain: number) =>
  stressFrom(resolveBilinearParams(material), strain)

export const compileBilinearSteel = (material: SteelMaterial): CompiledMaterial => {
  const params = resolveBilinearParams(material)
  return {
    id: material.id,
    family: 'steel',
    stress: (strain) => stressFrom(params, strain),
    tangent: (strain) => (Math.abs(strain) <= params.epsY ? params.elasticModulus : params.hardeningModulus),
    limits: {
      epsYield: params.epsY,
      epsCompressionUltimate: material.limits?.epsU,
      epsTensionUltimate: material.limits?.epsU
    }
  }
}
