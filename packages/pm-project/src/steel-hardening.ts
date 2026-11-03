import { compileSteelMaterial, EN1992_CLASS_B_REFERENCE, EN1992_RECOMMENDED_ULTIMATE_STRAIN_FACTOR, type SteelMaterial } from '@pm/materials'
import { resolveMaterialFactorExpression, type DesignBasis } from '@pm/design'
import { calculationProfile, createDesignBasisForCalculationProfile, type CalculationProfileId } from './calculation-profiles'

type HardeningDefinition = Extract<SteelMaterial['stressStrain'], { type: 'linear-hardening' }>

/** A project curve ends at its declared endpoint; this is an identity, not a code coefficient. */
export const steelHardeningAuthoringPolicy = (profileId: CalculationProfileId) => {
  const code = calculationProfile(profileId).code
  if (code !== null && code !== 'KDS' && code !== 'EN') throw new Error(`${profileId} does not author an inclined reinforcing-steel law.`)
  const en = code === 'EN'
  return {
    strainSymbol: 'εuk',
    strengthType: 'ratio' as const,
    strainLimit: { type: 'factor' as const, value: en ? EN1992_RECOMMENDED_ULTIMATE_STRAIN_FACTOR : 1 },
    description: en ? 'EN recommended preview.' : 'Project-defined curve parameters and limit.'
  }
}

const positiveOrNull = (value: number): number | null => Number.isFinite(value) && value > 0 ? value : null

/** Raw authoring companions; missing/invalid data remain explicit, never repaired. */
export const steelHardeningInputValues = (material: SteelMaterial) => {
  const model = material.stressStrain
  if (model.type !== 'linear-hardening') return null
  const fy = positiveOrNull(material.fy)
  const epsUk = positiveOrNull(model.epsUk)
  const ultimateStress = model.ultimateStrength.type === 'stress' ? positiveOrNull(model.ultimateStrength.stress)
    : fy === null ? null : positiveOrNull(fy * model.ultimateStrength.ratio)
  const strengthRatio = model.ultimateStrength.type === 'ratio' ? positiveOrNull(model.ultimateStrength.ratio)
    : ultimateStress === null || fy === null ? null : positiveOrNull(ultimateStress / fy)
  const epsUd = model.strainLimit.type === 'absolute' ? positiveOrNull(model.strainLimit.value)
    : epsUk === null ? null : positiveOrNull(epsUk * model.strainLimit.value)
  const strainLimitFactor = model.strainLimit.type === 'factor' ? positiveOrNull(model.strainLimit.value)
    : epsUd === null || epsUk === null ? null : positiveOrNull(epsUd / epsUk)
  const physical = material.limits?.epsU
  const strainLimitInput = model.strainLimit.type === 'factor' ? model.strainLimit.value * 100 : model.strainLimit.value
  const effectiveTensionLimit = epsUd === null || (physical !== undefined && positiveOrNull(physical) === null)
    ? null : Math.min(epsUd, physical ?? epsUd)
  return {
    ultimateStress, strengthRatio, epsUd,
    strainLimitInputValue: Number.isFinite(strainLimitInput) ? strainLimitInput : null,
    strainLimitPercent: strainLimitFactor === null ? null : positiveOrNull(strainLimitFactor * 100),
    effectiveTensionLimit
  }
}

type InputChange = { ok: true; definition: HardeningDefinition } | { ok: false; error: string }

export const convertSteelHardeningStrengthInput = (
  material: SteelMaterial, type: HardeningDefinition['ultimateStrength']['type']
): InputChange => {
  const model = material.stressStrain
  if (model.type !== 'linear-hardening') return { ok: false, error: 'A hardening definition is required.' }
  if (type === model.ultimateStrength.type) return { ok: true, definition: model }
  const values = steelHardeningInputValues(material)
  const value = type === 'stress' ? values?.ultimateStress : values?.strengthRatio
  if (value === null || value === undefined) return { ok: false, error: 'Complete positive finite fy and peak strength before changing strength input.' }
  return { ok: true, definition: { ...model, ultimateStrength: type === 'stress'
    ? { type: 'stress', stress: value } : { type: 'ratio', ratio: value } } }
}

export const convertSteelHardeningStrainLimitInput = (
  material: SteelMaterial, type: HardeningDefinition['strainLimit']['type']
): InputChange => {
  const model = material.stressStrain
  if (model.type !== 'linear-hardening') return { ok: false, error: 'A hardening definition is required.' }
  if (type === model.strainLimit.type) return { ok: true, definition: model }
  const values = steelHardeningInputValues(material)
  const value = type === 'absolute' ? values?.epsUd
    : values?.epsUd === null || values?.epsUd === undefined || !(model.epsUk > 0) ? null
      : positiveOrNull(values.epsUd / model.epsUk)
  if (value === null || value === undefined) return { ok: false, error: 'Complete positive finite εuk and εud before changing strain limit input.' }
  return { ok: true, definition: { ...model, strainLimit: { type, value } } }
}

/** The factor editor uses percent; direct epsUd remains a strain ratio. Validation owns ranges. */
export const withSteelHardeningStrainLimitValue = (
  model: HardeningDefinition, enteredValue: number, type: HardeningDefinition['strainLimit']['type'] = model.strainLimit.type
): HardeningDefinition => ({
  ...model,
  strainLimit: { type, value: type === 'factor' ? enteredValue / 100 : enteredValue }
})

/** Editable starter curve; source reference and project interpretation are in engineering/04 §5. */
export const createSteelHardeningDefinition = (
  profileId: CalculationProfileId,
  material: SteelMaterial,
  basis: DesignBasis = createDesignBasisForCalculationProfile(profileId)
): HardeningDefinition => {
  const policy = steelHardeningAuthoringPolicy(profileId)
  const designMultiplier = basis.format === 'designMaterialReevaluation' ? resolveMaterialFactorExpression(basis.factors.reinforcement) : 1
  const sourceMultiplier = (material.factors?.resistanceScale ?? 1) / (material.factors?.gammaS ?? 1)
  const yieldStrain = material.fy / material.elasticModulus * Math.max(1, designMultiplier, sourceMultiplier)
  const reference = EN1992_CLASS_B_REFERENCE
  const epsUk = reference.epsUk * policy.strainLimit.value > yieldStrain
    ? reference.epsUk
    : reference.epsUk + yieldStrain / policy.strainLimit.value
  const definition: HardeningDefinition = {
    type: 'linear-hardening',
    ultimateStrength: { type: policy.strengthType, ratio: reference.strengthRatio },
    epsUk,
    strainLimit: policy.strainLimit
  }
  compileSteelMaterial({ ...material, stressStrain: definition })
  return definition
}
