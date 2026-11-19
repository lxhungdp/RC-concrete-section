'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { PreparedSheet, GridcraftMapping } from '@pm/spreadsheet'
import { GridcraftClient } from '../../../application/spreadsheets/gridcraft-client'
import { saveSpreadsheetXlsx } from '../../../application/files/xlsx-file'
import { MovableDialog } from './MovableDialog'
import { WORKBOOK_MAX_BYTES } from '@pm/spreadsheet/archive'

export type SpreadsheetAdapter<C, V> = Readonly<{
  title: string; frameTitle: string; fileName: string
  create(): Promise<PreparedSheet<C, GridcraftMapping>>
  open(bytes: ArrayBuffer): Promise<PreparedSheet<C, GridcraftMapping>>
  read(value: unknown, context: C): V | Promise<V>
  save?(bytes: ArrayBuffer): Promise<ArrayBuffer>
  caption?(context: C): string
}>

export function SpreadsheetDialog<C, V>({ adapter, target, updateDisabled = false, className = '', saveLabel = 'Save as…', matchesTarget = Object.is, onUpdate, onClose }: {
  adapter: SpreadsheetAdapter<C, V>; target: unknown; updateDisabled?: boolean; className?: string; saveLabel?: string
  matchesTarget?(actual: unknown, expected: unknown): boolean; onUpdate(values: V): unknown; onClose(): void
}) {
  const [session] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [status, setStatus] = useState('')
  const operationPending = useRef(true)
  const [presented, setPresented] = useState(false)
  const [caption, setCaption] = useState('')
  const frame = useRef<HTMLIFrameElement>(null), file = useRef<HTMLInputElement>(null)
  const client = useRef<GridcraftClient | null>(null), context = useRef<C | null>(null)
  const latest = useRef({ target, onUpdate }); latest.current = { target, onUpdate }
  const expected = useRef(target)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    const view = frame.current?.contentWindow
    if (!view) { setError('Spreadsheet window is unavailable.'); operationPending.current = false; setBusy(false); return }
    const connection = new GridcraftClient(view, session, window, onClose); client.current = connection
    let active = true
    let cancelPaint: (() => void) | undefined
    const darkTheme = () => {
      const shell = frame.current?.closest('.pm-shell')
      return getComputedStyle(shell ?? document.documentElement).colorScheme === 'dark'
    }
    const theme = () => { void connection.theme(darkTheme()).catch(() => {}) }
    const painted = () => new Promise<void>((resolve, reject) => {
      // The host acknowledges open/theme after its UI pass. Let the child draw the next frame,
      // then cross a second frame boundary so its canvas is composited before it becomes visible.
      let request = view.requestAnimationFrame(() => {
        request = view.requestAnimationFrame(() => { cancelPaint = undefined; resolve() })
      })
      cancelPaint = () => { view.cancelAnimationFrame(request); reject(new Error('Spreadsheet closed.')) }
    })
    const observer = new MutationObserver(theme)
    observer.observe(frame.current?.closest('.pm-shell') ?? document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-jscad-theme'] })
    void (async () => {
      try {
        const prepared = await adapter.create()
        if (!active) return
        await connection.open(prepared.bytes, prepared.mapping)
        if (!active) return
        await connection.theme(darkTheme())
        if (!active) return
        await painted()
        if (active) {
          context.current = prepared.context; setCaption(adapter.caption?.(prepared.context) ?? '')
          setPresented(true)
        }
      } catch (failure) { if (active) { setError(failure instanceof Error ? failure.message : String(failure)); setStatus('') } }
      finally { if (active) { operationPending.current = false; setBusy(false) } }
    })()
    return () => { active = false; mounted.current = false; cancelPaint?.(); observer.disconnect(); connection.dispose(); client.current = null }
  }, [session])

  const perform = async (operation: () => Promise<void>) => {
    if (operationPending.current) return
    operationPending.current = true
    setBusy(true); setError(''); setStatus('')
    try { await operation() }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { if (mounted.current) { operationPending.current = false; setBusy(false) } }
  }
  const update = () => perform(async () => {
    const connection = client.current, declared = context.current, captured = latest.current.target
    if (!connection || !declared) throw new Error('Open the spreadsheet first.')
    if (!matchesTarget(captured, expected.current)) throw new Error('The project or table changed. Close and reopen the spreadsheet.')
    const snapshot = await connection.values()
    if (!mounted.current) return
    if (!matchesTarget(latest.current.target, captured)) throw new Error('The project or table changed. Close and reopen the spreadsheet.')
    const values = await adapter.read(snapshot, declared)
    if (!mounted.current) return
    if (!matchesTarget(latest.current.target, captured)) throw new Error('The project or table changed. Close and reopen the spreadsheet.')
    expected.current = latest.current.onUpdate(values)
    setStatus('Updated.')
  })
  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]; event.target.value = ''
    if (!selected) return
    await perform(async () => {
      if (selected.size > WORKBOOK_MAX_BYTES) throw new Error('Spreadsheet workbook exceeds 10 MiB.')
      const prepared = await adapter.open(await selected.arrayBuffer())
      if (!mounted.current || !client.current) return
      await client.current.open(prepared.bytes, prepared.mapping)
      if (mounted.current) {
        context.current = prepared.context; setCaption(adapter.caption?.(prepared.context) ?? '')
      }
    })
  }
  const save = () => perform(async () => {
    const connection = client.current
    if (!connection || !context.current) throw new Error('Open the spreadsheet first.')
    const result = await saveSpreadsheetXlsx(adapter.fileName, async () => {
      const bytes = await connection.export()
      return adapter.save ? adapter.save(bytes) : bytes
    })
    if (mounted.current && result !== 'cancelled') setStatus(result === 'saved' ? 'Saved.' : 'Download started.')
  })
  return <MovableDialog title={adapter.title} caption={caption} className={`pm-spreadsheet-dialog ${className}`} onClose={onClose} actions={<>
    <span role="status">{status}</span>
    <button type="button" className="ws-action" disabled={busy} onClick={() => file.current?.click()}>Open file</button>
    <button type="button" className="ws-action" disabled={busy || !context.current} onClick={() => void save()}>{saveLabel}</button>
    <button type="button" className="ws-action ws-action--primary" disabled={busy || updateDisabled || !context.current} onClick={() => void update()}>Update</button>
  </>}>
    {error && <p className="pm-spreadsheet-error" role="alert">{error}</p>}
    <div className="pm-spreadsheet-viewport">
      <iframe ref={frame} title={adapter.frameTitle} src={`/gridcraft/index.html?pm=${session}`} sandbox="allow-scripts allow-same-origin" allow="clipboard-read; clipboard-write" inert={busy || !presented} aria-busy={busy} aria-hidden={!presented} data-presented={presented} />
      {!presented && busy && <div className="pm-spreadsheet-loading" role="status">Opening…</div>}
    </div>
    <input ref={file} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => void openFile(event)} />
  </MovableDialog>
}
