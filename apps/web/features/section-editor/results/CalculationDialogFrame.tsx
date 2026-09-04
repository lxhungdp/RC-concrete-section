'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { BookOpenText, LayoutTemplate, Link2, Printer, X } from 'lucide-react'

type CalculationDialogView = 'document' | 'classic'

// Keep the Classic implementation available without exposing the comparison switch for now.
const SHOW_CALCULATION_VIEW_SWITCH = false
const CALCULATION_PRINT_BODY_CLASS = 'pm-calculation-print-active'

type CalculationSection = {
  id: string
  index: string
  title: string
}

const slug = (value: string) => value
  .toLocaleLowerCase('en-US')
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 56)

const sectionAnchor = (index: number | string, title: string) =>
  `calculation-step-${slug(String(index))}-${slug(title)}`

const clearCalculationFragment = () => {
  if (!window.location.hash.startsWith('#calculation-')) return
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
}

export const Fact = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <div className="pm-calc-fact"><span>{label}</span><strong>{children}</strong></div>
)

export const Step = ({ id, index, title, action, children }: {
  id?: string
  index: number | string
  title: string
  action?: ReactNode
  children: ReactNode
}) => {
  const anchor = id ?? sectionAnchor(index, title)
  return (
    <section
      id={anchor}
      className="pm-calc-step pm-calculation-document__anchor"
      data-calculation-section="true"
      data-calculation-index={String(index)}
      data-calculation-title={title}
    >
      <div className="pm-calc-step__heading">
        <span>{index}</span>
        <h3>{title}</h3>
        <a
          className="pm-calc-step__anchor-link"
          href={`#${anchor}`}
          aria-label={`Link to ${title}`}
          title="Link to this calculation section"
        >
          <Link2 size={14} />
        </a>
        {action}
      </div>
      <div className="pm-calc-step__body">{children}</div>
    </section>
  )
}

export const Formula = ({ id, numbered = false, children }: {
  id?: string
  numbered?: boolean
  children: ReactNode
}) => {
  const generatedId = useId().replace(/:/g, '')
  const anchor = id ?? `calculation-equation-${generatedId}`
  return (
    <div id={anchor} className={`pm-calc-formula${numbered ? ' is-numbered' : ''}`}>
      <div className="pm-calc-formula__content">{children}</div>
      {numbered ? (
        <a
          className="pm-calc-formula__number"
          href={`#${anchor}`}
          aria-label="Link to this equation"
          title="Link to this equation"
        />
      ) : null}
    </div>
  )
}

export const FormulaPanel = ({ children }: { children: ReactNode }) => (
  <div className="pm-calc-formula-panel">{children}</div>
)

type CalculationDialogFrameProps = {
  title: string
  closeLabel: string
  controls: ReactNode
  headerAction?: ReactNode
  bodyKey?: string
  defaultView?: CalculationDialogView
  children: ReactNode
  onClose: () => void
}

const sameSections = (left: readonly CalculationSection[], right: readonly CalculationSection[]) =>
  left.length === right.length && left.every((item, index) => {
    const candidate = right[index]
    return candidate?.id === item.id && candidate.index === item.index && candidate.title === item.title
  })

/** Shared accessible shell for the Section Results and Demand Check calculation inspectors. */
export function CalculationDialogFrame({
  title,
  closeLabel,
  controls,
  headerAction,
  bodyKey,
  defaultView = 'classic',
  children,
  onClose
}: CalculationDialogFrameProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const printCleanupRef = useRef<(() => void) | null>(null)
  const onCloseRef = useRef(onClose)
  const [view, setView] = useState<CalculationDialogView>(
    SHOW_CALCULATION_VIEW_SWITCH ? defaultView : 'document'
  )
  const [sections, setSections] = useState<CalculationSection[]>([])
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const closeDialog = () => {
    clearCalculationFragment()
    onCloseRef.current()
  }

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
        clearCalculationFragment()
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
      clearCalculationFragment()
      printCleanupRef.current?.()
    }
  }, [])

  useEffect(() => {
    if (view !== 'document') return
    const body = bodyRef.current
    if (!body) return
    let animationFrame = 0
    const collect = () => {
      const next = Array.from(body.querySelectorAll<HTMLElement>('[data-calculation-section="true"]')).map((element) => ({
        id: element.id,
        index: element.dataset.calculationIndex ?? '',
        title: element.dataset.calculationTitle ?? ''
      }))
      setSections((current) => sameSections(current, next) ? current : next)
      setActiveSection((current) => current && next.some((section) => section.id === current)
        ? current
        : next[0]?.id ?? null)
    }
    animationFrame = window.requestAnimationFrame(collect)
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(collect)
    })
    observer.observe(body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(animationFrame)
    }
  }, [bodyKey, view])

  useEffect(() => {
    if (view !== 'document') return
    const body = bodyRef.current
    if (!body) return
    let animationFrame = 0
    const updateActiveSection = () => {
      const bodyTop = body.getBoundingClientRect().top
      const elements = Array.from(body.querySelectorAll<HTMLElement>('[data-calculation-section="true"]'))
      let next = elements[0]?.id ?? null
      for (const element of elements) {
        if (element.getBoundingClientRect().top - bodyTop > 132) break
        next = element.id
      }
      setActiveSection(next)
    }
    const onScroll = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updateActiveSection)
    }
    updateActiveSection()
    body.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      body.removeEventListener('scroll', onScroll)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [bodyKey, sections, view])

  const navigateToSection = (id: string) => {
    const target = document.getElementById(id)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`)
    setActiveSection(id)
  }

  const documentMode = !SHOW_CALCULATION_VIEW_SWITCH || view === 'document'
  const printCalculationDocument = () => {
    printCleanupRef.current?.()
    const previousTitle = document.title
    let cleanedUp = false
    const cleanup = () => {
      if (cleanedUp) return
      cleanedUp = true
      document.body.classList.remove(CALCULATION_PRINT_BODY_CLASS)
      document.title = previousTitle
      window.removeEventListener('afterprint', cleanup)
      if (printCleanupRef.current === cleanup) printCleanupRef.current = null
    }
    printCleanupRef.current = cleanup
    document.body.classList.add(CALCULATION_PRINT_BODY_CLASS)
    document.title = `${title} - P-M Column Designer`
    window.addEventListener('afterprint', cleanup, { once: true })
    try {
      window.print()
    } catch (error) {
      cleanup()
      throw error
    }
  }

  return (
    <div
      className="pm-calculation-dialog-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}
    >
      <article
        ref={dialogRef}
        className={`pm-calculation-dialog ${documentMode ? 'is-document' : 'is-classic'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="pm-calculation-dialog__header">
          <div className="pm-calculation-dialog__heading">
            <span className="pm-calculation-dialog__document-type">Calculation help / technical note</span>
            <h2 id={titleId} className="pm-calc-kicker">{title}</h2>
            <p className="pm-calculation-dialog__document-note">Method, inputs, equations and traceable result rows</p>
          </div>
          <div className="pm-calculation-dialog__header-actions">
            {documentMode ? (
              <button
                type="button"
                className="pm-file-btn pm-calc-pdf-button"
                onClick={printCalculationDocument}
                title="Print this calculation document or save it as PDF"
              >
                <span>PDF</span>
                <Printer size={15} />
              </button>
            ) : null}
            {SHOW_CALCULATION_VIEW_SWITCH ? (
              <div className="pm-calculation-dialog__view-switch" role="group" aria-label="Calculation detail layout">
                <button
                  type="button"
                  className={documentMode ? 'is-active' : ''}
                  aria-pressed={documentMode}
                  onClick={() => setView('document')}
                  title="Technical document layout"
                >
                  <BookOpenText size={15} /><span>Document</span>
                </button>
                <button
                  type="button"
                  className={!documentMode ? 'is-active' : ''}
                  aria-pressed={!documentMode}
                  onClick={() => setView('classic')}
                  title="Original calculation modal layout"
                >
                  <LayoutTemplate size={15} /><span>Classic</span>
                </button>
              </div>
            ) : null}
            {headerAction}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="pm-calculation-dialog__close"
            aria-label={closeLabel}
            onClick={closeDialog}
          >
            <X size={18} />
          </button>
          {!documentMode ? controls : null}
        </header>

        {documentMode ? (
          <div className="pm-calculation-dialog__document">
            <aside className="pm-calculation-document__sidebar" aria-label="Calculation document contents">
              <div className="pm-calculation-document__sidebar-inner">
                <span className="pm-calculation-document__eyebrow">On this page</span>
                <nav className="pm-calculation-document__toc">
                  {sections.length > 0 ? sections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className={activeSection === section.id ? 'is-active' : ''}
                      aria-current={activeSection === section.id ? 'location' : undefined}
                      onClick={() => navigateToSection(section.id)}
                    >
                      <span>{section.index}</span>
                      <strong>{section.title}</strong>
                    </button>
                  )) : <p>Calculation sections will appear when evidence is available.</p>}
                </nav>
                <dl className="pm-calculation-document__meta">
                  <div><dt>Status</dt><dd>PREVIEW</dd></div>
                  <div><dt>Scope</dt><dd>Section resistance</dd></div>
                  <div><dt>Units</dt><dd>kN · kN·m · mm</dd></div>
                </dl>
              </div>
            </aside>
            <div ref={bodyRef} className="pm-calculation-dialog__body" key={bodyKey}>
              <div className="pm-calculation-document__context" aria-label="Current calculation context">
                <span>Viewing</span>
                {controls}
              </div>
              <div className="pm-calculation-document__notice">
                <span>PREVIEW CALCULATION RECORD</span>
                <p>This interactive trace is review evidence for the current result. It is not an accepted or released engineering report.</p>
              </div>
              {children}
            </div>
          </div>
        ) : (
          <div ref={bodyRef} className="pm-calculation-dialog__body" key={bodyKey}>
            {children}
          </div>
        )}

        <footer className="pm-calculation-dialog__footer">
          <span className="pm-calculation-dialog__footer-note">P-M Column Designer · Calculation evidence</span>
          <button type="button" className="pm-secondary-btn" onClick={closeDialog}>Close</button>
        </footer>
      </article>
    </div>
  )
}
