import type { ConcreteMaterial, SteelMaterial } from '../types'
import {
  EN1992_ALPHA_CC,
  EN1992_GAMMA_C,
  EN1992_GAMMA_S,
  EN1992_STEEL_ES,
  en1992ConcreteElasticModulus,
  en1992MeanCompressiveStrength,
  en1992ParabolicRectangularParameters
} from '@pm/code-en1992'

export {
  EN1992_ALPHA_CC,
  EN1992_GAMMA_C,
  EN1992_GAMMA_S,
  EN1992_STEEL_ES,
  en1992ConcreteElasticModulus,
  en1992MeanCompressiveStrength,
  en1992ParabolicRectangularParameters
} from '@pm/code-en1992'

const ec2StressScale = (material: ConcreteMaterial) =>
  (material.factors?.alpha ?? EN1992_ALPHA_CC) /
  (material.factors?.gammaC ?? 1) *
  (material.factors?.resistanceScale ?? 1)

export const applyEn1992ConcreteDerived = (material: ConcreteMaterial): ConcreteMaterial => {
  if (material.standard !== 'EC2') return material
  const alpha = material.factors?.alpha ?? EN1992_ALPHA_CC
  const gammaC = material.factors?.gammaC
  const parameters = en1992ParabolicRectangularParameters(material.fck)
  return {
    ...material,
    elasticModulus: en1992ConcreteElasticModulus(material.fck),
    stressStrain: {
      type: 'ec2-parabolic-rectangular',
      n: parameters.n,
      epsC2: parameters.epsC2,
      epsCu2: parameters.epsCu2,
      alpha: ec2StressScale({ ...material, factors: { ...material.factors, alpha, gammaC } })
    },
    limits: {
      ...material.limits,
      eps0: parameters.epsC2,
      epsCu: parameters.epsCu2
    },
    factors: {
      ...material.factors,
      alpha,
      gammaC
    }
  }
}

export const applyEn1992SteelDerived = (material: SteelMaterial): SteelMaterial => {
  if (material.standard !== 'EC2') return material
  const gammaS = material.factors?.gammaS
  const elasticModulus = EN1992_STEEL_ES
  return {
    ...material,
    elasticModulus,
    limits: {
      ...material.limits,
      epsY:
        material.fy /
        (gammaS ?? 1) *
        (material.factors?.resistanceScale ?? 1) /
        elasticModulus
    },
    factors: {
      ...material.factors,
      gammaS
    }
  }
}
