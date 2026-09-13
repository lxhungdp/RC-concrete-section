import assert from 'node:assert/strict'
import test from 'node:test'
import type { PreviewSurface } from '@pm/analysis'
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
  BuildSectionMeshPayload,
  BuildSurfacePayload
} from '../../application/analysis/worker-contract'

class FakeWorker {
  static instances: FakeWorker[] = []
  readonly messages: AnalysisWorkerRequest[] = []
  terminated = false
  onmessage: ((event: MessageEvent<AnalysisWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(message: AnalysisWorkerRequest) {
    this.messages.push(message)
  }

  terminate() {
    this.terminated = true
  }
}

const workerEvent = (data: AnalysisWorkerResponse) =>
  ({ data }) as unknown as MessageEvent<AnalysisWorkerResponse>

test('abort interrupts the worker, replays live jobs, ignores late results, and rehydrates stale surface handles', async () => {
  FakeWorker.instances.length = 0
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })
  Object.defineProperty(globalThis, 'Worker', { value: FakeWorker, configurable: true })
  const {
    AnalysisAbortError,
    buildPreviewSurfaceAsync,
    buildSectionMeshAsync,
    checkLoadcasesAsync
  } = await import('../../application/analysis/client')
  const meshPayload = {
    section: {},
    rebars: [],
    materialStore: {},
    analysisOptions: {}
  } as unknown as BuildSectionMeshPayload
  const surfacePayload = {
    ...meshPayload,
    calculationProfileId: 'custom-stress-strain',
    designBasis: {}
  } as unknown as BuildSurfacePayload

  const surfaceRequest = buildPreviewSurfaceAsync(surfacePayload)
  assert.equal(FakeWorker.instances.length, 1)
  const interrupted = FakeWorker.instances[0]
  const surfaceJobId = interrupted.messages[0].jobId
  const surface = { analysisOptions: {} } as PreviewSurface
  interrupted.onmessage?.(workerEvent({
      type: 'success',
      jobId: surfaceJobId,
      requestType: 'buildSurface',
      result: { surfaceId: 'surface-1', surface }
  }))
  assert.equal(await surfaceRequest, surface)

  const firstController = new AbortController()
  const first = buildSectionMeshAsync(meshPayload, firstController.signal).catch((error: unknown) => error)
  const second = checkLoadcasesAsync({ surface, loadcases: [] })

  assert.equal(interrupted.messages.length, 3)
  const originalCheck = interrupted.messages[2]
  assert.equal(originalCheck.type, 'checkLoadcases')
  if (originalCheck.type !== 'checkLoadcases') throw new Error('Expected a checkLoadcases request.')
  assert.equal(originalCheck.payload.surfaceId, 'surface-1')
  assert.equal(originalCheck.payload.surface, undefined)
  const secondJobId = originalCheck.jobId

  firstController.abort()
  assert.ok((await first) instanceof AnalysisAbortError)
  assert.equal(interrupted.terminated, true)
  assert.equal(FakeWorker.instances.length, 2)

  const replacement = FakeWorker.instances[1]
  assert.deepEqual(replacement.messages.map((message) => message.jobId), [secondJobId])
  const replayedCheck = replacement.messages[0]
  assert.equal(replayedCheck.type, 'checkLoadcases')
  if (replayedCheck.type !== 'checkLoadcases') throw new Error('Expected a replayed checkLoadcases request.')
  assert.equal(replayedCheck.payload.surface, surface)

  let secondSettled = false
  void second.then(() => { secondSettled = true })
  interrupted.onmessage?.(workerEvent({
    type: 'success', jobId: secondJobId, requestType: 'checkLoadcases', result: []
  }))
  await Promise.resolve()
  assert.equal(secondSettled, false)

  replacement.onmessage?.(workerEvent({
    type: 'success', jobId: secondJobId, requestType: 'checkLoadcases', result: []
  }))
  assert.deepEqual(await second, [])

  const staleHandleCheck = checkLoadcasesAsync({ surface, loadcases: [] })
  const staleRequest = replacement.messages.at(-1)!
  assert.equal(staleRequest.type, 'checkLoadcases')
  if (staleRequest.type !== 'checkLoadcases') throw new Error('Expected a stale-handle checkLoadcases request.')
  assert.equal(staleRequest.payload.surfaceId, undefined)
  assert.equal(staleRequest.payload.surface, surface)
  replacement.onmessage?.(workerEvent({
    type: 'success', jobId: staleRequest.jobId, requestType: 'checkLoadcases', result: []
  }))
  assert.deepEqual(await staleHandleCheck, [])

  const replayedController = new AbortController()
  const replayedAbort = buildSectionMeshAsync(meshPayload, replayedController.signal)
    .catch((error: unknown) => error)
  const survivorController = new AbortController()
  const survivor = buildSectionMeshAsync(meshPayload, survivorController.signal)
    .catch((error: unknown) => error)
  replayedController.abort()
  assert.ok((await replayedAbort) instanceof AnalysisAbortError)
  const secondReplacement = FakeWorker.instances[2]
  assert.equal(replacement.terminated, true)
  assert.equal(secondReplacement.messages.length, 1)

  survivorController.abort()
  assert.ok((await survivor) instanceof AnalysisAbortError)
  assert.equal(secondReplacement.terminated, true)
  assert.equal(FakeWorker.instances.length, 3)

  delete (globalThis as { window?: unknown }).window
  delete (globalThis as { Worker?: unknown }).Worker
})
