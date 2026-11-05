'use client'

import { useRef, useState } from 'react'
import { saveTextDocument } from '../../../application/files/text-document'
import { MovableDialog } from '../shared/MovableDialog'

export type DemandChartData = { title: string; name: string; text: string }

export function DemandChartDataDialog({ snapshot, onClose }: { snapshot: DemandChartData; onClose(): void }) {
  const content = useRef<HTMLTextAreaElement>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(snapshot.text); setStatus('Copied.') }
    catch {
      content.current?.focus(); content.current?.select()
      setStatus('Text selected. Ctrl+C (or ⌘C) to copy.')
    }
  }
  const save = async () => {
    setSaving(true)
    try {
      const result = await saveTextDocument(snapshot.name, snapshot.text)
      if (result !== 'cancelled') setStatus(result === 'saved' ? 'Saved.' : 'Download started.')
    } catch { setStatus('Save failed. Try again or copy.') }
    finally { setSaving(false) }
  }

  return <MovableDialog title={`${snapshot.title} — Data`} closeLabel="Close chart data" closeOnBackdrop onClose={onClose} actions={<>
      <span role="status">{status}</span>
      <button type="button" className="ws-action" onClick={() => void copy()}>Copy all</button>
      <button type="button" className="ws-action" disabled={saving} onClick={() => void save()}>Save as…</button>
    </>}>
    <textarea ref={content} data-dialog-autofocus className="ws-num" readOnly wrap="off" aria-label="Chart data" value={snapshot.text} />
  </MovableDialog>
}
