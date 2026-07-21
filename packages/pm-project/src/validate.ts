import type { GeometryInput, GeometryInputOuter, GeometryInputRebar, Point2 } from '@pm/geometry'
import { CONCRETE_MATERIAL_ID, DEFAULT_CONCRETE_DENSITY } from '@pm/materials'
import type { ConcreteMaterial, MaterialStore, SteelMaterial, StressStrainPoint } from '@pm/materials'
import { isValidEntityId } from './ids'
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
  assertArray(value.rebars, `${path}.rebars must be an array`)

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
    }),
    rebars: value.rebars.map((rebar, index) => parseRebar(rebar, `${path}.rebars[${index}]`))
  }
}

const parseGeometry = (value: unknown): GeometryInput => {
  assertRecord(value, 'inputs.geometry must be an object')
  assertEntityId(value.id, 'inputs.geometry.id')
  assert(isString(value.name), 'inputs.geometry.name must be a string')
  assertArray(value.outers, 'inputs.geometry.outers must be an array')
  return {
    id: value.id,
    name: value.name,
    outers: value.outers.map((outer, index) => parseOuter(outer, `inputs.geometry.outers[${index}]`))
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
    value.standard === 'KDS' || value.standard === 'ACI318' || value.standard === 'EC2' || value.standard === 'CUSTOM',
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
    value.standard === 'KDS' || value.standard === 'ACI318' || value.standard === 'EC2' || value.standard === 'CUSTOM',
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

export const collectProjectWarnings = (document: PmProjectDocument): string[] => {
  const warnings: string[] = []
  const steelIds = new Set(document.inputs.materials.steel.map((item) => item.id))

  if (!steelIds.has(document.inputs.materials.defaults.steelMaterialId)) {
    warnings.push('defaults.steelMaterialId does not match any steel material; the first steel will be used on open')
  }

  for (const outer of document.inputs.geometry.outers) {
    for (const rebar of outer.rebars) {
      if (rebar.steelMaterialId !== undefined && !steelIds.has(rebar.steelMaterialId)) {
        warnings.push(`Rebar ${rebar.id} references missing steelMaterialId ${rebar.steelMaterialId}`)
      }
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
      geometry: parseGeometry(value.inputs.geometry),
      materials: parseMaterials(value.inputs.materials),
      loadings: parseLoadings(value.inputs.loadings)
    }
  }
}
