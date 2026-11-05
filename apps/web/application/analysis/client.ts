import type {
  InversePreviewResult,
  ExactDirectionCurve,
  LoadcaseQuickCheckResult,
  PointCalculationAudit,
  PreviewSurface,
  SectionFieldMap
} from '@pm/analysis'
import type {
  DemandCheckExcelInput,
  EquivalentBlockExcelInput,
  ExcelExportInput,
  ChartAuditWorkbookInput,
  CalculationTraceAuditWorkbookInput
} from '@pm/report'
import type { ReportInput } from '@pm/report/report-model'
import type { SectionMeshView } from './section-mesh-view'
import type {
  AnalysisWorkerJob,
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
  BuildFieldMapPayload,
  BuildPointAuditsPayload,
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
  replayRequest: AnalysisWorkerRequest
  assignedWorker: Worker
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
    const instance = new Worker(new URL('../../workers/pm-analysis.worker.ts', import.meta.url), { type: 'module' })
    worker = instance
    workerGeneration += 1
    instance.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
      if (worker !== instance) return
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
    instance.onerror = (event) => {
      if (worker !== instance) return
      workerFailed = true
      for (const [, job] of pending) {
        job.detach()
        job.reject(new Error(event.message || 'Analysis worker failed.'))
      }
      pending.clear()
      instance.terminate()
      worker = null
    }
  } catch {
    workerFailed = true
    worker = null
  }

  return worker
}

const rejectPendingAfterRestartFailure = (message: string) => {
  for (const [jobId] of pending) {
    settle(jobId, (job) => job.reject(new Error(message)))
  }
}

const restartWorkerAndReplay = (interrupted: Worker) => {
  if (worker !== interrupted) return
  interrupted.terminate()
  worker = null
  if (pending.size === 0) return
  const replacement = getWorker()
  if (!replacement) {
    rejectPendingAfterRestartFailure('Analysis worker could not be restarted after cancellation.')
    return
  }
  try {
    for (const job of pending.values()) {
      job.assignedWorker = replacement
      replacement.postMessage(job.replayRequest)
    }
  } catch (error) {
    workerFailed = true
    replacement.terminate()
    worker = null
    rejectPendingAfterRestartFailure(error instanceof Error ? error.message : String(error))
  }
}

const requestWorker = <T>(
  request: Omit<AnalysisWorkerJob, 'jobId'>,
  signal?: AbortSignal,
  replayRequest: Omit<AnalysisWorkerJob, 'jobId'> = request
): Promise<T> => {
  if (signal?.aborted) return Promise.reject(new AnalysisAbortError())
  const instance = getWorker()
  if (!instance) return Promise.reject(new Error('Analysis worker is not available.'))
  const jobId = nextJobId(request.type)
  const wireRequest = { ...request, jobId } as AnalysisWorkerRequest
  const wireReplayRequest = { ...replayRequest, jobId } as AnalysisWorkerRequest

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      const assignedWorker = pending.get(jobId)?.assignedWorker
      const interrupt = assignedWorker !== undefined && worker === assignedWorker
      settle(jobId, (job) => job.reject(new AnalysisAbortError()))
      // Synchronous numerical kernels cannot consume a cancellation message while running.
      // Termination provides real interruption; every other live request is replayed with the same
      // job id and, where necessary, a full surface fallback on the replacement worker.
      if (interrupt) restartWorkerAndReplay(assignedWorker)
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    pending.set(jobId, {
      requestType: request.type,
      replayRequest: wireReplayRequest,
      assignedWorker: instance,
      resolve: (value) => resolve(value as T),
      reject,
      detach: () => signal?.removeEventListener('abort', onAbort)
    })
    instance.postMessage(wireRequest)
  })
}

const runWorkerOrFallback = async <T>(
  request: Omit<AnalysisWorkerJob, 'jobId'>,
  fallback: () => Promise<T> | T,
  signal?: AbortSignal,
  replayRequest: Omit<AnalysisWorkerJob, 'jobId'> = request
) => {
  try {
    return await requestWorker<T>(request, signal, replayRequest)
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
      payload: { ...workerSurfaceReference(payload.surface), loadcases: payload.loadcases, checkBasis: payload.checkBasis,
        preparedInputs: payload.preparedInputs }
    },
    async () => (await loadFallback()).checkLoadcasesFallback(payload),
    signal,
    { type: 'checkLoadcases', payload }
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
    signal,
    {
      type: 'checkLoadcase',
      payload: { ...payload, analysisOptions: payload.surface.analysisOptions }
    }
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

export const buildPointAuditsAsync = (
  payload: BuildPointAuditsPayload,
  signal?: AbortSignal
): Promise<Array<{ key: string; audit: PointCalculationAudit }>> =>
  runWorkerOrFallback<Array<{ key: string; audit: PointCalculationAudit }>>(
    { type: 'buildPointAudits', payload },
    async () => (await loadFallback()).buildPointAuditsFallback(payload),
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
    signal,
    { type: 'exportChartAudit', payload: { ...rest, surface } }
  )
  return new Blob([result], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

export const exportConcretePointAuditWorkbookAsync = async (
  payload: import('@pm/report').ConcretePointAuditWorkbookInput,
  signal?: AbortSignal
): Promise<Blob> => {
  const result = await runWorkerOrFallback<ArrayBuffer>(
    { type: 'exportConcretePointAudit', payload },
    async () => (await loadFallback()).exportConcretePointAuditWorkbookFallback(payload),
    signal
  )
  return new Blob([result], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

export const exportCalculationTraceAuditWorkbookAsync = async (
  payload: CalculationTraceAuditWorkbookInput,
  signal?: AbortSignal
): Promise<Blob> => {
  const result = await runWorkerOrFallback<ArrayBuffer>(
    { type: 'exportCalculationTraceAudit', payload },
    async () => (await loadFallback()).exportCalculationTraceAuditWorkbookFallback(payload),
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
    signal,
    { type: 'exportDemandCheck', payload: { ...rest, surface } }
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
