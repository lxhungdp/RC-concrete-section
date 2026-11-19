import type { UnitSelection } from '@pm/units'
import type {
  AnalysisErrorCode,
  InversePreviewResult,
  LoadcaseQuickCheckResult,
  LoadDirectionCurve,
  PointCalculationAudit,
  PreviewSurface,
  PreviewSurfacePoint,
  SectionFieldMap,
  StationDefinition
} from '@pm/analysis'
import type { DesignBasis } from '@pm/design'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type {
  ChartAuditWorkbookInput,
  CalculationTraceAuditWorkbookInput,
  ConcretePointAuditWorkbookInput,
  DemandCheckExcelInput,
  EquivalentBlockExcelInput,
  ExcelExportInput
} from '@pm/report'
import type { ReportInput } from '@pm/report/report-model'
import type {
  AnalysisOptions,
  CalculationAnalysisOptions,
  CalculationProfileId,
  DemandCheckBasis,
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
  checkBasis: DemandCheckBasis
}

/** engineering/05 §3: Demand P–M curve in the plane of the demand moment direction θ (radians). */
export type BuildLoadDirectionPayload = {
  calculationProfileId: CalculationProfileId
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
  surface: PreviewSurface
  theta: number
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

export type BuildPointAuditsPayload = BuildSurfacePayload & {
  stage: 'design' | 'nominal'
  points: Array<{
    key: string
    point: PreviewSurfacePoint
    stationDefinition: StationDefinition | null
  }>
}

export type MeshAuditExportPayload = BuildSectionMeshPayload & {
  presentationUnits?: UnitSelection
  projectName: string
  sectionName: string
}

export type CheckLoadcasesPayload = {
  surface: PreviewSurface
  loadcases: LoadCombination[]
  checkBasis: DemandCheckBasis
}

/** Worker-only handle. Public callers keep using the strongly typed payloads above. */
export type WorkerSurfaceReference = {
  surfaceId?: string
  /** Sent only when the worker does not own this surface (for example after worker restart). */
  surface?: PreviewSurface
}

export type ChartAuditWorkerPayload = Omit<ChartAuditWorkbookInput, 'surface'> & WorkerSurfaceReference

export type ConcretePointAuditWorkerPayload = ConcretePointAuditWorkbookInput

export type CalculationTraceAuditWorkerPayload = CalculationTraceAuditWorkbookInput

export type DemandCheckWorkerPayload = Omit<DemandCheckExcelInput, 'surface'> & WorkerSurfaceReference

export type CheckLoadcasesWorkerPayload = WorkerSurfaceReference & Omit<CheckLoadcasesPayload, 'surface'>

export type CheckLoadcaseWorkerPayload = Omit<CheckLoadcasePayload, 'surface'> & WorkerSurfaceReference & {
  analysisOptions: CalculationAnalysisOptions
}

export type BuildLoadDirectionWorkerPayload = Omit<BuildLoadDirectionPayload, 'surface'> & WorkerSurfaceReference

export type BuildSurfaceWorkerResult = {
  surfaceId: string
  surface: PreviewSurface
}

export type AnalysisWorkerJob =
  | { type: 'buildSurface'; jobId: string; payload: BuildSurfacePayload }
  | { type: 'checkLoadcases'; jobId: string; payload: CheckLoadcasesWorkerPayload }
  | { type: 'checkLoadcase'; jobId: string; payload: CheckLoadcaseWorkerPayload }
  | { type: 'buildLoadDirection'; jobId: string; payload: BuildLoadDirectionWorkerPayload }
  | { type: 'buildSectionMesh'; jobId: string; payload: BuildSectionMeshPayload }
  | { type: 'buildPointAudits'; jobId: string; payload: BuildPointAuditsPayload }
  | { type: 'exportMeshExcel'; jobId: string; payload: MeshAuditExportPayload }
  | { type: 'exportMeshDxf'; jobId: string; payload: MeshAuditExportPayload }
  | { type: 'buildFieldMap'; jobId: string; payload: BuildFieldMapPayload }
  | { type: 'exportExcel'; jobId: string; payload: ExcelExportInput }
  | { type: 'exportBlockExcel'; jobId: string; payload: EquivalentBlockExcelInput }
  | { type: 'exportChartAudit'; jobId: string; payload: ChartAuditWorkerPayload }
  | { type: 'exportConcretePointAudit'; jobId: string; payload: ConcretePointAuditWorkerPayload }
  | { type: 'exportCalculationTraceAudit'; jobId: string; payload: CalculationTraceAuditWorkerPayload }
  | { type: 'exportDemandCheck'; jobId: string; payload: DemandCheckWorkerPayload }
  | { type: 'exportPdfReport'; jobId: string; payload: ReportInput }

export type AnalysisWorkerRequest = AnalysisWorkerJob

export type AnalysisWorkerResultMap = {
  buildSurface: BuildSurfaceWorkerResult
  checkLoadcases: LoadcaseQuickCheckResult[]
  checkLoadcase: InversePreviewResult
  buildLoadDirection: LoadDirectionCurve
  buildSectionMesh: SectionMeshView
  buildPointAudits: Array<{ key: string; audit: PointCalculationAudit }>
  exportMeshExcel: ArrayBuffer
  exportMeshDxf: ArrayBuffer
  buildFieldMap: SectionFieldMap
  exportExcel: ArrayBuffer
  exportBlockExcel: ArrayBuffer
  exportChartAudit: ArrayBuffer
  exportConcretePointAudit: ArrayBuffer
  exportCalculationTraceAudit: ArrayBuffer
  exportDemandCheck: ArrayBuffer
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
