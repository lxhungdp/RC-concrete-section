'use client'

import { QuantityInput } from '../shared/DisplayUnits'
import { ModificationReasonField } from './ModificationReasonField'
import type { Quantity } from '@pm/units'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, Info } from 'lucide-react'
import {
  designProfileGuidance,
  designBasisIssues,
  designBasisRequiresOverrideReason,
  type DesignBasis
} from '@pm/design'

type Props = {
  value: DesignBasis
  onChange: (value: DesignBasis) => void
}

const clone = <T,>(value: T): T => structuredClone(value)

const NumericFactor = ({
  label,
  quantity,
  value,
  min,
  max,
  step,
  help,
  onChange
}: {
  label: string
  quantity?: Quantity
  value: number
  min: number
  max: number
  step: number
  help?: string
  onChange: (value: number) => void
}) => (
  <label className="pm-design-factor" title={help}>
    <span>{label}</span>
    {quantity ? <QuantityInput quantity={quantity} value={value} min={min} max={max} step={step} onValueChange={onChange} /> : <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => {
        const next = Number(event.target.value)
        if (Number.isFinite(next)) onChange(next)
      }}
    />}
  </label>
)

const DesignSelect = ({
  label,
  caption = label,
  wide = false,
  value,
  onChange,
  children
}: {
  label: string
  caption?: string
  wide?: boolean
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) => (
  <label className={`pm-design-field pm-option-field${wide ? ' pm-option-field--wide' : ''}`} title={label}>
    <span>{caption}</span>
    <span className="pm-design-select-wrap">
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </span>
  </label>
)

export function DesignBasisPanel({ value, onChange }: Props) {
  const [draft, setDraft] = useState<DesignBasis>(() => clone(value))
  const [showMethodInfo, setShowMethodInfo] = useState(false)
  useEffect(() => setDraft(clone(value)), [value])

  const issues = useMemo(() => designBasisIssues(draft), [draft])
  const requiresOverrideReason = useMemo(
    () => designBasisRequiresOverrideReason(draft),
    [draft]
  )

  const publishIfValid = (next: DesignBasis) => {
    setDraft(next)
    if (designBasisIssues(next).length === 0) onChange(clone(next))
  }

  const isUserDefinedProfile = draft.profileId === 'custom-user-defined'
  const isAs3600Profile = draft.profileId === 'as-3600-2018-amd2'
  const guidance = useMemo(() => designProfileGuidance(draft.profileId), [draft.profileId])

  const update = (mutate: (next: DesignBasis) => void) => {
    const next = clone(draft)
    mutate(next)
    next.modified = true
    /**
     * Editing a code profile demotes it to `draft`. A user-defined profile is already outside the
     * review ladder, and `user-defined` is the status the project schema pairs with it, so editing
     * must not relabel it as a code profile awaiting review.
     */
    next.verificationStatus = isUserDefinedProfile ? 'user-defined' : 'draft'
    publishIfValid(next)
  }

  return (
    <section className="pm-panel-section pm-design-panel">
      <div className="pm-section-title">
        <h2>Design resistance</h2>
      </div>

      <div className="pm-design-basis-identity">
        <span>{draft.identity.document}</span>
        <strong className={`is-${draft.verificationStatus}`}>{draft.verificationStatus}</strong>
      </div>

      <div className={`pm-disclosure${showMethodInfo ? ' is-open' : ''}`}>
        <button
          type="button"
          className="ws-row-action pm-disclosure-toggle"
          aria-expanded={showMethodInfo}
          onClick={() => setShowMethodInfo((current) => !current)}
          title="Method and standard references"
        >
          <Info size={13} aria-hidden="true" />
          Details
          <ChevronDown size={13} aria-hidden="true" className={showMethodInfo ? 'is-open' : ''} />
        </button>
        {showMethodInfo && (
          <div className="pm-design-method-info">
            <strong>{guidance.title}</strong>
            <p>{guidance.summary}</p>
            <dl>
              <div><dt>Reference curve</dt><dd>{guidance.referenceCurve}</dd></div>
              <div><dt>Design curve</dt><dd>{guidance.designCurve}</dd></div>
              <div><dt>Do not combine</dt><dd>{guidance.doNotCombine}</dd></div>
            </dl>
            <ul>
              {guidance.references.map((reference) => (
                <li key={`${reference.document}-${reference.clause}`}>
                  {reference.url ? (
                    <a href={reference.url} target="_blank" rel="noreferrer">
                      {reference.document}, §{reference.clause} <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  ) : <span>{reference.document}, §{reference.clause}</span>}
                  <small>{reference.subject}</small>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {draft.format === 'globalResultantFactor' ? (
        <>
          {isAs3600Profile && <DesignSelect
            label="AS compression-factor class"
            caption="AS class"
            wide
            value={draft.transverseReinforcement}
            onChange={(classification) =>
                update((next) => {
                  if (next.format === 'globalResultantFactor') {
                    next.transverseReinforcement = classification as typeof next.transverseReinforcement
                  }
                })
              }
          >
              <option value="other">Ordinary column</option>
              <option value="qualifying-spiral" title="Short column, Q/G ≥ 0.25">Short, Q/G ≥ 0.25</option>
          </DesignSelect>}

          <div className="pm-design-group">
            <div className="pm-design-group-title">
              <strong>Strength reduction</strong>
            </div>
            {/* A code profile owns its transition shape; a user-defined profile chooses one. */}
            {isUserDefinedProfile && (
              <DesignSelect
                label="Tension-controlled limit rule"
                caption="Transition rule"
                value={draft.transition.type}
                onChange={(type) =>
                  update((next) => {
                    if (next.format !== 'globalResultantFactor') return
                    if (type === 'yield-plus-strain') {
                      next.transition = { type: 'yield-plus-strain', extraStrain: 0.003 }
                    } else {
                      next.transition = {
                        type: 'fixed-or-yield-multiple',
                        yieldStressThreshold: 400,
                        fixedStrainLimit: 0.005,
                        highStrengthYieldMultiple: 2.5
                      }
                    }
                  })
                }
              >
                <option value="yield-plus-strain" title="εt,limit = εy + Δεt">εy + Δεt</option>
                <option value="fixed-or-yield-multiple" title="εt,limit = fixed, or a multiple of εy above a grade threshold">By grade</option>
              </DesignSelect>
            )}
            <div className="pm-design-factor-grid">
              <NumericFactor
                label={isAs3600Profile ? 'φo' : draft.transverseReinforcement === 'qualifying-spiral' ? 'φc · spiral' : 'φc · ties'}
                value={draft.transverseReinforcement === 'qualifying-spiral' ? draft.factors.phiCompressionSpiral : draft.factors.phiCompressionOther}
                min={0.1}
                max={1}
                step={0.01}
                help={isAs3600Profile
                  ? 'Compression factor for the selected AS compression-factor class.'
                  : 'Compression-controlled strength-reduction factor for the class selected in Materials.'}
                onChange={(factor) =>
                  update((next) => {
                    if (next.format !== 'globalResultantFactor') return
                    if (next.transverseReinforcement === 'qualifying-spiral') next.factors.phiCompressionSpiral = factor
                    else next.factors.phiCompressionOther = factor
                  })
                }
              />
              <NumericFactor
                label={isAs3600Profile ? 'φ · pure tension' : 'φt'}
                value={draft.factors.phiTension}
                min={0.1}
                max={1}
                step={0.01}
                help="Strength-reduction factor at the tension-controlled strain limit."
                onChange={(factor) =>
                  update((next) => {
                    if (next.format === 'globalResultantFactor') next.factors.phiTension = factor
                  })
                }
              />
              {!isAs3600Profile && <NumericFactor
                label={draft.transition.type === 'yield-plus-strain' ? 'Δεt' : 'εt,limit'}
                value={draft.transition.type === 'yield-plus-strain'
                  ? draft.transition.extraStrain
                  : draft.transition.fixedStrainLimit}
                min={0.000001}
                max={0.05}
                step={0.0001}
                help={draft.transition.type === 'yield-plus-strain'
                    ? 'ACI: the tension-controlled limit is εy + Δεt.'
                    : 'KDS: fixed tension-controlled strain limit at or below the threshold grade.'}
                onChange={(factor) =>
                  update((next) => {
                    if (next.format !== 'globalResultantFactor') return
                    if (next.transition.type === 'yield-plus-strain') next.transition.extraStrain = factor
                    else next.transition.fixedStrainLimit = factor
                  })
                }
              />}
              {!isAs3600Profile && draft.transition.type === 'fixed-or-yield-multiple' && (
                <>
                  <NumericFactor
                    label="fy threshold" quantity="stress"
                    value={draft.transition.yieldStressThreshold}
                    min={100}
                    max={1000}
                    step={10}
                    help="The fixed strain limit applies at or below this specified yield stress."
                    onChange={(factor) => update((next) => {
                      if (next.format === 'globalResultantFactor' && next.transition.type === 'fixed-or-yield-multiple') {
                        next.transition.yieldStressThreshold = factor
                      }
                    })}
                  />
                  <NumericFactor
                    label="High-strength εy multiplier"
                    value={draft.transition.highStrengthYieldMultiple}
                    min={1}
                    max={10}
                    step={0.1}
                    help="Above the threshold, the tension-controlled limit equals this multiplier times εy."
                    onChange={(factor) => update((next) => {
                      if (next.format === 'globalResultantFactor' && next.transition.type === 'fixed-or-yield-multiple') {
                        next.transition.highStrengthYieldMultiple = factor
                      }
                    })}
                  />
                </>
              )}
            </div>
          </div>
        </>
      ) : draft.minimumEccentricity ? (
        <div className="pm-design-group">
          <div className="pm-design-group-title">
            <strong>Minimum eccentricity</strong>
          </div>
          <div className="pm-design-factor-grid">
            <NumericFactor
              label="e min · constant" quantity="length"
              value={draft.minimumEccentricity.constantMm}
              min={0}
              max={100}
              step={1}
              help={draft.minimumEccentricity.clauseRef}
              onChange={(factor) => update((next) => {
                if (next.format === 'designMaterialReevaluation' && next.minimumEccentricity) {
                  next.minimumEccentricity.constantMm = factor
                }
              })}
            />
            <NumericFactor
              label="e min · depth factor"
              value={draft.minimumEccentricity.depthFactor}
              min={0}
              max={1}
              step={0.01}
              help={draft.minimumEccentricity.clauseRef}
              onChange={(factor) => update((next) => {
                if (next.format === 'designMaterialReevaluation' && next.minimumEccentricity) {
                  next.minimumEccentricity.depthFactor = factor
                }
              })}
            />
          </div>
        </div>
      ) : null}

      {requiresOverrideReason && <ModificationReasonField key={draft.profileId} className="pm-design-override"
        multiline showExisting={showMethodInfo} value={draft.overrideReason} onChange={(reason) => {
          const next = clone(draft)
          next.overrideReason = reason
          publishIfValid(next)
        }} />}

      {issues.length > 0 && <p className="pm-design-basis-error">{issues[0]}</p>}
    </section>
  )
}
