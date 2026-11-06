'use client'

import { useEffect, useRef, useState } from 'react'
import type { ParseProjectResult, PmProjectDocument } from '@pm/project'
import type { UnitSelection } from '@pm/units'
import { WORKBOOK_MAX_BYTES, inspectWorkbookArchive } from '@pm/spreadsheet/archive'
import { prepareWorkbookEditor } from '@pm/spreadsheet'
import { buildProjectWorkbook, projectWorkbookFileName } from '@pm/spreadsheet/project-xlsx'
import { projectFromWorkbookEditor } from '@pm/spreadsheet/project'
import { pickSpreadsheetXlsx, saveSpreadsheetXlsx } from '../../../application/files/xlsx-file'
import { connectGridcraftWindow, presentGridcraftWindow } from '../../../application/spreadsheets/gridcraft-window'
import type { GridcraftAction } from '../../../application/spreadsheets/gridcraft-client'
import { MovableDialog } from '../shared/MovableDialog'
import { sameProjectSpreadsheetRevision } from './project-spreadsheet-state'

/** Window controls share the native title row; the frame owns Quick Access, filename and ribbon. */
export function ProjectSpreadsheetWindow({ activation, document, units, revision, onUpdate, onClose }: {
  activation: number; document: PmProjectDocument; units: UnitSelection; revision: readonly unknown[]
  onUpdate(result: Extract<ParseProjectResult, { ok: true }>): readonly unknown[]; onClose(): void
}) {
  const frame = useRef<HTMLIFrameElement>(null), run = useRef<() => void>(() => {})
  const [busy, setBusy] = useState(true), [failure, setFailure] = useState(''), [presented, setPresented] = useState(false)
  const latest = useRef({ revision, onUpdate }); latest.current = { revision, onUpdate }
  const expected = useRef(revision)
  useEffect(() => {
    const view = frame.current?.contentWindow
    if (!view) return
    const { client } = connectGridcraftWindow(view), abort = new AbortController()
    let active = true, pending = true
    let fileName = projectWorkbookFileName(document)
    const dark = () => getComputedStyle(window.document.querySelector('.pm-shell') ?? window.document.documentElement).colorScheme === 'dark'
    const alive = () => active && !abort.signal.aborted
    const feedback = async (message = '', failed = false, saved = false) => {
      if (alive()) await client.status(false, message, failed, saved)
    }
    const update = async () => {
      const captured = latest.current.revision
      const check = () => { if (!sameProjectSpreadsheetRevision(latest.current.revision, captured)) throw new Error('The project changed. Close and reopen Excel.') }
      if (!sameProjectSpreadsheetRevision(captured, expected.current)) throw new Error('The project changed. Close and reopen Excel.')
      const values = await client.values()
      if (!alive()) return
      check()
      const result = await projectFromWorkbookEditor(values)
      if (!alive()) return
      check(); expected.current = latest.current.onUpdate(result)
      await feedback('Updated.')
    }
    const perform = async (action: GridcraftAction | 'update', name?: string) => {
      if (pending || !alive()) return
      pending = true; setBusy(true)
      try {
        await client.status(true)
        if (action === 'open') {
          const file = await pickSpreadsheetXlsx(window, abort.signal)
          if (!file || !alive()) { await feedback(); return }
          if (file.size > WORKBOOK_MAX_BYTES) throw new Error('Spreadsheet workbook exceeds 10 MiB.')
          const prepared = await prepareWorkbookEditor(await file.arrayBuffer())
          if (!alive()) return
          await client.open(prepared.bytes, prepared.mapping, file.name)
          fileName = file.name
          await feedback()
        } else if (action === 'save' || action === 'saveAs') {
          const suggested = name ? /\.xlsx$/iu.test(name) ? name : `${name}.xlsx` : fileName
          const result = await saveSpreadsheetXlsx(suggested, async () => {
            const bytes = await client.export(), issue = inspectWorkbookArchive(bytes, 'Spreadsheet workbook')
            if (issue) throw new Error(issue.message)
            return bytes
          })
          await feedback(result === 'cancelled' ? '' : 'Saved.', false, result !== 'cancelled')
        } else await update()
      } catch (error) { await feedback(error instanceof Error ? error.message : String(error), true).catch(() => {}) }
      finally { pending = false; if (alive()) setBusy(false) }
    }
    run.current = () => { void perform('update') }
    const stopActions = client.onAction((action, name) => { void perform(action, name) })
    void (async () => {
      try {
        const prepared = await prepareWorkbookEditor(new Uint8Array(await buildProjectWorkbook(document, units)).buffer)
        if (!alive()) return
        await client.open(prepared.bytes, prepared.mapping, fileName)
        await client.theme(dark()); await feedback()
        if (alive()) { await presentGridcraftWindow(view, abort.signal); if (alive()) setPresented(true) }
      } catch (error) {
        if (alive()) {
          const message = error instanceof Error ? error.message : String(error)
          setFailure(message)
          await feedback(message, true).catch(() => {})
        }
      } finally { pending = false; if (alive()) setBusy(false) }
    })()
    return () => { active = false; abort.abort(); stopActions(); client.dispose(); run.current = () => {} }
  }, [document, units])
  return <MovableDialog title="Excel" mode="window" nativeTitleBar className="pm-project-spreadsheet-window" busy={busy} activation={activation} onClose={onClose}
    actions={<button type="button" className="ws-action ws-action--primary" disabled={busy || !!failure} onClick={() => run.current()}>Update to Project</button>}>
    <div className="pm-spreadsheet-viewport">
      <iframe ref={frame} title="Project Excel" data-presented={presented} allow="clipboard-read; clipboard-write" />
      {!presented && <div className="pm-spreadsheet-loading" role={failure ? 'alert' : 'status'}>{failure || 'Opening…'}</div>}
    </div>
  </MovableDialog>
}
