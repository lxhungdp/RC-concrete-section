export type AdequacyStatus = 'adequate' | 'inadequate' | 'indeterminate'

export type UtilizationEvidence =
  | 'fixed-grid-screening-margin'
  | 'adaptive-sampling-estimate'
  | 'missing-capacity-intersection'

export type UtilizationInterval = {
  lower: number | null
  upper: number | null
  relativeUncertainty: number | null
  evidence: UtilizationEvidence
}

export type UtilizationClassification = {
  status: AdequacyStatus
  interval: UtilizationInterval
}

/**
 * Regression envelope for the fixed 27 x 36 preview grid against the denser audit grid.
 *
 * This is a screening margin, not a mathematical discretization bound. Any demand whose interval
 * crosses UR=1 is intentionally indeterminate and should be rerun with Adaptive sampling.
 */
export const FIXED_GRID_SCREENING_RELATIVE_UNCERTAINTY = 0.02

export const classifyUtilization = (
  utilization: number | null,
  relativeUncertainty: number | null,
  evidence: UtilizationEvidence
): UtilizationClassification => {
  if (utilization === null || !Number.isFinite(utilization) || utilization < 0) {
    return {
      status: 'indeterminate',
      interval: { lower: null, upper: null, relativeUncertainty: null, evidence: 'missing-capacity-intersection' }
    }
  }
  if (
    relativeUncertainty === null || !Number.isFinite(relativeUncertainty) ||
    relativeUncertainty < 0 || relativeUncertainty >= 1
  ) {
    return {
      status: 'indeterminate',
      interval: { lower: null, upper: null, relativeUncertainty: null, evidence }
    }
  }

  // Capacity uncertainty C(1 +/- u) transforms UR=D/C inversely.
  const lower = utilization / (1 + relativeUncertainty)
  const upper = utilization / (1 - relativeUncertainty)
  return {
    status: upper <= 1 ? 'adequate' : lower > 1 ? 'inadequate' : 'indeterminate',
    interval: { lower, upper, relativeUncertainty, evidence }
  }
}
