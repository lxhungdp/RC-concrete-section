import { resolveEc2ParabolicRectangularParams } from './concrete/ec2-parabolic-rectangular'
import { resolveKdsParabolicParams } from './concrete/kds-parabolic'
import type { ConcreteMaterial, MaterialStandard, SteelMaterial } from './types'

export type MaterialLawAuditParameter = {
  symbol: string
  label: string
  value: number
  unit: 'MPa' | '–'
  derivation?: string
}

export type MaterialLawProvenance = {
  document: string
  reference: string | null
  note: string
}

/** Serializable description of the exact compiled law; it never evaluates a result. */
export type MaterialLawAudit = {
  model: string
  equations: string[]
  parameters: MaterialLawAuditParameter[]
  provenance: MaterialLawProvenance
}

const materialProvenance = (
  standard: MaterialStandard,
  role: 'concrete' | 'steel',
  userDefined: boolean
): MaterialLawProvenance => {
  if (userDefined || standard === 'CUSTOM') {
    return {
      document: 'Project material definition',
      reference: null,
      note: 'User-defined law. The project engineer must supply and approve its engineering basis.'
    }
  }
  if (standard === 'EC2') {
    return {
      document: 'EN 1992-1-1:2004',
      reference: role === 'concrete'
        ? 'Clauses 3.1.6 and 3.1.7; Table 3.1'
        : 'Clauses 3.2.7 and 3.2.8',
      note: 'Recommended-value preview; no National Annex is selected.'
    }
  }
  return {
    document: `${standard} material definition stored in the project`,
    reference: null,
    note: 'The current material contract does not carry a clause-level source for this local law. This is an explicit provenance gap, not permission to infer one.'
  }
}

export const describeConcreteMaterialLaw = (material: ConcreteMaterial): MaterialLawAudit => {
  const model = material.stressStrain
  if (model.type === 'kds-parabolic') {
    const p = resolveKdsParabolicParams(material)
    const alphaSource = material.factors?.gammaC !== undefined
      ? material.factors.alpha ?? model.alpha
      : model.alpha ?? material.factors?.alpha
    const alpha = alphaSource ?? 0.85
    const gammaC = material.factors?.gammaC ?? 1
    const stressScale = material.factors?.resistanceScale ?? 1
    return {
      model: model.type,
      equations: [
        '0 < ε ≤ εc0: σc = fpeak·[1 − (1 − ε/εc0)^n]',
        'εc0 < ε ≤ εcu: σc = fpeak',
        'ε ≤ 0 or ε > εcu: σc = 0'
      ],
      parameters: [
        { symbol: 'fck', label: 'Characteristic concrete strength', value: material.fck, unit: 'MPa' },
        { symbol: 'α', label: 'Source stress coefficient', value: alpha, unit: '–', derivation: alphaSource === undefined ? 'model fallback' : 'material/model input' },
        { symbol: 'γc', label: 'Concrete partial factor', value: gammaC, unit: '–', derivation: 'material factor, default 1' },
        { symbol: 'ks', label: 'Additional resistance scale', value: stressScale, unit: '–', derivation: 'material factor, default 1' },
        { symbol: 'αeff', label: 'Effective stress coefficient', value: p.peak / material.fck, unit: '–', derivation: 'α/γc·ks' },
        { symbol: 'fpeak', label: 'Peak concrete stress', value: p.peak, unit: 'MPa', derivation: 'fck·α/γc·ks' },
        { symbol: 'εc0', label: 'Peak / plateau strain', value: p.eps0, unit: '–' },
        { symbol: 'εcu', label: 'Ultimate compression strain', value: p.epsCu, unit: '–' },
        { symbol: 'n', label: 'Parabola exponent', value: p.n, unit: '–' }
      ],
      provenance: materialProvenance(material.standard, 'concrete', false)
    }
  }
  if (model.type === 'ec2-parabolic-rectangular') {
    const p = resolveEc2ParabolicRectangularParams(material)
    const alphaSource = material.factors?.gammaC !== undefined
      ? material.factors.alpha ?? model.alpha
      : model.alpha ?? material.factors?.alpha
    const alpha = alphaSource ?? 1
    const gammaC = material.factors?.gammaC ?? 1
    const stressScale = material.factors?.resistanceScale ?? 1
    return {
      model: model.type,
      equations: [
        '0 < ε ≤ εc2: σc = fcd·[1 − (1 − ε/εc2)^n]',
        'εc2 < ε ≤ εcu2: σc = fcd',
        'ε ≤ 0 or ε > εcu2: σc = 0'
      ],
      parameters: [
        { symbol: 'fck', label: 'Characteristic concrete strength', value: material.fck, unit: 'MPa' },
        { symbol: 'αcc', label: 'Source stress coefficient', value: alpha, unit: '–', derivation: alphaSource === undefined ? 'model fallback' : 'material/model input' },
        { symbol: 'γc', label: 'Concrete partial factor', value: gammaC, unit: '–', derivation: 'material factor, default 1' },
        { symbol: 'ks', label: 'Additional resistance scale', value: stressScale, unit: '–', derivation: 'material factor, default 1' },
        { symbol: 'αeff', label: 'Effective design coefficient', value: p.peak / material.fck, unit: '–', derivation: 'αcc/γc·ks' },
        { symbol: 'fcd', label: 'Concrete stress ordinate', value: p.peak, unit: 'MPa', derivation: 'fck·αcc/γc·ks' },
        { symbol: 'εc2', label: 'End of parabolic branch', value: p.epsC2, unit: '–' },
        { symbol: 'εcu2', label: 'Ultimate compression strain', value: p.epsCu2, unit: '–' },
        { symbol: 'n', label: 'Parabola exponent', value: p.n, unit: '–' }
      ],
      provenance: materialProvenance(material.standard, 'concrete', false)
    }
  }
  if (model.type === 'user-curve') {
    const stressScale = material.factors?.resistanceScale ?? 1
    return {
      model: model.type,
      equations: [
        'Between adjacent sorted points: Δεeff = max(10⁻¹², εj+1 − εj); σc = σj + (ε − εj)(σj+1 − σj)/Δεeff',
        `${model.zeroTension ?? material.limits.ignoreTension ? 'ε ≤ 0: σc = 0; ' : ''}outside the tabulated range: clamp to the end stress`
      ],
      parameters: [
        { symbol: 'ks', label: 'Applied stress scale', value: stressScale, unit: '–', derivation: 'material resistanceScale, default 1' },
        ...model.points.flatMap((point, index) => [
          { symbol: `ε${index + 1}`, label: `Curve point ${index + 1} strain`, value: point.strain, unit: '–' as const },
          { symbol: `σ${index + 1}`, label: `Curve point ${index + 1} stress used by model`, value: point.stress * stressScale, unit: 'MPa' as const, derivation: `input σ${index + 1}·ks` }
        ])
      ],
      provenance: materialProvenance(material.standard, 'concrete', true)
    }
  }
  const alpha = 'alpha' in model ? model.alpha : model.type === 'as3600-equivalent-block' ? model.alpha2 : 1
  const depth = 'beta1' in model ? model.beta1 : model.type === 'as3600-equivalent-block' ? model.gamma : 1
  const epsCu = 'epsCu' in model ? model.epsCu : material.limits.epsCu
  return {
    model: model.type,
    equations: ['Equivalent-block parameters are evaluated by the separate resultant-level kernel; this is not a local fibre law.'],
    parameters: [
      { symbol: model.type === 'as3600-equivalent-block' ? 'α2' : 'α', label: 'Block stress coefficient', value: alpha, unit: '–' },
      { symbol: model.type === 'as3600-equivalent-block' ? 'γ' : 'β1', label: 'Block depth coefficient', value: depth, unit: '–' },
      { symbol: 'εcu', label: 'Extreme compression strain', value: epsCu, unit: '–' }
    ],
    provenance: materialProvenance(material.standard, 'concrete', model.type === 'user-block')
  }
}

export const effectiveSteelYieldStress = (material: SteelMaterial) =>
  material.fy /
  (material.factors?.gammaS ?? 1) *
  (material.factors?.resistanceScale ?? 1)

export const describeSteelMaterialLaw = (material: SteelMaterial): MaterialLawAudit => {
  const fy = effectiveSteelYieldStress(material)
  const model = material.stressStrain
  const stressFactors: MaterialLawAuditParameter[] = [
    { symbol: 'Es', label: 'Steel elastic modulus', value: material.elasticModulus, unit: 'MPa' },
    { symbol: 'fy', label: 'Input yield strength', value: material.fy, unit: 'MPa' },
    { symbol: 'γs', label: 'Steel partial factor', value: material.factors?.gammaS ?? 1, unit: '–', derivation: 'material factor, default 1' },
    { symbol: 'ks', label: 'Additional resistance scale', value: material.factors?.resistanceScale ?? 1, unit: '–', derivation: 'material factor, default 1' },
    { symbol: 'fy,model', label: 'Yield stress used by the model', value: fy, unit: 'MPa', derivation: 'fy/γs·ks' }
  ]
  if (model.type === 'elastic-perfectly-plastic') {
    return {
      model: model.type,
      equations: ['σs = clamp(Es·ε, −fy,model, +fy,model)'],
      parameters: [...stressFactors, { symbol: 'εy', label: 'Stress reaches the yield plateau', value: fy / material.elasticModulus, unit: '–', derivation: 'fy,model/Es' }],
      provenance: materialProvenance(material.standard, 'steel', false)
    }
  }
  if (model.type === 'bilinear') {
    const epsY = material.limits?.epsY ?? fy / material.elasticModulus
    return {
      model: model.type,
      equations: [
        '|ε| ≤ εy: σs = Es·ε',
        '|ε| > εy: σs = sign(ε)·[fy,model + b·Es·(|ε| − εy)]'
      ],
      parameters: [
        ...stressFactors,
        { symbol: 'εy', label: 'Bilinear branch strain', value: epsY, unit: '–', derivation: material.limits?.epsY === undefined ? 'fy,model/Es' : 'material limit epsY' },
        { symbol: 'b', label: 'Post-yield hardening ratio', value: Math.max(0, model.hardeningRatio ?? 0.01), unit: '–' }
      ],
      provenance: materialProvenance(material.standard, 'steel', false)
    }
  }
  return {
    model: model.type,
    equations: ['Between adjacent sorted points: Δεeff = max(10⁻¹², εj+1 − εj); σs = σj + (ε − εj)(σj+1 − σj)/Δεeff; clamp outside the tabulated range.'],
    parameters: [
      { symbol: 'Es', label: 'Steel elastic modulus (metadata)', value: material.elasticModulus, unit: 'MPa' },
      ...model.points.flatMap((point, index) => [
        { symbol: `ε${index + 1}`, label: `Curve point ${index + 1} strain`, value: point.strain, unit: '–' as const },
        { symbol: `σ${index + 1}`, label: `Curve point ${index + 1} stress`, value: point.stress, unit: 'MPa' as const }
      ])
    ],
    provenance: materialProvenance(material.standard, 'steel', true)
  }
}
