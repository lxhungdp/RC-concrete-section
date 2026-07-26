import type { CompiledMaterial, ConcreteMaterial } from '../types'
import { positiveOr } from '../math'

export type Ec2ParabolicRectangularParams = {
  epsC2: number
  epsCu2: number
  n: number
  /** `alpha_cc / gamma_c * fck` — the plateau design stress. */
  peak: number
  ignoreTension: boolean
}

export const resolveEc2ParabolicRectangularParams = (material: ConcreteMaterial): Ec2ParabolicRectangularParams => {
  const model = material.stressStrain.type === 'ec2-parabolic-rectangular' ? material.stressStrain : null
  const epsC2 = positiveOr(model?.epsC2 ?? material.limits.eps0, 0.002)
  const epsCu2 = positiveOr(model?.epsCu2 ?? material.limits.epsCu, 0.0035)
  const n = positiveOr(model?.n, 2)
  const alphaSource =
    material.factors?.gammaC !== undefined ? material.factors?.alpha ?? model?.alpha : model?.alpha ?? material.factors?.alpha
  const alpha = positiveOr(alphaSource, 1) / positiveOr(material.factors?.gammaC, 1)
  return { epsC2, epsCu2, n, peak: alpha * material.fck, ignoreTension: material.limits.ignoreTension }
}

export const stressEc2ParabolicRectangularFrom = (params: Ec2ParabolicRectangularParams, strain: number) => {
  if (strain <= 0 && params.ignoreTension) return 0
  if (strain <= 0 || strain > params.epsCu2) return 0
  if (strain <= params.epsC2) return params.peak * (1 - Math.pow(1 - strain / params.epsC2, params.n))
  return params.peak
}

export const tangentEc2ParabolicRectangularFrom = (params: Ec2ParabolicRectangularParams, strain: number) => {
  if (strain < 0 || strain >= params.epsC2 || strain > params.epsCu2) return 0
  return (
    (params.peak * params.n * Math.pow(Math.max(0, 1 - strain / params.epsC2), params.n - 1)) /
    params.epsC2
  )
}

export const stressEc2ParabolicRectangularConcrete = (material: ConcreteMaterial, strain: number) =>
  stressEc2ParabolicRectangularFrom(resolveEc2ParabolicRectangularParams(material), strain)

export const compileEc2ParabolicRectangularConcrete = (material: ConcreteMaterial): CompiledMaterial => {
  const params = resolveEc2ParabolicRectangularParams(material)
  const stress =
    params.n === 2
      ? (strain: number) => {
          if (strain <= 0 && params.ignoreTension) return 0
          if (strain <= 0 || strain > params.epsCu2) return 0
          if (strain <= params.epsC2) {
            const remainder = 1 - strain / params.epsC2
            return params.peak * (1 - remainder * remainder)
          }
          return params.peak
        }
      : (strain: number) => stressEc2ParabolicRectangularFrom(params, strain)
  const tangent =
    params.n === 2
      ? (strain: number) => {
          if (strain < 0 || strain >= params.epsC2 || strain > params.epsCu2) return 0
          return (2 * params.peak * (1 - strain / params.epsC2)) / params.epsC2
        }
      : (strain: number) => tangentEc2ParabolicRectangularFrom(params, strain)
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
