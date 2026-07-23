'use client'

import { Copy, Plus, X } from 'lucide-react'
import { createLoadCombination, type LoadCombination, type LoadingsInput } from '@pm/project'

type Props = {
  input: LoadingsInput
  selectedLoadcaseId: number | null
  onSelectLoadcase: (id: number | null) => void
  onActivateLoadcase?: (loadcase: LoadCombination) => void
  onChange: (input: LoadingsInput) => void
}

const toKn = (value: number) => value / 1000
const toKnM = (value: number) => value / 1_000_000
const fromNumber = (value: string, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function LoadingsPanel({ input, selectedLoadcaseId, onSelectLoadcase, onActivateLoadcase, onChange }: Props) {
  const combinations = input.combinations

  const activateCombination = (combination: LoadCombination) => {
    onSelectLoadcase(combination.id)
    onActivateLoadcase?.(combination)
  }

  const updateCombination = (id: number, patch: Partial<LoadCombination>) => {
    onChange({
      ...input,
      combinations: combinations.map((item) => (item.id === id ? { ...item, ...patch } : item))
    })
  }

  const addCombination = () => {
    const next = createLoadCombination(
      {
        name: `LC${combinations.length + 1}`,
        P: combinations.length === 0 ? 1000_000 : 0,
        Mx: combinations.length === 0 ? 100_000_000 : 0,
        My: 0
      },
      combinations.map((item) => item.id)
    )
    onChange({ ...input, combinations: [...combinations, next] })
    activateCombination(next)
  }

  const duplicateCombination = (source: LoadCombination) => {
    const next = createLoadCombination(
      {
        ...source,
        id: undefined,
        name: `${source.name} copy`
      },
      combinations.map((item) => item.id)
    )
    onChange({ ...input, combinations: [...combinations, next] })
    activateCombination(next)
  }

  const removeCombination = (id: number) => {
    const next = combinations.filter((item) => item.id !== id)
    onChange({ ...input, combinations: next })
    if (selectedLoadcaseId === id) onSelectLoadcase(next[0]?.id ?? null)
  }

  return (
    <>
      <section className="pm-panel-section">
        <div className="pm-section-title pm-section-title--with-action">
          <h2>Loadcases</h2>
          <button type="button" className="pm-table-add-btn" onClick={addCombination}>
            <Plus size={14} />
            Add
          </button>
        </div>
        <div className="pm-loadcase-table-wrap">
          <table className="pm-loadcase-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Pu<br />kN</th>
                <th>Mux<br />kN.m</th>
                <th>Muy<br />kN.m</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {combinations.length === 0 && (
                <tr>
                  <td colSpan={5} className="pm-rebar-empty">
                    Add loadcases Pu, Mux, Muy.
                  </td>
                </tr>
              )}
              {combinations.map((item) => (
                <tr
                  key={item.id}
                  className={selectedLoadcaseId === item.id ? 'is-selected' : ''}
                  onClick={() => activateCombination(item)}
                >
                  <td>
                    <input
                      value={item.name}
                      aria-label={`Loadcase ${item.id} name`}
                      onFocus={() => activateCombination(item)}
                      onChange={(event) => updateCombination(item.id, { name: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={Number(toKn(item.P).toFixed(3))}
                      aria-label={`Loadcase ${item.id} Pu`}
                      onFocus={() => activateCombination(item)}
                      onChange={(event) => updateCombination(item.id, { P: fromNumber(event.target.value, toKn(item.P)) * 1000 })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={Number(toKnM(item.Mx).toFixed(3))}
                      aria-label={`Loadcase ${item.id} Mux`}
                      onFocus={() => activateCombination(item)}
                      onChange={(event) =>
                        updateCombination(item.id, { Mx: fromNumber(event.target.value, toKnM(item.Mx)) * 1_000_000 })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={Number(toKnM(item.My).toFixed(3))}
                      aria-label={`Loadcase ${item.id} Muy`}
                      onFocus={() => activateCombination(item)}
                      onChange={(event) =>
                        updateCombination(item.id, { My: fromNumber(event.target.value, toKnM(item.My)) * 1_000_000 })
                      }
                    />
                  </td>
                  <td>
                    <div className="pm-loadcase-actions">
                      <button
                        type="button"
                        className="pm-table-icon-btn"
                        title="Duplicate"
                        onClick={(event) => {
                          event.stopPropagation()
                          duplicateCombination(item)
                        }}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        className="pm-table-icon-btn pm-table-icon-btn--danger"
                        title="Delete"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeCombination(item.id)
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="pm-panel-section">
        <div className="pm-section-title">
          <h2>Input Units</h2>
        </div>
        <div className="pm-loadcase-unit-grid">
          <span>Pu</span>
          <strong>kN</strong>
          <span>Mux, Muy</span>
          <strong>kN.m</strong>
          <span>Stored</span>
          <strong>N, N.mm</strong>
        </div>
      </section>
    </>
  )
}
