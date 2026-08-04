import {
  AnalysisInputError,
  analysisInputKey,
  buildDesignPreviewSurfaceFromPrepared,
  buildSectionFieldMapFromPrepared,
  checkLoadcaseUtilizationFromSurface,
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
import {
  buildEquivalentBlockDesignSurfaceFromPrepared,
  buildEquivalentBlockPreviewSurfaceFromPrepared,
  buildEquivalentBlockFieldMapFromPrepared,
  prepareBlockAnalysis,
  solveEquivalentBlockDemandFromPrepared,
  type EquivalentBlockDesignSurface,
  type PreparedBlockAnalysis
} from '@pm/analysis-equivalent-block'
import {
  buildResistanceMaterialSets,
  createDefaultDesignBasis,
  type DesignBasis
} from '@pm/design'
import {
  exportMeshAuditDxf,
  exportMeshAuditWorkbook,
  exportSectionWorkbook,
  type ExcelExportInput
} from '@pm/report'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import {
  analysisMeshKernelOptions,
  isEquivalentBlockAnalysisOptions,
  type AnalysisOptions,
  type CalculationAnalysisOptions,
  type CalculationProfileId,
  type LoadCombination
} from '@pm/project'
import {
  packSectionMeshView,
  sectionMeshTransferList,
  type SectionMeshView
} from '../lib/section-mesh-view'

export type BuildSurfacePayload = {
  calculationProfileId: CalculationProfileId
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  analysisOptions: CalculationAnalysisOptions
  designBasis: DesignBasis
}

export type CheckLoadcasePayload = {
  calculationProfileId: CalculationProfileId
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  loadcase: LoadCombination
  surface: PreviewSurface
  designBasis: DesignBasis
}

export type BuildFieldMapPayload = {
  calculationProfileId: CalculationProfileId
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  analysisOptions: CalculationAnalysisOptions
  state: InversePreviewResult['state']
  blockState?: { neutralAxisAngle: number; neutralAxisDepth: number }
  designBasis: DesignBasis
}

export type BuildSectionMeshPayload = {
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  analysisOptions: AnalysisOptions
}

export type MeshAuditExportPayload = BuildSectionMeshPayload & {
  projectName: string
  sectionName: string
}

export type CheckLoadcasesPayload = {
  surface: PreviewSurface
  loadcases: LoadCombination[]
}

export type AnalysisWorkerJob =
  | { type: 'buildSurface'; jobId: string; payload: BuildSurfacePayload }
  | { type: 'checkLoadcases'; jobId: string; payload: CheckLoadcasesPayload }
  | { type: 'checkLoadcase'; jobId: string; payload: CheckLoadcasePayload }
  | { type: 'buildSectionMesh'; jobId: string; payload: BuildSectionMeshPayload }
  | { type: 'exportMeshExcel'; jobId: string; payload: MeshAuditExportPayload }
  | { type: 'exportMeshDxf'; jobId: string; payload: MeshAuditExportPayload }
  | { type: 'buildFieldMap'; jobId: string; payload: BuildFieldMapPayload }
  | { type: 'exportExcel'; jobId: string; payload: ExcelExportInput }

/** Withdraws a job. Effective while it is still queued; a running job is left to finish. */
export type AnalysisWorkerCancel = { type: 'cancel'; jobId: string }

export type AnalysisWorkerRequest = AnalysisWorkerJob | AnalysisWorkerCancel

export type AnalysisWorkerResultMap = {
  buildSurface: PreviewSurface
  checkLoadcases: LoadcaseQuickCheckResult[]
  checkLoadcase: InversePreviewResult
  buildSectionMesh: SectionMeshView
  exportMeshExcel: ArrayBuffer
  exportMeshDxf: ArrayBuffer
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
let preparedBlockCache: { key: string; value: PreparedBlockAnalysis } | null = null
let surfaceCache: { key: string; value: PreviewSurface } | null = null
let blockSurfaceCache: {
  key: string
  core: EquivalentBlockDesignSurface
} | null = null

const blockSurfaceInputKey = (payload: Pick<BuildSurfacePayload,
  'calculationProfileId' | 'section' | 'rebars' | 'materialStore' | 'analysisOptions' | 'designBasis'>) => JSON.stringify({
  calculationProfileId: payload.calculationProfileId,
  section: payload.section,
  rebars: payload.rebars,
  materialStore: payload.materialStore,
  analysisOptions: payload.analysisOptions,
  designBasis: payload.designBasis
})

const preparedFor = (
  payload: Pick<BuildSurfacePayload, 'section' | 'rebars' | 'materialStore'> & { analysisOptions: AnalysisOptions } & {
    designBasis?: DesignBasis
  }
) => {
  const meshOptions = analysisMeshKernelOptions(payload.analysisOptions)
  const designBasis = payload.designBasis ?? createDefaultDesignBasis(payload.materialStore)
  const stateMaterials = buildResistanceMaterialSets(payload.materialStore, designBasis).stateMaterials
  const key = `${analysisInputKey(payload.section, payload.rebars, stateMaterials, meshOptions)}:${JSON.stringify(designBasis)}`
  if (preparedCache?.key === key) return preparedCache.value
  const value = prepareAnalysis(payload.section, payload.rebars, stateMaterials, meshOptions)
  preparedCache = { key, value }
  return value
}

const preparedBlockFor = (payload: Pick<BuildSurfacePayload,
  'calculationProfileId' | 'section' | 'rebars' | 'materialStore' | 'designBasis'>) => {
  const key = JSON.stringify(payload)
  if (preparedBlockCache?.key === key) return preparedBlockCache.value
  const value = prepareBlockAnalysis(
    payload.calculationProfileId,
    payload.section,
    payload.rebars,
    payload.materialStore,
    payload.designBasis
  )
  preparedBlockCache = { key, value }
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
      if (isEquivalentBlockAnalysisOptions(request.payload.analysisOptions)) {
        const prepared = preparedBlockFor(request.payload)
        const core = buildEquivalentBlockDesignSurfaceFromPrepared(
          prepared,
          request.payload.analysisOptions
        )
        const result = buildEquivalentBlockPreviewSurfaceFromPrepared(
          prepared,
          request.payload.analysisOptions,
          core
        )
        result.calculationProfileId = request.payload.calculationProfileId
        blockSurfaceCache = { key: blockSurfaceInputKey(request.payload), core }
        workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
        return
      }
      const key = surfaceInputKey(
        request.payload.section,
        request.payload.rebars,
        request.payload.materialStore,
        request.payload.analysisOptions
      )
      const designKey = `${key}:${JSON.stringify(request.payload.designBasis)}`
      const result = buildDesignPreviewSurfaceFromPrepared(
        preparedFor({ ...request.payload, analysisOptions: request.payload.analysisOptions }),
        request.payload.materialStore,
        request.payload.designBasis,
        request.payload.analysisOptions
      )
      result.calculationProfileId = request.payload.calculationProfileId
      // Keep the worker-owned points array. A surface sent to and then back from the UI is cloned,
      // which would otherwise defeat the WeakMap topology cache on every inverse loadcase.
      surfaceCache = { key: designKey, value: result }
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
      if (isEquivalentBlockAnalysisOptions(surface.analysisOptions)) {
        const key = blockSurfaceInputKey({
          calculationProfileId: request.payload.calculationProfileId,
          section,
          rebars,
          materialStore,
          analysisOptions: surface.analysisOptions,
          designBasis: request.payload.designBasis
        })
        const prepared = preparedBlockFor({
          calculationProfileId: request.payload.calculationProfileId,
          section,
          rebars,
          materialStore,
          designBasis: request.payload.designBasis
        })
        const core = blockSurfaceCache?.key === key
          ? blockSurfaceCache.core
          : buildEquivalentBlockDesignSurfaceFromPrepared(prepared, surface.analysisOptions)
        if (blockSurfaceCache?.key !== key) {
          blockSurfaceCache = { key, core }
        }
        const result = solveEquivalentBlockDemandFromPrepared(
          prepared,
          surface.analysisOptions,
          loadcase,
          core
        )
        workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
        return
      }
      const key = `${surfaceInputKey(section, rebars, materialStore, surface.analysisOptions)}:${JSON.stringify(request.payload.designBasis)}`
      const contour = sliceFixedPContour(
        (surfaceCache?.key === key ? surfaceCache.value : surface).points,
        loadcase.P,
        (surfaceCache?.key === key ? surfaceCache.value : surface).triangles
      )
      const inverse = solveInversePreviewFromPrepared(
        preparedFor({
          section,
          rebars,
          materialStore,
          analysisOptions: surface.analysisOptions,
          designBasis: request.payload.designBasis
        }),
        loadcase,
        contour
      )
      const designCheck = checkLoadcaseUtilizationFromSurface(
        surfaceCache?.key === key ? surfaceCache.value : surface,
        loadcase
      )
      const result = {
        ...inverse,
        utilization: designCheck.proportionalUtilization,
        proportionalUtilization: designCheck.proportionalUtilization,
        fixedPUtilization: designCheck.fixedPUtilization,
        designCapacityPoint: designCheck.capacityPoint,
        resistance: designCheck.resistance
      }
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'buildFieldMap') {
      if (isEquivalentBlockAnalysisOptions(request.payload.analysisOptions)) {
        if (!request.payload.blockState) throw new Error('The axial-cap face has no unique equivalent-block field state.')
        const result = buildEquivalentBlockFieldMapFromPrepared(
          preparedBlockFor(request.payload),
          request.payload.blockState
        )
        workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
        return
      }
      const { state } = request.payload
      const result = buildSectionFieldMapFromPrepared(
        preparedFor({ ...request.payload, analysisOptions: request.payload.analysisOptions }),
        state
      )
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'buildSectionMesh') {
      const result = packSectionMeshView(preparedFor(request.payload).mesh)
      workerSelf.postMessage(
        { type: 'success', jobId: request.jobId, requestType: request.type, result },
        sectionMeshTransferList(result)
      )
      return
    }

    if (request.type === 'exportMeshExcel' || request.type === 'exportMeshDxf') {
      const mesh = preparedFor(request.payload).mesh
      const exportInput = {
        projectName: request.payload.projectName,
        sectionName: request.payload.sectionName,
        section: request.payload.section,
        rebars: request.payload.rebars,
        mesh
      }
      const blob =
        request.type === 'exportMeshExcel'
          ? await exportMeshAuditWorkbook(exportInput)
          : exportMeshAuditDxf(exportInput)
      const result = await blob.arrayBuffer()
      workerSelf.postMessage(
        { type: 'success', jobId: request.jobId, requestType: request.type, result },
        [result]
      )
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
