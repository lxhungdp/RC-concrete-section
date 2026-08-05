import { nextAvailableId } from './ids'

export type StrainSignConvention = 'compression-positive'
export type MaterialStandard = 'KDS' | 'ACI318' | 'EC2' | 'AS3600' | 'CUSTOM'

/** Implicit units: stress MPa (N/mm²). Not stored in project JSON. */
export type MaterialStore = {
  strainSign: StrainSignConvention
  concrete: ConcreteMaterial
  steel: SteelMaterial[]
  defaults: {
    steelMaterialId: number
  }
}

export type ConcreteMaterial = {
  /** Always 1 in the concrete namespace. */
  id: number
  name: string
  standard: MaterialStandard
  /** Characteristic compressive strength fck / fc (MPa). */
  fck: number
  /** Concrete density mc (kg/m³), used by KDS Ec formula. */
  mc: number
  /** Elastic modulus Ec (MPa). */
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
    /**
     * Resistance-profile multiplier applied to the stress ordinate while the characteristic
     * strength and strain-shape parameters remain unchanged. This is the runtime representation
     * used by two-pass material-law reevaluation (for example KDS phi_c or EN alpha_cc/gamma_C).
     */
    resistanceScale?: number
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
      type: 'as3600-equivalent-block'
      alpha2: number
      gamma: number
      epsCu: number
    }
  | {
      type: 'user-curve'
      points: StressStrainPoint[]
      interpolation: 'linear'
      zeroTension?: boolean
    }
  /**
   * User-owned equivalent rectangular block: sigma_block = alpha * fck over a = beta1 * c.
   *
   * It carries no standard. Like `aci-whitney-block` it is a resultant equivalence, so the fibre
   * kernel refuses it (see `support.ts`) and only the equivalent-block adapter may consume it.
   */
  | {
      type: 'user-block'
      beta1: number
      epsCu: number
      alpha: number
    }

export type SteelMaterial = {
  id: number
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
    /** Design yield-strength multiplier; the elastic modulus is never scaled. */
    resistanceScale?: number
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
  id: number
  family: 'concrete' | 'steel'
  stress: (strain: number) => number
  tangent: (strain: number) => number
  limits: {
    epsCompressionUltimate?: number
    epsTensionUltimate?: number
    epsYield?: number
  }
}

export const nextSteelMaterialId = (steel: Array<{ id: number }>) =>
  nextAvailableId(steel.map((item) => item.id))
