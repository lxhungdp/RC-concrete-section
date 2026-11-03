'use client'

import { Eye, EyeOff } from 'lucide-react'
import type { LoadingsInput, LoadReference } from '@pm/project'
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

      <LoadReferencePanel key={`${loadingsInput.reference?.offsetX ?? 0}:${loadingsInput.reference?.offsetY ?? 0}`} input={loadingsInput} onChange={onLoadingsChange} onPreviewChange={onReferencePreviewChange} />
    </>
  )
}
