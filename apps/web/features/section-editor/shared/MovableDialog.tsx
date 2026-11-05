'use client'

import { useId, useLayoutEffect, useRef, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { WORKSPACE_PANE_GAP } from './workspace-layout'

/** Shared document window: native modality/focus with transient move and resize. */
export function MovableDialog({ title, caption, className = '', closeLabel, closeOnBackdrop = false, actions, children, onClose }: {
  title: string; caption?: string; className?: string; closeLabel?: string; closeOnBackdrop?: boolean; actions: ReactNode; children: ReactNode; onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId()
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(null)
  const position = (left: number, top: number) => {
    const element = dialog.current
    if (!element) return
    const rect = element.getBoundingClientRect(), gap = WORKSPACE_PANE_GAP
    element.style.left = `${Math.max(gap, Math.min(left, window.innerWidth - rect.width - gap))}px`
    element.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - rect.height - gap))}px`
  }
  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current
    if (!element) return
    element.showModal()
    const initial = element.getBoundingClientRect()
    Object.assign(element.style, { position: 'fixed', margin: '0', right: 'auto', bottom: 'auto' })
    position((window.innerWidth - initial.width) / 2, (window.innerHeight - initial.height) / 2)
    const fit = () => { const rect = element.getBoundingClientRect(); position(rect.left, rect.top) }
    const observer = new ResizeObserver(fit)
    observer.observe(element); window.addEventListener('resize', fit)
    element.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus({ preventScroll: true })
    return () => {
      observer.disconnect(); window.removeEventListener('resize', fit)
      element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  const start = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button, input, select, a') || !dialog.current) return
    const rect = dialog.current.getBoundingClientRect()
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
    dialog.current.dataset.moving = 'true'
    event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true }); event.preventDefault()
  }
  const move = (event: PointerEvent<HTMLElement>) => {
    const from = drag.current
    if (from?.pointer === event.pointerId) position(from.left + event.clientX - from.x, from.top + event.clientY - from.y)
  }
  const stop = (event: PointerEvent<HTMLElement>) => {
    drag.current = null
    if (dialog.current) delete dialog.current.dataset.moving
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const keys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || !dialog.current) return
    const dx = event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0
    const dy = event.key === 'ArrowUp' ? -10 : event.key === 'ArrowDown' ? 10 : 0
    if (!dx && !dy) return
    event.preventDefault()
    const element = dialog.current, rect = element.getBoundingClientRect()
    if (event.shiftKey) { element.style.width = `${Math.max(1, rect.width + dx)}px`; element.style.height = `${Math.max(1, rect.height + dy)}px`; position(rect.left, rect.top) }
    else position(rect.left + dx, rect.top + dy)
  }
  return <dialog ref={dialog} className={`pm-project-dialog pm-data-dialog ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (!closeOnBackdrop || event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}>
    <header className="pm-data-dialog-toolbar" tabIndex={0} title="Drag to move. Arrow keys move; Shift+arrow keys resize."
      onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onKeyDown={keys}>
      <h2 id={titleId} title={caption ? `${title} — ${caption}` : title}>{title}</h2>
      {caption && <span className="pm-dialog-context">{caption}</span>}{actions}
      <button type="button" className="ws-action ws-action--quiet ws-action--icon" onClick={onClose} aria-label={closeLabel ?? `Close ${title}`}><X size={14} /></button>
    </header>
    {children}
  </dialog>
}
