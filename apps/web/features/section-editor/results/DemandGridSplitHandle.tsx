'use client'

import { useRef, useState, type RefObject } from 'react'
import {
  DEMAND_GRID_SPLIT_DEFAULT,
  demandGridKeyboardSplit,
  demandGridPointerSplit,
  type DemandGridSplit
} from './results-view'

/**
 * Centre handle of the Demand Check 2 × 2 chart grid (design standard, Surfaces). One drag moves the
 * column and row division together. Arrow keys adjust (Shift for larger steps), Home and double-click
 * reset, Escape cancels a drag. Session layout only; it never edits project or engineering data.
 */
export function DemandGridSplitHandle({ split, onChange, gridRef }: {
  split: DemandGridSplit
  onChange: (split: DemandGridSplit) => void
  gridRef: RefObject<HTMLElement | null>
}) {
  const dragRef = useRef<{ pointerId: number; start: DemandGridSplit } | null>(null)
  const [dragging, setDragging] = useState(false)
  const pointerSplit = (clientX: number, clientY: number) => {
    const grid = gridRef.current
    if (!grid) return null
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0
    return demandGridPointerSplit({ x: clientX, y: clientY }, grid.getBoundingClientRect(), gap)
  }
  const cancelDrag = () => {
    const drag = dragRef.current
    if (!drag) return
    onChange(drag.start)
    dragRef.current = null
    setDragging(false)
  }
  const percent = (value: number) => `${Math.round(value * 100)}%`
  return <div className={`pm-demand-grid-handle${dragging ? ' is-dragging' : ''}`} role="separator" tabIndex={0}
    aria-label="Resize the four charts"
    aria-valuetext={`Left column ${percent(split.x)}, top row ${percent(split.y)}`}
    title="Drag to resize the four charts · Arrow keys adjust · Double-click resets"
    onPointerDown={(event) => {
      if (event.button !== 0 || dragRef.current) return
      event.preventDefault()
      event.currentTarget.focus()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { pointerId: event.pointerId, start: split }
      setDragging(true)
    }}
    onPointerMove={(event) => {
      if (dragRef.current?.pointerId !== event.pointerId) return
      const next = pointerSplit(event.clientX, event.clientY)
      if (next) onChange(next)
    }}
    onPointerUp={(event) => {
      if (dragRef.current?.pointerId !== event.pointerId) return
      dragRef.current = null
      setDragging(false)
      event.currentTarget.releasePointerCapture(event.pointerId)
    }}
    onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onBlur={cancelDrag}
    onDoubleClick={() => onChange({ ...DEMAND_GRID_SPLIT_DEFAULT })}
    onKeyDown={(event) => {
      if (event.key === 'Escape') {
        cancelDrag()
        return
      }
      const next = demandGridKeyboardSplit(event.key, event.shiftKey, split)
      if (!next) return
      event.preventDefault()
      onChange(next)
    }}
  />
}
