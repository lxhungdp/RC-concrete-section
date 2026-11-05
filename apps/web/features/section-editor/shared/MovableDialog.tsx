'use client'

import { useId, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { WORKSPACE_PANE_GAP } from './workspace-layout'

type WindowState = 'normal' | 'minimized' | 'maximized'

/** Shared transient move/resize owner; app windows use show() without a backdrop or focus trap. */
export function MovableDialog({ title, caption, className = '', closeLabel, closeOnBackdrop = false, mode = 'modal', nativeTitleBar = false, busy = false, activation = 0, actions, children, onClose }: {
  title: string; caption?: string; className?: string; closeLabel?: string; closeOnBackdrop?: boolean
  mode?: 'modal' | 'window'; nativeTitleBar?: boolean; busy?: boolean; activation?: number; actions: ReactNode; children: ReactNode; onClose(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId()
  const [windowState, setWindowState] = useState<WindowState>('normal')
  const currentState = useRef<WindowState>('normal'), minimizedFrom = useRef<WindowState>('normal')
  const normalBounds = useRef<DOMRect | null>(null)
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(null)
  const position = (left: number, top: number) => {
    const element = dialog.current
    if (!element) return
    const rect = element.getBoundingClientRect(), gap = WORKSPACE_PANE_GAP
    element.style.left = `${Math.max(gap, Math.min(left, window.innerWidth - rect.width - gap))}px`
    element.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - rect.height - gap))}px`
  }
  const arrange = (state: WindowState) => {
    const element = dialog.current
    if (!element) return
    const gap = WORKSPACE_PANE_GAP
    if (state === 'maximized') {
      Object.assign(element.style, { inlineSize: `${window.innerWidth - 2 * gap}px`, blockSize: `${window.innerHeight - 2 * gap}px` })
      position(gap, gap)
    } else if (state === 'minimized') {
      const width = Math.min(420, window.innerWidth - 2 * gap)
      const height = element.querySelector('header')!.getBoundingClientRect().height + 2 * element.clientTop
      Object.assign(element.style, { inlineSize: `${width}px`, blockSize: `${height}px` })
      position(window.innerWidth - width - gap, window.innerHeight - height - gap)
    } else if (normalBounds.current) {
      const { width, height, left, top } = normalBounds.current
      Object.assign(element.style, { inlineSize: `${width}px`, blockSize: `${height}px` })
      position(left, top)
    }
  }
  const present = (next: WindowState) => {
    const element = dialog.current
    if (!element) return
    if (currentState.current === 'normal') normalBounds.current = element.getBoundingClientRect()
    if (next === 'minimized') {
      minimizedFrom.current = currentState.current
      const content = element.querySelector('.pm-window-content')!.getBoundingClientRect()
      element.style.setProperty('--app-content-width', `${content.width}px`)
      element.style.setProperty('--app-content-height', `${content.height}px`)
    }
    currentState.current = next
    // Apply the modifier before measuring the compact title bar.
    element.dataset.windowState = next
    setWindowState(next); arrange(next)
  }
  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current
    if (!element) return
    if (mode === 'window') element.show(); else element.showModal()
    const initial = element.getBoundingClientRect()
    Object.assign(element.style, { position: 'fixed', margin: '0', right: 'auto', bottom: 'auto' })
    position((window.innerWidth - initial.width) / 2, (window.innerHeight - initial.height) / 2)
    const fit = () => {
      if (mode === 'window' && currentState.current !== 'normal') arrange(currentState.current)
      else { const rect = element.getBoundingClientRect(); position(rect.left, rect.top) }
    }
    const observer = new ResizeObserver(fit)
    observer.observe(element); window.addEventListener('resize', fit)
    element.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus({ preventScroll: true })
    return () => {
      observer.disconnect(); window.removeEventListener('resize', fit)
      element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [mode])
  useLayoutEffect(() => {
    if (mode !== 'window' || activation === 0) return
    if (currentState.current === 'minimized') present(minimizedFrom.current)
    dialog.current?.querySelector<HTMLElement>('iframe, [data-dialog-autofocus]')?.focus({ preventScroll: true })
  }, [activation, mode])
  const start = (event: PointerEvent<HTMLElement>) => {
    if (currentState.current === 'maximized' || event.button !== 0 || (event.target as Element).closest('button, input, select, a') || !dialog.current) return
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
    if (currentState.current !== 'normal' || event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || !dialog.current) return
    const dx = event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0
    const dy = event.key === 'ArrowUp' ? -10 : event.key === 'ArrowDown' ? 10 : 0
    if (!dx && !dy) return
    event.preventDefault()
    const element = dialog.current, rect = element.getBoundingClientRect()
    if (event.shiftKey) { element.style.width = `${Math.max(1, rect.width + dx)}px`; element.style.height = `${Math.max(1, rect.height + dy)}px`; position(rect.left, rect.top) }
    else position(rect.left + dx, rect.top + dy)
  }
  return <dialog ref={dialog} className={`pm-project-dialog pm-data-dialog ${mode === 'window' ? 'pm-app-window' : ''} ${nativeTitleBar ? 'pm-app-window--native-title' : ''} ${className}`} aria-labelledby={titleId}
    aria-modal={mode === 'modal'} data-window-state={mode === 'window' ? windowState : undefined}
    onCancel={event => { event.preventDefault(); if (mode === 'modal') onClose() }}
    onClick={event => {
      if (!closeOnBackdrop || event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}>
    <header className="pm-data-dialog-toolbar" tabIndex={0} title="Drag to move. Arrow keys move; Shift+arrow keys resize."
      onDoubleClick={event => { if (mode === 'window' && !busy && !(event.target as Element).closest('button')) present(currentState.current === 'minimized' ? minimizedFrom.current : currentState.current === 'normal' ? 'maximized' : 'normal') }}
      onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onKeyDown={keys}>
      {nativeTitleBar && <span className="pm-window-title-drag" aria-hidden="true" />}
      <h2 id={titleId} title={caption ? `${title} — ${caption}` : title}>{title}</h2>
      {caption && <span className="pm-dialog-context">{caption}</span>}{actions}
      {mode === 'window' && <>
        <button type="button" className="ws-action ws-action--quiet ws-action--icon" disabled={busy || windowState === 'minimized'} onClick={() => present('minimized')} aria-label={`Minimize ${title}`}><Minus size={14} /></button>
        <button type="button" className="ws-action ws-action--quiet ws-action--icon" disabled={busy} onClick={() => present(windowState === 'minimized' ? minimizedFrom.current : windowState === 'maximized' ? 'normal' : 'maximized')}
          aria-label={`${windowState === 'normal' ? 'Maximize' : 'Restore'} ${title}`}>{windowState === 'normal' ? <Square size={14} /> : <Copy size={14} />}</button>
      </>}
      <button type="button" className="ws-action ws-action--quiet ws-action--icon" onClick={onClose} aria-label={closeLabel ?? `Close ${title}`}><X size={14} /></button>
    </header>
    {mode === 'window' ? <div className="pm-window-content" inert={windowState === 'minimized'}>{children}</div> : children}
  </dialog>
}
