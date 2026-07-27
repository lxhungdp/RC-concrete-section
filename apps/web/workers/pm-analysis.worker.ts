import {
  AnalysisInputError,
  analysisInputKey,
  buildPreviewSurfaceFromPrepared,
  buildSectionFieldMapFromPrepared,
  checkLoadcasesUtilizationFromSurface,
  prepareAnalysis,
  sliceFixedPContour,
  solveInversePreviewFromPrepared,
  surfaceInputKey,
  type AnalysisErrorCode,
  type InversePreviewResult,
  type LoadcaseQuickCheckResult,
  type PreparedAnalysis,
  type PreviewSurface,
  type SectionFieldMap
} from '@pm/analysis'
import { exportSectionWorkbook, type ExcelExportInput } from '@pm/report'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { AnalysisOptions, LoadCombination } from '@pm/project'

export type BuildSurfacePayload = {
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  analysisOptions: AnalysisOptions
}

export type CheckLoadcasePayload = {
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  loadcase: LoadCombination
  surface: PreviewSurface
}

export type BuildFieldMapPayload = {
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  state: InversePreviewResult['state']
}

export type CheckLoadcasesPayload = {
  surface: PreviewSurface
  loadcases: LoadCombination[]
}

export type AnalysisWorkerJob =
  | { type: 'buildSurface'; jobId: string; payload: BuildSurfacePayload }
  | { type: 'checkLoadcases'; jobId: string; payload: CheckLoadcasesPayload }
  | { type: 'checkLoadcase'; jobId: string; payload: CheckLoadcasePayload }
  | { type: 'buildFieldMap'; jobId: string; payload: BuildFieldMapPayload }
  | { type: 'exportExcel'; jobId: string; payload: ExcelExportInput }

/** Withdraws a job. Effective while it is still queued; a running job is left to finish. */
export type AnalysisWorkerCancel = { type: 'cancel'; jobId: string }

export type AnalysisWorkerRequest = AnalysisWorkerJob | AnalysisWorkerCancel

export type AnalysisWorkerResultMap = {
  buildSurface: PreviewSurface
  checkLoadcases: LoadcaseQuickCheckResult[]
  checkLoadcase: InversePreviewResult
  buildFieldMap: SectionFieldMap
  exportExcel: ArrayBuffer
}

export type AnalysisWorkerResponse =
  | {
      type: 'success'
      jobId: string
      requestType: keyof AnalysisWorkerResultMap
      result: AnalysisWorkerResultMap[keyof AnalysisWorkerResultMap]
    }
  | {
      type: 'error'
      jobId: string
      requestType: AnalysisWorkerJob['type']
      message: string
      /** Present when the kernel rejected the input rather than failing unexpectedly. */
      code?: AnalysisErrorCode
    }
  | { type: 'cancelled'; jobId: string; requestType: AnalysisWorkerJob['type'] }

const serializeError = (error: unknown) => (error instanceof Error ? error.message : String(error))

const workerSelf = self as unknown as {
  postMessage: (message: AnalysisWorkerResponse, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<AnalysisWorkerRequest>) => void) | null
}

/**
 * Jobs withdrawn before they were dequeued. A worker cannot interrupt itself mid-computation, so
 * this drains the backlog that accumulates while one job runs — which is exactly what a rapid edit
 * produces. The job already running still completes; the client discards its result.
 */
const cancelled = new Set<string>()
let preparedCache: { key: string; value: PreparedAnalysis } | null = null
let surfaceCache: { key: string; value: PreviewSurface } | null = null

const preparedFor = (
  payload: Pick<BuildSurfacePayload, 'section' | 'rebars' | 'materialStore'>
) => {
  const key = analysisInputKey(payload.section, payload.rebars, payload.materialStore)
  if (preparedCache?.key === key) return preparedCache.value
  const value = prepareAnalysis(payload.section, payload.rebars, payload.materialStore)
  preparedCache = { key, value }
  return value
}

workerSelf.onmessage = async (event: MessageEvent<AnalysisWorkerRequest>) => {
  const request = event.data

  if (request.type === 'cancel') {
    cancelled.add(request.jobId)
    return
  }

  if (cancelled.delete(request.jobId)) {
    workerSelf.postMessage({ type: 'cancelled', jobId: request.jobId, requestType: request.type })
    return
  }

  try {
    if (request.type === 'buildSurface') {
      const key = surfaceInputKey(
        request.payload.section,
        request.payload.rebars,
        request.payload.materialStore,
        request.payload.analysisOptions
      )
      const result = buildPreviewSurfaceFromPrepared(preparedFor(request.payload), request.payload.analysisOptions)
      // Keep the worker-owned points array. A surface sent to and then back from the UI is cloned,
      // which would otherwise defeat the WeakMap topology cache on every inverse loadcase.
      surfaceCache = { key, value: result }
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'checkLoadcases') {
      const { surface, loadcases } = request.payload
      const result = checkLoadcasesUtilizationFromSurface(surface, loadcases)
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'checkLoadcase') {
      const { section, rebars, materialStore, loadcase, surface } = request.payload
      const key = surfaceInputKey(section, rebars, materialStore, surface.analysisOptions)
      const contour = sliceFixedPContour(
        (surfaceCache?.key === key ? surfaceCache.value : surface).points,
        loadcase.P
      )
      const result = solveInversePreviewFromPrepared(preparedFor({ section, rebars, materialStore }), loadcase, contour)
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'buildFieldMap') {
      const { state } = request.payload
      const result = buildSectionFieldMapFromPrepared(preparedFor(request.payload), state)
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    const blob = await exportSectionWorkbook(request.payload)
    const result = await blob.arrayBuffer()
    workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result }, [result])
  } catch (error) {
    workerSelf.postMessage({
      type: 'error',
      jobId: request.jobId,
      requestType: request.type,
      message: serializeError(error),
      ...(error instanceof AnalysisInputError ? { code: error.code } : {})
    })
  }
}

export {}
