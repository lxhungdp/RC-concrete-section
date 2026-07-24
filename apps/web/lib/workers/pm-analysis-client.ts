import {
  buildPreviewSurface,
  buildSectionFieldMap,
  sliceFixedPContour,
  solveInversePreview,
  type InversePreviewResult,
  type PreviewSurface,
  type SectionFieldMap
} from '../pm-preview-analysis'
import { exportSectionWorkbook, type ExcelExportInput } from '../pm-excel-export'
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
  BuildFieldMapPayload,
  BuildSurfacePayload,
  CheckLoadcasePayload
} from '../../workers/pm-analysis.worker'

type PendingJob = {
  requestType: AnalysisWorkerRequest['type']
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

let worker: Worker | null = null
let workerFailed = false
let sequence = 0
const pending = new Map<string, PendingJob>()

const nextJobId = (type: AnalysisWorkerRequest['type']) => `${type}-${Date.now()}-${++sequence}`

const getWorker = () => {
  if (typeof window === 'undefined' || workerFailed) return null
  if (worker) return worker

  try {
    worker = new Worker(new URL('../../workers/pm-analysis.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
      const response = event.data
      const job = pending.get(response.jobId)
      if (!job) return
      pending.delete(response.jobId)
      if (response.type === 'error') {
        job.reject(new Error(response.message))
        return
      }
      job.resolve(response.result)
    }
    worker.onerror = (event) => {
      workerFailed = true
      for (const [, job] of pending) job.reject(new Error(event.message || 'Analysis worker failed.'))
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

const requestWorker = <T>(request: Omit<AnalysisWorkerRequest, 'jobId'>): Promise<T> => {
  const instance = getWorker()
  if (!instance) return Promise.reject(new Error('Analysis worker is not available.'))
  const jobId = nextJobId(request.type)
  return new Promise<T>((resolve, reject) => {
    pending.set(jobId, {
      requestType: request.type,
      resolve: (value) => resolve(value as T),
      reject
    })
    instance.postMessage({ ...request, jobId } as AnalysisWorkerRequest)
  })
}

const runWorkerOrFallback = async <T>(request: Omit<AnalysisWorkerRequest, 'jobId'>, fallback: () => Promise<T> | T) => {
  try {
    return await requestWorker<T>(request)
  } catch (error) {
    if (!workerFailed && !(error instanceof Error && error.message === 'Analysis worker is not available.')) throw error
    return fallback()
  }
}

export const buildPreviewSurfaceAsync = (payload: BuildSurfacePayload): Promise<PreviewSurface> =>
  runWorkerOrFallback<PreviewSurface>({ type: 'buildSurface', payload }, () =>
    buildPreviewSurface(payload.section, payload.rebars, payload.materialStore, payload.fixedP ?? 0)
  )

export const checkLoadcaseAsync = (payload: CheckLoadcasePayload): Promise<InversePreviewResult> =>
  runWorkerOrFallback<InversePreviewResult>({ type: 'checkLoadcase', payload }, () => {
    const contour = sliceFixedPContour(payload.surface.points, payload.loadcase.P)
    return solveInversePreview(payload.section, payload.rebars, payload.materialStore, payload.loadcase, contour)
  })

export const buildSectionFieldMapAsync = (payload: BuildFieldMapPayload): Promise<SectionFieldMap> =>
  runWorkerOrFallback<SectionFieldMap>({ type: 'buildFieldMap', payload }, () =>
    buildSectionFieldMap(payload.section, payload.rebars, payload.materialStore, payload.state)
  )

export const exportSectionWorkbookAsync = async (payload: ExcelExportInput): Promise<Blob> => {
  const result = await runWorkerOrFallback<ArrayBuffer>({ type: 'exportExcel', payload }, async () => {
    const blob = await exportSectionWorkbook(payload)
    return blob.arrayBuffer()
  })
  return new Blob([result], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}
