'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export const Fact = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <div className="pm-calc-fact"><span>{label}</span><strong>{children}</strong></div>
)

export const Step = ({ index, title, action, children }: {
  index: number | string
  title: string
  action?: ReactNode
  children: ReactNode
}) => (
  <section className="pm-calc-step">
    <div className="pm-calc-step__heading"><span>{index}</span><h3>{title}</h3>{action}</div>
    <div className="pm-calc-step__body">{children}</div>
  </section>
)

export const Formula = ({ children }: { children: ReactNode }) => (
  <div className="pm-calc-formula">{children}</div>
)

export const FormulaPanel = ({ children }: { children: ReactNode }) => (
  <div className="pm-calc-formula-panel">{children}</div>
)

type CalculationDialogFrameProps = {
  title: string
  closeLabel: string
  controls: ReactNode
  bodyKey?: string
  children: ReactNode
  onClose: () => void
}

/** Shared accessible shell for the Section Results and Demand Check calculation inspectors. */
export function CalculationDialogFrame({
  title,
  closeLabel,
  controls,
  bodyKey,
  children,
  onClose
}: CalculationDialogFrameProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []).filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => {
      window.removeEventListener('keydown', keydown)
      document.body.style.overflow = previousBodyOverflow
      previouslyFocused?.focus()
    }
  }, [])

  return (
    <div
      className="pm-calculation-dialog-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <article ref={dialogRef} className="pm-calculation-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="pm-calculation-dialog__header">
          <div className="pm-calculation-dialog__heading">
            <h2 id={titleId} className="pm-calc-kicker">{title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="pm-calculation-dialog__close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <X size={18} />
          </button>
          {controls}
        </header>

        <div className="pm-calculation-dialog__body" key={bodyKey}>
          {children}
        </div>

        <footer className="pm-calculation-dialog__footer">
          <button type="button" className="pm-secondary-btn" onClick={onClose}>Close</button>
        </footer>
      </article>
    </div>
  )
}
