import { finiteCompiledMaterial } from '../compiled'
import { assertValidSteelMaterial } from '../validation'
import type { CompiledMaterial, SteelMaterial } from '../types'

import { resolveLinearHardeningSteel } from './linear-hardening-parameters'
export { resolveLinearHardeningSteel, type LinearHardeningParameters } from './linear-hardening-parameters'

export const compileLinearHardeningSteel = (material: SteelMaterial): CompiledMaterial => {
  assertValidSteelMaterial(material, 'linear-hardening')
  const params = resolveLinearHardeningSteel(material)
  return finiteCompiledMaterial({
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
  })
}
