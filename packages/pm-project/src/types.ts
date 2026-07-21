import type { GeometryInput } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'

/** Schema id written into every project JSON file. */
export const PM_PROJECT_SCHEMA = 'pm-column-project' as const

/** Current document format version. */
export const PM_PROJECT_VERSION = 2 as const

export type PmProjectSchema = typeof PM_PROJECT_SCHEMA
export type PmProjectVersion = typeof PM_PROJECT_VERSION

/**
 * Demand load combinations for capacity checks.
 * Implicit units: P in N, Mx/My in N·mm. Not stored in JSON.
 */
export type LoadCombination = {
  id: number
  name: string
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
    createdAt: string
    updatedAt: string
  }
  inputs: {
    geometry: GeometryInput
    materials: MaterialStore
    loadings: LoadingsInput
  }
}

export type ProjectInputSnapshot = {
  geometry: GeometryInput
  materials: MaterialStore
  loadings?: LoadingsInput
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
