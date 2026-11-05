import assert from 'node:assert/strict'
import test from 'node:test'
import { connectGridcraftWindow, presentGridcraftWindow } from '../application/spreadsheets/gridcraft-window'
import { pickSpreadsheetXlsx, saveSpreadsheetXlsx } from '../application/files/xlsx-file'

test('DEV-ARCH-007: app frame startup registers a fresh checked session before navigation', () => {
  const listeners = new Set<unknown>(), order: string[] = []
  let url = ''
  const view = { location: { replace(value: string) { assert.equal(listeners.size, 1); url = value; order.push('navigate') } }, close() {} } as unknown as Window
  const host = { location: { origin: 'https://pm.example' },
    addEventListener(_name: string, listener: unknown) { listeners.add(listener); order.push('listen') }, removeEventListener(_name: string, listener: unknown) { listeners.delete(listener) } } as unknown as Window
  const opened = connectGridcraftWindow(view, host)
  assert.deepEqual(order, ['listen', 'navigate'])
  assert.equal(new URL(url).origin, 'https://pm.example'); assert.equal(new URL(url).searchParams.get('project'), '1')
  assert.equal(new URL(url).searchParams.get('pm'), opened.session)
  opened.client.dispose(); assert.equal(listeners.size, 0)
  const reopened = connectGridcraftWindow(view, host)
  assert.notEqual(reopened.session, opened.session, 'Strict Mode/remount must not reuse a retired session on the same WindowProxy')
  reopened.client.dispose()
})

test('native presentation waits for two paint frames without a P-M modal', async () => {
  const frames: FrameRequestCallback[] = [], dataset: Record<string, string> = {}
  let removed = false
  const view = { closed: false, cancelAnimationFrame() {}, requestAnimationFrame(fn: FrameRequestCallback) { frames.push(fn); return frames.length },
    document: { documentElement: { dataset }, getElementById: () => ({ remove() { removed = true } }) } } as unknown as Window
  const pending = presentGridcraftWindow(view)
  assert.equal(removed, false); frames.shift()!(0); assert.equal(removed, false)
  frames.shift()!(0); await pending
  assert.equal(dataset.pmPresented, 'true'); assert.equal(removed, true)
})

test('closing an app window cancels its pending presentation and never reveals a retired frame', async () => {
  const abort = new AbortController(), dataset: Record<string, string> = {}
  let cancelled = 0
  const view = { closed: false, requestAnimationFrame() { return 42 }, cancelAnimationFrame(id: number) { cancelled = id },
    document: { documentElement: { dataset }, getElementById: () => { throw Error('Retired frame must stay covered') } } } as unknown as Window
  const pending = presentGridcraftWindow(view, abort.signal)
  abort.abort(); await pending
  assert.equal(cancelled, 42); assert.equal(dataset.pmPresented, undefined)
})

test('native Save uses the invoking window and handles cross-realm cancellation before exporting', async () => {
  let generated = false
  const cancelled = { showSaveFilePicker: async () => { throw { name: 'AbortError' } } } as unknown as Window
  assert.equal(await saveSpreadsheetXlsx('Project.xlsx', async () => { generated = true; return new ArrayBuffer(1) }, cancelled), 'cancelled')
  assert.equal(generated, false)
  let written: Blob | undefined, closed = false
  const view = { async showSaveFilePicker(this: Window) {
    assert.equal(this, view)
    return { async createWritable() { return { async write(blob: Blob) { written = blob }, async close() { closed = true }, async abort() {} } } }
  } } as unknown as Window
  assert.equal(await saveSpreadsheetXlsx('Project.xlsx', async () => new Uint8Array([1, 2]).buffer, view), 'saved')
  assert.equal(closed, true); assert.deepEqual(new Uint8Array(await written!.arrayBuffer()), new Uint8Array([1, 2]))
})

test('native Open owns its picker element and settles selection, cancellation and abort', async () => {
  class Input extends EventTarget {
    type = ''; accept = ''; hidden = false; files: File[] = []; removed = false; clicked = false
    remove() { this.removed = true }
    click() { this.clicked = true }
  }
  const events = new EventTarget()
  let input: Input | undefined
  const view = { closed: false, document: { createElement() { input = new Input(); return input }, body: { append() {} } },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) } as unknown as Window
  const controller = new AbortController(), selected = pickSpreadsheetXlsx(view, controller.signal)
  assert.equal(input!.clicked, true); assert.ok(input!.accept.includes('.xlsx'))
  const file = new File(['project'], 'Project.xlsx'); input!.files = [file]; input!.dispatchEvent(new Event('change'))
  assert.equal(await selected, file); assert.equal(input!.removed, true)
  const cancelled = pickSpreadsheetXlsx(view, controller.signal); input!.dispatchEvent(new Event('cancel'))
  assert.equal(await cancelled, null)
  const aborted = pickSpreadsheetXlsx(view, controller.signal); controller.abort()
  assert.equal(await aborted, null); assert.equal(input!.removed, true)
})
