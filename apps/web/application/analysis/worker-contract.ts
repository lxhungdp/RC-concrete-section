import type {
  AnalysisErrorCode,
  ExactDirectionCurve,
  InversePreviewResult,
  LoadcaseQuickCheckResult,
  PreviewSurface,
  SectionFieldMap
} from '@pm/analysis'
import type { DesignBasis } from '@pm/design'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { EquivalentBlockExcelInput, ExcelExportInput } from '@pm/report'
import type { ReportInput } from '@pm/report/report-model'
import type {
  AnalysisOptions,
  CalculationAnalysisOptions,
  CalculationProfileId,
  LoadCombination
} from '@pm/project'
import type { SectionMeshView } from './section-mesh-view'

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

export type BuildExactDirectionPayload = BuildSurfacePayload & {
  /** Exact strain-gradient direction β in radians. */
  beta: number
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
  | { type: 'buildExactDirection'; jobId: string; payload: BuildExactDirectionPayload }
  | { type: 'buildSectionMesh'; jobId: string; payload: BuildSectionMeshPayload }
  | { type: 'exportMeshExcel'; jobId: string; payload: MeshAuditExportPayload }
  | { type: 'exportMeshDxf'; jobId: string; payload: MeshAuditExportPayload }
  | { type: 'buildFieldMap'; jobId: string; payload: BuildFieldMapPayload }
  | { type: 'exportExcel'; jobId: string; payload: ExcelExportInput }
  | { type: 'exportBlockExcel'; jobId: string; payload: EquivalentBlockExcelInput }
  | { type: 'exportPdfReport'; jobId: string; payload: ReportInput }

export type AnalysisWorkerRequest = AnalysisWorkerJob

export type AnalysisWorkerResultMap = {
  buildSurface: PreviewSurface
  checkLoadcases: LoadcaseQuickCheckResult[]
  checkLoadcase: InversePreviewResult
  buildExactDirection: ExactDirectionCurve
  buildSectionMesh: SectionMeshView
  exportMeshExcel: ArrayBuffer
  exportMeshDxf: ArrayBuffer
  buildFieldMap: SectionFieldMap
  exportExcel: ArrayBuffer
  exportBlockExcel: ArrayBuffer
  exportPdfReport: { bytes: ArrayBuffer; fileName: string }
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
      /** Present when the calculation kernel rejected the input rather than failing unexpectedly. */
      code?: AnalysisErrorCode
    }
