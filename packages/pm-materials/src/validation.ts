import type { ConcreteMaterial, MaterialStore, SteelMaterial, StressStrainPoint } from './types'
import { resolveLinearHardeningSteel } from './steel/linear-hardening-parameters'
import { MATERIAL_INPUT_LIMITS } from './resource-limits'

export type MaterialValidationIssue = {
  path: string
  message: string
}

const finitePositive = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) && value > 0

const finiteUnitInterval = (value: number) =>
  Number.isFinite(value) && value > 0 && value <= 1

const curveIssues = (points: readonly StressStrainPoint[], path: string): MaterialValidationIssue[] => {
  const issues: MaterialValidationIssue[] = []
  if (points.length > MATERIAL_INPUT_LIMITS.curvePoints) return [{ path, message: 'exceeds the material curve-point resource limit' }]
  if (points.length < 2) {
    issues.push({ path, message: 'must contain at least two stress-strain points' })
    return issues
  }

  points.forEach((point, index) => {
    if (!Number.isFinite(point.strain) || !Number.isFinite(point.stress)) {
      issues.push({ path: `${path}[${index}]`, message: 'strain and stress must be finite' })
    }
    if (index > 0 && Number.isFinite(point.strain) && !(point.strain > points[index - 1].strain)) {
      issues.push({
        path: `${path}[${index}].strain`,
        message: 'must be strictly increasing; each must be strictly greater than the preceding strain ordinate'
      })
    }
  })
  return issues
}

/**
 * Physics-level validation shared by project import and both calculation backends.
 *
 * This deliberately sits below the UI. Imported JSON and programmatic callers must not be able to
 * bypass the same fail-closed boundary by constructing a structurally valid TypeScript object.
 */
export const concreteMaterialIssues = (
  concrete: ConcreteMaterial, concretePath = 'materials.concrete'
): MaterialValidationIssue[] => {
  const issues: MaterialValidationIssue[] = []
  if (!Number.isInteger(concrete.id) || concrete.id <= 0) {
    issues.push({ path: `${concretePath}.id`, message: 'must be a positive integer' })
  }
  if (!finitePositive(concrete.fck)) issues.push({ path: `${concretePath}.fck`, message: 'must be positive and finite' })
  if (!finitePositive(concrete.mc)) issues.push({ path: `${concretePath}.mc`, message: 'must be positive and finite' })
  if (concrete.elasticModulus !== undefined && !finitePositive(concrete.elasticModulus)) {
    issues.push({ path: `${concretePath}.elasticModulus`, message: 'must be positive and finite when provided' })
  }
  if (!finitePositive(concrete.limits.epsCu)) {
    issues.push({ path: `${concretePath}.limits.epsCu`, message: 'must be positive and finite' })
  }
  if (concrete.limits.eps0 !== undefined) {
    if (!finitePositive(concrete.limits.eps0)) {
      issues.push({ path: `${concretePath}.limits.eps0`, message: 'must be positive and finite when provided' })
    } else if (finitePositive(concrete.limits.epsCu) && concrete.limits.eps0 > concrete.limits.epsCu) {
      issues.push({ path: `${concretePath}.limits.eps0`, message: 'must not exceed epsCu' })
    }
  }
  for (const [name, value] of Object.entries(concrete.factors ?? {})) {
    if (value !== undefined && !finitePositive(value)) {
      issues.push({ path: `${concretePath}.factors.${name}`, message: 'must be positive and finite when provided' })
    }
  }

  const model = concrete.stressStrain
  const modelPath = `${concretePath}.stressStrain`
  switch (model.type) {
    case 'kds-parabolic':
      if (!finitePositive(model.n)) issues.push({ path: `${modelPath}.n`, message: 'must be positive and finite' })
      if (!finitePositive(model.eps0)) issues.push({ path: `${modelPath}.eps0`, message: 'must be positive and finite' })
      if (!finitePositive(model.epsCu)) issues.push({ path: `${modelPath}.epsCu`, message: 'must be positive and finite' })
      if (finitePositive(model.eps0) && finitePositive(model.epsCu) && model.epsCu < model.eps0) {
        issues.push({ path: `${modelPath}.epsCu`, message: 'must be greater than or equal to eps0' })
      }
      if (!finitePositive(model.alpha)) issues.push({ path: `${modelPath}.alpha`, message: 'must be positive and finite' })
      break
    case 'aci-whitney-block':
    case 'user-block':
      if (!finiteUnitInterval(model.beta1)) issues.push({ path: `${modelPath}.beta1`, message: 'must be in (0, 1]' })
      if (!finitePositive(model.epsCu)) issues.push({ path: `${modelPath}.epsCu`, message: 'must be positive and finite' })
      if (!finitePositive(model.alpha)) issues.push({ path: `${modelPath}.alpha`, message: 'must be positive and finite' })
      break
    case 'ec2-parabolic-rectangular':
      if (!finitePositive(model.n)) issues.push({ path: `${modelPath}.n`, message: 'must be positive and finite' })
      if (!finitePositive(model.epsC2)) issues.push({ path: `${modelPath}.epsC2`, message: 'must be positive and finite' })
      if (!finitePositive(model.epsCu2)) issues.push({ path: `${modelPath}.epsCu2`, message: 'must be positive and finite' })
      if (finitePositive(model.epsC2) && finitePositive(model.epsCu2) && model.epsCu2 < model.epsC2) {
        issues.push({ path: `${modelPath}.epsCu2`, message: 'must be greater than or equal to epsC2' })
      }
      if (!finitePositive(model.alpha)) issues.push({ path: `${modelPath}.alpha`, message: 'must be positive and finite' })
      break
    case 'as3600-equivalent-block':
      if (!finiteUnitInterval(model.alpha2)) issues.push({ path: `${modelPath}.alpha2`, message: 'must be in (0, 1]' })
      if (!finiteUnitInterval(model.gamma)) issues.push({ path: `${modelPath}.gamma`, message: 'must be in (0, 1]' })
      if (!finitePositive(model.epsCu)) issues.push({ path: `${modelPath}.epsCu`, message: 'must be positive and finite' })
      break
    case 'user-curve':
      issues.push(...curveIssues(model.points, `${modelPath}.points`))
      if (model.interpolation !== 'linear') {
        issues.push({ path: `${modelPath}.interpolation`, message: 'must be linear' })
      }
      if (model.extrapolation !== 'clamp') {
        issues.push({ path: `${modelPath}.extrapolation`, message: 'must use clamp extrapolation' })
      }
      break
    default:
      issues.push({
        path: `${modelPath}.type`,
        message: `is unsupported (${String((model as { type?: unknown }).type)})`
      })
  }

  return issues
}

export const steelMaterialIssues = (
  steel: SteelMaterial, path = 'materials.steel'
): MaterialValidationIssue[] => {
  const issues: MaterialValidationIssue[] = []
  if (!Number.isInteger(steel.id) || steel.id <= 0) issues.push({ path: `${path}.id`, message: 'must be a positive integer' })
  if (!finitePositive(steel.fy)) issues.push({ path: `${path}.fy`, message: 'must be positive and finite' })
  if (!finitePositive(steel.elasticModulus)) issues.push({ path: `${path}.elasticModulus`, message: 'must be positive and finite' })
  if (steel.limits?.epsY !== undefined && !finitePositive(steel.limits.epsY)) {
    issues.push({ path: `${path}.limits.epsY`, message: 'must be positive and finite when provided' })
  }
  if ((steel.stressStrain.type === 'elastic-perfectly-plastic' || steel.stressStrain.type === 'bilinear') &&
    finitePositive(steel.fy) && finitePositive(steel.elasticModulus) && steel.limits?.epsY !== undefined) {
    const derivedYield = (steel.fy / (steel.factors?.gammaS ?? 1) * (steel.factors?.resistanceScale ?? 1)) / steel.elasticModulus
    if (steel.limits.epsY !== derivedYield) {
      issues.push({ path: `${path}.limits.epsY`, message: 'must equal the effective yield stress divided by Es; it is a derived snapshot' })
    }
  }
  if (steel.limits?.epsU !== undefined && !finitePositive(steel.limits.epsU)) {
    issues.push({ path: `${path}.limits.epsU`, message: 'must be positive and finite when provided' })
  }
  if (
    finitePositive(steel.limits?.epsY) && finitePositive(steel.limits?.epsU) &&
    (steel.limits?.epsU ?? 0) < (steel.limits?.epsY ?? 0)
  ) {
    issues.push({ path: `${path}.limits.epsU`, message: 'must be greater than or equal to epsY' })
  }
  for (const [name, value] of Object.entries(steel.factors ?? {})) {
    if (value !== undefined && !finitePositive(value)) {
      issues.push({ path: `${path}.factors.${name}`, message: 'must be positive and finite when provided' })
    }
  }
  if (!['elastic-perfectly-plastic', 'bilinear', 'linear-hardening', 'user-curve'].includes(steel.stressStrain.type)) {
    issues.push({ path: `${path}.stressStrain.type`, message: `is unsupported (${String(steel.stressStrain.type)})` })
  } else if (steel.stressStrain.type === 'bilinear' &&
    (!Number.isFinite(steel.stressStrain.hardeningRatio) || steel.stressStrain.hardeningRatio < 0)) {
    issues.push({ path: `${path}.stressStrain.hardeningRatio`, message: 'must be nonnegative and finite' })
  }
  if (steel.stressStrain.type === 'linear-hardening') {
    try {
      resolveLinearHardeningSteel(steel)
    } catch (error) {
      issues.push({ path: `${path}.stressStrain`, message: error instanceof Error ? error.message : String(error) })
    }
  }
  if (steel.stressStrain.type === 'user-curve') {
    issues.push(...curveIssues(steel.stressStrain.points, `${path}.stressStrain.points`))
    if (steel.stressStrain.interpolation !== 'linear') {
      issues.push({ path: `${path}.stressStrain.interpolation`, message: 'must be linear' })
    }
    if (steel.stressStrain.extrapolation !== 'clamp') {
      issues.push({ path: `${path}.stressStrain.extrapolation`, message: 'must use clamp extrapolation' })
    }
  }
  return issues
}

export const materialStoreIssues = (store: MaterialStore): MaterialValidationIssue[] => {
  if (store.steel.length > MATERIAL_INPUT_LIMITS.steelMaterials) return [{ path: 'materials.steel', message: 'exceeds the steel-material resource limit' }]
  let curvePoints = store.concrete.stressStrain.type === 'user-curve' ? store.concrete.stressStrain.points.length : 0
  for (const steel of store.steel) {
    if (steel.stressStrain.type === 'user-curve') curvePoints += steel.stressStrain.points.length
    if (curvePoints > MATERIAL_INPUT_LIMITS.curvePoints) return [{ path: 'materials', message: 'exceeds the total curve-point resource limit' }]
  }
  const issues = concreteMaterialIssues(store.concrete)
  if (store.strainSign !== 'compression-positive') {
    issues.push({ path: 'materials.strainSign', message: 'must be compression-positive' })
  }
  if (store.steel.length === 0) issues.push({ path: 'materials.steel', message: 'must contain at least one steel material' })
  const ids = new Set<number>()
  store.steel.forEach((steel, index) => {
    if (ids.has(steel.id)) issues.push({ path: `materials.steel[${index}].id`, message: 'must be unique' })
    ids.add(steel.id)
    issues.push(...steelMaterialIssues(steel, `materials.steel[${index}]`))
  })
  if (!ids.has(store.defaults.steelMaterialId)) {
    issues.push({ path: 'materials.defaults.steelMaterialId', message: 'must reference an existing steel material' })
  }
  return issues
}

export class MaterialInputError extends Error {
  readonly code = 'INVALID_MATERIAL' as const
  constructor(readonly issues: readonly MaterialValidationIssue[]) {
    super(issues.map((issue) => `${issue.path} ${issue.message}`).join('; '))
    this.name = 'MaterialInputError'
  }
}

export const assertValidConcreteMaterial = (material: ConcreteMaterial, expectedModel?: ConcreteMaterial['stressStrain']['type']) => {
  const issues = concreteMaterialIssues(material)
  if (expectedModel !== undefined && material.stressStrain.type !== expectedModel) {
    issues.push({ path: 'materials.concrete.stressStrain.type', message: `must be ${expectedModel} for this compiler` })
  }
  if (issues.length) throw new MaterialInputError(issues)
}
export const assertValidSteelMaterial = (material: SteelMaterial, expectedModel?: SteelMaterial['stressStrain']['type']) => {
  const issues = steelMaterialIssues(material)
  if (expectedModel !== undefined && material.stressStrain.type !== expectedModel) {
    issues.push({ path: 'materials.steel.stressStrain.type', message: `must be ${expectedModel} for this compiler` })
  }
  if (issues.length) throw new MaterialInputError(issues)
}
export const assertValidMaterialStore = (store: MaterialStore) => {
  const issues = materialStoreIssues(store)
  if (issues.length) throw new MaterialInputError(issues)
}
