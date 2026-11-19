'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { RebarAreaSource } from '@pm/geometry'
import { useQuantityFormatters } from '../shared/DisplayUnits'
import { REBAR_CATALOGS, catalogRebarProperties } from './rebar-catalog'

const catalogs = REBAR_CATALOGS

export function RebarCatalogDialog({ onClose, onUse }: {
  onClose: () => void
  onUse: (properties: { dia: number; area: number; areaSource: RebarAreaSource }) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [catalogIndex, setCatalogIndex] = useState(0)
  const [rowIndex, setRowIndex] = useState<number | null>(null)
  const { qfmt, unit } = useQuantityFormatters()
  const catalog = catalogs[catalogIndex]
  const selected = rowIndex === null ? undefined : catalog.rows[rowIndex]
  const selectCatalog = (index: number) => { setCatalogIndex(index); setRowIndex(null) }
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  return <dialog ref={dialogRef} className="pm-project-dialog pm-rebar-catalog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}>
    <header className="pm-project-dialog__header">
      <div><h2 id={titleId}>Rebar catalog</h2><p>Select a published size to fill diameter and As once.</p></div>
      <button type="button" className="ws-action ws-action--quiet ws-action--icon" aria-label="Close rebar catalog" onClick={onClose}><X size={14} /></button>
    </header>
    <div className="pm-rebar-catalog-body">
      <div className="ws-page-tabs ws-page-tabs--scroll pm-rebar-catalog-tabs" role="tablist" aria-label="Rebar standards">
        {catalogs.map((item, index) => <button key={item.id} type="button" role="tab" id={`rebar-tab-${item.id}`}
          aria-selected={index === catalogIndex} aria-controls="rebar-catalog-panel" tabIndex={index === catalogIndex ? 0 : -1}
          className={index === catalogIndex ? 'is-active' : ''} onClick={() => selectCatalog(index)}
          onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % catalogs.length
              : event.key === 'ArrowLeft' ? (index + catalogs.length - 1) % catalogs.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? catalogs.length - 1 : null
            if (next === null) return
            event.preventDefault(); selectCatalog(next)
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
          }}>{item.tab}</button>)}
      </div>
      <section id="rebar-catalog-panel" role="tabpanel" aria-labelledby={`rebar-tab-${catalog.id}`}>
        <h3>{catalog.label}</h3>
        <p className="pm-preview-hint">{catalog.note}</p>
        {catalog.rows.length > 0 && <table className="pm-point-table pm-rebar-catalog-table">
          <thead><tr><th aria-label="Select" /><th>Size</th><th>Diameter ({unit('barDiameter')})</th><th>As ({unit('area')})</th></tr></thead>
          <tbody>{catalog.rows.map((row, index) => {
            const value = catalogRebarProperties(catalog, row)
            return <tr key={row.designation} className={rowIndex === index ? 'is-selected' : ''} onClick={() => setRowIndex(index)}>
              <td><input type="radio" name="rebar-catalog-size" aria-label={`Select ${row.designation}`} checked={rowIndex === index}
                onChange={() => setRowIndex(index)} /></td>
              <td>{row.designation}</td>
              <td className="ws-num">{qfmt('barDiameter', value.dia, 6)}</td>
              <td className="ws-num">{qfmt('area', value.area, 6)}</td>
            </tr>
          })}</tbody>
        </table>}
        {selected && <p className="pm-preview-hint" role="status">Published values: {selected.designation}; diameter {selected.diameter} {catalog.sourceDiameterUnit}; As {selected.area} {catalog.sourceAreaUnit}.</p>}
        <p className="pm-preview-hint pm-rebar-catalog-source">Source: <a href={catalog.sourceUrl} target="_blank" rel="noreferrer"
          title={`${catalog.sourceName}. ${catalog.table}. Accessed ${catalog.accessedOn ?? '2026-10-27'}.`}>{catalog.sourceName}</a></p>
      </section>
    </div>
    <footer className="pm-project-dialog__actions">
      <button type="button" className="ws-action" onClick={onClose}>Cancel</button>
      <button type="button" className="ws-action ws-action--primary" disabled={!selected}
        onClick={() => { if (selected) onUse(catalogRebarProperties(catalog, selected)) }}>Use selected bar</button>
    </footer>
  </dialog>
}
