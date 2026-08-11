'use client'

import { Download, Eye, EyeOff, Loader2 } from 'lucide-react'
import type { LoadCombination } from '@pm/project'
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
      <section className="pm-panel-section">
        <div className="pm-chart-visibility-row" role="toolbar" aria-label="Chart visibility">
          {DEMAND_CHART_IDS.map((id) => {
            const on = view.visibleCharts[id]
            return (
              <button
                key={id}
                type="button"
                className={`pm-chart-visibility-btn${on ? ' is-on' : ''}`}
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

      <section className="pm-panel-section pm-report-section">
        <div className="pm-section-title pm-section-title--with-action">
          <h2>Report</h2>
          <div className="pm-panel-actions pm-report-export-actions">
            <button
              type="button"
              className="pm-file-btn"
              onClick={onExportReport}
              disabled={reportState === 'working' || !surfaceReady}
              title={`Export the column design report as PDF · every combination gets its two curves, ${reportDetailIds.length} worked through`}
            >
              {reportState === 'working' ? <Loader2 size={13} className="pm-spin" /> : <Download size={13} />}
              PDF
            </button>
            <button
              type="button"
              className="pm-file-btn"
              onClick={onExportExcel}
              disabled={excelState === 'working' || !excelReady}
              title={`Export the demand check to Excel with live formulas · inverse, vertical and fixed-P sheets for ${reportDetailIds.length} combination(s)`}
            >
              {excelState === 'working' ? <Loader2 size={13} className="pm-spin" /> : <Download size={13} />}
              Excel
            </button>
          </div>
        </div>
        <div className="pm-report-selection-heading">
          <span>Include loadcases</span>
          <div className="pm-report-selection-actions">
            <button
              type="button"
              className="pm-secondary-btn pm-report-pick-action"
              onClick={() => onReportDetailIdsChange(loadcases.map((item) => item.id))}
              disabled={loadcases.length === 0}
            >
              All
            </button>
            <button
              type="button"
              className="pm-secondary-btn pm-report-pick-action"
              onClick={() => onReportDetailIdsChange([])}
              disabled={reportDetailIds.length === 0}
            >
              None
            </button>
          </div>
        </div>
        <div className="pm-report-pick-box" aria-label="Loadcases included in report">
          {loadcases.map((loadcase) => (
            <label
              key={loadcase.id}
              className={`pm-field-check pm-report-pick${selected.has(loadcase.id) ? ' is-on' : ''}`}
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
