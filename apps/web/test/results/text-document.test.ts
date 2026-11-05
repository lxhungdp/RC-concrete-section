import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTextDocument, saveTextDocument, textFileName } from '../../application/files/text-document'

test('Demand data preserves displayed Unicode, signs, units, unavailable values and frame notes', () => {
  const output = formatTextDocument({ title: 'Demand Check — Field at capacity', groups: [
    { title: 'Context', rows: [['Loadcase', 'Kiểm tra <b>ULS</b>'], ['Frame', 'Previous completed result — updating']] },
    { title: 'Strain', rows: [['ε max', '+0.003300'], ['kx', '—']] },
    { title: 'Demand at centroid', rows: [['Pu', '+1,234.5 kN'], ['Muy', '-35.0 kN·m']] }
  ], notes: ['Pmax governs. This field exceeds permitted Design resistance.'] })
  for (const value of ['PREVIEW', 'Kiểm tra <b>ULS</b>', 'Previous completed result — updating',
    'ε max', '+0.003300', '—', '+1,234.5 kN', '-35.0 kN·m', 'Pmax governs.']) assert.ok(output.includes(value), value)
  assert.ok(output.indexOf('Strain') < output.indexOf('Demand at centroid'))
  assert.ok(output.endsWith('\n'))
  const name = textFileName('Kiểm tra/ULS:*?"<>|\\')
  assert.ok(name.endsWith('.txt') && name.includes('Kiểm tra'))
  assert.equal(/[<>:"/\\|?*]/u.test(name), false)
})

test('Save as writes the displayed text, leaves cancellation alone, and aborts a failed write', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let value = '', closed = false, aborted = false
  const set = (showSaveFilePicker: () => unknown) => Object.defineProperty(globalThis, 'window', { configurable: true, value: { showSaveFilePicker } })
  try {
    set(async () => ({ createWritable: async () => ({
      write: async (blob: Blob) => { value = await blob.text() },
      close: async () => { closed = true }, abort: async () => { aborted = true }
    }) }))
    assert.equal(await saveTextDocument('ULS', 'ε max : —\nPu : +23 kN\n'), 'saved')
    assert.equal(value, 'ε max : —\nPu : +23 kN\n')
    assert.ok(closed && !aborted)
    set(async () => { throw new DOMException('Cancelled', 'AbortError') })
    assert.equal(await saveTextDocument('ULS', value), 'cancelled')
    set(async () => ({ createWritable: async () => ({
      write: async () => { throw new Error('Write failed') }, close: async () => {}, abort: async () => { aborted = true }
    }) }))
    await assert.rejects(saveTextDocument('ULS', value), /Write failed/u)
    assert.equal(aborted, true)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
