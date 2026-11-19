'use client'

import { Loader2 } from 'lucide-react'
import type { LoadCombination } from '@pm/project'
import { TransferIcon } from '../shared/WorkspaceIcons'

type Props = {
  loadcases: readonly LoadCombination[]
  surfaceReady: boolean
  /** Combinations to work through in full in both exports; may be none, some, or all. */
  reportDetailIds: readonly number[]
  onReportDetailIdsChange: (ids: number[]) => void
  onExportReport: () => void
  reportState: 'idle' | 'working' | 'error'
  reportMessage: string
  onExportExcel: () => void
  excelState: 'idle' | 'working' | 'error'
  excelMessage: string
}

export function ReportPanel({
  loadcases,
  surfaceReady,
  reportDetailIds,
  onReportDetailIdsChange,
  onExportReport,
  reportState,
  reportMessage,
  onExportExcel,
  excelState,
  excelMessage
}: Props) {
  const selected = new Set(reportDetailIds)
  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onReportDetailIdsChange(loadcases.filter((item) => next.has(item.id)).map((item) => item.id))
  }
  return (
    <section className="pm-panel-section pm-report-section">
      <div className="pm-section-title pm-section-title--with-action">
        <h2>Export report</h2>
        <div className="pm-panel-actions pm-report-export-actions">
          <button
            type="button"
            className="ws-action pm-file-btn"
            onClick={onExportReport}
            disabled={reportState === 'working' || !surfaceReady}
            title={`Export the column design report as PDF. Every combination gets its two curves, ${reportDetailIds.length} worked through`}
          >
            {reportState === 'working' ? <Loader2 size={13} className="pm-spin" /> : <TransferIcon direction="export" />}
            PDF
          </button>
          <button
            type="button"
            className="ws-action pm-file-btn"
            onClick={onExportExcel}
            disabled={excelState === 'working' || !surfaceReady}
            title={`Export the demand check to Excel with live formulas. Includes inverse, vertical and fixed-P sheets for ${reportDetailIds.length} combination(s)`}
          >
            {excelState === 'working' ? <Loader2 size={13} className="pm-spin" /> : <TransferIcon direction="export" />}
            Excel
          </button>
        </div>
      </div>
      <div className="pm-report-selection-heading">
        <span>Include loadcases</span>
        <div className="pm-report-selection-actions">
          <button
            type="button"
            className="ws-action pm-secondary-btn pm-report-pick-action"
            onClick={() => onReportDetailIdsChange(loadcases.map((item) => item.id))}
            disabled={loadcases.length === 0}
          >
            All
          </button>
          <button
            type="button"
            className="ws-action pm-secondary-btn pm-report-pick-action"
            onClick={() => onReportDetailIdsChange([])}
            disabled={reportDetailIds.length === 0}
          >
            None
          </button>
        </div>
      </div>
      <div className="pm-report-pick-box ws-scroll-list" aria-label="Loadcases included in report">
        {loadcases.map((loadcase) => (
          <label
            key={loadcase.id}
            className={`ws-check pm-field-check pm-report-pick${selected.has(loadcase.id) ? ' is-on' : ''}`}
          >
            <input
              type="checkbox"
              checked={selected.has(loadcase.id)}
              onChange={() => toggle(loadcase.id)}
            />
            {loadcase.name}
          </label>
        ))}
      </div>
      {reportMessage ? (
        <p className={reportState === 'error' ? 'pm-field-error' : 'pm-field-note'} role="status">
          {reportMessage}
        </p>
      ) : null}
      {excelMessage ? (
        <p className={excelState === 'error' ? 'pm-field-error' : 'pm-field-note'} role="status">
          {excelMessage}
        </p>
      ) : null}
    </section>
  )
}
