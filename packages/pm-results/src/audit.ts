import type { PreviewSurface, PreviewSurfaceDataset } from './contracts'
import type { StationDefinition, CalculationAuditDepthProfile, CalculationAuditOriginStrainContext, CalculationAuditOriginStrainTrace, CalculationAuditReconciliation, Resultant } from './contracts'
export { strainResistanceFactorAudit } from './resistance-factor-audit'
export { selectGoverningSteelStrainLimit } from './steel-strain-limit'


export const stationDefinitionLabel = (station: StationDefinition): string => {
  if (station.kind === 'pure-compression') return 'Pure compression'
  if (station.kind === 'pure-tension') return 'Pure tension'
  if (station.kind === 'block-depth-ratio') return `c/D = ${station.ratio}`
  if (station.kind === 'block-adaptive') return station.label
  if (station.kind === 'neutral-axis-depth-ratio') return `c/D = ${station.ratio}`
  if (station.kind === 'extreme-tension-strain') return `εt = ${station.strain}`
  if (station.kind === 'bar-tension-strain') return `εₛ = ${station.strain}`
  if (station.kind === 'bar-tension-yield-ratio') return `εₛ/εy = ${station.ratio}`
  if (station.kind === 'neutral-axis-control-gap-ratio') {
    return `cover-gap = ${Number(station.ratio.toPrecision(6))}`
  }
  if (station.kind === 'tension-pole-transition-ratio') {
    return `Pure tens ${Number((station.ratio * 100).toPrecision(6))}%`
  }
  if (station.kind === 'adaptive-state-interpolation') {
    return `adaptive ${Number(station.ratio.toPrecision(6))}`
  }
  if (station.kind === 'neutral-axis-ratio') {
    const ratio = Number(station.cOverC1.toPrecision(6))
    return `c/c₁ = ${ratio}`
  }
  if (station.kind === 'steel-stress-ratio') {
    if (station.ratio === 0) return 'fs/fyd = 0'
    if (Math.abs(station.ratio - 1) < 1e-9) return 'fs/fyd = 1'
    return `fs/fyd = ${Number(station.ratio.toPrecision(6))}`
  }
  if (station.kind === 'steel-strain') {
    if (Math.abs(station.strain) < 1e-12) return 'εₛ = 0'
    return `εₛ = ${Number(station.strain.toPrecision(6))}`
  }
  if (station.kind === 'strength-reduction-transition-ratio') {
    return `φᵣ = ${Number(station.ratio.toPrecision(6))}`
  }
  if (station.kind === 'strength-reduction-post-transition') {
    return `εₛ = ${Number(station.strain.toPrecision(6))}`
  }
  return 'Station'
}


/**
 * Auditable derivation of the strain at the declared analysis origin.
 *
 * The trace follows the criterion that actually generated the state. A declared `c / D` station
 * recovers `c` directly from the exact projected section depth. A controlling-bar station first
 * resolves the bar strain, then uses the exact compression-edge-to-bar depth to derive `kappa`
 * and `c`. Other generated/adaptive states report their already-resolved compatible geometry
 * without pretending that a `c / D` criterion created them. Keeping this derivation in the owning
 * result DTO prevents a presentation adapter from reconstructing strain-plane mechanics.
 */
export const buildCalculationAuditOriginStrainTrace = (
  profile: Pick<CalculationAuditDepthProfile,
    'projectedSectionDepth' | 'neutralAxisDepth' | 'compressionEdgeProjection'>,
  compressionEdgeStrain: number,
  context: CalculationAuditOriginStrainContext = {
    kind: 'resolved-compatible-state',
    criterionLabel: null
  }
): CalculationAuditOriginStrainTrace => {
  if (profile.neutralAxisDepth === null) {
    return {
      kind: 'uniform-strain',
      compressionEdgeStrain,
      calculatedE0: compressionEdgeStrain
    }
  }

  if (context.kind === 'controlling-bar-strain') {
    const curvatureFromCompatibility =
      (compressionEdgeStrain - context.controllingSteelStrain) /
      context.compressionEdgeToBarDepth
    const neutralAxisDepth = compressionEdgeStrain / curvatureFromCompatibility
    const strainLimitApplied = Math.abs(context.controllingSteelStrain - context.requestedSteelStrain) >
      1e-12 * Math.max(1, Math.abs(context.requestedSteelStrain))
    return {
      kind: 'controlling-bar-strain',
      criterionLabel: context.criterionLabel,
      strainRatio: context.ratio,
      controllingRebarId: context.controllingRebarId,
      steelMaterialId: context.steelMaterialId,
      effectiveYieldStress: context.effectiveYieldStress,
      elasticModulus: context.elasticModulus,
      yieldStrain: context.yieldStrain,
      yieldStrainBasis: context.yieldStrainBasis,
      requestedSteelStrain: context.requestedSteelStrain,
      controllingSteelStrain: context.controllingSteelStrain,
      strainLimitApplied,
      compressionEdgeStrain,
      compressionEdgeProjection: profile.compressionEdgeProjection,
      controllingBarProjection: context.controllingBarProjection,
      compressionEdgeToBarDepth: context.compressionEdgeToBarDepth,
      neutralAxisDepth,
      curvatureFromCompatibility,
      calculatedE0: compressionEdgeStrain - curvatureFromCompatibility * profile.compressionEdgeProjection
    }
  }

  const neutralAxisDepthRatio = context.kind === 'depth-ratio'
    ? context.ratio
    : profile.neutralAxisDepth / profile.projectedSectionDepth
  const neutralAxisDepth = context.kind === 'depth-ratio'
    ? context.ratio * profile.projectedSectionDepth
    : profile.neutralAxisDepth
  const curvatureFromDepth = compressionEdgeStrain / neutralAxisDepth
  return {
    kind: 'neutral-axis-depth',
    derivation: context.kind === 'depth-ratio' ? 'declared-depth-ratio' : 'resolved-compatible-state',
    criterionLabel: context.criterionLabel,
    projectedSectionDepth: profile.projectedSectionDepth,
    neutralAxisDepthRatio,
    neutralAxisDepth,
    compressionEdgeStrain,
    compressionEdgeProjection: profile.compressionEdgeProjection,
    curvatureFromDepth,
    calculatedE0: compressionEdgeStrain - curvatureFromDepth * profile.compressionEdgeProjection
  }
}


export const reconcileCalculationAuditResultant = (
  expected: Resultant,
  stored: Resultant,
  forceScale: number,
  lengthScale: number
): CalculationAuditReconciliation => {
  const delta = {
    P: expected.P - stored.P,
    Mx: expected.Mx - stored.Mx,
    My: expected.My - stored.My
  }
  const normalized = [
    Math.abs(delta.P) / Math.max(1, forceScale, Math.abs(stored.P)),
    Math.abs(delta.Mx) / Math.max(1, forceScale * lengthScale, Math.abs(stored.Mx)),
    Math.abs(delta.My) / Math.max(1, forceScale * lengthScale, Math.abs(stored.My))
  ]
  const relativeMaximum = Math.max(...normalized)
  const tolerance = 1e-8
  return { expected, stored, delta, relativeMaximum, tolerance, ok: relativeMaximum <= tolerance }
}


export const projectedBoundaryDepth = (
  points: ReadonlyArray<{ x: number; y: number }>,
  nx: number,
  ny: number
) => {
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (const point of points) {
    const projection = nx * point.x + ny * point.y
    minimum = Math.min(minimum, projection)
    maximum = Math.max(maximum, projection)
  }
  return maximum - minimum
}


/**
 * Outer-boundary vertices of every solid, structurally typed so the stress-strain `SectionGeometry`
 * and the prepared equivalent-block section both feed one implementation.
 */
export const sectionBoundaryPoints = (
  section: { solids: ReadonlyArray<{ outer: ReadonlyArray<{ x: number; y: number }> }> }
): Array<{ x: number; y: number }> =>
  section.solids.flatMap((solid) => solid.outer.map(({ x, y }) => ({ x, y })))



/** Active Design dataset, independent of whether the calculation mode is Fixed or Adaptive. */
export const activeDesignSurfaceDataset = (surface: PreviewSurface): PreviewSurfaceDataset =>
  surface.designSurface ?? surface.designFixed ?? {
    points: surface.points,
    triangles: surface.triangles,
    directions: surface.directions,
    stations: surface.stations
  }


/** Active Nominal/reference dataset, which may have a topology independent from Design. */
export const activeNominalSurfaceDataset = (surface: PreviewSurface): PreviewSurfaceDataset =>
  surface.nominalSurface ?? surface.nominalFixed ?? {
    points: surface.nominalPoints,
    triangles: surface.nominalTriangles,
    directions: surface.directions,
    stations: surface.stations
  }
