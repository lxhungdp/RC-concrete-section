# 07 — Demand Checks, Utilization, and End-to-End Orchestration

This file defines the authoritative ULS check. It replaces v1's axial screen plus fixed-P radial
moment ratio.

Classic biaxial-bending pitfall: the sampled strain-gradient direction `beta` used to generate the
`P-Mx-My` surface—and the derived neutral-axis line angle—are not the moment direction of a demand.
Demand checks use the demand vector itself, with `thetaLoad = atan2(Muy, Mux)`, and intersect the
completed surface geometry. Any implementation that chooses a sampled beta row because it is
closest to `thetaLoad` is a mechanics bug.

## 1. Demand contract

```ts
export interface DesignDemand {
  P: number;
  Mx: number;
  My: number;
  combinationId: string;
  referenceOrigin: { x:number; y:number };
  actionBasis: 'factoredULS';
}
```

Demand and resistance must use the same origin, axes, sign convention, and units. If origins differ,
transform the demand explicitly and preserve both forms in provenance.

## 2. Primary adequacy test: point in design domain

Use the closed, oriented, topology-verified design surface from file `05`. Normalize coordinates:

```text
X = [P/Pref, Mx/Mref, My/Mref]
```

Compute a robust generalized winding number or another verified point-in-closed-triangle-mesh test.
Classify as:

```ts
type DomainLocation = 'inside' | 'boundary' | 'outside' | 'indeterminate';
```

Near-triangle/edge/vertex distances are compared with normalized geometric tolerance. Use at least
one algorithmically independent parity-ray check in verification tests. A topology-invalid surface
cannot produce an adequacy result.

## 3. Default utilization: proportional load factor in 3D

For nonzero demand vector `D`, trace the ray

`R(λ)=λD`, `λ≥0`.

Intersect the normalized ray with every design-surface triangle. Deduplicate intersections at shared
edges/vertices and sort positive `λ` values. Because zero action must lie inside the valid design
domain, the first outward crossing is the proportional capacity multiplier `λcap`.

```text
UR = 1/λcap
```

Consequences:

- zero demand: `UR=0`;
- pure axial compression/tension: utilization increases correctly toward the axial boundary;
- combined loading: `P,Mx,My` scale together;
- `UR=1` at the boundary;
- `UR>1` when demand exceeds capacity along the proportional load path.

```ts
export interface UtilizationResult {
  definition: 'proportional3D';
  value: number;
  interval: [number, number];
  capacityMultiplier: number;
  governingPoint: Resultant;
  governingTriangle: number;
  domainLocation: DomainLocation;
  classification: 'adequate' | 'inadequate' | 'indeterminate';
}
```

If the ray finds no crossing, an even number inconsistent with the start-inside state, or a
near-coplanar ambiguity unresolved by tolerance refinement, return `RAY_DOMAIN_INCONSISTENT`; do not
return infinity as if it were a legitimate utilization.

### Star-shaped check

The default proportional utilization requires the physically relevant first boundary along each
load ray. For the oriented polyhedral domain, compute its kernel test by intersecting the inward
half-spaces of all triangle planes and verify that normalized zero action lies in that kernel within
tolerance. Supplement this with rays through all vertices, face centroids, and a deterministic
spherical direction set, reporting any multiple exit/re-entry intervals. If zero is not in the
verified kernel, point inclusion remains meaningful but proportional utilization is `indeterminate`
until the adapter/surface is reviewed.

## 4. Fixed-P contour and secondary metrics

For visualization or a specifically requested constant-axial-load study, slice all triangles as
defined in file `05` and perform a point-in-multiple-polygons test for `(Mux,Muy)`.

The radial moment ray for that study is `Mx = t*cos(thetaLoad)`,
`My = t*sin(thetaLoad)`. It is not the row of the surface generated at a matching strain-plane
angle.

A fixed-P radial moment ratio may be reported only when:

- `(Pu,0,0)` is inside the design domain;
- the chosen moment ray has a unique first contour exit;
- the output is labeled `momentUtilizationAtFixedP`, not total utilization.

It is not the default strength ratio and must never report zero utilization merely because moments
are zero.

## 5. Boundary uncertainty and classification

Use the numerical uncertainty interval from file `06`. Classification is not based on a raw
`UR<=1` comparison:

```ts
function classify(interval:[number,number], margin:number) {
  if (interval[1] < 1-margin) return 'adequate';
  if (interval[0] > 1+margin) return 'inadequate';
  return 'indeterminate';
}
```

Project/design-code policy may define whether equality is permitted, but numeric rounding must not
decide it.

## 6. End-to-end ULS orchestration

```ts
export async function analyzeUls(
  scenario: AnalysisScenario,
  demands: readonly DesignDemand[],
  options: AccuracyOptions,
  signal?: AbortSignal,
): Promise<EngineeringResult<UlsAnalysis>> {
  // 1. Runtime schema and resource preflight.
  // 2. Resolve one verified standard resistance profile: exact edition + methodId.
  // 3. Normalize/validate geometry; establish immutable reference frame.
  // 4. Compile reference materials, any design materials, and the adapter strain domain.
  // 5. For each integration mesh level:
  //      a. build clipped fibers and run mesh sanity checks;
  //      b. evaluate nominal/reference states and contribution ledgers;
  //      c. execute exactly one resistance method and build both reference/design surfaces;
  //      d. reject mixed or repeated resistance stages;
  //      e. apply geometric design-domain clipping;
  //      f. validate topology/orientation/origin containment/star-shaped report;
  //      g. check demands and targeted-refine governing intersections.
  // 6. Compare quantities across mesh levels until mesh convergence.
  // 7. combine uncertainty, classify demands, attach provenance.
  // 8. return success only if every required engineering gate converged.
}
```

Surface refinement occurs inside every compared mesh level. Comparing a fine mesh with an
under-resolved surface confounds error sources and is prohibited.

## 7. Public result model

```ts
export type EngineeringResult<T> =
  | { ok:true; value:T; issues:readonly EngineeringIssue[]; provenance:Provenance }
  | { ok:false; errors:readonly EngineeringIssue[]; partial?:PreviewOnlyData;
      provenance:Provenance };

export interface UlsAnalysis {
  geometry: NormalizedGeometrySummary;
  nominalSurface: OrientedSurfaceMesh;
  designSurface: OrientedSurfaceMesh;
  resistanceProfile: StandardResistanceProfileIdentity;
  appliedMethodId: string;
  checks: readonly DemandCheck[];
  numericalEvidence: NumericalEvidence;
  scope: ScopeStatement;
}
```

`partial` data is explicitly `PreviewOnlyData` and cannot be consumed by report/certification APIs.

## 8. Typed issue policy

Every issue has code, severity, user-safe message, technical context, and source path/ID where
possible.

Required fatal categories include:

- invalid units/non-finite input;
- polygon topology or bar-location error;
- unknown/unverified design-code profile, edition, amendment, national annex, or method;
- mixed standard methods, double reduction, or an untraceable resistance stage;
- material inconsistency or out-of-domain evaluation;
- resource preflight failure;
- mesh/surface/utilization non-convergence;
- invalid/self-intersecting/open resistance surface;
- zero action not inside design domain;
- ray/slice geometry inconsistency;
- cancellation;
- internal invariant failure.

Warnings include near-boundary geometry, point-bar approximation concerns, unusually thin features,
high condition numbers, extrapolation explicitly allowed by the user, and out-of-validation-range
but adapter-permitted cases. A warning never overrides a fatal gate.

## 9. Edge cases that must have explicit tests

| Case | Expected behavior |
|---|---|
| Zero demand | inside, `UR=0`, assuming a valid design domain |
| Pure axial at capacity | boundary, `UR≈1` within uncertainty |
| Pure axial outside capacity | outside, `UR>1` |
| Demand on face/edge/vertex | boundary or indeterminate within geometric tolerance |
| Factored `P` surface non-monotonic | handled by full triangle mesh; no curve-order assumption |
| Axial cap plane | cap face closed and ray intersection correct |
| Asymmetric bars and nonzero uniform-strain moments | handled in full 3D; no assumption that poles lie on moment origin |
| Multiple fixed-P loops | preserve loops and hole parity |
| Demand angle between sampled strain angles | geometric ray/plane intersection, not nearest sampled beta row |
| Near-tangent demand ray | targeted refinement or `indeterminate` |
| Non-star-shaped design domain | point location available; proportional UR blocked/indeterminate |
| Mesh/surface limit reached | typed failure, never accepted with console warning |
| Cancellation | typed cancellation with no certified partial result |

## 10. Batch demand efficiency

Build the verified resistance domain once per unique normalized scenario/options hash. Precompute a
triangle acceleration structure in normalized resultant space for point/ray/slice queries. The
acceleration structure is an optimization only; regression tests compare it with brute-force
triangle queries.

Batch checks preserve input order and isolate per-demand geometric ambiguity while sharing global
surface convergence evidence.
