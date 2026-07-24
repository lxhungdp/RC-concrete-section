import {
  buildPreviewSurface,
  buildSectionFieldMap,
  sliceFixedPContour,
  solveInversePreview,
  type InversePreviewResult,
  type PreviewSurface,
  type SectionFieldMap
} from '../lib/pm-preview-analysis'
import { exportSectionWorkbook, type ExcelExportInput } from '../lib/pm-excel-export'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { LoadCombination } from '@pm/project'

export type BuildSurfacePayload = {
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  fixedP?: number
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

export type AnalysisWorkerRequest =
  | { type: 'buildSurface'; jobId: string; payload: BuildSurfacePayload }
  | { type: 'checkLoadcase'; jobId: string; payload: CheckLoadcasePayload }
  | { type: 'buildFieldMap'; jobId: string; payload: BuildFieldMapPayload }
  | { type: 'exportExcel'; jobId: string; payload: ExcelExportInput }

export type AnalysisWorkerResultMap = {
  buildSurface: PreviewSurface
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
  | { type: 'error'; jobId: string; requestType: AnalysisWorkerRequest['type']; message: string }

const serializeError = (error: unknown) => (error instanceof Error ? error.message : String(error))

const workerSelf = self as unknown as {
  postMessage: (message: AnalysisWorkerResponse, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<AnalysisWorkerRequest>) => void) | null
}

workerSelf.onmessage = async (event: MessageEvent<AnalysisWorkerRequest>) => {
  const request = event.data
  try {
    if (request.type === 'buildSurface') {
      const { section, rebars, materialStore, fixedP = 0 } = request.payload
      const result = buildPreviewSurface(section, rebars, materialStore, fixedP)
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'checkLoadcase') {
      const { section, rebars, materialStore, loadcase, surface } = request.payload
      const contour = sliceFixedPContour(surface.points, loadcase.P)
      const result = solveInversePreview(section, rebars, materialStore, loadcase, contour)
      workerSelf.postMessage({ type: 'success', jobId: request.jobId, requestType: request.type, result })
      return
    }

    if (request.type === 'buildFieldMap') {
      const { section, rebars, materialStore, state } = request.payload
      const result = buildSectionFieldMap(section, rebars, materialStore, state)
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
      message: serializeError(error)
    })
  }
}

export {}
