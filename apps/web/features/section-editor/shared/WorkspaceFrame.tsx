'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DEFAULT_SIDEBAR_WIDTH, WORKSPACE_PANE_GAP, sidebarBounds, sidebarKeyboardWidth, visibleSidebarWidth } from './workspace-layout'

/** Session-only layout state. Never publishes a project or engineering edit. */
export function WorkspaceFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number; preference: number } | null>(null)
  const [preferredWidth, setPreferredWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [availableWidth, setAvailableWidth] = useState(1280)
  const [dragging, setDragging] = useState(false)
  const width = visibleSidebarWidth(preferredWidth, availableWidth)
  const bounds = sidebarBounds(availableWidth)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width))
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const cancelDrag = () => {
    const drag = dragRef.current
    if (!drag) return
    setPreferredWidth(drag.preference)
    dragRef.current = null
    setDragging(false)
  }

  return <div ref={frameRef} className={`pm-workspace${dragging ? ' is-resizing' : ''}`}
    style={{ '--ws-sidebar-width': `${width}px`, '--ws-pane-gap': `${WORKSPACE_PANE_GAP}px` } as CSSProperties}>
    {children}
    <div className="pm-sidebar-resizer" role="separator" tabIndex={0}
      aria-label="Resize side panel" aria-orientation="vertical"
      aria-valuemin={Math.round(bounds.min)} aria-valuemax={Math.round(bounds.max)} aria-valuenow={Math.round(width)}
      aria-controls="pm-workspace-sidebar"
      title="Drag to resize · Arrow keys adjust · Double-click resets"
      onPointerDown={(event) => {
        if (event.button !== 0 || dragRef.current) return
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, preference: preferredWidth }
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (drag?.pointerId !== event.pointerId) return
        setPreferredWidth(visibleSidebarWidth(drag.startWidth + event.clientX - drag.startX, availableWidth))
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return
        dragRef.current = null
        setDragging(false)
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onBlur={cancelDrag}
      onDoubleClick={() => setPreferredWidth(DEFAULT_SIDEBAR_WIDTH)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          cancelDrag()
          return
        }
        const next = sidebarKeyboardWidth(event.key, event.shiftKey, width, availableWidth)
        if (next == null) return
        event.preventDefault()
        setPreferredWidth(next)
      }}
    />
  </div>
}
