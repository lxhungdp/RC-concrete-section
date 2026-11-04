import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyProjectDocument, parseProjectDocument, serializeProjectDocument, PROJECT_INPUT_LIMITS, type ParseProjectResult } from '@pm/project'
import { importProjectJsonAsync, ProjectImportError } from '../application/project/import'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<ParseProjectResult>) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  text = ''
  terminated = false
  constructor() { FakeWorker.instances.push(this) }
  postMessage(text: string) { this.text = text }
  terminate() { this.terminated = true }
}

test('AUD-004: project import transports parser evidence and terminates failed, aborted and completed workers', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { value: FakeWorker, configurable: true })
  const hasCode = (code: ProjectImportError['code']) => (error: unknown) => error instanceof ProjectImportError && error.code === code
  const last = () => FakeWorker.instances.at(-1)!
  try {
    const text = serializeProjectDocument(createEmptyProjectDocument())
    const success = importProjectJsonAsync(text)
    assert.equal(last().text, text)
    last().onmessage!({ data: parseProjectDocument(text) } as MessageEvent<ParseProjectResult>)
    assert.deepEqual(await success, parseProjectDocument(text))
    assert.equal(last().terminated, true)
    assert.equal(last().onmessage, null)

    const controller = new AbortController()
    const pending = importProjectJsonAsync(text, controller.signal)
    const lateResponse = last().onmessage!
    controller.abort()
    await assert.rejects(pending, hasCode('PROJECT_IMPORT_ABORTED'))
    assert.equal(last().terminated, true)
    lateResponse({ data: parseProjectDocument(text) } as MessageEvent<ParseProjectResult>)

    const failure = importProjectJsonAsync(text)
    last().onerror!()
    await assert.rejects(failure, hasCode('PROJECT_IMPORT_WORKER_FAILED'))
    assert.equal(last().terminated, true)

    const before = FakeWorker.instances.length
    await assert.rejects(importProjectJsonAsync(text, AbortSignal.abort()), hasCode('PROJECT_IMPORT_ABORTED'))
    await assert.rejects(importProjectJsonAsync(' '.repeat(PROJECT_INPUT_LIMITS.jsonBytes + 1)))
    assert.equal(FakeWorker.instances.length, before)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'Worker', previous)
    else Reflect.deleteProperty(globalThis, 'Worker')
  }
})

test('AUD-004: Worker-free import retains bounded parsing and request-boundary cancellation', async () => {
  assert.equal(typeof Worker, 'undefined')
  assert.deepEqual(await importProjectJsonAsync('{}'), parseProjectDocument('{}'))
  const controller = new AbortController()
  const pending = importProjectJsonAsync('{}', controller.signal)
  controller.abort()
  await assert.rejects(pending, (error: unknown) => error instanceof ProjectImportError && error.code === 'PROJECT_IMPORT_ABORTED')
})
