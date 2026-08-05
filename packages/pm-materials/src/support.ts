/**
 * Which stress-strain models the local evaluator is allowed to analyse.
 *
 * One source of truth for the UI selector and for the analysis kernel: hiding an option would only
 * stop new projects, while an imported file could still reach the evaluator. Both read this.
 */
import type { ConcreteMaterial, ConcreteStressStrainModel, MaterialStandard } from './types'

export type ModelSupportIssue = {
  modelType: ConcreteStressStrainModel['type']
  /** Why the local evaluator must not run this model. */
  reason: string
  /** Where the decision and its remedy are recorded. */
  reference: string
}

/**
 * `aci-whitney-block` is stored, validated and rendered, but `beta1` never reaches the stress
 * evaluation: `stressAciWhitneyConcrete` returns `alpha*fck` for every fibre with `eps > 0`, so the
 * uniform block covers the full compression depth `c` instead of `a = beta1*c`. That overstates the
 * concrete compression force by `1/beta1` (1.18 to 1.54) — unconservative, and silent.
 *
 * A strain threshold at `(1 - beta1)*epsCu` would reproduce the block while the extreme fibre sits
 * exactly at `epsCu`, but that condition does not hold for the inverse solver, and the equivalent
 * block is a resultant equivalence rather than a pointwise law: it has no normative basis for a
 * non-rectangular compression zone under biaxial bending. The implemented ACI calculation profile
 * therefore routes to the resultant-level adapter in `@pm/code-aci318` through
 * `@pm/analysis-equivalent-block`; this guard remains for any attempted local-fibre route.
 */
export const UNSUPPORTED_CONCRETE_MODELS: Partial<Record<ConcreteStressStrainModel['type'], ModelSupportIssue>> = {
  'aci-whitney-block': {
    modelType: 'aci-whitney-block',
    reason:
      'The equivalent rectangular (Whitney) block cannot run in the local fibre kernel: β1 is not a pointwise stress-strain parameter. Select the ACI 318 equivalent-block calculation profile so a = β1·c is evaluated by the implemented resultant-level adapter.',
    reference: 'docs/12-calculation-models-defaults-and-workflows.md §3'
  },
  'as3600-equivalent-block': {
    modelType: 'as3600-equivalent-block',
    reason:
      'The AS 3600 equivalent rectangular block is a resultant equivalence. Select the AS 3600 equivalent-block calculation profile so alpha2 and gamma are applied by the code adapter.',
    reference: 'docs/12-calculation-models-defaults-and-workflows.md'
  },
  'user-block': {
    modelType: 'user-block',
    reason:
      'A user-defined equivalent rectangular block is a resultant equivalence, not a pointwise σ(ε) law, so β1 would be discarded by the fibre kernel exactly as it is for the Whitney block. Select the Custom equivalent-block calculation profile so a = β1·c is evaluated by the resultant-level adapter.',
    reference: 'docs/12-calculation-models-defaults-and-workflows.md §3'
  }
}

export const concreteModelSupportIssue = (material: ConcreteMaterial): ModelSupportIssue | null =>
  UNSUPPORTED_CONCRETE_MODELS[material.stressStrain.type] ?? null

/**
 * Which ultimate strain domain the engine builds its capacity states on.
 *
 * Only one is implemented. Naming it matters because the material law and the strain domain are
 * separate choices that a user cannot see: selecting an EC2 stress-strain relation does not select
 * an EC2 strain domain, and silently pairing the two is how a result ends up looking like a code
 * check that it is not.
 */
export type StrainDomainId = 'concrete-pivot-ultimate'

export const IMPLEMENTED_STRAIN_DOMAIN: StrainDomainId = 'concrete-pivot-ultimate'

export const STRAIN_DOMAIN_DESCRIPTION: Record<StrainDomainId, string> = {
  'concrete-pivot-ultimate':
    'Every capacity state pins the extreme compression fibre at εcu and rotates the plane about it (the ACI/KDS convention).'
}

export type StrainDomainMismatch = {
  domain: StrainDomainId
  standard: MaterialStandard
  message: string
  reference: string
}

/**
 * EN 1992-1-1 builds its ULS states from several pivots: domains 3 to 5 pivot on `εcu2` exactly as
 * implemented here, but domains 1 and 2 — low axial load and high tension — pivot on the
 * reinforcement strain limit `εud` with the concrete below `εcu2`. Pinning `εcu` everywhere is
 * therefore incomplete rather than wrong: the states it does produce are admissible EC2 states, but
 * the tension-controlled part of the boundary is not the one EN 1992 prescribes.
 *
 * That is a warning, not a block — unlike the Whitney block, nothing here is evaluated with a law it
 * was not written for.
 */
export const strainDomainMismatch = (material: ConcreteMaterial): StrainDomainMismatch | null => {
  if (material.standard !== 'EC2') return null
  return {
    domain: IMPLEMENTED_STRAIN_DOMAIN,
    standard: 'EC2',
    message:
      'EN 1992-1-1 material laws are paired with the ACI/KDS concrete-pivot strain domain. EC2 domains 1–2 pivot on the reinforcement limit εud instead, so the tension-controlled part of this surface is not an EN 1992 boundary and the result is preview only.',
    reference: 'docs/11-design-standards-and-resistance-formats.md §7'
  }
}

/** Concrete sources whose default model is currently blocked, so the UI can disable them up front. */
export const BLOCKED_CONCRETE_STANDARDS: Partial<Record<MaterialStandard, ModelSupportIssue>> = {
  ACI318: UNSUPPORTED_CONCRETE_MODELS['aci-whitney-block']!,
  AS3600: UNSUPPORTED_CONCRETE_MODELS['as3600-equivalent-block']!
}
