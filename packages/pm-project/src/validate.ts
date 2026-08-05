import type { GeometryInput, GeometryInputOuter, GeometryInputRebar, Point2 } from '@pm/geometry'
import { CONCRETE_MATERIAL_ID, DEFAULT_CONCRETE_DENSITY } from '@pm/materials'
import type { ConcreteMaterial, MaterialStore, SteelMaterial, StressStrainPoint } from '@pm/materials'
import {
  DESIGN_BASIS_VERSION,
  assertValidDesignBasis,
  createDefaultDesignBasis,
  type DesignBasis,
  type DesignProfileId,
  type GlobalStrengthReductionFactors
} from '@pm/design'
import { isValidEntityId } from './ids'
import {
  ANALYSIS_OPTIONS_VERSION,
  EQUIVALENT_BLOCK_SURFACE_METHOD,
  MAX_BLOCK_STATIONS,
  MAX_INTERMEDIATE_STATIONS,
  MAX_MESH_CELLS,
  MAX_MESH_SEED_DIVISIONS,
  MAX_MESH_SUBDIVISION,
  MAX_REFINED_DIRECTIONS,
  MAX_SEED_DIRECTIONS,
  MAX_STATION_LABEL_LENGTH,
  STRAIN_DOMAIN_SURFACE_METHOD,
  createDefaultAnalysisOptions,
  type AnalysisOptions,
  type AnalysisStation,
  type CalculationAnalysisOptions,
  type EquivalentBlockAnalysisOptions,
  type DirectionProbe
} from './analysis-options'
import { CONCRETE_MODELS_FOR_MECHANICS, calculationProfile, isCalculationProfileId } from './calculation-profiles'
import {
  PM_PROJECT_SCHEMA,
  PM_PROJECT_VERSION,
  type LoadCombination,
  type LoadingsInput,
  type PmProjectDocument
} from './types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const isString = (value: unknown): value is string => typeof value === 'string'

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  assert(isRecord(value), message)
}

function assertArray(value: unknown, message: string): asserts value is unknown[] {
  assert(Array.isArray(value), message)
}

function assertEntityId(value: unknown, path: string): asserts value is number {
  assert(isValidEntityId(value), `${path} must be a positive integer id`)
}

const parsePoint = (value: unknown, path: string): Point2 => {
  assertRecord(value, `${path} must be an object`)
  assertEntityId(value.id, `${path}.id`)
  assert(isFiniteNumber(value.x), `${path}.x must be a finite number`)
  assert(isFiniteNumber(value.y), `${path}.y must be a finite number`)
  return { id: value.id, x: value.x, y: value.y }
}

const parseRing = (value: unknown, path: string): Point2[] => {
  assertArray(value, `${path} must be an array`)
  return value.map((point, index) => parsePoint(point, `${path}[${index}]`))
}

const parseRebar = (value: unknown, path: string): GeometryInputRebar => {
  assertRecord(value, `${path} must be an object`)
  assertEntityId(value.id, `${path}.id`)
  assert(isFiniteNumber(value.dia), `${path}.dia must be a finite number`)
  assert(isFiniteNumber(value.x), `${path}.x must be a finite number`)
  assert(isFiniteNumber(value.y), `${path}.y must be a finite number`)
  const rebar: GeometryInputRebar = {
    id: value.id,
    dia: value.dia,
    x: value.x,
    y: value.y
  }
  if (value.steelMaterialId !== undefined) {
    assertEntityId(value.steelMaterialId, `${path}.steelMaterialId`)
    rebar.steelMaterialId = value.steelMaterialId
  }
  return rebar
}

const parseOuter = (value: unknown, path: string): GeometryInputOuter => {
  assertRecord(value, `${path} must be an object`)
  assertEntityId(value.id, `${path}.id`)
  assertArray(value.points, `${path}.points must be an array`)
  assertArray(value.holes, `${path}.holes must be an array`)

  return {
    id: value.id,
    points: parseRing(value.points, `${path}.points`),
    holes: value.holes.map((hole, index) => {
      assertRecord(hole, `${path}.holes[${index}] must be an object`)
      assertEntityId(hole.id, `${path}.holes[${index}].id`)
      return {
        id: hole.id,
        points: parseRing(hole.points, `${path}.holes[${index}].points`)
      }
    })
  }
}

const parseGeometry = (value: unknown): GeometryInput => {
  assertRecord(value, 'inputs.geometry must be an object')
  assertEntityId(value.id, 'inputs.geometry.id')
  assert(isString(value.name), 'inputs.geometry.name must be a string')
  assertArray(value.outers, 'inputs.geometry.outers must be an array')
  assertArray(value.rebars, 'inputs.geometry.rebars must be an array')
  return {
    id: value.id,
    name: value.name,
    outers: value.outers.map((outer, index) => parseOuter(outer, `inputs.geometry.outers[${index}]`)),
    rebars: value.rebars.map((rebar, index) => parseRebar(rebar, `inputs.geometry.rebars[${index}]`))
  }
}

const parseStressPoints = (value: unknown, path: string): StressStrainPoint[] => {
  assertArray(value, `${path} must be an array`)
  return value.map((point, index) => {
    assertRecord(point, `${path}[${index}] must be an object`)
    assert(isFiniteNumber(point.strain), `${path}[${index}].strain must be a finite number`)
    assert(isFiniteNumber(point.stress), `${path}[${index}].stress must be a finite number`)
    return { strain: point.strain, stress: point.stress }
  })
}

const parseConcrete = (value: unknown): ConcreteMaterial => {
  assertRecord(value, 'inputs.materials.concrete must be an object')
  assertEntityId(value.id, 'inputs.materials.concrete.id')
  assert(value.id === CONCRETE_MATERIAL_ID, `inputs.materials.concrete.id must be ${CONCRETE_MATERIAL_ID}`)
  assert(isString(value.name), 'inputs.materials.concrete.name must be a string')
  assert(
    value.standard === 'KDS' || value.standard === 'ACI318' || value.standard === 'EC2' ||
      value.standard === 'AS3600' || value.standard === 'CUSTOM',
    'inputs.materials.concrete.standard is invalid'
  )
  assert(isFiniteNumber(value.fck), 'inputs.materials.concrete.fck must be a finite number')
  const mc =
    value.mc === undefined ? DEFAULT_CONCRETE_DENSITY : value.mc
  assert(isFiniteNumber(mc) && mc > 0, 'inputs.materials.concrete.mc must be a positive finite number')
  assertRecord(value.stressStrain, 'inputs.materials.concrete.stressStrain must be an object')
  assertRecord(value.limits, 'inputs.materials.concrete.limits must be an object')
  assert(isFiniteNumber(value.limits.epsCu), 'inputs.materials.concrete.limits.epsCu must be a finite number')
  assert(typeof value.limits.ignoreTension === 'boolean', 'inputs.materials.concrete.limits.ignoreTension must be boolean')

  const modelType = value.stressStrain.type
  let stressStrain: ConcreteMaterial['stressStrain']

  if (modelType === 'kds-parabolic') {
    assert(isFiniteNumber(value.stressStrain.n), 'concrete.stressStrain.n must be a finite number')
    assert(isFiniteNumber(value.stressStrain.eps0), 'concrete.stressStrain.eps0 must be a finite number')
    assert(isFiniteNumber(value.stressStrain.epsCu), 'concrete.stressStrain.epsCu must be a finite number')
    assert(isFiniteNumber(value.stressStrain.alpha), 'concrete.stressStrain.alpha must be a finite number')
    stressStrain = {
      type: 'kds-parabolic',
      n: value.stressStrain.n,
      eps0: value.stressStrain.eps0,
      epsCu: value.stressStrain.epsCu,
      alpha: value.stressStrain.alpha
    }
  } else if (modelType === 'aci-whitney-block') {
    assert(isFiniteNumber(value.stressStrain.beta1), 'concrete.stressStrain.beta1 must be a finite number')
    assert(isFiniteNumber(value.stressStrain.epsCu), 'concrete.stressStrain.epsCu must be a finite number')
    assert(isFiniteNumber(value.stressStrain.alpha), 'concrete.stressStrain.alpha must be a finite number')
    stressStrain = {
      type: 'aci-whitney-block',
      beta1: value.stressStrain.beta1,
      epsCu: value.stressStrain.epsCu,
      alpha: value.stressStrain.alpha
    }
  } else if (modelType === 'ec2-parabolic-rectangular') {
    assert(isFiniteNumber(value.stressStrain.n), 'concrete.stressStrain.n must be a finite number')
    assert(isFiniteNumber(value.stressStrain.epsC2), 'concrete.stressStrain.epsC2 must be a finite number')
    assert(isFiniteNumber(value.stressStrain.epsCu2), 'concrete.stressStrain.epsCu2 must be a finite number')
    assert(isFiniteNumber(value.stressStrain.alpha), 'concrete.stressStrain.alpha must be a finite number')
    stressStrain = {
      type: 'ec2-parabolic-rectangular',
      n: value.stressStrain.n,
      epsC2: value.stressStrain.epsC2,
      epsCu2: value.stressStrain.epsCu2,
      alpha: value.stressStrain.alpha
    }
  } else if (modelType === 'as3600-equivalent-block') {
    assert(isFiniteNumber(value.stressStrain.alpha2), 'concrete.stressStrain.alpha2 must be a finite number')
    assert(isFiniteNumber(value.stressStrain.gamma), 'concrete.stressStrain.gamma must be a finite number')
    assert(isFiniteNumber(value.stressStrain.epsCu), 'concrete.stressStrain.epsCu must be a finite number')
    stressStrain = {
      type: 'as3600-equivalent-block',
      alpha2: value.stressStrain.alpha2,
      gamma: value.stressStrain.gamma,
      epsCu: value.stressStrain.epsCu
    }
  } else if (modelType === 'user-block') {
    assert(isFiniteNumber(value.stressStrain.beta1), 'concrete.stressStrain.beta1 must be a finite number')
    assert(isFiniteNumber(value.stressStrain.epsCu), 'concrete.stressStrain.epsCu must be a finite number')
    assert(isFiniteNumber(value.stressStrain.alpha), 'concrete.stressStrain.alpha must be a finite number')
    stressStrain = {
      type: 'user-block',
      beta1: value.stressStrain.beta1,
      epsCu: value.stressStrain.epsCu,
      alpha: value.stressStrain.alpha
    }
  } else if (modelType === 'user-curve') {
    stressStrain = {
      type: 'user-curve',
      points: parseStressPoints(value.stressStrain.points, 'concrete.stressStrain.points'),
      interpolation: 'linear',
      zeroTension: typeof value.stressStrain.zeroTension === 'boolean' ? value.stressStrain.zeroTension : undefined
    }
  } else {
    throw new Error(`Unsupported concrete stress-strain type: ${String(modelType)}`)
  }

  const concrete: ConcreteMaterial = {
    id: CONCRETE_MATERIAL_ID,
    name: value.name,
    standard: value.standard,
    fck: value.fck,
    mc,
    stressStrain,
    limits: {
      epsCu: value.limits.epsCu,
      ignoreTension: value.limits.ignoreTension,
      eps0: isFiniteNumber(value.limits.eps0) ? value.limits.eps0 : undefined
    }
  }

  if (isFiniteNumber(value.elasticModulus)) concrete.elasticModulus = value.elasticModulus
  if (isRecord(value.factors)) {
    concrete.factors = {
      alpha: isFiniteNumber(value.factors.alpha) ? value.factors.alpha : undefined,
      gammaC: isFiniteNumber(value.factors.gammaC) ? value.factors.gammaC : undefined
    }
  }

  return concrete
}

const parseSteel = (value: unknown, path: string): SteelMaterial => {
  assertRecord(value, `${path} must be an object`)
  assertEntityId(value.id, `${path}.id`)
  assert(isString(value.name), `${path}.name must be a string`)
  assert(
    value.standard === 'KDS' || value.standard === 'ACI318' || value.standard === 'EC2' ||
      value.standard === 'AS3600' || value.standard === 'CUSTOM',
    `${path}.standard is invalid`
  )
  assert(isFiniteNumber(value.fy), `${path}.fy must be a finite number`)
  assert(isFiniteNumber(value.elasticModulus), `${path}.elasticModulus must be a finite number`)
  assertRecord(value.stressStrain, `${path}.stressStrain must be an object`)

  const modelType = value.stressStrain.type
  let stressStrain: SteelMaterial['stressStrain']

  if (modelType === 'elastic-perfectly-plastic') {
    stressStrain = { type: 'elastic-perfectly-plastic' }
  } else if (modelType === 'bilinear') {
    assert(isFiniteNumber(value.stressStrain.hardeningRatio), `${path}.stressStrain.hardeningRatio must be a finite number`)
    stressStrain = { type: 'bilinear', hardeningRatio: value.stressStrain.hardeningRatio }
  } else if (modelType === 'user-curve') {
    stressStrain = {
      type: 'user-curve',
      points: parseStressPoints(value.stressStrain.points, `${path}.stressStrain.points`),
      interpolation: 'linear'
    }
  } else {
    throw new Error(`Unsupported steel stress-strain type: ${String(modelType)}`)
  }

  const steel: SteelMaterial = {
    id: value.id,
    name: value.name,
    standard: value.standard,
    fy: value.fy,
    elasticModulus: value.elasticModulus,
    stressStrain
  }

  if (isRecord(value.limits)) {
    steel.limits = {
      epsY: isFiniteNumber(value.limits.epsY) ? value.limits.epsY : undefined,
      epsU: isFiniteNumber(value.limits.epsU) ? value.limits.epsU : undefined
    }
  }
  if (isRecord(value.factors)) {
    steel.factors = {
      gammaS: isFiniteNumber(value.factors.gammaS) ? value.factors.gammaS : undefined
    }
  }

  return steel
}

const parseMaterials = (value: unknown): MaterialStore => {
  assertRecord(value, 'inputs.materials must be an object')
  assert(value.strainSign === 'compression-positive', 'inputs.materials.strainSign must be "compression-positive"')
  assertArray(value.steel, 'inputs.materials.steel must be an array')
  assertRecord(value.defaults, 'inputs.materials.defaults must be an object')
  assertEntityId(value.defaults.steelMaterialId, 'inputs.materials.defaults.steelMaterialId')

  const steel = value.steel.map((item, index) => parseSteel(item, `inputs.materials.steel[${index}]`))
  assert(steel.length > 0, 'inputs.materials.steel must contain at least one steel material')

  return {
    strainSign: 'compression-positive',
    concrete: parseConcrete(value.concrete),
    steel,
    defaults: {
      steelMaterialId: value.defaults.steelMaterialId
    }
  }
}

const parseLoadCombination = (value: unknown, path: string): LoadCombination => {
  assertRecord(value, `${path} must be an object`)
  assertEntityId(value.id, `${path}.id`)
  assert(isString(value.name), `${path}.name must be a string`)
  assert(isFiniteNumber(value.P), `${path}.P must be a finite number`)
  assert(isFiniteNumber(value.Mx), `${path}.Mx must be a finite number`)
  assert(isFiniteNumber(value.My), `${path}.My must be a finite number`)
  return {
    id: value.id,
    name: value.name,
    actionBasis: 'factoredULS',
    P: value.P,
    Mx: value.Mx,
    My: value.My
  }
}

const parseLoadings = (value: unknown | undefined): LoadingsInput => {
  if (value === undefined) {
    return { combinations: [] }
  }
  assertRecord(value, 'inputs.loadings must be an object')
  assertArray(value.combinations, 'inputs.loadings.combinations must be an array')
  return {
    combinations: value.combinations.map((item, index) =>
      parseLoadCombination(item, `inputs.loadings.combinations[${index}]`)
    )
  }
}

const parseAnalysisStation = (value: unknown, path: string): AnalysisStation => {
  assertRecord(value, `${path} must be an object`)
  assertEntityId(value.id, `${path}.id`)
  assert(
    isString(value.label) &&
      value.label.trim().length > 0 &&
      value.label.length <= MAX_STATION_LABEL_LENGTH,
    `${path}.label must contain 1…${MAX_STATION_LABEL_LENGTH} characters`
  )
  assertRecord(value.criterion, `${path}.criterion must be an object`)

  if (value.criterion.type === 'c-over-c1') {
    assert(
      isFiniteNumber(value.criterion.ratio) && value.criterion.ratio > 0,
      `${path}.criterion.ratio must be positive`
    )
    return { id: value.id, label: value.label, criterion: { type: 'c-over-c1', ratio: value.criterion.ratio } }
  }
  if (value.criterion.type === 'steel-stress-ratio') {
    assert(
      isFiniteNumber(value.criterion.ratio) && value.criterion.ratio >= 0 && value.criterion.ratio <= 1,
      `${path}.criterion.ratio must be between 0 and 1`
    )
    return {
      id: value.id,
      label: value.label,
      criterion: { type: 'steel-stress-ratio', ratio: value.criterion.ratio }
    }
  }
  if (value.criterion.type === 'steel-strain') {
    assert(
      isFiniteNumber(value.criterion.strain) && value.criterion.strain <= 0,
      `${path}.criterion.strain must be finite and non-positive`
    )
    return { id: value.id, label: value.label, criterion: { type: 'steel-strain', strain: value.criterion.strain } }
  }
  if (value.criterion.type === 'strength-reduction-transition-ratio') {
    assert(
      isFiniteNumber(value.criterion.ratio) && value.criterion.ratio > 0 && value.criterion.ratio <= 1,
      `${path}.criterion.ratio must be in (0, 1]`
    )
    return {
      id: value.id,
      label: value.label,
      criterion: { type: 'strength-reduction-transition-ratio', ratio: value.criterion.ratio }
    }
  }
  if (value.criterion.type === 'strength-reduction-post-transition') {
    assert(
      isFiniteNumber(value.criterion.extraStrain) && value.criterion.extraStrain > 0,
      `${path}.criterion.extraStrain must be positive`
    )
    return {
      id: value.id,
      label: value.label,
      criterion: { type: 'strength-reduction-post-transition', extraStrain: value.criterion.extraStrain }
    }
  }
  throw new Error(`${path}.criterion.type is unsupported`)
}

const parseDirectionProbe = (
  value: unknown,
  path: string,
  stationIds: ReadonlySet<number>
): DirectionProbe => {
  if (value === 'all') return 'all'
  assertRecord(value, `${path} must be "all" or an object`)
  assertArray(value.stationIds, `${path}.stationIds must be an array`)
  const ids = value.stationIds.map((id, index) => {
    assertEntityId(id, `${path}.stationIds[${index}]`)
    assert(stationIds.has(id), `${path}.stationIds[${index}] does not reference an intermediate station`)
    return id
  })
  assert(new Set(ids).size === ids.length, `${path}.stationIds must not contain duplicates`)
  return { stationIds: ids }
}

const parseEquivalentBlockAnalysis = (
  value: Record<string, unknown>,
  path: string
): EquivalentBlockAnalysisOptions => {
  assertRecord(value.neutralAxisStations, `${path}.neutralAxisStations must be an object`)
  assert(
    value.neutralAxisStations.basedOn === 'verified-37-v1' || value.neutralAxisStations.basedOn === 'custom',
    `${path}.neutralAxisStations.basedOn is invalid`
  )
  assertArray(value.neutralAxisStations.values, `${path}.neutralAxisStations.values must be an array`)
  assert(
    value.neutralAxisStations.values.length >= 2 && value.neutralAxisStations.values.length <= MAX_BLOCK_STATIONS,
    `${path}.neutralAxisStations.values must contain 2–${MAX_BLOCK_STATIONS} stations`
  )
  const values = value.neutralAxisStations.values.map((item, index) => {
    const itemPath = `${path}.neutralAxisStations.values[${index}]`
    assertRecord(item, `${itemPath} must be an object`)
    if (item.type === 'extreme-tension-strain') {
      assert(isFiniteNumber(item.strain) && item.strain >= 0, `${itemPath}.strain must be nonnegative`)
      return { type: 'extreme-tension-strain' as const, strain: item.strain }
    }
    assert(item.type === 'depth-ratio', `${itemPath}.type is unsupported`)
    assert(isFiniteNumber(item.ratio) && item.ratio > 1, `${itemPath}.ratio must be greater than 1`)
    return { type: 'depth-ratio' as const, ratio: item.ratio }
  })

  assertRecord(value.neutralAxisStations.refinement, `${path}.neutralAxisStations.refinement must be an object`)
  const stationRefinement = value.neutralAxisStations.refinement
  let refinement: EquivalentBlockAnalysisOptions['neutralAxisStations']['refinement']
  if (stationRefinement.type === 'fixed') {
    refinement = { type: 'fixed' }
  } else {
    assert(stationRefinement.type === 'adaptive', `${path}.neutralAxisStations.refinement.type is unsupported`)
    assert(
      isFiniteNumber(stationRefinement.tolerance) && stationRefinement.tolerance > 0 && stationRefinement.tolerance <= 0.25,
      `${path}.neutralAxisStations.refinement.tolerance must be in (0, 0.25]`
    )
    assert(Number.isInteger(stationRefinement.maxPasses) && (stationRefinement.maxPasses as number) >= 0 && (stationRefinement.maxPasses as number) <= 12,
      `${path}.neutralAxisStations.refinement.maxPasses must be an integer between 0 and 12`)
    assert(Number.isInteger(stationRefinement.maxStations) && (stationRefinement.maxStations as number) >= values.length && (stationRefinement.maxStations as number) <= MAX_BLOCK_STATIONS,
      `${path}.neutralAxisStations.refinement.maxStations must be between station count and ${MAX_BLOCK_STATIONS}`)
    refinement = {
      type: 'adaptive',
      tolerance: stationRefinement.tolerance,
      maxPasses: stationRefinement.maxPasses as number,
      maxStations: stationRefinement.maxStations as number
    }
  }

  assertRecord(value.directions, `${path}.directions must be an object`)
  assert(Number.isInteger(value.directions.seedCount) && (value.directions.seedCount as number) >= 4 && (value.directions.seedCount as number) <= MAX_SEED_DIRECTIONS,
    `${path}.directions.seedCount must be an integer between 4 and ${MAX_SEED_DIRECTIONS}`)
  assert(isFiniteNumber(value.directions.startDeg) && value.directions.startDeg >= 0 && value.directions.startDeg < 360,
    `${path}.directions.startDeg must be in [0, 360)`)
  assertRecord(value.directions.refinement, `${path}.directions.refinement must be an object`)
  const directionRefinement = value.directions.refinement
  let directionsRefinement: EquivalentBlockAnalysisOptions['directions']['refinement']
  if (directionRefinement.type === 'fixed') {
    directionsRefinement = { type: 'fixed' }
  } else {
    assert(directionRefinement.type === 'adaptive', `${path}.directions.refinement.type is unsupported`)
    assert(isFiniteNumber(directionRefinement.tolerance) && directionRefinement.tolerance > 0 && directionRefinement.tolerance <= 0.25,
      `${path}.directions.refinement.tolerance must be in (0, 0.25]`)
    assert(Number.isInteger(directionRefinement.maxPasses) && (directionRefinement.maxPasses as number) >= 0 && (directionRefinement.maxPasses as number) <= 12,
      `${path}.directions.refinement.maxPasses must be an integer between 0 and 12`)
    assert(Number.isInteger(directionRefinement.maxDirections) && (directionRefinement.maxDirections as number) >= (value.directions.seedCount as number) && (directionRefinement.maxDirections as number) <= MAX_REFINED_DIRECTIONS,
      `${path}.directions.refinement.maxDirections must be between seed count and ${MAX_REFINED_DIRECTIONS}`)
    directionsRefinement = {
      type: 'adaptive',
      tolerance: directionRefinement.tolerance,
      maxPasses: directionRefinement.maxPasses as number,
      maxDirections: directionRefinement.maxDirections as number
    }
  }

  return {
    optionsVersion: ANALYSIS_OPTIONS_VERSION,
    methodId: EQUIVALENT_BLOCK_SURFACE_METHOD,
    neutralAxisStations: {
      basedOn: value.neutralAxisStations.basedOn,
      values,
      refinement
    },
    directions: {
      seedCount: value.directions.seedCount as number,
      startDeg: value.directions.startDeg,
      refinement: directionsRefinement
    }
  }
}

const parseAnalysis = (value: unknown): CalculationAnalysisOptions => {
  const path = 'inputs.analysis'
  assertRecord(value, `${path} must be an object`)
  assert(value.optionsVersion === ANALYSIS_OPTIONS_VERSION, `${path}.optionsVersion is unsupported`)
  if (value.methodId === EQUIVALENT_BLOCK_SURFACE_METHOD) return parseEquivalentBlockAnalysis(value, path)
  assert(value.methodId === STRAIN_DOMAIN_SURFACE_METHOD, `${path}.methodId is unsupported`)
  assertRecord(value.stations, `${path}.stations must be an object`)
  assert(
    value.stations.basedOn === 'transition-aware-p0-p24-v1' ||
      value.stations.basedOn === 'legacy-p0-p18-v1' ||
      value.stations.basedOn === 'custom',
    `${path}.stations.basedOn is invalid`
  )
  assertArray(value.stations.intermediate, `${path}.stations.intermediate must be an array`)
  assert(
    value.stations.intermediate.length <= MAX_INTERMEDIATE_STATIONS,
    `${path}.stations.intermediate exceeds ${MAX_INTERMEDIATE_STATIONS}`
  )
  const intermediate = value.stations.intermediate.map((item, index) =>
    parseAnalysisStation(item, `${path}.stations.intermediate[${index}]`)
  )
  const stationIds = new Set(intermediate.map((item) => item.id))
  assert(stationIds.size === intermediate.length, `${path}.stations.intermediate ids must be unique`)
  if (value.stations.basedOn === 'transition-aware-p0-p24-v1') {
    const hasYield = intermediate.some(
      (item) => item.criterion.type === 'steel-stress-ratio' && Math.abs(item.criterion.ratio - 1) <= 1e-12
    )
    const hasTransitionFractions = Array.from({ length: 8 }, (_, index) => (index + 1) / 8).every(
      (ratio) => intermediate.some(
        (item) => item.criterion.type === 'strength-reduction-transition-ratio' &&
          Math.abs(item.criterion.ratio - ratio) <= 1e-12
      )
    )
    assert(
      hasYield && hasTransitionFractions,
      `${path}.stations must retain yield plus all eight 1/8 transition fractions for transition-aware-p0-p24-v1`
    )
  }

  assertRecord(value.directions, `${path}.directions must be an object`)
  assertRecord(value.directions.seed, `${path}.directions.seed must be an object`)
  let seed: AnalysisOptions['directions']['seed']
  if (value.directions.seed.type === 'uniform') {
    assert(
      Number.isInteger(value.directions.seed.count) &&
        (value.directions.seed.count as number) >= 4 &&
        (value.directions.seed.count as number) <= MAX_SEED_DIRECTIONS,
      `${path}.directions.seed.count must be an integer between 4 and ${MAX_SEED_DIRECTIONS}`
    )
    assert(
      isFiniteNumber(value.directions.seed.startDeg) &&
        value.directions.seed.startDeg >= 0 &&
        value.directions.seed.startDeg < 360,
      `${path}.directions.seed.startDeg must be in [0, 360)`
    )
    seed = {
      type: 'uniform',
      count: value.directions.seed.count as number,
      startDeg: value.directions.seed.startDeg
    }
  } else if (value.directions.seed.type === 'explicit') {
    assertArray(value.directions.seed.anglesDeg, `${path}.directions.seed.anglesDeg must be an array`)
    assert(
      value.directions.seed.anglesDeg.length >= 4 &&
        value.directions.seed.anglesDeg.length <= MAX_SEED_DIRECTIONS,
      `${path}.directions.seed.anglesDeg must contain 4…${MAX_SEED_DIRECTIONS} angles`
    )
    const anglesDeg = value.directions.seed.anglesDeg.map((angle, index) => {
      assert(
        isFiniteNumber(angle) && angle >= 0 && angle < 360,
        `${path}.directions.seed.anglesDeg[${index}] must be in [0, 360)`
      )
      return angle
    })
    assert(
      anglesDeg.every((angle, index) => index === 0 || angle > anglesDeg[index - 1]),
      `${path}.directions.seed.anglesDeg must be strictly increasing`
    )
    seed = { type: 'explicit', anglesDeg }
  } else {
    throw new Error(`${path}.directions.seed.type is unsupported`)
  }

  assertRecord(value.directions.refinement, `${path}.directions.refinement must be an object`)
  const probe = parseDirectionProbe(value.directions.refinement.probe, `${path}.directions.refinement.probe`, stationIds)
  let refinement: AnalysisOptions['directions']['refinement']
  if (value.directions.refinement.type === 'fixed') {
    refinement = { type: 'fixed', probe }
  } else if (value.directions.refinement.type === 'adaptive') {
    const maxPasses = value.directions.refinement.maxPasses
    const maxDirections = value.directions.refinement.maxDirections
    assert(
      isFiniteNumber(value.directions.refinement.tolerance) &&
        value.directions.refinement.tolerance > 0 &&
        value.directions.refinement.tolerance <= 0.25,
      `${path}.directions.refinement.tolerance must be in (0, 0.25]`
    )
    assert(
      Number.isInteger(maxPasses) &&
        (maxPasses as number) >= 0 &&
        (maxPasses as number) <= 12,
      `${path}.directions.refinement.maxPasses must be an integer between 0 and 12`
    )
    const seedCount = seed.type === 'uniform' ? seed.count : seed.anglesDeg.length
    assert(
      Number.isInteger(maxDirections) &&
        (maxDirections as number) >= seedCount &&
        (maxDirections as number) <= MAX_REFINED_DIRECTIONS,
      `${path}.directions.refinement.maxDirections must be between seed count and ${MAX_REFINED_DIRECTIONS}`
    )
    refinement = {
      type: 'adaptive',
      tolerance: value.directions.refinement.tolerance,
      maxPasses: maxPasses as number,
      maxDirections: maxDirections as number,
      probe
    }
  } else {
    throw new Error(`${path}.directions.refinement.type is unsupported`)
  }

  const defaultMesh = createDefaultAnalysisOptions().mesh
  let mesh: AnalysisOptions['mesh'] = defaultMesh
  if (value.mesh !== undefined) {
    assertRecord(value.mesh, `${path}.mesh must be an object`)
    assertRecord(value.mesh.sizing, `${path}.mesh.sizing must be an object`)
    let sizing: AnalysisOptions['mesh']['sizing']
    if (value.mesh.sizing.type === 'automatic') {
      assert(
        Number.isInteger(value.mesh.sizing.seedDivisions) &&
          (value.mesh.sizing.seedDivisions as number) >= 4 &&
          (value.mesh.sizing.seedDivisions as number) <= MAX_MESH_SEED_DIVISIONS,
        `${path}.mesh.sizing.seedDivisions must be an integer between 4 and ${MAX_MESH_SEED_DIVISIONS}`
      )
      sizing = { type: 'automatic', seedDivisions: value.mesh.sizing.seedDivisions as number }
    } else if (value.mesh.sizing.type === 'fixed') {
      assert(
        isFiniteNumber(value.mesh.sizing.cellSize) && value.mesh.sizing.cellSize >= 1e-6,
        `${path}.mesh.sizing.cellSize must be at least 1e-6 mm`
      )
      sizing = { type: 'fixed', cellSize: value.mesh.sizing.cellSize }
    } else {
      throw new Error(`${path}.mesh.sizing.type is unsupported`)
    }
    assert(
      Number.isInteger(value.mesh.maxCells) &&
        (value.mesh.maxCells as number) >= 1 &&
        (value.mesh.maxCells as number) <= MAX_MESH_CELLS,
      `${path}.mesh.maxCells must be an integer between 1 and ${MAX_MESH_CELLS}`
    )
    assert(
      Number.isInteger(value.mesh.maxSubdivision) &&
        (value.mesh.maxSubdivision as number) >= 0 &&
        (value.mesh.maxSubdivision as number) <= MAX_MESH_SUBDIVISION,
      `${path}.mesh.maxSubdivision must be an integer between 0 and ${MAX_MESH_SUBDIVISION}`
    )
    mesh = {
      sizing,
      maxCells: value.mesh.maxCells as number,
      maxSubdivision: value.mesh.maxSubdivision as number
    }
  }

  return {
    optionsVersion: ANALYSIS_OPTIONS_VERSION,
    methodId: STRAIN_DOMAIN_SURFACE_METHOD,
    stations: { basedOn: value.stations.basedOn, intermediate },
    directions: { seed, refinement },
    mesh
  }
}

const parseDesignBasis = (value: unknown | undefined, materials: MaterialStore): DesignBasis => {
  if (value === undefined) return createDefaultDesignBasis(materials)
  assertRecord(value, 'inputs.design must be an object')
  assert(value.basisVersion === DESIGN_BASIS_VERSION, 'inputs.design.basisVersion is unsupported')
  assertRecord(value.identity, 'inputs.design.identity must be an object')
  for (const key of ['organization', 'document', 'edition', 'methodId', 'profileVersion'] as const) {
    assert(isString(value.identity[key]), `inputs.design.identity.${key} must be a string`)
  }
  assert(
    value.profileId === 'kds-2024-current-set' ||
      value.profileId === 'kds-basic-2021-2022' ||
      value.profileId === 'aci-318-19-22' ||
      value.profileId === 'en-1992-1-1-2004-default' ||
      value.profileId === 'as-3600-2018-amd2' ||
      value.profileId === 'custom-user-defined',
    'inputs.design.profileId is unsupported'
  )
  assert(
    value.verificationStatus === 'draft' ||
      value.verificationStatus === 'reviewed' ||
      value.verificationStatus === 'verified' ||
      value.verificationStatus === 'user-defined',
    'inputs.design.verificationStatus is invalid'
  )
  assert(
    (value.profileId === 'custom-user-defined') === (value.verificationStatus === 'user-defined'),
    'inputs.design.verificationStatus "user-defined" is reserved for the custom resistance profile'
  )
  assert(typeof value.modified === 'boolean', 'inputs.design.modified must be boolean')
  assert(isString(value.overrideReason), 'inputs.design.overrideReason must be a string')
  const factors = value.factors
  assertRecord(factors, 'inputs.design.factors must be an object')

  const common = {
    basisVersion: DESIGN_BASIS_VERSION,
    identity: {
      organization: value.identity.organization as string,
      document: value.identity.document as string,
      edition: value.identity.edition as string,
      amendment: isString(value.identity.amendment) ? value.identity.amendment : undefined,
      jurisdiction: isString(value.identity.jurisdiction) ? value.identity.jurisdiction : undefined,
      nationalAnnex: isString(value.identity.nationalAnnex) ? value.identity.nationalAnnex : undefined,
      methodId: value.identity.methodId as string,
      profileVersion: value.identity.profileVersion as string
    },
    profileId: value.profileId as DesignProfileId,
    verificationStatus: value.verificationStatus as DesignBasis['verificationStatus'],
    modified: value.modified,
    ...(value.materialModelModified === true ? { materialModelModified: true } : {}),
    overrideReason: value.overrideReason
  }

  let design: DesignBasis
  if (value.format === 'globalResultantFactor') {
    assert(
      value.transverseReinforcement === 'other' || value.transverseReinforcement === 'qualifying-spiral',
      'inputs.design.transverseReinforcement is invalid'
    )
    assert(typeof value.axialCapEnabled === 'boolean', 'inputs.design.axialCapEnabled must be boolean')
    const factorKeys: Array<keyof GlobalStrengthReductionFactors> = [
      'phiCompressionOther',
      'phiCompressionSpiral',
      'phiTension',
      'axialCapOther',
      'axialCapSpiral'
    ]
    for (const key of factorKeys) {
      assert(isFiniteNumber(factors[key]), `inputs.design.factors.${key} must be finite`)
    }
    assertRecord(value.transition, 'inputs.design.transition must be an object')
    let transition: Extract<DesignBasis, { format: 'globalResultantFactor' }>['transition']
    if (value.transition.type === 'yield-plus-strain') {
      assert(isFiniteNumber(value.transition.extraStrain), 'inputs.design.transition.extraStrain must be finite')
      transition = { type: 'yield-plus-strain', extraStrain: value.transition.extraStrain }
    } else {
      assert(
        value.transition.type === 'fixed-or-yield-multiple',
        'inputs.design.transition.type is unsupported'
      )
      for (const key of ['yieldStressThreshold', 'fixedStrainLimit', 'highStrengthYieldMultiple'] as const) {
        assert(isFiniteNumber(value.transition[key]), `inputs.design.transition.${key} must be finite`)
      }
      transition = {
        type: 'fixed-or-yield-multiple',
        yieldStressThreshold: value.transition.yieldStressThreshold as number,
        fixedStrainLimit: value.transition.fixedStrainLimit as number,
        highStrengthYieldMultiple: value.transition.highStrengthYieldMultiple as number
      }
    }
    design = {
      ...common,
      format: 'globalResultantFactor',
      transverseReinforcement: value.transverseReinforcement,
      axialCapEnabled: value.axialCapEnabled,
      factors: Object.fromEntries(factorKeys.map((key) => [key, factors[key]])) as unknown as GlobalStrengthReductionFactors,
      transition
    }
  } else {
    assert(value.format === 'designMaterialReevaluation', 'inputs.design.format is unsupported')
    for (const key of ['alphaCc', 'gammaC', 'gammaS'] as const) {
      assert(isFiniteNumber(factors[key]), `inputs.design.factors.${key} must be finite`)
    }
    design = {
      ...common,
      format: 'designMaterialReevaluation',
      factors: {
        alphaCc: factors.alphaCc as number,
        gammaC: factors.gammaC as number,
        gammaS: factors.gammaS as number
      }
    }
  }
  assertValidDesignBasis(design)
  return design
}

export const collectProjectWarnings = (document: PmProjectDocument): string[] => {
  const warnings: string[] = []
  const profile = calculationProfile(document.inputs.calculationProfileId)
  const steelIds = new Set(document.inputs.materials.steel.map((item) => item.id))

  if (profile.implementationStatus === 'preview') {
    warnings.push(`${profile.label} is preview-only and must not be represented as released design output`)
  }
  if (document.inputs.design.materialModelModified) {
    warnings.push('The selected concrete model modifies the Code-default calculation profile')
  }

  if (!steelIds.has(document.inputs.materials.defaults.steelMaterialId)) {
    warnings.push('defaults.steelMaterialId does not match any steel material; the first steel will be used on open')
  }

  for (const rebar of document.inputs.geometry.rebars) {
    if (rebar.steelMaterialId !== undefined && !steelIds.has(rebar.steelMaterialId)) {
      warnings.push(`Rebar ${rebar.id} references missing steelMaterialId ${rebar.steelMaterialId}`)
    }
  }

  return warnings
}

export const parseProjectDocumentValue = (value: unknown): PmProjectDocument => {
  assertRecord(value, 'Project JSON must be an object')
  assert(value.schema === PM_PROJECT_SCHEMA, `schema must be "${PM_PROJECT_SCHEMA}"`)
  assert(value.version === PM_PROJECT_VERSION, `Unsupported project version: ${String(value.version)}`)
  assertRecord(value.meta, 'meta must be an object')
  assertEntityId(value.meta.id, 'meta.id')
  assert(isString(value.meta.name), 'meta.name must be a string')
  assert(isString(value.meta.createdAt), 'meta.createdAt must be a string')
  assert(isString(value.meta.updatedAt), 'meta.updatedAt must be a string')
  assertRecord(value.inputs, 'inputs must be an object')
  assert(isCalculationProfileId(value.inputs.calculationProfileId), 'inputs.calculationProfileId is unsupported')

  const materials = parseMaterials(value.inputs.materials)
  const analysis = parseAnalysis(value.inputs.analysis)
  const profile = calculationProfile(value.inputs.calculationProfileId)
  const design = parseDesignBasis(value.inputs.design, materials)
  assert(
    (profile.mechanics === 'equivalent-rectangular-block') ===
      (analysis.methodId === EQUIVALENT_BLOCK_SURFACE_METHOD),
    'inputs.calculationProfileId and inputs.analysis.methodId select different mechanics'
  )
  assert(
    design.format === profile.resistanceFormat && design.profileId === profile.designProfileId,
    'inputs.calculationProfileId and inputs.design select different standards or resistance formats'
  )
  assert(
    materials.concrete.standard === profile.materialStandard &&
      materials.steel.every((steel) => steel.standard === profile.materialStandard),
    'inputs.calculationProfileId and inputs.materials select different standards'
  )
  /**
   * A code profile pins its concrete model through the standard above. A custom profile does not,
   * so the model has to be checked against the mechanics that will evaluate it: a block law cannot
   * reach the fibre kernel, and a fibre law carries no `β1` for the block kernel.
   */
  const profileAcceptsMaterialModel = profile.materialStandard === 'CUSTOM'
    ? CONCRETE_MODELS_FOR_MECHANICS[profile.mechanics].includes(materials.concrete.stressStrain.type)
    : profile.concreteModels.some(
        (model) => model.materialModelType === materials.concrete.stressStrain.type
      )
  assert(
    profileAcceptsMaterialModel,
    `inputs.materials.concrete.stressStrain.type "${materials.concrete.stressStrain.type}" is not permitted by ${profile.id}`
  )
  const selectedModel = profile.concreteModels.find(
    (model) => model.materialModelType === materials.concrete.stressStrain.type
  )
  if (profile.code !== null && selectedModel?.source === 'user-defined') {
    assert(
      design.materialModelModified === true && design.modified,
      'a user-defined concrete model under a design Code must be recorded as a modified profile'
    )
    assert(
      design.overrideReason.trim().length > 0,
      'a user-defined concrete model under a design Code requires an override reason'
    )
  }
  return {
    schema: PM_PROJECT_SCHEMA,
    version: PM_PROJECT_VERSION,
    meta: {
      id: value.meta.id,
      name: value.meta.name,
      createdAt: value.meta.createdAt,
      updatedAt: value.meta.updatedAt
    },
    inputs: {
      calculationProfileId: value.inputs.calculationProfileId,
      geometry: parseGeometry(value.inputs.geometry),
      materials,
      loadings: parseLoadings(value.inputs.loadings),
      analysis,
      design
    }
  }
}
