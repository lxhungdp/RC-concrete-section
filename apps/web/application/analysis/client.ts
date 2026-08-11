import type {
  InversePreviewResult,
  ExactDirectionCurve,
  LoadcaseQuickCheckResult,
  PreviewSurface,
  SectionFieldMap
} from '@pm/analysis'
import type {
  DemandCheckExcelInput,
  EquivalentBlockExcelInput,
  ExcelExportInput,
  ChartAuditWorkbookInput
} from '@pm/report'
import type { ReportInput } from '@pm/report/report-model'
import type { SectionMeshView } from './section-mesh-view'
import type {
  AnalysisWorkerJob,
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
  BuildFieldMapPayload,
  BuildExactDirectionPayload,
  BuildSectionMeshPayload,
  BuildSurfacePayload,
  BuildSurfaceWorkerResult,
  CheckLoadcasePayload,
  CheckLoadcasesPayload,
  MeshAuditExportPayload
} from './worker-contract'

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
let workerGeneration = 0
const pending = new Map<string, PendingJob>()
const workerSurfaceHandles = new WeakMap<PreviewSurface, { surfaceId: string; generation: number }>()
const loadFallback = () => import('./fallback')

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
    workerGeneration += 1
    worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
      const response = event.data
      settle(response.jobId, (job) => {
        if (response.type === 'error') {
          const error = new Error(response.message)
          if (response.code) error.name = response.code
          job.reject(error)
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
      // A Web Worker cannot process a cancellation message while its synchronous kernel is busy.
      // When this is the only outstanding request, termination is the only real interruption and
      // the next request transparently creates a fresh worker. With concurrent jobs, preserve the
      // shared worker and discard only this late result.
      if (pending.size === 1 && pending.has(jobId) && worker === instance) {
        instance.terminate()
        worker = null
      }
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
  runWorkerOrFallback<BuildSurfaceWorkerResult>(
    { type: 'buildSurface', payload },
    async () => (await loadFallback()).buildPreviewSurfaceFallback(payload),
    signal
  ).then((result) => {
    if (result.surfaceId !== 'main-thread-fallback') {
      workerSurfaceHandles.set(result.surface, { surfaceId: result.surfaceId, generation: workerGeneration })
    }
    return result.surface
  })

const workerSurfaceReference = (surface: PreviewSurface) => {
  // Ensure a lazily recreated worker advances the generation before testing the handle.
  const instance = getWorker()
  const handle = workerSurfaceHandles.get(surface)
  return instance && handle?.generation === workerGeneration
    ? { surfaceId: handle.surfaceId }
    : { surface }
}

export const buildExactDirectionCurveAsync = (
  payload: BuildExactDirectionPayload,
  signal?: AbortSignal
): Promise<ExactDirectionCurve> =>
  runWorkerOrFallback<ExactDirectionCurve>(
    { type: 'buildExactDirection', payload },
    async () => (await loadFallback()).buildExactDirectionFallback(payload),
    signal
  )

export const checkLoadcasesAsync = (
  payload: CheckLoadcasesPayload,
  signal?: AbortSignal
): Promise<LoadcaseQuickCheckResult[]> =>
  runWorkerOrFallback<LoadcaseQuickCheckResult[]>(
    {
      type: 'checkLoadcases',
      payload: { ...workerSurfaceReference(payload.surface), loadcases: payload.loadcases }
    },
    async () => (await loadFallback()).checkLoadcasesFallback(payload),
    signal
  )

export const checkLoadcaseAsync = (
  payload: CheckLoadcasePayload,
  signal?: AbortSignal
): Promise<InversePreviewResult> =>
  runWorkerOrFallback<InversePreviewResult>(
    {
      type: 'checkLoadcase',
      payload: {
        ...payload,
        surface: undefined,
        ...workerSurfaceReference(payload.surface),
        analysisOptions: payload.surface.analysisOptions
      }
    },
    async () => (await loadFallback()).checkLoadcaseFallback(payload),
    signal
  )

export const buildSectionFieldMapAsync = (
  payload: BuildFieldMapPayload,
  signal?: AbortSignal
): Promise<SectionFieldMap> =>
  runWorkerOrFallback<SectionFieldMap>(
    { type: 'buildFieldMap', payload },
    async () => (await loadFallback()).buildSectionFieldMapFallback(payload),
    signal
  )

export const buildSectionMeshAsync = (
  payload: BuildSectionMeshPayload,
  signal?: AbortSignal
): Promise<SectionMeshView> =>
  runWorkerOrFallback<SectionMeshView>(
    { type: 'buildSectionMesh', payload },
    async () => (await loadFallback()).buildSectionMeshFallback(payload),
    signal
  )

const exportMeshAuditAsync = async (
  type: 'exportMeshExcel' | 'exportMeshDxf',
  payload: MeshAuditExportPayload,
  signal?: AbortSignal
) => {
  const result = await runWorkerOrFallback<ArrayBuffer>(
    { type, payload },
    async () => (await loadFallback()).exportMeshAuditFallback(type, payload),
    signal
  )
  return new Blob([result], {
    type:
      type === 'exportMeshExcel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/dxf'
  })
}

export const exportMeshAuditWorkbookAsync = (
  payload: MeshAuditExportPayload,
  signal?: AbortSignal
) => exportMeshAuditAsync('exportMeshExcel', payload, signal)

export const exportMeshAuditDxfAsync = (
  payload: MeshAuditExportPayload,
  signal?: AbortSignal
) => exportMeshAuditAsync('exportMeshDxf', payload, signal)

export const exportSectionWorkbookAsync = async (payload: ExcelExportInput, signal?: AbortSignal): Promise<Blob> => {
  const result = await runWorkerOrFallback<ArrayBuffer>(
    { type: 'exportExcel', payload },
    async () => (await loadFallback()).exportSectionWorkbookFallback(payload),
    signal
  )
  return new Blob([result], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

export const exportEquivalentBlockWorkbookAsync = async (
  payload: EquivalentBlockExcelInput,
  signal?: AbortSignal
): Promise<Blob> => {
  const result = await runWorkerOrFallback<ArrayBuffer>(
    { type: 'exportBlockExcel', payload },
    async () => (await loadFallback()).exportEquivalentBlockWorkbookFallback(payload),
    signal
  )
  return new Blob([result], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

export const exportChartAuditWorkbookAsync = async (
  payload: ChartAuditWorkbookInput,
  signal?: AbortSignal
): Promise<Blob> => {
  const { surface, ...rest } = payload
  const result = await runWorkerOrFallback<ArrayBuffer>(
    {
      type: 'exportChartAudit',
      payload: { ...rest, ...workerSurfaceReference(surface) }
    },
    async () => (await loadFallback()).exportChartAuditWorkbookFallback(payload),
    signal
  )
  return new Blob([result], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

export const exportDemandCheckWorkbookAsync = async (
  payload: DemandCheckExcelInput,
  signal?: AbortSignal
): Promise<Blob> => {
  const { surface, ...rest } = payload
  const result = await runWorkerOrFallback<ArrayBuffer>(
    {
      type: 'exportDemandCheck',
      payload: { ...rest, ...workerSurfaceReference(surface) }
    },
    async () => (await loadFallback()).exportDemandCheckWorkbookFallback(payload),
    signal
  )
  return new Blob([result], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

export const exportColumnReportPdfAsync = async (
  payload: ReportInput,
  signal?: AbortSignal
): Promise<{ blob: Blob; fileName: string }> => {
  const result = await runWorkerOrFallback<{ bytes: ArrayBuffer; fileName: string }>(
    { type: 'exportPdfReport', payload },
    async () => (await loadFallback()).exportColumnReportPdfFallback(payload),
    signal
  )
  return { blob: new Blob([result.bytes], { type: 'application/pdf' }), fileName: result.fileName }
}
