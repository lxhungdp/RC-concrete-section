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
    for (const listener of listeners) listener({ data: { type: 'pm-gridcraft', version: 2, session: 'session', ...data }, origin, source } as MessageEvent<unknown>)
  }
  return { client, sent, deliver, listeners, closed: () => closed }
}

test('bridge accepts only the matching frame, origin, protocol version and session', async () => {
  const h = harness()
  let ready = false; void h.client.ready.then(() => { ready = true })
  h.deliver({ event: 'ready' }, 'https://example.com')
  h.deliver({ event: 'ready' }, undefined, {} as Window)
  h.deliver({ event: 'ready', version: 1 })
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
  assert.equal(h.sent[0].version, 2)
  assert.deepEqual(h.sent[0].mapping, { sheet: 'Rebars', columns: 6 })
  h.deliver({ id: h.sent[0].id, ok: true, data: {} })
  await opening; h.client.dispose()
})
