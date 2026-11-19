import type { CapacityFieldResult, InversePreviewResult, PreviewSurface } from './index'

export type LoadcaseFieldResult =
  | (Extract<CapacityFieldResult, { status: 'available' }> & { basis: 'capacity' })
  | {
      status: 'unavailable'
      basis: 'capacity'
      reason: Extract<CapacityFieldResult, { status: 'unavailable' }>['reason']
        | 'check-unavailable' | 'missing-capacity-evidence'
      message: string
    }

/**
 * docs/05 section 10, engineering/05 §3 angle convention: the displayed field is the strength-point
 * (capacity) state of the selected check for every classification and both mechanics. The
 * equilibrium at the entered demand is a solver diagnostic and is never displayed as a field.
 * This query copies existing evidence and does not calculate resistance, UR or a new strain state.
 */
export const resolveLoadcaseField = (
  result: InversePreviewResult,
  // Kept for call-site compatibility; the basis no longer depends on the mechanics.
  _methodId?: PreviewSurface['analysisOptions']['methodId']
): LoadcaseFieldResult => {
  const unavailable = (
    reason: Extract<LoadcaseFieldResult, { status: 'unavailable' }>['reason'],
    message: string
  ): LoadcaseFieldResult => ({ status: 'unavailable', basis: 'capacity', reason, message })

  if (!result.designCheck.evaluated || result.loadcaseId !== result.demand.id) {
    return unavailable('check-unavailable', 'A current governing check is required before displaying a section field.')
  }
  const field = result.capacityField
  if (!field) return unavailable('missing-capacity-evidence', 'The capacity field is unavailable; governing check and curves remain available.')
  if (field.status === 'unavailable') return { ...field, basis: 'capacity' }
  if (![field.state.e0, field.state.kx, field.state.ky, field.response.P, field.response.Mx,
    field.response.My, field.loadFactor, field.residualNorm].every(Number.isFinite) || field.loadFactor <= 0) {
    return unavailable('invalid-input', 'The capacity field contains invalid numerical evidence.')
  }
  if (!field.admissibility.evaluated || !field.admissibility.ok) {
    return unavailable('inadmissible', 'The capacity state has no qualified material field.')
  }
  if (field.boundary.kind === 'before-axial-cap' &&
    (!Number.isFinite(field.boundary.limit) || field.response.P <= field.boundary.limit)) {
    return unavailable('invalid-input', 'The before-cap field has no qualified axial-cap evidence.')
  }
  return { ...field, basis: 'capacity' }
}
