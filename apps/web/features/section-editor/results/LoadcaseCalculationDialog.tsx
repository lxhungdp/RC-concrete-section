'use client'

import { AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react'
import type {
  InversePreviewResult,
  LoadcaseQuickCheckResult,
  PreviewSurface,
  Resultant
} from '@pm/analysis'
import type { DesignBasis } from '@pm/design'
import type { LoadCombination } from '@pm/project'
import { CalculationDialogFrame, Fact, Formula, FormulaPanel, Step } from './CalculationDialogFrame'

type Props = {
  projectName: string
  sectionName: string
  loadcase: LoadCombination
  loadcases: readonly LoadCombination[]
  check: LoadcaseQuickCheckResult | null
  inverseResult: InversePreviewResult | null
  surface: PreviewSurface
  designBasis: DesignBasis
  exporting: boolean
  exportError: string | null
  onLoadcaseChange: (id: number) => void
  onExportExcel: () => Promise<void>
  onClose: () => void
}

const fmt = (value: number, digits = 3) => {
  if (!Number.isFinite(value)) return '—'
  const display = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value
  return display.toLocaleString('en-US', { maximumFractionDigits: digits })
}
const forceValue = (value: number) => fmt(value / 1_000, 2)
const momentValue = (value: number) => fmt(value / 1_000_000, 2)
const factorValue = (value: number | null) => value === null ? '—' : fmt(value, 3)
const utilizationValue = (value: number | null) => value === null ? '—' : fmt(value, 2)
const percentValue = (value: number | null) => value === null ? '—' : `${fmt(value * 100, 2)}%`
const strain = (value: number) => Number.isFinite(value) ? value.toExponential(3) : '—'
const degrees = (radians: number | null) => radians === null ? '—' : `${fmt(radians * 180 / Math.PI, 2)}°`

const ResultantTable = ({ demand, capacity }: { demand: Resultant; capacity: Resultant | null }) => (
  <div className="pm-calc-table-wrap">
    <table>
      <thead><tr><th>Vector</th><th>P (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th></tr></thead>
      <tbody>
        <tr><td>Checked demand D</td><td>{forceValue(demand.P)}</td><td>{momentValue(demand.Mx)}</td><td>{momentValue(demand.My)}</td></tr>
        {capacity ? <tr><td>Design capacity R(λcap)</td><td>{forceValue(capacity.P)}</td><td>{momentValue(capacity.Mx)}</td><td>{momentValue(capacity.My)}</td></tr> : null}
      </tbody>
    </table>
  </div>
)

const responseStatus = (inverse: InversePreviewResult) => {
  if (!inverse.converged) return { label: 'Not converged', tone: 'is-error' }
  if (!inverse.admissibility.evaluated) return { label: 'No unique material state', tone: 'is-warning' }
  if (!inverse.admissibility.ok) return { label: 'Inadmissible strain state', tone: 'is-error' }
  return { label: 'Converged diagnostic state', tone: '' }
}

const uncertaintyLabel = (evidence: LoadcaseQuickCheckResult['utilizationInterval']['evidence']) => {
  if (evidence === 'fixed-grid-screening-margin') return 'Fixed-grid screening margin'
  if (evidence === 'adaptive-sampling-estimate') return 'Adaptive sampling estimate'
  return 'Missing capacity intersection'
}

const verdictLabel = (value: LoadcaseQuickCheckResult['adequacy']) =>
  value === 'adequate' ? 'ADEQUATE' : value === 'inadequate' ? 'INADEQUATE' : 'INDETERMINATE'

export function LoadcaseCalculationDialog({
  projectName,
  sectionName,
  loadcase,
  loadcases,
  check,
  inverseResult,
  surface,
  designBasis,
  exporting,
  exportError,
  onLoadcaseChange,
  onExportExcel,
  onClose
}: Props) {
  const checkedDemand = check?.codeAdjustedDemand ?? loadcase
  const verdictTone = check?.adequacy === 'inadequate'
    ? 'is-error'
    : check?.adequacy === 'indeterminate'
      ? 'is-warning'
      : ''
  const inverseStatus = inverseResult ? responseStatus(inverseResult) : null
  const resistance = check?.resistance ?? null

  return (
    <CalculationDialogFrame
      title="CHECK CALCULATION TRACE"
      closeLabel="Close loadcase calculation details"
      bodyKey={String(loadcase.id)}
      onClose={onClose}
      controls={<div className="pm-calculation-dialog__selectors pm-calculation-dialog__selectors--loadcase" aria-label="Loadcase calculation trace selection">
        <label className="pm-calculation-dialog__selector pm-calculation-dialog__selector--row">
          <span>Loadcase</span>
          <select
            aria-label="Calculation trace loadcase"
            value={loadcase.id}
            onChange={(event) => onLoadcaseChange(Number(event.target.value))}
          >
            {loadcases.map((option, index) => (
              <option key={option.id} value={option.id}>{index + 1}. {option.name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="pm-calc-excel-button pm-calc-excel-button--report"
          disabled={exporting}
          onClick={() => void onExportExcel()}
          title="Download the existing Demand Check workbook with this combination worked through in full"
        >
          <span>Excel</span>
          {exporting ? <Loader2 size={15} className="pm-spin" /> : <Download size={15} />}
        </button>
      </div>}
    >
      {exportError ? <div className="pm-calc-note is-error" role="alert"><AlertTriangle size={16} /><p><b>Export failed:</b> {exportError}</p></div> : null}

      <Step index={1} title="Load combination and calculation basis">
        <div className="pm-calc-facts">
          <Fact label="Project / section">{projectName || 'Untitled project'} · {sectionName}</Fact>
          <Fact label="Loadcase">#{loadcase.id} · {loadcase.name}</Fact>
          <Fact label="Action basis">Factored ULS demand</Fact>
          <Fact label="Mechanics">{surface.mechanics === 'stress-strain-integration' ? 'Stress–strain integration' : 'Equivalent rectangular block'}</Fact>
          <Fact label="Calculation profile">{surface.calculationProfileId ?? 'Unavailable'}</Fact>
          <Fact label="Design basis">{designBasis.identity.document} · {designBasis.identity.edition}</Fact>
        </div>
        <p className="pm-calc-caption">Compression-positive P; Mx = ΣF·y and My = ΣF·x about the declared analysis origin. Display rounding does not change the full-precision values used by the calculation. This is Preview evidence, not an accepted or released result.</p>
      </Step>

      <Step index={2} title="Factored demand and code adjustment">
        <div className="pm-calc-table-wrap"><table>
          <thead><tr><th>Demand</th><th>Pu (kN)</th><th>Mux (kN·m)</th><th>Muy (kN·m)</th></tr></thead>
          <tbody>
            <tr><td>Entered factored ULS</td><td>{forceValue(loadcase.P)}</td><td>{momentValue(loadcase.Mx)}</td><td>{momentValue(loadcase.My)}</td></tr>
            {check?.codeAdjustedDemand ? <tr><td>Checked after code adjustment</td><td>{forceValue(checkedDemand.P)}</td><td>{momentValue(checkedDemand.Mx)}</td><td>{momentValue(checkedDemand.My)}</td></tr> : null}
          </tbody>
        </table></div>
        <FormulaPanel>
          {check?.codeAdjustedDemand && check.minimumEccentricityMm !== undefined ? <Formula><span className="pm-calc-math">emin = {fmt(check.minimumEccentricityMm, 2)} mm; the governing code-adjusted moment candidate is carried into both the Design-ray check and inverse diagnostic.</span></Formula> : <Formula><span className="pm-calc-math">Dcheck = Dentered; no code demand adjustment governs this combination.</span></Formula>}
          <Formula><span className="pm-calc-math">θload = atan2(Muy, Mux) = {check ? degrees(check.demandMomentDirection) : 'pending'}; this is the demand direction in Mx–My action space, not a strain-plane β.</span></Formula>
        </FormulaPanel>
      </Step>

      <Step index={3} title="Governing proportional 3D Design-surface check">
        {!check ? <div className="pm-calc-loading"><Loader2 size={17} className="pm-spin" /><span>Checking the current factored demand against the Design surface…</span></div> : <>
          <FormulaPanel>
            <Formula><span className="pm-calc-math">1. Place Dcheck = (Pu, Mux, Muy) in the three-dimensional P–Mx–My action space.</span></Formula>
            <Formula><span className="pm-calc-math">2. Draw one ray from the origin through Dcheck. Along this ray, R(λ) = λ·Dcheck = (λPu, λMux, λMuy), so P, Mx, and My retain their signs and are scaled by the same factor.</span></Formula>
            <Formula><span className="pm-calc-math">3. Starting at λ = 0, increase λ outward. λcap is the smallest positive λ at which this ray meets the Design-resistance surface—the first available resistance boundary in the checked demand direction.</span></Formula>
            {check.proportionalUtilization === 0 && check.capacityMultiplier === null
              ? <Formula><span className="pm-calc-math">4. Dcheck = 0 ⇒ UR = 0; an infinite multiplier is not published as numeric engineering data.</span></Formula>
              : check.capacityMultiplier !== null && check.proportionalUtilization !== null
                ? <Formula><span className="pm-calc-math">4. UR = 1 / λcap = 1 / {factorValue(check.capacityMultiplier)} = {utilizationValue(check.proportionalUtilization)}. Therefore λcap &gt; 1 gives UR &lt; 1, while λcap &lt; 1 gives UR &gt; 1.</span></Formula>
                : <Formula><span className="pm-calc-math">4. UR is unavailable because no valid proportional Design-surface crossing was returned.</span></Formula>}
          </FormulaPanel>
          <ResultantTable demand={checkedDemand} capacity={check.capacityPoint} />
          <div className="pm-calc-facts">
            <Fact label="Definition">{check.utilizationDefinition}</Fact>
            <Fact label="Capacity multiplier λcap">{factorValue(check.capacityMultiplier)}</Fact>
            <Fact label="Governing UR">{utilizationValue(check.proportionalUtilization)}</Fact>
            <Fact label="Resistance format">{resistance?.format ?? 'Unavailable'}</Fact>
            <Fact label="Resistance classification">{resistance?.classification ?? 'Unavailable'}</Fact>
            <Fact label="Axial cap on governing face">{resistance ? (resistance.axialCapApplied ? 'Applied' : 'Not applied') : 'Unavailable'}</Fact>
          </div>
          {resistance ? <p className="pm-calc-caption">Resistance stages: {resistance.stages.join(' → ') || 'none recorded'}. A global resultant factor, when present, is applied by the resistance pipeline exactly once.</p> : null}
          {check.proportionalUtilization === null ? <div className="pm-calc-note is-error"><AlertTriangle size={16} /><p>{check.message}</p></div> : null}
        </>}
      </Step>

      <Step index={4} title="Numerical uncertainty and table verdict">
        {!check ? <div className="pm-calc-note is-warning"><AlertTriangle size={16} /><p>The check verdict is pending for this loadcase revision.</p></div> : <>
          <div className="pm-calc-facts">
            <Fact label="Evidence">{uncertaintyLabel(check.utilizationInterval.evidence)}</Fact>
            <Fact label="Relative uncertainty">{percentValue(check.utilizationInterval.relativeUncertainty)}</Fact>
            <Fact label="UR interval">{utilizationValue(check.utilizationInterval.lower)} – {utilizationValue(check.utilizationInterval.upper)}</Fact>
            <Fact label="Decision shown in table">{verdictLabel(check.adequacy)}</Fact>
          </div>
          <div className={`pm-calc-note ${verdictTone}`}>
            {check.adequacy === 'adequate' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <p><b>{verdictLabel(check.adequacy)}.</b> {check.message}{check.adequacy === 'indeterminate' ? ' The uncertainty interval crosses the decision boundary; refine the sampling before making a decision.' : ''}</p>
          </div>
        </>}
      </Step>

      <Step index={5} title="Inverse equilibrium diagnostic">
        {!inverseResult ? <div className="pm-calc-loading"><Loader2 size={17} className="pm-spin" /><span>Solving the diagnostic equilibrium state for this loadcase…</span></div> : <>
          <div className={`pm-calc-note ${inverseStatus?.tone ?? ''}`}>
            {inverseResult.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <p><b>{inverseStatus?.label}.</b> This state explains section response; adequacy remains governed by Step 3, not by inverse convergence or the fixed-P ratio.</p>
          </div>
          <div className="pm-calc-facts">
            <Fact label="ε₀">{strain(inverseResult.state.e0)}</Fact>
            <Fact label="κx / κy">{strain(inverseResult.state.kx)} / {strain(inverseResult.state.ky)} mm⁻¹</Fact>
            <Fact label="Iterations">{fmt(inverseResult.iterations, 0)}</Fact>
            <Fact label="Scaled residual norm">{inverseResult.residualNorm.toExponential(3)}</Fact>
            <Fact label="Concrete compression">{inverseResult.admissibility.evaluated ? `${strain(inverseResult.admissibility.maxConcreteCompression)} / ${strain(inverseResult.admissibility.concreteLimit)}` : 'Not evaluated on geometric cap face'}</Fact>
            <Fact label="Steel tension">{inverseResult.admissibility.evaluated ? `${strain(inverseResult.admissibility.maxSteelTension)} / ${inverseResult.admissibility.steelTensionLimit === null ? 'undeclared limit' : strain(inverseResult.admissibility.steelTensionLimit)}` : 'Not evaluated on geometric cap face'}</Fact>
          </div>
          {inverseResult.equivalentBlock ? <div className="pm-calc-facts">
            <Fact label="Neutral-axis depth c">{fmt(inverseResult.equivalentBlock.neutralAxisDepth, 2)} mm</Fact>
            <Fact label="Equivalent block depth a">{fmt(inverseResult.equivalentBlock.blockDepth, 2)} mm</Fact>
            <Fact label="β1">{fmt(inverseResult.equivalentBlock.beta1, 3)}</Fact>
            <Fact label="Block normal">{degrees(inverseResult.equivalentBlock.neutralAxisAngle)}</Fact>
          </div> : null}
          <div className="pm-calc-table-wrap"><table>
            <thead><tr><th>Equilibrium vector</th><th>P (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th></tr></thead>
            <tbody>
              <tr><td>Checked demand</td><td>{forceValue(checkedDemand.P)}</td><td>{momentValue(checkedDemand.Mx)}</td><td>{momentValue(checkedDemand.My)}</td></tr>
              <tr><td>Section response</td><td>{forceValue(inverseResult.response.P)}</td><td>{momentValue(inverseResult.response.Mx)}</td><td>{momentValue(inverseResult.response.My)}</td></tr>
              <tr><td>Residual R − D</td><td>{forceValue(inverseResult.residual.P)}</td><td>{momentValue(inverseResult.residual.Mx)}</td><td>{momentValue(inverseResult.residual.My)}</td></tr>
            </tbody>
          </table></div>
          <p className="pm-calc-caption">{inverseResult.message}</p>
        </>}
      </Step>

      <Step index={6} title="Secondary fixed-P moment diagnostic">
        {!check ? <div className="pm-calc-note is-warning"><AlertTriangle size={16} /><p>Fixed-P evidence is pending.</p></div> : check.fixedPUtilization === null || check.fixedPCapacityMoment === null ? (
          <div className="pm-calc-note is-warning"><AlertTriangle size={16} /><p>No unique fixed-P moment-ray ratio is available for this combination. This does not replace or invalidate the governing proportional 3D result above.</p></div>
        ) : <>
          <FormulaPanel><Formula><span className="pm-calc-math">URfixed-P = Mcheck / Mb = {momentValue(check.fixedPDemandMoment)} / {momentValue(check.fixedPCapacityMoment)} = {utilizationValue(check.fixedPUtilization)}</span></Formula></FormulaPanel>
          <div className="pm-calc-facts">
            <Fact label="Demand moment magnitude">{fmt(check.fixedPDemandMoment / 1_000_000, 2)} kN·m</Fact>
            <Fact label="Fixed-P boundary Mb">{fmt(check.fixedPCapacityMoment / 1_000_000, 2)} kN·m</Fact>
            <Fact label="Fixed-P UR">{utilizationValue(check.fixedPUtilization)}</Fact>
            <Fact label="Status">Secondary diagnostic only</Fact>
          </div>
          {check.contourPoint ? <div className="pm-calc-table-wrap"><table>
            <thead><tr><th>Fixed-P capacity point</th><th>P (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th></tr></thead>
            <tbody><tr><td>Moment-ray intersection</td><td>{forceValue(check.contourPoint.P)}</td><td>{momentValue(check.contourPoint.Mx)}</td><td>{momentValue(check.contourPoint.My)}</td></tr></tbody>
          </table></div> : null}
          <p className="pm-calc-caption">The complete Excel action above reuses the Demand Check workbook and works this loadcase through inverse, exact vertical-meridian, and fixed-P bracket/interpolation sheets.</p>
        </>}
      </Step>
    </CalculationDialogFrame>
  )
}
