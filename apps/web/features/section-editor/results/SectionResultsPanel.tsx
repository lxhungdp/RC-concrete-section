'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import dynamic from 'next/dynamic'
import { Download, Eye, EyeOff, Loader2 } from 'lucide-react'
import type {
  ExactDirectionCurve,
  PreviewSurface,
  PreviewSurfacePoint,
  StationDefinition
} from '@pm/analysis'
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
  downloadCalculationTraceAuditExcel,
  downloadChartAuditExcel,
  downloadConcretePointAuditExcel,
  formatChartTableForce,
  formatChartTableMoment,
  resolveChartTableRowSelection,
  type ChartTableMoments,
  type ChartTableRow,
  type ChartTableResistanceStage,
  type ChartTableSource,
  type ChartTableStageForces
} from './chart-data-table'

const ChartCalculationDialog = dynamic(
  () => import('./ChartCalculationDialog').then((module) => module.ChartCalculationDialog),
  { ssr: false }
)

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
  /** Measured interpolation evidence, or null when this sampling mode did not take probes. */
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
  const [resistanceStage, setResistanceStage] = useState<ChartTableResistanceStage>('design')
  const includeDesign = resistanceStage === 'design'
  const includeNominal = resistanceStage === 'nominal'
  const [exporting, setExporting] = useState(false)
  const [exportingConcreteKey, setExportingConcreteKey] = useState<string | null>(null)
  const [exportingCalculationTrace, setExportingCalculationTrace] = useState(false)
  const [selectedRow, setSelectedRow] = useState<ChartTableRow | null>(null)
  const [calculationSelectionAnchor, setCalculationSelectionAnchor] = useState<ChartTableRow | null>(null)
  const [calculationDialogOpen, setCalculationDialogOpen] = useState(false)
  const [calculationExportError, setCalculationExportError] = useState<string | null>(null)

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

  const exportConcreteExcel = async ({
    key,
    label,
    point,
    stationDefinition
  }: {
    key: string
    label: string
    point: PreviewSurfacePoint
    stationDefinition: StationDefinition | null
  }) => {
    if (!surface?.calculationProfileId || exportingConcreteKey) return
    setExportingConcreteKey(key)
    setCalculationExportError(null)
    try {
      await downloadConcretePointAuditExcel({
        projectName,
        sectionName: section.name,
        calculationProfileId: surface.calculationProfileId,
        section,
        rebars,
        materialStore,
        analysisOptions: surface.analysisOptions,
        designBasis,
        stage: resistanceStage,
        point,
        stationDefinition,
        label
      })
    } catch (error: unknown) {
      setCalculationExportError(`Concrete workbook: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setExportingConcreteKey(null)
    }
  }

  const exportCalculationTraceExcel = async () => {
    if (!surface?.calculationProfileId || !selectedRow || exportingCalculationTrace) return
    const states = selectedRow.kind === 'vertical'
      ? [{
          key: 'selected' as const,
          label: 'Selected Vertical station',
          point: selectedRow.evidence.point,
          stationDefinition: selectedRow.evidence.station?.definition ?? null
        }]
      : selectedRow.evidence.bracket
        ? selectedRow.evidence.bracket.exact
          ? [{
              key: 'below' as const,
              label: 'Selected Fixed-P station',
              point: selectedRow.evidence.bracket.below,
              stationDefinition: selectedRow.evidence.belowStation?.definition ?? null
            }]
          : [
              {
                key: 'below' as const,
                label: 'Lower Fixed-P endpoint',
                point: selectedRow.evidence.bracket.below,
                stationDefinition: selectedRow.evidence.belowStation?.definition ?? null
              },
              {
                key: 'above' as const,
                label: 'Upper Fixed-P endpoint',
                point: selectedRow.evidence.bracket.above,
                stationDefinition: selectedRow.evidence.aboveStation?.definition ?? null
              }
            ]
        : []
    if (states.length === 0) return
    const selection = selectedRow.kind === 'vertical'
      ? {
          kind: 'vertical' as const,
          rowIndex: selectedRow.index,
          criterion: selectedRow.criterion,
          angleDeg: selectedRow.evidence.angleDeg
        }
      : {
          kind: 'fixedP' as const,
          rowIndex: selectedRow.index,
          angleDeg: selectedRow.angleDeg,
          branch: selectedRow.branch,
          fixedP: selectedRow.evidence.fixedP,
          sample: {
            P: selectedRow.evidence.sample.P,
            Mx: selectedRow.evidence.sample.Mx,
            My: selectedRow.evidence.sample.My
          },
          exact: selectedRow.evidence.bracket?.exact ?? false,
          ratio: selectedRow.evidence.bracket?.ratio ?? 0
        }
    setExportingCalculationTrace(true)
    setCalculationExportError(null)
    try {
      await downloadCalculationTraceAuditExcel({
        projectName,
        sectionName: section.name,
        calculationProfileId: surface.calculationProfileId,
        section,
        rebars,
        materialStore,
        analysisOptions: surface.analysisOptions,
        designBasis,
        stage: selectedRow.evidence.stage,
        selection,
        states
      })
    } catch (error: unknown) {
      setCalculationExportError(`Complete workbook: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setExportingCalculationTrace(false)
    }
  }

  useEffect(() => {
    if (!calculationDialogOpen) return
    setSelectedRow(resolveChartTableRowSelection(rows, calculationSelectionAnchor))
  }, [calculationDialogOpen, calculationSelectionAnchor, rows])

  useEffect(() => {
    setCalculationExportError(null)
  }, [resistanceStage, selectedRow?.key, source])

  const selectSource = (next: ChartTableSource) => {
    setCalculationDialogOpen(false)
    setSelectedRow(null)
    setCalculationSelectionAnchor(null)
    setSource(next)
  }

  const selectResistanceStage = (next: ChartTableResistanceStage) => {
    setCalculationDialogOpen(false)
    setSelectedRow(null)
    setCalculationSelectionAnchor(null)
    setResistanceStage(next)
  }

  const dialogRows = (
    nextSource: ChartTableSource,
    nextStage: ChartTableResistanceStage
  ) => buildChartTableRows({
    surface,
    exactDirectionCurve,
    source: nextSource,
    resistanceStage: nextStage,
    sliceAngleDeg: view.sliceAngle,
    fixedP
  })

  const selectDialogSource = (next: ChartTableSource) => {
    const nextRows = dialogRows(next, resistanceStage)
    const nextRow = resolveChartTableRowSelection(
      nextRows,
      calculationSelectionAnchor ?? selectedRow
    )
    setSource(next)
    setSelectedRow(nextRow)
    setCalculationSelectionAnchor(nextRow)
  }

  const selectDialogResistanceStage = (next: ChartTableResistanceStage) => {
    const nextRows = dialogRows(source, next)
    const nextRow = resolveChartTableRowSelection(
      nextRows,
      calculationSelectionAnchor ?? selectedRow
    )
    setResistanceStage(next)
    setSelectedRow(nextRow)
    if (nextRow) setCalculationSelectionAnchor(nextRow)
  }

  const selectDialogRow = (key: string) => {
    const next = rows.find((row) => row.key === key)
    if (next) {
      setSelectedRow(next)
      setCalculationSelectionAnchor(next)
    }
  }

  const openCalculationTrace = (row: ChartTableRow) => {
    setSelectedRow(row)
    setCalculationSelectionAnchor(row)
    setCalculationExportError(null)
    setCalculationDialogOpen(true)
  }

  const rowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: ChartTableRow) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openCalculationTrace(row)
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
              <span>{summary.samplingMode === 'fixed' ? 'Measured interp. error' : 'Interp. error / tolerance'}</span>
              <strong
                className={
                  summary.samplingMode === 'fixed' || !summary.refinement.withinTolerance
                    ? 'is-warning'
                    : ''
                }
              >
                {summary.samplingMode === 'fixed'
                  ? `${(summary.refinement.maxRelative * 100).toFixed(3)}% · screening`
                  : `${(summary.refinement.maxRelative * 100).toFixed(3)}% / ${(
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
                onChange={() => selectSource('vertical')}
              />
              Vertical
            </label>
            <label className={source === 'fixedP' ? 'is-active' : ''}>
              <input
                type="radio"
                name="chart-data-source"
                checked={source === 'fixedP'}
                onChange={() => selectSource('fixedP')}
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
                onChange={() => selectResistanceStage('design')}
              />
              Design
            </label>
            <label className={resistanceStage === 'nominal' ? 'is-active' : ''}>
              <input
                type="radio"
                name="chart-data-resistance-stage"
                checked={resistanceStage === 'nominal'}
                onChange={() => selectResistanceStage('nominal')}
              />
              Nominal
            </label>
          </fieldset>
        </div>

        {rows.length > 0 ? <p className="pm-chart-data-inspect-hint">Select a row to inspect its formulas, inputs and stored calculation evidence.</p> : null}

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
                  <th title="Distinct contour branch at the same β">Branch</th>
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
                    <tr
                      key={row.key}
                      tabIndex={0}
                      aria-label={`Open calculation details for row ${row.index}, beta ${fmt(row.angleDeg, 3)} degrees`}
                      aria-selected={selectedRow?.key === row.key}
                      className={selectedRow?.key === row.key ? 'is-selected' : undefined}
                      onClick={(event) => {
                        event.currentTarget.focus()
                        openCalculationTrace(row)
                      }}
                      onKeyDown={(event) => rowKeyDown(event, row)}
                    >
                      <td>{row.index}</td>
                      <td>{row.branch}</td>
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
                    <tr
                      key={row.key}
                      tabIndex={0}
                      aria-label={`Open calculation details for row ${row.index}, ${row.criterion}`}
                      aria-selected={selectedRow?.key === row.key}
                      className={selectedRow?.key === row.key ? 'is-selected' : undefined}
                      onClick={(event) => {
                        event.currentTarget.focus()
                        openCalculationTrace(row)
                      }}
                      onKeyDown={(event) => rowKeyDown(event, row)}
                    >
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

      {calculationDialogOpen && surface ? (
        <ChartCalculationDialog
          row={selectedRow}
          rows={rows}
          source={source}
          resistanceStage={resistanceStage}
          summary={summary}
          surface={surface}
          projectName={projectName}
          section={section}
          rebars={rebars}
          materialStore={materialStore}
          designBasis={designBasis}
          exportingConcreteKey={exportingConcreteKey}
          exportingCalculationTrace={exportingCalculationTrace}
          exportError={calculationExportError}
          onExportConcreteExcel={exportConcreteExcel}
          onExportCalculationTraceExcel={exportCalculationTraceExcel}
          onSourceChange={selectDialogSource}
          onResistanceStageChange={selectDialogResistanceStage}
          onRowChange={selectDialogRow}
          onClose={() => {
            setCalculationDialogOpen(false)
            setSelectedRow(null)
            setCalculationSelectionAnchor(null)
            setCalculationExportError(null)
          }}
        />
      ) : null}
    </>
  )
}
