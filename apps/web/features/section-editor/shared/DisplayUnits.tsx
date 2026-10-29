'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { CANONICAL_UNITS, DISPLAY_UNITS_STORAGE_KEY, UNIT_OPTIONS, UNIT_PRESETS, commitQuantity, editableQuantity,
  formatInputQuantity, formatQuantity, fromCanonical, parseUnitSelection, quantityUnit, selectUnit,
  type Quantity, type UnitGroup, type UnitGroups, type UnitSelection } from '@pm/units'

type Context = { selection: UnitSelection; setSelection: (value: UnitSelection) => void }
const UnitsContext = createContext<Context>({ selection: UNIT_PRESETS.metric, setSelection: () => {} })
export function DisplayUnitsProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<UnitSelection>(UNIT_PRESETS.metric)
  const [ready, setReady] = useState(false)
  const [warning, setWarning] = useState('')
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISPLAY_UNITS_STORAGE_KEY)
      if (raw) setSelection(parseUnitSelection(JSON.parse(raw)))
    } catch { setWarning('Stored display units are unavailable or invalid. Metric display units are active.') }
    setReady(true)
  }, [])
  useEffect(() => {
    if (ready) try { window.localStorage.setItem(DISPLAY_UNITS_STORAGE_KEY, JSON.stringify(selection)) } catch { /* Session selection remains usable without browser storage. */ }
  }, [ready, selection])
  const value = useMemo(() => ({ selection, setSelection }), [selection])
  return <UnitsContext.Provider value={value}>{warning && <p role="status">{warning}</p>}{children}</UnitsContext.Provider>
}
export const useDisplayUnits = () => useContext(UnitsContext)
export function useQuantityFormatters() {
  const { selection } = useDisplayUnits()
  return useMemo(() => {
    const qfmt = (quantity: Quantity, value: number, digits = 3) => formatQuantity(quantity, value, selection, digits)
    const unit = (quantity: Quantity) => quantityUnit(quantity, selection)
    const forceValue = (value: number) => qfmt('force', value, 2)
    const momentValue = (value: number) => qfmt('moment', value, 2)
    return { displayUnits: selection, qfmt, unit, forceValue, momentValue, fmtForce: forceValue, fmtMoment: momentValue,
      force: (value: number) => `${forceValue(value)} ${unit('force')}`,
      moment: (value: number) => `${momentValue(value)} ${unit('moment')}`,
      displayForce: (value: number) => fromCanonical('force', value, selection),
      displayMoment: (value: number) => fromCanonical('moment', value, selection) }
  }, [selection])
}
export const UnitLabel = ({ quantity }: { quantity: Quantity }) => {
  const { selection } = useDisplayUnits()
  return <>{quantityUnit(quantity, selection)}</>
}
export const QuantityValue = ({ quantity, value, digits = 3, unit = true }: { quantity: Quantity; value: number; digits?: number; unit?: boolean }) => {
  const { selection } = useDisplayUnits()
  return <>{formatQuantity(quantity, value, selection, digits)}{unit ? ` ${quantityUnit(quantity, selection)}` : ''}</>
}

type QuantityInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'step'> & {
  quantity: Quantity; value: number | undefined; min?: number; max?: number; step?: number | string;
  showUnit?: boolean;
  spinButtons?: boolean;
  /** Optional drawing preview only; canonical commits still occur on blur/Enter. */
  onDraftValueChange?: (canonical: number) => void;
  onClear?: () => void;
  onValueChange: (canonical: number) => void
}
/** UNITS-003: each edit captures its original canonical value and unit context until commit/cancel. */
export function QuantityInput({ quantity, value, min, max, step, showUnit = true, spinButtons = false, onDraftValueChange, onValueChange, onClear, onFocus, onBlur, onKeyDown, ...props }: QuantityInputProps) {
  const { selection } = useDisplayUnits()
  const [draft, setDraft] = useState<string | null>(null)
  const captured = useRef<{ value: number | undefined; selection: UnitSelection } | null>(null)
  const [error, setError] = useState('')
  const context = captured.current?.selection ?? selection
  const unit = quantityUnit(quantity, context)
  const cancel = () => { captured.current = null; setDraft(null); setError('') }
  const commit = () => {
    const edit = captured.current
    if (!edit || draft === null) return
    try {
      if (value !== edit.value) throw Error('This value changed while editing. Press Escape and edit again.')
      if (draft.trim() === '' && onClear) { cancel(); if (edit.value !== undefined) onClear(); return }
      const canonical = commitQuantity(quantity, draft, edit.value ?? 0, edit.selection)
      if ((min !== undefined && canonical < min) || (max !== undefined && canonical > max)) throw Error('Value is outside the allowed range.')
      // A stale draft must not overwrite an externally changed canonical value.
      cancel()
      if (!Object.is(canonical, edit.value)) onValueChange(canonical)
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Invalid numeric input') }
  }
  const title = error || props.title || `${value === undefined ? '' : editableQuantity(quantity, value, context)} ${unit} (stored as ${CANONICAL_UNITS[quantity]})`
  const input = <input {...props} type={spinButtons ? 'number' : 'text'} step={spinButtons ? step ?? 1 : undefined} inputMode="decimal" aria-invalid={error ? true : undefined} title={title}
      aria-label={props['aria-label'] ? `${props['aria-label']} (${unit})` : undefined}
      value={draft ?? (value === undefined ? '' : formatInputQuantity(quantity, value, selection))}
      onFocus={event => {
        if (!captured.current) {
          const text = value === undefined ? '' : editableQuantity(quantity, value, selection)
          captured.current = { value, selection }
          setDraft(text)
        }
        onFocus?.(event)
      }}
      onChange={event => {
        const text = event.target.value
        setDraft(text); setError('')
        if (onDraftValueChange && text.trim() !== '') try {
          onDraftValueChange(commitQuantity(quantity, text, captured.current?.value ?? value ?? 0, captured.current?.selection ?? selection))
        } catch { /* Incomplete numeric text cannot supply a drawing preview. */ }
      }}
      onBlur={event => { commit(); onBlur?.(event) }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); if (captured.current?.value !== undefined) onDraftValueChange?.(captured.current.value); cancel(); event.currentTarget.blur() }
        else if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
        onKeyDown?.(event)
      }} />
  // Table headers declare the unit; preserve the original unframed in-cell input role.
  return showUnit ? <span className="ws-field-group" title={title}>{input}<em>{unit}</em></span> : input
}

/** The slider's invisible numeric domain remains canonical; its editable readout owns the unit boundary. */
export function QuantitySlider({ quantity, label, value, min, max, disabled, onValueChange }: {
  quantity: Quantity; label: string; value: number; min: number; max: number; disabled?: boolean;
  onValueChange: (canonical: number) => void
}) {
  return <label className={`pm-synced-control${disabled ? ' is-locked' : ''}`}>
    <span className="pm-synced-control-label">{label}</span>
    <input type="range" aria-label={`${label} slider`} min={min} max={max} step={(max - min) / 240 || 1}
      value={Math.min(max, Math.max(min, value))} disabled={disabled} onChange={event => onValueChange(Number(event.target.value))} />
    <span className="pm-synced-control-value"><QuantityInput quantity={quantity} aria-label={label}
      value={value} min={min} max={max} disabled={disabled} onValueChange={onValueChange} /></span>
  </label>
}

const LABELS: Record<UnitGroup, string> = { length: 'Coordinates and dimensions', barDiameter: 'Bar diameter',
  force: 'Force', moment: 'Moment', stress: 'Stress', modulus: 'Elastic modulus', density: 'Mass density' }
export function DisplayUnitsPanel() {
  const { selection, setSelection } = useDisplayUnits()
  return <section className="pm-panel-section">
    <label className="pm-field"><span>Display units</span><select aria-label="Display unit preset" value={selection.preset}
      onChange={event => { if (event.target.value === 'metric' || event.target.value === 'us') setSelection(UNIT_PRESETS[event.target.value])
        else setSelection({ ...selection, preset: 'custom' }) }}>
      <option value="metric">Metric</option><option value="us">US Customary</option><option value="custom">Custom</option>
    </select></label>
    {Object.entries(UNIT_OPTIONS).map(([group, options]) => <label className="pm-field" key={group}>
      <span>{LABELS[group as UnitGroup]}</span><select aria-label={LABELS[group as UnitGroup]} value={selection.groups[group as UnitGroup]}
        onChange={event => setSelection(selectUnit(selection, group as UnitGroup, event.target.value as UnitGroups[UnitGroup]))}>
        {options.map(unit => <option key={unit} value={unit}>{unit}</option>)}
      </select></label>)}
    <p className="pm-preview-hint">Units apply to input and display. Calculation data remains mm, N, MPa and N·mm. JSON and DXF retain their declared units; Excel audit ledgers state their calculation units.</p>
  </section>
}
