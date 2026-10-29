'use client'

import { TransferIcon } from '../shared/WorkspaceIcons'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import type { LoadCombination, LoadingsInput, LoadReference } from '@pm/project'
import dynamic from 'next/dynamic'
const LoadReferencePanel = dynamic(() => import('../loadings/LoadReferencePanel').then(module => module.LoadReferencePanel), { ssr: false })
import {
  DEMAND_CHART_IDS,
  demandChartLabel,
  toggleChartVisibility,
  type DemandCheckView
} from './results-view'

type Props = {
  view: DemandCheckView
  onViewChange: (patch: Partial<DemandCheckView>) => void
  surfaceReady: boolean
  loadcases: readonly LoadCombination[]
  loadingsInput: LoadingsInput
  onLoadingsChange: (input: LoadingsInput) => void
  onReferencePreviewChange: (value: LoadReference | null) => void
  /** Combinations to work through in full in the PDF; may be none, some, or all. */
  reportDetailIds: readonly number[]
  onReportDetailIdsChange: (ids: number[]) => void
  onExportReport: () => void
  reportState: 'idle' | 'working' | 'error'
  reportMessage: string
  onExportExcel: () => void
  excelReady: boolean
  excelState: 'idle' | 'working' | 'error'
  excelMessage: string
}

const shortDemandLabel = (id: (typeof DEMAND_CHART_IDS)[number]) =>
  id === 'heatmap' ? 'Field' : id === 'fixedP' ? 'Fixed-P' : 'Vertical'

export function DemandCheckPanel({
  view,
  onViewChange,
  surfaceReady,
  loadcases,
  loadingsInput,
  onLoadingsChange,
  onReferencePreviewChange,
  reportDetailIds,
  onReportDetailIdsChange,
  onExportReport,
  reportState,
  reportMessage,
  onExportExcel,
  excelReady,
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
    <>
      <section className="pm-panel-section pm-chart-toggle-section">
        <div className="pm-chart-visibility-row" role="toolbar" aria-label="Chart visibility">
          {DEMAND_CHART_IDS.map((id) => {
            const on = view.visibleCharts[id]
            return (
              <button
                key={id}
                type="button"
                className={`ws-action pm-chart-visibility-btn${on ? ' is-on' : ''}`}
                aria-pressed={on}
                title={on ? `Hide ${demandChartLabel(id)}` : `Show ${demandChartLabel(id)}`}
                onClick={() => onViewChange(toggleChartVisibility(view, DEMAND_CHART_IDS, id))}
              >
                {on ? <Eye size={12} /> : <EyeOff size={12} />}
                <span>{shortDemandLabel(id)}</span>
              </button>
            )
          })}
        </div>
      </section>

      <LoadReferencePanel key={`${loadingsInput.reference?.offsetX ?? 0}:${loadingsInput.reference?.offsetY ?? 0}`} input={loadingsInput} onChange={onLoadingsChange} onPreviewChange={onReferencePreviewChange} />
      <section className="pm-panel-section pm-report-section">
        <div className="pm-section-title pm-section-title--with-action">
          <h2>Report</h2>
          <div className="pm-panel-actions pm-report-export-actions">
            <button
              type="button"
              className="ws-action pm-file-btn"
              onClick={onExportReport}
              disabled={reportState === 'working' || !surfaceReady}
              title={`Export the column design report as PDF 쨌 every combination gets its two curves, ${reportDetailIds.length} worked through`}
            >
              {reportState === 'working' ? <Loader2 size={13} className="pm-spin" /> : <TransferIcon direction="export" />}
              PDF
            </button>
            <button
              type="button"
              className="ws-action pm-file-btn"
              onClick={onExportExcel}
              disabled={excelState === 'working' || !excelReady}
              title={`Export the demand check to Excel with live formulas 쨌 inverse, vertical and fixed-P sheets for ${reportDetailIds.length} combination(s)`}
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
    </>
  )
}
