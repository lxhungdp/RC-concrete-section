import assert from 'node:assert/strict'
import test from 'node:test'
import { GridcraftClient } from '../../application/spreadsheets/gridcraft-client'

function harness() {
  const listeners = new Set<(event: MessageEvent<unknown>) => void>()
  const sent: Record<string, unknown>[] = []
  const frame = { postMessage: (data: Record<string, unknown>) => { sent.push(data) } } as unknown as Window
  const host = { location: { origin: 'http://localhost:3001' }, addEventListener: (_: string, fn: (event: MessageEvent<unknown>) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (event: MessageEvent<unknown>) => void) => listeners.delete(fn) } as unknown as Window
  let closed = 0
  const client = new GridcraftClient(frame, 'session', host, () => { closed++ })
  const deliver = (data: Record<string, unknown>, origin = host.location.origin, source = frame) => {
    for (const listener of listeners) listener({ data: { type: 'pm-gridcraft', version: 4, session: 'session', ...data }, origin, source } as MessageEvent<unknown>)
  }
  return { client, sent, deliver, listeners, closed: () => closed }
}

test('bridge accepts only the matching frame, origin, protocol version and session', async () => {
  const h = harness()
  let ready = false; void h.client.ready.then(() => { ready = true })
  h.deliver({ event: 'ready' }, 'https://example.com')
  h.deliver({ event: 'ready' }, undefined, {} as Window)
  h.deliver({ event: 'ready', version: 1 })
  h.deliver({ event: 'ready', version: 2 })
  h.deliver({ event: 'ready', version: 3 })
  h.deliver({ event: 'ready', session: 'old' })
  await Promise.resolve(); assert.equal(ready, false)
  h.deliver({ event: 'ready' }); await h.client.ready
  assert.equal(ready, true)
  h.client.dispose(); assert.equal(h.listeners.size, 0)
})

test('pending operations are correlated and closing rejects them without accepting late replies', async () => {
  const h = harness(); h.deliver({ event: 'ready' })
  const pending = h.client.values(), assertion = assert.rejects(pending, /Spreadsheet closed/)
  await Promise.resolve(); await Promise.resolve()
  assert.equal(h.sent[0].action, 'values')
  h.client.dispose(); await assertion
  h.deliver({ id: h.sent[0].id, ok: true, data: { rows: [] } })
  assert.equal(h.listeners.size, 0)
})

test('disposing before file preparation awaits ready has a handled rejection', async () => {
  const h = harness(); h.client.dispose()
  await assert.rejects(h.client.ready, /Spreadsheet closed/)
  await assert.rejects(h.client.values(), /Spreadsheet closed/)
})

test('export requires a bounded binary reply and input bounds fail before messaging', async () => {
  const h = harness(); h.deliver({ event: 'ready' })
  await assert.rejects(h.client.open(new ArrayBuffer(10 * 1024 * 1024 + 1), { sheet: 'Loadcases', columns: 5 }), /10 MiB/)
  assert.equal(h.sent.length, 0)
  const pending = h.client.export()
  await Promise.resolve(); await Promise.resolve()
  h.deliver({ id: h.sent[0].id, ok: true, data: {} })
  await assert.rejects(pending, /Invalid spreadsheet file/)
  h.deliver({ event: 'close', session: 'old' }); assert.equal(h.closed(), 0)
  h.deliver({ event: 'close' }); assert.equal(h.closed(), 1)
  h.client.dispose()
})

test('generic open carries a validated sheet mapping and rejects malformed descriptors before messaging', async () => {
  const h = harness(); h.deliver({ event: 'ready' })
  await assert.rejects(h.client.open(new ArrayBuffer(8), { sheet: 'Coordinates', columns: 65 }), /table mapping/)
  assert.equal(h.sent.length, 0)
  const opening = h.client.open(new ArrayBuffer(8), { sheet: 'Rebars', columns: 6 })
  await Promise.resolve(); await Promise.resolve()
  assert.equal(h.sent[0].version, 4)
  assert.deepEqual(h.sent[0].mapping, { sheet: 'Rebars', columns: 6 })
  h.deliver({ id: h.sent[0].id, ok: true, data: {} })
  await opening; h.client.dispose()
})

test('project mode opens an explicit workbook without a general command bridge', async () => {
  const h = harness(); h.deliver({ event: 'ready' })
  await assert.rejects(h.client.open(new ArrayBuffer(8), { kind: 'workbook', sheet: 'Bad/name' }))
  assert.equal(h.sent.length, 0)
  const opened = h.client.open(new ArrayBuffer(8), { kind: 'workbook', sheet: 'Project' })
  await Promise.resolve(); await Promise.resolve()
  assert.deepEqual(h.sent[0].mapping, { kind: 'workbook', sheet: 'Project' })
  h.deliver({ id: h.sent[0].id, ok: true, data: {} }); await opened
  h.client.dispose()
})

test('native actions keep source/origin/session/version checks and expose only original file actions', () => {
  const h = harness(), actions: string[] = []
  const stop = h.client.onAction(action => actions.push(action))
  h.deliver({ event: 'action', action: 'save' }, 'https://example.com')
  h.deliver({ event: 'action', action: 'save', session: 'old' })
  h.deliver({ event: 'action', action: 'save', version: 3 })
  h.deliver({ event: 'action', action: 'command' })
  h.deliver({ event: 'action', action: { toString: () => 'update' } })
  h.deliver({ event: 'action', action: 'update' })
  assert.deepEqual(actions, [])
  for (const action of ['open', 'save', 'saveAs']) h.deliver({ event: 'action', action })
  assert.deepEqual(actions, ['open', 'save', 'saveAs'])
  stop(); h.deliver({ event: 'action', action: 'save' }); assert.equal(actions.length, 3)
  h.client.dispose(); h.deliver({ event: 'action', action: 'save' }); assert.equal(actions.length, 3)
})

test('native file names and feedback are bounded independently of project values', async () => {
  const h = harness(); h.deliver({ event: 'ready' })
  await assert.rejects(h.client.open(new ArrayBuffer(1), { kind: 'workbook', sheet: 'Project' }, '../bad.xlsx'))
  assert.equal(h.sent.length, 0)
  const pending = h.client.status(false, 'x'.repeat(5000), true, false)
  await Promise.resolve(); await Promise.resolve()
  assert.equal(h.sent[0].action, 'status'); assert.equal(h.sent[0].message, 'x'.repeat(4000))
  assert.equal(h.sent[0].busy, false); assert.equal(h.sent[0].failed, true); assert.equal(h.sent[0].saved, false)
  h.deliver({ id: h.sent[0].id, ok: true, data: {} }); await pending; h.client.dispose()
})
