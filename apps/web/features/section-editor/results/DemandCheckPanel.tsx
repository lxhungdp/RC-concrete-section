'use client'

import { useState } from 'react'
import { CheckBasisHelpDialog } from './CheckBasisHelpDialog'
import { demandCheckBasisOf, type DemandCheckBasis, type LoadingsInput, type LoadReference } from '@pm/project'
import dynamic from 'next/dynamic'
const LoadReferencePanel = dynamic(() => import('../loadings/LoadReferencePanel').then(module => module.LoadReferencePanel), { ssr: false })

type Props = {
  loadingsInput: LoadingsInput
  onLoadingsChange: (input: LoadingsInput) => void
  onReferencePreviewChange: (value: LoadReference | null) => void
}

const CHECK_BASIS_OPTIONS: ReadonlyArray<{ value: DemandCheckBasis; label: string; title: string }> = [
  { value: 'proportional3D', label: '3D Load Ray', title: 'Scales P, Mx and My together from the origin.' },
  { value: 'constantAxial', label: 'Constant P', title: 'Holds P = Pu and scales only the moments.' }
]

export function DemandCheckPanel({
  loadingsInput,
  onLoadingsChange,
  onReferencePreviewChange
}: Props) {
  const [helpOpen, setHelpOpen] = useState(false)
  return (
    <>
      <section className="pm-panel-section">
        <div className="pm-field pm-option-field pm-option-field--list">
          <span id="demand-check-basis-label">Check basis</span>
          <div className="pm-check-basis-options" role="radiogroup" aria-labelledby="demand-check-basis-label">
            {CHECK_BASIS_OPTIONS.map(({ value, label, title }) => (
              <label key={value} title={title}>
                <input
                  type="radio"
                  name="demand-check-basis"
                  checked={demandCheckBasisOf(loadingsInput) === value}
                  onChange={() => onLoadingsChange({ ...loadingsInput, checkBasis: value })}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <button type="button" className="ws-action" aria-haspopup="dialog" onClick={() => setHelpOpen(true)}>
          ? 계산 방법
        </button>
      </section>

      <LoadReferencePanel key={`${loadingsInput.reference?.offsetX ?? 0}:${loadingsInput.reference?.offsetY ?? 0}`} input={loadingsInput} onChange={onLoadingsChange} onPreviewChange={onReferencePreviewChange} />
      {helpOpen && <CheckBasisHelpDialog onClose={() => setHelpOpen(false)} />}
    </>
  )
}
