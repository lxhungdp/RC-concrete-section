'use client'

import { Eye, EyeOff, FileText, Loader2 } from 'lucide-react'
import type { InversePreviewResult } from '@pm/analysis'
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
  /** Result of the selected combination, or null while none is selected or solved. */
  inverseResult: InversePreviewResult | null
  working: boolean
  surfaceReady: boolean
  /** Batch utilization pass over every combination, shown so a partial list is not read as final. */
  quickCheck: { working: boolean; checked: number; total: number }
  loadcases: readonly LoadCombination[]
  /** Combinations to work through in full in the PDF; may be none, some, or all. */
  reportDetailIds: readonly number[]
  onReportDetailIdsChange: (ids: number[]) => void
  onExportReport: () => void
  reportState: 'idle' | 'working' | 'error'
  reportMessage: string
}

const fmt = (value: number, digits = 3) =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'

const shortDemandLabel = (id: (typeof DEMAND_CHART_IDS)[number]) =>
  id === 'heatmap' ? 'Field' : id === 'fixedP' ? 'Fixed-P' : 'Vertical'

/**
 * Governing verdict for the selected combination.
 *
 * `ok` already means converged **and** admissible, so it is the only state allowed to read as a
 * pass; everything else names why it is not one instead of collapsing to "fail".
 */
const verdict = (result: InversePreviewResult) => {
  if (!result.converged) return { label: 'No intersection', tone: 'is-bad' as const }
  if (!result.admissibility.evaluated) return { label: 'Cap face — no unique state', tone: 'is-warn' as const }
  if (!result.admissibility.ok) return { label: 'Strain inadmissible', tone: 'is-bad' as const }
  if (result.utilization == null) return { label: 'Not checked', tone: 'is-warn' as const }
  return result.utilization <= 1
    ? { label: 'Adequate', tone: 'is-good' as const }
    : { label: 'Inadequate', tone: 'is-bad' as const }
}

export function DemandCheckPanel({
  view,
  onViewChange,
  inverseResult,
  working,
  surfaceReady,
  quickCheck,
  loadcases,
  reportDetailIds,
  onReportDetailIdsChange,
  onExportReport,
  reportState,
  reportMessage
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
        <h2 className="pm-chart-visibility-title">Charts</h2>
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

      <section className="pm-panel-section">
        <div className="pm-section-title">
          <div>
            <h2>Governing check</h2>
            <p>Factored ULS demand against the design surface, by proportional 3D ray.</p>
          </div>
        </div>
        {!surfaceReady ? (
          <p className="pm-field-note">Build the section resistance surface first.</p>
        ) : working ? (
          <p className="pm-field-note">Solving the selected combination…</p>
        ) : !inverseResult ? (
          <p className="pm-field-note">Select a load combination below.</p>
        ) : (
          <>
            <div className="pm-result-status-list">
              <span>Verdict</span>
              <strong className={verdict(inverseResult).tone}>{verdict(inverseResult).label}</strong>
              <span>Utilization</span>
              <strong>{inverseResult.utilization == null ? '—' : fmt(inverseResult.utilization)}</strong>
              <span>Fixed-P (diag.)</span>
              <strong>
                {inverseResult.fixedPUtilization == null ? '—' : fmt(inverseResult.fixedPUtilization)}
              </strong>
              <span>φ</span>
              <strong>
                {inverseResult.resistance?.factor == null ? '—' : fmt(inverseResult.resistance.factor, 4)}
              </strong>
              <span>Classification</span>
              <strong>{inverseResult.resistance?.classification ?? '—'}</strong>
              <span>Axial cap</span>
              <strong>{inverseResult.resistance?.axialCapApplied ? 'governing' : 'not governing'}</strong>
            </div>
            <p className="pm-field-note">{inverseResult.message}</p>
          </>
        )}
        {surfaceReady && quickCheck.total > 0 ? (
          <p className="pm-field-note">
            {quickCheck.working
              ? `Checking utilizations… ${quickCheck.checked}/${quickCheck.total}`
              : `${quickCheck.checked}/${quickCheck.total} combinations have a utilization.`}
          </p>
        ) : null}
      </section>

      <section className="pm-panel-section">
        <div className="pm-section-title">
          <div>
            <h2>PDF report</h2>
            <p>Input, capacity curves and the demand table are always included.</p>
          </div>
        </div>
        <p className="pm-field-note">
          Detailed calculation pages — section views, ledger and solver evidence — are produced only
          for the combinations ticked below.
        </p>
        <div className="pm-result-check-row">
          <button
            type="button"
            className="pm-chart-restore"
            onClick={() => onReportDetailIdsChange(loadcases.map((item) => item.id))}
            disabled={loadcases.length === 0}
          >
            Select all
          </button>
          <button
            type="button"
            className="pm-chart-restore"
            onClick={() => onReportDetailIdsChange([])}
            disabled={reportDetailIds.length === 0}
          >
            Select none
          </button>
        </div>
        <div className="pm-chart-toggle-list">
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
          {loadcases.length === 0 ? <p className="pm-field-note">No combinations yet.</p> : null}
        </div>
        <div className="pm-result-check-row">
          <button
            type="button"
            className="pm-export-button"
            onClick={onExportReport}
            disabled={reportState === 'working' || !surfaceReady}
            title="Export the column design report as PDF"
          >
            {reportState === 'working' ? <Loader2 size={14} className="pm-spin" /> : <FileText size={14} />}
            {reportState === 'working' ? 'Building…' : `PDF report (${reportDetailIds.length} detailed)`}
          </button>
        </div>
        {reportMessage ? (
          <p className={reportState === 'error' ? 'pm-field-error' : 'pm-field-note'} role="status">
            {reportMessage}
          </p>
        ) : null}
      </section>
    </>
  )
}
