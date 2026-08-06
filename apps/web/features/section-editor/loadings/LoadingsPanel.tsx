'use client'

import { useRef, type ChangeEvent } from 'react'
import { Download, Plus, Upload, X } from 'lucide-react'
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

const CSV_HEADERS = ['ID', 'Name', 'Pu (kN)', 'Mux (kN.m)', 'Muy (kN.m)']

const escapeCsvCell = (value: string | number) => {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const parseCsvRows = (text: string) => {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"'
        index++
      } else if (character === '"') {
        quoted = false
      } else {
        cell += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++
      row.push(cell)
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }

  if (quoted) throw new Error('An opening quote is not closed.')
  row.push(cell)
  if (row.some((value) => value.trim() !== '')) rows.push(row)
  return rows
}

const normalizeCsvHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const csvColumnIndex = (headers: string[], aliases: string[], required = true) => {
  const index = headers.findIndex((header) => aliases.includes(normalizeCsvHeader(header)))
  if (index < 0 && required) throw new Error(`Missing column "${aliases[0]}".`)
  return index
}

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
  const csvInputRef = useRef<HTMLInputElement | null>(null)

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

  const exportCsv = () => {
    const rows = combinations.map((combination) => [
      combination.id,
      combination.name,
      toKn(combination.P),
      toKnM(combination.Mx),
      toKnM(combination.My)
    ])
    const csv = [CSV_HEADERS, ...rows]
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'loadcases.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const rows = parseCsvRows(await file.text())
      if (rows.length < 2) throw new Error('The CSV must contain a header and at least one loadcase.')

      const headers = rows[0]
      const idColumn = csvColumnIndex(headers, ['id', 'no', 'number'], false)
      const nameColumn = csvColumnIndex(headers, ['name', 'loadcase', 'loadcasename'])
      const puColumn = csvColumnIndex(headers, ['pu', 'pukn'])
      const muxColumn = csvColumnIndex(headers, ['mux', 'muxknm'])
      const muyColumn = csvColumnIndex(headers, ['muy', 'muyknm'])
      const usedIds = new Set<number>()
      const imported = rows.slice(1).map((row, rowIndex) => {
        const line = rowIndex + 2
        const name = (row[nameColumn] ?? '').trim()
        if (!name) throw new Error(`Line ${line}: Name is required.`)

        const readNumber = (column: number, label: string) => {
          const value = Number((row[column] ?? '').trim())
          if (!Number.isFinite(value)) throw new Error(`Line ${line}: ${label} must be a finite number.`)
          return value
        }

        const requestedId = idColumn >= 0 && (row[idColumn] ?? '').trim() !== ''
          ? Number((row[idColumn] ?? '').trim())
          : undefined
        if (
          requestedId !== undefined &&
          (!Number.isInteger(requestedId) || requestedId <= 0 || usedIds.has(requestedId))
        ) {
          throw new Error(`Line ${line}: ID must be a unique positive integer.`)
        }

        const combination = createLoadCombination(
          {
            id: requestedId,
            name,
            P: readNumber(puColumn, 'Pu') * 1000,
            Mx: readNumber(muxColumn, 'Mux') * 1_000_000,
            My: readNumber(muyColumn, 'Muy') * 1_000_000
          },
          usedIds
        )
        usedIds.add(combination.id)
        return combination
      })

      onChange({ ...input, combinations: imported })
      onSelectLoadcase(null)
    } catch (error) {
      window.alert(`CSV import failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <section className="pm-panel-section">
      <div className="pm-section-title pm-section-title--with-action">
        <div>
          <h2>Loadcases</h2>
          <p>Factored ULS actions · checked against design resistance</p>
        </div>
        <div className="pm-loadcase-header-actions">
          <button
            type="button"
            className="pm-file-btn"
            onClick={exportCsv}
            title="Export loadcases to CSV"
          >
            <Download size={13} />
            CSV
          </button>
          <button
            type="button"
            className="pm-file-btn"
            onClick={() => csvInputRef.current?.click()}
            title="Import loadcases from CSV"
          >
            <Upload size={13} />
            CSV
          </button>
          <button type="button" className="pm-table-add-btn" onClick={addCombination}>
            <Plus size={13} />
            Add
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={importCsv}
          />
        </div>
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
              <th className="pm-col-ur" title="Three-dimensional proportional utilization ratio">
                3D UR
              </th>
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
