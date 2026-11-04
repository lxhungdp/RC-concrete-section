'use client'

import { QuantityInput, UnitLabel, useDisplayUnits } from '../shared/DisplayUnits'

import { AddIcon } from '../shared/WorkspaceIcons'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import type { LoadcaseQuickCheckResult } from '@pm/analysis'
import { createLoadCombination, editLoadAtReference, loadReferenceOf, resultantAtCentroid, resultantAtLoadReference, type LoadCombination, type LoadingsInput } from '@pm/project'
import { downloadLoadcaseWorkbook, importLoadcaseWorkbook } from './loadcase-xlsx'
import { selectLoadcaseFromRow } from './loadcase-selection'

type Props = {
  input: LoadingsInput
  selectedLoadcaseId: number | null
  /** Complete quick-check evidence by loadcase id, including the three-state verdict. */
  checksById?: Record<number, LoadcaseQuickCheckResult>
  updateStatus?: { active: boolean; message: string }
  onSelectLoadcase: (id: number | null) => void
  onOpenDetail?: () => void
  onChange: (input: LoadingsInput) => void
  /** Called when Pu/Mux/Muy change so the capacity check can refresh. */
  onDemandChanged?: (loadcase: LoadCombination) => void
}

const formatUr = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

type SpreadsheetInputProps = {
  value: string
  ariaLabel: string
  numeric?: boolean
  onCommit: (value: string) => void
}

/**
 * Keep edits local until the user leaves the cell (or presses Enter). This matches spreadsheet
 * entry and prevents a capacity check from being scheduled once per typed digit.
 */
const SpreadsheetInput = ({ value, ariaLabel, numeric = false, onCommit }: SpreadsheetInputProps) => {
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  const commit = () => {
    const next = draft.trim()
    if (numeric && (next === '' || !Number.isFinite(Number(next)))) {
      setDraft(value)
      return
    }
    if (next !== value) onCommit(next)
    else if (draft !== value) setDraft(value)
  }

  return (
    <input
      type="text"
      inputMode={numeric ? 'decimal' : undefined}
      value={draft}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function LoadingsPanel({
  input,
  selectedLoadcaseId,
  checksById = {},
  updateStatus = { active: false, message: '' },
  onSelectLoadcase,
  onOpenDetail,
  onChange,
  onDemandChanged
}: Props) {
  const { selection: displayUnits } = useDisplayUnits()
  const combinations = input.combinations
  const reference = loadReferenceOf(input)
  const excelInputRef = useRef<HTMLInputElement | null>(null)

  const updateCombination = (id: number, patch: Partial<LoadCombination>, refreshCheck = false) => {
    const nextCombinations = combinations.map((item) => (item.id === id ? editLoadAtReference(item, patch, reference) : item))
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
    onChange({ ...input, combinations: [...combinations, resultantAtCentroid(next, reference)] })
    onSelectLoadcase(next.id)
  }

  const removeCombination = (id: number) => {
    const removedIndex = combinations.findIndex((item) => item.id === id)
    const next = combinations.filter((item) => item.id !== id)
    onChange({ ...input, combinations: next })
    if (selectedLoadcaseId === id) {
      onSelectLoadcase(next[Math.min(Math.max(removedIndex, 0), next.length - 1)]?.id ?? null)
    }
  }

  const exportExcel = async () => {
    try {
      await downloadLoadcaseWorkbook(combinations, displayUnits, reference)
    } catch (error) {
      window.alert(`Excel export failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const imported = await importLoadcaseWorkbook(await file.arrayBuffer())
      onChange({ ...input, combinations: imported })
      onSelectLoadcase(null)
    } catch (error) {
      window.alert(`Excel import failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <section className="pm-panel-section ws-table-editor">
      <div className="ws-table-editor-heading">
        <div className="pm-section-title pm-section-title--with-action pm-loadcase-heading">
          <div className="pm-loadcase-title-copy">
            <h2>Loadcases</h2>
            <span className="pm-loadcase-units" aria-label="Load units"><UnitLabel quantity="force" />, <UnitLabel quantity="moment" /></span>
          </div>
          <button type="button" className="ws-action" onClick={onOpenDetail} disabled={!onOpenDetail}
            title="Open the calculation trace for the selected loadcase">
            Detail calculation
          </button>
        </div>
        {/* Keep this inline slot mounted so status visibility never moves the table. */}
        <div className={`pm-loadcase-update-slot${updateStatus.active ? ' is-active' : ''}`}>
          <div
            className="pm-loadcase-update-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-hidden={!updateStatus.active}
          >
            <Loader2 size={12} className="pm-spin" aria-hidden="true" />
            <span>{updateStatus.message}</span>
          </div>
        </div>
      </div>
      <div className="pm-loadcase-table-wrap ws-table-scroll">
        <table className="pm-loadcase-table" aria-label="Loadcase demand table">
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
              <th title="Load combination name">Name</th>
              <th title="Factored axial force: positive compression, negative tension">Pu</th>
              <th title="Factored moment about X at the applied load reference.">Mux</th>
              <th title="Factored moment about Y at the applied load reference.">Muy</th>
              <th className="pm-col-ur" title="Three-dimensional proportional utilization ratio">
                UR
              </th>
              <th className="pm-col-action" aria-label="Actions" />
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
              const displayed = resultantAtLoadReference(item, reference)
              const check = checksById[item.id]
              const ur = check?.utilization
              const hasUr = typeof ur === 'number' && Number.isFinite(ur)
              const pass = check?.adequacy === 'adequate'
              const fail = check?.adequacy === 'inadequate'
              const indeterminate = check?.adequacy === 'indeterminate'
              const statusLabel = pass ? 'OK' : fail ? 'NG' : indeterminate ? 'CHECK' : ''
              const interval = check?.utilizationInterval
              const selectRow = () => selectLoadcaseFromRow(selectedLoadcaseId, item.id, onSelectLoadcase)

              return (
                <tr
                  key={item.id}
                  className={selectedLoadcaseId === item.id ? 'is-selected' : ''}
                  aria-current={selectedLoadcaseId === item.id ? 'true' : undefined}
                  tabIndex={0}
                  onClick={selectRow}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault()
                      selectRow()
                    }
                  }}
                >
                  <td>
                    <SpreadsheetInput
                      value={item.name}
                      ariaLabel={`Loadcase ${item.id} name`}
                      onCommit={(value) => updateCombination(item.id, { name: value })}
                    />
                  </td>
                  <td>
                    <QuantityInput showUnit={false} quantity="force"
                      value={displayed.P}
                      aria-label={`Loadcase ${item.id} Pu`}
                      onValueChange={(value) => updateCombination(item.id, { P: value }, true)}
                    />
                  </td>
                  <td>
                    <QuantityInput showUnit={false} quantity="moment"
                      value={displayed.Mx}
                      aria-label={`Loadcase ${item.id} Mux`}
                      onValueChange={(value) => updateCombination(item.id, { Mx: value }, true)}
                    />
                  </td>
                  <td>
                    <QuantityInput showUnit={false} quantity="moment"
                      value={displayed.My}
                      aria-label={`Loadcase ${item.id} Muy`}
                      onValueChange={(value) => updateCombination(item.id, { My: value }, true)}
                    />
                  </td>
                  <td className="pm-col-ur">
                    <span
                      className={`pm-loadcase-ur${pass ? ' is-pass' : ''}${fail ? ' is-fail' : ''}${
                        indeterminate ? ' is-indeterminate' : ''
                      }${
                        !check ? ' is-pending' : ''
                      }`}
                      title={
                        hasUr
                          ? `UR = ${formatUr(ur)} — ${statusLabel}${
                            interval?.lower != null && interval.upper != null
                              ? `; screening interval ${formatUr(interval.lower)}–${formatUr(interval.upper)}`
                              : ''
                          }; ${check.message}`
                          : check?.message ?? 'Run check by selecting this loadcase'
                      }
                    >
                      <span className="ws-num">{hasUr ? formatUr(ur) : '—'}</span>
                      {statusLabel && <small>{statusLabel}</small>}
                    </span>
                  </td>
                  <td className="pm-col-action">
                    <div className="pm-loadcase-actions">
                      <button
                        type="button"
                        className="ws-action ws-action--quiet ws-action--danger-quiet ws-action--compact ws-action--icon pm-table-icon-btn pm-table-icon-btn--danger"
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
      <div className="ws-table-actions pm-loadcase-footer">
        <div className="pm-loadcase-file-actions" role="group" aria-label="Loadcase Excel tools">
          <button
            type="button"
            className="ws-action pm-file-btn"
            onClick={() => void exportExcel()}
            title="Export loadcases to Excel"
            aria-label="Export XLSX loadcase workbook"
          >
            Export XLSX
          </button>
          <button
            type="button"
            className="ws-action pm-file-btn"
            onClick={() => excelInputRef.current?.click()}
            title="Import loadcases from Excel"
            aria-label="Import XLSX loadcase workbook"
          >
            Import XLSX
          </button>
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={importExcel}
          />
        </div>
        <button type="button" className="ws-action ws-action--primary" onClick={addCombination}>
          <AddIcon />
          Add
        </button>
      </div>
    </section>
  )
}
