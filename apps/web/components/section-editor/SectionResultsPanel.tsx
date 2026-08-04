'use client'

import { Eye, EyeOff, Maximize2 } from 'lucide-react'
import {
  SECTION_CHART_IDS,
  sectionChartLabel,
  toggleChartVisibility,
  type SectionChartId,
  type SectionResultsView
} from './results-view'

export type SectionResultsSummary = {
  hasAppliedSection: boolean
  status: 'idle' | 'working' | 'error'
  message: string
  concreteArea: number
  steelArea: number
  rebarCount: number
  meshCells: number
  meshPoints: number
  surfacePoints: number
  directionCount: number
  stationCount: number
  /** Adaptive-refinement evidence, or null when the surface has none yet. */
  refinement: {
    tolerance: number
    maxRelative: number
    withinTolerance: boolean
  } | null
  warnings: string[]
  mechanics: 'stress-strain-integration' | 'equivalent-rectangular-block' | null
}

type Props = {
  summary: SectionResultsSummary
  view: SectionResultsView
  onViewChange: (patch: Partial<SectionResultsView>) => void
  /** Vertical-slice angle ceiling: 180° once the opposite half-plane is drawn too. */
  angleSliderMax: number
  fixedP: number
  fixedPRange: { min: number; max: number }
  onFixedPChange: (value: number) => void
}

const integer = (value: number) => Math.round(value).toLocaleString('en-US')

const Check = ({
  label,
  checked,
  disabled,
  onChange
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) => (
  <label className={`pm-field-check${checked ? ' is-on' : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    {label}
  </label>
)

const Slider = ({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}) => (
  <div className="pm-result-slider">
    <div className="pm-result-slider-head">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
      <em>{unit}</em>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
    />
  </div>
)

export function SectionResultsPanel({
  summary,
  view,
  onViewChange,
  angleSliderMax,
  fixedP,
  fixedPRange,
  onFixedPChange
}: Props) {
  const fixedPKn = fixedP / 1000
  const minKn = fixedPRange.min / 1000
  const maxKn = fixedPRange.max / 1000
  /**
   * Turning both resistance stages off would draw an empty plot, so the last one stays on. This is
   * the same rule the chart headers used to enforce; it moved with the controls.
   */
  const setResistance = (patch: Partial<Pick<SectionResultsView, 'showDesignResistance' | 'showNominalReference'>>) => {
    const next = { ...view, ...patch }
    if (!next.showDesignResistance && !next.showNominalReference) return
    onViewChange(patch)
  }

  return (
    <>
      <section className="pm-panel-section">
        <div className="pm-section-title">
          <div>
            <h2>Section capacity</h2>
            <p>Resistance surface of the applied section, independent of any load combination.</p>
          </div>
        </div>
        <div className="pm-result-status-list">
          <span>Applied section</span>
          <strong>{summary.hasAppliedSection ? 'Ready' : 'Missing'}</strong>
          <span>Analysis</span>
          <strong>
            {summary.status === 'working' ? 'Calculating…' : summary.status === 'error' ? 'Error' : 'Ready'}
          </strong>
          <span>Method</span>
          <strong>
            {summary.mechanics === 'equivalent-rectangular-block'
              ? 'Equivalent block'
              : summary.mechanics === 'stress-strain-integration'
                ? 'Stress–strain'
                : '—'}
          </strong>
          <span>Ac</span>
          <strong>{summary.hasAppliedSection ? `${integer(summary.concreteArea)} mm²` : '—'}</strong>
          <span>As</span>
          <strong>{`${integer(summary.steelArea)} mm²`}</strong>
          <span>Rebars</span>
          <strong>{summary.rebarCount}</strong>
        </div>
        {summary.message ? <p className="pm-field-note">{summary.message}</p> : null}
      </section>

      <section className="pm-panel-section">
        <div className="pm-section-title">
          <div>
            <h2>Sampling evidence</h2>
            <p>What the surface actually resolved. Edit the schedule itself in Analysis Options.</p>
          </div>
        </div>
        <div className="pm-result-status-list">
          <span>Surface points</span>
          <strong>{integer(summary.surfacePoints)}</strong>
          <span>Directions</span>
          <strong>{summary.directionCount}</strong>
          <span>Stations</span>
          <strong>{summary.stationCount}</strong>
          {summary.mechanics === 'stress-strain-integration' ? (
            <>
              <span>Mesh cells</span>
              <strong>{integer(summary.meshCells)}</strong>
              <span>Mesh points</span>
              <strong>{integer(summary.meshPoints)}</strong>
            </>
          ) : (
            <>
              <span>Concrete mesh</span>
              <strong>exact clipping</strong>
            </>
          )}
          {summary.refinement ? (
            <>
              <span>Interp. error</span>
              <strong className={summary.refinement.withinTolerance ? '' : 'is-warning'}>
                {`${(summary.refinement.maxRelative * 100).toFixed(3)}% / ${(
                  summary.refinement.tolerance * 100
                ).toFixed(2)}%`}
              </strong>
            </>
          ) : null}
        </div>
        {summary.warnings.map((warning) => (
          <p key={warning} className="pm-field-error">{warning}</p>
        ))}
      </section>

      <section className="pm-panel-section">
        <div className="pm-section-title">
          <div>
            <h2>Vertical slice</h2>
            <p>Plane through the P axis at the selected in-section angle.</p>
          </div>
        </div>
        <Slider
          label="Angle"
          value={view.sliceAngle}
          min={0}
          max={angleSliderMax}
          step={15}
          unit="deg"
          onChange={(sliceAngle) => onViewChange({ sliceAngle })}
        />
        <div className="pm-result-check-row">
          <Check
            label="Opposite half"
            checked={view.includeOppositeMoment}
            onChange={(includeOppositeMoment) => onViewChange({ includeOppositeMoment })}
          />
        </div>
      </section>

      <section className="pm-panel-section">
        <div className="pm-section-title">
          <div>
            <h2>Fixed-P contour</h2>
            <p>Mx–My section of the surface at a constant axial force.</p>
          </div>
        </div>
        <Slider
          label="P"
          value={Number(fixedPKn.toFixed(1))}
          min={Number(minKn.toFixed(1))}
          max={Number(maxKn.toFixed(1))}
          step={Math.max(1, Math.round((maxKn - minKn) / 240))}
          unit="kN"
          onChange={(value) => onFixedPChange(value * 1000)}
        />
        <div className="pm-result-check-row">
          <Check
            label="Angle rays"
            checked={view.showFixedPAngleRays}
            onChange={(showFixedPAngleRays) => onViewChange({ showFixedPAngleRays })}
          />
        </div>
      </section>

      <section className="pm-panel-section">
        <div className="pm-section-title">
          <div>
            <h2>Resistance stage</h2>
            <p>Nominal is the reference before the resistance treatment; Design is the usable one.</p>
          </div>
        </div>
        <div className="pm-result-check-row">
          <Check
            label="Design"
            checked={view.showDesignResistance}
            onChange={(showDesignResistance) => setResistance({ showDesignResistance })}
          />
          <Check
            label="Nominal"
            checked={view.showNominalReference}
            onChange={(showNominalReference) => setResistance({ showNominalReference })}
          />
        </div>
        <fieldset className="pm-result-radio-group" aria-label="3D resistance surface">
          <legend className="pm-field-note">3D surface</legend>
          {(['nominal', 'design'] as const).map((mode) => (
            <label key={mode} className={view.surfaceResistanceMode === mode ? 'is-active' : ''}>
              <input
                type="radio"
                name="surface-resistance"
                value={mode}
                checked={view.surfaceResistanceMode === mode}
                onChange={() => onViewChange({ surfaceResistanceMode: mode })}
              />
              {mode === 'nominal' ? 'Nominal' : 'Design'}
            </label>
          ))}
        </fieldset>
        <div className="pm-result-check-row">
          <Check
            label="3D axes"
            checked={view.showSceneAxes}
            onChange={(showSceneAxes) => onViewChange({ showSceneAxes })}
          />
        </div>
      </section>

      <section className="pm-panel-section">
        <div className="pm-section-title">
          <div>
            <h2>Charts</h2>
            <p>Which plots the stage shows, and which one gets the large panel.</p>
          </div>
        </div>
        <div className="pm-chart-toggle-list">
          {SECTION_CHART_IDS.map((id: SectionChartId) => (
            <div key={id} className={`pm-chart-toggle${view.visibleCharts[id] ? ' is-on' : ''}`}>
              <button
                type="button"
                className="pm-chart-toggle-main"
                onClick={() => onViewChange(toggleChartVisibility(view, SECTION_CHART_IDS, id))}
                title={view.visibleCharts[id] ? 'Hide this chart' : 'Show this chart'}
              >
                {view.visibleCharts[id] ? <Eye size={13} /> : <EyeOff size={13} />}
                <span>{sectionChartLabel(id)}</span>
              </button>
              <button
                type="button"
                className={`pm-chart-tool${view.primaryChart === id ? ' is-active' : ''}`}
                disabled={!view.visibleCharts[id]}
                title="Make this the large chart"
                onClick={() => onViewChange({ primaryChart: id })}
              >
                <Maximize2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
