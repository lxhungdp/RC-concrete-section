'use client'

import { useEffect, useRef, useState } from 'react'
import { applyLoadReference, loadReferenceOf, type LoadingsInput, type LoadReference } from '@pm/project'
import { QuantityInput } from '../shared/DisplayUnits'

export function LoadReferencePanel({ input, onChange, onPreviewChange }: {
  input: LoadingsInput; onChange: (value: LoadingsInput) => void; onPreviewChange: (value: LoadReference | null) => void
}) {
  const applied = loadReferenceOf(input)
  const [draft, setDraft] = useState(applied)
  const [convert, setConvert] = useState(false)
  const [error, setError] = useState('')
  const host = useRef<HTMLElement>(null)
  const [preview, setPreview] = useState(applied)
  useEffect(() => () => onPreviewChange(null), [onPreviewChange])
  const previewOffset = (patch: Partial<LoadReference>) => {
    setError('')
    const next = { ...preview, ...patch }
    setPreview(next)
    onPreviewChange(next)
  }
  const changed = preview.offsetX !== applied.offsetX || preview.offsetY !== applied.offsetY
  const apply = () => {
    if (host.current?.querySelector('[aria-invalid="true"]')) { setError('Correct the invalid offset before applying.'); return }
    try { onChange(applyLoadReference(input, preview, convert)); onPreviewChange(null); setError(''); setConvert(false) }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Load reference is invalid.') }
  }
  return <section ref={host} className="pm-panel-section" aria-label="Load reference">
    <div className="pm-section-title"><h2>Load reference</h2></div>
    <div className="pm-load-reference-offsets">
      <label className="pm-field"><span>Offset X</span><QuantityInput quantity="length" aria-label="Load reference offset X"
        spinButtons value={draft.offsetX} onDraftValueChange={offsetX => previewOffset({ offsetX })}
        onValueChange={offsetX => setDraft(current => ({ ...current, offsetX }))} /></label>
      <label className="pm-field"><span>Offset Y</span><QuantityInput quantity="length" aria-label="Load reference offset Y"
        spinButtons value={draft.offsetY} onDraftValueChange={offsetY => previewOffset({ offsetY })}
        onValueChange={offsetY => setDraft(current => ({ ...current, offsetY }))} /></label>
    </div>
    <div className="pm-load-reference-actions">
    <label className="pm-load-reference-convert" title="Adjust existing loads to the new origin while preserving their physical effect.">
      <input type="checkbox" checked={convert} onChange={event => setConvert(event.target.checked)} />
      Convert existing loadcases
    </label>
    <button type="button" className="ws-action" disabled={!changed} onClick={apply}>Apply</button>
    </div>
    <p className="pm-field-note">Convert preserves existing load effects at the new origin.</p>
    {error && <p className="pm-field-error" role="alert">{error}</p>}
  </section>
}
