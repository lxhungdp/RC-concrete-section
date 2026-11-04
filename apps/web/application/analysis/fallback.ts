import { createAnalysisExecution } from './execution'

import {
  buildChartAuditWorkbookBytes,
  buildCalculationTraceAuditWorkbookBytes,
  buildConcretePointAuditWorkbookBytes,
  buildDemandCheckWorkbookBytes,
  exportEquivalentBlockWorkbook,
  exportMeshAuditDxf,
  exportMeshAuditWorkbook,
  exportSectionWorkbook,
  type ChartAuditWorkbookInput,
  type CalculationTraceAuditWorkbookInput,
  type ConcretePointAuditWorkbookInput,
  type DemandCheckExcelInput,
  type EquivalentBlockExcelInput,
  type ExcelExportInput
} from '@pm/report'
import type { ReportInput } from '@pm/report/report-model'

import { packSectionMeshView, type SectionMeshView } from './section-mesh-view'
import type {
  BuildSectionMeshPayload,
  BuildSurfacePayload,
  BuildSurfaceWorkerResult,
  MeshAuditExportPayload
} from './worker-contract'

const execution = createAnalysisExecution()

let pdfUnicodeFontPromise: Promise<Uint8Array> | null = null

const pdfUnicodeFont = () => {
  pdfUnicodeFontPromise ??= fetch('/fonts/PMReportUnicode-Regular.ttf').then(async (response) => {
    if (!response.ok) throw new Error(`Unicode PDF font could not be loaded (${response.status}).`)
    return new Uint8Array(await response.arrayBuffer())
  })
  return pdfUnicodeFontPromise
}

export const buildPreviewSurfaceFallback = (payload: BuildSurfacePayload): BuildSurfaceWorkerResult => ({ surfaceId: 'main-thread-fallback', surface: execution.buildSurface(payload) })

export const buildExactDirectionFallback = execution.buildExactDirection

export const checkLoadcasesFallback = execution.checkLoadcases

export const checkLoadcaseFallback = execution.checkLoadcase

export const buildSectionFieldMapFallback = execution.buildFieldMap

export const buildSectionMeshFallback = (payload: BuildSectionMeshPayload): SectionMeshView => packSectionMeshView(execution.buildSectionMesh(payload))

export const buildPointAuditsFallback = execution.buildPointAudits

export const exportMeshAuditFallback = async (
  type: 'exportMeshExcel' | 'exportMeshDxf',
  payload: MeshAuditExportPayload
): Promise<ArrayBuffer> => {
  const mesh = execution.buildSectionMesh(payload)
  const input = {
    presentationUnits: payload.presentationUnits,
    projectName: payload.projectName,
    sectionName: payload.sectionName,
    section: payload.section,
    rebars: payload.rebars,
    mesh
  }
  const blob = type === 'exportMeshExcel' ? await exportMeshAuditWorkbook(input) : exportMeshAuditDxf(input)
  return blob.arrayBuffer()
}

export const exportSectionWorkbookFallback = async (payload: ExcelExportInput): Promise<ArrayBuffer> =>
  (await exportSectionWorkbook(payload)).arrayBuffer()

export const exportEquivalentBlockWorkbookFallback = async (
  payload: EquivalentBlockExcelInput
): Promise<ArrayBuffer> => (await exportEquivalentBlockWorkbook(payload)).arrayBuffer()

const exactArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

export const exportChartAuditWorkbookFallback = async (
  payload: ChartAuditWorkbookInput
): Promise<ArrayBuffer> => exactArrayBuffer(await buildChartAuditWorkbookBytes(payload))

export const exportConcretePointAuditWorkbookFallback = async (
  payload: ConcretePointAuditWorkbookInput
): Promise<ArrayBuffer> => exactArrayBuffer(await buildConcretePointAuditWorkbookBytes(payload))

export const exportCalculationTraceAuditWorkbookFallback = async (
  payload: CalculationTraceAuditWorkbookInput
): Promise<ArrayBuffer> => exactArrayBuffer(await buildCalculationTraceAuditWorkbookBytes(payload))

export const exportDemandCheckWorkbookFallback = async (
  payload: DemandCheckExcelInput
): Promise<ArrayBuffer> => exactArrayBuffer(await buildDemandCheckWorkbookBytes(payload))

export const exportColumnReportPdfFallback = async (
  payload: ReportInput
): Promise<{ bytes: ArrayBuffer; fileName: string }> => {
  const { buildColumnReportPdf } = await import('@pm/report/pdf')
  const report = buildColumnReportPdf(payload, { unicodeFontBytes: await pdfUnicodeFont() })
  return { bytes: exactArrayBuffer(report.bytes), fileName: report.fileName }
}
