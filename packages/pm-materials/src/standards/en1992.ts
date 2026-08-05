import type { ConcreteMaterial, SteelMaterial } from '../types'

/** EN 1992-1-1:2004 recommended value; a National Annex may replace this NDP. */
export const EN1992_ALPHA_CC = 1
export const EN1992_GAMMA_C = 1.5
export const EN1992_GAMMA_S = 1.15
export const EN1992_STEEL_ES = 200000

export const en1992MeanCompressiveStrength = (fck: number) => fck + 8

export const en1992ConcreteElasticModulus = (fck: number) =>
  22000 * Math.pow(Math.max(en1992MeanCompressiveStrength(fck), 0) / 10, 0.3)

const ec2StressScale = (material: ConcreteMaterial) =>
  (material.factors?.alpha ?? EN1992_ALPHA_CC) / (material.factors?.gammaC ?? EN1992_GAMMA_C)

export const applyEn1992ConcreteDerived = (material: ConcreteMaterial): ConcreteMaterial => {
  if (material.standard !== 'EC2') return material
  const alpha = material.factors?.alpha ?? EN1992_ALPHA_CC
  const gammaC = material.factors?.gammaC ?? EN1992_GAMMA_C
  return {
    ...material,
    elasticModulus: en1992ConcreteElasticModulus(material.fck),
    stressStrain: {
      type: 'ec2-parabolic-rectangular',
      n: material.stressStrain.type === 'ec2-parabolic-rectangular' ? material.stressStrain.n : 2,
      epsC2: material.stressStrain.type === 'ec2-parabolic-rectangular' ? material.stressStrain.epsC2 : 0.002,
      epsCu2: material.stressStrain.type === 'ec2-parabolic-rectangular' ? material.stressStrain.epsCu2 : 0.0035,
      alpha: ec2StressScale({ ...material, factors: { ...material.factors, alpha, gammaC } })
    },
    limits: {
      ...material.limits,
      eps0: material.stressStrain.type === 'ec2-parabolic-rectangular' ? material.stressStrain.epsC2 : 0.002,
      epsCu: material.stressStrain.type === 'ec2-parabolic-rectangular' ? material.stressStrain.epsCu2 : 0.0035
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
  const gammaS = material.factors?.gammaS ?? EN1992_GAMMA_S
  const elasticModulus = EN1992_STEEL_ES
  return {
    ...material,
    elasticModulus,
    limits: {
      ...material.limits,
      epsY: material.fy / gammaS / elasticModulus
    },
    factors: {
      ...material.factors,
      gammaS
    }
  }
}
