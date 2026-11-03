export type SteelStrainLimitEvidence = {
  steelMaterialId: number
  rebarId: number
  side: 'tension' | 'compression'
  /** Signed strain under the compression-positive convention. */
  strain: number
  limit: number
  utilization: number
}

/** Compare each candidate with its own signed limit; input order resolves exact ties. */
export const selectGoverningSteelStrainLimit = (
  current: SteelStrainLimitEvidence | null,
  candidate: Omit<SteelStrainLimitEvidence, 'utilization'>
): SteelStrainLimitEvidence => {
  const utilization = Math.max(0, candidate.side === 'tension' ? -candidate.strain : candidate.strain) / candidate.limit
  return current && current.utilization >= utilization ? current : { ...candidate, utilization }
}
