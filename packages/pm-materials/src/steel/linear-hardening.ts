import type { CompiledMaterial, SteelMaterial } from '../types'

export type LinearHardeningParameters = {
  yieldStress: number
  ultimateStress: number
  epsYield: number
  epsUk: number
  epsUd: number
  hardeningModulus: number
}

/** Stage-specific interpolation through yield and the declared construction point. */
export const resolveLinearHardeningSteel = (material: SteelMaterial): LinearHardeningParameters => {
  const model = material.stressStrain
  if (model.type !== 'linear-hardening') throw new Error('A linear-hardening definition is required.')
  if (
    !['ratio', 'stress'].includes(model.ultimateStrength.type) || !['factor', 'absolute'].includes(model.strainLimit.type) ||
    ![material.fy, material.factors?.gammaS ?? 1, material.factors?.resistanceScale ?? 1].every((value) => Number.isFinite(value) && value > 0)
  ) throw new RangeError('Steel hardening strength basis, cutoff rule and strength factors must be valid.')
  const strengthMultiplier = 1 / (material.factors?.gammaS ?? 1) * (material.factors?.resistanceScale ?? 1)
  const yieldStress = material.fy * strengthMultiplier
  const inputUltimateStress = model.ultimateStrength.type === 'ratio'
    ? material.fy * model.ultimateStrength.ratio
    : model.ultimateStrength.stress
  const ultimateStress = inputUltimateStress * strengthMultiplier
  const epsYield = yieldStress / material.elasticModulus
  const epsUd = model.strainLimit.type === 'factor'
    ? model.epsUk * model.strainLimit.value
    : model.strainLimit.value
  if (
    ![material.elasticModulus, yieldStress, ultimateStress, model.epsUk, epsUd].every((value) => Number.isFinite(value) && value > 0) ||
    ultimateStress <= yieldStress || epsUd <= epsYield || epsUd > model.epsUk || model.epsUk <= epsYield ||
    (material.limits?.epsU !== undefined && (!Number.isFinite(material.limits.epsU) || material.limits.epsU <= epsYield))
  ) {
    throw new RangeError('Steel hardening requires fu > fy and εy < εlimit ≤ εuk, with finite positive inputs.')
  }
  const hardeningModulus = (ultimateStress - yieldStress) / (model.epsUk - epsYield)
  if (!Number.isFinite(hardeningModulus) || hardeningModulus <= 0) {
    throw new RangeError('Steel post-yield tangent must be finite and positive.')
  }
  return { yieldStress, ultimateStress, epsYield, epsUk: model.epsUk, epsUd, hardeningModulus }
}

export const compileLinearHardeningSteel = (material: SteelMaterial): CompiledMaterial => {
  const params = resolveLinearHardeningSteel(material)
  return {
    id: material.id,
    family: 'steel',
    stress: (strain) => Math.abs(strain) <= params.epsYield
      ? material.elasticModulus * strain
      : Math.sign(strain) * (params.yieldStress + params.hardeningModulus * (Math.abs(strain) - params.epsYield)),
    tangent: (strain) => Math.abs(strain) <= params.epsYield ? material.elasticModulus : params.hardeningModulus,
    limits: {
      epsYield: params.epsYield,
      epsTensionUltimate: Math.min(params.epsUd, material.limits?.epsU ?? Number.POSITIVE_INFINITY),
      epsCompressionUltimate: material.limits?.epsU
    }
  }
}
