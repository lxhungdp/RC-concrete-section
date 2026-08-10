'use client'

import { useEffect, useRef, useState } from 'react'
import { Save, X } from 'lucide-react'
import { cloneProjectInformation, type ProjectInformation } from '@pm/project'

type ProjectInformationDialogProps = {
  projectName: string
  information: ProjectInformation
  onClose: () => void
  onSave: (projectName: string, information: ProjectInformation) => void
}

const cleanLine = (value: string) => value.trim().replace(/\s+/g, ' ')

const normalizedInformation = (information: ProjectInformation): ProjectInformation => ({
  client: cleanLine(information.client),
  company: cleanLine(information.company),
  designedBy: cleanLine(information.designedBy),
  checkedBy: cleanLine(information.checkedBy),
  address: cleanLine(information.address),
  date: information.date.trim()
})

export function ProjectInformationDialog({
  projectName,
  information,
  onClose,
  onSave
}: ProjectInformationDialogProps) {
  const firstInputRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState(projectName)
  const [draft, setDraft] = useState(() => cloneProjectInformation(information))

  useEffect(() => {
    firstInputRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave(cleanLine(name), normalizedInformation(draft))
  }

  return (
    <div
      className="pm-project-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="pm-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-project-dialog-title"
      >
        <header className="pm-project-dialog__header">
          <div>
            <h2 id="pm-project-dialog-title">Project information</h2>
            <p>Saved with the project and shown in exported reports.</p>
          </div>
          <button type="button" className="pm-project-dialog__close" onClick={onClose} aria-label="Close project information">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submit} className="pm-project-dialog__form">
          <div className="pm-project-dialog__rows">
            <label className="pm-project-dialog__field">
              <span>Project Name</span>
              <input ref={firstInputRef} value={name} maxLength={160} onChange={(event) => setName(event.target.value)} />
            </label>

            <label className="pm-project-dialog__field">
              <span>Client</span>
              <input value={draft.client} maxLength={160} onChange={(event) => setDraft((current) => ({ ...current, client: event.target.value }))} />
            </label>

            <label className="pm-project-dialog__field">
              <span>Company</span>
              <input value={draft.company} maxLength={160} onChange={(event) => setDraft((current) => ({ ...current, company: event.target.value }))} />
            </label>

            <div className="pm-project-dialog__row pm-project-dialog__row--paired">
              <label className="pm-project-dialog__field">
                <span>Designed by</span>
                <input value={draft.designedBy} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, designedBy: event.target.value }))} />
              </label>
              <label className="pm-project-dialog__field">
                <span>Checked by</span>
                <input value={draft.checkedBy} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, checkedBy: event.target.value }))} />
              </label>
            </div>

            <div className="pm-project-dialog__row pm-project-dialog__row--address-date">
              <label className="pm-project-dialog__field">
                <span>Address</span>
                <input value={draft.address} maxLength={240} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} />
              </label>
              <label className="pm-project-dialog__field">
                <span>Date</span>
                <input type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} />
              </label>
            </div>
          </div>

          <footer className="pm-project-dialog__actions">
            <button type="button" className="pm-secondary-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="pm-primary-btn"><Save size={14} /> Save changes</button>
          </footer>
        </form>
      </section>
    </div>
  )
}
