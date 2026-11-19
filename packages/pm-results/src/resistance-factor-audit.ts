import type { GlobalStrengthReductionBasis, ResistanceClassification } from '@pm/design'
import { AnalysisInputError } from './errors'

type StrainFactorInputs = {
  factor: number
  classification: ResistanceClassification
  tensileStrain: number
  yieldStrain: number
  tensionLimit: number
  yieldStress: number
  elasticModulus: number
  steelMaterialId: number
  controllingRebarId: number | null
  compressionFactor: number
  tensionFactor: number
  transverseReinforcement: GlobalStrengthReductionBasis['transverseReinforcement']
  limitRule: GlobalStrengthReductionBasis['transition']
  /** Exact denominator policy of the evaluator that produced this factor. */
  transitionDenominator: number
  minimumTransitionSpan: number | null
  classificationTolerance: number
}

export type StrainResistanceFactorAudit = StrainFactorInputs & {
  kind: 'strain-controlled'
  interpolation: { numerator: number; denominator: number; ratio: number } | null
}

export type AxialBendingResistanceFactorAudit = {
  kind: 'axial-bending'
  factor: number
  classification: 'axial-compression-controlled' | 'combined-compression' | 'bending' | 'combined-tension'
  compressionFactor: number
  tensionFactor: number
  compressionClass: 'ordinary' | 'short-column-high-permanent-load'
  neutralAxisRatio: number
  nominalAxial: number
  balancedAxial: number
  pureTensionAxial: number
  bending: { intercept: number; numerator: number; denominator: number; minimum: number; maximum: number; factor: number }
  axialRatio: number | null
}

export type CalculationAuditResistanceFactor = StrainResistanceFactorAudit | AxialBendingResistanceFactorAudit

/** Expose operands from the actual evaluator; never choose a branch or replace its factor here. */
export const strainResistanceFactorAudit = (inputs: StrainFactorInputs): StrainResistanceFactorAudit => {
  if ([...Object.values(inputs), ...Object.values(inputs.limitRule)].some(value => typeof value === 'number' && !Number.isFinite(value))
    || !(inputs.yieldStrain > 0) || !(inputs.transitionDenominator > 0)
    || !(inputs.elasticModulus > 0) || !(inputs.yieldStress > 0)) {
    throw new AnalysisInputError('AUDIT_RECONCILIATION_FAILED', 'Resistance-factor audit requires finite evaluator operands and positive steel/transition values.')
  }
  const numerator = inputs.tensileStrain - inputs.yieldStrain
  if (inputs.classification === 'transition' && !Number.isFinite(numerator / inputs.transitionDenominator)) {
    throw new AnalysisInputError('AUDIT_RECONCILIATION_FAILED', 'Resistance-factor interpolation evidence is non-finite.')
  }
  return {
    ...inputs,
    kind: 'strain-controlled',
    limitRule: { ...inputs.limitRule },
    interpolation: inputs.classification === 'transition'
      ? { numerator, denominator: inputs.transitionDenominator, ratio: numerator / inputs.transitionDenominator }
      : null
  }
}
