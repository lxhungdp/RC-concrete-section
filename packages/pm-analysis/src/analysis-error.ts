/**
 * Typed fatal input errors (`docs/08` §5 fail-closed). The kernel must never substitute a plausible
 * value for a missing definition: a silent fallback produces a number that looks like a capacity but
 * is not one.
 */
export type AnalysisErrorCode =
  | 'MISSING_STEEL_MATERIAL'
  | 'UNSUPPORTED_CONCRETE_MODEL'
  | 'EMPTY_CONCRETE_SECTION'
  | 'MESH_RESOURCE_LIMIT'
  | 'INVALID_ANALYSIS_OPTIONS'
  | 'MESH_NOT_VERIFIED'
  | 'INVALID_GEOMETRY'
  | 'INVALID_MATERIAL'
  | 'INVALID_REBAR'
  | 'AUDIT_RECONCILIATION_FAILED'
  | 'INVALID_RESISTANCE_SURFACE'

export class AnalysisInputError extends Error {
  readonly code: AnalysisErrorCode
  readonly detail: Readonly<Record<string, unknown>>

  constructor(code: AnalysisErrorCode, message: string, detail: Readonly<Record<string, unknown>> = {}) {
    super(message)
    this.name = 'AnalysisInputError'
    this.code = code
    this.detail = detail
  }
}

