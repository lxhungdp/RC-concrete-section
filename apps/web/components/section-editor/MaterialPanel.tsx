'use client'

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  aciBeta1,
  applyKdsConcreteDerived,
  compileConcreteMaterial,
  compileSteelMaterial,
  createKdsRebarSteel,
  DEFAULT_CONCRETE_DENSITY,
  kdsConcreteParams,
  type ConcreteMaterial,
  type MaterialStore,
  type SteelMaterial,
  type StressStrainPoint
} from '@pm/materials'

type Props = {
  store: MaterialStore
  usedSteelMaterialIds?: Set<number>
  onChange: (store: MaterialStore) => void
}

type MaterialPage = 'concrete' | 'steel'

const numberValue = (value: string, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const modelName = (type: ConcreteMaterial['stressStrain']['type'] | SteelMaterial['stressStrain']['type']) =>
  type
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const concreteFormula = (material: ConcreteMaterial) => {
  switch (material.stressStrain.type) {
    case 'kds-parabolic':
      return `σc = ${material.stressStrain.alpha} fck [1 - (1 - ε / ε0)^${material.stressStrain.n.toFixed(2)}], then plateau to εcu`
    case 'aci-whitney-block':
      return `σc = ${material.stressStrain.alpha} fck over equivalent block, β1 = ${material.stressStrain.beta1.toFixed(2)}`
    case 'ec2-parabolic-rectangular':
      return `σc = ${material.stressStrain.alpha} fck [1 - (1 - ε / εc2)^${material.stressStrain.n.toFixed(2)}], then plateau`
    case 'user-curve':
      return 'σc is linearly interpolated from user-defined ε-σ points'
    default:
      return ''
  }
}

const steelFormula = (material: SteelMaterial) => {
  switch (material.stressStrain.type) {
    case 'elastic-perfectly-plastic':
      return `σs = Es ε, limited to ±fy; εy = fy / Es`
    case 'bilinear':
      return `σs = Es ε to ±fy, then hardening with ratio ${material.stressStrain.hardeningRatio}`
    case 'user-curve':
      return 'σs is linearly interpolated from user-defined ε-σ points'
    default:
      return ''
  }
}

const withConcreteModelDefaults = (material: ConcreteMaterial, type: ConcreteMaterial['stressStrain']['type']) => {
  if (type === 'kds-parabolic') {
    const params = kdsConcreteParams(material.fck)
    const next: ConcreteMaterial = {
      ...material,
      mc: material.mc ?? DEFAULT_CONCRETE_DENSITY,
      standard: material.standard === 'CUSTOM' ? 'CUSTOM' : 'KDS',
      stressStrain: { type, ...params },
      limits: { ...material.limits, eps0: params.eps0, epsCu: params.epsCu },
      factors: { ...material.factors, alpha: params.alpha }
    }
    return next.standard === 'KDS' ? applyKdsConcreteDerived(next) : next
  }
  if (type === 'aci-whitney-block') {
    return {
      ...material,
      mc: material.mc ?? DEFAULT_CONCRETE_DENSITY,
      standard: material.standard === 'CUSTOM' ? 'CUSTOM' : 'ACI318',
      stressStrain: { type, beta1: aciBeta1(material.fck), epsCu: 0.003, alpha: 0.85 },
      limits: { ...material.limits, eps0: undefined, epsCu: 0.003 },
      factors: { ...material.factors, alpha: 0.85 }
    } satisfies ConcreteMaterial
  }
  if (type === 'ec2-parabolic-rectangular') {
    return {
      ...material,
      mc: material.mc ?? DEFAULT_CONCRETE_DENSITY,
      standard: material.standard === 'CUSTOM' ? 'CUSTOM' : 'EC2',
      stressStrain: { type, n: 2, epsC2: 0.002, epsCu2: 0.0035, alpha: 1 },
      limits: { ...material.limits, eps0: 0.002, epsCu: 0.0035 },
      factors: { ...material.factors, alpha: 1 }
    } satisfies ConcreteMaterial
  }
  return {
    ...material,
    mc: material.mc ?? DEFAULT_CONCRETE_DENSITY,
    standard: 'CUSTOM',
    stressStrain: {
      type,
      interpolation: 'linear',
      zeroTension: material.limits.ignoreTension,
      points: [
        { strain: 0, stress: 0 },
        { strain: material.limits.eps0 ?? 0.002, stress: material.fck },
        { strain: material.limits.epsCu, stress: material.fck }
      ]
    }
  } satisfies ConcreteMaterial
}

const withSteelModelDefaults = (material: SteelMaterial, type: SteelMaterial['stressStrain']['type']) => {
  if (type === 'bilinear') {
    return {
      ...material,
      stressStrain: { type, hardeningRatio: 0.01 },
      limits: { ...material.limits, epsY: material.fy / material.elasticModulus }
    } satisfies SteelMaterial
  }
  if (type === 'user-curve') {
    return {
      ...material,
      standard: 'CUSTOM',
      stressStrain: {
        type,
        interpolation: 'linear',
        points: [
          { strain: -material.fy / material.elasticModulus, stress: -material.fy },
          { strain: 0, stress: 0 },
          { strain: material.fy / material.elasticModulus, stress: material.fy }
        ]
      }
    } satisfies SteelMaterial
  }
  return {
    ...material,
    stressStrain: { type },
    limits: { ...material.limits, epsY: material.fy / material.elasticModulus }
  } satisfies SteelMaterial
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

export function MaterialPanel({ store, usedSteelMaterialIds = new Set(), onChange }: Props) {
  const [activePage, setActivePage] = useState<MaterialPage>('concrete')
  const activeSteel = store.steel.find((material) => material.id === store.defaults.steelMaterialId) ?? store.steel[0]

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
    onChange({
      ...store,
      steel: [...store.steel, material],
      defaults: { ...store.defaults, steelMaterialId: material.id }
    })
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
          <div className="pm-section-title">
            <h2>Section Concrete</h2>
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
              <label className="pm-field">
              <span>Standard</span>
              <select
                value={store.concrete.standard}
                onChange={(event) =>
                  updateConcrete((material) => {
                    const standard = event.target.value as ConcreteMaterial['standard']
                    const next = { ...material, standard, mc: material.mc ?? DEFAULT_CONCRETE_DENSITY }
                    return standard === 'KDS' ? applyKdsConcreteDerived(next) : next
                  })
                }
              >
                <option value="KDS">KDS</option>
                <option value="ACI318">ACI318</option>
                <option value="EC2">EC2</option>
                <option value="CUSTOM">CUSTOM</option>
              </select>
            </label>
            </div>

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

            <div className="pm-material-stress-box">
              <div className="pm-material-stress-title">Stress-Strain</div>
              <div className="pm-material-row-3">
                <label className="pm-field">
                  <span>Model</span>
                  <select
                    value={store.concrete.stressStrain.type}
                    onChange={(event) =>
                      updateConcrete((material) =>
                        withConcreteModelDefaults(material, event.target.value as ConcreteMaterial['stressStrain']['type'])
                      )
                    }
                  >
                    <option value="kds-parabolic">KDS Parabolic</option>
                    <option value="aci-whitney-block">ACI Whitney</option>
                    <option value="ec2-parabolic-rectangular">EC2 Parabolic</option>
                    <option value="user-curve">User Curve</option>
                  </select>
                </label>
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
                {store.concrete.stressStrain.type === 'aci-whitney-block' ? (
                  <label className="pm-field">
                    <span>β1</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0.65}
                      max={0.85}
                      value={store.concrete.stressStrain.beta1}
                      onChange={(event) =>
                        updateConcrete((material) =>
                          material.stressStrain.type === 'aci-whitney-block'
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
                ) : (
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
                      disabled={store.concrete.stressStrain.type === 'user-curve'}
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
                )}
              </div>

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
          </div>
        </section>
      )}

      {activePage === 'steel' && (
        <section className="pm-panel-section">
          <div className="pm-section-title">
            <h2>Steel Materials</h2>
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
          <button type="button" className="pm-material-add-bottom" onClick={addSteel}>
            <Plus size={14} />
            Add Steel
          </button>

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
                <label className="pm-field">
                  <span>Standard</span>
                  <select
                    value={activeSteel.standard}
                    onChange={(event) =>
                      updateSteel(activeSteel.id, (material) => ({
                        ...material,
                        standard: event.target.value as SteelMaterial['standard']
                      }))
                    }
                  >
                    <option value="KDS">KDS</option>
                    <option value="ACI318">ACI318</option>
                    <option value="EC2">EC2</option>
                    <option value="CUSTOM">CUSTOM</option>
                  </select>
                </label>
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
                        return { ...material, fy, limits: { ...material.limits, epsY: fy / material.elasticModulus } }
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
                        return { ...material, elasticModulus, limits: { ...material.limits, epsY: material.fy / elasticModulus } }
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
                    <span>Model</span>
                    <select
                      value={activeSteel.stressStrain.type}
                      onChange={(event) =>
                        updateSteel(activeSteel.id, (material) =>
                          withSteelModelDefaults(material, event.target.value as SteelMaterial['stressStrain']['type'])
                        )
                      }
                    >
                      <option value="elastic-perfectly-plastic">Elastic Perfect Plastic</option>
                      <option value="bilinear">Bilinear</option>
                      <option value="user-curve">User Curve</option>
                    </select>
                  </label>
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
                  <label className="pm-field">
                    <span>Hardening</span>
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      disabled={activeSteel.stressStrain.type !== 'bilinear'}
                      value={activeSteel.stressStrain.type === 'bilinear' ? activeSteel.stressStrain.hardeningRatio : ''}
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
                </div>

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
