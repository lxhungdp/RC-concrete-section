import {
  analysisInputKey,
  buildDesignPreviewSurfaceFromPrepared,
  buildExactDirectionCurveFromPrepared,
  buildSectionFieldMapFromPrepared,
  checkLoadcaseUtilizationFromSurface,
  checkLoadcasesUtilizationFromSurface,
  codeAdjustedDemandOfCheck,
  prepareAnalysis,
  sliceActiveDesignPContour,
  solveInversePreviewFromPrepared,
  type ExactDirectionCurve,
  type InversePreviewResult,
  type LoadcaseQuickCheckResult,
  type PreparedAnalysis,
  type PreviewSurface,
  type SectionFieldMap
} from '@pm/analysis'
import {
  buildEquivalentBlockExactDirectionCurveFromPrepared,
  buildEquivalentBlockFieldMapFromPrepared,
  buildEquivalentBlockPreviewSurfaceFromPrepared,
  prepareBlockAnalysis,
  solveEquivalentBlockDemandFromPrepared,
  type PreparedBlockAnalysis
} from '@pm/analysis-equivalent-block'
import { buildResistanceMaterialSets, createDefaultDesignBasis, type DesignBasis } from '@pm/design'
import {
  buildChartAuditWorkbookBytes,
  buildDemandCheckWorkbookBytes,
  exportEquivalentBlockWorkbook,
  exportMeshAuditDxf,
  exportMeshAuditWorkbook,
  exportSectionWorkbook,
  type ChartAuditWorkbookInput,
  type DemandCheckExcelInput,
  type EquivalentBlockExcelInput,
  type ExcelExportInput
} from '@pm/report'
import type { ReportInput } from '@pm/report/report-model'
import { analysisMeshKernelOptions, isEquivalentBlockAnalysisOptions, type AnalysisOptions } from '@pm/project'
import { packSectionMeshView, type SectionMeshView } from './section-mesh-view'
import type {
  BuildExactDirectionPayload,
  BuildFieldMapPayload,
  BuildSectionMeshPayload,
  BuildSurfacePayload,
  BuildSurfaceWorkerResult,
  CheckLoadcasePayload,
  CheckLoadcasesPayload,
  MeshAuditExportPayload
} from './worker-contract'

let preparedCache: { key: string; value: PreparedAnalysis } | null = null
let blockCache: { key: string; value: PreparedBlockAnalysis } | null = null
let pdfUnicodeFontPromise: Promise<Uint8Array> | null = null

const pdfUnicodeFont = () => {
  pdfUnicodeFontPromise ??= fetch('/fonts/PMReportUnicode-Regular.ttf').then(async (response) => {
    if (!response.ok) throw new Error(`Unicode PDF font could not be loaded (${response.status}).`)
    return new Uint8Array(await response.arrayBuffer())
  })
  return pdfUnicodeFontPromise
}

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

const blockFor = (
  payload: Pick<BuildSurfacePayload, 'calculationProfileId' | 'section' | 'rebars' | 'materialStore' | 'designBasis'>
) => {
  const key = JSON.stringify(payload)
  if (blockCache?.key === key) return blockCache.value
  const value = prepareBlockAnalysis(
    payload.calculationProfileId,
    payload.section,
    payload.rebars,
    payload.materialStore,
    payload.designBasis
  )
  blockCache = { key, value }
  return value
}

/** Main-thread implementations, loaded only after the analysis worker is unavailable. */
export const buildPreviewSurfaceFallback = (payload: BuildSurfacePayload): BuildSurfaceWorkerResult => {
  if (isEquivalentBlockAnalysisOptions(payload.analysisOptions)) {
    const result = buildEquivalentBlockPreviewSurfaceFromPrepared(blockFor(payload), payload.analysisOptions)
    result.calculationProfileId = payload.calculationProfileId
    return { surfaceId: 'main-thread-fallback', surface: result }
  }
  const result = buildDesignPreviewSurfaceFromPrepared(
    preparedFor({ ...payload, analysisOptions: payload.analysisOptions }),
    payload.materialStore,
    payload.designBasis,
    payload.analysisOptions
  )
  result.calculationProfileId = payload.calculationProfileId
  return { surfaceId: 'main-thread-fallback', surface: result }
}

export const buildExactDirectionFallback = (payload: BuildExactDirectionPayload): ExactDirectionCurve => {
  if (isEquivalentBlockAnalysisOptions(payload.analysisOptions)) {
    return buildEquivalentBlockExactDirectionCurveFromPrepared(
      blockFor(payload),
      payload.analysisOptions,
      payload.beta
    )
  }
  return buildExactDirectionCurveFromPrepared(
    preparedFor({ ...payload, analysisOptions: payload.analysisOptions }),
    payload.materialStore,
    payload.designBasis,
    payload.analysisOptions,
    payload.beta
  )
}

export const checkLoadcasesFallback = (payload: CheckLoadcasesPayload): LoadcaseQuickCheckResult[] =>
  checkLoadcasesUtilizationFromSurface(payload.surface, payload.loadcases)

export const checkLoadcaseFallback = (payload: CheckLoadcasePayload): InversePreviewResult => {
  if (isEquivalentBlockAnalysisOptions(payload.surface.analysisOptions)) {
    return solveEquivalentBlockDemandFromPrepared(blockFor(payload), payload.surface.analysisOptions, payload.loadcase)
  }
  const contour = sliceActiveDesignPContour(payload.surface, payload.loadcase.P)
  const designCheck = checkLoadcaseUtilizationFromSurface(payload.surface, payload.loadcase)
  const inverse = solveInversePreviewFromPrepared(
    preparedFor({ ...payload, analysisOptions: payload.surface.analysisOptions }),
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
}

export const buildSectionFieldMapFallback = (payload: BuildFieldMapPayload): SectionFieldMap => {
  if (isEquivalentBlockAnalysisOptions(payload.analysisOptions)) {
    if (!payload.blockState) throw new Error('The axial-cap face has no unique equivalent-block field state.')
    return buildEquivalentBlockFieldMapFromPrepared(blockFor(payload), payload.blockState)
  }
  return buildSectionFieldMapFromPrepared(
    preparedFor({ ...payload, analysisOptions: payload.analysisOptions }),
    payload.state
  )
}

export const buildSectionMeshFallback = (payload: BuildSectionMeshPayload): SectionMeshView =>
  packSectionMeshView(preparedFor(payload).mesh)

export const exportMeshAuditFallback = async (
  type: 'exportMeshExcel' | 'exportMeshDxf',
  payload: MeshAuditExportPayload
): Promise<ArrayBuffer> => {
  const mesh = preparedFor(payload).mesh
  const input = {
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
