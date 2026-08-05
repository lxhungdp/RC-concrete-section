import {
  AS3600_EPS_CU,
  AS3600_STEEL_ES,
  as3600Alpha2,
  as3600Gamma
} from '@pm/code-as3600'
import type { ConcreteMaterial, SteelMaterial } from '../types'

export { AS3600_EPS_CU, AS3600_STEEL_ES, as3600Alpha2, as3600Gamma } from '@pm/code-as3600'

export const applyAs3600ConcreteDerived = (material: ConcreteMaterial): ConcreteMaterial => {
  if (material.standard !== 'AS3600') return material
  const alpha2 = as3600Alpha2(material.fck)
  const gamma = as3600Gamma(material.fck)
  return {
    ...material,
    stressStrain: {
      type: 'as3600-equivalent-block',
      alpha2,
      gamma,
      epsCu: AS3600_EPS_CU
    },
    limits: {
      ...material.limits,
      eps0: undefined,
      epsCu: AS3600_EPS_CU,
      ignoreTension: true
    },
    factors: {
      ...material.factors,
      alpha: alpha2,
      gammaC: undefined
    }
  }
}

export const applyAs3600SteelDerived = (material: SteelMaterial): SteelMaterial => {
  if (material.standard !== 'AS3600') return material
  return {
    ...material,
    elasticModulus: AS3600_STEEL_ES,
    stressStrain: { type: 'elastic-perfectly-plastic' },
    limits: {
      ...material.limits,
      epsY: material.fy / AS3600_STEEL_ES
    },
    factors: {
      ...material.factors,
      gammaS: undefined
    }
  }
}
