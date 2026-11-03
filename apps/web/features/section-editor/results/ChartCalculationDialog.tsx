'use client'

import { QuantityValue, UnitLabel, useQuantityFormatters } from '../shared/DisplayUnits'

import { TransferIcon } from '../shared/WorkspaceIcons'
import { useEffect, useId, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import {
  stationDefinitionLabel,
  type AxialCapPointCalculationAudit,
  type CalculationAuditRebar,
  type CalculationAuditResistanceFactor,
  type PointCalculationAudit,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type Resultant,
  type ResultantLedger,
  type StationDefinition
} from '@pm/analysis'
import type { DesignBasis } from '@pm/design'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialLawAudit, MaterialStore } from '@pm/materials'
import { buildPointAuditsAsync, isAnalysisAbort } from '../../../application/analysis/client'
import {
  chartResultantValue,
  chartTableValue,
  chartValueLabel,
  isReconciledPointAudit,
  type ChartValueComponent,
  type ChartTableFixedPRow,
  type ChartTableResistanceStage,
  type ChartTableRow,
  type ChartTableSource,
  type ChartTableVerticalRow
} from './chart-data-table'
import { CalculationDialogFrame, Fact, Formula, FormulaPanel, Step } from './CalculationDialogFrame'
import { TechnicalEquation } from './TechnicalEquation'

type PhysicalPointCalculationAudit = Exclude<
  PointCalculationAudit,
  { kind: 'unavailable' } | { kind: 'axial-cap' }
>

type Summary = { concreteArea: number; steelArea: number; rebarCount: number }
type Props = {
  row: ChartTableRow | null
  valueComponent: ChartValueComponent | null
  rows: readonly ChartTableRow[]
  source: ChartTableSource
  resistanceStage: ChartTableResistanceStage
  summary: Summary
  surface: PreviewSurface
  projectName: string
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
  exportingConcreteKey: string | null
  exportingCalculationTrace: boolean
  exportError: string | null
  onExportConcreteExcel: (request: {
    key: string
    label: string
    point: PreviewSurfacePoint
    stationDefinition: StationDefinition | null
  }) => Promise<void>
  onExportCalculationTraceExcel: () => Promise<void>
  onSourceChange: (source: ChartTableSource) => void
  onResistanceStageChange: (stage: ChartTableResistanceStage) => void
  onRowChange: (key: string) => void
  onClose: () => void
}

const fmt = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return '—'
  const displayValue = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value
  return displayValue.toLocaleString('en-US', { maximumFractionDigits: digits })
}
const strain = (value: number) => Number.isFinite(value) ? value.toExponential(4) : '—'

// These helpers format authored notation only; they do not evaluate an engineering expression.
const texNumber = (value: string) => value.replace(/,/g, '{,}').replace(/e([+-]?\d+)/, (_, exponent: string) => String.raw`\times 10^{${Number(exponent)}}`)
const texStrain = (value: number) => texNumber(strain(value))
const texUnit = (value: string) => String.raw`\mathrm{${value.replace('·', String.raw`\,`).replace('⁻¹', '^{-1}').replace('²', '^2').replace('³', '^3')}}`
const scalarSymbol = (component: ChartValueComponent, part: string) => component === 'P'
  ? String.raw`P_{${part}}`
  : String.raw`M_{${component === 'M' ? '\\beta' : component === 'Mx' ? 'x' : 'y'},${part}}`
const stageSymbol = (component: ChartValueComponent, stage: ChartTableResistanceStage) => component === 'P'
  ? stage === 'design' ? 'P' : 'P_n'
  : component === 'M' ? stage === 'design' ? String.raw`M_{\beta}` : String.raw`M_{n,\beta}`
    : String.raw`M_{${stage === 'design' ? 'r' : 'n'}${component === 'Mx' ? 'x' : 'y'}}`
const componentWeight = (component: ChartValueComponent) => component === 'P' ? ''
  : component === 'Mx' ? 'y' : component === 'My' ? 'x' : String.raw`(y\cos\beta+x\sin\beta)`

const ResultantComparisonTable = ({ nominal, factored }: {
  nominal: ResultantLedger
  factored: ResultantLedger | null
}) => {
  const { unit, forceValue, momentValue, force, moment } = useQuantityFormatters()

  const summaryRows: Array<[string, Resultant]> = [
    ['Concrete', nominal.concrete],
    ['Reinforcement, net', nominal.steel]
  ]
  const cells = (value: Resultant) => <><td>{forceValue(value.P)}</td><td>{momentValue(value.Mx)}</td><td>{momentValue(value.My)}</td></>
  const factoredRows = factored ? [factored.concrete, factored.steel] : [null, null]
  const factoredCells = (value: Resultant | null) => value
    ? cells(value)
    : <><td>—</td><td>—</td><td>—</td></>
  return (
    <div className="pm-calc-table-wrap"><table className="pm-calc-resultant-comparison">
      <thead>
        <tr><th rowSpan={2}>Contribution</th><th colSpan={3}>Nominal / reference</th><th colSpan={3}>Factored / Design</th></tr>
        <tr><th>P ({unit('force')})</th><th>Mx ({unit('moment')})</th><th>My ({unit('moment')})</th><th>P ({unit('force')})</th><th>Mx ({unit('moment')})</th><th>My ({unit('moment')})</th></tr>
      </thead>
      <tbody>{summaryRows.map(([label, value], index) => (
          <tr key={label}><td>{label}</td>{cells(value)}{factoredCells(factoredRows[index] ?? null)}</tr>
        ))}</tbody>
      <tfoot><tr><td>Total resistance</td>{cells(nominal.total)}{factoredCells(factored?.total ?? null)}</tr></tfoot>
    </table></div>
  )
}

const ConcreteSummary = ({ audit, component, angleDeg = 0 }: {
  audit: PhysicalPointCalculationAudit
  component?: ChartValueComponent
  angleDeg?: number
}) => {
  const { qfmt, unit, forceValue, momentValue, force, moment } = useQuantityFormatters()

  if (component) {
    const value = (part: Resultant) => component === 'P'
      ? force(chartResultantValue(part, component, angleDeg))
      : moment(chartResultantValue(part, component, angleDeg))
    const weight = componentWeight(component)
    return <>
      {audit.kind === 'stress-strain' ? <>
        <FormulaPanel>
          <Formula><TechnicalEquation latex={String.raw`${scalarSymbol(component, 'c')}=\sum_i\sigma_{c,i}A_i\,${weight}=\text{${value(audit.mechanicalLedger.concrete)}}`}
            ariaLabel="Selected concrete component from its integration terms" /></Formula>
        </FormulaPanel>
        <div className="pm-calc-table-wrap"><table><thead><tr><th>Concrete law branch</th><th>Terms</th><th>Area ({unit('area')})</th><th>{component}c</th></tr></thead>
          <tbody>{audit.concreteGroups.map(group => <tr key={group.id}><td>{group.label}</td><td>{group.count}</td><td>{qfmt('area', group.area)}</td><td>{value(group.resultant)}</td></tr>)}</tbody>
          <tfoot><tr><td>Total concrete</td><td>{audit.concreteSummary.pointCount}</td><td>{qfmt('area', audit.concreteSummary.area)}</td><td>{value(audit.mechanicalLedger.concrete)}</td></tr></tfoot>
        </table></div>
        <p className="pm-calc-caption">Each integration term uses its compatible strain and active concrete law. Coordinates x/y are relative to the analysis origin.</p>
      </> : <>
        <FormulaPanel><Formula><TechnicalEquation latex={String.raw`P_c=\sigma_b A_c,\quad \sigma_b=${texNumber(qfmt('stress', audit.block.compressionStress))}\,${texUnit(unit('stress'))},\quad A_c=${texNumber(qfmt('area', audit.block.area))}\,${texUnit(unit('area'))}`}
          ariaLabel="Concrete force from the exact clipped block area and block stress" /></Formula>
          <Formula><TechnicalEquation latex={String.raw`${scalarSymbol(component, 'c')}=${component === 'P' ? '\\sigma_b A_c' : `P_c ${component === 'Mx' ? '(y_b-y_0)' : component === 'My' ? '(x_b-x_0)' : '[(y_b-y_0)\\cos\\beta+(x_b-x_0)\\sin\\beta]'}`}=\text{${value(audit.mechanicalLedger.concrete)}}`}
            ariaLabel="Selected exact block concrete component" /></Formula>
          {component !== 'P' && <Formula><TechnicalEquation latex={String.raw`(x_b,y_b)=(${texNumber(qfmt('length', audit.block.centroidX))},${texNumber(qfmt('length', audit.block.centroidY))})\,${texUnit(unit('length'))},\quad (x_0,y_0)=(${texNumber(qfmt('length', audit.origin.x))},${texNumber(qfmt('length', audit.origin.y))})\,${texUnit(unit('length'))}`}
            ariaLabel="Block centroid and analysis origin for the selected moment arm" /></Formula>}
        </FormulaPanel>
      </>}
      <p className="pm-calc-caption">These are mechanics-stage contributions; any global resistance factor is applied once in the resistance step.</p>
    </>
  }
  const resultant = audit.displayedLedger.concrete
  const isStressStrain = audit.kind === 'stress-strain'
  return (
    <>
      <div className="pm-calc-table-wrap"><table className="pm-calc-concrete-summary">
        <thead><tr>
          <th>Concrete basis</th><th>Detailed terms</th><th>Area ({unit('area')})</th>
          <th>Pc ({unit('force')})</th><th>Mcx ({unit('moment')})</th><th>Mcy ({unit('moment')})</th>
        </tr></thead>
        <tbody><tr>
          <td>{isStressStrain ? 'Stress–strain mesh' : 'Equivalent block'}</td>
          <td>{isStressStrain ? `${fmt(audit.concreteSummary.pointCount, 0)} points` : 'Exact polygon'}</td>
          <td>{qfmt('area', isStressStrain ? audit.concreteSummary.area : audit.block.area)}</td>
          <td>{forceValue(resultant.P)}</td><td>{momentValue(resultant.Mx)}</td><td>{momentValue(resultant.My)}</td>
        </tr></tbody>
      </table></div>
      <p className="pm-calc-caption">The Excel audit expands this summary into the detailed concrete terms and formulas that produce these stage-specific resultants.</p>
    </>
  )
}

const sectionBounds = (section: SectionGeometry, rebars: GeometryInputRebarView[]) => {
  const points = section.solids.flatMap((solid) => [solid.outer, ...solid.holes]).flat()
  const xs = [...points.map((point) => point.x), ...rebars.map((bar) => bar.x)]
  const ys = [...points.map((point) => point.y), ...rebars.map((bar) => bar.y)]
  return {
    minX: Math.min(...xs, -1), maxX: Math.max(...xs, 1),
    minY: Math.min(...ys, -1), maxY: Math.max(...ys, 1)
  }
}

const CalculationDiagram = ({ section, rebars, audit, patternId }: {
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  audit: PhysicalPointCalculationAudit
  patternId: string
}) => {
  const { qfmt, unit } = useQuantityFormatters()

  const bounds = sectionBounds(section, rebars)
  const box = { x: 22, y: 38, width: 290, height: 236 }
  const dx = Math.max(1, bounds.maxX - bounds.minX)
  const dy = Math.max(1, bounds.maxY - bounds.minY)
  const scale = Math.min(box.width / dx, box.height / dy)
  const sx = (x: number) => box.x + (box.width - dx * scale) / 2 + (x - bounds.minX) * scale
  const sy = (y: number) => box.y + box.height - (box.height - dy * scale) / 2 - (y - bounds.minY) * scale
  const path = (ring: Array<{ x: number; y: number }>) => ring.length === 0 ? ''
    : `${ring.map((point, index) => `${index === 0 ? 'M' : 'L'}${sx(point.x)},${sy(point.y)}`).join(' ')} Z`
  const profile = audit.depthProfile
  const profileTop = 46
  const profileHeight = 218
  const depth = Math.max(profile.projectedSectionDepth, 1e-12)
  const py = (value: number) => profileTop + value / depth * profileHeight
  const strainValues = profile.samples.map((sample) => sample.strain)
  const stressValues = profile.samples.map((sample) => sample.stress)
  const strainMin = Math.min(0, ...strainValues)
  const strainMax = Math.max(0, ...strainValues)
  const strainSpan = Math.max(1e-12, strainMax - strainMin)
  const stressMin = Math.min(0, ...stressValues)
  const stressMax = Math.max(0, ...stressValues)
  const stressSpan = Math.max(1e-12, stressMax - stressMin)
  const strainLeft = 397
  const stressLeft = 604
  const chartWidth = 132
  const pxStrain = (value: number) => strainLeft + (value - strainMin) / strainSpan * chartWidth
  const pxStress = (value: number) => stressLeft + (value - stressMin) / stressSpan * chartWidth
  const strainLine = profile.samples.map((sample) => `${pxStrain(sample.strain)},${py(sample.depth)}`).join(' ')
  const stressLine = profile.samples.map((sample) => `${pxStress(sample.stress)},${py(sample.depth)}`).join(' ')
  const normal = { x: profile.normalX, y: profile.normalY }
  const neutralAxis = profile.neutralAxisProjection === null ? null : (() => {
    const worldX = audit.origin.x + normal.x * profile.neutralAxisProjection
    const worldY = audit.origin.y + normal.y * profile.neutralAxisProjection
    const tangent = { x: -normal.y, y: normal.x }
    const span = 3 * Math.hypot(dx, dy)
    return {
      x1: sx(worldX - tangent.x * span), y1: sy(worldY - tangent.y * span),
      x2: sx(worldX + tangent.x * span), y2: sy(worldY + tangent.y * span)
    }
  })()
  const c = profile.neutralAxisDepth
  const outsideLabel = c === null
    ? 'Uniform strain · N.A. at infinity'
    : profile.neutralAxisInsideSection
      ? `c = ${qfmt('length', c)} ${unit('length')}`
      : `N.A. outside section · c ≈ ${qfmt('length', c)} ${unit('length')}`
  const naProfileY = c === null ? null : py(Math.min(depth, Math.max(0, c)))

  return (
    <figure className="pm-calc-figure pm-calc-engineering-figure">
      <svg viewBox="0 0 780 310" role="img" aria-label="Section, neutral axis, compatible strain profile and concrete stress profile">
        <defs><pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" className="pm-calc-concrete-fill" />
          <line x1="0" y1="0" x2="0" y2="8" className="pm-calc-concrete-hatch" />
        </pattern></defs>
        <text x="22" y="22" className="pm-calc-svg-title">SECTION / NEUTRAL AXIS</text>
        {section.solids.map((solid, index) => <path key={index} d={[path(solid.outer), ...solid.holes.map(path)].join(' ')} fill={`url(#${patternId})`} fillRule="evenodd" className="pm-calc-section-shape" />)}
        {audit.kind === 'equivalent-block' ? audit.block.geometry.map((solid, index) => (
          <path key={`block-${index}`} d={[path(solid.outer), ...solid.holes.map(path)].join(' ')} fillRule="evenodd" className="pm-calc-block-zone" />
        )) : null}
        {rebars.map((bar) => <circle key={bar.id} cx={sx(bar.x)} cy={sy(bar.y)} r={Math.max(2.2, bar.dia * scale / 2)} className="pm-calc-rebar" />)}
        <g className="pm-calc-origin">
          <line x1={sx(audit.origin.x) - 6} y1={sy(audit.origin.y)} x2={sx(audit.origin.x) + 6} y2={sy(audit.origin.y)} />
          <line x1={sx(audit.origin.x)} y1={sy(audit.origin.y) - 6} x2={sx(audit.origin.x)} y2={sy(audit.origin.y) + 6} />
        </g>
        {neutralAxis && profile.neutralAxisInsideSection ? <line {...neutralAxis} className="pm-calc-neutral-axis" /> : null}
        {neutralAxis && !profile.neutralAxisInsideSection ? (
          <g className="pm-calc-na-estimate"><line x1="33" y1="286" x2="104" y2="286" /><path d="M33 286 l9 -5 v10 z" /><text x="110" y="290">N.A. beyond drawing</text></g>
        ) : null}
        <text x="22" y="302" className="pm-calc-svg-note">{outsideLabel}</text>

        <text x={strainLeft} y="22" className="pm-calc-svg-title">STRAIN ε(depth)</text>
        <line x1={pxStrain(0)} y1={profileTop} x2={pxStrain(0)} y2={profileTop + profileHeight} className="pm-calc-profile-axis" />
        <line x1={strainLeft} y1={profileTop} x2={strainLeft + chartWidth} y2={profileTop} className="pm-calc-profile-edge" />
        <line x1={strainLeft} y1={profileTop + profileHeight} x2={strainLeft + chartWidth} y2={profileTop + profileHeight} className="pm-calc-profile-edge" />
        <polyline points={strainLine} className="pm-calc-strain-line" />
        <text x={strainLeft} y="285" className="pm-calc-svg-note">εt = {strain(strainValues[strainValues.length - 1])}</text>
        <text x={strainLeft} y="35" className="pm-calc-svg-note">εc = {strain(strainValues[0])}</text>

        <text x={stressLeft} y="22" className="pm-calc-svg-title">CONCRETE STRESS σc(depth)</text>
        <line x1={pxStress(0)} y1={profileTop} x2={pxStress(0)} y2={profileTop + profileHeight} className="pm-calc-profile-axis" />
        <line x1={stressLeft} y1={profileTop} x2={stressLeft + chartWidth} y2={profileTop} className="pm-calc-profile-edge" />
        <line x1={stressLeft} y1={profileTop + profileHeight} x2={stressLeft + chartWidth} y2={profileTop + profileHeight} className="pm-calc-profile-edge" />
        <polyline points={stressLine} className="pm-calc-stress-line" />
        <text x={stressLeft} y="285" className="pm-calc-svg-note">{qfmt('stress', stressMin)} → {qfmt('stress', stressMax)} {unit('stress')}</text>
        {naProfileY === null ? null : (
          <g className="pm-calc-na-profile"><line x1="371" y1={naProfileY} x2="750" y2={naProfileY} /><text x="745" y={naProfileY - 4} textAnchor="end">{profile.neutralAxisInsideSection ? 'ε = 0 / N.A.' : 'N.A. estimated outside'}</text></g>
        )}
      </svg>
      <figcaption>Depth is measured from the extreme compression edge. The red dashed marker is ε = 0; an off-section neutral axis is indicated without shrinking the section drawing. The stress profile is evaluated by the selected kernel, not sketched from a generic shape.</figcaption>
    </figure>
  )
}

const materialValue = (value: number) => {
  if (value !== 0 && Math.abs(value) < 0.01) return strain(value)
  return fmt(value, Math.abs(value) >= 10 ? 2 : 4)
}

const materialUnitLabel = (unit: string) => {
  const normalized = unit.trim()
  return normalized === '' || normalized === '-' || normalized === '–' || normalized === '—' || normalized === '1'
    ? 'dimensionless'
    : normalized
}

const MaterialLaw = ({ title, law }: { title: string; law: MaterialLawAudit }) => {
  const { unit } = useQuantityFormatters()

  const units = [...new Set(law.parameters.map((parameter) => parameter.unit))]
  return (
    <div className="pm-calc-law">
      <h4>{title}</h4><p className="pm-calc-caption">Law parameters and authored equations below retain their declared calculation units.</p>
      <FormulaPanel>
        {law.equations.map((equation) => <Formula key={equation}><span className="pm-calc-math">{equation}</span></Formula>)}
      </FormulaPanel>
      {units.map((unit) => (
        <div className="pm-calc-table-wrap" key={unit}><table>
          <thead><tr><th>Symbol</th><th>Parameter</th><th>Value ({materialUnitLabel(unit)})</th><th>Derivation</th></tr></thead>
          <tbody>{law.parameters.filter((parameter) => parameter.unit === unit).map((parameter, index) => (
            <tr key={`${parameter.symbol}-${index}`}><td>{parameter.symbol}</td><td>{parameter.label}</td><td>{materialValue(parameter.value)}</td><td>{parameter.derivation ?? 'input / profile value'}</td></tr>
          ))}</tbody>
        </table></div>
      ))}
      <p className={`pm-calc-source${law.provenance.reference ? '' : ' is-gap'}`}><b>Basis:</b> {law.provenance.document}{law.provenance.reference ? ` · ${law.provenance.reference}` : ''}. {law.provenance.note}</p>
    </div>
  )
}

const OriginStrainTrace = ({ audit }: { audit: PhysicalPointCalculationAudit }) => {
  const { qfmt, unit } = useQuantityFormatters()
  const trace = audit.depthProfile.originStrainTrace
  const length = (value: number) => String.raw`${texNumber(qfmt('length', value))}\,${texUnit(unit('length'))}`
  const curvature = (value: number) => String.raw`${texNumber(qfmt('curvature', value, 8))}\,${texUnit(unit('curvature'))}`
  const magnitude = trace.kind === 'uniform-strain' ? 0
    : trace.kind === 'controlling-bar-strain' ? trace.curvatureFromCompatibility : trace.curvatureFromDepth
  return <div className="pm-calc-derivation" data-strain-derivation={trace.kind}>
    <h4>{trace.kind === 'controlling-bar-strain' ? 'Criterion → steel strain → compatible state'
      : trace.kind === 'uniform-strain' ? 'Uniform-strain criterion → compatible state'
        : trace.derivation === 'declared-depth-ratio' ? 'Depth criterion → compatible state' : 'Resolved compatible strain state'}</h4>
    <FormulaPanel>
      {trace.kind === 'uniform-strain' ? <Formula><TechnicalEquation
        latex={String.raw`\kappa_x=\kappa_y=0,\qquad c=\infty,\qquad \varepsilon_0=\varepsilon_c=${texStrain(trace.compressionEdgeStrain)}`}
        ariaLabel="Uniform strain criterion determines origin strain and zero curvature" /></Formula>
        : <>
          <Formula><TechnicalEquation latex={String.raw`\varepsilon_c=${texStrain(trace.compressionEdgeStrain)},\qquad u_c=${length(trace.compressionEdgeProjection)}`}
            ariaLabel="Compression edge strain and projection used by this criterion" /></Formula>
          {trace.kind === 'controlling-bar-strain' ? <>
            <Formula><TechnicalEquation latex={trace.yieldStrainBasis === 'effective-yield-stress-over-elastic-modulus'
              ? String.raw`\varepsilon_y=\frac{f_{y,\mathrm{eff}}}{E_s}=\frac{${texNumber(qfmt('stress', trace.effectiveYieldStress))}\,${texUnit(unit('stress'))}}{${texNumber(qfmt('modulus', trace.elasticModulus, 0))}\,${texUnit(unit('modulus'))}}=${texStrain(trace.yieldStrain)}`
              : String.raw`\varepsilon_y=${texStrain(trace.yieldStrain)}\quad\text{(declared material limit)}`}
              ariaLabel="Yield strain basis for the selected controlling bar" /></Formula>
            <Formula><TechnicalEquation latex={String.raw`\varepsilon_{s,\mathrm{req}}=-(${texNumber(fmt(trace.strainRatio, 4))})\varepsilon_y=${texStrain(trace.requestedSteelStrain)},\qquad \varepsilon_s=${texStrain(trace.controllingSteelStrain)}`}
              ariaLabel="Criterion ratio determines the requested and applied controlling bar strain" /></Formula>
            <Formula><TechnicalEquation latex={String.raw`d=u_c-u_s=${length(trace.compressionEdgeProjection)}-(${length(trace.controllingBarProjection)})=${length(trace.compressionEdgeToBarDepth)}`}
              ariaLabel="Distance from the compression edge to the controlling bar" /></Formula>
            <Formula><TechnicalEquation latex={String.raw`\kappa=\frac{\varepsilon_c-\varepsilon_s}{d}=\frac{${texStrain(trace.compressionEdgeStrain)}-(${texStrain(trace.controllingSteelStrain)})}{${length(trace.compressionEdgeToBarDepth)}}=${curvature(trace.curvatureFromCompatibility)}`}
              ariaLabel="Curvature derived from the controlling bar strain compatibility" /></Formula>
            <Formula><TechnicalEquation latex={String.raw`c=\frac{\varepsilon_c}{\kappa}=${length(trace.neutralAxisDepth)}`}
              ariaLabel="Neutral axis depth derived from curvature" /></Formula>
          </> : <>
            <Formula><TechnicalEquation latex={trace.derivation === 'declared-depth-ratio'
              ? String.raw`D=${length(trace.projectedSectionDepth)},\qquad c=\left(\frac{c}{D}\right)D=(${texNumber(fmt(trace.neutralAxisDepthRatio, 4))})(${length(trace.projectedSectionDepth)})=${length(trace.neutralAxisDepth)}`
              : String.raw`c=u_c-u_{\mathrm{NA}}=${length(trace.compressionEdgeProjection)}-(${length(audit.depthProfile.neutralAxisProjection!)})=${length(trace.neutralAxisDepth)}`}
              ariaLabel={trace.derivation === 'declared-depth-ratio' ? 'Neutral axis depth derived from the declared depth ratio' : 'Neutral axis depth of the resolved compatible state'} /></Formula>
            <Formula><TechnicalEquation latex={String.raw`\kappa=\frac{\varepsilon_c}{c}=\frac{${texStrain(trace.compressionEdgeStrain)}}{${length(trace.neutralAxisDepth)}}=${curvature(trace.curvatureFromDepth)}`}
              ariaLabel="Curvature derived from compression edge strain and neutral axis depth" /></Formula>
          </>}
          <Formula><TechnicalEquation latex={String.raw`\varepsilon_0=\varepsilon_c-\kappa u_c=${texStrain(trace.compressionEdgeStrain)}-(${curvature(magnitude)})(${length(trace.compressionEdgeProjection)})=${texStrain(trace.calculatedE0)}`}
            ariaLabel="Origin strain derived from the selected criterion" /></Formula>
          <Formula><TechnicalEquation latex={String.raw`u=n_x x+n_y y,\qquad n_x=${texNumber(fmt(audit.depthProfile.normalX, 8))},\quad n_y=${texNumber(fmt(audit.depthProfile.normalY, 8))}`}
            ariaLabel="Stored strain gradient normal in centroid relative coordinates" /></Formula>
          <Formula><TechnicalEquation latex={String.raw`\begin{aligned}\kappa_x&=\kappa n_y=(${curvature(magnitude)})(${texNumber(fmt(audit.depthProfile.normalY, 8))})=${curvature(audit.state.kx)}\\\kappa_y&=\kappa n_x=(${curvature(magnitude)})(${texNumber(fmt(audit.depthProfile.normalX, 8))})=${curvature(audit.state.ky)}\end{aligned}`}
            ariaLabel="X and Y curvature components derived from the stored strain gradient normal" /></Formula>
        </>}
    </FormulaPanel>
    {trace.kind === 'controlling-bar-strain' && <p>Criterion {trace.criterionLabel}; controlling bar #{trace.controllingRebarId}, steel material {trace.steelMaterialId}. Tension strain is negative.</p>}
    {trace.kind === 'controlling-bar-strain' && trace.strainLimitApplied && <p className="is-warning">The requested steel strain is limited by the material domain; the derivation uses the applied strain.</p>}
    {trace.kind === 'neutral-axis-depth' && trace.derivation === 'resolved-compatible-state' && <p>This is a resolved compatible state, not an independently declared depth-ratio criterion.</p>}
  </div>
}

const RebarLedger = ({ bars, total, component, angleDeg = 0 }: { bars: CalculationAuditRebar[]; total: Resultant; component?: ChartValueComponent; angleDeg?: number }) => {
  const { qfmt, unit, forceValue, momentValue, force, moment } = useQuantityFormatters()
  if (component) {
    const result = (value: Resultant) => component === 'P' ? force(chartResultantValue(value, component, angleDeg)) : moment(chartResultantValue(value, component, angleDeg))
    const weight = componentWeight(component)
    return <>
      <FormulaPanel>
        <Formula><TechnicalEquation latex={String.raw`\varepsilon_{s,i}=\varepsilon_0+\kappa_x y_i+\kappa_y x_i,\qquad F_{i,\mathrm{net}}=[\sigma_s(\varepsilon_{s,i})-\sigma_{c,\mathrm{disp}}(\varepsilon_{s,i})]A_{s,i}`}
          ariaLabel="Bar strain and net bar force from steel minus displaced concrete stress" /></Formula>
        <Formula><TechnicalEquation latex={String.raw`${scalarSymbol(component, 's')}=\sum_i F_{i,\mathrm{net}}\,${weight}`}
          ariaLabel="Selected reinforcement component from net bar forces" /></Formula>
      </FormulaPanel>
      <div className="pm-calc-table-wrap"><table>
        <thead><tr><th>Bar</th><th>x ({unit('length')})</th><th>y ({unit('length')})</th><th>As ({unit('area')})</th><th>εs</th><th>σs ({unit('stress')})</th><th>σc,disp ({unit('stress')})</th>{component !== 'P' && <th>Fnet ({unit('force')})</th>}<th>{component}s</th></tr></thead>
        <tbody>{bars.map(bar => <tr key={bar.id}><td>#{bar.id}</td><td>{qfmt('length', bar.x)}</td><td>{qfmt('length', bar.y)}</td><td>{qfmt('area', bar.area)}</td><td>{strain(bar.strain)}</td><td>{qfmt('stress', bar.steelStress)}</td><td>{qfmt('stress', bar.displacedConcreteStress)}</td>{component !== 'P' && <td>{forceValue(bar.net.P)}</td>}<td>{result(bar.net)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={component === 'P' ? 7 : 8}>Net reinforcement total</td><td>{result(total)}</td></tr></tfoot>
      </table></div>
      <p className="pm-calc-caption">As is the stored or explicitly resolved bar area carried by the analysis audit. No area is recomputed from diameter here. Coordinates are relative to the analysis origin.</p>
    </>
  }
  return (
  <>
    <FormulaPanel>
      <Formula numbered>
        <TechnicalEquation
          latex={String.raw`\varepsilon_s=\varepsilon_0+\kappa_x y+\kappa_y x,\quad F_{s,\mathrm{net}}=[\sigma_s(\varepsilon_s)-\sigma_{c,\mathrm{disp}}(\varepsilon_s)]A_s`}
          ariaLabel="Net reinforcement force from steel stress minus displaced concrete stress"
        />
      </Formula>
      <Formula numbered>
        <TechnicalEquation
          latex={String.raw`P_s=\sum F_{s,\mathrm{net}},\quad M_{sx}=\sum F_{s,\mathrm{net}}y,\quad M_{sy}=\sum F_{s,\mathrm{net}}x`}
          ariaLabel="Reinforcement axial force and moment resultants"
        />
      </Formula>
    </FormulaPanel>
    <div className="pm-calc-table-wrap"><table>
      <thead><tr><th>Bar</th><th>x ({unit('length')})</th><th>y ({unit('length')})</th><th>d ({unit('barDiameter')})</th><th>As ({unit('area')})</th><th>εs</th><th>σs ({unit('stress')})</th><th>−σc,disp ({unit('stress')})</th><th>σnet ({unit('stress')})</th><th>Fnet ({unit('force')})</th><th>Mx ({unit('moment')})</th><th>My ({unit('moment')})</th></tr></thead>
      <tbody>{bars.map((bar) => <tr key={bar.id}>
        <td>#{bar.id}</td><td>{qfmt('length', bar.x)}</td><td>{qfmt('length', bar.y)}</td><td>{qfmt('barDiameter', bar.diameter)}</td><td>{qfmt('area', bar.area)}</td>
        <td>{strain(bar.strain)}</td><td>{qfmt('stress', bar.steelStress)}</td><td>{qfmt('stress', bar.displacedConcreteStress)}</td><td>{qfmt('stress', bar.netStress)}</td>
        <td>{forceValue(bar.net.P)}</td><td>{momentValue(bar.net.Mx)}</td><td>{momentValue(bar.net.My)}</td>
      </tr>)}</tbody>
      <tfoot><tr><td>Σ Rebar</td><td>—</td><td>—</td><td>—</td><td>{qfmt('area', bars.reduce((sum, bar) => sum + bar.area, 0))}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>{forceValue(total.P)}</td><td>{momentValue(total.Mx)}</td><td>{momentValue(total.My)}</td></tr></tfoot>
    </table></div>
  </>
)
}

const ResistanceFactorCalculation = ({ calculation, designBasis }: {
  calculation: CalculationAuditResistanceFactor
  designBasis: DesignBasis
}) => {
  const { qfmt, unit, force } = useQuantityFormatters()
  const n = (value: number) => texNumber(fmt(value, 8))
  return <div className="pm-calc-derivation" data-factor-calculation={calculation.kind} data-factor={calculation.factor}>
    <h4>Resistance factor φ</h4>
    {calculation.kind === 'strain-controlled' ? <>
      <p className="pm-calc-caption">Controlling bar {calculation.controllingRebarId === null ? 'unavailable' : `#${calculation.controllingRebarId}`} · steel material {calculation.steelMaterialId} · {calculation.transverseReinforcement === 'qualifying-spiral' ? 'Qualifying spiral' : 'Other transverse reinforcement'} · {calculation.classification}.</p>
      <FormulaPanel>
        <Formula><TechnicalEquation latex={String.raw`\varepsilon_t=\max_i(0,-\varepsilon_{s,i})=${texStrain(calculation.tensileStrain)}`}
          ariaLabel="Factor controlling tensile strain from the nominal compatible state" /></Formula>
        <Formula><TechnicalEquation latex={String.raw`\varepsilon_y=\frac{f_y}{E_s}=\frac{${texNumber(qfmt('stress', calculation.yieldStress))}\,${texUnit(unit('stress'))}}{${texNumber(qfmt('modulus', calculation.elasticModulus, 0))}\,${texUnit(unit('modulus'))}}=${texStrain(calculation.yieldStrain)}`}
          ariaLabel="Yield strain used for resistance factor classification" /></Formula>
        <Formula><TechnicalEquation latex={String.raw`\phi_c=${n(calculation.compressionFactor)},\qquad \phi_t=${n(calculation.tensionFactor)}`}
          ariaLabel="Active compression and tension resistance factors" /></Formula>
        <Formula><TechnicalEquation latex={calculation.limitRule.type === 'yield-plus-strain'
          ? String.raw`\varepsilon_T=\varepsilon_y+${texStrain(calculation.limitRule.extraStrain)}=${texStrain(calculation.yieldStrain)}+${texStrain(calculation.limitRule.extraStrain)}=${texStrain(calculation.tensionLimit)}`
          : String.raw`\varepsilon_T=\begin{cases}${texStrain(calculation.limitRule.fixedStrainLimit)} & f_y\le ${texNumber(qfmt('stress', calculation.limitRule.yieldStressThreshold))}\,${texUnit(unit('stress'))}\\${n(calculation.limitRule.highStrengthYieldMultiple)}\,\varepsilon_y & f_y>${texNumber(qfmt('stress', calculation.limitRule.yieldStressThreshold))}\,${texUnit(unit('stress'))}\end{cases}=${texStrain(calculation.tensionLimit)}`}
          ariaLabel="Tension controlled strain limit from the active resistance profile" /></Formula>
        {calculation.classificationTolerance > 0 && <Formula><TechnicalEquation latex={String.raw`\delta_\varepsilon=${texStrain(calculation.classificationTolerance)}`}
          ariaLabel="Boundary tolerance used by the factor evaluator" /></Formula>}
        {calculation.classification === 'compression-controlled' ? <Formula><TechnicalEquation
          latex={String.raw`\varepsilon_t\le\varepsilon_y${calculation.classificationTolerance > 0 ? '+\\delta_\\varepsilon' : ''},\qquad\phi=\phi_c=${n(calculation.factor)}`}
          ariaLabel="Compression controlled resistance factor selection" /></Formula>
          : calculation.classification === 'tension-controlled' ? <Formula><TechnicalEquation
            latex={String.raw`\varepsilon_t\ge\varepsilon_T${calculation.classificationTolerance > 0 ? '-\\delta_\\varepsilon' : ''},\qquad\phi=\phi_t=${n(calculation.factor)}`}
            ariaLabel="Tension controlled resistance factor selection" /></Formula>
            : calculation.interpolation && <>
              <Formula><TechnicalEquation latex={String.raw`\varepsilon_y${calculation.classificationTolerance > 0 ? '+\\delta_\\varepsilon' : ''}<\varepsilon_t<\varepsilon_T${calculation.classificationTolerance > 0 ? '-\\delta_\\varepsilon' : ''}`}
                ariaLabel="Transition resistance factor branch selected by the evaluator" /></Formula>
              <Formula><TechnicalEquation latex={String.raw`\Delta\varepsilon=${calculation.minimumTransitionSpan === null ? '\\varepsilon_T-\\varepsilon_y' : `\\max(${texStrain(calculation.minimumTransitionSpan)},\\varepsilon_T-\\varepsilon_y)`}=${texStrain(calculation.interpolation.denominator)}`}
                ariaLabel="Transition denominator used by the resistance factor evaluator" /></Formula>
              <Formula><TechnicalEquation latex={String.raw`r=\frac{\varepsilon_t-\varepsilon_y}{\Delta\varepsilon}=\frac{${texStrain(calculation.tensileStrain)}-(${texStrain(calculation.yieldStrain)})}{${texStrain(calculation.interpolation.denominator)}}=${n(calculation.interpolation.ratio)}`}
                ariaLabel="Resistance factor transition interpolation ratio" /></Formula>
              <Formula><TechnicalEquation latex={String.raw`\phi=\phi_c+(\phi_t-\phi_c)r=${n(calculation.compressionFactor)}+(${n(calculation.tensionFactor)}-${n(calculation.compressionFactor)})(${n(calculation.interpolation.ratio)})=${n(calculation.factor)}`}
                ariaLabel="Transition resistance factor with values substituted" /></Formula>
            </>}
      </FormulaPanel>
    </> : <>
      <p className="pm-calc-caption">AS axial/bending capacity factor · {calculation.compressionClass} · {calculation.classification}.</p>
      <FormulaPanel>
        <Formula><TechnicalEquation latex={String.raw`k_{uo}=${n(calculation.neutralAxisRatio)},\qquad\phi_c=${n(calculation.compressionFactor)},\qquad\phi_t=${n(calculation.tensionFactor)}`}
          ariaLabel="AS capacity factor inputs from the exact block evaluator" /></Formula>
        <Formula><TechnicalEquation latex={String.raw`\phi_b=\min\left(${n(calculation.bending.maximum)},\max\left(${n(calculation.bending.minimum)},${n(calculation.bending.intercept)}-\frac{${n(calculation.bending.numerator)}k_{uo}}{${n(calculation.bending.denominator)}}\right)\right)=${n(calculation.bending.factor)}`}
          ariaLabel="AS bending factor expression and bounds" /></Formula>
        <Formula><TechnicalEquation latex={String.raw`N_n=\text{${force(calculation.nominalAxial)}},\quad N_b=\text{${force(calculation.balancedAxial)}},\quad N_{ut}=\text{${force(calculation.pureTensionAxial)}}`}
          ariaLabel="Nominal balanced and pure tension axial forces used by the AS factor" /></Formula>
        {calculation.classification === 'axial-compression-controlled' ? <Formula><TechnicalEquation
          latex={String.raw`N_n\ge N_b,\qquad\phi=\phi_c=${n(calculation.factor)}`}
          ariaLabel="AS compression controlled factor selection" /></Formula>
          : calculation.classification === 'bending' ? <Formula><TechnicalEquation
            latex={String.raw`N_n=0,\qquad\phi=\phi_b=${n(calculation.factor)}`}
            ariaLabel="AS pure bending factor selection" /></Formula>
            : calculation.axialRatio !== null && <>
              <Formula><TechnicalEquation latex={calculation.classification === 'combined-compression'
                ? String.raw`r_N=\frac{N_n}{N_b}=\frac{\text{${force(calculation.nominalAxial)}}}{\text{${force(calculation.balancedAxial)}}}=${n(calculation.axialRatio)}`
                : String.raw`r_N=\min\left(1,\max\left(0,\frac{N_n}{N_{ut}}\right)\right)=${n(calculation.axialRatio)}`}
                ariaLabel="AS axial interpolation ratio" /></Formula>
              <Formula><TechnicalEquation latex={calculation.classification === 'combined-compression'
                ? String.raw`\phi=\phi_c+(\phi_b-\phi_c)(1-r_N)=${n(calculation.compressionFactor)}+(${n(calculation.bending.factor)}-${n(calculation.compressionFactor)})(1-${n(calculation.axialRatio)})=${n(calculation.factor)}`
                : String.raw`\phi=\phi_b+(\phi_t-\phi_b)r_N=${n(calculation.bending.factor)}+(${n(calculation.tensionFactor)}-${n(calculation.bending.factor)})(${n(calculation.axialRatio)})=${n(calculation.factor)}`}
                ariaLabel="AS combined action resistance factor with values substituted" /></Formula>
            </>}
      </FormulaPanel>
    </>}
    <p className="pm-calc-source">{designBasis.identity.document} · {designBasis.identity.edition}{designBasis.modified ? ` · Modified profile: ${designBasis.overrideReason || 'declared project options'}` : ''}.</p>
  </div>
}

const ResistanceTrace = ({ audit, point, designBasis, component, angleDeg = 0 }: {
  audit: PhysicalPointCalculationAudit
  point: PreviewSurfacePoint
  designBasis: DesignBasis
  component?: ChartValueComponent
  angleDeg?: number
}) => {
  const { force, moment } = useQuantityFormatters()
  const value = (part: Resultant) => component === 'P' ? force(chartResultantValue(part, 'P', angleDeg)) : moment(chartResultantValue(part, component ?? 'M', angleDeg))
  const trace = point.resistance
  const materialReevaluation = audit.stage === 'design' && designBasis.format === 'designMaterialReevaluation'
  const factored = audit.stage === 'design' ? audit.displayedLedger : null
  return (
    <>
      {audit.stage === 'design' && audit.resistanceFactorCalculation && <ResistanceFactorCalculation calculation={audit.resistanceFactorCalculation} designBasis={designBasis} />}
      {audit.stage === 'design' && designBasis.format === 'designMaterialReevaluation' && <div className="pm-calc-derivation" data-material-factor-calculation="true">
        <h4>Design material factors</h4>
        <FormulaPanel>{([designBasis.factors.concrete, designBasis.factors.reinforcement]).map(expression => {
          const symbol = { alphaCc: String.raw`\alpha_{cc}`, gammaC: String.raw`\gamma_c`, gammaS: String.raw`\gamma_s`, phiC: String.raw`\phi_c`, phiS: String.raw`\phi_s` }
          const reference = expression.characteristicSymbol === 'fck' ? 'f_{ck}' : 'f_{yk}'
          const design = expression.designSymbol === 'fcd' ? 'f_{cd}' : 'f_{yd}'
          return <Formula key={expression.designSymbol}><TechnicalEquation
            latex={String.raw`${design}=${reference}${expression.components.map(factor => `${factor.operation === 'multiply' ? '\\cdot' : '/'}${symbol[factor.id]}`).join('')}=${reference}${expression.components.map(factor => `${factor.operation === 'multiply' ? '\\cdot' : '/'}(${texNumber(fmt(factor.value, 6))})`).join('')}`}
            ariaLabel={`Declared ${expression.designSymbol} material factor expression`} /></Formula>
        })}</FormulaPanel>
        <p className="pm-calc-caption">These factors modify the material strengths. Design resultants are reevaluated at the same compatible state; there is no additional global φ multiplier.</p>
      </div>}

      {component ? <div className="pm-calc-table-wrap"><table>
        <thead><tr><th>Contribution</th><th>{chartValueLabel(component, 'nominal')}</th>{factored && <th>{chartValueLabel(component, 'design')}</th>}</tr></thead>
        <tbody>{(['concrete', 'steel'] as const).map(part => <tr key={part}><td>{part === 'concrete' ? 'Concrete' : 'Net reinforcement'}</td><td>{value(audit.nominalReferenceLedger[part])}</td>{factored && <td>{value(factored[part])}</td>}</tr>)}</tbody>
        <tfoot><tr><td>Total resistance</td><td>{value(audit.nominalReferenceLedger.total)}</td>{factored && <td>{value(factored.total)}</td>}</tr></tfoot>
      </table></div> : <ResultantComparisonTable nominal={audit.nominalReferenceLedger} factored={factored} />}
      {component ? <FormulaPanel><Formula><TechnicalEquation
        latex={audit.stage === 'nominal'
          ? String.raw`${stageSymbol(component, 'nominal')}=${scalarSymbol(component, 'c')}+${scalarSymbol(component, 's')}=\text{${value(audit.displayedLedger.total)}}`
          : !materialReevaluation && audit.resistanceFactor !== null
            ? String.raw`${stageSymbol(component, 'design')}=\phi ${stageSymbol(component, 'nominal')}=${texNumber(fmt(audit.resistanceFactor, 8))}\,(\text{${value(audit.nominalReferenceLedger.total)}})=\text{${value(audit.displayedLedger.total)}}`
            : String.raw`${stageSymbol(component, 'design')}=${scalarSymbol(component, 'c')}+${scalarSymbol(component, 's')}=\text{${value(audit.displayedLedger.total)}}`}
        ariaLabel="Selected resistance component assembled with its declared resistance route" /></Formula>
        {audit.stage === 'design' && (materialReevaluation || audit.resistanceFactor === null) && <p className="pm-calc-caption">Contributions use the selected Design material laws; no global φ is applied.</p>}
      </FormulaPanel> : materialReevaluation ? (
        <FormulaPanel><Formula><span className="pm-calc-math">RDesign = ΣR evaluated at the same compatible state with the declared Design material laws</span></Formula></FormulaPanel>
      ) : audit.resistanceFactor === null ? (
        <FormulaPanel><Formula><span className="pm-calc-math">Rshown = Rintegration (the active material laws already represent the selected {audit.stage} stage; no global φ is applied)</span></Formula></FormulaPanel>
      ) : (
        <FormulaPanel><Formula numbered>
          <TechnicalEquation
            latex={String.raw`\mathbf{R}_{\mathrm{design}}=\phi\mathbf{R}_{\mathrm{nominal}}=${fmt(audit.resistanceFactor, 8)}\,\mathbf{R}_{\mathrm{nominal}}`}
            ariaLabel={`Design resistance equals ${fmt(audit.resistanceFactor, 8)} times nominal resistance`}
          />
        </Formula></FormulaPanel>
      )}
      {!component && audit.stage === 'nominal' ? <p className="pm-calc-caption">Factored / Design columns are intentionally unavailable while the table is in Nominal mode.</p> : null}
      {!component && trace ? <div className="pm-calc-facts">
        <Fact label="Classification">{trace.classification}</Fact><Fact label="Stored factor φ">{trace.factor === null ? 'material reevaluation' : fmt(trace.factor, 8)}</Fact>
        {trace.controllingTensileStrain === null ? null : <Fact label="Controlling tensile strain">{strain(trace.controllingTensileStrain)}</Fact>}
        {trace.yieldStrain === null ? null : <Fact label="Yield strain">{strain(trace.yieldStrain)}</Fact>}
      </div> : null}
      {!component && designBasis.format === 'designMaterialReevaluation' ? <div className="pm-calc-factor-list">
        {[...designBasis.factors.concrete.components, ...designBasis.factors.reinforcement.components].map((factor) => (
          <span key={factor.id}><b>{factor.symbol}</b> = {fmt(factor.value, 4)} · {factor.clauseRef}</span>
        ))}
      </div> : null}
      {!component && <><p className="pm-calc-source"><b>Resistance basis:</b> {designBasis.identity.document} · {designBasis.identity.edition} · method {designBasis.identity.methodId}.</p>
      {audit.stage === 'design' ? <div className={`pm-calc-note${audit.nominalReferenceReconciliation.ok ? '' : ' is-error'}`}>
        {audit.nominalReferenceReconciliation.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <p><b>Nominal/reference reconciliation:</b> max normalized Δ = {audit.nominalReferenceReconciliation.relativeMaximum.toExponential(3)}. This verifies the retained pre-Design value at the same compatible state.</p>
      </div> : null}
      <div className={`pm-calc-note${audit.reconciliation.ok ? '' : ' is-error'}`}>
        {audit.reconciliation.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <p><b>Stored-result reconciliation:</b> max normalized Δ = {audit.reconciliation.relativeMaximum.toExponential(3)} (limit {audit.reconciliation.tolerance.toExponential(1)}). The detailed sum {audit.reconciliation.ok ? 'reproduces' : 'does not reproduce'} the point used by the table.</p>
      </div></>}
    </>
  )
}

const AxialCapAudit = ({
  audit,
  stationDefinition,
  title,
  startIndex,
  component,
  angleDeg = 0
}: {
  audit: AxialCapPointCalculationAudit
  stationDefinition: StationDefinition | null
  title: string
  startIndex: number
  component?: ChartValueComponent
  angleDeg?: number
}) => {
  const { unit, forceValue, momentValue, force, moment } = useQuantityFormatters()

  const { trace } = audit
  const comparison = audit.preCap?.comparison
  const source = trace.source
  const crossing = source.crossing
  const capRatio = trace.capRatio === null ? '—' : fmt(trace.capRatio, 6)
  const sourceRows = source.kind === 'source-vertex'
    ? [['Source vertex', source.point] as const]
    : [
        ['Compression-side endpoint', source.compressionSide] as const,
        ['Admissible-side endpoint', source.admissibleSide] as const
      ]
  if (component) {
    const value = (point: Resultant) => component === 'P' ? force(point.P) : moment(chartResultantValue(point, component, angleDeg))
    return <Step index={startIndex} title={`${title}: ${chartValueLabel(component, audit.stage)} at the axial cap`}>
      <FormulaPanel>
        <Formula><TechnicalEquation latex={String.raw`P_{\max}=${trace.capRatio === null ? '' : `${texNumber(capRatio)}\\,(\\text{${force(trace.maximumAxialResistance)}})=`}\text{${force(trace.cap)}}`}
          ariaLabel="Maximum axial resistance from the stored axial cap" /></Formula>
        {comparison && component === 'P' && <Formula><TechnicalEquation latex={String.raw`P_{\mathrm{selected}}=\min(P_{\mathrm{calculated}},P_{\max})=\min(\text{${force(comparison.calculatedAxialResistance)}},\text{${force(comparison.maximumAxialResistance)}})=\text{${force(comparison.selectedAxialResistance)}}`}
          ariaLabel="Selected axial resistance after the maximum axial limit" /></Formula>}
        {source.kind === 'edge-interpolation' && <>
          <Formula><TechnicalEquation latex={String.raw`t=\frac{P_{\max}-P_{\mathrm{compression}}}{P_{\mathrm{admissible}}-P_{\mathrm{compression}}}=\frac{\text{${force(trace.cap)}}-(\text{${force(source.compressionSide.P)}})}{\text{${force(source.admissibleSide.P)}}-(\text{${force(source.compressionSide.P)}})}=${texNumber(fmt(source.interpolationRatio, 8))}`}
            ariaLabel="Stored axial cap edge interpolation ratio" /></Formula>
          <Formula><TechnicalEquation latex={String.raw`${scalarSymbol(component, '\\mathrm{cross}')}=${scalarSymbol(component, '\\mathrm{compression}')}+t(${scalarSymbol(component, '\\mathrm{admissible}')}-${scalarSymbol(component, '\\mathrm{compression}')})=\text{${value(crossing)}}`}
            ariaLabel="Selected component at the axial cap edge crossing" /></Formula>
        </>}
        {source.kind === 'source-vertex' && <Formula><TechnicalEquation latex={String.raw`${scalarSymbol(component, '\\mathrm{cross}')}=${scalarSymbol(component, '\\mathrm{source}')}=\text{${value(crossing)}}`}
          ariaLabel="Selected cap component from an exact source vertex" /></Formula>}
        <Formula><TechnicalEquation latex={String.raw`${scalarSymbol(component, '\\mathrm{cap}')}=${component !== 'P' && trace.projection.kind === 'radial' ? `${texNumber(fmt(trace.projection.factor, 8))}\\,(\\text{${value(crossing)}})=` : ''}\text{${value(audit.displayedLedger.total)}}`}
          ariaLabel="Selected final axial cap component" /></Formula>
      </FormulaPanel>
      <div className="pm-calc-table-wrap"><table><thead><tr><th>Stored cap source</th><th>P</th>{component !== 'P' && <th>{component}</th>}</tr></thead>
        <tbody>{sourceRows.map(([label, point]) => <tr key={label}><td>{label}</td><td>{force(point.P)}</td>{component !== 'P' && <td>{value(point)}</td>}</tr>)}</tbody>
      </table></div>
      <p className="pm-calc-caption">This is the stored geometric cap construction. The cap point has no independently assigned physical strain plane.</p>
      {!audit.reconciliation.ok && <p className="is-error">Cap-result reconciliation failed; this trace cannot reproduce the selected result.</p>}
    </Step>
  }
  return (
    <Step index={startIndex} title={`${title}: maximum axial-force check`}>
      <div className="pm-calc-facts">
        {comparison ? <Fact label="Calculated P before limit">{force(comparison.calculatedAxialResistance)}</Fact> : null}
        <Fact label="Uncapped maximum P">{force(trace.maximumAxialResistance)}</Fact>
        <Fact label="Cap ratio">{capRatio}</Fact>
        <Fact label="Maximum permitted Pmax">{force(trace.cap)}</Fact>
        {comparison ? <Fact label="Selection">{comparison.capGoverns ? 'Pmax governs' : 'Calculated P retained'}</Fact> : null}
        <Fact label="Construction">{trace.projection.kind === 'radial' ? 'Edge crossing + radial projection' : source.kind === 'edge-interpolation' ? 'Edge crossing' : 'Exact source vertex'}</Fact>
      </div>
      <FormulaPanel>
        <Formula><span className="pm-calc-math">
          {trace.capRatio === null
            ? <>Pmax = {force(trace.cap)} (the source surface has no nonzero scalar reference for a ratio)</>
            : <>Pmax = αcap·Puncapped,max = {capRatio}·{force(trace.maximumAxialResistance)} = {force(trace.cap)}</>}
        </span></Formula>
        {comparison ? <Formula><span className="pm-calc-math">
          Pselected = min(Pcalculated, Pmax) = min({force(comparison.calculatedAxialResistance)}, {force(comparison.maximumAxialResistance)}) = {force(comparison.selectedAxialResistance)}; {comparison.capGoverns ? 'Pmax governs' : 'Pcalculated is retained'}
        </span></Formula> : null}
        {source.kind === 'edge-interpolation' ? <>
          <Formula><span className="pm-calc-math">t = (Pmax − Pcompression)/(Padmissible − Pcompression) = {fmt(source.interpolationRatio, 8)}</span></Formula>
          <Formula><span className="pm-calc-math">Rcross = Rcompression + t(Radmissible − Rcompression) = ({force(crossing.P)}, {moment(crossing.Mx)}, {moment(crossing.My)})</span></Formula>
        </> : <Formula><span className="pm-calc-math">Rcross = Rsource = ({force(crossing.P)}, {moment(crossing.Mx)}, {moment(crossing.My)})</span></Formula>}
        {trace.projection.kind === 'radial' ? <>
          <Formula><span className="pm-calc-math">q = sring / scross = {fmt(trace.projection.sourceStationCoordinate, 6)} / {fmt(trace.projection.crossingStationCoordinate, 6)} = {fmt(trace.projection.factor, 8)}</span></Formula>
          <Formula><span className="pm-calc-math">Rcap = (Pcap, q·Mx,cross, q·My,cross) = ({force(audit.displayedLedger.total.P)}, {moment(audit.displayedLedger.total.Mx)}, {moment(audit.displayedLedger.total.My)})</span></Formula>
        </> : <Formula><span className="pm-calc-math">Rcap = Rcross = ({force(audit.displayedLedger.total.P)}, {moment(audit.displayedLedger.total.Mx)}, {moment(audit.displayedLedger.total.My)})</span></Formula>}
      </FormulaPanel>
      <div className="pm-calc-table-wrap"><table>
        <thead><tr><th>Cap source</th><th>P ({unit('force')})</th><th>Mx ({unit('moment')})</th><th>My ({unit('moment')})</th></tr></thead>
        <tbody>
          {sourceRows.map(([label, point]) => <tr key={label}><td>{label}</td><td>{forceValue(point.P)}</td><td>{momentValue(point.Mx)}</td><td>{momentValue(point.My)}</td></tr>)}
          <tr><td>Crossing at Pcap</td><td>{forceValue(crossing.P)}</td><td>{momentValue(crossing.Mx)}</td><td>{momentValue(crossing.My)}</td></tr>
        </tbody>
        <tfoot><tr><td>Stored cap point</td><td>{forceValue(audit.displayedLedger.total.P)}</td><td>{momentValue(audit.displayedLedger.total.Mx)}</td><td>{momentValue(audit.displayedLedger.total.My)}</td></tr></tfoot>
      </table></div>
      <p className="pm-calc-caption">
        {stationDefinition
          ? `${stationDefinitionLabel(stationDefinition)} identifies the structured cap ring; it does not supply a physical strain plane after the cap operation.`
          : 'This point belongs to the geometric cap face and therefore has no unique compatible strain plane.'}
      </p>
      <div className={`pm-calc-note${audit.reconciliation.ok ? '' : ' is-error'}`}>
        {audit.reconciliation.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <p><b>Cap-result reconciliation:</b> max normalized Δ = {audit.reconciliation.relativeMaximum.toExponential(3)} (limit {audit.reconciliation.tolerance.toExponential(1)}). The cap equations {audit.reconciliation.ok ? 'reproduce' : 'do not reproduce'} the point used by the table.</p>
      </div>
    </Step>
  )
}

const PhysicalAudit = ({ audit, point, stationDefinition, exportKey, title, section, rebars, designBasis, patternId, exportingConcreteKey, onExportConcreteExcel, component, angleDeg = 0, startIndex = 3 }: {
  audit: PointCalculationAudit
  point: PreviewSurfacePoint
  stationDefinition: StationDefinition | null
  exportKey: string
  title: string
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  designBasis: DesignBasis
  patternId: string
  exportingConcreteKey: string | null
  onExportConcreteExcel: Props['onExportConcreteExcel']
  startIndex?: number
  component?: ChartValueComponent
  angleDeg?: number
}) => {
  const { qfmt, unit, force, moment } = useQuantityFormatters()

  if (audit.kind === 'unavailable') return (
    <Step index={startIndex} title={`${title}: physical calculation evidence`}>
      <div className="pm-calc-note is-error"><AlertTriangle size={16} /><p>{audit.message}</p></div>
    </Step>
  )
  if (audit.kind === 'axial-cap') return (
    <>
      {audit.preCap ? <PhysicalAudit
        component={component}
        angleDeg={angleDeg}
        audit={audit.preCap.audit}
        point={audit.preCap.point}
        stationDefinition={stationDefinition}
        exportKey={`${exportKey}-pre-cap`}
        title={`${title} · before maximum-P limit`}
        section={section}
        rebars={rebars}
        designBasis={designBasis}
        patternId={`${patternId}-pre-cap`}
        exportingConcreteKey={exportingConcreteKey}
        onExportConcreteExcel={onExportConcreteExcel}
        startIndex={startIndex}
      /> : null}
      <AxialCapAudit
        audit={audit}
        component={component}
        angleDeg={angleDeg}
        stationDefinition={stationDefinition}
        title={title}
        startIndex={startIndex + (audit.preCap ? calculationAuditStepCount(audit.preCap.audit, Boolean(component)) : 0)}
      />
    </>
  )
  if (component) {
    const selected = (value: Resultant) => component === 'P'
      ? force(chartResultantValue(value, component, angleDeg))
      : moment(chartResultantValue(value, component, angleDeg))
    const weight = componentWeight(component)
    return <Step index={startIndex} title={title}>
      <OriginStrainTrace audit={audit} />
      <FormulaPanel><Formula><TechnicalEquation latex={String.raw`\varepsilon(x,y)=\varepsilon_0+\kappa_x y+\kappa_y x`}
        ariaLabel="Compatible strain plane in centroid relative coordinates" /></Formula></FormulaPanel>
      <ConcreteSummary audit={audit} component={component} angleDeg={angleDeg} />
      <FormulaPanel><Formula><TechnicalEquation latex={String.raw`F_{i,\mathrm{net}}=(\sigma_{s,i}-\sigma_{c,\mathrm{disp},i})A_{s,i}`}
        ariaLabel="Net reinforcement force uses stored bar area" /></Formula>
        <Formula><TechnicalEquation latex={String.raw`${scalarSymbol(component, 's')}=\sum_i F_{i,\mathrm{net}}\,${weight}=\text{${selected(audit.mechanicalLedger.steel)}}`}
          ariaLabel="Selected reinforcement contribution" /></Formula></FormulaPanel>
      <details className="pm-calc-details"><summary data-detail-label="Calculation terms">Reinforcement terms ({audit.rebars.length} bars)</summary><RebarLedger bars={audit.rebars} total={audit.mechanicalLedger.steel} component={component} angleDeg={angleDeg} /></details>
      <ResistanceTrace audit={audit} point={point} designBasis={designBasis} component={component} angleDeg={angleDeg} />
    </Step>
  }
  return (
    <>
      <Step index={startIndex} title={`${title}: compatible strain and stress state`}>
        <div className="pm-calc-facts">
          <Fact label={<><span className="pm-calc-math">ε₀</span> at analysis origin</>}>{strain(audit.depthProfile.originStrainTrace.calculatedE0)}</Fact>
          <Fact label="κx / κy">{qfmt('curvature', audit.state.kx, 8)} / {qfmt('curvature', audit.state.ky, 8)} {unit('curvature')}</Fact>
          <Fact label="Projected depth D">{qfmt('length', audit.depthProfile.projectedSectionDepth)} {unit('length')}</Fact>
          <Fact label="Neutral-axis depth c">{audit.depthProfile.neutralAxisDepth === null ? '∞ (uniform strain)' : `${qfmt('length', audit.depthProfile.neutralAxisDepth)} ${unit('length')}${audit.depthProfile.neutralAxisInsideSection ? '' : ' · outside section'}`}</Fact>
        </div>
        <OriginStrainTrace audit={audit} />
        <FormulaPanel><Formula numbered>
          <TechnicalEquation
            latex={String.raw`\varepsilon(x,y)=\varepsilon_0+\kappa_x(y-y_0)+\kappa_y(x-x_0)`}
            ariaLabel="Compatible strain plane equation"
          />
        </Formula></FormulaPanel>
        {!component && <CalculationDiagram section={section} rebars={rebars} audit={audit} patternId={patternId} />}
      </Step>

      <Step
        index={startIndex + 1}
        title={`${title}: concrete detail`}
        action={component ? undefined : <button
          type="button"
          className="ws-action pm-calc-excel-button"
          disabled={exportingConcreteKey !== null}
          onClick={() => void onExportConcreteExcel({
            key: exportKey,
            label: title,
            point,
            stationDefinition
          })}
          title={audit.kind === 'stress-strain'
            ? 'Download every concrete mesh point and its Pc, Mcx and Mcy formulas'
            : 'Download the exact clipped-block edge calculation'}
        >
          <span>Excel</span>
          {exportingConcreteKey === exportKey
            ? <Loader2 size={15} className="pm-spin" />
            : <TransferIcon direction="export" />}
        </button>}
      >
        <ConcreteSummary audit={audit} component={component} angleDeg={angleDeg} />
      </Step>

      <Step index={startIndex + 2} title={`${title}: reinforcement and displaced concrete`}>
        <RebarLedger bars={audit.rebars} total={audit.mechanicalLedger.steel} component={component} angleDeg={angleDeg} />
        {!component && <p className="pm-calc-caption">These bar rows are the mechanics-stage net reinforcement ledger. The final comparison table is authoritative for the Nominal/reference and displayed Design resultants and applies any global resultant factor exactly once.</p>}
        {audit.steelLaws.map((entry) => <details className="pm-calc-details" key={entry.materialId}><summary>Steel material {entry.materialId}: {entry.name}</summary><MaterialLaw title="Steel law and active coefficients" law={entry.law} /></details>)}
      </Step>

      <Step index={startIndex + 3} title={`${title}: resultant assembly and resistance stage`}>
        <ResistanceTrace audit={audit} point={point} designBasis={designBasis} component={component} angleDeg={angleDeg} />
      </Step>
    </>
  )
}

const IntegrationModel = ({ surface, geometricCap }: { surface: PreviewSurface; geometricCap: boolean }) => {
  const { qfmt, unit } = useQuantityFormatters()
  return (
  <Step index={2} title="Mesh / integration summary">
    {surface.mechanics === 'equivalent-rectangular-block' ? (
      <div className="pm-calc-note"><CheckCircle2 size={16} /><p><b>Exact block clipping.</b> No concrete fibre mesh is used. The physical section and holes are clipped against the active block half-plane; its exact polygon area and centroid are shown in the point calculation below.</p></div>
    ) : (
      <>
        <div className="pm-calc-facts">
          <Fact label="Base cell h">{qfmt('length', surface.mesh.cellSize)} {unit('length')}</Fact><Fact label="Clipped cells">{fmt(surface.mesh.cells, 0)}</Fact>
          <Fact label="Exact / integrated area">{qfmt('area', surface.mesh.exact.area)} / {qfmt('area', surface.mesh.meshed.area)} {unit('area')}</Fact><Fact label="Area difference">{qfmt('area', surface.mesh.areaError)} {unit('area')}</Fact>
        </div>
        <p className="pm-calc-caption">The exact boundary remains authoritative for section properties and extreme fibres. {geometricCap
          ? 'The retained physical criterion state is integrated in full below; the final cap face is then audited through its source crossing without inventing another strain state.'
          : 'Detailed integration points are available in the Excel audit.'}</p>
      </>
    )}
  </Step>
)
}

const FixedPSchematic = ({ row }: { row: ChartTableFixedPRow }) => {
  const { force } = useQuantityFormatters()

  const bracket = row.evidence.bracket
  if (!bracket) return null
  return (
    <figure className="pm-calc-figure pm-calc-fixedp-figure"><svg viewBox="0 0 520 145" role="img" aria-label="Fixed axial force interpolation bracket">
      <line x1="76" y1="20" x2="76" y2="122" className="pm-calc-axis" /><line x1="48" y1="108" x2="476" y2="108" className="pm-calc-axis" />
      <line x1="105" y1="116" x2="435" y2="35" className="pm-calc-interpolation-line" />
      <circle cx="105" cy="116" r="5" className="pm-calc-bracket-point" /><circle cx="435" cy="35" r="5" className="pm-calc-bracket-point" />
      <circle cx={105 + 330 * bracket.ratio} cy={116 - 81 * bracket.ratio} r="6" className="pm-calc-selected-point" />
      <text x="111" y="134">P below</text><text x="440" y="31">P above</text><text x="458" y="126">M</text><text x="60" y="18">P</text>
    </svg><figcaption>{bracket.exact ? 'Selected P is an exact stored station.' : 'The table point is the intersection of Pselected with one stored meridian edge.'}</figcaption></figure>
  )
}

const calculationAuditStepCount = (audit: PointCalculationAudit | undefined, compact = false): number => {
  if (!audit || audit.kind === 'unavailable') return 1
  if (audit.kind === 'axial-cap') return 1 + (audit.preCap ? calculationAuditStepCount(audit.preCap.audit, compact) : 0)
  return compact ? 1 : 4
}

const VerticalResult = ({ row, index, component }: { row: ChartTableVerticalRow; index: number; component?: ChartValueComponent }) => {
  const { force, moment } = useQuantityFormatters()

  const selected = row.evidence.stage === 'design' ? row.design : row.nominal
  if (!selected) return null
  if (component) {
    const value = chartTableValue(row, component)
    if (value === null) return null
    const label = chartValueLabel(component, row.evidence.stage)
    return <Step index={index} title={`Value shown in the table: ${label}`}>
      {component === 'M' && <FormulaPanel>
        <Formula><TechnicalEquation latex={String.raw`M_{\beta}=M_x\cos\beta+M_y\sin\beta,\qquad \beta=${texNumber(fmt(row.evidence.angleDeg))}^{\circ}`}
          ariaLabel="Selected moment projection onto the direct meridian" /></Formula>
        <Formula><TechnicalEquation latex={String.raw`M_{\beta}=(\text{${moment(row.evidence.point.Mx)}})\cos(${texNumber(fmt(row.evidence.angleDeg))}^{\circ})+(\text{${moment(row.evidence.point.My)}})\sin(${texNumber(fmt(row.evidence.angleDeg))}^{\circ})=\text{${moment(value)}}`}
          ariaLabel="Projected moment with the stored component values substituted" /></Formula>
      </FormulaPanel>}
      <div className="pm-calc-final" data-result-component={component} data-canonical-value={value} data-stage={row.evidence.stage}><Fact label={label}>{component === 'P' ? force(value) : moment(value)}</Fact></div>
    </Step>
  }
  return <Step index={index} title="Value shown in the Vertical table">
    <FormulaPanel><Formula id="equation-projected-moment" numbered>
      <TechnicalEquation
        latex={String.raw`M_{\beta}=M_x\cos\beta+M_y\sin\beta,\qquad \beta=${fmt(row.evidence.angleDeg)}^{\circ}`}
        ariaLabel={`Projected moment at beta ${fmt(row.evidence.angleDeg)} degrees`}
      />
    </Formula></FormulaPanel>
    <div className="pm-calc-final"><Fact label={`${row.evidence.stage} P`}>{force(selected.total.P)}</Fact><Fact label={`${row.evidence.stage} Mβ`}>{moment(selected.total.M)}</Fact></div>
  </Step>
}

const FixedPResult = ({ row, index, component }: { row: ChartTableFixedPRow; index: number; component?: ChartValueComponent }) => {
  const { unit, momentValue, force, moment } = useQuantityFormatters()

  const { bracket, fixedP, sample, stage } = row.evidence
  const selected = stage === 'design' ? row.design : row.nominal
  if (component) {
    const value = chartTableValue(row, component)
    if (value === null) return null
    const label = chartValueLabel(component, stage)
    return <Step index={index} title={`Fixed-P interpolation to ${label}`}>
      {!bracket ? <p className="is-error">The stored interpolation bracket is unavailable.</p> : <>
        <FormulaPanel>
          {bracket.exact ? <Formula><TechnicalEquation latex={String.raw`P_{\mathrm{selected}}=P_{\mathrm{station}}=\text{${force(fixedP)}},\qquad ${stageSymbol(component, stage)}=\text{${moment(value)}}`}
            ariaLabel="Exact stored Fixed P station component" /></Formula> : <>
            <Formula><TechnicalEquation latex={String.raw`t=\frac{P_{\mathrm{selected}}-P_{\mathrm{below}}}{P_{\mathrm{above}}-P_{\mathrm{below}}}=\frac{\text{${force(fixedP)}}-(\text{${force(bracket.below.P)}})}{\text{${force(bracket.above.P)}}-(\text{${force(bracket.below.P)}})}=${texNumber(fmt(bracket.ratio, 8))}`}
              ariaLabel="Fixed P interpolation ratio with stored axial forces" /></Formula>
            <Formula><TechnicalEquation latex={String.raw`${stageSymbol(component, stage)}=${scalarSymbol(component, '\\mathrm{below}')}+t(${scalarSymbol(component, '\\mathrm{above}')}-${scalarSymbol(component, '\\mathrm{below}')})`}
              ariaLabel="Interpolation of only the selected moment component" /></Formula>
            <Formula><TechnicalEquation latex={String.raw`${stageSymbol(component, stage)}=(\text{${moment(chartResultantValue(bracket.below, component, row.angleDeg))}})+${texNumber(fmt(bracket.ratio, 8))}\,[(\text{${moment(chartResultantValue(bracket.above, component, row.angleDeg))}})-(\text{${moment(chartResultantValue(bracket.below, component, row.angleDeg))}})]=\text{${moment(value)}}`}
              ariaLabel="Selected Fixed P moment with stored interpolation values substituted" /></Formula>
          </>}
        </FormulaPanel>
        <div className="pm-calc-final" data-result-component={component} data-canonical-value={value} data-stage={stage}><Fact label={label}>{moment(value)}</Fact></div>
      </>}
      <p className="pm-calc-caption">The selected component uses only the stored endpoints and interpolation ratio. No strain plane is assigned to the interpolated point.</p>
    </Step>
  }
  return <Step index={index} title="Fixed-P interpolation and value shown in the table">
    {!bracket ? <div className="pm-calc-note is-error"><AlertTriangle size={16} /><p>No same-meridian bracket is attached to this row; interpolation evidence is unavailable.</p></div> : bracket.exact ? (
      <FormulaPanel><Formula><span className="pm-calc-math">Pselected = Pstation; Mx = {moment(sample.Mx)}; My = {moment(sample.My)}</span></Formula></FormulaPanel>
    ) : <>
      <FormulaPanel>
        <Formula id="equation-fixed-p-interpolation-ratio" numbered>
          <TechnicalEquation
            latex={String.raw`t=\frac{P_{\mathrm{selected}}-P_{\mathrm{below}}}{P_{\mathrm{above}}-P_{\mathrm{below}}}=${fmt(bracket.ratio, 6)}`}
            ariaLabel={`Fixed P interpolation ratio equals ${fmt(bracket.ratio, 6)}`}
          />
        </Formula>
        <Formula id="equation-fixed-p-mx" numbered>
          <TechnicalEquation
            latex={String.raw`M_x=M_{x,\mathrm{below}}+t(M_{x,\mathrm{above}}-M_{x,\mathrm{below}})=${momentValue(sample.Mx)}\ \mathrm{${unit('moment').replace('·', String.raw`\,`)}}`}
            ariaLabel={`Interpolated M x equals ${moment(sample.Mx)}`}
          />
        </Formula>
        <Formula id="equation-fixed-p-my" numbered>
          <TechnicalEquation
            latex={String.raw`M_y=M_{y,\mathrm{below}}+t(M_{y,\mathrm{above}}-M_{y,\mathrm{below}})=${momentValue(sample.My)}\ \mathrm{${unit('moment').replace('·', String.raw`\,`)}}`}
            ariaLabel={`Interpolated M y equals ${moment(sample.My)}`}
          />
        </Formula>
      </FormulaPanel>
    </>}
    {selected ? <div className="pm-calc-final"><Fact label={`${stage} P`}>{force(sample.P)}</Fact><Fact label={`${stage} Mx`}>{moment(selected.Mx)}</Fact><Fact label={`${stage} My`}>{moment(selected.My)}</Fact></div> : null}
    <p className="pm-calc-caption">This contour point has no invented strain plane. Each endpoint is audited independently above; a cap-face endpoint is traced through its stored geometric cap construction.</p>
  </Step>
}

export function ChartCalculationDialog({ row, rows, source, resistanceStage, valueComponent, summary, surface, projectName, section, rebars, materialStore, designBasis, exportingConcreteKey, exportingCalculationTrace, exportError, onExportConcreteExcel, onExportCalculationTraceExcel, onSourceChange, onResistanceStageChange, onRowChange, onClose }: Props) {
  const { qfmt, unit, force } = useQuantityFormatters()

  const patternId = useId().replace(/:/g, '')
  const stage = row?.evidence.stage ?? resistanceStage
  const [auditState, setAuditState] = useState<
    | { request: object; status: 'ready'; items: Map<string, PointCalculationAudit> }
    | { request: object; status: 'failed'; message: string }
    | null
  >(null)
  const requestedPoints = useMemo(() => {
    if (!row) return []
    if (row.kind === 'vertical') return [{ key: 'selected', point: row.evidence.point, stationDefinition: row.evidence.station?.definition ?? null }]
    const bracket = row.evidence.bracket
    if (!bracket) return []
    return bracket.exact
      ? [{ key: 'below', point: bracket.below, stationDefinition: row.evidence.belowStation?.definition ?? null }]
      : [
          { key: 'below', point: bracket.below, stationDefinition: row.evidence.belowStation?.definition ?? null },
          { key: 'above', point: bracket.above, stationDefinition: row.evidence.aboveStation?.definition ?? null }
        ]
  }, [row])

  const auditRequest = useMemo(() => ({
    calculationProfileId: surface.calculationProfileId,
    section, rebars, materialStore, analysisOptions: surface.analysisOptions, designBasis, stage,
    points: requestedPoints
  }), [designBasis, materialStore, rebars, requestedPoints, section, stage, surface.analysisOptions, surface.calculationProfileId])
  const currentAudit = auditState?.request === auditRequest ? auditState : null
  const audits = currentAudit?.status === 'ready' ? currentAudit.items : new Map<string, PointCalculationAudit>()
  const auditError = !surface.calculationProfileId
    ? 'The surface has no calculation-profile identity, so a mechanics-specific audit cannot be selected safely.'
    : currentAudit?.status === 'failed' ? currentAudit.message : null
  const loading = Boolean(surface.calculationProfileId && requestedPoints.length > 0 && !currentAudit)

  useEffect(() => {
    const controller = new AbortController()
    if (!auditRequest.calculationProfileId || auditRequest.points.length === 0) return () => controller.abort()
    void buildPointAuditsAsync({ ...auditRequest, calculationProfileId: auditRequest.calculationProfileId }, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        const matches = items.length === auditRequest.points.length && auditRequest.points.every(point => {
          const audit = items.find(item => item.key === point.key)?.audit
          return audit?.pointId === point.point.id && audit.stage === auditRequest.stage
        })
        setAuditState(matches
          ? { request: auditRequest, status: 'ready', items: new Map(items.map(item => [item.key, item.audit])) }
          : { request: auditRequest, status: 'failed', message: 'The returned audit does not match the selected point and resistance stage.' })
      }).catch((error: unknown) => {
        if (controller.signal.aborted || isAnalysisAbort(error)) return
        setAuditState({ request: auditRequest, status: 'failed', message: error instanceof Error ? error.message : String(error) })
      })
    return () => controller.abort()
  }, [auditRequest])

  const basicConcrete = materialStore.concrete
  const valueReady = requestedPoints.length > 0 && requestedPoints.every(point => isReconciledPointAudit(audits.get(point.key)))
  const selectedAudit = audits.get('selected')
  const belowAudit = audits.get('below')
  const aboveAudit = audits.get('above')
  const belowStartIndex = valueComponent ? 2 : 4
  const aboveStartIndex = belowStartIndex + calculationAuditStepCount(belowAudit, Boolean(valueComponent))
  const fixedPResultIndex = aboveStartIndex + (row?.kind === 'fixedP' && !row.evidence.bracket?.exact
    ? calculationAuditStepCount(aboveAudit, Boolean(valueComponent))
    : 0)
  return (
    <CalculationDialogFrame
      title={valueComponent ? `CALCULATION TRACE · ${chartValueLabel(valueComponent, stage)}` : 'CALCULATION TRACE'}
      closeLabel="Close calculation details"
      bodyKey={`${stage}-${row?.key ?? 'empty'}-${valueComponent ?? 'detail'}`}
      defaultView="document"
      compact={Boolean(valueComponent)}
      description={valueComponent && row ? `${stage === 'design' ? 'Design' : 'Nominal'} · ${row.kind === 'vertical' ? 'Vertical' : 'Fixed-P'} · Row ${row.index} · ${row.kind === 'vertical' ? row.criterion : `β ${fmt(row.angleDeg, 3)}° · branch ${row.branch}`}` : undefined}
      onClose={onClose}
      headerAction={valueComponent ? undefined : <button
        type="button"
        className="ws-action pm-calc-excel-button pm-calc-excel-button--report"
        disabled={exportingCalculationTrace || requestedPoints.length === 0 || !surface.calculationProfileId}
        onClick={() => void onExportCalculationTraceExcel()}
        title="Download the complete formula-linked audit for this selected result row"
      >
        <span>Excel</span>
        {exportingCalculationTrace ? <Loader2 size={15} className="pm-spin" /> : <TransferIcon direction="export" />}
      </button>}
      controls={valueComponent ? null : <div className="pm-calculation-dialog__selectors" aria-label="Calculation trace selection">
            <label className="pm-calculation-dialog__selector">
              <span>View</span>
              <select
                aria-label="Calculation trace view"
                value={source}
                disabled={valueComponent !== null}
                onChange={(event) => onSourceChange(event.target.value as ChartTableSource)}
              >
                <option value="vertical">Vertical</option>
                <option value="fixedP">Fixed-P</option>
              </select>
            </label>
            <label className="pm-calculation-dialog__selector">
              <span>Stage</span>
              <select
                aria-label="Calculation trace resistance stage"
                value={resistanceStage}
                onChange={(event) => onResistanceStageChange(event.target.value as ChartTableResistanceStage)}
              >
                <option value="design">Design</option>
                <option value="nominal">Nominal</option>
              </select>
            </label>
            <label className="pm-calculation-dialog__selector pm-calculation-dialog__selector--row">
              <span>Criteria</span>
              <select
                aria-label="Calculation trace criteria"
                value={row?.key ?? ''}
                disabled={rows.length === 0}
                onChange={(event) => onRowChange(event.target.value)}
              >
                {rows.length === 0 ? <option value="">No criteria available</option> : null}
                {rows.length > 0 && !row ? <option value="" disabled>Selected criterion unavailable in this stage</option> : null}
                {rows.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.kind === 'vertical'
                      ? `${option.index}. ${option.criterion}`
                      : `${option.index}. β ${fmt(option.angleDeg, 3)}° · branch ${option.branch}`}
                  </option>
                ))}
              </select>
            </label>
          </div>}
    >
          {exportError ? <div className="pm-calc-note is-error" role="alert"><AlertTriangle size={16} /><p><b>Export failed:</b> {exportError}</p></div> : null}
          {!row ? (
            <div className="pm-calc-note is-warning"><AlertTriangle size={16} /><p>{rows.length === 0
              ? 'No calculation criteria are available for the selected View and Stage. The dialog remains open so another selection can be made.'
              : 'The selected criterion is not present in this resistance stage after geometric surface processing. Choose another criterion or switch back to restore the previous selection; no different calculation has been substituted.'}</p></div>
          ) : <>
          {!valueComponent && <><Step index={1} title="Basic inputs">
            <div className="pm-calc-facts">
              <Fact label="Project / section">{projectName || 'Untitled project'} · {section.name}</Fact>
              <Fact label="Section">Ac = {qfmt('area', summary.concreteArea)} {unit('area')} · {summary.rebarCount} bars · As = {qfmt('area', summary.steelArea)} {unit('area')}</Fact>
              {surface.mechanics === 'stress-strain-integration' ? (
                <Fact label="Concrete">{basicConcrete.name} · fck = {qfmt('stress', basicConcrete.fck)} {unit('stress')} · {basicConcrete.stressStrain.type} · εcu = {strain(basicConcrete.limits.epsCu)}</Fact>
              ) : (
                <Fact label="Concrete">{basicConcrete.name} · fck = {qfmt('stress', basicConcrete.fck)} {unit('stress')} · equivalent block · εcu = {strain(basicConcrete.limits.epsCu)}</Fact>
              )}
              <Fact label="Steel">{materialStore.steel.map((steel) => `${steel.name}: fy=${qfmt('stress', steel.fy)} ${unit('stress')}, Es=${qfmt('modulus', steel.elasticModulus, 0)} ${unit('modulus')}`).join(' · ')}</Fact>
              <Fact label="Design basis">{designBasis.identity.document.split(' · ')[0]}</Fact>
            </div>
          </Step>

          <IntegrationModel surface={surface} geometricCap={requestedPoints.some((item) => item.point.surfaceRole === 'axial-cap')} /></>}

          {loading ? <div className="pm-calc-loading"><Loader2 size={17} className="pm-spin" /><span>Re-evaluating the selected stored state in the analysis worker and reconciling every contribution…</span></div> : null}
          {auditError ? <div className="pm-calc-note is-error"><AlertTriangle size={16} /><p><b>Blocking audit failure:</b> {auditError}</p></div> : null}
          {valueComponent && !loading && !auditError && !valueReady && <div className="pm-calc-note is-error" role="alert"><AlertTriangle size={16} /><p>The selected value has unavailable or unreconciled source evidence. A completed derivation cannot be published.</p></div>}

          {!loading && !auditError && row.kind === 'vertical' && selectedAudit ? <>
            <PhysicalAudit startIndex={valueComponent ? 1 : 3} component={valueComponent ?? undefined} angleDeg={row.evidence.angleDeg} audit={selectedAudit} point={row.evidence.point} stationDefinition={row.evidence.station?.definition ?? null} exportKey="selected" title="Selected Vertical station" section={section} rebars={rebars} designBasis={designBasis} patternId={`${patternId}-vertical`} exportingConcreteKey={exportingConcreteKey} onExportConcreteExcel={onExportConcreteExcel} />
            {(!valueComponent || valueReady) && <VerticalResult component={valueComponent ?? undefined} row={row} index={(valueComponent ? 1 : 3) + calculationAuditStepCount(selectedAudit, Boolean(valueComponent))} />}
          </> : null}

          {!loading && !auditError && row.kind === 'fixedP' ? <>
            <Step index={valueComponent ? 1 : 3} title="Fixed-P row definition and source brackets">
              <div className="pm-calc-facts"><Fact label="Selected axial force">{force(row.evidence.fixedP)}</Fact><Fact label="Meridian β / branch">{fmt(row.angleDeg)}° / {row.branch}</Fact></div>
              {!valueComponent && <FixedPSchematic row={row} />}
              <p className="pm-calc-caption">Fixed-P is a surface-edge intersection. Its endpoint traces remain separate; physical endpoints show their compatible state, while cap-face endpoints show the exact geometric cap operation.</p>
            </Step>
            {row.evidence.bracket && belowAudit ? <PhysicalAudit component={valueComponent ?? undefined} angleDeg={row.angleDeg} audit={belowAudit} point={row.evidence.bracket.below} stationDefinition={row.evidence.belowStation?.definition ?? null} exportKey="below" title={`Lower endpoint · ${row.evidence.belowStation ? stationDefinitionLabel(row.evidence.belowStation.definition) : row.evidence.bracket.below.stationId ?? 'physical state'}`} section={section} rebars={rebars} designBasis={designBasis} patternId={`${patternId}-below`} exportingConcreteKey={exportingConcreteKey} onExportConcreteExcel={onExportConcreteExcel} startIndex={belowStartIndex} /> : null}
            {row.evidence.bracket && !row.evidence.bracket.exact && aboveAudit ? <PhysicalAudit component={valueComponent ?? undefined} angleDeg={row.angleDeg} audit={aboveAudit} point={row.evidence.bracket.above} stationDefinition={row.evidence.aboveStation?.definition ?? null} exportKey="above" title={`Upper endpoint · ${row.evidence.aboveStation ? stationDefinitionLabel(row.evidence.aboveStation.definition) : row.evidence.bracket.above.stationId ?? 'physical state'}`} section={section} rebars={rebars} designBasis={designBasis} patternId={`${patternId}-above`} exportingConcreteKey={exportingConcreteKey} onExportConcreteExcel={onExportConcreteExcel} startIndex={aboveStartIndex} /> : null}
            {(!valueComponent || valueReady) && <FixedPResult component={valueComponent ?? undefined} row={row} index={fixedPResultIndex} />}
          </> : null}
          </>}
    </CalculationDialogFrame>
  )
}
