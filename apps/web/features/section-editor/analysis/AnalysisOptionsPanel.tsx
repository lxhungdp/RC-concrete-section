'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import {
  ADAPTIVE_INTERPOLATION_TOLERANCE,
  ADAPTIVE_MAX_DIRECTIONS,
  ADAPTIVE_MAX_PASSES,
  ADAPTIVE_MAX_STATIONS,
  FIXED_DIRECTION_COUNT,
  MAX_BLOCK_STATIONS,
  MAX_MESH_CELLS,
  MAX_MESH_SEED_DIVISIONS,
  MAX_MESH_SUBDIVISION,
  MAX_REFINED_DIRECTIONS,
  MAX_SEED_DIRECTIONS,
  MAX_INTERMEDIATE_STATIONS,
  analysisStationCount,
  createDefaultAnalysisOptions,
  createDefaultEquivalentBlockAnalysisOptions,
  type AnalysisOptions,
  type CalculationAnalysisOptions,
  type EquivalentBlockAnalysisOptions,
  type AnalysisStation,
  type AnalysisStationCriterion
} from '@pm/project'

type Props = {
  options: CalculationAnalysisOptions
  onChange: (options: CalculationAnalysisOptions) => void
  view: 'points' | 'mesh'
}

type StrainProps = Props & { options: AnalysisOptions }

const clone = (options: AnalysisOptions): AnalysisOptions => structuredClone(options)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const criterionValue = (criterion: AnalysisStationCriterion) => {
  if (criterion.type === 'steel-strain') return criterion.strain
  if (criterion.type === 'strength-reduction-post-transition') return criterion.strain
  return criterion.ratio
}

const criterionWithValue = (criterion: AnalysisStationCriterion, value: number): AnalysisStationCriterion => {
  if (criterion.type === 'c-over-c1') return { type: criterion.type, ratio: Math.max(1e-6, value) }
  if (criterion.type === 'depth-ratio') return { type: criterion.type, ratio: Math.max(1, value) }
  if (criterion.type === 'steel-stress-ratio') return { type: criterion.type, ratio: clamp(value, 0, 1) }
  if (criterion.type === 'bar-tension-yield-ratio') return { type: criterion.type, ratio: Math.max(0, value) }
  if (criterion.type === 'strength-reduction-transition-ratio') {
    return { type: criterion.type, ratio: clamp(value, 1e-6, 1) }
  }
  if (criterion.type === 'strength-reduction-post-transition') {
    return { type: 'steel-strain', strain: Math.min(-1e-6, value) }
  }
  return { type: criterion.type, strain: Math.min(0, value) }
}

const defaultCriterion = (type: AnalysisStationCriterion['type']): AnalysisStationCriterion => {
  if (type === 'c-over-c1') return { type, ratio: 1 }
  if (type === 'depth-ratio') return { type, ratio: 1 }
  if (type === 'steel-stress-ratio') return { type, ratio: 0 }
  if (type === 'bar-tension-yield-ratio') return { type, ratio: 0 }
  if (type === 'strength-reduction-transition-ratio') return { type, ratio: 0.5 }
  if (type === 'strength-reduction-post-transition') return { type: 'steel-strain', strain: -0.0075 }
  return { type, strain: -0.003 }
}

const isMandatoryTransitionStation = (criterion: AnalysisStationCriterion) =>
  criterion.type === 'strength-reduction-transition-ratio' ||
  (criterion.type === 'steel-stress-ratio' && Math.abs(criterion.ratio - 1) < 1e-12)

const insertLargestGapMidpoint = (angles: number[]) => {
  const sorted = [...angles].sort((a, b) => a - b)
  let bestStart = sorted[0] ?? 0
  let bestGap = -1
  for (let index = 0; index < sorted.length; index++) {
    const start = sorted[index]
    const end = index === sorted.length - 1 ? sorted[0] + 360 : sorted[index + 1]
    if (end - start > bestGap) {
      bestGap = end - start
      bestStart = start
    }
  }
  const midpoint = (bestStart + bestGap / 2) % 360
  return [...sorted, midpoint].sort((a, b) => a - b)
}

type NumericInputProps = {
  value: number
  onCommit: (value: number) => void
  ariaLabel?: string
  min?: number
  max?: number
  step?: number | 'any'
  integer?: boolean
  disabled?: boolean
}

/** Keep transient text local so "-", ".", and an empty selection never mutate canonical options. */
function NumericInput({ value, onCommit, ariaLabel, min, max, step = 'any', integer = false, disabled = false }: NumericInputProps) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commitDraft = () => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    let next = integer ? Math.round(parsed) : parsed
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    setDraft(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <input
      type="number"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(String(value))
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function StrainAnalysisOptionsPanel({ options, onChange, view }: StrainProps) {
  const [angleDraft, setAngleDraft] = useState('')
  const [angleError, setAngleError] = useState('')
  const stationCount = analysisStationCount(options)
  const seedCount =
    options.directions.seed.type === 'uniform'
      ? options.directions.seed.count
      : options.directions.seed.anglesDeg.length
  const maxDirections =
    options.directions.refinement.type === 'adaptive'
      ? options.directions.refinement.maxDirections
      : seedCount
  const maxStations =
    options.stations.refinement.type === 'adaptive'
      ? options.stations.refinement.maxStations
      : stationCount

  const maxGap = useMemo(() => {
    const seed = options.directions.seed
    const angles =
      seed.type === 'uniform'
        ? Array.from(
            { length: seed.count },
            (_, index) => (seed.startDeg + (360 * index) / seed.count) % 360
          ).sort((a, b) => a - b)
        : seed.anglesDeg
    return Math.max(
      ...angles.map((angle, index) => {
        const next = index === angles.length - 1 ? angles[0] + 360 : angles[index + 1]
        return next - angle
      })
    )
  }, [options.directions.seed])

  const commit = (mutate: (draft: AnalysisOptions) => void, changesStations = false) => {
    const draft = clone(options)
    mutate(draft)
    if (changesStations) {
      draft.stations.basedOn = 'custom'
      if (draft.stations.refinement.type === 'adaptive') {
        draft.stations.refinement.maxStations = Math.max(
          draft.stations.intermediate.length + 2,
          draft.stations.refinement.maxStations
        )
      }
    }
    onChange(draft)
  }

  const updateStation = (id: number, patch: Partial<AnalysisStation>) =>
    commit((draft) => {
      const index = draft.stations.intermediate.findIndex((station) => station.id === id)
      if (index >= 0) draft.stations.intermediate[index] = { ...draft.stations.intermediate[index], ...patch }
    }, true)

  const applyExplicitDraft = () => {
    const parsed = angleDraft
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map(Number)
    if (parsed.length < 4 || parsed.some((angle) => !Number.isFinite(angle) || angle < 0 || angle >= 360)) {
      setAngleError('Enter at least four finite angles in [0, 360).')
      return
    }
    const sorted = [...new Set(parsed)].sort((a, b) => a - b)
    if (sorted.length < 4 || sorted.length > MAX_SEED_DIRECTIONS) {
      setAngleError(`Use 4…${MAX_SEED_DIRECTIONS} distinct angles.`)
      return
    }
    commit((draft) => {
      draft.directions.seed = { type: 'explicit', anglesDeg: sorted }
      if (
        draft.directions.refinement.type === 'adaptive' &&
        draft.directions.refinement.maxDirections < sorted.length
      ) {
        draft.directions.refinement.maxDirections = sorted.length
      }
    })
    setAngleDraft('')
    setAngleError('')
  }

  return (
    <section className="pm-panel-section">
      <div className="pm-section-title pm-section-title--with-action">
        <div>
          <h2>Analysis options</h2>
          <p>Persisted strain-domain sampling configuration</p>
        </div>
        <button
          type="button"
          className="pm-table-icon-btn"
          title="Reset the unified 22-station / 36-seed-direction profile"
          onClick={() => onChange(createDefaultAnalysisOptions())}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {view === 'points' && (
        <>
      <div className="pm-result-status-list">
        <span>Reporting points</span>
        <strong>{stationCount}</strong>
        <span>Maximum stations</span>
        <strong>{maxStations}</strong>
        <span>Seed directions</span>
        <strong>{seedCount}</strong>
        <span>Maximum states</span>
        <strong>{maxStations * maxDirections}</strong>
        <span>Largest angular gap</span>
        <strong>{maxGap.toFixed(2)}°</strong>
      </div>

      <div className="pm-section-title">
        <div>
          <h3>Points &amp; criteria</h3>
          <p>Numbered automatically from compression to tension</p>
        </div>
      </div>

      <div className="pm-table-wrap">
        <table className="pm-point-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Criteria</th>
              <th>Value</th>
              <th>
                <button
                  type="button"
                  className="pm-table-add-icon-btn"
                  disabled={options.stations.intermediate.length >= MAX_INTERMEDIATE_STATIONS}
                  onClick={() =>
                    commit((draft) => {
                      const id = Math.max(0, ...draft.stations.intermediate.map((station) => station.id)) + 1
                      draft.stations.intermediate.push({
                        id,
                        label: `Custom ${id}`,
                        criterion: { type: 'steel-strain', strain: -0.05 }
                      })
                    }, true)
                  }
                  title="Add point"
                >
                  <Plus size={14} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="pm-analysis-fixed-point">
              <td><span className="pm-point-index">1</span></td>
              <td><span className="pm-analysis-fixed-label">Pure compression</span></td>
              <td><span className="pm-analysis-fixed-value">εcu</span></td>
              <td />
            </tr>
            {options.stations.intermediate.map((station, index) => (
              <tr key={station.id}>
                <td><span className="pm-point-index">{index + 2}</span></td>
                <td>
                  <select
                    aria-label={`Point ${index + 2} criteria`}
                    value={station.criterion.type}
                    disabled={isMandatoryTransitionStation(station.criterion)}
                    onChange={(event) =>
                      updateStation(station.id, {
                        criterion: defaultCriterion(event.target.value as AnalysisStationCriterion['type'])
                      })
                    }
                  >
                    <option value="c-over-c1">c/c₁</option>
                    <option value="depth-ratio">c/D</option>
                    <option value="steel-stress-ratio">fs/fyd</option>
                    <option value="bar-tension-yield-ratio">εₛ/εy</option>
                    <option value="strength-reduction-transition-ratio">φᵣ</option>
                    <option value="steel-strain">εₛ</option>
                  </select>
                </td>
                <td>
                  <NumericInput
                    ariaLabel={`Point ${index + 2} value`}
                    step="any"
                    value={criterionValue(station.criterion)}
                    disabled={isMandatoryTransitionStation(station.criterion)}
                    onCommit={(value) =>
                      updateStation(station.id, {
                        criterion: criterionWithValue(station.criterion, value)
                      })
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="pm-table-icon-btn pm-table-icon-btn--danger"
                    disabled={isMandatoryTransitionStation(station.criterion)}
                    onClick={() =>
                      commit((draft) => {
                        draft.stations.intermediate = draft.stations.intermediate.filter(
                          (item) => item.id !== station.id
                        )
                        const probe = draft.directions.refinement.probe
                        if (probe !== 'all') {
                          probe.stationIds = probe.stationIds.filter((id) => id !== station.id)
                        }
                      }, true)
                    }
                    title={`Remove point ${index + 2}`}
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
            <tr className="pm-analysis-fixed-point">
              <td><span className="pm-point-index">{options.stations.intermediate.length + 2}</span></td>
              <td><span className="pm-analysis-fixed-label">Pure tension</span></td>
              <td><span className="pm-analysis-fixed-value">Material domain</span></td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="pm-field-note">
        D = projected section depth; c₁ = depth to the controlling tension bar
        <br />
        εₛ/εy = tensile strain magnitude of that bar normalized by its own yield strain
      </p>

      <label className="pm-field">
        <span>Station refinement</span>
        <select
          value={options.stations.refinement.type}
          onChange={(event) =>
            commit((draft) => {
              draft.stations.refinement =
                event.target.value === 'adaptive'
                  ? {
                      type: 'adaptive',
                      tolerance: ADAPTIVE_INTERPOLATION_TOLERANCE,
                      maxPasses: ADAPTIVE_MAX_PASSES,
                      maxStations: Math.max(ADAPTIVE_MAX_STATIONS, stationCount)
                    }
                  : { type: 'fixed' }
            })
          }
        >
          <option value="fixed">Fixed 22-point schedule only</option>
          <option value="adaptive">Adaptive design interpolation</option>
        </select>
      </label>

      {options.stations.refinement.type === 'adaptive' && (
        <>
          <label className="pm-field">
            <span>Station tolerance</span>
            <NumericInput
              min={1e-6}
              max={0.25}
              step={0.001}
              value={options.stations.refinement.tolerance}
              onCommit={(value) => commit((draft) => {
                if (draft.stations.refinement.type === 'adaptive') {
                  draft.stations.refinement.tolerance = value
                }
              })}
            />
          </label>
          <label className="pm-field">
            <span>Maximum station passes</span>
            <NumericInput
              min={0}
              max={12}
              integer
              value={options.stations.refinement.maxPasses}
              onCommit={(value) => commit((draft) => {
                if (draft.stations.refinement.type === 'adaptive') {
                  draft.stations.refinement.maxPasses = value
                }
              })}
            />
          </label>
          <label className="pm-field">
            <span>Maximum stations (poles included)</span>
            <NumericInput
              min={stationCount}
              max={MAX_BLOCK_STATIONS}
              integer
              value={options.stations.refinement.maxStations}
              onCommit={(value) => commit((draft) => {
                if (draft.stations.refinement.type === 'adaptive') {
                  draft.stations.refinement.maxStations = value
                }
              })}
            />
          </label>
          <p className="pm-field-note">
            Adaptive stations refine the design-resistance curve only; nominal and visual grids remain fixed.
          </p>
        </>
      )}

      <div className="pm-section-title">
        <div>
          <h3>Directions</h3>
          <p>β is a strain-plane direction over the full 360°</p>
        </div>
      </div>
      <label className="pm-field">
        <span>Seed type</span>
        <select
          value={options.directions.seed.type}
          onChange={(event) =>
            commit((draft) => {
              draft.directions.seed =
                event.target.value === 'uniform'
                  ? { type: 'uniform', count: FIXED_DIRECTION_COUNT, startDeg: 0 }
                  : {
                      type: 'explicit',
                      anglesDeg: Array.from(
                        { length: FIXED_DIRECTION_COUNT },
                        (_, index) => (360 * index) / FIXED_DIRECTION_COUNT
                      )
                    }
            })
          }
        >
          <option value="uniform">Uniform</option>
          <option value="explicit">Custom angles</option>
        </select>
      </label>

      {options.directions.seed.type === 'uniform' ? (
        <>
          <label className="pm-field">
            <span>Direction count</span>
            <NumericInput
              min={4}
              max={MAX_SEED_DIRECTIONS}
              value={options.directions.seed.count}
              integer
              onCommit={(value) =>
                commit((draft) => {
                  if (draft.directions.seed.type === 'uniform') {
                    draft.directions.seed.count = value
                    if (
                      draft.directions.refinement.type === 'adaptive' &&
                      draft.directions.refinement.maxDirections < value
                    ) {
                      draft.directions.refinement.maxDirections = value
                    }
                  }
                })
              }
            />
          </label>
          <label className="pm-field">
            <span>Start angle (deg)</span>
            <NumericInput
              min={0}
              max={359.999999}
              step="any"
              value={options.directions.seed.startDeg}
              onCommit={(value) =>
                commit((draft) => {
                  if (draft.directions.seed.type === 'uniform') {
                    draft.directions.seed.startDeg = value
                  }
                })
              }
            />
          </label>
          <p className="pm-field-note">Exact spacing: {(360 / options.directions.seed.count).toFixed(4)}°</p>
        </>
      ) : (
        <>
          <div className="pm-chip-list">
            {options.directions.seed.anglesDeg.map((angle) => (
              <button
                type="button"
                key={angle}
                title={`Remove ${angle}°`}
                onClick={() =>
                  commit((draft) => {
                    if (draft.directions.seed.type !== 'explicit' || draft.directions.seed.anglesDeg.length <= 4) return
                    draft.directions.seed.anglesDeg = draft.directions.seed.anglesDeg.filter((item) => item !== angle)
                  })
                }
              >
                {angle}° ×
              </button>
            ))}
          </div>
          <button
            type="button"
            className="pm-secondary-btn"
            disabled={options.directions.seed.anglesDeg.length >= MAX_SEED_DIRECTIONS}
            onClick={() =>
              commit((draft) => {
                if (draft.directions.seed.type === 'explicit') {
                  draft.directions.seed.anglesDeg = insertLargestGapMidpoint(draft.directions.seed.anglesDeg)
                }
              })
            }
          >
            Add midpoint of largest gap
          </button>
          <label className="pm-field">
            <span>Paste angles</span>
            <input
              value={angleDraft}
              placeholder="0, 12.5, 30, 75"
              onChange={(event) => {
                setAngleDraft(event.target.value)
                setAngleError('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyExplicitDraft()
              }}
            />
          </label>
          <button type="button" className="pm-secondary-btn" disabled={!angleDraft.trim()} onClick={applyExplicitDraft}>
            Replace angle list
          </button>
          {angleError && <p className="pm-field-error">{angleError}</p>}
        </>
      )}

      <label className="pm-field">
        <span>Refinement</span>
        <select
          value={options.directions.refinement.type}
          onChange={(event) =>
            commit((draft) => {
              draft.directions.refinement =
                event.target.value === 'adaptive'
                  ? {
                      type: 'adaptive',
                      tolerance: ADAPTIVE_INTERPOLATION_TOLERANCE,
                      maxPasses: ADAPTIVE_MAX_PASSES,
                      maxDirections: Math.min(MAX_REFINED_DIRECTIONS, Math.max(seedCount, ADAPTIVE_MAX_DIRECTIONS)),
                      probe: 'all'
                    }
                  : { type: 'fixed', probe: 'all' }
            })
          }
        >
          <option value="fixed">Fixed seed grid</option>
          <option value="adaptive">Adaptive midpoint</option>
        </select>
      </label>

      {options.directions.refinement.type === 'adaptive' && (
        <>
          <label className="pm-field">
            <span>Relative tolerance</span>
            <NumericInput
              min={1e-6}
              max={0.25}
              step={0.001}
              value={options.directions.refinement.tolerance}
              onCommit={(value) =>
                commit((draft) => {
                  if (draft.directions.refinement.type === 'adaptive') {
                    draft.directions.refinement.tolerance = value
                  }
                })
              }
            />
          </label>
          <label className="pm-field">
            <span>Maximum passes</span>
            <NumericInput
              min={0}
              max={12}
              value={options.directions.refinement.maxPasses}
              integer
              onCommit={(value) =>
                commit((draft) => {
                  if (draft.directions.refinement.type === 'adaptive') {
                    draft.directions.refinement.maxPasses = value
                  }
                })
              }
            />
          </label>
          <label className="pm-field">
            <span>Maximum directions</span>
            <NumericInput
              min={seedCount}
              max={MAX_REFINED_DIRECTIONS}
              value={options.directions.refinement.maxDirections}
              integer
              onCommit={(value) =>
                commit((draft) => {
                  if (draft.directions.refinement.type === 'adaptive') {
                    draft.directions.refinement.maxDirections = value
                  }
                })
              }
            />
          </label>
        </>
      )}

        </>
      )}

      {view === 'mesh' && (
        <>
      <div className="pm-section-title">
        <div>
          <h3>Mesh</h3>
          <p>Concrete integration mesh used by analysis and section preview</p>
        </div>
      </div>

      <label className="pm-field">
        <span>Mesh sizing</span>
        <select
          value={options.mesh.sizing.type}
          onChange={(event) =>
            commit((draft) => {
              draft.mesh.sizing =
                event.target.value === 'automatic'
                  ? { type: 'automatic', seedDivisions: 32 }
                  : { type: 'fixed', cellSize: 10 }
            })
          }
        >
          <option value="automatic">Automatic (Dmin / divisions)</option>
          <option value="fixed">Fixed cell size</option>
        </select>
      </label>

      {options.mesh.sizing.type === 'automatic' ? (
        <label className="pm-field">
          <span>Dmin divisions</span>
          <NumericInput
            min={4}
            max={MAX_MESH_SEED_DIVISIONS}
            integer
            value={options.mesh.sizing.seedDivisions}
            onCommit={(value) =>
              commit((draft) => {
                if (draft.mesh.sizing.type === 'automatic') draft.mesh.sizing.seedDivisions = value
              })
            }
          />
        </label>
      ) : (
        <label className="pm-field">
          <span>Cell size (mm)</span>
          <NumericInput
            min={0.000001}
            step="any"
            value={options.mesh.sizing.cellSize}
            onCommit={(value) =>
              commit((draft) => {
                if (draft.mesh.sizing.type === 'fixed') draft.mesh.sizing.cellSize = value
              })
            }
          />
        </label>
      )}

      <label className="pm-field">
        <span>Maximum cells</span>
        <NumericInput
          min={1}
          max={MAX_MESH_CELLS}
          integer
          value={options.mesh.maxCells}
          onCommit={(value) =>
            commit((draft) => {
              draft.mesh.maxCells = value
            })
          }
        />
      </label>

      <label className="pm-field">
        <span>Maximum subdivision</span>
        <NumericInput
          min={0}
          max={MAX_MESH_SUBDIVISION}
          integer
          value={options.mesh.maxSubdivision}
          onCommit={(value) =>
            commit((draft) => {
              draft.mesh.maxSubdivision = value
            })
          }
        />
      </label>
        </>
      )}
    </section>
  )
}

const resampleBlockStations = (count: number) => {
  const epsCuReference = 0.003
  const minimumRatio = 1 / (1 + 0.1 / epsCuReference)
  const maximumRatio = 50
  return Array.from({ length: count }, (_, index) => {
    const ratio = Math.exp(
      Math.log(minimumRatio) + (Math.log(maximumRatio) - Math.log(minimumRatio)) * index / (count - 1)
    )
    return ratio <= 1
      ? { type: 'extreme-tension-strain' as const, strain: epsCuReference * (1 / ratio - 1) }
      : { type: 'depth-ratio' as const, ratio }
  }).reverse()
}

function EquivalentBlockOptionsPanel({ options, onChange, view }: Props & { options: EquivalentBlockAnalysisOptions }) {
  const commit = (mutate: (draft: EquivalentBlockAnalysisOptions) => void) => {
    const draft = structuredClone(options)
    mutate(draft)
    onChange(draft)
  }
  const intermediateStationCount = options.neutralAxisStations.values.length
  const stationCount = intermediateStationCount + 2
  const stationMaximum = options.neutralAxisStations.refinement.type === 'adaptive'
    ? options.neutralAxisStations.refinement.maxStations
    : stationCount
  const directionMaximum = options.directions.refinement.type === 'adaptive'
    ? options.directions.refinement.maxDirections
    : options.directions.seedCount

  return (
    <section className="pm-panel-section">
      <div className="pm-section-title pm-section-title--with-action">
        <div>
          <h2>Equivalent-block analysis options</h2>
          <p>Neutral-axis and angular sampling; independent of the concrete integration mesh.</p>
        </div>
        <button
          type="button"
          className="pm-table-icon-btn"
          title="Reset the unified 22-station / 36-seed-direction profile"
          onClick={() => onChange(createDefaultEquivalentBlockAnalysisOptions())}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {view === 'mesh' ? (
        <div className="pm-result-status-list">
          <span>Concrete evaluation</span><strong>Exact polygon clipping</strong>
          <span>Stress domain</span><strong>0 ≤ depth ≤ a = β1·c</strong>
          <span>Integration cells</span><strong>Not used</strong>
          <span>Displaced concrete</span><strong>Deducted at bars inside block</strong>
        </div>
      ) : (
        <>
          <div className="pm-result-status-list">
            <span>Baseline stations</span><strong>{stationCount}</strong>
            <span>Maximum stations</span><strong>{stationMaximum}</strong>
            <span>Seed directions</span><strong>{options.directions.seedCount}</strong>
            <span>Maximum directions</span><strong>{directionMaximum}</strong>
            <span>Maximum sampled states</span><strong>{stationMaximum * directionMaximum}</strong>
          </div>

          <div className="pm-section-title"><div><h3>Unified station schedule</h3><p>c/D outside the section and εₛ/εy at the controlling bar inside it.</p></div></div>
          <label className="pm-field">
            <span>Intermediate count (poles excluded)</span>
            <NumericInput
              min={4}
              max={MAX_INTERMEDIATE_STATIONS}
              integer
              value={intermediateStationCount}
              onCommit={(value) => commit((draft) => {
                draft.neutralAxisStations.values = resampleBlockStations(value)
                draft.neutralAxisStations.basedOn = 'custom'
                if (draft.neutralAxisStations.refinement.type === 'adaptive') {
                  draft.neutralAxisStations.refinement.maxStations = Math.max(
                    value + 2,
                    draft.neutralAxisStations.refinement.maxStations
                  )
                }
              })}
            />
          </label>
          <label className="pm-field">
            <span>Station refinement</span>
            <select
              value={options.neutralAxisStations.refinement.type}
              onChange={(event) => commit((draft) => {
                draft.neutralAxisStations.refinement = event.target.value === 'adaptive'
                  ? {
                      type: 'adaptive',
                      tolerance: ADAPTIVE_INTERPOLATION_TOLERANCE,
                      maxPasses: ADAPTIVE_MAX_PASSES,
                      maxStations: Math.max(ADAPTIVE_MAX_STATIONS, stationCount)
                    }
                  : { type: 'fixed' }
              })}
            >
              <option value="fixed">Fixed stations</option>
              <option value="adaptive">Adaptive interpolation error</option>
            </select>
          </label>
          {options.neutralAxisStations.refinement.type === 'adaptive' && (
            <>
              <label className="pm-field"><span>Station tolerance</span><NumericInput min={1e-6} max={0.25} step={0.001} value={options.neutralAxisStations.refinement.tolerance} onCommit={(value) => commit((draft) => {
                if (draft.neutralAxisStations.refinement.type === 'adaptive') draft.neutralAxisStations.refinement.tolerance = value
              })} /></label>
              <label className="pm-field"><span>Maximum station passes</span><NumericInput min={0} max={12} integer value={options.neutralAxisStations.refinement.maxPasses} onCommit={(value) => commit((draft) => {
                if (draft.neutralAxisStations.refinement.type === 'adaptive') draft.neutralAxisStations.refinement.maxPasses = value
              })} /></label>
              <label className="pm-field"><span>Maximum stations (poles included)</span><NumericInput min={stationCount} max={MAX_BLOCK_STATIONS} integer value={options.neutralAxisStations.refinement.maxStations} onCommit={(value) => commit((draft) => {
                if (draft.neutralAxisStations.refinement.type === 'adaptive') draft.neutralAxisStations.refinement.maxStations = value
              })} /></label>
            </>
          )}

          <div className="pm-section-title"><div><h3>Neutral-axis directions</h3><p>θ is the compression-block normal over the full 360°.</p></div></div>
          <label className="pm-field"><span>Seed direction count</span><NumericInput min={4} max={MAX_SEED_DIRECTIONS} integer value={options.directions.seedCount} onCommit={(value) => commit((draft) => {
            draft.directions.seedCount = value
            if (draft.directions.refinement.type === 'adaptive') draft.directions.refinement.maxDirections = Math.max(value, draft.directions.refinement.maxDirections)
          })} /></label>
          <label className="pm-field"><span>Start angle (deg)</span><NumericInput min={0} max={359.999999} value={options.directions.startDeg} onCommit={(value) => commit((draft) => { draft.directions.startDeg = value })} /></label>
          <label className="pm-field">
            <span>Direction refinement</span>
            <select value={options.directions.refinement.type} onChange={(event) => commit((draft) => {
              draft.directions.refinement = event.target.value === 'adaptive'
                ? {
                    type: 'adaptive',
                    tolerance: ADAPTIVE_INTERPOLATION_TOLERANCE,
                    maxPasses: ADAPTIVE_MAX_PASSES,
                    maxDirections: Math.max(ADAPTIVE_MAX_DIRECTIONS, options.directions.seedCount)
                  }
                : { type: 'fixed' }
            })}>
              <option value="fixed">Fixed directions</option>
              <option value="adaptive">Adaptive midpoint</option>
            </select>
          </label>
          {options.directions.refinement.type === 'adaptive' && (
            <>
              <label className="pm-field"><span>Direction tolerance</span><NumericInput min={1e-6} max={0.25} step={0.001} value={options.directions.refinement.tolerance} onCommit={(value) => commit((draft) => {
                if (draft.directions.refinement.type === 'adaptive') draft.directions.refinement.tolerance = value
              })} /></label>
              <label className="pm-field"><span>Maximum direction passes</span><NumericInput min={0} max={12} integer value={options.directions.refinement.maxPasses} onCommit={(value) => commit((draft) => {
                if (draft.directions.refinement.type === 'adaptive') draft.directions.refinement.maxPasses = value
              })} /></label>
              <label className="pm-field"><span>Maximum directions</span><NumericInput min={options.directions.seedCount} max={MAX_REFINED_DIRECTIONS} integer value={options.directions.refinement.maxDirections} onCommit={(value) => commit((draft) => {
                if (draft.directions.refinement.type === 'adaptive') draft.directions.refinement.maxDirections = value
              })} /></label>
            </>
          )}
        </>
      )}
    </section>
  )
}

export function AnalysisOptionsPanel(props: Props) {
  return props.options.methodId === 'equivalent-block-surface-v1'
    ? <EquivalentBlockOptionsPanel {...props} options={props.options} />
    : <StrainAnalysisOptionsPanel {...props} options={props.options} />
}
