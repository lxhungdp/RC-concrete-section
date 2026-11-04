'use client'

import { Eye, EyeOff } from 'lucide-react'
import { demandCheckBasisOf, type DemandCheckBasis, type LoadingsInput, type LoadReference } from '@pm/project'
import dynamic from 'next/dynamic'
const LoadReferencePanel = dynamic(() => import('../loadings/LoadReferencePanel').then(module => module.LoadReferencePanel), { ssr: false })
import {
  DEMAND_CHART_IDS,
  demandChartLabel,
  toggleChartVisibility,
  type DemandCheckView
} from './results-view'

type Props = {
  view: DemandCheckView
  onViewChange: (patch: Partial<DemandCheckView>) => void
  loadingsInput: LoadingsInput
  onLoadingsChange: (input: LoadingsInput) => void
  onReferencePreviewChange: (value: LoadReference | null) => void
}

const CHECK_BASIS_OPTIONS: ReadonlyArray<{ value: DemandCheckBasis; label: string; title: string }> = [
  { value: 'proportional3D', label: '3D load ray', title: 'Scales P, Mx and My together from the origin.' },
  { value: 'constantAxial', label: 'Constant P', title: 'Holds P = Pu and scales only the moments.' }
]

const shortDemandLabel = (id: (typeof DEMAND_CHART_IDS)[number]) =>
  id === 'heatmap' ? 'Field' : id === 'fixedP' ? 'Fixed-P' : 'Vertical'

export function DemandCheckPanel({
  view,
  onViewChange,
  loadingsInput,
  onLoadingsChange,
  onReferencePreviewChange
}: Props) {
  return (
    <>
      <section className="pm-panel-section pm-chart-toggle-section">
        <div className="pm-chart-visibility-row" role="toolbar" aria-label="Chart visibility">
          {DEMAND_CHART_IDS.map((id) => {
            const on = view.visibleCharts[id]
            return (
              <button
                key={id}
                type="button"
                className={`ws-action pm-chart-visibility-btn${on ? ' is-on' : ''}`}
                aria-pressed={on}
                title={on ? `Hide ${demandChartLabel(id)}` : `Show ${demandChartLabel(id)}`}
                onClick={() => onViewChange(toggleChartVisibility(view, DEMAND_CHART_IDS, id))}
              >
                {on ? <Eye size={12} /> : <EyeOff size={12} />}
                <span>{shortDemandLabel(id)}</span>
              </button>
            )
          })}
        </div>
      </section>

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
      </section>

      <LoadReferencePanel key={`${loadingsInput.reference?.offsetX ?? 0}:${loadingsInput.reference?.offsetY ?? 0}`} input={loadingsInput} onChange={onLoadingsChange} onPreviewChange={onReferencePreviewChange} />
    </>
  )
}
