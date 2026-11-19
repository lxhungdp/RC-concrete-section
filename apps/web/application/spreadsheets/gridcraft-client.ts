/** Versioned web-only adapter for the pinned local Gridcraft artifact. */
import { SPREADSHEET_PROTOCOL, validateGridcraftMapping, type GridcraftMapping } from '@pm/spreadsheet'
const TYPE = SPREADSHEET_PROTOCOL.type, VERSION = SPREADSHEET_PROTOCOL.version, TIMEOUT_MS = 60_000
type Reply = { data: unknown; bytes?: ArrayBuffer }
type Pending = { resolve(reply: Reply): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
export type GridcraftAction = 'open' | 'save' | 'saveAs'
const record = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value)

export class GridcraftClient {
  private id = 0
  private closed = false
  private pending = new Map<number, Pending>()
  private readyResolve!: () => void
  private readyReject!: (error: Error) => void
  readonly ready = new Promise<void>((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject })
  private readyTimer: ReturnType<typeof setTimeout>
  private actionListener?: (action: GridcraftAction, name?: string) => void

  constructor(private frame: Window, private session: string, private host: Window = window, private onClose?: () => void) {
    // Strict-mode cleanup may dispose before workbook preparation starts awaiting readiness.
    void this.ready.catch(() => {})
    this.readyTimer = setTimeout(() => this.readyReject(new Error('Spreadsheet startup timed out. Close and reopen it.')), TIMEOUT_MS)
    host.addEventListener('message', this.receive)
  }

  private receive = (event: MessageEvent<unknown>) => {
    const data = event.data
    if (this.closed || event.origin !== this.host.location.origin || event.source !== this.frame || !record(data) ||
      data.type !== TYPE || data.version !== VERSION || data.session !== this.session) return
    if (data.event === 'ready') { clearTimeout(this.readyTimer); this.readyResolve(); return }
    if (data.event === 'close') { this.onClose?.(); return }
    if (data.event === 'action' && (data.action === 'open' || data.action === 'save' || data.action === 'saveAs')) {
      const name = typeof data.name === 'string' && data.name.length <= 240 && !/[\\/\u0000-\u001f]/u.test(data.name) ? data.name : undefined
      this.actionListener?.(data.action, name); return
    }
    if (data.event === 'failed') { clearTimeout(this.readyTimer); this.readyReject(new Error(typeof data.error === 'string' ? data.error : 'Spreadsheet startup failed.')); return }
    if (typeof data.id !== 'number') return
    const pending = this.pending.get(data.id)
    if (!pending) return
    this.pending.delete(data.id); clearTimeout(pending.timer)
    if (data.ok === true && (data.bytes === undefined || data.bytes instanceof ArrayBuffer)) pending.resolve({ data: data.data, bytes: data.bytes })
    else pending.reject(new Error(typeof data.error === 'string' ? data.error : 'Invalid spreadsheet reply.'))
  }

  private async request(action: string, bytes?: ArrayBuffer, dark?: boolean, mapping?: GridcraftMapping, fields: Record<string, unknown> = {}): Promise<Reply> {
    await this.ready
    if (this.closed) throw new Error('Spreadsheet closed.')
    if (this.pending.size >= 4) throw new Error('Spreadsheet is busy. Try again.')
    const id = ++this.id
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Spreadsheet operation timed out. P-M values were not changed.')) }, TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      try { this.frame.postMessage({ ...fields, type: TYPE, version: VERSION, session: this.session, id, action, bytes, dark, mapping }, this.host.location.origin, bytes ? [bytes] : []) }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error) }
    })
  }

  async open(bytes: ArrayBuffer, mapping: GridcraftMapping, name?: string) {
    if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) throw new Error('Spreadsheet workbook must be a nonempty XLSX up to 10 MiB.')
    if (name !== undefined && (!name.length || name.length > 240 || /[\\/\u0000-\u001f]/u.test(name))) throw new Error('Invalid spreadsheet file name.')
    await this.request('open', bytes, undefined, validateGridcraftMapping(mapping), { name })
  }
  async values(): Promise<unknown> { return (await this.request('values')).data }
  async export(): Promise<ArrayBuffer> {
    const reply = await this.request('export')
    if (!reply.bytes || reply.bytes.byteLength > 10 * 1024 * 1024) throw new Error('Invalid spreadsheet file reply.')
    return reply.bytes
  }
  async theme(dark: boolean) { await this.request('theme', undefined, dark) }
  async status(busy: boolean, message = '', failed = false, saved = false) {
    await this.request('status', undefined, undefined, undefined, { busy, message: message.slice(0, 4000), failed, saved })
  }
  onAction(listener: (action: GridcraftAction, name?: string) => void): () => void {
    this.actionListener = listener
    return () => { if (this.actionListener === listener) this.actionListener = undefined }
  }
  dispose() {
    this.closed = true; clearTimeout(this.readyTimer)
    this.actionListener = undefined
    this.host.removeEventListener('message', this.receive)
    const error = new Error('Spreadsheet closed.')
    this.readyReject(error)
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error) }
    this.pending.clear()
  }
}
