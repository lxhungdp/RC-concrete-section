import type { CompiledMaterial, ConcreteMaterial } from '../types'
import { positiveOr } from '../math'

export type KdsParabolicParams = {
  eps0: number
  epsCu: number
  n: number
  /** `alpha / gammaC * fck`, resolved once at compilation. */
  peak: number
}

export const resolveKdsParabolicParams = (material: ConcreteMaterial): KdsParabolicParams => {
  const model = material.stressStrain.type === 'kds-parabolic' ? material.stressStrain : null
  const eps0 = positiveOr(model?.eps0 ?? material.limits.eps0, 0.002)
  const epsCu = positiveOr(model?.epsCu ?? material.limits.epsCu, 0.0033)
  const n = positiveOr(model?.n, 2)
  const alphaSource =
    material.factors?.gammaC !== undefined
      ? material.factors?.alpha ?? model?.alpha
      : model?.alpha ?? material.factors?.alpha
  const alpha =
    positiveOr(alphaSource, 0.85) /
    positiveOr(material.factors?.gammaC, 1) *
    positiveOr(material.factors?.resistanceScale, 1)
  return { eps0, epsCu, n, peak: alpha * material.fck }
}

export const stressKdsParabolicFrom = (params: KdsParabolicParams, strain: number) => {
  if (strain <= 0 || strain > params.epsCu) return 0
  if (strain <= params.eps0) {
    return params.peak * (1 - Math.pow(1 - strain / params.eps0, params.n))
  }
  return params.peak
}

export const tangentKdsParabolicFrom = (params: KdsParabolicParams, strain: number) => {
  if (strain <= 0 || strain >= params.eps0 || strain > params.epsCu) return 0
  return (
    (params.peak * params.n * Math.pow(Math.max(0, 1 - strain / params.eps0), params.n - 1)) /
    params.eps0
  )
}

export const stressKdsParabolicConcrete = (material: ConcreteMaterial, strain: number) => {
  return stressKdsParabolicFrom(resolveKdsParabolicParams(material), strain)
}

export const compileKdsParabolicConcrete = (material: ConcreteMaterial): CompiledMaterial => {
  const params = resolveKdsParabolicParams(material)
  const stress =
    params.n === 2
      ? (strain: number) => {
          if (strain <= 0 || strain > params.epsCu) return 0
          if (strain <= params.eps0) {
            const remainder = 1 - strain / params.eps0
            return params.peak * (1 - remainder * remainder)
          }
          return params.peak
        }
      : (strain: number) => stressKdsParabolicFrom(params, strain)
  const tangent =
    params.n === 2
      ? (strain: number) => {
          if (strain <= 0 || strain >= params.eps0 || strain > params.epsCu) return 0
          return (2 * params.peak * (1 - strain / params.eps0)) / params.eps0
        }
      : (strain: number) => tangentKdsParabolicFrom(params, strain)
  return {
    id: material.id,
    family: 'concrete',
    stress,
    tangent,
    limits: {
      epsCompressionUltimate: material.limits.epsCu
    }
  }
}
