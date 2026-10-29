import type { CapacityFieldResult, InversePreviewResult, PreviewSurface } from './index'

export type LoadcaseFieldResult =
  | (Extract<CapacityFieldResult, { status: 'available' }> & { basis: 'capacity' })
  | (Omit<Extract<CapacityFieldResult, { status: 'available' }>, 'boundary'> & { basis: 'demand' })
  | {
      status: 'unavailable'
      basis: 'demand' | 'capacity'
      reason: Extract<CapacityFieldResult, { status: 'unavailable' }>['reason']
        | 'check-unavailable' | 'missing-capacity-evidence' | 'unsupported-demand-equilibrium'
      message: string
    }

/**
 * docs/05 §10: the governing check selects the field basis; inverse failure never selects NG.
 * This query copies existing evidence and does not calculate resistance, UR or a new strain state.
 */
export const resolveLoadcaseField = (
  result: InversePreviewResult,
  methodId: PreviewSurface['analysisOptions']['methodId']
): LoadcaseFieldResult => {
  const unavailable = (
    basis: 'demand' | 'capacity',
    reason: Extract<LoadcaseFieldResult, { status: 'unavailable' }>['reason'],
    message: string
  ): LoadcaseFieldResult => ({ status: 'unavailable', basis, reason, message })

  if (!result.designCheck.evaluated || result.loadcaseId !== result.demand.id) {
    return unavailable('demand', 'check-unavailable', 'A current governing check is required before displaying a section field.')
  }
  if (result.designCheck.adequacy === 'inadequate') {
    const field = result.capacityField
    if (!field) return unavailable('capacity', 'missing-capacity-evidence', 'The capacity field is unavailable; governing check and curves remain available.')
    if (field.status === 'unavailable') return { ...field, basis: 'capacity' }
    if (![field.state.e0, field.state.kx, field.state.ky, field.response.P, field.response.Mx,
      field.response.My, field.loadFactor, field.residualNorm].every(Number.isFinite) || field.loadFactor <= 0) {
      return unavailable('capacity', 'invalid-input', 'The capacity field contains invalid numerical evidence.')
    }
    if (!field.admissibility.evaluated || !field.admissibility.ok) {
      return unavailable('capacity', 'inadmissible', 'The capacity state has no qualified material field.')
    }
    if (field.boundary.kind === 'before-axial-cap' &&
      (!Number.isFinite(field.boundary.limit) || field.response.P <= field.boundary.limit)) {
      return unavailable('capacity', 'invalid-input', 'The before-cap field has no qualified axial-cap evidence.')
    }
    return { ...field, basis: 'capacity' }
  }

  // A block inverse is a boundary-ray solution, even when its `ok` flag is true.
  if (methodId === 'equivalent-block-surface-v1') {
    return unavailable('demand', 'unsupported-demand-equilibrium',
      'Field at demand is unavailable for equivalent-block mechanics: this method provides a capacity state only.')
  }
  if (!result.converged) {
    return unavailable('demand', 'non-converged', 'Equilibrium at the entered demand did not converge. A capacity field is not substituted.')
  }
  if (!result.admissibility.evaluated || !result.admissibility.ok) {
    return unavailable('demand', 'inadmissible', 'The entered-demand state has no qualified material field.')
  }
  if (!result.ok) {
    return unavailable('demand', 'invalid-input', 'The entered-demand equilibrium is not qualified for a field.')
  }
  if (![result.state.e0, result.state.kx, result.state.ky, result.response.P, result.response.Mx,
    result.response.My, result.residualNorm].every(Number.isFinite)) {
    return unavailable('demand', 'invalid-input', 'The entered-demand field contains invalid numerical evidence.')
  }
  return {
    status: 'available', basis: 'demand', state: result.state, response: result.response,
    loadFactor: 1, residual: result.residual, residualNorm: result.residualNorm,
    iterations: result.iterations, admissibility: result.admissibility, resistance: null,
    message: 'Converged diagnostic equilibrium at the checked entered demand.'
  }
}
