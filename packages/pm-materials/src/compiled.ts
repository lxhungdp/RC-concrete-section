import type { CompiledMaterial } from './types'

export class MaterialEvaluationError extends Error {
  readonly code = 'NON_FINITE_MATERIAL_EVALUATION' as const
  constructor(readonly materialId: number, readonly quantity: 'strain' | 'stress' | 'tangent' | 'limit') {
    super(`Material ${materialId} requires finite ${quantity}.`)
    this.name = 'MaterialEvaluationError'
  }
}

/** One finite boundary for all compiled laws, including direct model-compiler consumers. */
export const finiteCompiledMaterial = (compiled: CompiledMaterial): CompiledMaterial => {
  for (const limit of Object.values(compiled.limits)) {
    if (limit !== undefined && !Number.isFinite(limit)) throw new MaterialEvaluationError(compiled.id, 'limit')
  }
  const evaluate = (law: (strain: number) => number, quantity: 'stress' | 'tangent', strain: number) => {
    if (!Number.isFinite(strain)) throw new MaterialEvaluationError(compiled.id, 'strain')
    const value = law(strain)
    if (!Number.isFinite(value)) throw new MaterialEvaluationError(compiled.id, quantity)
    return value
  }
  return {
    ...compiled,
    stress: (strain) => evaluate(compiled.stress, 'stress', strain),
    tangent: (strain) => evaluate(compiled.tangent, 'tangent', strain)
  }
}
