'use client'

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react'
import {
  stationDefinitionLabel,
  type CalculationAuditConcreteGroup,
  type CalculationAuditRebar,
  type PointCalculationAudit,
  type PreviewSurface,
  type PreviewSurfacePoint,
  type Resultant,
  type ResultantLedger
} from '@pm/analysis'
import type { DesignBasis } from '@pm/design'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialLawAudit, MaterialStore } from '@pm/materials'
import { buildPointAuditsAsync, isAnalysisAbort } from '../../../application/analysis/client'
import type { ChartTableFixedPRow, ChartTableRow, ChartTableVerticalRow } from './chart-data-table'

type Summary = { concreteArea: number; steelArea: number; rebarCount: number }
type Props = {
  row: ChartTableRow
  summary: Summary
  surface: PreviewSurface
  projectName: string
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
  onClose: () => void
}

const fmt = (value: number, digits = 6) => Number.isFinite(value)
  ? value.toLocaleString('en-US', { maximumFractionDigits: digits })
  : '—'
const force = (value: number) => `${fmt(value / 1000, 3)} kN`
const moment = (value: number) => `${fmt(value / 1_000_000, 4)} kN·m`
const strain = (value: number) => Number.isFinite(value) ? value.toExponential(6) : '—'

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="pm-calc-fact"><span>{label}</span><strong>{children}</strong></div>
)

const Step = ({ index, title, children }: { index: number | string; title: string; children: ReactNode }) => (
  <section className="pm-calc-step">
    <div className="pm-calc-step__heading"><span>{index}</span><h3>{title}</h3></div>
    <div className="pm-calc-step__body">{children}</div>
  </section>
)

const ResultantTable = ({ title, ledger }: { title: string; ledger: ResultantLedger }) => {
  const rows: Array<[string, Resultant]> = [
    ['Concrete', ledger.concrete],
    ['Steel gross', ledger.steelGross],
    ['Displaced concrete', ledger.displacedConcrete],
    ['Steel net', ledger.steel],
    ['Total', ledger.total]
  ]
  return (
    <div className="pm-calc-resultant">
      <h4>{title}</h4>
      <div className="pm-calc-table-wrap"><table>
        <thead><tr><th>Contribution</th><th>P</th><th>Mx</th><th>My</th></tr></thead>
        <tbody>{rows.map(([label, value]) => (
          <tr key={label}><td>{label}</td><td>{force(value.P)}</td><td>{moment(value.Mx)}</td><td>{moment(value.My)}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
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
  audit: Exclude<PointCalculationAudit, { kind: 'unavailable' }>
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
      ? `c = ${fmt(c, 3)} mm`
      : `N.A. outside section · c ≈ ${fmt(c, 3)} mm`
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
        <text x={stressLeft} y="285" className="pm-calc-svg-note">{fmt(stressMin, 3)} → {fmt(stressMax, 3)} MPa</text>
        {naProfileY === null ? null : (
          <g className="pm-calc-na-profile"><line x1="371" y1={naProfileY} x2="750" y2={naProfileY} /><text x="745" y={naProfileY - 4} textAnchor="end">{profile.neutralAxisInsideSection ? 'ε = 0 / N.A.' : 'N.A. estimated outside'}</text></g>
        )}
      </svg>
      <figcaption>Depth is measured from the extreme compression edge. The red dashed marker is ε = 0; an off-section neutral axis is indicated without shrinking the section drawing. The stress profile is evaluated by the selected kernel, not sketched from a generic shape.</figcaption>
    </figure>
  )
}

const MaterialLaw = ({ title, law }: { title: string; law: MaterialLawAudit }) => (
  <div className="pm-calc-law">
    <h4>{title}</h4>
    {law.equations.map((equation) => <code className="pm-calc-formula" key={equation}>{equation}</code>)}
    <div className="pm-calc-table-wrap"><table>
      <thead><tr><th>Symbol</th><th>Parameter</th><th>Value</th><th>Unit</th><th>Derivation</th></tr></thead>
      <tbody>{law.parameters.map((parameter, index) => (
        <tr key={`${parameter.symbol}-${index}`}><td>{parameter.symbol}</td><td>{parameter.label}</td><td>{fmt(parameter.value, 8)}</td><td>{parameter.unit}</td><td>{parameter.derivation ?? 'input / profile value'}</td></tr>
      ))}</tbody>
    </table></div>
    <p className={`pm-calc-source${law.provenance.reference ? '' : ' is-gap'}`}><b>Basis:</b> {law.provenance.document}{law.provenance.reference ? ` · ${law.provenance.reference}` : ''}. {law.provenance.note}</p>
  </div>
)

const ConcreteGroups = ({ groups }: { groups: CalculationAuditConcreteGroup[] }) => (
  <>
    <code className="pm-calc-formula">εᵢ = ε₀ + κx·yᵢ + κy·xᵢ; σc,ᵢ = fc(εᵢ); Fc,ᵢ = σc,ᵢ·Aᵢ</code>
    <code className="pm-calc-formula">Pc = ΣFc,ᵢ; Mcx = ΣFc,ᵢ·yᵢ; Mcy = ΣFc,ᵢ·xᵢ</code>
    <div className="pm-calc-table-wrap"><table>
      <thead><tr><th>Material-law branch</th><th>Points</th><th>ΣA (mm²)</th><th>ε range</th><th>σ range (MPa)</th><th>ΣP</th><th>ΣMx</th><th>ΣMy</th></tr></thead>
      <tbody>{groups.map((group) => <tr key={group.id}>
        <td>{group.label}</td><td>{fmt(group.count, 0)}</td><td>{fmt(group.area, 3)}</td>
        <td>{strain(group.strainMinimum)} → {strain(group.strainMaximum)}</td>
        <td>{fmt(group.stressMinimum, 4)} → {fmt(group.stressMaximum, 4)}</td>
        <td>{force(group.resultant.P)}</td><td>{moment(group.resultant.Mx)}</td><td>{moment(group.resultant.My)}</td>
      </tr>)}</tbody>
    </table></div>
    <details className="pm-calc-details"><summary>Representative integration term from each branch</summary>
      <div className="pm-calc-table-wrap"><table>
        <thead><tr><th>Branch</th><th>x / y (mm)</th><th>A (mm²)</th><th>ε</th><th>σ (MPa)</th><th>F = σA</th><th>F·y</th><th>F·x</th></tr></thead>
        <tbody>{groups.map((group) => <tr key={group.id}>
          <td>{group.label}</td><td>{fmt(group.representative.x, 3)} / {fmt(group.representative.y, 3)}</td><td>{fmt(group.representative.area, 6)}</td>
          <td>{strain(group.representative.strain)}</td><td>{fmt(group.representative.stress, 6)}</td><td>{force(group.representative.force)}</td>
          <td>{moment(group.representative.Mx)}</td><td>{moment(group.representative.My)}</td>
        </tr>)}</tbody>
      </table></div>
    </details>
  </>
)

const RebarLedger = ({ bars }: { bars: CalculationAuditRebar[] }) => (
  <>
    <code className="pm-calc-formula">As = πd²/4; εs = ε₀ + κx·y + κy·x; Fs,net = [σs(εs) − σc,displaced(εs)]·As</code>
    <code className="pm-calc-formula">Ps = ΣFs,net; Msx = ΣFs,net·y; Msy = ΣFs,net·x</code>
    <div className="pm-calc-table-wrap"><table>
      <thead><tr><th>Bar</th><th>x / y (mm)</th><th>d / As</th><th>εs</th><th>σs (MPa)</th><th>−σc,disp (MPa)</th><th>σnet (MPa)</th><th>Fnet</th><th>Mx</th><th>My</th></tr></thead>
      <tbody>{bars.map((bar) => <tr key={bar.id}>
        <td>#{bar.id}</td><td>{fmt(bar.x, 3)} / {fmt(bar.y, 3)}</td><td>{fmt(bar.diameter, 3)} / {fmt(bar.area, 3)}</td>
        <td>{strain(bar.strain)}</td><td>{fmt(bar.steelStress, 5)}</td><td>{fmt(bar.displacedConcreteStress, 5)}</td><td>{fmt(bar.netStress, 5)}</td>
        <td>{force(bar.net.P)}</td><td>{moment(bar.net.Mx)}</td><td>{moment(bar.net.My)}</td>
      </tr>)}</tbody>
    </table></div>
  </>
)

const ResistanceTrace = ({ audit, point, designBasis }: {
  audit: Exclude<PointCalculationAudit, { kind: 'unavailable' }>
  point: PreviewSurfacePoint
  designBasis: DesignBasis
}) => {
  const trace = point.resistance
  const materialReevaluation = audit.stage === 'design' && designBasis.format === 'designMaterialReevaluation'
  return (
    <>
      {materialReevaluation ? (
        <>
          <ResultantTable title="Nominal/reference resultants at the same compatible state" ledger={audit.nominalReferenceLedger} />
          <code className="pm-calc-formula">Rnominal = ΣR evaluated with the reference material laws retained by the Design point</code>
          <ResultantTable title="Design resultants after material-law reevaluation" ledger={audit.mechanicalLedger} />
        </>
      ) : (
        <ResultantTable title={audit.resistanceFactor === null ? 'Integrated resultants used by the selected stage' : 'Nominal/reference resultants before φ'} ledger={audit.mechanicalLedger} />
      )}
      {audit.resistanceFactor === null ? (
        <code className="pm-calc-formula">Rshown = Rintegration (the active material laws already represent the selected {audit.stage} stage; no global φ is applied)</code>
      ) : (
        <code className="pm-calc-formula">Rdesign = φ·Rnominal = {fmt(audit.resistanceFactor, 8)}·Rnominal</code>
      )}
      {audit.resistanceFactor === null ? null : <ResultantTable title="Resultants after the stored strength-reduction factor" ledger={audit.displayedLedger} />}
      {trace ? <div className="pm-calc-facts">
        <Fact label="Classification">{trace.classification}</Fact><Fact label="Stored factor φ">{trace.factor === null ? 'material reevaluation' : fmt(trace.factor, 8)}</Fact>
        {trace.controllingTensileStrain === null ? null : <Fact label="Controlling tensile strain">{strain(trace.controllingTensileStrain)}</Fact>}
        {trace.yieldStrain === null ? null : <Fact label="Yield strain">{strain(trace.yieldStrain)}</Fact>}
      </div> : null}
      {designBasis.format === 'designMaterialReevaluation' ? <div className="pm-calc-factor-list">
        {[...designBasis.factors.concrete.components, ...designBasis.factors.reinforcement.components].map((factor) => (
          <span key={factor.id}><b>{factor.symbol}</b> = {fmt(factor.value, 6)} · {factor.clauseRef}</span>
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

const PhysicalAudit = ({ audit, point, title, section, rebars, designBasis, patternId, startIndex = 3 }: {
  audit: PointCalculationAudit
  point: PreviewSurfacePoint
  title: string
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  designBasis: DesignBasis
  patternId: string
  startIndex?: number
}) => {
  if (audit.kind === 'unavailable') return (
    <Step index={startIndex} title={`${title}: physical calculation evidence`}>
      <div className="pm-calc-note is-error"><AlertTriangle size={16} /><p>{audit.message}</p></div>
    </Step>
  )
  return (
    <>
      <Step index={startIndex} title={`${title}: compatible strain and stress state`}>
        <div className="pm-calc-facts">
          <Fact label="ε0 at analysis origin">{strain(audit.state.e0)}</Fact>
          <Fact label="κx / κy">{strain(audit.state.kx)} / {strain(audit.state.ky)} mm⁻¹</Fact>
          <Fact label="Projected depth">{fmt(audit.depthProfile.projectedSectionDepth, 4)} mm</Fact>
          <Fact label="Neutral-axis depth c">{audit.depthProfile.neutralAxisDepth === null ? '∞ (uniform strain)' : `${fmt(audit.depthProfile.neutralAxisDepth, 4)} mm${audit.depthProfile.neutralAxisInsideSection ? '' : ' · outside section'}`}</Fact>
        </div>
        <code className="pm-calc-formula">ε(x,y) = ε₀ + κx·(y − y₀) + κy·(x − x₀)</code>
        <CalculationDiagram section={section} rebars={rebars} audit={audit} patternId={patternId} />
      </Step>

      <Step index={startIndex + 1} title={`${title}: concrete calculation`}>
        {audit.kind === 'stress-strain' ? (
          <><MaterialLaw title="Concrete law and active coefficients" law={audit.concreteLaw} /><ConcreteGroups groups={audit.concreteGroups} /></>
        ) : (
          <>
            <div className="pm-calc-facts">
              <Fact label="c">{fmt(audit.block.neutralAxisDepth, 5)} mm</Fact><Fact label="β1 / depth coefficient">{fmt(audit.block.beta1, 8)}</Fact>
              <Fact label="a = β1c">{fmt(audit.block.blockDepth, 5)} mm</Fact><Fact label="σblock">{fmt(audit.block.compressionStress, 6)} MPa</Fact>
              <Fact label="Exact clipped area Ablock">{fmt(audit.block.area, 5)} mm²</Fact><Fact label="Block centroid x / y">{fmt(audit.block.centroidX, 5)} / {fmt(audit.block.centroidY, 5)} mm</Fact>
            </div>
            <code className="pm-calc-formula">a = β1·c = {fmt(audit.block.beta1, 8)} × {fmt(audit.block.neutralAxisDepth, 5)} = {fmt(audit.block.blockDepth, 5)} mm</code>
            <code className="pm-calc-formula">Cc = σblock·Ablock = {fmt(audit.block.compressionStress, 6)} × {fmt(audit.block.area, 5)} = {force(audit.block.resultant.P)}</code>
            <code className="pm-calc-formula">Mcx = Cc·ȳ = {moment(audit.block.resultant.Mx)}; Mcy = Cc·x̄ = {moment(audit.block.resultant.My)}</code>
            <p className="pm-calc-source"><b>Basis:</b> {audit.provenance.document} · {audit.provenance.concrete}. Method {audit.provenance.methodId}; {audit.provenance.verificationStatus}.</p>
          </>
        )}
      </Step>

      <Step index={startIndex + 2} title={`${title}: reinforcement and displaced concrete`}>
        <RebarLedger bars={audit.rebars} />
        {audit.steelLaws.map((entry) => <details className="pm-calc-details" key={entry.materialId}><summary>Steel material {entry.materialId}: {entry.name}</summary><MaterialLaw title="Steel law and active coefficients" law={entry.law} /></details>)}
      </Step>

      <Step index={startIndex + 3} title={`${title}: resultant assembly and resistance stage`}>
        <ResistanceTrace audit={audit} point={point} designBasis={designBasis} />
      </Step>
    </>
  )
}

const IntegrationModel = ({ surface }: { surface: PreviewSurface }) => (
  <Step index={2} title="Integration model / geometry evidence">
    {surface.mechanics === 'equivalent-rectangular-block' ? (
      <div className="pm-calc-note"><CheckCircle2 size={16} /><p><b>Exact block clipping.</b> No concrete fibre mesh is used. The physical section and holes are clipped against the active block half-plane; its exact polygon area and centroid are shown in the point calculation below.</p></div>
    ) : (
      <>
        <div className="pm-calc-facts">
          <Fact label="Base cell h">{fmt(surface.mesh.cellSize, 5)} mm</Fact><Fact label="Clipped cells">{fmt(surface.mesh.cells, 0)}</Fact>
          <Fact label="Triangles">{fmt(surface.mesh.triangles, 0)}</Fact><Fact label="Gauss points">{fmt(surface.mesh.points, 0)} (= 3 per triangle)</Fact>
          <Fact label="Exact / integrated area">{fmt(surface.mesh.exact.area, 5)} / {fmt(surface.mesh.meshed.area, 5)} mm²</Fact><Fact label="Area difference">{fmt(surface.mesh.areaError, 8)} mm²</Fact>
          <Fact label="First-moment ΔQx / ΔQy">{fmt(surface.mesh.firstMomentXError, 8)} / {fmt(surface.mesh.firstMomentYError, 8)} mm³</Fact><Fact label="Discarded sliver area">{fmt(surface.mesh.discardedArea, 8)} mm²</Fact>
        </div>
        <code className="pm-calc-formula">Triangle rule: barycentric points (2/3, 1/6, 1/6) and permutations; each weight Ai = Atriangle/3.</code>
        <p className="pm-calc-source"><b>Numerical basis:</b> clipped-cell mesh and degree-2 triangle quadrature, docs/02-meshing-2d.md §5. The exact boundary still controls area origin, extreme fibres and section dimensions.</p>
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

const VerticalResult = ({ row }: { row: ChartTableVerticalRow }) => {
  const selected = row.evidence.stage === 'design' ? row.design : row.nominal
  if (!selected) return null
  return <Step index={7} title="Value shown in the Vertical table">
    <code className="pm-calc-formula">Mβ = Mx·cosβ + My·sinβ, with β = {fmt(row.evidence.angleDeg, 5)}°</code>
    <div className="pm-calc-final"><Fact label={`${row.evidence.stage} P`}>{force(selected.total.P)}</Fact><Fact label={`${row.evidence.stage} Mβ`}>{moment(selected.total.M)}</Fact></div>
  </Step>
}

const FixedPResult = ({ row, index }: { row: ChartTableFixedPRow; index: number }) => {
  const { bracket, fixedP, sample, stage } = row.evidence
  const selected = stage === 'design' ? row.design : row.nominal
  return <Step index={index} title="Fixed-P interpolation and value shown in the table">
    {!bracket ? <div className="pm-calc-note is-error"><AlertTriangle size={16} /><p>No same-meridian bracket is attached to this row; interpolation evidence is unavailable.</p></div> : bracket.exact ? (
      <code className="pm-calc-formula">Pselected = Pstation; Mx = {moment(sample.Mx)}; My = {moment(sample.My)}</code>
    ) : <>
      <code className="pm-calc-formula">t = (Pselected − Pbelow)/(Pabove − Pbelow) = ({force(fixedP)} − {force(bracket.below.P)})/({force(bracket.above.P)} − {force(bracket.below.P)}) = {fmt(bracket.ratio, 9)}</code>
      <code className="pm-calc-formula">Mx = Mx,below + t(Mx,above − Mx,below) = {moment(sample.Mx)}</code>
      <code className="pm-calc-formula">My = My,below + t(My,above − My,below) = {moment(sample.My)}</code>
    </>}
    {selected ? <div className="pm-calc-final"><Fact label={`${stage} P`}>{force(sample.P)}</Fact><Fact label={`${stage} Mx`}>{moment(selected.Mx)}</Fact><Fact label={`${stage} My`}>{moment(selected.My)}</Fact></div> : null}
    <p className="pm-calc-caption">This interpolated contour point has no invented strain plane. Its lower and upper physical states are audited independently above.</p>
  </Step>
}

export function ChartCalculationDialog({ row, summary, surface, projectName, section, rebars, materialStore, designBasis, onClose }: Props) {
  const titleId = useId()
  const patternId = useId().replace(/:/g, '')
  const stage = row.evidence.stage
  const [audits, setAudits] = useState<Map<string, PointCalculationAudit>>(new Map())
  const [auditError, setAuditError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const requestedPoints = useMemo(() => {
    if (row.kind === 'vertical') return [{ key: 'selected', point: row.evidence.point }]
    const bracket = row.evidence.bracket
    if (!bracket) return []
    return bracket.exact
      ? [{ key: 'below', point: bracket.below }]
      : [{ key: 'below', point: bracket.below }, { key: 'above', point: bracket.above }]
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

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [onClose])

  const basicConcrete = materialStore.concrete
  return (
    <div className="pm-calculation-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <article className="pm-calculation-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="pm-calculation-dialog__header"><div>
          <div className="pm-calc-kicker">CALCULATION TRACE · {row.kind === 'vertical' ? 'VERTICAL' : 'FIXED-P'} · {stage.toUpperCase()}</div>
          <h2 id={titleId}>{row.kind === 'vertical' ? row.criterion : `β = ${fmt(row.angleDeg, 4)}° · branch ${row.branch}`}</h2>
          <p>Row {row.index} · trace from project inputs to the exact stored table value.</p>
        </div><button type="button" className="pm-calculation-dialog__close" aria-label="Close calculation details" onClick={onClose}><X size={18} /></button></header>

        <div className="pm-calculation-dialog__body">
          <div className="pm-calc-banner"><AlertTriangle size={17} /><span>Preview calculation evidence for qualified engineering review. It is not an accepted/released result and does not cover member stability, slenderness or second-order effects.</span></div>

          <Step index={1} title="Basic project, section and material inputs">
            <div className="pm-calc-facts">
              <Fact label="Project / section">{projectName || 'Untitled project'} · {section.name}</Fact>
              <Fact label="Exact net concrete area Ac">{fmt(summary.concreteArea, 4)} mm²</Fact>
              <Fact label="Reinforcement">{summary.rebarCount} bars · As = {fmt(summary.steelArea, 4)} mm²</Fact>
              <Fact label="Concrete input">{basicConcrete.name} · fck = {fmt(basicConcrete.fck, 4)} MPa</Fact>
              {surface.mechanics === 'stress-strain-integration' ? (
                <Fact label="Concrete local law">{basicConcrete.stressStrain.type} · εcu = {strain(basicConcrete.limits.epsCu)}</Fact>
              ) : (
                <Fact label="Equivalent-block strain input">εcu = {strain(basicConcrete.limits.epsCu)} · local fibre curve is not used</Fact>
              )}
              <Fact label="Steel inputs">{materialStore.steel.map((steel) => `${steel.name}: fy=${fmt(steel.fy, 3)}, Es=${fmt(steel.elasticModulus, 0)} MPa`).join(' · ')}</Fact>
              <Fact label="Reference frame">x/y about exact net-concrete centroid; Mx=ΣF(y−y0), My=ΣF(x−x0)</Fact>
              <Fact label="Units / sign">N, mm, MPa · compression-positive P</Fact>
              <Fact label="Governing document">{designBasis.identity.document}</Fact>
              <Fact label="Edition / method">{designBasis.identity.edition} · {designBasis.identity.methodId}</Fact>
            </div>
          </Step>

          <IntegrationModel surface={surface} />

          {loading ? <div className="pm-calc-loading"><Loader2 size={17} className="pm-spin" /><span>Re-evaluating the selected stored state in the analysis worker and reconciling every contribution…</span></div> : null}
          {auditError ? <div className="pm-calc-note is-error"><AlertTriangle size={16} /><p><b>Blocking audit failure:</b> {auditError}</p></div> : null}

          {!loading && !auditError && row.kind === 'vertical' && audits.get('selected') ? <>
            <PhysicalAudit audit={audits.get('selected')!} point={row.evidence.point} title="Selected Vertical station" section={section} rebars={rebars} designBasis={designBasis} patternId={`${patternId}-vertical`} />
            <VerticalResult row={row} />
          </> : null}

          {!loading && !auditError && row.kind === 'fixedP' ? <>
            <Step index={3} title="Fixed-P row definition and physical brackets">
              <div className="pm-calc-facts"><Fact label="Selected axial force">{force(row.evidence.fixedP)}</Fact><Fact label="Meridian β / branch">{fmt(row.angleDeg, 5)}° / {row.branch}</Fact></div>
              <FixedPSchematic row={row} />
              <p className="pm-calc-caption">Fixed-P is a surface-edge intersection. The two endpoint calculations below remain separate; no unique strain state is assigned to their interpolation.</p>
            </Step>
            {row.evidence.bracket && audits.get('below') ? <PhysicalAudit audit={audits.get('below')!} point={row.evidence.bracket.below} title={`Lower endpoint · ${row.evidence.belowStation ? stationDefinitionLabel(row.evidence.belowStation.definition) : row.evidence.bracket.below.stationId ?? 'physical state'}`} section={section} rebars={rebars} designBasis={designBasis} patternId={`${patternId}-below`} startIndex={4} /> : null}
            {row.evidence.bracket && !row.evidence.bracket.exact && audits.get('above') ? <PhysicalAudit audit={audits.get('above')!} point={row.evidence.bracket.above} title={`Upper endpoint · ${row.evidence.aboveStation ? stationDefinitionLabel(row.evidence.aboveStation.definition) : row.evidence.bracket.above.stationId ?? 'physical state'}`} section={section} rebars={rebars} designBasis={designBasis} patternId={`${patternId}-above`} startIndex={8} /> : null}
            <FixedPResult row={row} index={row.evidence.bracket?.exact ? 8 : 12} />
          </> : null}
        </div>
      </article>
    </div>
  )
}
