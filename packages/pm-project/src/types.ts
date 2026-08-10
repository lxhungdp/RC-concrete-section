import type { GeometryInput } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { DesignBasis } from '@pm/design'
import type { CalculationAnalysisOptions } from './analysis-options'
import type { CalculationProfileId } from './calculation-profiles'

/** Schema id written into every project JSON file. */
export const PM_PROJECT_SCHEMA = 'pm-column-project' as const

/** Current document format version. */
export const PM_PROJECT_VERSION = 1 as const

export type PmProjectSchema = typeof PM_PROJECT_SCHEMA
export type PmProjectVersion = typeof PM_PROJECT_VERSION

/**
 * Demand load combinations for capacity checks.
 * Implicit units: P in N, Mx/My in N·mm. Not stored in JSON.
 */
export type LoadCombination = {
  id: number
  name: string
  /** Explicit demand basis. ULS resistance checks reject any other basis. */
  actionBasis: 'factoredULS'
  /** Axial load (compression positive), N */
  P: number
  /** Moment about X, N·mm */
  Mx: number
  /** Moment about Y, N·mm */
  My: number
}

export type LoadingsInput = {
  combinations: LoadCombination[]
}

/**
 * Project-level identity copied into presentation artifacts.
 *
 * This information is deliberately outside `inputs`: changing a client, company or responsible
 * person must not invalidate an engineering result or rebuild a resistance surface.
 */
export type ProjectInformation = {
  client: string
  company: string
  designedBy: string
  checkedBy: string
  address: string
  /** User-selected report date in YYYY-MM-DD form; an empty value is also valid. */
  date: string
}

/**
 * Canonical project document for export / import.
 * Implicit units: length mm, force N, stress MPa (N/mm²), moment N·mm.
 * Entity ids are positive integers matching the UI.
 */
export type PmProjectDocument = {
  schema: PmProjectSchema
  version: PmProjectVersion
  meta: {
    id: number
    name: string
    information: ProjectInformation
    createdAt: string
    updatedAt: string
  }
  inputs: {
    calculationProfileId: CalculationProfileId
    geometry: GeometryInput
    materials: MaterialStore
    loadings: LoadingsInput
    analysis: CalculationAnalysisOptions
    design: DesignBasis
  }
}

export type ProjectInputSnapshot = {
  calculationProfileId?: CalculationProfileId
  geometry: GeometryInput
  materials: MaterialStore
  loadings?: LoadingsInput
  analysis?: CalculationAnalysisOptions
  design?: DesignBasis
  meta?: Partial<PmProjectDocument['meta']>
}

export type ParseProjectSuccess = {
  ok: true
  document: PmProjectDocument
  warnings: string[]
}

export type ParseProjectFailure = {
  ok: false
  error: string
}

export type ParseProjectResult = ParseProjectSuccess | ParseProjectFailure
