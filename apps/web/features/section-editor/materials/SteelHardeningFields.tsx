'use client'

import { useId, useMemo, useState, type ReactNode } from 'react'
import { buildResistanceMaterialSets, type DesignBasis } from '@pm/design'
import { compileSteelMaterial, resolveLinearHardeningSteel, type MaterialStore, type SteelMaterial } from '@pm/materials'
import { QuantityInput, useQuantityFormatters } from '../shared/DisplayUnits'
import { MaterialSymbol } from './MaterialSymbol'
import { MaterialCurveFrame, MATERIAL_CURVE_FRAME, spacedTicks } from './MaterialCurveFrame'
import {
  convertSteelHardeningStrengthInput,
  steelHardeningAuthoringPolicy, steelHardeningInputValues, withSteelHardeningStrainLimitValue,
  type CalculationProfileId
} from '@pm/project'

type Model = Extract<SteelMaterial['stressStrain'], { type: 'linear-hardening' }>

/**
 * A numeric editor that keeps the typed text while focused, so partial decimals such as "1." or
 * "0.0" survive until the next keystroke. The display copy never replaces the full-precision model
 * on focus or an unchanged edit. A blank or unparsable draft publishes 0, which the material owner
 * rejects with its own message.
 */
function DraftNumberInput({ label, value, max, readOnly, title, placeholder, decimalText, id, onValueChange }: {
  label: string; value: number | null; max?: number; readOnly?: boolean; title?: string; placeholder?: string
  decimalText?: boolean; id?: string; onValueChange: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const displayed = value === null || value === 0 ? '' : String(Number(value.toPrecision(15)))
  const kind = decimalText ? { type: 'text', inputMode: 'decimal' as const, style: { minWidth: '4ch' } }
    : { type: 'number', step: 'any', min: 0, max }
  return <input id={id} aria-label={label} {...kind} readOnly={readOnly} placeholder={placeholder}
    title={title ?? (value === null ? '' : String(value))}
    value={readOnly ? displayed : draft ?? displayed}
    onFocus={(event) => { if (!readOnly) setDraft(event.currentTarget.value) }} onBlur={() => setDraft(null)}
    onChange={(event) => {
      if (readOnly) return
      const text = event.currentTarget.value
      setDraft(text)
      const parsed = text.trim() === '' ? 0 : Number(text)
      const edited = Number.isFinite(parsed) ? parsed : 0
      if (edited !== value && edited !== Number(displayed)) onValueChange(edited)
    }} />
}

export function SteelHardeningFields({ material, profileId, onChange, onPhysicalLimitChange, toggle }: {
  material: SteelMaterial
  profileId: CalculationProfileId
  onChange: (model: Model) => void
  onPhysicalLimitChange: (value: number | undefined) => void
  toggle: ReactNode
}) {
  const { unit } = useQuantityFormatters()
  const [inputError, setInputError] = useState('')
  const fieldId = useId()
  const model = material.stressStrain
  const values = steelHardeningInputValues(material)
  if (model.type !== 'linear-hardening' || values === null) return <div className="pm-material-hardening-header">{toggle}</div>
  const policy = steelHardeningAuthoringPolicy(profileId)
  const defaultCutoff = model.strainLimit.type === 'factor' && model.strainLimit.value === policy.strainLimit.value
  const update = (definition: Model) => { setInputError(''); onChange(definition) }
  const applyInputChange = (result: ReturnType<typeof convertSteelHardeningStrengthInput>) => {
    if (result.ok) update(result.definition)
    else setInputError(result.error)
  }
  const strainText = (value: number | null) => value === null ? 'pending input' : value.toPrecision(5)
  return <>
  <div className="pm-material-hardening-header">
    {toggle}
    <div className="pm-hardening-strength-options" role="radiogroup" aria-label="Strength input">
        <label><input type="radio" name={`${fieldId}-strength`} aria-label="k = fuk / fy"
          checked={model.ultimateStrength.type === 'ratio'} onChange={() => applyInputChange(convertSteelHardeningStrengthInput(material, 'ratio'))} />
          <span><var>k</var> = <MaterialSymbol symbol="fuk" /> / <MaterialSymbol symbol="fy" /></span></label>
        <label><input type="radio" name={`${fieldId}-strength`} aria-label="fuk"
          checked={model.ultimateStrength.type === 'stress'} onChange={() => applyInputChange(convertSteelHardeningStrengthInput(material, 'stress'))} />
          <span><MaterialSymbol symbol="fuk" /> ({unit('stress')})</span></label>
    </div>
  </div>
  <div className="pm-material-form" role="group" aria-label="Hardening parameters">
    <div className="pm-material-parameters">
      <label className="pm-material-param" htmlFor={`${fieldId}-epsuk`}>
        <span><MaterialSymbol symbol="epsUk" /></span>
        <DraftNumberInput id={`${fieldId}-epsuk`} label="εuk (endpoint)" placeholder="0.05 = 5%"
          value={model.epsUk} onValueChange={(epsUk) => update({ ...model, epsUk })} />
      </label>
      <div className="pm-material-param">
        <span aria-hidden="true" />
        <span className="ws-field-group pm-material-strength-input" role="group" aria-label="Ultimate strength k and fuk"
          title={`k = ${values.strengthRatio ?? 'pending input'}; fuk = ${values.ultimateStress ?? 'pending input'} ${unit('stress')}`}>
          <DraftNumberInput label="Strength ratio k" decimalText
            readOnly={model.ultimateStrength.type !== 'ratio'}
            title={model.ultimateStrength.type === 'ratio' ? 'Entered strength ratio k' : 'Calculated k = fuk / fy. Select k to edit.'}
            value={model.ultimateStrength.type === 'ratio' ? model.ultimateStrength.ratio : values.strengthRatio}
            onValueChange={(ratio) => { if (model.ultimateStrength.type === 'ratio') update({ ...model, ultimateStrength: { type: 'ratio', ratio } }) }} />
          <QuantityInput aria-label="fuk" quantity="stress" showUnit={false} style={{ minWidth: '4ch' }}
            readOnly={model.ultimateStrength.type !== 'stress'} value={values.ultimateStress ?? undefined}
            onValueChange={(stress) => { if (model.ultimateStrength.type === 'stress') update({ ...model, ultimateStrength: { type: 'stress', stress } }) }} />
        </span>
      </div>
    </div>
    <div className="pm-material-parameters">
      <label className="pm-material-param">
        <span><MaterialSymbol symbol="alphaEps" /></span>
        <span className="ws-field-group"><DraftNumberInput label="αε (%)" max={100}
          value={model.strainLimit.type === 'factor' ? values.strainLimitInputValue : values.strainLimitPercent}
          onValueChange={(value) => update(withSteelHardeningStrainLimitValue(model, value, 'factor'))} /><em>%</em></span>
      </label>
      <label className="pm-material-param">
        <span><MaterialSymbol symbol="epsUd" /></span>
        <DraftNumberInput label="εud (ratio)"
          value={model.strainLimit.type === 'absolute' ? values.strainLimitInputValue : values.epsUd}
          onValueChange={(value) => update(withSteelHardeningStrainLimitValue(model, value, 'absolute'))} />
      </label>
    </div>
    <p className="pm-field-note"><MaterialSymbol symbol="epsUd" /> = <MaterialSymbol symbol="alphaEps" /> × <MaterialSymbol symbol="epsUk" /> · {defaultCutoff ? policy.description : 'Project-defined design strain limit.'}</p>
  </div>
  {inputError && <p className="pm-field-note" role="status">{inputError}</p>}
  {material.limits?.epsU !== undefined && <>
    <p className="pm-field-note">Physical <MaterialSymbol symbol="epsPhysical" /> = {material.limits.epsU}.
      {' '}Active tensile limit = {strainText(values.effectiveTensionLimit)}.</p>
    <button type="button" className="ws-action ws-action--compact" onClick={() => onPhysicalLimitChange(undefined)}>Clear physical bound</button>
  </>}
  </>
}

export function SteelStressStrainCurve({ material, store, basis, stage }: {
  material: SteelMaterial
  store: MaterialStore
  basis: DesignBasis
  stage: 'reference' | 'design'
}) {
  const { qfmt, unit } = useQuantityFormatters()
  const preview = useMemo(() => {
    try {
      const sets = buildResistanceMaterialSets(store, basis)
      const selected = stage === 'design' ? sets.designMaterials : sets.referenceMaterials
      const effective = selected.steel.find((steel) => steel.id === material.id)
      if (!effective) throw new Error('Rebar material is unavailable.')
      const law = compileSteelMaterial(effective)
      const p = effective.stressStrain.type === 'linear-hardening' ? resolveLinearHardeningSteel(effective) : null
      const epsY = law.limits.epsYield ?? effective.fy / effective.elasticModulus
      const end = law.limits.epsTensionUltimate ?? p?.epsUd ?? Math.max(2 * epsY, 0.005)
      const extent = Math.max(end, p?.epsUk ?? 0)
      const positive = [0, epsY, end]
      if (effective.stressStrain.type === 'user-curve') {
        positive.push(...effective.stressStrain.points.map((point) => Math.abs(point.strain)).filter((value) => value <= end))
      }
      const strains = [...new Set(positive)].sort((a, b) => a - b)
      const frame = MATERIAL_CURVE_FRAME
      const x = (strain: number) => frame.left + strain / extent * (frame.right - frame.left)
      const stress = (strain: number) => -law.stress(-strain)
      const stressMax = Math.max(1, ...strains.map((value) => Math.abs(stress(value))), p?.ultimateStress ?? 0)
      const y = (value: number) => frame.bottom - value / stressMax * (frame.bottom - frame.peak)
      const path = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'} ${x(value)} ${y(stress(value))}`).join(' ')
      const limitStrain = end
      const constructionStrain = p?.epsUk ?? end
      const designStrain = p?.epsUd ?? end
      const physicalControls = p !== null && end < p.epsUd
      return { path: path(strains), construction: p && p.epsUk > end ? path([limitStrain, constructionStrain]) : '',
        x0: x(0), y0: y(0), xYield: x(epsY), yYield: y(stress(epsY)), xEnd: x(limitStrain), yEnd: y(stress(limitStrain)),
        xConstruction: x(constructionStrain), yConstruction: y(stress(constructionStrain)),
        xDesign: x(designStrain), yDesign: y(stress(designStrain)), designStrain, constructionStrain, physicalControls,
        separateStrainPoints: p !== null && p.epsUd !== p.epsUk,
        staggerStrainLabels: Math.abs(x(designStrain) - x(constructionStrain)) < 24,
        epsY, end, yieldStress: Math.abs(stress(epsY)), endStress: Math.abs(stress(limitStrain)), hardening: p, error: '' }
    } catch (error) {
      // fu > fy is the material owner's hardening rule; k = 1 is a plateau, not a hardening law.
      const ratio = steelHardeningInputValues(material)?.strengthRatio
      if (ratio != null && ratio <= 1) {
        return { error: 'k = fuk / fy must exceed 1 for post-yield hardening. For k = 1 (no hardening), clear Post-yield hardening.' }
      }
      return { error: error instanceof Error ? error.message : 'Complete the rebar definition.' }
    }
  }, [material, store, basis, stage])
  const strainTick = (at: number | undefined, strain: number | undefined) =>
    at === undefined || strain === undefined ? [] : [{ at, label: strain.toFixed(4) }]
  const stressTick = (at: number | undefined, stress: number | undefined) =>
    at === undefined || stress === undefined ? [] : [{ at, label: qfmt('stress', stress, 0) }]
  return <div className="pm-material-curve">
      <MaterialCurveFrame label="Rebar stress strain curve"
        originX={preview.x0 ?? MATERIAL_CURVE_FRAME.left}
        originY={preview.y0 ?? MATERIAL_CURVE_FRAME.bottom}
        stressLabel={<><MaterialSymbol symbol="sigmaS" svg /> ({unit('stress')})</>}
        strainLabel={<><title>Strain (ratio)</title><MaterialSymbol symbol="epsS" svg /></>}
        xTicks={spacedTicks([...strainTick(preview.xYield, preview.epsY), ...strainTick(preview.xEnd, preview.end)])}
        yTicks={spacedTicks([...stressTick(preview.yYield, preview.yieldStress),
          ...stressTick(preview.hardening ? preview.yEnd : undefined, preview.hardening ? preview.endStress : undefined)], 10)}>
        {preview.path && <>
        <path d={preview.path} />
        {preview.construction && <path d={preview.construction} strokeDasharray="3 4" />}
        {preview.construction && <circle cx={preview.xConstruction} cy={preview.yConstruction} r="2" fill="none" stroke="currentColor" />}
        <circle cx={preview.xYield} cy={preview.yYield} r="2" fill="currentColor" />
        <text x={preview.x0 + 3} y={preview.y0 + 10}>0</text>
        <text x={preview.xYield + 3} y={preview.yYield + 11}>yield</text>
        {preview.hardening && <>
          <circle cx={preview.xEnd} cy={preview.yEnd} r="2" fill="currentColor" />
          {preview.physicalControls && <text x={preview.xEnd} y={preview.yEnd + 11} textAnchor="end"><MaterialSymbol symbol="epsPhysical" svg /></text>}
          <g aria-label="Ultimate strain axis markers">
            <line className="pm-material-curve-guide" aria-label="εud guide" x1={preview.xDesign} y1={preview.yDesign}
              x2={preview.xDesign} y2={preview.y0} strokeDasharray="3 4" />
            <circle aria-label="εud axis point" cx={preview.xDesign} cy={preview.y0} r="1.5" fill="currentColor">
              <title>εs = {preview.designStrain}; εud = {preview.hardening.epsUd}</title>
            </circle>
            <text x={preview.xDesign - 2} y={preview.y0 - 6} textAnchor="end">
              <MaterialSymbol symbol="epsUd" svg />
              {!preview.separateStrainPoints && <> = <MaterialSymbol symbol="epsUk" svg /></>}
            </text>
            {preview.separateStrainPoints && <>
              <line className="pm-material-curve-guide" aria-label="εuk guide" x1={preview.xConstruction} y1={preview.yConstruction}
                x2={preview.xConstruction} y2={preview.y0} strokeDasharray="3 4" />
              <circle aria-label="εuk axis point" cx={preview.xConstruction} cy={preview.y0} r="1.5" fill="currentColor">
                <title>εs = {preview.constructionStrain}; εuk = {preview.hardening.epsUk}</title>
              </circle>
              <text x={preview.xConstruction - 2}
                y={preview.y0 - 6 - (preview.staggerStrainLabels ? 12 : 0)}
                textAnchor="end"><MaterialSymbol symbol="epsUk" svg /></text>
            </>}
          </g>
        </>}
        {preview.physicalControls && preview.hardening && preview.hardening.epsUd < preview.hardening.epsUk && <>
          <circle cx={preview.xDesign} cy={preview.yDesign} r="2" fill="none" stroke="currentColor" />
        </>}
        </>}
      </MaterialCurveFrame>
    {preview.path ? <>
      <p><MaterialSymbol symbol="epsY" /> = {preview.epsY?.toPrecision(5)} · <MaterialSymbol symbol="fyEff" /> = {preview.yieldStress === undefined ? '' : qfmt('stress', preview.yieldStress, 3)} {unit('stress')}</p>
      {preview.hardening && <p><MaterialSymbol symbol="epsUd" /> = {preview.hardening.epsUd.toPrecision(5)} · <MaterialSymbol symbol="Eh" /> = {qfmt('modulus', preview.hardening.hardeningModulus, 3)} {unit('modulus')}</p>}
      {preview.physicalControls && <p>Active tensile limit (physical) = {preview.end?.toPrecision(5)}.</p>}
    </> : <p role="status">{preview.error}</p>}
    </div>
}
