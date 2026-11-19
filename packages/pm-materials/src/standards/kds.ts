import { nextAvailableId } from '../ids'
import type { ConcreteMaterial, MaterialStore, SteelMaterial } from '../types'

/** Concrete material namespace is fixed: always id 1. */
export const CONCRETE_MATERIAL_ID = 1

/** Default concrete density for KDS Ec formula (kg/m³). */
export const DEFAULT_CONCRETE_DENSITY = 2350

export const kdsConcreteParams = (fck: number) => {
  const epsCu = Math.min(0.0033 - (fck - 40) / 100000, 0.0033)
  const eps0 = Math.max(0.002 + (fck - 40) / 100000, 0.002)
  const n = Math.min(1.2 + 1.5 * Math.pow((100 - fck) / 60, 4), 2)
  return { eps0, epsCu, n, alpha: 0.85 }
}

/** KDS mean compressive strength fcm from fck (MPa). */
export const kdsMeanCompressiveStrength = (fck: number) => {
  if (fck <= 40) return fck + 4
  if (fck >= 60) return fck + 6
  return fck * 1.1
}

/**
 * KDS elastic modulus (MPa):
 * Ec = 0.077 · mc^1.5 · fcm^(1/3)
 */
export const kdsElasticModulus = (fck: number, mc: number = DEFAULT_CONCRETE_DENSITY) => {
  const fcm = kdsMeanCompressiveStrength(fck)
  return 0.077 * Math.pow(mc, 1.5) * Math.pow(fcm, 1 / 3)
}

/**
 * Recompute KDS-derived concrete fields.
 * - standard === KDS → Ec, εcu
 * - + model kds-parabolic → εc0, n
 */
export const applyKdsConcreteDerived = (material: ConcreteMaterial): ConcreteMaterial => {
  if (material.standard !== 'KDS') return material

  const mc = material.mc ?? DEFAULT_CONCRETE_DENSITY
  const params = kdsConcreteParams(material.fck)
  const elasticModulus = kdsElasticModulus(material.fck, mc)

  if (material.stressStrain.type === 'kds-parabolic') {
    return {
      ...material,
      mc,
      elasticModulus,
      stressStrain: {
        type: 'kds-parabolic',
        n: params.n,
        eps0: params.eps0,
        epsCu: params.epsCu,
        alpha: material.stressStrain.alpha
      },
      limits: {
        ...material.limits,
        eps0: params.eps0,
        epsCu: params.epsCu
      }
    }
  }

  return {
    ...material,
    mc,
    elasticModulus,
    limits: {
      ...material.limits,
      epsCu: params.epsCu
    }
  }
}

export const createKdsConcrete = (patch: Partial<ConcreteMaterial> = {}): ConcreteMaterial => {
  const fck = patch.fck ?? 30
  const mc = patch.mc ?? DEFAULT_CONCRETE_DENSITY
  const params = kdsConcreteParams(fck)
  return {
    id: CONCRETE_MATERIAL_ID,
    name: patch.name ?? `KDS C${fck}`,
    standard: patch.standard ?? 'KDS',
    fck,
    mc,
    elasticModulus: patch.elasticModulus ?? kdsElasticModulus(fck, mc),
    stressStrain: patch.stressStrain ?? {
      type: 'kds-parabolic',
      ...params
    },
    limits: patch.limits ?? {
      eps0: params.eps0,
      epsCu: params.epsCu,
      ignoreTension: true
    },
    factors: patch.factors ?? {
      alpha: params.alpha
    }
  }
}

export const createKdsRebarSteel = (
  patch: Partial<SteelMaterial> = {},
  usedSteelIds: Iterable<number> = []
): SteelMaterial => {
  const fy = patch.fy ?? 400
  const elasticModulus = patch.elasticModulus ?? 200000
  return {
    id: patch.id ?? nextAvailableId(usedSteelIds),
    name: patch.name ?? `SD${fy}`,
    standard: patch.standard ?? 'KDS',
    fy,
    elasticModulus,
    stressStrain: patch.stressStrain ?? {
      type: 'elastic-perfectly-plastic'
    },
    limits: patch.limits ?? {
      epsY: fy / elasticModulus
    },
    factors: patch.factors
  }
}

export const createDefaultMaterialStore = (): MaterialStore => {
  const concrete = createKdsConcrete({ name: 'Concrete C30' })
  const steel = createKdsRebarSteel({ name: 'Rebar SD400' }, [])
  return {
    strainSign: 'compression-positive',
    concrete,
    steel: [steel],
    defaults: {
      steelMaterialId: steel.id
    }
  }
}
