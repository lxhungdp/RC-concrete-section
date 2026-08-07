import {
  AnalysisInputError,
  analysisInputKey,
  buildExactDirectionCurveFromPrepared,
  buildDesignPreviewSurfaceFromPrepared,
  buildSectionFieldMapFromPrepared,
  checkLoadcaseUtilizationFromSurface,
  checkLoadcasesUtilizationFromSurface,
  codeAdjustedDemandOfCheck,
  prepareAnalysis,
  sliceActiveDesignPContour,
  solveInversePreviewFromPrepared,
  type InversePreviewResult,
  type ExactDirectionCurve,
  type LoadcaseQuickCheckResult,
  type PreparedAnalysis,
  type PreviewSurface,
  type SectionFieldMap
} from '@pm/analysis'
import {
  buildEquivalentBlockPreviewSurfaceFromPrepared,
  buildEquivalentBlockExactDirectionCurveFromPrepared,
  buildEquivalentBlockFieldMapFromPrepared,
  prepareBlockAnalysis,
  solveEquivalentBlockDemandFromPrepared,
  type PreparedBlockAnalysis
} from '@pm/analysis-equivalent-block'
import {
  buildResistanceMaterialSets,
  createDefaultDesignBasis,
  type DesignBasis
} from '@pm/design'
import {
  exportEquivalentBlockWorkbook,
  exportMeshAuditDxf,
  exportMeshAuditWorkbook,
  exportSectionWorkbook,
  type EquivalentBlockExcelInput,
  type ExcelExportInput
} from '@pm/report'
import type { ReportInput } from '@pm/report/report-model'
import { analysisMeshKernelOptions, isEquivalentBlockAnalysisOptions, type AnalysisOptions } from '@pm/project'
import { packSectionMeshView, type SectionMeshView } from './section-mesh-view'
import type {
  AnalysisWorkerJob,
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
  BuildFieldMapPayload,
  BuildExactDirectionPayload,
  BuildSectionMeshPayload,
  BuildSurfacePayload,
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
const pending = new Map<string, PendingJob>()
let fallbackPreparedCache: { key: string; value: PreparedAnalysis } | null = null
let fallbackBlockCache: { key: string; value: PreparedBlockAnalysis } | null = null
let pdfUnicodeFontPromise: Promise<Uint8Array> | null = null

const pdfUnicodeFont = () => {
  pdfUnicodeFontPromise ??= fetch('/fonts/PMReportUnicode-Regular.ttf').then(async (response) => {
    if (!response.ok) throw new Error(`Unicode PDF font could not be loaded (${response.status}).`)
    return new Uint8Array(await response.arrayBuffer())
  })
  return pdfUnicodeFontPromise
}

const fallbackPreparedFor = (
  payload: Pick<BuildSurfacePayload, 'section' | 'rebars' | 'materialStore'> & { analysisOptions: AnalysisOptions } & {
    designBasis?: DesignBasis
  }
) => {
  const meshOptions = analysisMeshKernelOptions(payload.analysisOptions)
  const designBasis = payload.designBasis ?? createDefaultDesignBasis(payload.materialStore)
  const stateMaterials = buildResistanceMaterialSets(payload.materialStore, designBasis).stateMaterials
  const key = `${analysisInputKey(payload.section, payload.rebars, stateMaterials, meshOptions)}:${JSON.stringify(designBasis)}`
  if (fallbackPreparedCache?.key === key) return fallbackPreparedCache.value
  const value = prepareAnalysis(payload.section, payload.rebars, stateMaterials, meshOptions)
  fallbackPreparedCache = { key, value }
  return value
}

const fallbackBlockFor = (payload: Pick<BuildSurfacePayload,
  'calculationProfileId' | 'section' | 'rebars' | 'materialStore' | 'designBasis'>) => {
  const key = JSON.stringify(payload)
  if (fallbackBlockCache?.key === key) return fallbackBlockCache.value
  const value = prepareBlockAnalysis(
    payload.calculationProfileId,
    payload.section,
    payload.rebars,
    payload.materialStore,
    payload.designBasis
  )
  fallbackBlockCache = { key, value }
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
  runWorkerOrFallback<PreviewSurface>(
    { type: 'buildSurface', payload },
    () => {
      if (isEquivalentBlockAnalysisOptions(payload.analysisOptions)) {
        const result = buildEquivalentBlockPreviewSurfaceFromPrepared(
          fallbackBlockFor(payload),
          payload.analysisOptions
        )
        result.calculationProfileId = payload.calculationProfileId
        return result
      }
      const result = buildDesignPreviewSurfaceFromPrepared(
        fallbackPreparedFor({ ...payload, analysisOptions: payload.analysisOptions }),
        payload.materialStore,
        payload.designBasis,
        payload.analysisOptions
      )
      result.calculationProfileId = payload.calculationProfileId
      return result
    },
    signal
  )

export const buildExactDirectionCurveAsync = (
  payload: BuildExactDirectionPayload,
  signal?: AbortSignal
): Promise<ExactDirectionCurve> =>
  runWorkerOrFallback<ExactDirectionCurve>(
    { type: 'buildExactDirection', payload },
    () => {
      if (isEquivalentBlockAnalysisOptions(payload.analysisOptions)) {
        return buildEquivalentBlockExactDirectionCurveFromPrepared(
          fallbackBlockFor(payload),
          payload.analysisOptions,
          payload.beta
        )
      }
      return buildExactDirectionCurveFromPrepared(
        fallbackPreparedFor({ ...payload, analysisOptions: payload.analysisOptions }),
        payload.materialStore,
        payload.designBasis,
        payload.analysisOptions,
        payload.beta
      )
    },
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
      if (isEquivalentBlockAnalysisOptions(payload.surface.analysisOptions)) {
        return solveEquivalentBlockDemandFromPrepared(
          fallbackBlockFor(payload),
          payload.surface.analysisOptions,
          payload.loadcase
        )
      }
      const contour = sliceActiveDesignPContour(payload.surface, payload.loadcase.P)
      const designCheck = checkLoadcaseUtilizationFromSurface(payload.surface, payload.loadcase)
      const inverse = solveInversePreviewFromPrepared(
        fallbackPreparedFor({ ...payload, analysisOptions: payload.surface.analysisOptions }),
        payload.loadcase,
        contour,
        codeAdjustedDemandOfCheck(designCheck)
      )
      return {
        ...inverse,
        utilization: designCheck.proportionalUtilization,
        proportionalUtilization: designCheck.proportionalUtilization,
        fixedPUtilization: designCheck.fixedPUtilization,
        designCapacityPoint: designCheck.capacityPoint,
        resistance: designCheck.resistance
      }
    },
    signal
  )

export const buildSectionFieldMapAsync = (
  payload: BuildFieldMapPayload,
  signal?: AbortSignal
): Promise<SectionFieldMap> =>
  runWorkerOrFallback<SectionFieldMap>(
    { type: 'buildFieldMap', payload },
    () => {
      if (isEquivalentBlockAnalysisOptions(payload.analysisOptions)) {
        if (!payload.blockState) throw new Error('The axial-cap face has no unique equivalent-block field state.')
        return buildEquivalentBlockFieldMapFromPrepared(fallbackBlockFor(payload), payload.blockState)
      }
      return buildSectionFieldMapFromPrepared(
        fallbackPreparedFor({ ...payload, analysisOptions: payload.analysisOptions }),
        payload.state
      )
    },
    signal
  )

export const buildSectionMeshAsync = (
  payload: BuildSectionMeshPayload,
  signal?: AbortSignal
): Promise<SectionMeshView> =>
  runWorkerOrFallback<SectionMeshView>(
    { type: 'buildSectionMesh', payload },
    () => packSectionMeshView(fallbackPreparedFor(payload).mesh),
    signal
  )

const exportMeshAuditAsync = async (
  type: 'exportMeshExcel' | 'exportMeshDxf',
  payload: MeshAuditExportPayload,
  signal?: AbortSignal
) => {
  const result = await runWorkerOrFallback<ArrayBuffer>(
    { type, payload },
    async () => {
      const mesh = fallbackPreparedFor(payload).mesh
      const input = {
        projectName: payload.projectName,
        sectionName: payload.sectionName,
        section: payload.section,
        rebars: payload.rebars,
        mesh
      }
      const blob =
        type === 'exportMeshExcel'
          ? await exportMeshAuditWorkbook(input)
          : exportMeshAuditDxf(input)
      return blob.arrayBuffer()
    },
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

export const exportEquivalentBlockWorkbookAsync = async (
  payload: EquivalentBlockExcelInput,
  signal?: AbortSignal
): Promise<Blob> => {
  const result = await runWorkerOrFallback<ArrayBuffer>(
    { type: 'exportBlockExcel', payload },
    async () => {
      const blob = await exportEquivalentBlockWorkbook(payload)
      return blob.arrayBuffer()
    },
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
    async () => {
      const { buildColumnReportPdf } = await import('@pm/report/pdf')
      const report = buildColumnReportPdf(payload, {
        unicodeFontBytes: await pdfUnicodeFont()
      })
      return {
        bytes: report.bytes.buffer.slice(
          report.bytes.byteOffset,
          report.bytes.byteOffset + report.bytes.byteLength
        ) as ArrayBuffer,
        fileName: report.fileName
      }
    },
    signal
  )
  return { blob: new Blob([result.bytes], { type: 'application/pdf' }), fileName: result.fileName }
}

/** Re-exported so callers can present a kernel input rejection instead of a generic failure. */
export { AnalysisInputError }
