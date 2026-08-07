'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  createAci318DesignBasis,
  createAs3600DesignBasis,
  createCustomDesignBasis,
  createEn1992DesignBasis,
  createKdsAppendixDesignBasis,
  createKdsBasicDesignBasis,
  type DesignBasis,
  type DesignProfileId
} from '@pm/design'
import {
  DESIGN_CODES,
  calculationProfile,
  calculationProfilesForCode,
  type CalculationProfileId,
  type DesignCodeId
} from '@pm/project'

type Props = {
  calculationProfileId: CalculationProfileId
  designBasis: DesignBasis
  onCalculationProfileChange: (profileId: CalculationProfileId) => void
  onDesignBasisChange: (basis: DesignBasis) => void
}

const createDesignBasisForProfile = (profileId: DesignProfileId): DesignBasis => {
  switch (profileId) {
    case 'aci-318-19-22': return createAci318DesignBasis()
    case 'as-3600-2018-amd2': return createAs3600DesignBasis()
    case 'custom-user-defined': return createCustomDesignBasis()
    case 'en-1992-1-1-2004-default': return createEn1992DesignBasis()
    case 'kds-142020-2022-appendix-material-factors': return createKdsAppendixDesignBasis()
    case 'kds-2024-current-set':
    case 'kds-basic-2021-2022': return createKdsBasicDesignBasis()
    default: return profileId satisfies never
  }
}

const designMethodLabel = (profileId: DesignProfileId) => {
  switch (profileId) {
    case 'aci-318-19-22': return 'φ reduction'
    case 'as-3600-2018-amd2': return 'φ reduction'
    case 'custom-user-defined': return 'User-defined'
    case 'en-1992-1-1-2004-default': return 'Material factors'
    case 'kds-142020-2022-appendix-material-factors': return 'Material factors'
    case 'kds-2024-current-set':
    case 'kds-basic-2021-2022': return 'φ reduction'
    default: return profileId satisfies never
  }
}

const analysisMethodLabel = (profileId: CalculationProfileId) =>
  calculationProfile(profileId).mechanics === 'stress-strain-integration'
    ? 'Stress–strain'
    : 'Eq. stress block'

export function CalculationBasisToolbar({
  calculationProfileId,
  designBasis,
  onCalculationProfileChange,
  onDesignBasisChange
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState({ left: 0, top: 0 })
  const toolbarRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverId = useId()
  const profile = calculationProfile(calculationProfileId)
  const codeProfiles = profile.code ? calculationProfilesForCode(profile.code) : [profile]
  const designProfileIds = profile.allowedDesignProfileIds ?? [profile.designProfileId]
  const designProfileId = designProfileIds.includes(designBasis.profileId)
    ? designBasis.profileId
    : profile.designProfileId
  const analysisLabel = analysisMethodLabel(calculationProfileId)
  const designLabel = designMethodLabel(designProfileId)

  const positionPopover = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const menuWidth = 264
    const viewportPadding = 8
    setPopoverPosition({
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding)),
      top: rect.bottom + 4
    })
  }, [])

  useLayoutEffect(() => {
    if (isOpen) positionPopover()
  }, [isOpen, positionPopover])

  useEffect(() => {
    if (!isOpen) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', positionPopover)
      window.removeEventListener('scroll', positionPopover, true)
    }
  }, [isOpen, positionPopover])

  return (
    <section ref={toolbarRef} className="pm-calculation-toolbar" aria-label="Calculation basis">
      <button
        ref={triggerRef}
        className="pm-calculation-summary"
        type="button"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        title={`${profile.standard} · ${analysisLabel} · ${designLabel}`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="pm-calculation-code">{profile.standard}</span>
        <span className="pm-calculation-options">
          <span>{analysisLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{designLabel}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          id={popoverId}
          className="pm-calculation-popover"
          role="dialog"
          aria-label="Change calculation basis"
          style={{ left: popoverPosition.left, top: popoverPosition.top }}
        >
          <label className="pm-calculation-field">
            <span>Code</span>
            <select
              value={profile.code ?? 'legacy-user-defined'}
              aria-label="Design code"
              title={profile.standard}
              onChange={(event) => {
                const next = calculationProfilesForCode(event.target.value as DesignCodeId)[0]
                if (next) onCalculationProfileChange(next.id)
              }}
            >
              {profile.code === null && <option value="legacy-user-defined">Custom · User-defined</option>}
              {DESIGN_CODES.map((code) => (
                <option
                  key={code.id}
                  value={code.id}
                  disabled={calculationProfilesForCode(code.id).length === 0}
                >
                  {code.label} · {code.description}{code.implementationStatus === 'preview' ? ' · Preview' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className={`pm-calculation-field${codeProfiles.length <= 1 ? ' is-fixed' : ''}`}>
            <span>Method</span>
            <select
              value={calculationProfileId}
              aria-label="Section analysis method"
              title={profile.methodLabel}
              disabled={codeProfiles.length <= 1}
              onChange={(event) => onCalculationProfileChange(event.target.value as CalculationProfileId)}
            >
              {codeProfiles.map((method) => (
                <option key={method.id} value={method.id}>{analysisMethodLabel(method.id)}</option>
              ))}
            </select>
          </label>

          <label className={`pm-calculation-field${designProfileIds.length <= 1 ? ' is-fixed' : ''}`}>
            <span>Design</span>
            <select
              value={designProfileId}
              aria-label="Design method"
              title={designLabel}
              disabled={designProfileIds.length <= 1}
              onChange={(event) => onDesignBasisChange(
                createDesignBasisForProfile(event.target.value as DesignProfileId)
              )}
            >
              {designProfileIds.map((profileId) => (
                <option key={profileId} value={profileId}>{designMethodLabel(profileId)}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  )
}
