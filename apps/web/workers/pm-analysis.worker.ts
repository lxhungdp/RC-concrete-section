import { createAnalysisExecution } from '../application/analysis/execution'
import {
  AnalysisInputError,
  type PreviewSurface
} from '@pm/analysis'

import {
  buildChartAuditWorkbookBytes,
  buildCalculationTraceAuditWorkbookBytes,
  buildConcretePointAuditWorkbookBytes,
  buildDemandCheckWorkbookBytes,
  exportEquivalentBlockWorkbook,
  exportMeshAuditDxf,
  exportMeshAuditWorkbook,
  exportSectionWorkbook
} from '@pm/report'

import {
  packSectionMeshView,
  sectionMeshTransferList
} from '../application/analysis/section-mesh-view'
import { BoundedLruCache } from '../application/analysis/bounded-lru'
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse
} from '../application/analysis/worker-contract'

const execution = createAnalysisExecution()

const serializeError = (error: unknown) => (error instanceof Error ? error.message : String(error))

const workerSelf = self as unknown as {
  postMessage: (message: AnalysisWorkerResponse, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<AnalysisWorkerRequest>) => void) | null
}
const publishedSurfaceCache = new BoundedLruCache<string, PreviewSurface>(4)
let publishedSurfaceSequence = 0
let pdfUnicodeFontPromise: Promise<Uint8Array> | null = null

const pdfUnicodeFont = () => {
  pdfUnicodeFontPromise ??= fetch('/fonts/PMReportUnicode-Regular.ttf').then(async (response) => {
    if (!response.ok) throw new Error(`Unicode PDF font could not be loaded (${response.status}).`)
    return new Uint8Array(await response.arrayBuffer())
  })
  return pdfUnicodeFontPromise
}

const publishSurface = (surface: PreviewSurface) => {
  const surfaceId = `surface-${++publishedSurfaceSequence}`
  publishedSurfaceCache.set(surfaceId, surface)
  return { surfaceId, surface }
}

const referencedSurface = (reference: { surfaceId?: string; surface?: PreviewSurface }) => {
  if (reference.surfaceId) {
    const cached = publishedSurfaceCache.get(reference.surfaceId)
    if (cached) return cached
  }
  if (reference.surface) return reference.surface
  throw new Error('The referenced analysis surface is no longer available in this worker.')
}

workerSelf.onmessage = async (event: MessageEvent<AnalysisWorkerRequest>) => {
  const request = event.data

  try {
    if (request.type === 'buildSurface') {
      const result = publishSurface(execution.buildSurface(request.payload))
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'checkLoadcases') {
      const result = execution.checkLoadcases({ ...request.payload, surface: referencedSurface(request.payload) })
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'buildExactDirection') {
      const result = execution.buildExactDirection(request.payload)
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'checkLoadcase') {
      const result = await execution.checkLoadcase({ ...request.payload, surface: referencedSurface(request.payload) })
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'buildFieldMap') {
      const result = execution.buildFieldMap(request.payload)
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'buildSectionMesh') {
      const result = packSectionMeshView(execution.buildSectionMesh(request.payload))
      workerSelf.postMessage(
        { type: 'success', jobId: request.jobId, requestType: request.type, result },
        sectionMeshTransferList(result)
      )
      return
    }

    if (request.type === 'buildPointAudits') {
      const result = execution.buildPointAudits(request.payload)
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'exportMeshExcel' || request.type === 'exportMeshDxf') {
      const mesh = execution.buildSectionMesh(request.payload)
      const exportInput = {
        presentationUnits: request.payload.presentationUnits,
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

    if (request.type === 'exportConcretePointAudit') {
      const bytes = await buildConcretePointAuditWorkbookBytes(request.payload)
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

    if (request.type === 'exportCalculationTraceAudit') {
      const bytes = await buildCalculationTraceAuditWorkbookBytes(request.payload)
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

    if (request.type === 'exportDemandCheck') {
      const bytes = await buildDemandCheckWorkbookBytes({
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
