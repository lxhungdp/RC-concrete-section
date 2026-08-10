'use client'

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  designBasisRequiresOverrideReason,
  resolveMaterialFactorExpression,
  setMaterialFactorComponentValue,
  type MaterialFactorComponent,
  type GlobalStrengthReductionBasis,
  type DesignBasis
} from '@pm/design'
import {
  aciBeta1,
  applyAci318ConcreteDerived,
  applyAs3600ConcreteDerived,
  applyAs3600SteelDerived,
  applyEn1992ConcreteDerived,
  applyEn1992SteelDerived,
  applyKdsConcreteDerived,
  compileConcreteMaterial,
  concreteModelSupportIssue,
  compileSteelMaterial,
  createKdsRebarSteel,
  DEFAULT_CONCRETE_DENSITY,
  userBlockCompressionStress,
  type ConcreteMaterial,
  type MaterialStore,
  type SteelMaterial,
  type StressStrainPoint
} from '@pm/materials'
import {
  CUSTOM_STEEL_MODELS,
  activeConcreteModelId,
  applyCalculationProfileToMaterials,
  applyConcreteModelToMaterials,
  calculationProfile,
  type ConcreteModelId,
  type CalculationProfileId
} from '@pm/project'
import { resolveKds142020BlockParameters } from '@pm/code-kds142020'

type Props = {
  store: MaterialStore
  calculationProfileId: CalculationProfileId
  designBasis: DesignBasis
  usedSteelMaterialIds?: Set<number>
  onDesignBasisChange: (basis: DesignBasis) => void
  onChange: (store: MaterialStore) => void
}

type MaterialPage = 'concrete' | 'steel'

const numberValue = (value: string, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const steelModelDefaults = (
  material: SteelMaterial,
  type: SteelMaterial['stressStrain']['type']
): SteelMaterial => {
  if (material.stressStrain.type === type) return material
  if (type === 'bilinear') return { ...material, stressStrain: { type: 'bilinear', hardeningRatio: 0.01 } }
  if (type === 'user-curve') {
    const epsY = material.limits?.epsY ?? material.fy / material.elasticModulus
    const epsU = material.limits?.epsU ?? Math.max(0.05, epsY * 10)
    return {
      ...material,
      stressStrain: {
        type: 'user-curve',
        interpolation: 'linear',
        points: [
          { strain: -epsU, stress: -material.fy },
          { strain: -epsY, stress: -material.fy },
          { strain: 0, stress: 0 },
          { strain: epsY, stress: material.fy },
          { strain: epsU, stress: material.fy }
        ]
      }
    }
  }
  return { ...material, stressStrain: { type: 'elastic-perfectly-plastic' } }
}

const modelName = (type: ConcreteMaterial['stressStrain']['type'] | SteelMaterial['stressStrain']['type']) =>
  ({
    'kds-parabolic': 'KDS Parabola-Rectangle',
    'aci-whitney-block': 'ACI Whitney Block',
    'ec2-parabolic-rectangular': 'EC2 Parabola-Rectangle',
    'as3600-equivalent-block': 'AS 3600 Equivalent Block',
    'elastic-perfectly-plastic': 'Elastic Perfectly Plastic',
    bilinear: 'Bilinear',
    'user-curve': 'User-Defined Curve',
    'user-block': 'User-Defined Block'
  })[type]

const concreteModelPickerLabel = (modelId: ConcreteModelId) => {
  switch (modelId) {
    case 'kds-parabolic':
    case 'en1992-parabolic-rectangular':
      return 'Parabolic'
    case 'user-stress-strain-curve':
    case 'user-equivalent-rectangular-block':
      return 'User-defined'
    case 'kds-equivalent-rectangular-block':
    case 'as3600-equivalent-rectangular-block':
      return 'Eq. block'
    case 'aci-whitney-equivalent-block':
      return 'Whitney block'
    default:
      return modelId satisfies never
  }
}

const formatFormulaNumber = (value: number, digits = 4) =>
  Number(value.toFixed(digits)).toLocaleString('en-US', {
    maximumFractionDigits: digits
  })

const concreteFormula = (material: ConcreteMaterial) => {
  switch (material.stressStrain.type) {
    case 'kds-parabolic':
      return `σc = ${formatFormulaNumber(material.stressStrain.alpha)} fck [1 - (1 - ε / ε0)^${formatFormulaNumber(material.stressStrain.n, 2)}], then plateau to εcu`
    case 'aci-whitney-block':
      return `σc = ${formatFormulaNumber(material.stressStrain.alpha)} fck over equivalent block, β1 = ${formatFormulaNumber(material.stressStrain.beta1, 2)}`
    case 'ec2-parabolic-rectangular':
      return `σc = ${formatFormulaNumber(material.stressStrain.alpha)} fck [1 - (1 - ε / εc2)^${formatFormulaNumber(material.stressStrain.n, 2)}], then plateau`
    case 'as3600-equivalent-block':
      return `σc = α₂ f'c = ${formatFormulaNumber(material.stressStrain.alpha2)} f'c over a = γc = ${formatFormulaNumber(material.stressStrain.gamma, 3)} c`
    case 'user-curve':
      return 'σc is linearly interpolated from user-defined ε-σ points'
    case 'user-block':
      return `σc = ${formatFormulaNumber(material.stressStrain.alpha)} fck over a = ${formatFormulaNumber(material.stressStrain.beta1, 3)}·c, zero elsewhere`
    default:
      return ''
  }
}

const steelFormula = (material: SteelMaterial) => {
  switch (material.stressStrain.type) {
    case 'elastic-perfectly-plastic':
      return `σs = Es ε, limited to ±fy; εy = fy / Es`
    case 'bilinear':
      return `σs = Es ε to ±fy, then hardening with ratio ${formatFormulaNumber(material.stressStrain.hardeningRatio)}`
    case 'user-curve':
      return 'σs is linearly interpolated from user-defined ε-σ points'
    default:
      return ''
  }
}

function StressStrainCurve({ material }: { material: ConcreteMaterial | SteelMaterial }) {
  const path = useMemo(() => {
    const isConcrete = 'fck' in material
    const compiled = isConcrete ? compileConcreteMaterial(material) : compileSteelMaterial(material)
    const strainLimit = isConcrete
      ? Math.max(0.0001, compiled.limits.epsCompressionUltimate ?? material.limits.epsCu)
      : Math.max(0.0001, material.limits?.epsU ?? Math.max((material.limits?.epsY ?? material.fy / material.elasticModulus) * 2, 0.005))
    const minStrain = isConcrete ? 0 : -strainLimit
    const maxStrain = strainLimit
    const stresses = Array.from({ length: 25 }, (_, i) => compiled.stress(minStrain + ((maxStrain - minStrain) * i) / 24))
    const maxAbsStress = Math.max(1, isConcrete ? material.fck : material.fy, ...stresses.map((stress) => Math.abs(stress)))
    const points = Array.from({ length: 48 }, (_, i) => {
      const strain = minStrain + ((maxStrain - minStrain) * i) / 47
      const stress = compiled.stress(strain)
      const x = 12 + ((strain - minStrain) / (maxStrain - minStrain)) * 226
      const y = isConcrete ? 96 - (stress / maxAbsStress) * 76 : 55 - (stress / maxAbsStress) * 38
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    return points.join(' ')
  }, [material])

  return (
    <div className="pm-material-curve">
      <svg viewBox="0 0 250 110" aria-label="Stress strain curve">
        <line x1="12" y1="96" x2="238" y2="96" />
        <line x1="12" y1="55" x2="238" y2="55" className="pm-material-curve-axis-mid" />
        <line x1="12" y1="96" x2="12" y2="14" />
        <path d={path} />
        <text x="14" y="14">σ</text>
        <text x="226" y="108">ε</text>
      </svg>
      <p>{'fck' in material ? concreteFormula(material) : steelFormula(material)}</p>
    </div>
  )
}

function ConcreteMaterialFactorFields({
  basis,
  fck,
  onFactorChange,
  onOverrideReasonChange
}: {
  basis: DesignBasis
  fck: number
  onFactorChange: (componentId: MaterialFactorComponent['id'], value: number) => void
  onOverrideReasonChange: (reason: string) => void
}) {
  if (basis.format !== 'designMaterialReevaluation') return null
  return (
    <>
      <div className="pm-material-inline-params">
        {basis.factors.concrete.components.map((component) => (
          <label className="pm-inline-param" key={component.id}>
            <span>{component.symbol}</span>
            <input
              type="number"
              step={component.id.startsWith('gamma') ? '0.05' : '0.01'}
              min={component.id.startsWith('gamma') ? 1 : 0.1}
              value={component.value}
              onChange={(event) => onFactorChange(
                component.id,
                numberValue(event.target.value, component.value)
              )}
            />
          </label>
        ))}
        <label className="pm-inline-param">
          <span>{basis.factors.concrete.designSymbol}</span>
          <input
            type="number"
            readOnly
            value={Number(
              (resolveMaterialFactorExpression(basis.factors.concrete) * fck).toFixed(3)
            )}
          />
        </label>
      </div>
      {designBasisRequiresOverrideReason(basis) && (
        <label className="pm-field">
          <span>Reason for partial-factor modification</span>
          <input
            value={basis.overrideReason}
            placeholder="State the approved project or National Annex basis"
            onChange={(event) => onOverrideReasonChange(event.target.value)}
          />
        </label>
      )}
    </>
  )
}

function ConcreteAxialLimitFields({
  basis,
  onChange
}: {
  basis: DesignBasis
  onChange: (basis: DesignBasis) => void
}) {
  if (basis.format !== 'globalResultantFactor' || basis.profileId === 'as-3600-2018-amd2') {
    return null
  }

  const isSpiral = basis.transverseReinforcement === 'qualifying-spiral'
  const activeFactor = isSpiral ? basis.factors.axialCapSpiral : basis.factors.axialCapOther

  const update = (mutate: (next: GlobalStrengthReductionBasis) => void) => {
    const next: GlobalStrengthReductionBasis = structuredClone(basis)
    mutate(next)
    next.modified = true
    next.verificationStatus = next.profileId === 'custom-user-defined' ? 'user-defined' : 'draft'
    onChange(next)
  }

  return (
    <div className="pm-material-stress-box pm-material-axial-limit">
      <div className="pm-material-stress-title">Axial compression limit</div>
      <div className="pm-material-row-2">
        <label className="pm-field">
          <span>Column type</span>
          <select
            value={basis.transverseReinforcement}
            onChange={(event) => update((next) => {
              next.transverseReinforcement = event.target.value === 'qualifying-spiral'
                ? 'qualifying-spiral'
                : 'other'
            })}
          >
            <option value="other">Ties / other</option>
            <option value="qualifying-spiral">Qualifying spiral</option>
          </select>
        </label>
        <label className="pm-field" title="Maximum design compression as a fraction of the uncapped compression pole.">
          <span>Pmax factor</span>
          <input
            type="number"
            min={0.1}
            max={1}
            step={0.01}
            value={activeFactor}
            onChange={(event) => {
              const factor = Math.min(1, Math.max(0.1, numberValue(event.target.value, activeFactor)))
              update((next) => {
                if (isSpiral) next.factors.axialCapSpiral = factor
                else next.factors.axialCapOther = factor
              })
            }}
          />
        </label>
      </div>
      <label className="pm-material-toggle">
        <input
          type="checkbox"
          checked={basis.axialCapEnabled}
          onChange={(event) => update((next) => {
            next.axialCapEnabled = event.target.checked
          })}
        />
        <span>Apply Pmax limit</span>
      </label>
      <p className="pm-field-note">
        Enabled by default. Clear this option to use the uncapped design compression pole in all
        charts and design checks.
      </p>
      {designBasisRequiresOverrideReason(basis) && (
        <label className="pm-field">
          <span>Reason for design modification</span>
          <input
            value={basis.overrideReason}
            placeholder="State the approved project basis"
            onChange={(event) => onChange({ ...basis, overrideReason: event.target.value })}
          />
        </label>
      )}
    </div>
  )
}

function UserCurveEditor({
  points,
  onChange
}: {
  points: StressStrainPoint[]
  onChange: (points: StressStrainPoint[]) => void
}) {
  const updatePoint = (index: number, patch: Partial<StressStrainPoint>) => {
    onChange(points.map((point, currentIndex) => (currentIndex === index ? { ...point, ...patch } : point)))
  }

  const addPoint = () => {
    const last = points[points.length - 1] ?? { strain: 0, stress: 0 }
    onChange([...points, { strain: last.strain + 0.001, stress: last.stress }])
  }

  const removePoint = (index: number) => {
    if (points.length <= 2) return
    onChange(points.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <div className="pm-user-curve-editor">
      <table className="pm-user-curve-table">
        <thead>
          <tr>
            <th>#</th>
            <th>ε</th>
            <th>σ</th>
            <th>
              <button type="button" className="pm-table-add-icon-btn" onClick={addPoint} title="Add point">
                <Plus size={14} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td>
                <input
                  type="number"
                  step="0.0001"
                  value={point.strain}
                  onChange={(event) => updatePoint(index, { strain: numberValue(event.target.value, point.strain) })}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="1"
                  value={point.stress}
                  onChange={(event) => updatePoint(index, { stress: numberValue(event.target.value, point.stress) })}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="pm-material-remove"
                  disabled={points.length <= 2}
                  onClick={() => removePoint(index)}
                  title="Remove point"
                >
                  <X size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MaterialPanel({
  store,
  calculationProfileId,
  designBasis,
  usedSteelMaterialIds = new Set(),
  onDesignBasisChange,
  onChange
}: Props) {
  const profile = calculationProfile(calculationProfileId)
  const activeModelId = activeConcreteModelId(calculationProfileId, store.concrete)
  const isBlockMechanics = profile.mechanics === 'equivalent-rectangular-block'
  const isCustomProfile = profile.materialStandard === 'CUSTOM'
  const concreteSupportIssue = isBlockMechanics ? null : concreteModelSupportIssue(store.concrete)
  const [activePage, setActivePage] = useState<MaterialPage>('concrete')
  const activeSteel = store.steel.find((material) => material.id === store.defaults.steelMaterialId) ?? store.steel[0]
  const kdsBlockResolution = useMemo(() => {
    if (calculationProfileId !== 'kds-142020-equivalent-block') return { parameters: null, error: '' }
    try {
      return { parameters: resolveKds142020BlockParameters(store.concrete.fck), error: '' }
    } catch (error) {
      return { parameters: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [calculationProfileId, store.concrete.fck])
  const kdsBlockParameters = kdsBlockResolution.parameters

  const updateDesignMaterialFactor = (key: MaterialFactorComponent['id'], value: number) => {
    if (designBasis.format !== 'designMaterialReevaluation') return
    const [minimum, maximum] = key.startsWith('gamma') ? [1, 3] : [0.1, 1.5]
    const next = setMaterialFactorComponentValue(
      designBasis,
      key,
      Math.min(maximum, Math.max(minimum, value))
    )
    next.modified = true
    next.verificationStatus = 'draft'
    onDesignBasisChange(next)
  }

  const selectConcreteModel = (modelId: ConcreteModelId) => {
    const model = profile.concreteModels.find((candidate) => candidate.id === modelId)
    if (!model) return
    onChange(applyConcreteModelToMaterials(store, calculationProfileId, modelId))
    const next: DesignBasis = structuredClone(designBasis)
    next.materialModelModified = model.source === 'user-defined'
    next.modified = next.modified || next.materialModelModified
    if (next.materialModelModified) {
      if (next.verificationStatus !== 'user-defined') next.verificationStatus = 'draft'
      if (next.overrideReason.trim().length === 0) {
        next.overrideReason = 'User-defined concrete stress–strain model selected in Materials.'
      }
    }
    onDesignBasisChange(next)
  }

  const updateConcrete = (map: (material: ConcreteMaterial) => ConcreteMaterial) => {
    onChange({ ...store, concrete: map(store.concrete) })
  }

  const updateSteel = (id: number, map: (material: SteelMaterial) => SteelMaterial) => {
    onChange({
      ...store,
      steel: store.steel.map((material) => (material.id === id ? map(material) : material))
    })
  }

  const selectSteel = (id: number) => {
    onChange({ ...store, defaults: { ...store.defaults, steelMaterialId: id } })
  }

  const addSteel = () => {
    const material = createKdsRebarSteel(
      { name: `Steel ${store.steel.length + 1}` },
      store.steel.map((item) => item.id)
    )
    onChange(applyCalculationProfileToMaterials({
      ...store,
      steel: [...store.steel, material],
      defaults: { ...store.defaults, steelMaterialId: material.id }
    }, calculationProfileId))
  }

  const removeSteel = (id: number) => {
    if (store.steel.length <= 1) return
    if (usedSteelMaterialIds.has(id)) return
    const steel = store.steel.filter((material) => material.id !== id)
    onChange({
      ...store,
      steel,
      defaults: {
        ...store.defaults,
        steelMaterialId: store.defaults.steelMaterialId === id ? steel[0].id : store.defaults.steelMaterialId
      }
    })
  }

  return (
    <>
      <div className="pm-page-tabs" role="tablist" aria-label="Material tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activePage === 'concrete'}
          className={activePage === 'concrete' ? 'is-active' : ''}
          onClick={() => setActivePage('concrete')}
        >
          Concrete
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activePage === 'steel'}
          className={activePage === 'steel' ? 'is-active' : ''}
          onClick={() => setActivePage('steel')}
        >
          Steel
        </button>
      </div>

      {activePage === 'concrete' && (
        <section className="pm-panel-section">
          <div className="pm-section-title pm-section-title--with-action">
            <h2>Concrete Material</h2>
            <select
              className="pm-concrete-model-select"
              value={activeModelId}
              disabled={profile.concreteModels.length <= 1}
              onChange={(event) => selectConcreteModel(event.target.value as ConcreteModelId)}
              aria-label="Concrete model"
              title="Concrete model"
            >
              {profile.concreteModels.map((model) => (
                <option key={model.id} value={model.id}>{concreteModelPickerLabel(model.id)}</option>
              ))}
            </select>
          </div>
          <div className="pm-material-form">
            {concreteSupportIssue ? (
              <p className="pm-material-blocked" role="alert">
                <strong>This concrete model is blocked for analysis.</strong> {concreteSupportIssue.reason} Results
                cannot be computed until another model is selected. See {concreteSupportIssue.reference}.
              </p>
            ) : null}

            <div className="pm-material-row-2">
              <label className="pm-field">
                <span>fc</span>
                <input
                  type="number"
                  min={1}
                  value={store.concrete.fck}
                  onChange={(event) =>
                    updateConcrete((material) => {
                      const fck = numberValue(event.target.value, material.fck)
                      const next = { ...material, fck, mc: material.mc ?? DEFAULT_CONCRETE_DENSITY }
                      if (next.standard === 'KDS') return applyKdsConcreteDerived(next)
                      if (next.standard === 'ACI318') return applyAci318ConcreteDerived(next)
                      if (next.standard === 'EC2') return applyEn1992ConcreteDerived(next)
                      if (next.standard === 'AS3600') return applyAs3600ConcreteDerived(next)
                      if (next.stressStrain.type === 'aci-whitney-block') {
                        return {
                          ...next,
                          stressStrain: { ...next.stressStrain, beta1: aciBeta1(fck) }
                        }
                      }
                      return next
                    })
                  }
                />
              </label>
              <label className="pm-field">
                <span>mc (kg/m³)</span>
                <input
                  type="number"
                  min={1}
                  value={store.concrete.mc ?? DEFAULT_CONCRETE_DENSITY}
                  onChange={(event) =>
                    updateConcrete((material) => {
                      const mc = numberValue(event.target.value, material.mc ?? DEFAULT_CONCRETE_DENSITY)
                      const next = { ...material, mc }
                      return next.standard === 'KDS' ? applyKdsConcreteDerived(next) : next
                    })
                  }
                />
              </label>
            </div>

            <div className="pm-material-row-2">
              <label className="pm-field">
                <span>Ec</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={
                    store.concrete.elasticModulus === undefined
                      ? ''
                      : Number(store.concrete.elasticModulus.toFixed(1))
                  }
                  onChange={(event) =>
                    updateConcrete((material) => ({
                      ...material,
                      elasticModulus:
                        event.target.value === '' ? undefined : numberValue(event.target.value, 0)
                    }))
                  }
                />
              </label>
              <label className="pm-field">
                <span>εcu</span>
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={store.concrete.limits.epsCu}
                  onChange={(event) =>
                    updateConcrete((material) => {
                      const epsCu = numberValue(event.target.value, material.limits.epsCu)
                      if (material.stressStrain.type === 'kds-parabolic') {
                        return {
                          ...material,
                          limits: { ...material.limits, epsCu },
                          stressStrain: { ...material.stressStrain, epsCu }
                        }
                      }
                      return {
                        ...material,
                        limits: { ...material.limits, epsCu }
                      }
                    })
                  }
                />
              </label>
            </div>

            {isBlockMechanics && (
              <div className="pm-material-stress-box">
                <div className="pm-material-stress-title">Equivalent rectangular stress block</div>
                {isCustomProfile && store.concrete.stressStrain.type === 'user-block' ? (
                  <>
                    <div className="pm-material-row-3">
                      <label className="pm-field">
                        <span>β1</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0.05}
                          max={1}
                          value={store.concrete.stressStrain.beta1}
                          onChange={(event) =>
                            updateConcrete((material) =>
                              material.stressStrain.type === 'user-block'
                                ? {
                                    ...material,
                                    stressStrain: {
                                      ...material.stressStrain,
                                      beta1: numberValue(event.target.value, material.stressStrain.beta1)
                                    }
                                  }
                                : material
                            )
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>α (σblock/fck)</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0.05}
                          value={store.concrete.stressStrain.alpha}
                          onChange={(event) =>
                            updateConcrete((material) =>
                              material.stressStrain.type === 'user-block'
                                ? {
                                    ...material,
                                    stressStrain: {
                                      ...material.stressStrain,
                                      alpha: numberValue(event.target.value, material.stressStrain.alpha)
                                    },
                                    factors: {
                                      ...material.factors,
                                      alpha: numberValue(event.target.value, material.stressStrain.alpha)
                                    }
                                  }
                                : material
                            )
                          }
                        />
                      </label>
                      <label className="pm-field">
                        <span>εcu</span>
                        <input
                          type="number"
                          step="0.0001"
                          min={0}
                          value={store.concrete.stressStrain.epsCu}
                          onChange={(event) =>
                            updateConcrete((material) => {
                              if (material.stressStrain.type !== 'user-block') return material
                              const epsCu = numberValue(event.target.value, material.stressStrain.epsCu)
                              return {
                                ...material,
                                stressStrain: { ...material.stressStrain, epsCu },
                                limits: { ...material.limits, epsCu }
                              }
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="pm-material-row-2">
                      <label className="pm-field">
                        <span>σblock (MPa)</span>
                        <input readOnly value={Number(userBlockCompressionStress(store.concrete).toFixed(3))} />
                      </label>
                    </div>
                    <p className="pm-field-note">
                      No code table is applied. β1, α and εcu are the values this project declares; the surface,
                      the φ transition follows the selected code basis, and the Pmax limit is set below.
                    </p>
                  </>
                ) : store.concrete.stressStrain.type === 'as3600-equivalent-block' ? (
                  <>
                    <div className="pm-material-row-3">
                      <label className="pm-field"><span>γ</span><input readOnly value={Number(store.concrete.stressStrain.gamma.toFixed(4))} /></label>
                      <label className="pm-field"><span>α₂</span><input readOnly value={Number(store.concrete.stressStrain.alpha2.toFixed(4))} /></label>
                      <label className="pm-field"><span>εcu</span><input readOnly value={store.concrete.stressStrain.epsCu} /></label>
                    </div>
                    <p className="pm-field-note">AS 3600 preview block: concrete stress is α₂·f'c over a = γ·c; stress is zero outside the compression block.</p>
                  </>
                ) : (
                  <>
                    <div className="pm-material-row-3">
                      <label className="pm-field"><span>β1</span><input readOnly value={Number((kdsBlockParameters?.beta1 ?? (store.concrete.stressStrain.type === 'aci-whitney-block' ? store.concrete.stressStrain.beta1 : 0)).toFixed(4))} /></label>
                      <label className="pm-field"><span>η</span><input readOnly value={Number((kdsBlockParameters?.eta ?? 1).toFixed(4))} /></label>
                      <label className="pm-field"><span>εcu</span><input readOnly value={kdsBlockParameters?.extremeCompressionStrain ?? store.concrete.limits.epsCu} /></label>
                    </div>
                    <p className="pm-field-note">Concrete stress is uniform only over a = β1·c. Stress is zero between a and c and over the tension region.</p>
                    {kdsBlockResolution.error && <p className="pm-field-error">{kdsBlockResolution.error}</p>}
                  </>
                )}
                <ConcreteMaterialFactorFields
                  basis={designBasis}
                  fck={store.concrete.fck}
                  onFactorChange={updateDesignMaterialFactor}
                  onOverrideReasonChange={(reason) => onDesignBasisChange({
                    ...designBasis,
                    overrideReason: reason
                  })}
                />
              </div>
            )}

            {!isBlockMechanics && (
            <div className="pm-material-stress-box">
              <div className="pm-material-stress-head">
                <div className="pm-material-stress-title">Stress-Strain</div>
                <label className="pm-material-toggle">
                  <input
                    type="checkbox"
                    checked={store.concrete.limits.ignoreTension}
                    onChange={(event) =>
                      updateConcrete((material) => ({
                        ...material,
                        limits: { ...material.limits, ignoreTension: event.target.checked }
                      }))
                    }
                  />
                  <span>Ignore concrete tension</span>
                </label>
              </div>
              {store.concrete.stressStrain.type !== 'user-curve' && (
              <div className="pm-material-inline-params">
                <label className="pm-inline-param">
                  <span>εc0</span>
                  <input
                    type="number"
                    step="0.0001"
                    min={0}
                    value={store.concrete.limits.eps0 ?? ''}
                    onChange={(event) =>
                      updateConcrete((material) => {
                        const eps0 = numberValue(event.target.value, material.limits.eps0 ?? 0.002)
                        if (material.stressStrain.type === 'kds-parabolic') {
                          return {
                            ...material,
                            limits: { ...material.limits, eps0 },
                            stressStrain: { ...material.stressStrain, eps0 }
                          }
                        }
                        return {
                          ...material,
                          limits: { ...material.limits, eps0 }
                        }
                      })
                    }
                  />
                </label>
                <label className="pm-inline-param">
                  <span>n</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0.1}
                    value={
                      store.concrete.stressStrain.type === 'kds-parabolic' ||
                      store.concrete.stressStrain.type === 'ec2-parabolic-rectangular'
                        ? Number(store.concrete.stressStrain.n.toFixed(4))
                        : ''
                    }
                    onChange={(event) =>
                      updateConcrete((material) =>
                        material.stressStrain.type === 'kds-parabolic' ||
                        material.stressStrain.type === 'ec2-parabolic-rectangular'
                          ? {
                              ...material,
                              stressStrain: {
                                ...material.stressStrain,
                                n: numberValue(event.target.value, material.stressStrain.n)
                              }
                            }
                          : material
                      )
                    }
                  />
                </label>
                {/* A code profile derives alpha from its own table; only a Custom profile owns it. */}
                {isCustomProfile && (
                  <label className="pm-inline-param">
                    <span>α</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0.1}
                      title="α (σc,max/fck)"
                      value={
                        'alpha' in store.concrete.stressStrain
                          ? Number(store.concrete.stressStrain.alpha.toFixed(4))
                          : ''
                      }
                      onChange={(event) =>
                        updateConcrete((material) => {
                          if (!('alpha' in material.stressStrain)) return material
                          const alpha = numberValue(event.target.value, material.stressStrain.alpha)
                          return {
                            ...material,
                            stressStrain: { ...material.stressStrain, alpha },
                            factors: { ...material.factors, alpha }
                          }
                        })
                      }
                    />
                  </label>
                )}
              </div>
              )}

              <ConcreteMaterialFactorFields
                basis={designBasis}
                fck={store.concrete.fck}
                onFactorChange={updateDesignMaterialFactor}
                onOverrideReasonChange={(reason) => onDesignBasisChange({
                  ...designBasis,
                  overrideReason: reason
                })}
              />

              {store.concrete.stressStrain.type === 'user-curve' && (
                <UserCurveEditor
                  points={store.concrete.stressStrain.points}
                  onChange={(points) =>
                    updateConcrete((material) =>
                      material.stressStrain.type === 'user-curve'
                        ? {
                            ...material,
                            stressStrain: {
                              ...material.stressStrain,
                              points
                            }
                          }
                        : material
                    )
                  }
                />
              )}

              <StressStrainCurve material={store.concrete} />
            </div>
            )}

            <ConcreteAxialLimitFields
              basis={designBasis}
              onChange={onDesignBasisChange}
            />
          </div>
        </section>
      )}

      {activePage === 'steel' && (
        <section className="pm-panel-section">
          <div className="pm-section-title pm-section-title--with-action">
            <h2>Steel Materials</h2>
            <button type="button" className="pm-table-add-btn" onClick={addSteel} title="Add steel material">
              <Plus size={13} />
              Add
            </button>
          </div>
          <div className="pm-material-list pm-material-list--steel">
            {store.steel.map((material) => (
              <div
                key={material.id}
                className={`pm-material-row${activeSteel?.id === material.id ? ' is-active' : ''}`}
              >
                <button type="button" className="pm-material-row-main" onClick={() => selectSteel(material.id)}>
                  {material.name}
                </button>
                <button
                  type="button"
                  className="pm-material-remove"
                  disabled={store.steel.length <= 1 || usedSteelMaterialIds.has(material.id)}
                  onClick={() => removeSteel(material.id)}
                  title={usedSteelMaterialIds.has(material.id) ? 'Steel is used by rebar' : 'Remove steel'}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>

          {activeSteel && (
            <div className="pm-material-form">
              <div className="pm-material-editor-title">
                <strong>{activeSteel.id}</strong>
                <span>{modelName(activeSteel.stressStrain.type)}</span>
              </div>
              {isCustomProfile ? (
                <div className="pm-material-row-2">
                  <label className="pm-field">
                    <span>Name</span>
                    <input
                      value={activeSteel.name}
                      onChange={(event) => updateSteel(activeSteel.id, (material) => ({ ...material, name: event.target.value }))}
                    />
                  </label>
                  <label className="pm-field">
                    <span>Steel model</span>
                    <select
                      value={activeSteel.stressStrain.type}
                      onChange={(event) =>
                        updateSteel(activeSteel.id, (material) =>
                          steelModelDefaults(
                            material,
                            event.target.value as SteelMaterial['stressStrain']['type']
                          )
                        )
                      }
                    >
                      {CUSTOM_STEEL_MODELS.map((type) => (
                        <option key={type} value={type}>{modelName(type)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <label className="pm-field">
                  <span>Name</span>
                  <input
                    value={activeSteel.name}
                    onChange={(event) => updateSteel(activeSteel.id, (material) => ({ ...material, name: event.target.value }))}
                  />
                </label>
              )}

              <div className="pm-material-row-3">
                <label className="pm-field">
                  <span>fy</span>
                  <input
                    type="number"
                    min={1}
                    value={activeSteel.fy}
                    onChange={(event) =>
                      updateSteel(activeSteel.id, (material) => {
                        const fy = numberValue(event.target.value, material.fy)
                        const next = { ...material, fy, limits: { ...material.limits, epsY: fy / material.elasticModulus } }
                        if (next.standard === 'EC2') return applyEn1992SteelDerived(next)
                        if (next.standard === 'AS3600') return applyAs3600SteelDerived(next)
                        return next
                      })
                    }
                  />
                </label>
                <label className="pm-field">
                  <span>Es</span>
                  <input
                    type="number"
                    min={1}
                    value={activeSteel.elasticModulus}
                    onChange={(event) =>
                      updateSteel(activeSteel.id, (material) => {
                        const elasticModulus = numberValue(event.target.value, material.elasticModulus)
                        const next = { ...material, elasticModulus, limits: { ...material.limits, epsY: material.fy / elasticModulus } }
                        if (next.standard === 'EC2') return applyEn1992SteelDerived(next)
                        if (next.standard === 'AS3600') return applyAs3600SteelDerived(next)
                        return next
                      })
                    }
                  />
                </label>
                <label className="pm-field">
                  <span>εu</span>
                  <input
                    type="number"
                    step="0.001"
                    min={0}
                    value={activeSteel.limits?.epsU ?? ''}
                    placeholder="optional"
                    onChange={(event) =>
                      updateSteel(activeSteel.id, (material) => ({
                        ...material,
                        limits: {
                          ...material.limits,
                          epsU: event.target.value === '' ? undefined : numberValue(event.target.value, material.limits?.epsU ?? 0)
                        }
                      }))
                    }
                  />
                </label>
              </div>

              <div className="pm-material-stress-box">
                <div className="pm-material-stress-title">Stress-Strain</div>

                <div className="pm-material-inline-params">
                  <label className="pm-inline-param">
                    <span>εy</span>
                    <input
                      type="number"
                      step="0.0001"
                      min={0}
                      value={activeSteel.limits?.epsY ?? activeSteel.fy / activeSteel.elasticModulus}
                      onChange={(event) =>
                        updateSteel(activeSteel.id, (material) => ({
                          ...material,
                          limits: { ...material.limits, epsY: numberValue(event.target.value, material.fy / material.elasticModulus) }
                        }))
                      }
                    />
                  </label>
                  {activeSteel.stressStrain.type === 'bilinear' && (
                    <label className="pm-inline-param">
                      <span>Hardening</span>
                      <input
                        type="number"
                        step="0.001"
                        min={0}
                        value={activeSteel.stressStrain.hardeningRatio}
                        onChange={(event) =>
                          updateSteel(activeSteel.id, (material) =>
                            material.stressStrain.type === 'bilinear'
                              ? {
                                  ...material,
                                  stressStrain: {
                                    ...material.stressStrain,
                                    hardeningRatio: numberValue(event.target.value, material.stressStrain.hardeningRatio)
                                  }
                                }
                              : material
                          )
                        }
                      />
                    </label>
                  )}
                </div>

                {designBasis.format === 'designMaterialReevaluation' && (
                  <div className="pm-material-inline-params">
                    {designBasis.factors.reinforcement.components.map((component) => (
                      <label className="pm-inline-param" key={component.id}>
                        <span>{component.symbol}</span>
                        <input
                          type="number"
                          step={component.id.startsWith('gamma') ? '0.05' : '0.01'}
                          min={component.id.startsWith('gamma') ? 1 : 0.1}
                          value={component.value}
                          onChange={(event) => updateDesignMaterialFactor(
                            component.id,
                            numberValue(event.target.value, component.value)
                          )}
                        />
                      </label>
                    ))}
                    <label className="pm-inline-param">
                      <span>{designBasis.factors.reinforcement.designSymbol}</span>
                      <input
                        type="number"
                        readOnly
                        value={Number((
                          activeSteel.fy * resolveMaterialFactorExpression(designBasis.factors.reinforcement)
                        ).toFixed(3))}
                      />
                    </label>
                  </div>
                )}

                {activeSteel.stressStrain.type === 'user-curve' && (
                  <UserCurveEditor
                    points={activeSteel.stressStrain.points}
                    onChange={(points) =>
                      updateSteel(activeSteel.id, (material) =>
                        material.stressStrain.type === 'user-curve'
                          ? {
                              ...material,
                              stressStrain: {
                                ...material.stressStrain,
                                points
                              }
                            }
                          : material
                      )
                    }
                  />
                )}

                <StressStrainCurve material={activeSteel} />
              </div>
            </div>
          )}
        </section>
      )}
    </>
  )
}
