import {
  AnalysisInputError,
  analysisInputKey,
  buildPreviewSurfaceFromPrepared,
  buildSectionFieldMapFromPrepared,
  checkLoadcasesUtilizationFromSurface,
  prepareAnalysis,
  sliceFixedPContour,
  solveInversePreviewFromPrepared,
  type InversePreviewResult,
  type LoadcaseQuickCheckResult,
  type PreparedAnalysis,
  type PreviewSurface,
  type SectionFieldMap
} from '@pm/analysis'
import { exportSectionWorkbook, type ExcelExportInput } from '@pm/report'
import type {
  AnalysisWorkerJob,
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
  BuildFieldMapPayload,
  BuildSurfacePayload,
  CheckLoadcasePayload,
  CheckLoadcasesPayload
} from '../../workers/pm-analysis.worker'

/** Thrown when a request was superseded or its owner unmounted. Callers normally ignore it. */
export class AnalysisAbortError extends Error {
  constructor(message = 'Analysis request was cancelled.') {
    super(message)
    this.name = 'AbortError'
  }
}

export const isAnalysisAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError'

type PendingJob = {
  requestType: AnalysisWorkerJob['type']
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  detach: () => void
}

let worker: Worker | null = null
let workerFailed = false
let sequence = 0
const pending = new Map<string, PendingJob>()
let fallbackPreparedCache: { key: string; value: PreparedAnalysis } | null = null

const fallbackPreparedFor = (
  payload: Pick<BuildSurfacePayload, 'section' | 'rebars' | 'materialStore'>
) => {
  const key = analysisInputKey(payload.section, payload.rebars, payload.materialStore)
  if (fallbackPreparedCache?.key === key) return fallbackPreparedCache.value
  const value = prepareAnalysis(payload.section, payload.rebars, payload.materialStore)
  fallbackPreparedCache = { key, value }
  return value
}

const nextJobId = (type: AnalysisWorkerJob['type']) => `${type}-${Date.now()}-${++sequence}`

const settle = (jobId: string, apply: (job: PendingJob) => void) => {
  const job = pending.get(jobId)
  if (!job) return
  pending.delete(jobId)
  job.detach()
  apply(job)
}

const getWorker = () => {
  if (typeof window === 'undefined' || workerFailed) return null
  if (worker) return worker

  try {
    worker = new Worker(new URL('../../workers/pm-analysis.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
      const response = event.data
      settle(response.jobId, (job) => {
        if (response.type === 'error') {
          const error = new Error(response.message)
          if (response.code) error.name = response.code
          job.reject(error)
          return
        }
        if (response.type === 'cancelled') {
          job.reject(new AnalysisAbortError())
          return
        }
        job.resolve(response.result)
      })
    }
    worker.onerror = (event) => {
      workerFailed = true
      for (const [, job] of pending) {
        job.detach()
        job.reject(new Error(event.message || 'Analysis worker failed.'))
      }
      pending.clear()
      worker?.terminate()
      worker = null
    }
  } catch {
    workerFailed = true
    worker = null
  }

  return worker
}

const requestWorker = <T>(request: Omit<AnalysisWorkerJob, 'jobId'>, signal?: AbortSignal): Promise<T> => {
  if (signal?.aborted) return Promise.reject(new AnalysisAbortError())
  const instance = getWorker()
  if (!instance) return Promise.reject(new Error('Analysis worker is not available.'))
  const jobId = nextJobId(request.type)

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      // Withdraw it from the worker queue, then stop waiting. A job already running still finishes
      // inside the worker, but its result is dropped here and never reaches the UI.
      instance.postMessage({ type: 'cancel', jobId } satisfies AnalysisWorkerRequest)
      settle(jobId, (job) => job.reject(new AnalysisAbortError()))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    pending.set(jobId, {
      requestType: request.type,
      resolve: (value) => resolve(value as T),
      reject,
      detach: () => signal?.removeEventListener('abort', onAbort)
    })
    instance.postMessage({ ...request, jobId } as AnalysisWorkerRequest)
  })
}

const runWorkerOrFallback = async <T>(
  request: Omit<AnalysisWorkerJob, 'jobId'>,
  fallback: () => Promise<T> | T,
  signal?: AbortSignal
) => {
  try {
    return await requestWorker<T>(request, signal)
  } catch (error) {
    if (isAnalysisAbort(error)) throw error
    if (!workerFailed && !(error instanceof Error && error.message === 'Analysis worker is not available.')) throw error
    // The main-thread fallback cannot be interrupted; honour the signal at its boundaries instead.
    if (signal?.aborted) throw new AnalysisAbortError()
    const result = await fallback()
    if (signal?.aborted) throw new AnalysisAbortError()
    return result
  }
}

export const buildPreviewSurfaceAsync = (payload: BuildSurfacePayload, signal?: AbortSignal): Promise<PreviewSurface> =>
  runWorkerOrFallback<PreviewSurface>(
    { type: 'buildSurface', payload },
    () => buildPreviewSurfaceFromPrepared(fallbackPreparedFor(payload), payload.analysisOptions),
    signal
  )

export const checkLoadcasesAsync = (
  payload: CheckLoadcasesPayload,
  signal?: AbortSignal
): Promise<LoadcaseQuickCheckResult[]> =>
  runWorkerOrFallback<LoadcaseQuickCheckResult[]>(
    { type: 'checkLoadcases', payload },
    () => checkLoadcasesUtilizationFromSurface(payload.surface, payload.loadcases),
    signal
  )

export const checkLoadcaseAsync = (
  payload: CheckLoadcasePayload,
  signal?: AbortSignal
): Promise<InversePreviewResult> =>
  runWorkerOrFallback<InversePreviewResult>(
    { type: 'checkLoadcase', payload },
    () => {
      const contour = sliceFixedPContour(payload.surface.points, payload.loadcase.P)
      return solveInversePreviewFromPrepared(fallbackPreparedFor(payload), payload.loadcase, contour)
    },
    signal
  )

export const buildSectionFieldMapAsync = (
  payload: BuildFieldMapPayload,
  signal?: AbortSignal
): Promise<SectionFieldMap> =>
  runWorkerOrFallback<SectionFieldMap>(
    { type: 'buildFieldMap', payload },
    () => buildSectionFieldMapFromPrepared(fallbackPreparedFor(payload), payload.state),
    signal
  )

export const exportSectionWorkbookAsync = async (payload: ExcelExportInput, signal?: AbortSignal): Promise<Blob> => {
  const result = await runWorkerOrFallback<ArrayBuffer>(
    { type: 'exportExcel', payload },
    async () => {
      const blob = await exportSectionWorkbook(payload)
      return blob.arrayBuffer()
    },
    signal
  )
  return new Blob([result], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

/** Re-exported so callers can present a kernel input rejection instead of a generic failure. */
export { AnalysisInputError }
