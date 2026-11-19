import type { ConcreteMaterial, SteelMaterial } from '../types'
import { aciBeta1 } from '../concrete/aci-whitney'

export const ACI318_CONCRETE_ALPHA = 0.85
export const ACI318_CONCRETE_EPS_CU = 0.003
export const ACI318_STEEL_ES = 200000

export const aci318ConcreteElasticModulus = (fc: number) => 4700 * Math.sqrt(Math.max(fc, 0))

export const applyAci318ConcreteDerived = (material: ConcreteMaterial): ConcreteMaterial => {
  if (material.standard !== 'ACI318') return material
  const epsCu = ACI318_CONCRETE_EPS_CU
  return {
    ...material,
    elasticModulus: aci318ConcreteElasticModulus(material.fck),
    stressStrain: {
      type: 'aci-whitney-block',
      beta1: aciBeta1(material.fck),
      epsCu,
      alpha: ACI318_CONCRETE_ALPHA
    },
    limits: {
      ...material.limits,
      eps0: undefined,
      epsCu
    },
    factors: {
      ...material.factors,
      alpha: ACI318_CONCRETE_ALPHA,
      gammaC: undefined
    }
  }
}

export const applyAci318SteelDerived = (material: SteelMaterial): SteelMaterial => {
  if (material.standard !== 'ACI318') return material
  const elasticModulus = ACI318_STEEL_ES
  return {
    ...material,
    elasticModulus,
    limits: {
      ...material.limits,
      epsY: material.fy / elasticModulus
    },
    factors: {
      ...material.factors,
      gammaS: undefined
    }
  }
}
