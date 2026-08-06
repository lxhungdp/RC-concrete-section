'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, Info, RotateCcw } from 'lucide-react'
import {
  createAci318DesignBasis,
  createAs3600DesignBasis,
  createCustomDesignBasis,
  createEn1992DesignBasis,
  createKdsAppendixDesignBasis,
  createKdsBasicDesignBasis,
  designProfileGuidance,
  resolveMaterialFactorExpression,
  designBasisIssues,
  designBasisRequiresOverrideReason,
  type DesignBasis,
  type DesignProfileId
} from '@pm/design'

type Props = {
  value: DesignBasis
  onChange: (value: DesignBasis) => void
}

const clone = <T,>(value: T): T => structuredClone(value)

const profileDefaults = (profileId: DesignProfileId): DesignBasis => {
  if (profileId === 'aci-318-19-22') return createAci318DesignBasis()
  if (profileId === 'en-1992-1-1-2004-default') return createEn1992DesignBasis()
  if (profileId === 'kds-142020-2022-appendix-material-factors') return createKdsAppendixDesignBasis()
  if (profileId === 'as-3600-2018-amd2') return createAs3600DesignBasis()
  if (profileId === 'custom-user-defined') return createCustomDesignBasis()
  return createKdsBasicDesignBasis()
}

const NumericFactor = ({
  label,
  value,
  min,
  max,
  step,
  help,
  readOnly = false,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  help?: string
  readOnly?: boolean
  onChange: (value: number) => void
}) => (
  <label className="pm-design-factor" title={help}>
    <span>{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      readOnly={readOnly}
      onChange={(event) => {
        const next = Number(event.target.value)
        if (Number.isFinite(next)) onChange(next)
      }}
    />
  </label>
)

const DesignSelect = ({
  label,
  value,
  onChange,
  children
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) => (
  <label className="pm-design-field">
    <span>{label}</span>
    <span className="pm-design-select-wrap">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
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
  const isKdsProfile = draft.profileId === 'kds-2024-current-set' ||
    draft.profileId === 'kds-basic-2021-2022' ||
    draft.profileId === 'kds-142020-2022-appendix-material-factors'
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

  const useDefaults = () => publishIfValid(profileDefaults(draft.profileId))

  return (
    <section className="pm-panel-section pm-design-panel">
      <div className="pm-section-title pm-section-title--with-action">
        <div>
          <h2>Design resistance</h2>
          <p>Design resistance derived from nominal capacity for factored ULS demand checks</p>
        </div>
        <button
          type="button"
          className="pm-table-icon-btn"
          title={draft.format === 'designMaterialReevaluation'
            ? 'Edit and restore material partial factors from Materials'
            : 'Restore the selected profile defaults'}
          disabled={draft.format === 'designMaterialReevaluation'}
          onClick={useDefaults}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="pm-design-basis-identity">
        <span>{draft.identity.document}</span>
        <strong className={`is-${draft.verificationStatus}`}>{draft.verificationStatus}</strong>
      </div>

      {isKdsProfile && (
        <DesignSelect
          label="Design Method"
          value={draft.profileId === 'kds-142020-2022-appendix-material-factors' ? draft.profileId : 'kds-2024-current-set'}
          onChange={(profileId) => publishIfValid(
            profileId === 'kds-142020-2022-appendix-material-factors'
              ? createKdsAppendixDesignBasis()
              : createKdsBasicDesignBasis()
          )}
        >
          <option value="kds-2024-current-set">Strength Reduction Factor — KDS 14 20 10 / 20</option>
          <option value="kds-142020-2022-appendix-material-factors">Material Factor — KDS 14 20 20 Appendix</option>
        </DesignSelect>
      )}

      <div className={`pm-disclosure${showMethodInfo ? ' is-open' : ''}`}>
        <button
          type="button"
          className="pm-disclosure-toggle"
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
          <DesignSelect
            label={isAs3600Profile ? 'AS compression-factor class' : 'Transverse reinforcement'}
            value={draft.transverseReinforcement}
            onChange={(classification) =>
                update((next) => {
                  if (next.format === 'globalResultantFactor') {
                    next.transverseReinforcement = classification as typeof next.transverseReinforcement
                  }
                })
              }
          >
              <option value="other">
                {isAs3600Profile ? 'Ordinary column (phi_o = 0.60)' : 'Ties / other'}
              </option>
              <option value="qualifying-spiral">
                {isAs3600Profile ? 'Short column, Q/G >= 0.25 (phi_o = 0.65)' : 'Qualifying spiral'}
              </option>
          </DesignSelect>
          <p className="pm-design-help">
            {isAs3600Profile
              ? 'AS 3600 Table 2.2.2 uses phi_o = 0.65 for the declared short-column high-permanent-load case; otherwise this preview uses 0.60.'
              : draft.transverseReinforcement === 'qualifying-spiral'
              ? 'Continuous helical reinforcement that satisfies every code requirement for a qualifying spiral. A circular section alone is not sufficient.'
              : 'Closed hoops and crossties, or any transverse reinforcement that does not qualify as a code-compliant continuous spiral.'}
          </p>

          <div className="pm-design-group">
            <div className="pm-design-group-title">
              <strong>Strength reduction</strong>
              <span>Applied to the complete P-Mx-My resultant</span>
            </div>
            {isAs3600Profile && (
              <p className="pm-design-help">
                The AS adapter evaluates bending phi from k_uo and interpolates combined axial
                compression/tension using the balanced and pure-tension axial capacities.
              </p>
            )}
            {/* A code profile owns its transition shape; a user-defined profile chooses one. */}
            {isUserDefinedProfile && (
              <DesignSelect
                label="Tension-controlled limit rule"
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
                <option value="yield-plus-strain">εt,limit = εy + Δεt</option>
                <option value="fixed-or-yield-multiple">εt,limit = fixed, or a multiple of εy above a grade threshold</option>
              </DesignSelect>
            )}
            <div className="pm-design-factor-grid">
              <NumericFactor
                label={isAs3600Profile ? 'φo · ordinary' : 'φc · ties'}
                value={draft.factors.phiCompressionOther}
                min={0.1}
                max={1}
                step={0.01}
                help={isAs3600Profile
                  ? 'AS compression factor for ordinary reinforced-concrete sections.'
                  : 'Compression-controlled strength-reduction factor for tied or other columns.'}
                onChange={(factor) =>
                  update((next) => {
                    if (next.format === 'globalResultantFactor') next.factors.phiCompressionOther = factor
                  })
                }
              />
              <NumericFactor
                label={isAs3600Profile ? 'φo · Q/G >= 0.25' : 'φc · spiral'}
                value={draft.factors.phiCompressionSpiral}
                min={0.1}
                max={1}
                step={0.01}
                help={isAs3600Profile
                  ? 'AS compression factor for a short column with Q/G at least 0.25.'
                  : 'Compression-controlled factor available only to a code-qualifying spiral.'}
                onChange={(factor) =>
                  update((next) => {
                    if (next.format === 'globalResultantFactor') next.factors.phiCompressionSpiral = factor
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
              <NumericFactor
                label={draft.transition.type === 'yield-plus-strain' ? 'Δεt' : 'εt,limit'}
                value={draft.transition.type === 'yield-plus-strain'
                  ? draft.transition.extraStrain
                  : draft.transition.fixedStrainLimit}
                min={0.000001}
                max={0.05}
                step={0.0001}
                readOnly={isAs3600Profile}
                help={isAs3600Profile
                  ? 'Compatibility field retained by the common design schema; the AS adapter derives phi from k_uo and does not use it.'
                  : draft.transition.type === 'yield-plus-strain'
                    ? 'ACI: the tension-controlled limit is εy + Δεt.'
                    : 'KDS: fixed tension-controlled strain limit at or below the threshold grade.'}
                onChange={(factor) =>
                  update((next) => {
                    if (next.format !== 'globalResultantFactor') return
                    if (next.transition.type === 'yield-plus-strain') next.transition.extraStrain = factor
                    else next.transition.fixedStrainLimit = factor
                  })
                }
              />
              {!isAs3600Profile && draft.transition.type === 'fixed-or-yield-multiple' && (
                <>
                  <NumericFactor
                    label="fy threshold (MPa)"
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
            <dl className="pm-design-definitions">
              <div>
                <dt>φc</dt>
                <dd>Factor for a compression-controlled section; the active value depends on ties or spiral.</dd>
              </div>
              <div>
                <dt>φt</dt>
                <dd>Factor for a tension-controlled section.</dd>
              </div>
              <div>
                <dt>Δεt</dt>
                <dd>Strain interval over which φ changes from φc to φt.</dd>
              </div>
            </dl>
          </div>

          {!isAs3600Profile && <div className="pm-design-group">
            <div className="pm-design-group-title">
              <strong>Axial compression limit</strong>
              <span>Creates the horizontal cap visible at the top of a P-M slice</span>
            </div>
            <div className="pm-design-factor-grid">
              <NumericFactor
                label="Pn,max · ties"
                value={draft.factors.axialCapOther}
                min={0.1}
                max={1}
                step={0.01}
                help="Maximum axial-resistance ratio for tied or other columns."
                onChange={(factor) =>
                  update((next) => {
                    if (next.format === 'globalResultantFactor') next.factors.axialCapOther = factor
                  })
                }
              />
              <NumericFactor
                label="Pn,max · spiral"
                value={draft.factors.axialCapSpiral}
                min={0.1}
                max={1}
                step={0.01}
                help="Maximum axial-resistance ratio for a code-qualifying spiral."
                onChange={(factor) =>
                  update((next) => {
                    if (next.format === 'globalResultantFactor') next.factors.axialCapSpiral = factor
                  })
                }
              />
            </div>
            {isUserDefinedProfile ? (
              <label className={`pm-field-check pm-design-cap-check${draft.axialCapEnabled ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={draft.axialCapEnabled}
                  onChange={(event) =>
                    update((next) => {
                      if (next.format === 'globalResultantFactor') next.axialCapEnabled = event.target.checked
                    })
                  }
                />
                Apply maximum axial-compression limit
              </label>
            ) : (
              <p className="pm-design-help">
                This limit is mandatory for the selected code profile. An uncapped curve may be
                shown only as a diagnostic and is never used for the Design check.
              </p>
            )}
            <p className="pm-design-help">
              Limits the usable design compression to the selected fraction of the factored
              compression pole. The defaults are 0.80 for ties/other and 0.85 for a qualifying
              spiral; this produces the horizontal cap on a P-M slice.
            </p>
          </div>}
        </>
      ) : (
        <div className="pm-design-group">
          <div className="pm-design-group-title">
            <strong>Design material strengths</strong>
            <span>Materials are reevaluated at the same strain state</span>
          </div>
          <div className="pm-design-factor-grid">
            {[...draft.factors.concrete.components, ...draft.factors.reinforcement.components].map((component) => (
              <NumericFactor
                key={component.id}
                label={component.symbol}
                value={component.value}
                min={0.1}
                max={3}
                step={component.id.startsWith('gamma') ? 0.05 : 0.01}
                readOnly
                help={`${component.label}. ${component.clauseRef}`}
                onChange={() => undefined}
              />
            ))}
          </div>
          <dl className="pm-design-definitions">
            <div>
              <dt>Concrete multiplier</dt>
              <dd>{resolveMaterialFactorExpression(draft.factors.concrete).toFixed(5)}</dd>
            </div>
            <div>
              <dt>Steel multiplier</dt>
              <dd>{resolveMaterialFactorExpression(draft.factors.reinforcement).toFixed(5)}</dd>
            </div>
            <div>
              <dt>Resultant φ</dt>
              <dd>Not applied</dd>
            </div>
          </dl>
          {draft.minimumEccentricity && (
            <p className="pm-design-help">
              Minimum eccentricity verification: e_min = {draft.minimumEccentricity.constantMm} + {draft.minimumEccentricity.depthFactor}h mm.
              This is a demand-side rule, not a horizontal capacity cap.
            </p>
          )}
          <p className="pm-design-help">Material-factor values are edited in Materials; the resistance profile remains their canonical source.</p>
        </div>
      )}

      {requiresOverrideReason && (
        <label className="pm-design-override">
          <span>Reason for modification</span>
          <textarea
            rows={2}
            value={draft.overrideReason}
            placeholder="State the approved project basis for changing the code defaults"
            onChange={(event) => {
              const next = clone(draft)
              next.overrideReason = event.target.value
              publishIfValid(next)
            }}
          />
          <small>
            Required for traceability because this profile no longer matches the stored code
            defaults. It is included in the project file and Excel audit.
          </small>
        </label>
      )}

      {issues.length > 0 && <p className="pm-design-basis-error">{issues[0]}</p>}
      <p className="pm-design-auto-save">
        Valid changes are applied automatically.
      </p>
    </section>
  )
}
