'use client'

import { useMemo, useState } from 'react'
import { Download, Eye, EyeOff, Loader2 } from 'lucide-react'
import type { ExactDirectionCurve, PreviewSurface } from '@pm/analysis'
import type { DesignBasis } from '@pm/design'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { LoadCombination, ProjectInformation } from '@pm/project'
import {
  SECTION_CHART_IDS,
  sectionChartLabel,
  toggleChartVisibility,
  type SectionChartId,
  type SectionResultsView
} from './results-view'
import {
  buildChartTableRows,
  downloadChartAuditExcel,
  formatChartTableForce,
  formatChartTableMoment,
  type ChartTableMoments,
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
  samplingMode: 'fixed' | 'adaptive'
  /** Adaptive-refinement evidence, or null when the surface has none yet. */
  refinement: {
    tolerance: number
    maxRelative: number
    withinTolerance: boolean
  } | null
  warnings: string[]
  mechanics: 'stress-strain-integration' | 'equivalent-rectangular-block' | null
}

type Props = {
  summary: SectionResultsSummary
  view: SectionResultsView
  onViewChange: (patch: Partial<SectionResultsView>) => void
  surface: PreviewSurface | null
  exactDirectionCurve: ExactDirectionCurve | null
  fixedP: number
  projectName: string
  projectInformation: ProjectInformation
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
  loadcases: readonly LoadCombination[]
}

const integer = (value: number) => Math.round(value).toLocaleString('en-US')

const shortLabel = (id: SectionChartId) =>
  id === 'vertical' ? 'Vertical' : id === 'surface3d' ? '3D' : 'Fixed-P'

const fmt = (value: number, digits = 2) =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'

const fmtForce = (value: number) => fmt(formatChartTableForce(value), 1)
const fmtMoment = (value: number) => fmt(formatChartTableMoment(value), 2)

const SumCells = ({ stage }: { stage: ChartTableStageForces | null }) => {
  if (!stage) {
    return (
      <>
        <td>—</td>
        <td>—</td>
      </>
    )
  }
  return (
    <>
      <td>{fmtForce(stage.total.P)}</td>
      <td>{fmtMoment(stage.total.M)}</td>
    </>
  )
}

const MomentCells = ({ stage }: { stage: ChartTableMoments | null }) => {
  if (!stage) {
    return (
      <>
        <td>—</td>
        <td>—</td>
      </>
    )
  }
  return (
    <>
      <td>{fmtMoment(stage.Mx)}</td>
      <td>{fmtMoment(stage.My)}</td>
    </>
  )
}

export function SectionResultsPanel({
  summary,
  view,
  onViewChange,
  surface,
  exactDirectionCurve,
  fixedP,
  projectName,
  projectInformation,
  section,
  rebars,
  materialStore,
  designBasis,
  loadcases
}: Props) {
  const [source, setSource] = useState<ChartTableSource>('vertical')
  const [resistanceStage, setResistanceStage] = useState<'design' | 'nominal'>('design')
  const includeDesign = resistanceStage === 'design'
  const includeNominal = resistanceStage === 'nominal'
  const [exporting, setExporting] = useState(false)

  const rows = useMemo(
    () =>
      buildChartTableRows({
        surface,
        exactDirectionCurve,
        source,
        resistanceStage,
        sliceAngleDeg: view.sliceAngle,
        fixedP
      }),
    [
      fixedP,
      resistanceStage,
      source,
      surface,
      exactDirectionCurve,
      view.sliceAngle
    ]
  )

  const exportExcel = async () => {
    if (rows.length === 0 || exporting) return
    setExporting(true)
    try {
      if (!surface) return
      await downloadChartAuditExcel({
        projectName,
        projectInformation,
        sectionName: section.name,
        section,
        rebars,
        materialStore,
        designBasis,
        surface,
        exactDirectionCurve,
        source,
        resistanceStage,
        sliceAngleDeg: view.sliceAngle,
        fixedP,
        loadcases
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <section className="pm-panel-section pm-chart-toggle-section">
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
        <h2 className="pm-chart-visibility-title">Section Information</h2>
        <div className="pm-result-status-list">
          <span>Ac / As</span>
          <strong>
            {summary.hasAppliedSection
              ? `${integer(summary.concreteArea)} / ${integer(summary.steelArea)} mm²`
              : `— / ${integer(summary.steelArea)} mm²`}
          </strong>
          <span>Sampling mode</span>
          <strong>{summary.samplingMode === 'adaptive' ? 'Independent adaptive' : 'Fixed grid'}</strong>
          <span>Directions / max stations</span>
          <strong>{`${integer(summary.directionCount)} / ${integer(summary.stationCount)}`}</strong>
          {summary.mechanics === 'stress-strain-integration' ? (
            <>
              <span>Mesh cells / points</span>
              <strong>{`${integer(summary.meshCells)} / ${integer(summary.meshPoints)}`}</strong>
            </>
          ) : null}
          <span>Surface points</span>
          <strong>{integer(summary.surfacePoints)}</strong>
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
          <div className="pm-chart-data-heading">
            <h2 className="pm-chart-visibility-title">Chart data</h2>
            <span>
              {source === 'vertical'
                ? exactDirectionCurve
                  ? `Exact β = ${fmt(exactDirectionCurve.beta * 180 / Math.PI, 3)}°`
                  : `Fixed β = ${fmt(view.sliceAngle, 0)}°`
                : `P = ${fmt(fixedP / 1000, 1)} kN`}
              {` · ${rows.length} row${rows.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <button
            type="button"
            className="pm-file-btn"
            disabled={rows.length === 0 || exporting}
            onClick={() => void exportExcel()}
            title="Export a formula-driven project audit workbook"
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
          <fieldset className="pm-result-radio-group" aria-label="Table resistance stage">
            <label className={resistanceStage === 'design' ? 'is-active' : ''}>
              <input
                type="radio"
                name="chart-data-resistance-stage"
                checked={resistanceStage === 'design'}
                onChange={() => setResistanceStage('design')}
              />
              Design
            </label>
            <label className={resistanceStage === 'nominal' ? 'is-active' : ''}>
              <input
                type="radio"
                name="chart-data-resistance-stage"
                checked={resistanceStage === 'nominal'}
                onChange={() => setResistanceStage('nominal')}
              />
              Nominal
            </label>
          </fieldset>
        </div>

        <div className="pm-chart-data-table-wrap">
          {!surface ? (
            <p className="pm-field-note">Build the resistance surface to list chart points.</p>
          ) : rows.length === 0 ? (
            <p className="pm-field-note">No rows for the current filters.</p>
          ) : source === 'fixedP' ? (
            <table className="pm-chart-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th title="Sampled strain-plane direction β">β</th>
                  {includeDesign ? (
                    <>
                      <th title="Design Mx">Mx <span className="pm-table-unit">(kN·m)</span></th>
                      <th title="Design My">My <span className="pm-table-unit">(kN·m)</span></th>
                    </>
                  ) : null}
                  {includeNominal ? (
                    <>
                      <th title="Nominal Mx">Mnx <span className="pm-table-unit">(kN·m)</span></th>
                      <th title="Nominal My">Mny <span className="pm-table-unit">(kN·m)</span></th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  row.kind === 'fixedP' ? (
                    <tr key={row.key}>
                      <td>{row.index}</td>
                      <td>{fmt(row.angleDeg, 3)}°</td>
                      {includeDesign ? <MomentCells stage={row.design} /> : null}
                      {includeNominal ? <MomentCells stage={row.nominal} /> : null}
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          ) : (
            <table className="pm-chart-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Criterion</th>
                  {includeDesign ? (
                    <>
                      <th title="Design sum P">P <span className="pm-table-unit">(kN)</span></th>
                      <th title="Design sum M">M <span className="pm-table-unit">(kN·m)</span></th>
                    </>
                  ) : null}
                  {includeNominal ? (
                    <>
                      <th title="Nominal sum P">Pn <span className="pm-table-unit">(kN)</span></th>
                      <th title="Nominal sum M">Mn <span className="pm-table-unit">(kN·m)</span></th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  row.kind === 'vertical' ? (
                    <tr key={row.key}>
                      <td>{row.index}</td>
                      <td title={row.criterion}>{row.criterion}</td>
                      {includeDesign ? <SumCells stage={row.design} /> : null}
                      {includeNominal ? <SumCells stage={row.nominal} /> : null}
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  )
}
