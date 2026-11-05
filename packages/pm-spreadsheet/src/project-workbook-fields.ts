import { ADAPTIVE_STATION_SCHEDULE, CALCULATION_PROFILES } from '@pm/project'
import { fieldQuantity, quantityUnit, type UnitContext } from '@pm/units'
import { fail, specFor, type Scope, type Scalar } from './project-workbook-codec'

export type FieldValue = { path: string; value: Scalar }
export type FieldContext = { fields: readonly FieldValue[]; profileId: string; values: ReadonlyMap<string, Scalar> }
export const STEEL_YIELD_SOURCE = 'effective-steel-yield'
export const makeFieldContext = (fields: readonly FieldValue[], profileId: string): FieldContext => {
  const values = new Map<string, Scalar>()
  for (const field of fields) if (!values.has(field.path)) values.set(field.path, field.value)
  return { fields, profileId, values }
}
const valueAt = (context: FieldContext, path: string) => context.values.get(path)

/** Structural selectors choose required cells; no missing value is synthesized here. */
export function selectedInputPath(scope: Scope, path: string, context: FieldContext): boolean {
  if ((scope === 'concrete' || scope === 'steel') && path.startsWith('stressStrain.') && path !== 'stressStrain.type') {
    const model = String(valueAt(context, 'stressStrain.type'))
    const fields: Record<string, string[]> = {
      'kds-parabolic': ['n', 'eps0', 'epsCu', 'alpha'], 'ec2-parabolic-rectangular': ['n', 'epsC2', 'epsCu2', 'alpha'],
      'aci-whitney-block': ['alpha', 'beta1', 'epsCu'], 'as3600-equivalent-block': ['alpha2', 'gamma', 'epsCu'],
      'user-block': ['alpha', 'beta1', 'epsCu'], 'user-curve': ['zeroTension'], bilinear: ['hardeningRatio'],
      'elastic-perfectly-plastic': [], 'linear-hardening': ['ultimateStrength.type', 'ultimateStrength.ratio', 'ultimateStrength.stress', 'epsUk', 'strainLimit.type', 'strainLimit.value']
    }
    if (!fields[model]?.includes(path.slice('stressStrain.'.length))) return false
  }
  if (scope === 'steel') {
    const peak = valueAt(context, 'stressStrain.ultimateStrength.type')
    if (path === 'stressStrain.ultimateStrength.ratio') return peak === 'ratio'
    if (path === 'stressStrain.ultimateStrength.stress') return peak === 'stress'
  }
  if (scope === 'analysis') {
    const sizing = valueAt(context, 'mesh.sizing.type'), direction = valueAt(context, 'directions.seed.type')
    if (path === 'mesh.sizing.seedDivisions') return sizing === 'automatic'
    if (path === 'mesh.sizing.cellSize') return sizing === 'fixed'
    if (path === 'directions.seed.count' || path === 'directions.seed.startDeg') return direction === 'uniform'
    if (path.startsWith('directions.seed.anglesDeg.')) return direction === 'explicit'
    if (/^(stations|neutralAxisStations|directions)\.refinement\.(tolerance|maxPasses|maxStations|maxDirections)$/.test(path)) return valueAt(context, 'samplingMode') === 'adaptive'
  }
  if (scope === 'resistance') {
    const format = valueAt(context, 'format')
    if (path.startsWith('minimumEccentricity.')) return format === 'designMaterialReevaluation'
    if (/^factors\.(concrete|reinforcement)\./.test(path)) return format === 'designMaterialReevaluation'
    if (path.startsWith('factors.') || ['transverseReinforcement', 'axialCapEnabled'].includes(path)) return format === 'globalResultantFactor'
    if (path.startsWith('transition.')) {
      if (format !== 'globalResultantFactor') return false
      const rule = valueAt(context, 'transition.type')
      if (path === 'transition.type') return true
      return rule === 'yield-plus-strain' ? path === 'transition.extraStrain'
        : rule === 'fixed-or-yield-multiple' && ['transition.yieldStressThreshold', 'transition.fixedStrainLimit', 'transition.highStrengthYieldMultiple'].includes(path)
    }
  }
  return true
}

/** These fields can become active after an explicit selector edit and then require a cell. */
export const canActivateStoredField = (scope: Scope, path: string): boolean =>
  (scope === 'analysis' && path.startsWith('directions.refinement.probe')) ||
  (scope === 'steel' && path === 'limits.epsY') ||
  (scope === 'concrete' && path === 'limits.ignoreTension') ||
  (scope === 'resistance' && path.startsWith('factors.axialCap'))

export function indexedInputPath(scope: Scope, label: string): string | undefined {
  if (scope !== 'analysis') return undefined
  const angle = /^β([1-9]\d*) \(deg\)$/.exec(label), probe = /^Probe ([1-9]\d*)$/.exec(label)
  const match = angle ?? probe
  if (!match) return undefined
  const index = Number(match[1]) - 1
  if (!Number.isSafeInteger(index) || index >= 100_000) return fail('WORKBOOK_RESOURCE_LIMIT', 'Input index exceeds the workbook row limit.')
  return angle ? `directions.seed.anglesDeg.${index}` : `directions.refinement.probe.stationIds.${index}`
}

const names: Partial<Record<Scope, Record<string, string>>> = {
  projectInformation: { 'meta.name': 'Name', 'meta.information.client': 'Client', 'meta.information.company': 'Company',
    'meta.information.designedBy': 'Designed by', 'meta.information.checkedBy': 'Checked by', 'meta.information.address': 'Address', 'meta.information.date': 'Date' },
  project: { 'inputs.calculationProfileId': 'Profile', 'inputs.loadCheckBasis': 'Check basis' },
  section: { name: 'Name' }, material: { 'defaults.steelMaterialId': 'Default steel' },
  concrete: { name: 'Name', fck: 'fck', 'stressStrain.type': 'Curve', 'stressStrain.n': 'n', 'stressStrain.eps0': 'εc0',
    'stressStrain.epsCu': 'εcu', 'stressStrain.epsC2': 'εc2', 'stressStrain.epsCu2': 'εcu2', 'stressStrain.alpha': 'α',
    'stressStrain.beta1': 'β1', 'stressStrain.alpha2': 'α2', 'stressStrain.gamma': 'γ', 'stressStrain.zeroTension': 'Zero tension',
    'limits.eps0': 'εc0,lim', 'limits.epsCu': 'εcu,lim', 'limits.ignoreTension': 'Zero tension' },
  steel: { name: 'Name', fy: 'fy', elasticModulus: 'Es', 'stressStrain.type': 'Curve',
    'stressStrain.hardeningRatio': 'Hardening ratio', 'stressStrain.ultimateStrength.type': 'Peak input',
    'stressStrain.ultimateStrength.ratio': 'k = fu/fy', 'stressStrain.ultimateStrength.stress': 'fu',
    'stressStrain.epsUk': 'εuk', 'stressStrain.strainLimit.type': 'Cutoff input', 'stressStrain.strainLimit.value': 'Cutoff',
    'limits.epsY': 'εy', 'limits.epsU': 'εs,phys' },
  analysis: { samplingMode: 'Mode', 'stations.basedOn': 'Point set', 'neutralAxisStations.basedOn': 'Point set',
    'directions.seed.type': 'Direction input', 'directions.seed.count': 'Directions', 'directions.seedCount': 'Directions',
    'directions.seed.startDeg': 'β0', 'directions.startDeg': 'β0', 'directions.refinement.probe': 'Probes',
    'mesh.sizing.type': 'Mesh sizing', 'mesh.sizing.seedDivisions': 'Divisions', 'mesh.sizing.cellSize': 'h',
    'mesh.maxCells': 'Cell limit', 'mesh.maxSubdivision': 'Subdivision limit' },
  resistance: { overrideReason: 'Reason', transverseReinforcement: 'Reinforcement', axialCapEnabled: 'Axial cap',
    'factors.phiCompressionOther': 'φc,ties', 'factors.phiCompressionSpiral': 'φc,spiral', 'factors.phiTension': 'φt',
    'factors.axialCapOther': 'Pmax/P0,ties', 'factors.axialCapSpiral': 'Pmax/P0,spiral',
    'transition.type': 'εt rule', 'transition.extraStrain': 'Δεt', 'transition.yieldStressThreshold': 'fy,limit',
    'transition.fixedStrainLimit': 'εt,limit', 'transition.highStrengthYieldMultiple': 'εt/εy',
    'minimumEccentricity.constantMm': 'emin', 'minimumEccentricity.depthFactor': 'e/D' }
}
export const candidatePaths = (scope: Scope): string[] => [...Object.keys(names[scope] ?? {}), ...(scope === 'analysis'
  ? ['stations.refinement', 'neutralAxisStations.refinement', 'directions.refinement'].flatMap(prefix =>
    ['tolerance', 'maxPasses', prefix === 'directions.refinement' ? 'maxDirections' : 'maxStations'].map(key => `${prefix}.${key}`)) : [])]
const enums: Record<string, Record<string, string>> = {
  'inputs.calculationProfileId': Object.fromEntries(CALCULATION_PROFILES.map(profile => [profile.id, profile.label])),
  'inputs.loadCheckBasis': { proportional3D: 'Proportional', direct2D: '2D Load Ray', constantAxial: 'Constant P' },
  'stressStrain.type': { 'kds-parabolic': 'KDS parabola', 'ec2-parabolic-rectangular': 'EN parabola',
    'aci-whitney-block': 'ACI block', 'as3600-equivalent-block': 'AS block', 'user-block': 'User block', 'user-curve': 'User curve',
    'elastic-perfectly-plastic': 'Yield plateau', bilinear: 'Bilinear', 'linear-hardening': 'Hardening' },
  'stressStrain.ultimateStrength.type': { ratio: 'k = fu/fy', stress: 'fu' },
  'stressStrain.strainLimit.type': { factor: 'αε · εuk', absolute: 'εud' },
  samplingMode: { fixed: 'Fixed', adaptive: 'Adaptive' },
  'stations.basedOn': { 'unified-27-v2': 'Standard', [ADAPTIVE_STATION_SCHEDULE]: 'Adaptive seed', custom: 'Custom' },
  'neutralAxisStations.basedOn': { 'unified-27-v2': 'Standard', [ADAPTIVE_STATION_SCHEDULE]: 'Adaptive seed', custom: 'Custom' },
  'directions.seed.type': { uniform: 'Uniform', explicit: 'Angles' },
  'directions.refinement.probe': { all: 'All' }, 'mesh.sizing.type': { automatic: 'Automatic', fixed: 'Fixed h' },
  transverseReinforcement: { other: 'Ties', 'qualifying-spiral': 'Spiral' },
  'transition.type': { 'yield-plus-strain': 'εy + Δεt', 'fixed-or-yield-multiple': 'Fixed / εy multiple' }
}

export function encodeValue(path: string, value: Scalar): Scalar {
  const choices = enums[path]
  if (choices && typeof value === 'string') {
    const label = choices[value]
    if (!label) return fail('WORKBOOK_CELL', `Unsupported choice for ${path}.`)
    return label
  }
  return value
}
export function decodeValue(path: string, value: Scalar): Scalar {
  const choices = enums[path]
  if (!choices) return value
  if (typeof value !== 'string') return fail('WORKBOOK_CELL', 'A named input choice is required.')
  const match = Object.entries(choices).find(([, label]) => label === value)
  if (!match) return fail('WORKBOOK_CELL', `Unknown input choice: ${value}.`)
  return match[0]
}

/** Inputs only: code identity, fixed transport fields and inactive compatibility data are properties. */
export function fieldRole(scope: Scope, path: string, context: FieldContext): 'input' | 'stored' | 'derived' {
  if (scope === 'project') return path === 'schema' ? 'derived'
    : ['inputs.calculationProfileId', 'inputs.loadCheckBasis'].includes(path) ? 'input' : 'stored'
  if (scope === 'section') return path === 'name' ? 'input' : 'stored'
  if (scope === 'material') return path === 'strainSign' ? 'stored' : 'input'
  if (scope === 'analysis' && ['optionsVersion', 'methodId', 'stations.refinement.type', 'neutralAxisStations.refinement.type', 'directions.refinement.type'].includes(path)) return 'derived'
  if (scope === 'analysis' && valueAt(context, 'samplingMode') === 'fixed' && path.startsWith('directions.refinement.probe')) return 'stored'
  if (scope === 'concrete' || scope === 'steel') {
    if (scope === 'concrete' && context.profileId.endsWith('equivalent-block') && path.startsWith('limits.')) return 'stored'
    if (scope === 'concrete' && context.profileId.endsWith('equivalent-block') && valueAt(context, 'stressStrain.type') !== 'user-block' && (path.startsWith('stressStrain.') || path.startsWith('limits.'))) return 'stored'
    if (path === 'standard' || path.startsWith('factors') || ['stressStrain.interpolation', 'stressStrain.extrapolation'].includes(path)) return 'stored'
    if (scope === 'concrete' && ['mc', 'elasticModulus'].includes(path)) return 'stored'
    if (scope === 'concrete' && path === 'stressStrain.zeroTension' && valueAt(context, path) === undefined) return 'derived'
    if (scope === 'concrete' && path === 'limits.ignoreTension' && (valueAt(context, 'stressStrain.type') !== 'user-curve' || valueAt(context, 'stressStrain.zeroTension') !== undefined)) return 'stored'
    if (scope === 'steel' && (path === 'limits' || (path === 'limits.epsY' && valueAt(context, 'stressStrain.type') !== 'user-curve'))) return 'stored'
  }
  if (scope === 'resistance') {
    const cap = valueAt(context, 'axialCapEnabled')
    if ((cap === false || cap === 'FALSE') && path.startsWith('factors.axialCap')) return 'stored'
    if (['basisVersion', 'profileId', 'verificationStatus', 'format', 'modified', 'materialModelModified', 'steelModelModified', 'compressionEndpoint', 'minimumEccentricity.clauseRef'].includes(path) || path.startsWith('identity.')) return 'stored'
    if (/^factors\.(concrete|reinforcement)\./.test(path) && !path.endsWith('.value')) return 'stored'
    if (context.profileId === 'as-3600-2018-amd2-equivalent-block' && path.startsWith('transition.')) return 'stored'
  }
  return 'input'
}

export const materialBindings = (scope: Scope, context: FieldContext): Array<{ target: string; source: string }> => {
  if (scope === 'steel' && ['elastic-perfectly-plastic', 'bilinear'].includes(String(valueAt(context, 'stressStrain.type'))) && valueAt(context, 'limits.epsY') !== undefined) {
    return [{ target: 'limits.epsY', source: STEEL_YIELD_SOURCE }]
  }
  if (scope !== 'concrete') return []
  const model = valueAt(context, 'stressStrain.type')
  const candidates = model === 'ec2-parabolic-rectangular'
    ? [['limits.eps0', 'stressStrain.epsC2'], ['limits.epsCu', 'stressStrain.epsCu2']]
    : [['limits.eps0', 'stressStrain.eps0'], ['limits.epsCu', 'stressStrain.epsCu']]
  return candidates.filter(([target, source]) => fieldRole(scope, source, context) === 'input' && valueAt(context, source) !== undefined && Object.is(valueAt(context, target), valueAt(context, source)))
    .map(([target, source]) => ({ target, source }))
}
export function allowedBinding(scope: Scope, target: string, source: string): boolean {
  return (scope === 'steel' && target === 'limits.epsY' && source === STEEL_YIELD_SOURCE) ||
    (scope === 'concrete' && ['limits.eps0:stressStrain.eps0', 'limits.eps0:stressStrain.epsC2', 'limits.epsCu:stressStrain.epsCu', 'limits.epsCu:stressStrain.epsCu2'].includes(`${target}:${source}`))
}

export function fieldLabel(scope: Scope, path: string, context: FieldContext, units: UnitContext): string {
  let label = names[scope]?.[path]
  if (scope === 'steel' && path === 'stressStrain.strainLimit.value') label = valueAt(context, 'stressStrain.strainLimit.type') === 'absolute' ? 'εud' : 'αε'
  const refinement = /^(stations|neutralAxisStations|directions)\.refinement\.(tolerance|maxPasses|maxStations|maxDirections)$/.exec(path)
  if (scope === 'analysis' && refinement) {
    const axis = refinement[1] === 'directions' ? 'β' : 'Points'
    const suffixes: Record<string, string> = { tolerance: 'tolerance', maxPasses: 'passes', maxStations: 'limit', maxDirections: 'limit' }
    label = `${axis} ${suffixes[refinement[2]]}`
  }
  const angle = /^directions\.seed\.anglesDeg\.(\d+)$/.exec(path)
  if (scope === 'analysis' && angle) label = `β${Number(angle[1]) + 1}`
  const probe = /^directions\.refinement\.probe\.stationIds\.(\d+)$/.exec(path)
  if (scope === 'analysis' && probe) label = `Probe ${Number(probe[1]) + 1}`
  const component = /^factors\.(concrete|reinforcement)\.components\.(\d+)\.value$/.exec(path)
  if (scope === 'resistance' && component) {
    const symbol = valueAt(context, path.replace(/\.value$/, '.symbol'))
    label = typeof symbol === 'string' && symbol.length > 0 && !symbol.includes('.') ? symbol
      : `${component[1] === 'concrete' ? 'Concrete' : 'Steel'} factor ${Number(component[2]) + 1}`
    label += ` [${component[1] === 'concrete' ? 'c' : 's'}${Number(component[2]) + 1}]`
  }
  if (!label) return fail('WORKBOOK_CELL', `No engineering label is registered for ${scope}.${path}.`)
  const numeric = specFor(scope, path, 'Input label', units).type === 'number'
  const quantity = numeric ? fieldQuantity(path) : null
  const unit = !numeric ? '' : quantity ? quantityUnit(quantity, units) : path.endsWith('Deg') || angle ? 'deg'
    : /(?:eps|Strain)/.test(path) || ['stressStrain.strainLimit.value', 'stressStrain.ultimateStrength.ratio'].includes(path) ? '1' : ''
  return unit ? `${label} (${unit})` : label
}

export const UNIT_LABELS: Record<string, string> = { length: 'Length', force: 'Force', moment: 'Moment', stress: 'Stress', density: 'Density', barDiameter: 'Bar diameter', modulus: 'Modulus' }
export const CRITERION_LABELS: Record<string, string> = { 'c-over-c1': 'c/c1', 'depth-ratio': 'c/D', 'steel-stress-ratio': 'fs/fyd',
  'steel-strain': 'εs', 'bar-tension-yield-ratio': 'εs/εy', 'strength-reduction-transition-ratio': 'φ transition',
  'strength-reduction-post-transition': 'εs after transition', 'extreme-tension-strain': 'εs' }
