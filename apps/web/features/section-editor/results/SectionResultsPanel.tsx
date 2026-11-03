'use client'

import { QuantityValue, UnitLabel, useQuantityFormatters } from '../shared/DisplayUnits'

import { TransferIcon } from '../shared/WorkspaceIcons'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import type {
  ExactDirectionCurve,
  PreviewSurface,
  PreviewSurfacePoint,
  StationDefinition
} from '@pm/analysis'
import type { DesignBasis } from '@pm/design'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { LoadCombination, LoadReference, ProjectInformation } from '@pm/project'
import {
  SECTION_CHART_IDS,
  sectionChartLabel,
  toggleChartVisibility,
  type SectionChartId,
  type SectionResultsView
} from './results-view'
import {
  buildChartTableRows,
  chartValueLabel,
  downloadCalculationTraceAuditExcel,
  downloadChartAuditExcel,
  downloadConcretePointAuditExcel,
  formatChartTableForce,
  formatChartTableMoment,
  resolveChartTableRowSelection,
  type ChartValueComponent,
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
  loadReference?: LoadReference
}

const integer = (value: number) => Math.round(value).toLocaleString('en-US')

const shortLabel = (id: SectionChartId) =>
  id === 'vertical' ? 'Vertical' : id === 'surface3d' ? '3D' : 'Fixed-P'

const fmt = (value: number, digits = 2) =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'


const ValueCell = ({ value, component, row, onTrace }: {
  value: number | null
  component: ChartValueComponent
  row: ChartTableRow
  onTrace: (row: ChartTableRow, component: ChartValueComponent) => void
}) => {
  const { fmtForce, fmtMoment } = useQuantityFormatters()
  const label = chartValueLabel(component, row.evidence.stage)
  return <td className="ws-num">{value === null ? '—' : <button
    type="button"
    className="ws-action ws-action--quiet ws-action--compact pm-chart-value-action"
    aria-label={`Trace ${label} for row ${row.index}`}
    onClick={() => onTrace(row, component)}
  ><span className="ws-num">{component === 'P' ? fmtForce(value) : fmtMoment(value)}</span></button>}</td>
}

const SumCells = ({ stage, row, onTrace }: {
  stage: ChartTableStageForces | null; row: ChartTableRow
  onTrace: (row: ChartTableRow, component: ChartValueComponent) => void
}) => <>
  <ValueCell value={stage?.total.P ?? null} component="P" row={row} onTrace={onTrace} />
  <ValueCell value={stage?.total.M ?? null} component="M" row={row} onTrace={onTrace} />
</>

const MomentCells = ({ stage, row, onTrace }: {
  stage: ChartTableMoments | null; row: ChartTableRow
  onTrace: (row: ChartTableRow, component: ChartValueComponent) => void
}) => <>
  <ValueCell value={stage?.Mx ?? null} component="Mx" row={row} onTrace={onTrace} />
  <ValueCell value={stage?.My ?? null} component="My" row={row} onTrace={onTrace} />
</>

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
  loadcases,
  loadReference
}: Props) {
  const { displayUnits, qfmt, unit, force, moment } = useQuantityFormatters()

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
  const [valueComponent, setValueComponent] = useState<ChartValueComponent | null>(null)
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
        presentationUnits: displayUnits,
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
        presentationUnits: displayUnits,
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
        presentationUnits: displayUnits,
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

  const openCalculationTrace = (row: ChartTableRow, component: ChartValueComponent | null = null) => {
    setValueComponent(component)
    setSelectedRow(row)
    setCalculationSelectionAnchor(row)
    setCalculationExportError(null)
    setCalculationDialogOpen(true)
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
                className={`ws-action pm-chart-visibility-btn${on ? ' is-on' : ''}`}
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
        <h2 className="pm-chart-visibility-title">Section information</h2>
        <div className="pm-result-status-list">
          <span>Ac / As</span>
          <strong className="ws-num">
            {summary.hasAppliedSection
              ? `${qfmt('area', summary.concreteArea, 0)} / ${qfmt('area', summary.steelArea, 0)} ${unit('area')}`
              : `— / ${qfmt('area', summary.steelArea, 0)} ${unit('area')}`}
          </strong>
          <span>Sampling mode</span>
          <strong>{summary.samplingMode === 'adaptive' ? 'Independent adaptive' : 'Fixed grid'}</strong>
          <span>Directions / max stations</span>
          <strong className="ws-num">{`${integer(summary.directionCount)} / ${integer(summary.stationCount)}`}</strong>
          {summary.mechanics === 'stress-strain-integration' ? (
            <>
              <span>Mesh cells / points</span>
              <strong className="ws-num">{`${integer(summary.meshCells)} / ${integer(summary.meshPoints)}`}</strong>
            </>
          ) : null}
          <span>Surface points</span>
          <strong className="ws-num">{integer(summary.surfacePoints)}</strong>
          {summary.refinement ? (
            <>
              <span>{summary.samplingMode === 'fixed' ? 'Measured interp. error' : 'Interp. error / tolerance'}</span>
              <strong
                className={
                  summary.samplingMode === 'fixed' || !summary.refinement.withinTolerance
                    ? 'ws-num is-warning'
                    : 'ws-num'
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
        {loadReference && (loadReference.offsetX !== 0 || loadReference.offsetY !== 0) ? <p className="pm-field-note">Charts, audit tables and calculation traces use moments about centroid.</p> : null}
        <div className="pm-chart-data-toolbar">
          <div className="pm-chart-data-heading">
            <h2 className="pm-chart-visibility-title">Chart data</h2>
            <span>
              {source === 'vertical'
                ? exactDirectionCurve
                  ? `Exact β = ${fmt(exactDirectionCurve.beta * 180 / Math.PI, 3)}°`
                  : `Fixed β = ${fmt(view.sliceAngle, 0)}°`
                : `P = ${qfmt('force', fixedP, 1)} ${unit('force')}`}
              {` · ${rows.length} row${rows.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="pm-chart-data-actions">
            <button
              type="button"
              className="ws-action"
              disabled={rows.length === 0}
              onClick={() => {
                const row = resolveChartTableRowSelection(rows, calculationSelectionAnchor ?? selectedRow) ?? rows[0]
                if (row) openCalculationTrace(row)
              }}
            >Detail</button>
            <button
              type="button"
              className="ws-action pm-file-btn"
              disabled={rows.length === 0 || exporting}
              onClick={() => void exportExcel()}
              title="Export a formula-driven project audit workbook"
            >
              {exporting ? <Loader2 size={13} className="pm-spin" /> : <TransferIcon direction="export" />}
              Excel
            </button>
          </div>
        </div>

        <div className="pm-chart-data-controls">
          <fieldset className="pm-result-radio-group ws-joined-buttons" aria-label="Chart source">
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
          <fieldset className="pm-result-radio-group ws-joined-buttons" aria-label="Table resistance stage">
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

        {rows.length > 0 ? <p className="pm-chart-data-inspect-hint">Use Detail for complete calculation information, or select a result value for its calculation trace.</p> : null}

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
                      <th title="Design resistance about X">Mrx <span className="pm-table-unit">({unit('moment')})</span></th>
                      <th title="Design resistance about Y">Mry <span className="pm-table-unit">({unit('moment')})</span></th>
                    </>
                  ) : null}
                  {includeNominal ? (
                    <>
                      <th title="Nominal Mx">Mnx <span className="pm-table-unit">({unit('moment')})</span></th>
                      <th title="Nominal My">Mny <span className="pm-table-unit">({unit('moment')})</span></th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  row.kind === 'fixedP' ? (
                    <tr
                      key={row.key}
                      aria-selected={selectedRow?.key === row.key}
                      className={selectedRow?.key === row.key ? 'is-selected' : undefined}
                    >
                      <td className="ws-num">{row.index}</td>
                      <td className="ws-num">{row.branch}</td>
                      <td className="ws-num">{fmt(row.angleDeg, 3)}°</td>
                      {includeDesign ? <MomentCells stage={row.design} row={row} onTrace={openCalculationTrace} /> : null}
                      {includeNominal ? <MomentCells stage={row.nominal} row={row} onTrace={openCalculationTrace} /> : null}
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
                      <th title="Design sum P">P <span className="pm-table-unit">({unit('force')})</span></th>
                      <th title="Design sum M">M <span className="pm-table-unit">({unit('moment')})</span></th>
                    </>
                  ) : null}
                  {includeNominal ? (
                    <>
                      <th title="Nominal sum P">Pn <span className="pm-table-unit">({unit('force')})</span></th>
                      <th title="Nominal sum M">Mn <span className="pm-table-unit">({unit('moment')})</span></th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  row.kind === 'vertical' ? (
                    <tr
                      key={row.key}
                      aria-selected={selectedRow?.key === row.key}
                      className={selectedRow?.key === row.key ? 'is-selected' : undefined}
                    >
                      <td className="ws-num">{row.index}</td>
                      <td title={row.criterion}>{row.criterion}</td>
                      {includeDesign ? <SumCells stage={row.design} row={row} onTrace={openCalculationTrace} /> : null}
                      {includeNominal ? <SumCells stage={row.nominal} row={row} onTrace={openCalculationTrace} /> : null}
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
          valueComponent={valueComponent}
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
            setValueComponent(null)
            setSelectedRow(null)
            setCalculationSelectionAnchor(null)
            setCalculationExportError(null)
          }}
        />
      ) : null}
    </>
  )
}
