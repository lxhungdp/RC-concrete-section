'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react'
import {
  stationDefinitionLabel,
  type AxialCapPointCalculationAudit,
  type CalculationAuditOriginStrainTrace,
  type CalculationAuditRebar,
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
import type {
  ChartTableFixedPRow,
  ChartTableResistanceStage,
  ChartTableRow,
  ChartTableSource,
  ChartTableVerticalRow
} from './chart-data-table'
import { CalculationDialogFrame, Fact, Formula, FormulaPanel, Step } from './CalculationDialogFrame'

type PhysicalPointCalculationAudit = Exclude<
  PointCalculationAudit,
  { kind: 'unavailable' } | { kind: 'axial-cap' }
>

type Summary = { concreteArea: number; steelArea: number; rebarCount: number }
type Props = {
  row: ChartTableRow | null
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
const forceValue = (value: number) => fmt(value / 1000)
const momentValue = (value: number) => fmt(value / 1_000_000)
const force = (value: number) => `${forceValue(value)} kN`
const moment = (value: number) => `${momentValue(value)} kN·m`
const strain = (value: number) => Number.isFinite(value) ? value.toExponential(4) : '—'

const ResultantComparisonTable = ({ nominal, factored }: {
  nominal: ResultantLedger
  factored: ResultantLedger | null
}) => {
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
        <tr><th>P (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th><th>P (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th></tr>
      </thead>
      <tbody>{summaryRows.map(([label, value], index) => (
          <tr key={label}><td>{label}</td>{cells(value)}{factoredCells(factoredRows[index] ?? null)}</tr>
        ))}</tbody>
      <tfoot><tr><td>Total resistance</td>{cells(nominal.total)}{factoredCells(factored?.total ?? null)}</tr></tfoot>
    </table></div>
  )
}

const ConcreteSummary = ({ audit }: {
  audit: PhysicalPointCalculationAudit
}) => {
  const resultant = audit.displayedLedger.concrete
  const isStressStrain = audit.kind === 'stress-strain'
  return (
    <>
      <div className="pm-calc-table-wrap"><table className="pm-calc-concrete-summary">
        <thead><tr>
          <th>Concrete basis</th><th>Detailed terms</th><th>Area (mm²)</th>
          <th>Pc (kN)</th><th>Mcx (kN·m)</th><th>Mcy (kN·m)</th>
        </tr></thead>
        <tbody><tr>
          <td>{isStressStrain ? 'Stress–strain mesh' : 'Equivalent block'}</td>
          <td>{isStressStrain ? `${fmt(audit.concreteSummary.pointCount, 0)} points` : 'Exact polygon'}</td>
          <td>{fmt(isStressStrain ? audit.concreteSummary.area : audit.block.area)}</td>
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
      ? `c = ${fmt(c)} mm`
      : `N.A. outside section · c ≈ ${fmt(c)} mm`
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
        <text x={stressLeft} y="285" className="pm-calc-svg-note">{fmt(stressMin)} → {fmt(stressMax)} MPa</text>
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
  const units = [...new Set(law.parameters.map((parameter) => parameter.unit))]
  return (
    <div className="pm-calc-law">
      <h4>{title}</h4>
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

const OriginStrainTrace = ({ trace }: { trace: CalculationAuditOriginStrainTrace }) => {
  if (trace.kind === 'uniform-strain') return (
    <div className="pm-calc-derivation">
      <h4>Compatible strain derivation</h4>
      <FormulaPanel><Formula><span className="pm-calc-math">κ = 0; c = ∞; ε₀ = εc = {strain(trace.calculatedE0)}</span></Formula></FormulaPanel>
    </div>
  )

  if (trace.kind === 'controlling-bar-strain') return (
    <div className="pm-calc-derivation">
      <h4>Criterion → steel strain → neutral-axis depth</h4>
      <FormulaPanel>
        <Formula><span className="pm-calc-math">
          {trace.yieldStrainBasis === 'effective-yield-stress-over-elastic-modulus'
            ? <>εy = fy,eff / Es = {fmt(trace.effectiveYieldStress)} / {fmt(trace.elasticModulus, 0)} = {strain(trace.yieldStrain)}</>
            : <>εy = {strain(trace.yieldStrain)} (declared material yield-strain limit)</>}
          {'; '}εs,req = −({fmt(trace.strainRatio, 4)})εy = {strain(trace.requestedSteelStrain)}
          {trace.strainLimitApplied
            ? <>; εs = {strain(trace.controllingSteelStrain)} after the material strain limit</>
            : <>; εs = εs,req</>}
        </span></Formula>
        <Formula><span className="pm-calc-math">
          d = uc − us = {fmt(trace.compressionEdgeProjection)} − ({fmt(trace.controllingBarProjection)}) = {fmt(trace.compressionEdgeToBarDepth)} mm
        </span></Formula>
        <Formula><span className="pm-calc-math">
          κ = (εc − εs) / d = {strain(trace.curvatureFromCompatibility)} mm⁻¹; c = εc / κ = {fmt(trace.neutralAxisDepth)} mm
        </span></Formula>
        <Formula><span className="pm-calc-math">
          ε₀ = εc − κuc = {strain(trace.calculatedE0)}
        </span></Formula>
      </FormulaPanel>
      <p>Criterion {trace.criterionLabel}; controlling bar #{trace.controllingRebarId}, steel material {trace.steelMaterialId}. Tension strain is negative under the compression-positive convention.</p>
      {trace.strainLimitApplied ? <p className="is-warning">The requested εs = {strain(trace.requestedSteelStrain)} was limited by the bar material domain; the equations above use the applied strain.</p> : null}
    </div>
  )

  const criterion = trace.derivation === 'declared-depth-ratio'
    ? `${trace.criterionLabel ?? `c/D = ${fmt(trace.neutralAxisDepthRatio, 4)}`}; c = (${fmt(trace.neutralAxisDepthRatio, 4)})D = ${fmt(trace.neutralAxisDepth)} mm`
    : `Resolved compatible state; c = uc − uNA = ${fmt(trace.neutralAxisDepth)} mm`
  return (
    <div className="pm-calc-derivation">
      <h4>{trace.derivation === 'declared-depth-ratio' ? 'Depth criterion → neutral-axis depth' : 'Resolved compatible strain state'}</h4>
      <FormulaPanel>
        <Formula><span className="pm-calc-math">D = {fmt(trace.projectedSectionDepth)} mm; {criterion}</span></Formula>
        <Formula><span className="pm-calc-math">κ = εc / c = {strain(trace.curvatureFromDepth)} mm⁻¹; ε₀ = εc − κuc = {strain(trace.calculatedE0)}</span></Formula>
      </FormulaPanel>
    </div>
  )
}

const RebarLedger = ({ bars, total }: { bars: CalculationAuditRebar[]; total: Resultant }) => (
  <>
    <FormulaPanel>
      <Formula><span className="pm-calc-math">As = πd²/4; εs = ε₀ + κx·y + κy·x; Fs,net = [σs(εs) − σc,displaced(εs)]·As</span></Formula>
      <Formula><span className="pm-calc-math">Ps = ΣFs,net; Msx = ΣFs,net·y; Msy = ΣFs,net·x</span></Formula>
    </FormulaPanel>
    <div className="pm-calc-table-wrap"><table>
      <thead><tr><th>Bar</th><th>x (mm)</th><th>y (mm)</th><th>d (mm)</th><th>As (mm²)</th><th>εs</th><th>σs (MPa)</th><th>−σc,disp (MPa)</th><th>σnet (MPa)</th><th>Fnet (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th></tr></thead>
      <tbody>{bars.map((bar) => <tr key={bar.id}>
        <td>#{bar.id}</td><td>{fmt(bar.x)}</td><td>{fmt(bar.y)}</td><td>{fmt(bar.diameter)}</td><td>{fmt(bar.area)}</td>
        <td>{strain(bar.strain)}</td><td>{fmt(bar.steelStress)}</td><td>{fmt(bar.displacedConcreteStress)}</td><td>{fmt(bar.netStress)}</td>
        <td>{forceValue(bar.net.P)}</td><td>{momentValue(bar.net.Mx)}</td><td>{momentValue(bar.net.My)}</td>
      </tr>)}</tbody>
      <tfoot><tr><td>Σ Rebar</td><td>—</td><td>—</td><td>—</td><td>{fmt(bars.reduce((sum, bar) => sum + bar.area, 0))}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>{forceValue(total.P)}</td><td>{momentValue(total.Mx)}</td><td>{momentValue(total.My)}</td></tr></tfoot>
    </table></div>
  </>
)

const ResistanceTrace = ({ audit, point, designBasis }: {
  audit: PhysicalPointCalculationAudit
  point: PreviewSurfacePoint
  designBasis: DesignBasis
}) => {
  const trace = point.resistance
  const materialReevaluation = audit.stage === 'design' && designBasis.format === 'designMaterialReevaluation'
  const factored = audit.stage === 'design' ? audit.displayedLedger : null
  return (
    <>
      <ResultantComparisonTable nominal={audit.nominalReferenceLedger} factored={factored} />
      {materialReevaluation ? (
        <FormulaPanel><Formula><span className="pm-calc-math">RDesign = ΣR evaluated at the same compatible state with the declared Design material laws</span></Formula></FormulaPanel>
      ) : audit.resistanceFactor === null ? (
        <FormulaPanel><Formula><span className="pm-calc-math">Rshown = Rintegration (the active material laws already represent the selected {audit.stage} stage; no global φ is applied)</span></Formula></FormulaPanel>
      ) : (
        <FormulaPanel><Formula><span className="pm-calc-math">Rdesign = φ·Rnominal = {fmt(audit.resistanceFactor, 4)}·Rnominal</span></Formula></FormulaPanel>
      )}
      {audit.stage === 'nominal' ? <p className="pm-calc-caption">Factored / Design columns are intentionally unavailable while the table is in Nominal mode.</p> : null}
      {trace ? <div className="pm-calc-facts">
        <Fact label="Classification">{trace.classification}</Fact><Fact label="Stored factor φ">{trace.factor === null ? 'material reevaluation' : fmt(trace.factor, 4)}</Fact>
        {trace.controllingTensileStrain === null ? null : <Fact label="Controlling tensile strain">{strain(trace.controllingTensileStrain)}</Fact>}
        {trace.yieldStrain === null ? null : <Fact label="Yield strain">{strain(trace.yieldStrain)}</Fact>}
      </div> : null}
      {designBasis.format === 'designMaterialReevaluation' ? <div className="pm-calc-factor-list">
        {[...designBasis.factors.concrete.components, ...designBasis.factors.reinforcement.components].map((factor) => (
          <span key={factor.id}><b>{factor.symbol}</b> = {fmt(factor.value, 4)} · {factor.clauseRef}</span>
        ))}
      </div> : null}
      <p className="pm-calc-source"><b>Resistance basis:</b> {designBasis.identity.document} · {designBasis.identity.edition} · method {designBasis.identity.methodId}.</p>
      {audit.stage === 'design' ? <div className={`pm-calc-note${audit.nominalReferenceReconciliation.ok ? '' : ' is-error'}`}>
        {audit.nominalReferenceReconciliation.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <p><b>Nominal/reference reconciliation:</b> max normalized Δ = {audit.nominalReferenceReconciliation.relativeMaximum.toExponential(3)}. This verifies the retained pre-Design value at the same compatible state.</p>
      </div> : null}
      <div className={`pm-calc-note${audit.reconciliation.ok ? '' : ' is-error'}`}>
        {audit.reconciliation.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <p><b>Stored-result reconciliation:</b> max normalized Δ = {audit.reconciliation.relativeMaximum.toExponential(3)} (limit {audit.reconciliation.tolerance.toExponential(1)}). The detailed sum {audit.reconciliation.ok ? 'reproduces' : 'does not reproduce'} the point used by the table.</p>
      </div>
    </>
  )
}

const AxialCapAudit = ({
  audit,
  stationDefinition,
  title,
  startIndex
}: {
  audit: AxialCapPointCalculationAudit
  stationDefinition: StationDefinition | null
  title: string
  startIndex: number
}) => {
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
        <thead><tr><th>Cap source</th><th>P (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th></tr></thead>
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

const PhysicalAudit = ({ audit, point, stationDefinition, exportKey, title, section, rebars, designBasis, patternId, exportingConcreteKey, onExportConcreteExcel, startIndex = 3 }: {
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
}) => {
  if (audit.kind === 'unavailable') return (
    <Step index={startIndex} title={`${title}: physical calculation evidence`}>
      <div className="pm-calc-note is-error"><AlertTriangle size={16} /><p>{audit.message}</p></div>
    </Step>
  )
  if (audit.kind === 'axial-cap') return (
    <>
      {audit.preCap ? <PhysicalAudit
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
        stationDefinition={stationDefinition}
        title={title}
        startIndex={startIndex + (audit.preCap ? 4 : 0)}
      />
    </>
  )
  return (
    <>
      <Step index={startIndex} title={`${title}: compatible strain and stress state`}>
        <div className="pm-calc-facts">
          <Fact label={<><span className="pm-calc-math">ε₀</span> at analysis origin</>}>{strain(audit.depthProfile.originStrainTrace.calculatedE0)}</Fact>
          <Fact label="κx / κy">{strain(audit.state.kx)} / {strain(audit.state.ky)} mm⁻¹</Fact>
          <Fact label="Projected depth D">{fmt(audit.depthProfile.projectedSectionDepth)} mm</Fact>
          <Fact label="Neutral-axis depth c">{audit.depthProfile.neutralAxisDepth === null ? '∞ (uniform strain)' : `${fmt(audit.depthProfile.neutralAxisDepth)} mm${audit.depthProfile.neutralAxisInsideSection ? '' : ' · outside section'}`}</Fact>
        </div>
        <OriginStrainTrace trace={audit.depthProfile.originStrainTrace} />
        <FormulaPanel><Formula><span className="pm-calc-math">ε(x,y) = ε₀ + κx·(y − y₀) + κy·(x − x₀)</span></Formula></FormulaPanel>
        <CalculationDiagram section={section} rebars={rebars} audit={audit} patternId={patternId} />
      </Step>

      <Step
        index={startIndex + 1}
        title={`${title}: concrete detail`}
        action={<button
          type="button"
          className="pm-calc-excel-button"
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
            : <Download size={15} />}
        </button>}
      >
        <ConcreteSummary audit={audit} />
      </Step>

      <Step index={startIndex + 2} title={`${title}: reinforcement and displaced concrete`}>
        <RebarLedger bars={audit.rebars} total={audit.mechanicalLedger.steel} />
        <p className="pm-calc-caption">These bar rows are the mechanics-stage net reinforcement ledger. The final comparison table is authoritative for the Nominal/reference and displayed Design resultants and applies any global resultant factor exactly once.</p>
        {audit.steelLaws.map((entry) => <details className="pm-calc-details" key={entry.materialId}><summary>Steel material {entry.materialId}: {entry.name}</summary><MaterialLaw title="Steel law and active coefficients" law={entry.law} /></details>)}
      </Step>

      <Step index={startIndex + 3} title={`${title}: resultant assembly and resistance stage`}>
        <ResistanceTrace audit={audit} point={point} designBasis={designBasis} />
      </Step>
    </>
  )
}

const IntegrationModel = ({ surface, geometricCap }: { surface: PreviewSurface; geometricCap: boolean }) => (
  <Step index={2} title="Mesh / integration summary">
    {surface.mechanics === 'equivalent-rectangular-block' ? (
      <div className="pm-calc-note"><CheckCircle2 size={16} /><p><b>Exact block clipping.</b> No concrete fibre mesh is used. The physical section and holes are clipped against the active block half-plane; its exact polygon area and centroid are shown in the point calculation below.</p></div>
    ) : (
      <>
        <div className="pm-calc-facts">
          <Fact label="Base cell h">{fmt(surface.mesh.cellSize)} mm</Fact><Fact label="Clipped cells">{fmt(surface.mesh.cells, 0)}</Fact>
          <Fact label="Exact / integrated area">{fmt(surface.mesh.exact.area)} / {fmt(surface.mesh.meshed.area)} mm²</Fact><Fact label="Area difference">{fmt(surface.mesh.areaError)} mm²</Fact>
        </div>
        <p className="pm-calc-caption">The exact boundary remains authoritative for section properties and extreme fibres. {geometricCap
          ? 'The retained physical criterion state is integrated in full below; the final cap face is then audited through its source crossing without inventing another strain state.'
          : 'Detailed integration points are available in the Excel audit.'}</p>
      </>
    )}
  </Step>
)

const FixedPSchematic = ({ row }: { row: ChartTableFixedPRow }) => {
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

const calculationAuditStepCount = (audit: PointCalculationAudit | undefined) => {
  if (!audit || audit.kind === 'unavailable') return 1
  if (audit.kind === 'axial-cap') return audit.preCap ? 5 : 1
  return 4
}

const VerticalResult = ({ row, index }: { row: ChartTableVerticalRow; index: number }) => {
  const selected = row.evidence.stage === 'design' ? row.design : row.nominal
  if (!selected) return null
  return <Step index={index} title="Value shown in the Vertical table">
    <FormulaPanel><Formula><span className="pm-calc-math">Mβ = Mx·cosβ + My·sinβ, with β = {fmt(row.evidence.angleDeg)}°</span></Formula></FormulaPanel>
    <div className="pm-calc-final"><Fact label={`${row.evidence.stage} P`}>{force(selected.total.P)}</Fact><Fact label={`${row.evidence.stage} Mβ`}>{moment(selected.total.M)}</Fact></div>
  </Step>
}

const FixedPResult = ({ row, index }: { row: ChartTableFixedPRow; index: number }) => {
  const { bracket, fixedP, sample, stage } = row.evidence
  const selected = stage === 'design' ? row.design : row.nominal
  return <Step index={index} title="Fixed-P interpolation and value shown in the table">
    {!bracket ? <div className="pm-calc-note is-error"><AlertTriangle size={16} /><p>No same-meridian bracket is attached to this row; interpolation evidence is unavailable.</p></div> : bracket.exact ? (
      <FormulaPanel><Formula><span className="pm-calc-math">Pselected = Pstation; Mx = {moment(sample.Mx)}; My = {moment(sample.My)}</span></Formula></FormulaPanel>
    ) : <>
      <FormulaPanel>
        <Formula><span className="pm-calc-math">t = (Pselected − Pbelow)/(Pabove − Pbelow) = ({force(fixedP)} − {force(bracket.below.P)})/({force(bracket.above.P)} − {force(bracket.below.P)}) = {fmt(bracket.ratio, 6)}</span></Formula>
        <Formula><span className="pm-calc-math">Mx = Mx,below + t(Mx,above − Mx,below) = {moment(sample.Mx)}</span></Formula>
        <Formula><span className="pm-calc-math">My = My,below + t(My,above − My,below) = {moment(sample.My)}</span></Formula>
      </FormulaPanel>
    </>}
    {selected ? <div className="pm-calc-final"><Fact label={`${stage} P`}>{force(sample.P)}</Fact><Fact label={`${stage} Mx`}>{moment(selected.Mx)}</Fact><Fact label={`${stage} My`}>{moment(selected.My)}</Fact></div> : null}
    <p className="pm-calc-caption">This contour point has no invented strain plane. Each endpoint is audited independently above; a cap-face endpoint is traced through its stored geometric cap construction.</p>
  </Step>
}

export function ChartCalculationDialog({ row, rows, source, resistanceStage, summary, surface, projectName, section, rebars, materialStore, designBasis, exportingConcreteKey, exportingCalculationTrace, exportError, onExportConcreteExcel, onExportCalculationTraceExcel, onSourceChange, onResistanceStageChange, onRowChange, onClose }: Props) {
  const patternId = useId().replace(/:/g, '')
  const stage = row?.evidence.stage ?? resistanceStage
  const [audits, setAudits] = useState<Map<string, PointCalculationAudit>>(new Map())
  const [auditError, setAuditError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    const controller = new AbortController()
    setAudits(new Map())
    setAuditError(null)
    if (!surface.calculationProfileId) {
      setAuditError('The surface has no calculation-profile identity, so a mechanics-specific audit cannot be selected safely.')
      setLoading(false)
      return () => controller.abort()
    }
    if (requestedPoints.length === 0) {
      setLoading(false)
      return () => controller.abort()
    }
    setLoading(true)
    void buildPointAuditsAsync({
      calculationProfileId: surface.calculationProfileId,
      section,
      rebars,
      materialStore,
      analysisOptions: surface.analysisOptions,
      designBasis,
      stage,
      points: requestedPoints
    }, controller.signal).then((items) => {
      setAudits(new Map(items.map((item) => [item.key, item.audit])))
      setLoading(false)
    }).catch((error: unknown) => {
      if (isAnalysisAbort(error)) return
      setAuditError(error instanceof Error ? error.message : String(error))
      setLoading(false)
    })
    return () => controller.abort()
  }, [designBasis, materialStore, rebars, requestedPoints, section, stage, surface.analysisOptions, surface.calculationProfileId])

  const basicConcrete = materialStore.concrete
  const selectedAudit = audits.get('selected')
  const belowAudit = audits.get('below')
  const aboveAudit = audits.get('above')
  const belowStartIndex = 4
  const aboveStartIndex = belowStartIndex + calculationAuditStepCount(belowAudit)
  const fixedPResultIndex = aboveStartIndex + (row?.kind === 'fixedP' && !row.evidence.bracket?.exact
    ? calculationAuditStepCount(aboveAudit)
    : 0)
  return (
    <CalculationDialogFrame
      title="CALCULATION TRACE"
      closeLabel="Close calculation details"
      bodyKey={`${stage}-${row?.key ?? 'empty'}`}
      onClose={onClose}
      controls={<div className="pm-calculation-dialog__selectors" aria-label="Calculation trace selection">
            <label className="pm-calculation-dialog__selector">
              <span>View</span>
              <select
                aria-label="Calculation trace view"
                value={source}
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
            <button
              type="button"
              className="pm-calc-excel-button pm-calc-excel-button--report"
              disabled={exportingCalculationTrace || requestedPoints.length === 0 || !surface.calculationProfileId}
              onClick={() => void onExportCalculationTraceExcel()}
              title="Download the complete formula-linked audit for this selected result row"
            >
              <span>Excel</span>
              {exportingCalculationTrace ? <Loader2 size={15} className="pm-spin" /> : <Download size={15} />}
            </button>
          </div>}
    >
          {exportError ? <div className="pm-calc-note is-error" role="alert"><AlertTriangle size={16} /><p><b>Export failed:</b> {exportError}</p></div> : null}
          {!row ? (
            <div className="pm-calc-note is-warning"><AlertTriangle size={16} /><p>{rows.length === 0
              ? 'No calculation criteria are available for the selected View and Stage. The dialog remains open so another selection can be made.'
              : 'The selected criterion is not present in this resistance stage after geometric surface processing. Choose another criterion or switch back to restore the previous selection; no different calculation has been substituted.'}</p></div>
          ) : <>
          <Step index={1} title="Basic inputs">
            <div className="pm-calc-facts">
              <Fact label="Project / section">{projectName || 'Untitled project'} · {section.name}</Fact>
              <Fact label="Section">Ac = {fmt(summary.concreteArea)} mm² · {summary.rebarCount} bars · As = {fmt(summary.steelArea)} mm²</Fact>
              {surface.mechanics === 'stress-strain-integration' ? (
                <Fact label="Concrete">{basicConcrete.name} · fck = {fmt(basicConcrete.fck)} MPa · {basicConcrete.stressStrain.type} · εcu = {strain(basicConcrete.limits.epsCu)}</Fact>
              ) : (
                <Fact label="Concrete">{basicConcrete.name} · fck = {fmt(basicConcrete.fck)} MPa · equivalent block · εcu = {strain(basicConcrete.limits.epsCu)}</Fact>
              )}
              <Fact label="Steel">{materialStore.steel.map((steel) => `${steel.name}: fy=${fmt(steel.fy)}, Es=${fmt(steel.elasticModulus, 0)} MPa`).join(' · ')}</Fact>
              <Fact label="Design basis">{designBasis.identity.document.split(' · ')[0]}</Fact>
            </div>
          </Step>

          <IntegrationModel surface={surface} geometricCap={requestedPoints.some((item) => item.point.surfaceRole === 'axial-cap')} />

          {loading ? <div className="pm-calc-loading"><Loader2 size={17} className="pm-spin" /><span>Re-evaluating the selected stored state in the analysis worker and reconciling every contribution…</span></div> : null}
          {auditError ? <div className="pm-calc-note is-error"><AlertTriangle size={16} /><p><b>Blocking audit failure:</b> {auditError}</p></div> : null}

          {!loading && !auditError && row.kind === 'vertical' && selectedAudit ? <>
            <PhysicalAudit audit={selectedAudit} point={row.evidence.point} stationDefinition={row.evidence.station?.definition ?? null} exportKey="selected" title="Selected Vertical station" section={section} rebars={rebars} designBasis={designBasis} patternId={`${patternId}-vertical`} exportingConcreteKey={exportingConcreteKey} onExportConcreteExcel={onExportConcreteExcel} />
            <VerticalResult row={row} index={3 + calculationAuditStepCount(selectedAudit)} />
          </> : null}

          {!loading && !auditError && row.kind === 'fixedP' ? <>
            <Step index={3} title="Fixed-P row definition and source brackets">
              <div className="pm-calc-facts"><Fact label="Selected axial force">{force(row.evidence.fixedP)}</Fact><Fact label="Meridian β / branch">{fmt(row.angleDeg)}° / {row.branch}</Fact></div>
              <FixedPSchematic row={row} />
              <p className="pm-calc-caption">Fixed-P is a surface-edge intersection. Its endpoint traces remain separate; physical endpoints show their compatible state, while cap-face endpoints show the exact geometric cap operation.</p>
            </Step>
            {row.evidence.bracket && belowAudit ? <PhysicalAudit audit={belowAudit} point={row.evidence.bracket.below} stationDefinition={row.evidence.belowStation?.definition ?? null} exportKey="below" title={`Lower endpoint · ${row.evidence.belowStation ? stationDefinitionLabel(row.evidence.belowStation.definition) : row.evidence.bracket.below.stationId ?? 'physical state'}`} section={section} rebars={rebars} designBasis={designBasis} patternId={`${patternId}-below`} exportingConcreteKey={exportingConcreteKey} onExportConcreteExcel={onExportConcreteExcel} startIndex={belowStartIndex} /> : null}
            {row.evidence.bracket && !row.evidence.bracket.exact && aboveAudit ? <PhysicalAudit audit={aboveAudit} point={row.evidence.bracket.above} stationDefinition={row.evidence.aboveStation?.definition ?? null} exportKey="above" title={`Upper endpoint · ${row.evidence.aboveStation ? stationDefinitionLabel(row.evidence.aboveStation.definition) : row.evidence.bracket.above.stationId ?? 'physical state'}`} section={section} rebars={rebars} designBasis={designBasis} patternId={`${patternId}-above`} exportingConcreteKey={exportingConcreteKey} onExportConcreteExcel={onExportConcreteExcel} startIndex={aboveStartIndex} /> : null}
            <FixedPResult row={row} index={fixedPResultIndex} />
          </> : null}
          </>}
    </CalculationDialogFrame>
  )
}
