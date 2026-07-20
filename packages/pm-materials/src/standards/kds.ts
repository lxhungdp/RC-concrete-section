import type { ConcreteMaterial, MaterialStore, SteelMaterial } from '../types'

export const makeMaterialId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

export const kdsConcreteParams = (fck: number) => {
  const epsCu = Math.min(0.0033 - (fck - 40) / 100000, 0.0033)
  const eps0 = Math.max(0.002 + (fck - 40) / 100000, 0.002)
  const n = Math.min(1.2 + 1.5 * Math.pow((100 - fck) / 60, 4), 2)
  return { eps0, epsCu, n, alpha: 0.85 }
}

export const createKdsConcrete = (patch: Partial<ConcreteMaterial> = {}): ConcreteMaterial => {
  const fck = patch.fck ?? 30
  const params = kdsConcreteParams(fck)
  return {
    id: patch.id ?? makeMaterialId('conc'),
    name: patch.name ?? `KDS C${fck}`,
    standard: patch.standard ?? 'KDS',
    fck,
    elasticModulus: patch.elasticModulus,
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

export const createKdsRebarSteel = (patch: Partial<SteelMaterial> = {}): SteelMaterial => {
  const fy = patch.fy ?? 400
  const elasticModulus = patch.elasticModulus ?? 200000
  return {
    id: patch.id ?? makeMaterialId('steel'),
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
  const concrete = createKdsConcrete({ id: 'conc-kds-c30', name: 'Concrete C30' })
  const steel = createKdsRebarSteel({ id: 'steel-kds-sd400', name: 'Rebar SD400' })
  return {
    unit: 'MPa',
    strainSign: 'compression-positive',
    concrete,
    steel: [steel],
    defaults: {
      steelMaterialId: steel.id
    }
  }
}
