import {
  AnalysisInputError,
  analysisInputKey,
  applyDesignCheckToInverse,
  buildDesignPreviewSurfaceFromPrepared,
  buildExactDirectionCurveFromPrepared,
  buildSectionFieldMapFromPrepared,
  checkLoadcaseUtilizationFromSurface,
  checkLoadcasesUtilizationFromSurface,
  codeAdjustedDemandOfCheck,
  prepareAnalysis,
  sliceActiveDesignPContour,
  solveInversePreviewFromPrepared,
  surfaceInputKey,
  type PreparedAnalysis,
  type PreviewSurface
} from '@pm/analysis'
import {
  buildEquivalentBlockDesignSurfaceFromPrepared,
  buildEquivalentBlockExactDirectionCurveFromPrepared,
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
  buildChartAuditWorkbookBytes,
  exportEquivalentBlockWorkbook,
  exportMeshAuditDxf,
  exportMeshAuditWorkbook,
  exportSectionWorkbook,
  type EquivalentBlockExcelInput,
  type ExcelExportInput
} from '@pm/report'
import {
  analysisMeshKernelOptions,
  isEquivalentBlockAnalysisOptions,
  type AnalysisOptions
} from '@pm/project'
import {
  packSectionMeshView,
  sectionMeshTransferList
} from '../application/analysis/section-mesh-view'
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
  BuildSurfacePayload
} from '../application/analysis/worker-contract'

const serializeError = (error: unknown) => (error instanceof Error ? error.message : String(error))

const workerSelf = self as unknown as {
  postMessage: (message: AnalysisWorkerResponse, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<AnalysisWorkerRequest>) => void) | null
}

let preparedCache: { key: string; value: PreparedAnalysis } | null = null
let preparedBlockCache: { key: string; value: PreparedBlockAnalysis } | null = null
let surfaceCache: { key: string; value: PreviewSurface } | null = null
let blockSurfaceCache: {
  key: string
  core: EquivalentBlockDesignSurface
} | null = null
let publishedSurfaceCache: { id: string; value: PreviewSurface } | null = null
let publishedSurfaceSequence = 0
let pdfUnicodeFontPromise: Promise<Uint8Array> | null = null

const pdfUnicodeFont = () => {
  pdfUnicodeFontPromise ??= fetch('/fonts/PMReportUnicode-Regular.ttf').then(async (response) => {
    if (!response.ok) throw new Error(`Unicode PDF font could not be loaded (${response.status}).`)
    return new Uint8Array(await response.arrayBuffer())
  })
  return pdfUnicodeFontPromise
}

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

const publishSurface = (surface: PreviewSurface) => {
  const surfaceId = `surface-${++publishedSurfaceSequence}`
  publishedSurfaceCache = { id: surfaceId, value: surface }
  return { surfaceId, surface }
}

const referencedSurface = (reference: { surfaceId?: string; surface?: PreviewSurface }) => {
  if (reference.surfaceId && publishedSurfaceCache?.id === reference.surfaceId) return publishedSurfaceCache.value
  if (reference.surface) return reference.surface
  throw new Error('The referenced analysis surface is no longer available in this worker.')
}

workerSelf.onmessage = async (event: MessageEvent<AnalysisWorkerRequest>) => {
  const request = event.data

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
        workerSelf.postMessage({
          type: 'success',
          jobId: request.jobId,
          requestType: request.type,
          result: publishSurface(result)
        })
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
      workerSelf.postMessage({
        type: 'success',
        jobId: request.jobId,
        requestType: request.type,
        result: publishSurface(result)
      })
      return
    }

    if (request.type === 'checkLoadcases') {
      const surface = referencedSurface(request.payload)
      const { loadcases } = request.payload
      const result = checkLoadcasesUtilizationFromSurface(surface, loadcases)
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'buildExactDirection') {
      const { analysisOptions, beta } = request.payload
      const result = isEquivalentBlockAnalysisOptions(analysisOptions)
        ? buildEquivalentBlockExactDirectionCurveFromPrepared(
            preparedBlockFor(request.payload),
            analysisOptions,
            beta
          )
        : buildExactDirectionCurveFromPrepared(
            preparedFor({ ...request.payload, analysisOptions }),
            request.payload.materialStore,
            request.payload.designBasis,
            analysisOptions,
            beta
          )
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'checkLoadcase') {
      const { section, rebars, materialStore, loadcase, analysisOptions } = request.payload
      const surface = referencedSurface(request.payload)
      if (isEquivalentBlockAnalysisOptions(analysisOptions)) {
        const key = blockSurfaceInputKey({
          calculationProfileId: request.payload.calculationProfileId,
          section,
          rebars,
          materialStore,
          analysisOptions,
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
          : buildEquivalentBlockDesignSurfaceFromPrepared(prepared, analysisOptions)
        if (blockSurfaceCache?.key !== key) {
          blockSurfaceCache = { key, core }
        }
        const result = solveEquivalentBlockDemandFromPrepared(
          prepared,
          analysisOptions,
          loadcase,
          core
        )
        workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
        return
      }
      const key = `${surfaceInputKey(section, rebars, materialStore, analysisOptions)}:${JSON.stringify(request.payload.designBasis)}`
      const activeSurface = surfaceCache?.key === key ? surfaceCache.value : surface
      const contour = sliceActiveDesignPContour(activeSurface, loadcase.P)
      const designCheck = checkLoadcaseUtilizationFromSurface(
        activeSurface,
        loadcase
      )
      const inverse = solveInversePreviewFromPrepared(
        preparedFor({
          section,
          rebars,
          materialStore,
          analysisOptions,
          designBasis: request.payload.designBasis
        }),
        loadcase,
        contour,
        codeAdjustedDemandOfCheck(designCheck)
      )
      const result = applyDesignCheckToInverse(inverse, designCheck)
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

    if (request.type === 'exportPdfReport') {
      // Imported here rather than at module scope so the drawing code stays out of the worker
      // bundle until a report is actually asked for.
      const { buildColumnReportPdf } = await import('@pm/report/pdf')
      const report = buildColumnReportPdf(request.payload, {
        unicodeFontBytes: await pdfUnicodeFont()
      })
      const buffer = report.bytes.buffer.slice(
        report.bytes.byteOffset,
        report.bytes.byteOffset + report.bytes.byteLength
      ) as ArrayBuffer
      workerSelf.postMessage(
        {
          type: 'success',
          jobId: request.jobId,
          requestType: request.type,
          result: { bytes: buffer, fileName: report.fileName }
        },
        [buffer]
      )
      return
    }

    if (request.type === 'exportBlockExcel') {
      const blockBlob = await exportEquivalentBlockWorkbook(request.payload)
      const blockResult = await blockBlob.arrayBuffer()
      workerSelf.postMessage(
        { type: 'success', jobId: request.jobId, requestType: request.type, result: blockResult },
        [blockResult]
      )
      return
    }

    if (request.type === 'exportChartAudit') {
      const bytes = await buildChartAuditWorkbookBytes({
        ...request.payload,
        surface: referencedSurface(request.payload)
      })
      const result = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer
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
