'use client'

import { useMemo, useState } from 'react'
import { Download, Eye, EyeOff, Loader2 } from 'lucide-react'
import type { PreviewSurface } from '@pm/analysis'
import {
  SECTION_CHART_IDS,
  sectionChartLabel,
  toggleChartVisibility,
  type SectionChartId,
  type SectionResultsView
} from './results-view'
import {
  buildChartTableRows,
  downloadChartTableExcel,
  formatChartTableForce,
  formatChartTableMoment,
  type ChartTableSource,
  type ChartTableStageForces
} from './chart-data-table'

export type SectionResultsSummary = {
  hasAppliedSection: boolean
  status: 'idle' | 'working' | 'error'
  message: string
  concreteArea: number
  steelArea: number
  rebarCount: number
  meshCells: number
  meshPoints: number
  surfacePoints: number
  directionCount: number
  stationCount: number
  /** Adaptive-refinement evidence, or null when the surface has none yet. */
  refinement: {
    tolerance: number
    maxRelative: number
    withinTolerance: boolean
  } | null
  warnings: string[]
  mechanics: 'stress-strain-integration' | 'equivalent-rectangular-block' | null
  /** Design code family shown at the top of the sidebar (e.g. KDS, ACI). */
  codeLabel: string
  /** Calculation method label paired with the code. */
  methodLabel: string
}

type Props = {
  summary: SectionResultsSummary
  view: SectionResultsView
  onViewChange: (patch: Partial<SectionResultsView>) => void
  surface: PreviewSurface | null
  fixedP: number
  projectName: string
}

const integer = (value: number) => Math.round(value).toLocaleString('en-US')

const shortLabel = (id: SectionChartId) =>
  id === 'vertical' ? 'Vertical' : id === 'surface3d' ? '3D' : 'Fixed-P'

const fmt = (value: number, digits = 2) =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'

const fmtForce = (value: number) => fmt(formatChartTableForce(value), 1)
const fmtMoment = (value: number) => fmt(formatChartTableMoment(value), 2)

const StageCells = ({ stage }: { stage: ChartTableStageForces | null }) => {
  if (!stage) {
    return (
      <>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
      </>
    )
  }
  return (
    <>
      <td>{fmtForce(stage.total.P)}</td>
      <td>{fmtMoment(stage.total.M)}</td>
      <td>{fmtForce(stage.concrete.P)}</td>
      <td>{fmtMoment(stage.concrete.M)}</td>
      <td>{fmtForce(stage.steel.P)}</td>
      <td>{fmtMoment(stage.steel.M)}</td>
    </>
  )
}

export function SectionResultsPanel({
  summary,
  view,
  onViewChange,
  surface,
  fixedP,
  projectName
}: Props) {
  const [source, setSource] = useState<ChartTableSource>('vertical')
  const [includeDesign, setIncludeDesign] = useState(true)
  const [includeNominal, setIncludeNominal] = useState(false)
  const [exporting, setExporting] = useState(false)

  const rows = useMemo(
    () =>
      buildChartTableRows({
        surface,
        source,
        includeDesign,
        includeNominal,
        sliceAngleDeg: view.sliceAngle,
        includeOpposite: view.includeOppositeMoment,
        fixedP
      }),
    [
      fixedP,
      includeDesign,
      includeNominal,
      source,
      surface,
      view.includeOppositeMoment,
      view.sliceAngle
    ]
  )

  const setResistanceChecks = (patch: { design?: boolean; nominal?: boolean }) => {
    const nextDesign = patch.design ?? includeDesign
    const nextNominal = patch.nominal ?? includeNominal
    if (!nextDesign && !nextNominal) return
    if (patch.design != null) setIncludeDesign(patch.design)
    if (patch.nominal != null) setIncludeNominal(patch.nominal)
  }

  const exportExcel = async () => {
    if (rows.length === 0 || exporting) return
    setExporting(true)
    try {
      const stem =
        (projectName || 'section-results')
          .trim()
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
          .replace(/\s+/g, '-') || 'section-results'
      await downloadChartTableExcel({
        rows,
        source,
        includeDesign,
        includeNominal,
        fileName: `${stem}-chart-data.xlsx`
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <section className="pm-panel-section">
        <div className="pm-result-status-list">
          <span>Code</span>
          <strong>{summary.codeLabel}</strong>
          <span>Method</span>
          <strong>{summary.methodLabel}</strong>
        </div>
      </section>

      <section className="pm-panel-section">
        <h2 className="pm-chart-visibility-title">Charts</h2>
        <div className="pm-chart-visibility-row" role="toolbar" aria-label="Chart visibility">
          {SECTION_CHART_IDS.map((id) => {
            const on = view.visibleCharts[id]
            return (
              <button
                key={id}
                type="button"
                className={`pm-chart-visibility-btn${on ? ' is-on' : ''}`}
                aria-pressed={on}
                title={on ? `Hide ${sectionChartLabel(id)}` : `Show ${sectionChartLabel(id)}`}
                onClick={() => onViewChange(toggleChartVisibility(view, SECTION_CHART_IDS, id))}
              >
                {on ? <Eye size={12} /> : <EyeOff size={12} />}
                <span>{shortLabel(id)}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="pm-panel-section">
        <h2 className="pm-chart-visibility-title">Section</h2>
        <div className="pm-result-status-list">
          <span>Ac</span>
          <strong>{summary.hasAppliedSection ? `${integer(summary.concreteArea)} mm²` : '—'}</strong>
          <span>As</span>
          <strong>{`${integer(summary.steelArea)} mm²`}</strong>
          <span>Surface points</span>
          <strong>{integer(summary.surfacePoints)}</strong>
          <span>Directions</span>
          <strong>{summary.directionCount}</strong>
          <span>Stations</span>
          <strong>{summary.stationCount}</strong>
          {summary.mechanics === 'stress-strain-integration' ? (
            <>
              <span>Mesh cells</span>
              <strong>{integer(summary.meshCells)}</strong>
              <span>Mesh points</span>
              <strong>{integer(summary.meshPoints)}</strong>
            </>
          ) : null}
          {summary.refinement ? (
            <>
              <span>Interp. error</span>
              <strong className={summary.refinement.withinTolerance ? '' : 'is-warning'}>
                {`${(summary.refinement.maxRelative * 100).toFixed(3)}% / ${(
                  summary.refinement.tolerance * 100
                ).toFixed(2)}%`}
              </strong>
            </>
          ) : null}
        </div>
      </section>

      <section className="pm-panel-section pm-chart-data-section">
        <div className="pm-chart-data-toolbar">
          <h2 className="pm-chart-visibility-title">Chart data</h2>
          <button
            type="button"
            className="pm-file-btn"
            disabled={rows.length === 0 || exporting}
            onClick={() => void exportExcel()}
            title="Export the visible table to Excel"
          >
            {exporting ? <Loader2 size={13} className="pm-spin" /> : <Download size={13} />}
            Excel
          </button>
        </div>

        <div className="pm-chart-data-controls">
          <fieldset className="pm-result-radio-group" aria-label="Chart source">
            <label className={source === 'vertical' ? 'is-active' : ''}>
              <input
                type="radio"
                name="chart-data-source"
                checked={source === 'vertical'}
                onChange={() => setSource('vertical')}
              />
              Vertical
            </label>
            <label className={source === 'fixedP' ? 'is-active' : ''}>
              <input
                type="radio"
                name="chart-data-source"
                checked={source === 'fixedP'}
                onChange={() => setSource('fixedP')}
              />
              Fixed-P
            </label>
          </fieldset>

          <div className="pm-result-check-row" role="group" aria-label="Resistance curves">
            <label className={includeDesign ? 'is-on' : ''}>
              <input
                type="checkbox"
                checked={includeDesign}
                onChange={(event) => setResistanceChecks({ design: event.target.checked })}
              />
              Design
            </label>
            <label className={includeNominal ? 'is-on' : ''}>
              <input
                type="checkbox"
                checked={includeNominal}
                onChange={(event) => setResistanceChecks({ nominal: event.target.checked })}
              />
              Nominal
            </label>
          </div>
        </div>

        <p className="pm-field-note">
          {source === 'vertical'
            ? `φ = ${fmt(view.sliceAngle, 0)}° · nearest sampled direction`
            : `P = ${fmt(fixedP / 1000, 1)} kN contour · |M|`}
          {` · ${rows.length} row${rows.length === 1 ? '' : 's'}`}
          {' · kN / kN·m'}
        </p>

        <div className="pm-chart-data-table-wrap">
          {!surface ? (
            <p className="pm-field-note">Build the resistance surface to list chart points.</p>
          ) : rows.length === 0 ? (
            <p className="pm-field-note">No rows for the current filters.</p>
          ) : (
            <table className="pm-point-table pm-chart-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Criterion</th>
                  {includeDesign ? (
                    <>
                      <th title="Design sum P">P</th>
                      <th title="Design sum M">M</th>
                      <th title="Design concrete P">Pc</th>
                      <th title="Design concrete M">Mc</th>
                      <th title="Design steel P">Ps</th>
                      <th title="Design steel M">Ms</th>
                    </>
                  ) : null}
                  {includeNominal ? (
                    <>
                      <th title="Nominal sum P">Pn</th>
                      <th title="Nominal sum M">Mn</th>
                      <th title="Nominal concrete P">Pnc</th>
                      <th title="Nominal concrete M">Mnc</th>
                      <th title="Nominal steel P">Pns</th>
                      <th title="Nominal steel M">Mns</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.index}</td>
                    <td title={row.criterion}>{row.criterion}</td>
                    {includeDesign ? <StageCells stage={row.design} /> : null}
                    {includeNominal ? <StageCells stage={row.nominal} /> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  )
}
