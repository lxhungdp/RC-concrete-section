export type MaterialUnit = 'MPa'
export type StrainSignConvention = 'compression-positive'
export type MaterialStandard = 'KDS' | 'ACI318' | 'EC2' | 'CUSTOM'

export type MaterialStore = {
  unit: MaterialUnit
  strainSign: StrainSignConvention
  concrete: ConcreteMaterial
  steel: SteelMaterial[]
  defaults: {
    steelMaterialId: string
  }
}

export type ConcreteMaterial = {
  id: string
  name: string
  standard: MaterialStandard
  fck: number
  elasticModulus?: number
  stressStrain: ConcreteStressStrainModel
  limits: {
    eps0?: number
    epsCu: number
    ignoreTension: boolean
  }
  factors?: {
    alpha?: number
    gammaC?: number
  }
}

export type ConcreteStressStrainModel =
  | {
      type: 'kds-parabolic'
      n: number
      eps0: number
      epsCu: number
      alpha: number
    }
  | {
      type: 'aci-whitney-block'
      beta1: number
      epsCu: number
      alpha: number
    }
  | {
      type: 'ec2-parabolic-rectangular'
      n: number
      epsC2: number
      epsCu2: number
      alpha: number
    }
  | {
      type: 'user-curve'
      points: StressStrainPoint[]
      interpolation: 'linear'
      zeroTension?: boolean
    }

export type SteelMaterial = {
  id: string
  name: string
  standard: MaterialStandard
  fy: number
  elasticModulus: number
  stressStrain: SteelStressStrainModel
  limits?: {
    epsY?: number
    epsU?: number
  }
  factors?: {
    gammaS?: number
  }
}

export type SteelStressStrainModel =
  | {
      type: 'elastic-perfectly-plastic'
    }
  | {
      type: 'bilinear'
      hardeningRatio: number
    }
  | {
      type: 'user-curve'
      points: StressStrainPoint[]
      interpolation: 'linear'
    }

export type StressStrainPoint = {
  strain: number
  stress: number
}

export type MaterialDefinition = ConcreteMaterial | SteelMaterial

export type CompiledMaterial = {
  id: string
  family: 'concrete' | 'steel'
  stress: (strain: number) => number
  tangent: (strain: number) => number
  limits: {
    epsCompressionUltimate?: number
    epsTensionUltimate?: number
    epsYield?: number
  }
}
