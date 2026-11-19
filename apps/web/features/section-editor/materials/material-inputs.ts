import type { ConcreteMaterial } from '@pm/materials'

/** Authoring bindings only; material validation and constitutive evaluation retain their owners. */
export const withConcreteCompressionStrain = (
  material: ConcreteMaterial,
  point: 'peak' | 'ultimate',
  strain: number
): ConcreteMaterial => {
  const model = material.stressStrain
  if (point === 'peak') {
    if (model.type !== 'kds-parabolic' && model.type !== 'ec2-parabolic-rectangular') {
      throw new Error('A peak compression-strain editor requires a parabolic concrete law.')
    }
    return {
      ...material,
      limits: { ...material.limits, eps0: strain },
      stressStrain: model.type === 'kds-parabolic'
        ? { ...model, eps0: strain }
        : { ...model, epsC2: strain }
    }
  }
  return {
    ...material,
    limits: { ...material.limits, epsCu: strain },
    stressStrain: model.type === 'ec2-parabolic-rectangular'
      ? { ...model, epsCu2: strain }
      : 'epsCu' in model ? { ...model, epsCu: strain } : model
  }
}

export const withConcreteTensionPolicy = (material: ConcreteMaterial, ignore: boolean): ConcreteMaterial => {
  if (material.stressStrain.type !== 'user-curve') {
    throw new Error('Only a tabulated concrete law has an editable tension policy.')
  }
  return {
    ...material,
    limits: { ...material.limits, ignoreTension: ignore },
    stressStrain: { ...material.stressStrain, zeroTension: ignore }
  }
}
