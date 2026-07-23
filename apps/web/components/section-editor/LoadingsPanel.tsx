'use client'

import { Plus, X } from 'lucide-react'
import { createLoadCombination, type LoadCombination, type LoadingsInput } from '@pm/project'

type Props = {
  input: LoadingsInput
  selectedLoadcaseId: number | null
  /** Utilization ratio by loadcase id when a capacity check has been run. */
  utilizationById?: Record<number, number | null>
  onSelectLoadcase: (id: number | null) => void
  onActivateLoadcase?: (loadcase: LoadCombination) => void
  onChange: (input: LoadingsInput) => void
  /** Called when Pu/Mux/Muy change so the capacity check can refresh. */
  onDemandChanged?: (loadcase: LoadCombination) => void
}

const toKn = (value: number) => value / 1000
const toKnM = (value: number) => value / 1_000_000
const fromNumber = (value: string, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const formatUr = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

export function LoadingsPanel({
  input,
  selectedLoadcaseId,
  utilizationById = {},
  onSelectLoadcase,
  onActivateLoadcase,
  onChange,
  onDemandChanged
}: Props) {
  const combinations = input.combinations

  const activateCombination = (combination: LoadCombination) => {
    onSelectLoadcase(combination.id)
    onActivateLoadcase?.(combination)
  }

  const updateCombination = (id: number, patch: Partial<LoadCombination>, refreshCheck = false) => {
    const nextCombinations = combinations.map((item) => (item.id === id ? { ...item, ...patch } : item))
    onChange({
      ...input,
      combinations: nextCombinations
    })
    if (refreshCheck) {
      const updated = nextCombinations.find((item) => item.id === id)
      if (updated) onDemandChanged?.(updated)
    }
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

  const removeCombination = (id: number) => {
    const next = combinations.filter((item) => item.id !== id)
    onChange({ ...input, combinations: next })
    if (selectedLoadcaseId === id) onSelectLoadcase(next[0]?.id ?? null)
  }

  return (
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
          <colgroup>
            <col className="pm-col-name" />
            <col className="pm-col-load" />
            <col className="pm-col-load" />
            <col className="pm-col-load" />
            <col className="pm-col-ur" />
            <col className="pm-col-action" />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th>
                Pu
                <br />
                kN
              </th>
              <th>
                Mux
                <br />
                kN.m
              </th>
              <th>
                Muy
                <br />
                kN.m
              </th>
              <th className="pm-col-ur">UR</th>
              <th className="pm-col-action" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {combinations.length === 0 && (
              <tr>
                <td colSpan={6} className="pm-rebar-empty">
                  Add loadcases Pu, Mux, Muy.
                </td>
              </tr>
            )}
            {combinations.map((item) => {
              const ur = utilizationById[item.id]
              const hasUr = typeof ur === 'number' && Number.isFinite(ur)
              const pass = hasUr && ur <= 1
              const fail = hasUr && ur > 1

              return (
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
                      onChange={(event) =>
                        updateCombination(
                          item.id,
                          { P: fromNumber(event.target.value, toKn(item.P)) * 1000 },
                          true
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={Number(toKnM(item.Mx).toFixed(3))}
                      aria-label={`Loadcase ${item.id} Mux`}
                      onFocus={() => activateCombination(item)}
                      onChange={(event) =>
                        updateCombination(
                          item.id,
                          { Mx: fromNumber(event.target.value, toKnM(item.Mx)) * 1_000_000 },
                          true
                        )
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
                        updateCombination(
                          item.id,
                          { My: fromNumber(event.target.value, toKnM(item.My)) * 1_000_000 },
                          true
                        )
                      }
                    />
                  </td>
                  <td className="pm-col-ur">
                    <span
                      className={`pm-loadcase-ur${pass ? ' is-pass' : ''}${fail ? ' is-fail' : ''}${
                        !hasUr ? ' is-pending' : ''
                      }`}
                      title={
                        hasUr
                          ? `UR = ${formatUr(ur)} — ${pass ? 'OK (≤ 1)' : 'NG (> 1)'}`
                          : 'Run check by selecting this loadcase'
                      }
                    >
                      {hasUr ? formatUr(ur) : '—'}
                    </span>
                  </td>
                  <td className="pm-col-action">
                    <div className="pm-loadcase-actions">
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
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
