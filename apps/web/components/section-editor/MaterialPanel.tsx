'use client'

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  aciBeta1,
  applyAci318ConcreteDerived,
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
  CALCULATION_PROFILES,
  CONCRETE_MODELS_FOR_MECHANICS,
  CUSTOM_STEEL_MODELS,
  applyCalculationProfileToMaterials,
  calculationProfile,
  type CalculationProfileId
} from '@pm/project'
import { resolveKds142020BlockParameters } from '@pm/code-kds142020'

type Props = {
  store: MaterialStore
  calculationProfileId: CalculationProfileId
  usedSteelMaterialIds?: Set<number>
  onCalculationProfileChange: (profileId: CalculationProfileId) => void
  onChange: (store: MaterialStore) => void
}

type MaterialPage = 'concrete' | 'steel'

const numberValue = (value: string, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const standardLabel = (standard: ConcreteMaterial['standard'] | SteelMaterial['standard']) => {
  switch (standard) {
    case 'ACI318':
      return 'ACI 318'
    case 'EC2':
      return 'EN 1992-1-1 (EC2)'
    case 'CUSTOM':
      return 'Custom'
    default:
      return 'KDS'
  }
}

/**
 * Switch the concrete constitutive model inside a Custom profile.
 *
 * Every branch seeds a complete, valid model from what the material already holds so the analysis
 * DTO never carries a half-filled law. It does not touch `standard`: the calculation profile owns
 * that, and a Custom profile is the only place this selector is reachable.
 */
const concreteModelDefaults = (
  material: ConcreteMaterial,
  type: ConcreteMaterial['stressStrain']['type']
): ConcreteMaterial => {
  if (material.stressStrain.type === type) return material
  const alpha = 'alpha' in material.stressStrain ? material.stressStrain.alpha : material.factors?.alpha ?? 0.85
  const eps0 = material.limits.eps0 ?? 0.002
  if (type === 'kds-parabolic') {
    return {
      ...material,
      stressStrain: { type: 'kds-parabolic', n: 2, eps0, epsCu: material.limits.epsCu, alpha },
      limits: { ...material.limits, eps0 }
    }
  }
  if (type === 'ec2-parabolic-rectangular') {
    return {
      ...material,
      stressStrain: {
        type: 'ec2-parabolic-rectangular',
        n: 2,
        epsC2: eps0,
        epsCu2: material.limits.epsCu,
        alpha
      },
      limits: { ...material.limits, eps0 }
    }
  }
  if (type === 'user-block') {
    return {
      ...material,
      stressStrain: {
        type: 'user-block',
        beta1: material.stressStrain.type === 'aci-whitney-block' ? material.stressStrain.beta1 : 0.8,
        alpha,
        epsCu: material.limits.epsCu
      }
    }
  }
  return {
    ...material,
    stressStrain: {
      type: 'user-curve',
      interpolation: 'linear',
      zeroTension: material.limits.ignoreTension,
      points: [
        { strain: 0, stress: 0 },
        { strain: eps0, stress: alpha * material.fck },
        { strain: material.limits.epsCu, stress: alpha * material.fck }
      ]
    }
  }
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
    'elastic-perfectly-plastic': 'Elastic Perfectly Plastic',
    bilinear: 'Bilinear',
    'user-curve': 'User-Defined Curve',
    'user-block': 'User-Defined Block'
  })[type]

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
  usedSteelMaterialIds = new Set(),
  onCalculationProfileChange,
  onChange
}: Props) {
  const profile = calculationProfile(calculationProfileId)
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
      <section className="pm-panel-section">
        <div className="pm-section-title">
          <div>
            <h2>Design code &amp; calculation model</h2>
            <p>One profile controls mechanics, material defaults and resistance factors.</p>
          </div>
        </div>
        <label className="pm-field">
          <span>Calculation profile</span>
          <select
            value={calculationProfileId}
            onChange={(event) => onCalculationProfileChange(event.target.value as CalculationProfileId)}
          >
            {CALCULATION_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
        </label>
      </section>

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
          <div className="pm-section-title">
            <h2>Concrete Material</h2>
          </div>
          <div className="pm-material-form">
            <div className="pm-material-row-2">
              <label className="pm-field">
              <span>Name</span>
              <input
                value={store.concrete.name}
                onChange={(event) => updateConcrete((material) => ({ ...material, name: event.target.value }))}
              />
            </label>
              {isCustomProfile ? (
                <label className="pm-field">
                  <span>Concrete model</span>
                  <select
                    value={store.concrete.stressStrain.type}
                    onChange={(event) =>
                      updateConcrete((material) =>
                        concreteModelDefaults(
                          material,
                          event.target.value as ConcreteMaterial['stressStrain']['type']
                        )
                      )
                    }
                  >
                    {CONCRETE_MODELS_FOR_MECHANICS[profile.mechanics].map((type) => (
                      <option key={type} value={type}>{modelName(type)}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="pm-field">
                  <span>Standard</span>
                  <input readOnly value={standardLabel(store.concrete.standard)} />
                </label>
              )}
            </div>

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
                      the φ transition and the axial cap all follow the Design Basis you edit here.
                    </p>
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
              </div>
            )}

            {!isBlockMechanics && (
            <div className="pm-material-stress-box">
              <div className="pm-material-stress-title">Stress-Strain</div>
              {store.concrete.stressStrain.type !== 'user-curve' && (
              <div className="pm-material-row-3">
                <label className="pm-field">
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
                <label className="pm-field">
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
                  <label className="pm-field">
                    <span>α (σc,max/fck)</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0.1}
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

              {store.concrete.standard === 'EC2' && (
                <div className="pm-material-row-3">
                  <label className="pm-field">
                    <span>αcc</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0.1}
                      value={store.concrete.factors?.alpha ?? 0.85}
                      onChange={(event) =>
                        updateConcrete((material) => {
                          const alpha = numberValue(event.target.value, material.factors?.alpha ?? 0.85)
                          const gammaC = material.factors?.gammaC ?? 1.5
                          const next = {
                            ...material,
                            factors: { ...material.factors, alpha, gammaC }
                          }
                          return next.stressStrain.type === 'ec2-parabolic-rectangular'
                            ? {
                                ...next,
                                stressStrain: { ...next.stressStrain, alpha: alpha / gammaC }
                              }
                            : next
                        })
                      }
                    />
                  </label>
                  <label className="pm-field">
                    <span>γc</span>
                    <input
                      type="number"
                      step="0.05"
                      min={1}
                      value={store.concrete.factors?.gammaC ?? 1.5}
                      onChange={(event) =>
                        updateConcrete((material) => {
                          const gammaC = numberValue(event.target.value, material.factors?.gammaC ?? 1.5)
                          const alpha = material.factors?.alpha ?? 0.85
                          const next = {
                            ...material,
                            factors: { ...material.factors, alpha, gammaC }
                          }
                          return next.stressStrain.type === 'ec2-parabolic-rectangular'
                            ? {
                                ...next,
                                stressStrain: { ...next.stressStrain, alpha: alpha / gammaC }
                              }
                            : next
                        })
                      }
                    />
                  </label>
                  <label className="pm-field">
                    <span>fcd</span>
                    <input
                      type="number"
                      readOnly
                      value={Number(
                        (
                          ((store.concrete.factors?.alpha ?? 0.85) * store.concrete.fck) /
                          (store.concrete.factors?.gammaC ?? 1.5)
                        ).toFixed(3)
                      )}
                    />
                  </label>
                </div>
              )}

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
          </div>
        </section>
      )}

      {activePage === 'steel' && (
        <section className="pm-panel-section">
          <div className="pm-section-title pm-section-title--with-action">
            <h2>Steel Materials</h2>
            <button type="button" className="pm-table-add-btn" onClick={addSteel}>
              <Plus size={14} />
              Add Steel
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
              <div className="pm-material-row-2">
                <label className="pm-field">
                  <span>Name</span>
                  <input
                    value={activeSteel.name}
                    onChange={(event) => updateSteel(activeSteel.id, (material) => ({ ...material, name: event.target.value }))}
                  />
                </label>
                {isCustomProfile ? (
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
                ) : (
                  <label className="pm-field">
                    <span>Standard</span>
                    <input readOnly value={standardLabel(activeSteel.standard)} />
                  </label>
                )}
              </div>

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
                        return next.standard === 'EC2' ? applyEn1992SteelDerived(next) : next
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
                        return next.standard === 'EC2' ? applyEn1992SteelDerived(next) : next
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
                <div className="pm-material-row-3">
                  <label className="pm-field">
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
                    <label className="pm-field">
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

                {activeSteel.standard === 'EC2' && (
                  <div className="pm-material-row-2">
                    <label className="pm-field">
                      <span>γs</span>
                      <input
                        type="number"
                        step="0.05"
                        min={1}
                        value={activeSteel.factors?.gammaS ?? 1.15}
                        onChange={(event) =>
                          updateSteel(activeSteel.id, (material) => {
                            const gammaS = numberValue(event.target.value, material.factors?.gammaS ?? 1.15)
                            return applyEn1992SteelDerived({
                              ...material,
                              factors: { ...material.factors, gammaS }
                            })
                          })
                        }
                      />
                    </label>
                    <label className="pm-field">
                      <span>fyd</span>
                      <input
                        type="number"
                        readOnly
                        value={Number((activeSteel.fy / (activeSteel.factors?.gammaS ?? 1.15)).toFixed(3))}
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
