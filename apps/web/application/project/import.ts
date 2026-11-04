import { assertProjectJsonSize, parseProjectDocument, type ParseProjectResult } from '@pm/project'

export class ProjectImportError extends Error {
  constructor(readonly code: 'PROJECT_IMPORT_ABORTED' | 'PROJECT_IMPORT_WORKER_FAILED', message: string) {
    super(message)
    this.name = 'ProjectImportError'
  }
}

const aborted = () => new ProjectImportError('PROJECT_IMPORT_ABORTED', 'Project import was cancelled.')

/** One disposable worker keeps synchronous topology validation off the editor thread. */
export const importProjectJsonAsync = async (text: string, signal?: AbortSignal): Promise<ParseProjectResult> => {
  if (signal?.aborted) throw aborted()
  assertProjectJsonSize(text)
  if (typeof Worker === 'undefined') {
    await Promise.resolve()
    if (signal?.aborted) throw aborted()
    return parseProjectDocument(text)
  }
  return new Promise((resolve, reject) => {
    let worker: Worker
    try { worker = new Worker(new URL('../../workers/pm-project-import.worker.ts', import.meta.url), { type: 'module' }) }
    catch { reject(new ProjectImportError('PROJECT_IMPORT_WORKER_FAILED', 'Project validation worker could not start.')); return }
    let settled = false
    const finish = (apply: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', cancel)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      apply()
    }
    const cancel = () => finish(() => reject(aborted()))
    worker.onmessage = (event: MessageEvent<ParseProjectResult>) => finish(() => resolve(event.data))
    worker.onerror = () => finish(() => reject(new ProjectImportError('PROJECT_IMPORT_WORKER_FAILED', 'Project validation worker failed.')))
    worker.onmessageerror = () => finish(() => reject(new ProjectImportError('PROJECT_IMPORT_WORKER_FAILED', 'Project validation response could not be read.')))
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) { cancel(); return }
    try { worker.postMessage(text) }
    catch { finish(() => reject(new ProjectImportError('PROJECT_IMPORT_WORKER_FAILED', 'Project validation request could not be sent.'))) }
  })
}
