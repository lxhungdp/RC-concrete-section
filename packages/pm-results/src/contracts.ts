import type { DesignBasis, MinimumEccentricityCandidate, ResistanceClassification } from '@pm/design'
import type { ConcreteMeshReport, GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialLawAudit, MaterialStore, SteelMaterial, StrainDomainId } from '@pm/materials'
import type { AnalysisOptions, CalculationAnalysisOptions, AnalysisStationCriterion, DemandCheckBasis, LoadCombination } from '@pm/project'
import type { AdequacyStatus, UtilizationInterval } from './index'
import type { CalculationAuditResistanceFactor } from './resistance-factor-audit'
import type { SteelStrainLimitEvidence } from './steel-strain-limit'
export type { CalculationAuditResistanceFactor, StrainResistanceFactorAudit, AxialBendingResistanceFactorAudit } from './resistance-factor-audit'
export type { SteelStrainLimitEvidence } from './steel-strain-limit'


export type Resultant = {
  P: number
  Mx: number
  My: number
}


/**
 * Strain plane `eps(x,y) = e0 + kx*y + ky*x`.
 *
 * `x, y` are measured from the analysis reference origin, i.e. the exact centroid of the net
 * concrete region (`docs/02` §1 step 9). `e0` is therefore the strain at that centroidal axis and
 * `Mx, My` are moments about this declared origin.
 */
export type StrainState = {
  e0: number
  kx: number
  ky: number
}


/** Analysis reference origin (net-concrete centroid) that all preview results are reported about. */
export type AnalysisOrigin = { x: number; y: number }


/**
 * Contribution ledger for one strain state.
 *
 * `docs/11` §3.3 requires the embedded-bar contribution `steel - displaced concrete` to keep the
 * full-steel and displaced-concrete terms separately, so a contribution-factor transform can be
 * applied (or rejected) per independently factorable group.
 */
export type ResultantLedger = {
  /** Concrete integrated over the concrete fibers only. */
  concrete: Resultant
  /** fs·As at every bar, before the displaced-concrete deduction. */
  steelGross: Resultant
  /** −fc·As at every bar (concrete replaced by the bar). */
  displacedConcrete: Resultant
  /** Net steel contribution: steelGross + displacedConcrete. */
  steel: Resultant
  /** concrete + steel. */
  total: Resultant
}


export type CalculationAuditStage = 'design' | 'nominal'


export type CalculationAuditTerm = {
  x: number
  y: number
  area: number
  strain: number
  stress: number
  force: number
  Mx: number
  My: number
}


export type CalculationAuditConcreteGroup = {
  id: string
  label: string
  count: number
  area: number
  strainMinimum: number
  strainMaximum: number
  stressMinimum: number
  stressMaximum: number
  resultant: Resultant
  /** Largest absolute force term in this exact group; a readable term, not a statistical sample. */
  representative: CalculationAuditTerm
}


export type CalculationAuditRebar = CalculationAuditTerm & {
  id: number
  diameter: number
  areaSource?: string
  storedArea?: boolean
  steelMaterialId: number
  steelStress: number
  displacedConcreteStress: number
  netStress: number
  steelGross: Resultant
  displacedConcrete: Resultant
  net: Resultant
}


export type CalculationAuditDepthProfile = {
  normalX: number
  normalY: number
  tensionEdgeProjection: number
  compressionEdgeProjection: number
  projectedSectionDepth: number
  neutralAxisProjection: number | null
  neutralAxisDepth: number | null
  neutralAxisInsideSection: boolean | null
  originStrainTrace: CalculationAuditOriginStrainTrace
  samples: Array<{ depth: number; strain: number; stress: number }>
}


export type CalculationAuditOriginStrainTrace =
  | {
      kind: 'uniform-strain'
      compressionEdgeStrain: number
      calculatedE0: number
    }
  | {
      kind: 'neutral-axis-depth'
      derivation: 'declared-depth-ratio' | 'resolved-compatible-state'
      criterionLabel: string | null
      projectedSectionDepth: number
      neutralAxisDepthRatio: number
      neutralAxisDepth: number
      compressionEdgeStrain: number
      compressionEdgeProjection: number
      curvatureFromDepth: number
      calculatedE0: number
    }
  | {
      kind: 'controlling-bar-strain'
      criterionLabel: string
      strainRatio: number
      controllingRebarId: number
      steelMaterialId: number
      effectiveYieldStress: number
      elasticModulus: number
      yieldStrain: number
      yieldStrainBasis: 'effective-yield-stress-over-elastic-modulus' | 'declared-material-limit'
      requestedSteelStrain: number
      controllingSteelStrain: number
      strainLimitApplied: boolean
      compressionEdgeStrain: number
      compressionEdgeProjection: number
      controllingBarProjection: number
      compressionEdgeToBarDepth: number
      neutralAxisDepth: number
      curvatureFromCompatibility: number
      calculatedE0: number
    }


export type CalculationAuditOriginStrainContext =
  | {
      kind: 'depth-ratio'
      criterionLabel: string
      ratio: number
    }
  | {
      kind: 'controlling-bar-strain'
      criterionLabel: string
      ratio: number
      controllingRebarId: number
      steelMaterialId: number
      effectiveYieldStress: number
      elasticModulus: number
      yieldStrain: number
      yieldStrainBasis: 'effective-yield-stress-over-elastic-modulus' | 'declared-material-limit'
      requestedSteelStrain: number
      controllingSteelStrain: number
      controllingBarProjection: number
      compressionEdgeToBarDepth: number
    }
  | {
      kind: 'resolved-compatible-state'
      criterionLabel: string | null
    }


export type CalculationAuditReconciliation = {
  expected: Resultant
  stored: Resultant
  delta: Resultant
  relativeMaximum: number
  tolerance: number
  ok: boolean
}


export type StressStrainPointCalculationAudit = {
  kind: 'stress-strain'
  pointId: string
  stage: CalculationAuditStage
  origin: AnalysisOrigin
  state: StrainState
  depthProfile: CalculationAuditDepthProfile
  concreteLaw: MaterialLawAudit
  steelLaws: Array<{ materialId: number; name: string; law: MaterialLawAudit }>
  mesh: ConcreteMeshReport
  concreteSummary: {
    pointCount: number
    area: number
    strainMinimum: number
    strainMaximum: number
    stressMinimum: number
    stressMaximum: number
    resultant: Resultant
  }
  concreteGroups: CalculationAuditConcreteGroup[]
  rebars: CalculationAuditRebar[]
  /** Result of the local stress integration before a global resultant factor, if any. */
  mechanicalLedger: ResultantLedger
  /** Reference-material result at the same compatible state, before any Design route. */
  nominalReferenceLedger: ResultantLedger
  displayedLedger: ResultantLedger
  resistanceFactor: number | null
  resistanceFactorCalculation: CalculationAuditResistanceFactor | null
  nominalReferenceReconciliation: CalculationAuditReconciliation
  reconciliation: CalculationAuditReconciliation
}


export type EquivalentBlockPointCalculationAudit = {
  kind: 'equivalent-block'
  pointId: string
  stage: CalculationAuditStage
  origin: AnalysisOrigin
  state: StrainState
  depthProfile: CalculationAuditDepthProfile
  provenance: {
    document: string
    concrete: string
    resistance: string
    methodId: string
    implementationVersion: string
    verificationStatus: string
  }
  block: {
    neutralAxisAngle: number
    neutralAxisDepth: number
    projectedSectionDepth: number
    extremeCompressionStrain: number
    beta1: number
    blockDepth: number
    compressionStress: number
    compressionEdgeProjection: number
    neutralAxisProjection: number
    blockBoundaryProjection: number
    area: number
    centroidX: number
    centroidY: number
    geometry: Array<{
      outer: Array<{ x: number; y: number }>
      holes: Array<Array<{ x: number; y: number }>>
    }>
    resultant: Resultant
  }
  steelLaws: Array<{ materialId: number; name: string; law: MaterialLawAudit }>
  rebars: CalculationAuditRebar[]
  mechanicalLedger: ResultantLedger
  nominalReferenceLedger: ResultantLedger
  displayedLedger: ResultantLedger
  resistanceFactor: number | null
  resistanceFactorCalculation: CalculationAuditResistanceFactor | null
  nominalReferenceReconciliation: CalculationAuditReconciliation
  reconciliation: CalculationAuditReconciliation
}


export type AxialCapTracePoint = Resultant & {
  pointId: string
  stationId: SurfaceStationId | null
}


export type AxialCapProjectionTrace = {
  maximumAxialResistance: number
  capRatio: number | null
  cap: number
  /** Physical criterion point before the maximum-axial domain operation, when one exists. */
  preCapPoint?: PreviewSurfacePoint
  source:
    | {
        kind: 'source-vertex'
        point: AxialCapTracePoint
        crossing: Resultant
      }
    | {
        kind: 'edge-interpolation'
        compressionSide: AxialCapTracePoint
        admissibleSide: AxialCapTracePoint
        interpolationRatio: number
        crossing: Resultant
      }
  projection:
    | { kind: 'identity'; factor: 1 }
    | {
        kind: 'radial'
        factor: number
        sourceStationCoordinate: number
        crossingStationCoordinate: number
      }
}


export type AxialCapPointCalculationAudit = {
  kind: 'axial-cap'
  pointId: string
  stage: CalculationAuditStage
  trace: AxialCapProjectionTrace
  preCap?: {
    point: PreviewSurfacePoint
    audit: StressStrainPointCalculationAudit | EquivalentBlockPointCalculationAudit
    comparison: {
      calculatedAxialResistance: number
      maximumAxialResistance: number
      selectedAxialResistance: number
      capGoverns: boolean
    }
  }
  displayedLedger: ResultantLedger
  reconciliation: CalculationAuditReconciliation
}


export type UnavailablePointCalculationAudit = {
  kind: 'unavailable'
  pointId: string
  stage: CalculationAuditStage
  reason: 'synthetic-axial-cap' | 'missing-physical-state'
  message: string
}


export type PointCalculationAudit =
  | StressStrainPointCalculationAudit
  | EquivalentBlockPointCalculationAudit
  | AxialCapPointCalculationAudit
  | UnavailablePointCalculationAudit


export type PreviewSurfacePointRole =
  | 'physical-state'
  | 'pure-tension'
  | 'pure-compression'
  | 'axial-cap'


export type PreviewSurfacePoint = Resultant & {
  id: string
  beta: number
  /** Zero-based display order within one physical direction row; −1 for a synthetic face point. */
  station: number
  /** Monotone domain coordinate; comparable across independently-adaptive meridians. */
  stationCoordinate?: number
  /** Stable physical station identity; null for a synthetic face that is not a strain station. */
  stationId: SurfaceStationId | null
  /** Structural/topological meaning; never infer this from numeric station order. */
  surfaceRole: PreviewSurfacePointRole
  /**
   * False for a synthetic face vertex that belongs to the triangle mesh but to no sampled
   * meridian. Undefined preserves compatibility with structured stress-strain surfaces.
   */
  onSampledDirection?: boolean
  state: StrainState
  ledger: ResultantLedger
  resistance?: DesignResistanceTrace
  /** Geometric provenance for a synthetic maximum-axial-resistance face point. */
  axialCapTrace?: AxialCapProjectionTrace
  /** Present only for a physical block state; an axial-cap face has no unique strain state. */
  equivalentBlock?: EquivalentBlockStateTrace
}


export type EquivalentBlockStateTrace = {
  neutralAxisAngle: number
  neutralAxisDepth: number
  blockDepth: number
  beta1: number
  projectedSectionDepth: number
  compressionStress: number
  concreteBlockArea?: number
  concreteForce?: number
  controllingTensileStrain?: number
  controllingBarId?: string
  /** Component reconstruction roundoff; not an inverse-equilibrium residual. */
  componentForceResidual?: number
  componentMomentXResidual?: number
  componentMomentYResidual?: number
}


export type SurfaceIndexTriangle = { a: number; b: number; c: number }


export type DesignResistanceTrace = {
  nominalReference: Resultant
  format: DesignBasis['format']
  factor: number | null
  classification: ResistanceClassification | 'design-material'
  controllingTensileStrain: number | null
  yieldStrain: number | null
  axialCapApplied: boolean
  stages: string[]
}


export type SurfaceStationId =
  | 'pure-compression'
  | `station-${number}`
  | `adaptive-station-${string}`
  | 'pure-tension'


export type SurfaceStation = {
  id: SurfaceStationId
  label: string
  definition: StationDefinition
  /** Canonical/project station versus a generated midpoint retained only in this result. */
  fixed: boolean
}


/**
 * How much the surface still depends on how coarsely the strain-plane directions were sampled
 * (`docs/06` §5). Measured, not assumed: the engine evaluates the true state halfway between two
 * sampled directions and compares it with the chord the surface actually uses there.
 *
 * This is a sampled estimate over `probedStations`, not a bound over the whole surface
 * (`docs/06` §11 — no universal error claim from one benchmark).
 */
export type SurfaceDirectionError = {
  /** Strain-plane directions in the finished surface. */
  directions: number
  /** Station indices used as probes. */
  probedStations: number[]
  probedStationIds: SurfaceStationId[]
  /** Worst chord error in `P`, relative to the surface `P` span. */
  maxRelativeP: number
  /** Worst chord error in the moment vector, relative to the surface moment span. */
  maxRelativeMoment: number
  /** Worst component-ledger error; equals the total error when component checking is not required. */
  maxRelativeComponent: number
  /** Direction (rad) of the worst moment error. */
  worstBeta: number
  /** Bisection passes actually performed; 0 when refinement is off. */
  refinementPasses: number
  /** True when the estimate is at or below the requested tolerance. */
  withinTolerance: boolean
  tolerance: number
}


/** Measured chord error along the compression-to-tension station coordinate. */
export type SurfaceStationError = {
  reason?: 'state-stalled'
  stations: number
  fixedStations: number
  minStations?: number
  maxStations?: number
  averageStations?: number
  totalStates?: number
  /** Constitutive integrations, including rejected adaptive probes. */
  evaluations?: number
  maxRelative: number
  refinementPasses: number
  withinTolerance: boolean
  tolerance: number
}


export type PreviewSurfaceDataset = {
  points: PreviewSurfacePoint[]
  triangles?: SurfaceIndexTriangle[]
  directions: number[]
  stations: SurfaceStation[]
}


export type ExactDirectionCurve = {
  /** Exact strain-gradient direction requested by the user or recovered from equilibrium. */
  beta: number
  /** Active Design meridian for the selected Fixed or Adaptive station policy. */
  designCurve?: PreviewSurfacePoint[]
  /** Active nominal/reference meridian; its independently adaptive schedule may differ. */
  nominalCurve?: PreviewSurfacePoint[]
  /** Diagnostic Design meridian before the axial cap; never used by governing checks. */
  beforeAxialCap?: PreviewSurfacePoint[]
  /** @deprecated Compatibility alias for `designCurve`. */
  designAdaptive: PreviewSurfacePoint[]
  /** @deprecated Compatibility alias for `designCurve`. */
  designFixed: PreviewSurfacePoint[]
  /** @deprecated Compatibility alias for `nominalCurve`. */
  nominalFixed: PreviewSurfacePoint[]
  /** Station descriptors for the design meridian. */
  stations: SurfaceStation[]
  /** Nominal descriptors may differ when that mechanics samples Nominal independently. */
  nominalStations?: SurfaceStation[]
  stationError: SurfaceStationError
}


export type PreviewSurface = {
  calculationProfileId?: import('@pm/project').CalculationProfileId
  mechanics?: 'stress-strain-integration' | 'equivalent-rectangular-block'
  /** Governing adaptive design-resistance vertices used by all ULS checks, not by fixed-grid plots. */
  points: PreviewSurfacePoint[]
  /** Reference/nominal vertices at the exact same stored strain states. */
  nominalPoints: PreviewSurfacePoint[]
  /** Explicit connectivity is authoritative for independently triangulated/capped surfaces. */
  triangles?: SurfaceIndexTriangle[]
  nominalTriangles?: SurfaceIndexTriangle[]
  /** Fixed 27 × 36 visual/diagnostic grid; shared with the production Design surface. */
  /** Active Design dataset for the selected Fixed or Adaptive mode. */
  designSurface?: PreviewSurfaceDataset
  /** Original reduced Design geometry/topology before Pmax; diagnostic only. */
  beforeAxialCap?: PreviewSurfaceDataset
  /** Active Nominal/reference dataset; its adaptive topology may differ from Design. */
  nominalSurface?: PreviewSurfaceDataset
  /** @deprecated Compatibility alias for `designSurface`. */
  designFixed?: PreviewSurfaceDataset
  /** Nominal values evaluated at the same fixed 27 × 36 states. */
  /** @deprecated Compatibility alias for `nominalSurface`. */
  nominalFixed?: PreviewSurfaceDataset
  /** Discrete code values for reporting only; never triangulated as equilibrium states. */
  codeReferencePoints?: Array<Resultant & {
    id: string
    label: string
    kind: 'code-endpoint'
  }>
  /** Outer-boundary vertices used by code demand rules such as KDS Appendix e_min. */
  sectionBoundaryPoints?: Array<{ x: number; y: number }>
  bounds: {
    P: [number, number]
    Mx: [number, number]
    My: [number, number]
  }
  mesh: ConcreteMeshReport
  /** Canonical schedule and direction grid actually used by this result. */
  stations: SurfaceStation[]
  directions: number[]
  analysisOptions: CalculationAnalysisOptions
  directionError: SurfaceDirectionError
  stationError: SurfaceStationError
  /** Which ultimate strain domain produced these states — never inferred from the material label. */
  strainDomain: StrainDomainId
  warnings: string[]
  designBasis: DesignBasis
}


export type PreviewContourPoint = {
  /** Geometric path identity. Present on Fixed-P cuts, preserved by presentation adapters. */
  pathId?: number
  pathClosed?: boolean
  beta: number
  P: number
  Mx: number
  My: number
  station?: number
  /**
   * True when the point lies on one sampled strain-plane meridian: either a surface vertex or the
   * intersection of `P = fixedP` with an edge whose two endpoints share the same beta. False or
   * absent identifies an intermediate intersection on a cross-beta/diagonal triangle edge.
   */
  onSampledDirection?: boolean
}


/**
 * A point used to present one direct sampled meridian. `surface-vertex` retains an authoritative
 * resistance-surface vertex. `axial-center` is a section-only vertex required when one half of a
 * vertical plane cuts a triangulated axial-cap face from M=0 to its boundary crossing.
 */
export type DirectMeridianSectionPoint = PreviewSurfacePoint & {
  sectionPointRole: 'surface-vertex' | 'axial-center'
}


export type DirectMeridianSection = {
  primary: DirectMeridianSectionPoint[]
  opposite: DirectMeridianSectionPoint[]
  displayPaths: DirectMeridianSectionPoint[][]
  closed: boolean
}


export type PreviewMomentPlanePoint = PreviewContourPoint & {
  /** Moment coordinate on the checked load direction. */
  M: number
}


/**
 * One connected component of a vertical moment-plane/surface intersection.
 *
 * A closed path repeats its first point as its last point. `closed` is derived from the triangle
 * adjacency graph; callers must never close an open path merely for presentation.
 */
export type PreviewMomentPlanePath = {
  points: PreviewMomentPlanePoint[]
  closed: boolean
}


export type AdmissibilityViolation =
  | { code: 'CONCRETE_STRAIN_EXCEEDS_ULTIMATE'; value: number; limit: number }
  | { code: 'STEEL_STRAIN_EXCEEDS_ULTIMATE'; rebarId: number; value: number; limit: number }


/**
 * Whether a strain plane lies inside the material domain — `docs/04` §6 requires "all material
 * strains admissible" for acceptance, and defines `MATERIAL_DOMAIN_EXCEEDED` as a failure. A plane
 * that balances the demand outside this domain is not an equilibrium state the section can reach.
 */
export type StrainAdmissibility = {
  /** False for a code-envelope face that has no unique material strain state. */
  evaluated: boolean
  ok: boolean
  /** Peak compressive strain anywhere in the concrete region (compression positive). */
  maxConcreteCompression: number
  concreteLimit: number
  /** Largest tensile strain magnitude at any bar; 0 when every bar is in compression. */
  maxSteelTension: number
  /** Smallest declared tensile limit, an aggregate that must not be paired with maxSteelTension. */
  steelTensionLimit: number | null
  /** The governing bar compared with its own material limit, including mixed-grade sections. */
  governingSteelLimit?: SteelStrainLimitEvidence | null
  violations: AdmissibilityViolation[]
}


/** Physical capacity evidence is separate from full-demand inverse equilibrium and governing UR. */
export type CapacityFieldResult =
  | {
      status: 'available'
      boundary: { kind: 'design' } | { kind: 'before-axial-cap'; limit: number }
      state: StrainState
      response: Resultant
      loadFactor: number
      residual: Resultant
      residualNorm: number
      iterations: number
      admissibility: StrainAdmissibility
      resistance: DesignResistanceTrace | null
      equivalentBlock?: EquivalentBlockStateTrace | null
      message: string
    }
  | {
      status: 'unavailable'
      reason: 'zero-demand' | 'no-crossing' | 'axial-cap' | 'non-converged' | 'inadmissible' | 'invalid-input' | 'evaluation-error'
      iterations: number
      message: string
    }


export type InversePreviewResult = {
  /** Converged **and** admissible. Only this may be presented as an equilibrium state. */
  ok: boolean
  /** Residual test alone; true even when the plane leaves the material domain. */
  converged: boolean
  admissibility: StrainAdmissibility
  loadcaseId: number
  demand: LoadCombination
  /** Demand after a code-prescribed minimum-eccentricity rule, when applicable. */
  codeAdjustedDemand?: LoadCombination
  minimumEccentricityMm?: number
  state: StrainState
  response: Resultant
  residual: Resultant
  residualNorm: number
  iterations: number
  utilization: number | null
  proportionalUtilization?: number | null
  /** Exact inverse/capacity-ray ratio used only to reconcile that diagnostic response. */
  inverseProportionalUtilization?: number | null
  fixedPUtilization?: number | null
  /** Governing Design-surface decision composed after the inverse diagnostic has been solved. */
  designCheck:
    | { evaluated: false }
    | {
        evaluated: true
        definition: DemandCheckBasis
        adequacy: AdequacyStatus
        utilizationInterval: UtilizationInterval
      }
  designCapacityPoint?: Resultant | null
  resistance?: DesignResistanceTrace | null
  equivalentBlock?: EquivalentBlockStateTrace | null
  contourPoint: PreviewContourPoint | null
  message: string
  /** Lazily resolved physical boundary state for Field at capacity; never supplies governing UR. */
  capacityField?: CapacityFieldResult
}


export type LoadcaseQuickCheckResult = {
  loadcaseId: number
  demand: LoadCombination
  /** Demand after a code-prescribed minimum-eccentricity rule, when applicable. */
  codeAdjustedDemand?: LoadCombination
  minimumEccentricityMm?: number
  utilizationDefinition: DemandCheckBasis
  /** Set only under the constant-axial basis: why that query did or did not publish a ratio. */
  constantAxialStatus?: ConstantAxialIntersection['status']
  /** Boundary moment Mb on the constant-axial ray; null when that query publishes no ratio. */
  constantAxialCapacityMoment?: number | null
  /**
   * Finite multiplier at the selected Design-surface crossing; null for zero demand or no crossing.
   * It scales the whole demand under proportional3D and only its moments under constantAxial.
   */
  capacityMultiplier: number | null
  /** Checked demand moment direction in action space; null when the moment vector is zero. */
  demandMomentDirection: number | null
  utilization: number | null
  proportionalUtilization: number | null
  fixedPUtilization: number | null
  fixedPDemandMoment: number
  fixedPCapacityMoment: number | null
  adequate: boolean | null
  /** Three-state screening verdict; fixed-grid cases near UR=1 are deliberately indeterminate. */
  adequacy: AdequacyStatus
  /** Utilization interval implied by the active surface's sampling evidence. */
  utilizationInterval: UtilizationInterval
  capacityPoint: Resultant | null
  resistance: DesignResistanceTrace | null
  contourPoint: PreviewMomentPlanePoint | null
  message: string
}

export type StationDefinition =
  | { kind: 'pure-compression' }
  | { kind: 'neutral-axis-ratio'; cOverC1: number }
  | { kind: 'neutral-axis-depth-ratio'; ratio: number }
  | { kind: 'steel-strain'; strain: number }
  | { kind: 'steel-stress-ratio'; ratio: number }
  | { kind: 'bar-tension-yield-ratio'; ratio: number }
  | { kind: 'strength-reduction-transition-ratio'; ratio: number }
  /** @deprecated Prefer `steel-strain`; retained for in-flight definitions only. */
  | { kind: 'strength-reduction-post-transition'; strain: number }
  | { kind: 'extreme-tension-strain'; strain: number }
  | { kind: 'bar-tension-strain'; strain: number }
  | { kind: 'block-depth-ratio'; ratio: number }
  | { kind: 'block-adaptive'; label: string }
  /** Fraction of the concrete-edge-to-controlling-bar cover gap traversed by the neutral axis. */
  | { kind: 'neutral-axis-control-gap-ratio'; ratio: number }
  /** Physical three-stage continuation from the last finite-c state to the exact tension pole. */
  | { kind: 'tension-pole-transition-ratio'; from: StationDefinition; ratio: number }
  /** Internal deterministic fallback for a midpoint between two otherwise incompatible states. */
  | {
      kind: 'adaptive-state-interpolation'
      left: StationDefinition
      right: StationDefinition
      ratio: number
    }
  | { kind: 'pure-tension' }


export type ResultantTangent = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
]


/**
 * Strain limits of the bar that controls one direction, taken from its compiled law.
 *
 * `epsYield` already carries the material partial factor: an EC2 bar with `gammaS = 1.15` yields at
 * `fy / 1.15 / Es`, so a station labelled `fs = fyd` must sit there and not at `fy / Es`.
 */
export type StationSteelLimits = {
  epsY: number
  /** Declared rupture strain of the controlling bar, or null when the definition omits it. */
  epsU: number | null
}


export type FixedPInterpolationBracket = {
  /** Surface state at or below the selected axial force. */
  below: PreviewSurfacePoint
  /** Surface state at or above the selected axial force. */
  above: PreviewSurfacePoint
  /** `t = (Pselected - Pbelow) / (Pabove - Pbelow)`; zero for an exact station. */
  ratio: number
  exact: boolean
}


export type FixedPContourSampleTrace = {
  /** The same sampled-direction point returned by `contourStrainAngleSamples`. */
  point: PreviewContourPoint
  /** Null is a fail-closed diagnostic: the displayed point could not be traced to one meridian. */
  bracket: FixedPInterpolationBracket | null
}


export type SurfaceRayIntersection = {
  lambda: number
  point: Resultant
  state: StrainState
  resistance: DesignResistanceTrace | null
  source: { vertices: readonly [PreviewSurfacePoint, PreviewSurfacePoint, PreviewSurfacePoint]; weights: readonly [number, number, number] } | null
}


export type ConstantAxialIntersection =
  | { status: 'crossing'; intersection: SurfaceRayIntersection }
  | { status: 'axial-outside-domain' | 'zero-moment' | 'axis-outside-domain' | 'non-unique-exit' | 'geometric-ambiguity' }


export type SectionFieldSample = {
  x: number
  y: number
  area: number
  strain: number
  stress: number
  kind: 'concrete' | 'rebar'
}


export type SectionFieldRebar = {
  id: number
  x: number
  y: number
  dia: number
  area: number
  strain: number
  stress: number
  /** Axial force in the bar, N (compression positive with the strain convention). */
  force: number
}


/** One mesh triangle with vertex field values for continuous canvas shading. */
export type SectionFieldTriangle = {
  ax: number
  ay: number
  bx: number
  by: number
  cx: number
  cy: number
  strainA: number
  strainB: number
  strainC: number
  stressA: number
  stressB: number
  stressC: number
}


export type SectionFieldMap = {
  mechanics?: 'stress-strain-integration' | 'equivalent-rectangular-block'
  origin: AnalysisOrigin
  /** Legacy quadrature samples (debug / hover). */
  samples: SectionFieldSample[]
  /** Clipped-cell triangles for stress-strain integration; empty for analytic equivalent blocks. */
  triangles: SectionFieldTriangle[]
  rebars: SectionFieldRebar[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  mesh: ConcreteMeshReport
  equivalentBlock?: {
    neutralAxisAngle: number
    neutralAxisDepth: number
    blockDepth: number
    compressionStress: number
    geometry: Array<{ outer: Array<{ x: number; y: number }>; holes: Array<Array<{ x: number; y: number }>> }>
  }
}
