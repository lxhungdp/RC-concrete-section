# 05 — Adaptive ULS P–Mx–My Resistance Surface

Filename retained for navigation compatibility. The canonical default remains
`24 directions × 19 points`; both axes are now persisted analysis inputs rather than constants in
the kernel or UI.

## 1. Structural meaning

The ULS boundary is generated from admissible ultimate strain planes supplied by the selected
design-code adapter. For every accepted state:

1. plane sections remain plane;
2. exact section geometry defines extreme fibers and controlling distances;
3. reference materials produce the mandatory nominal/reference response and contribution ledger;
4. exactly one resistance method from file `11` produces the design response;
5. the forward kernel integrates `P,Mx,My` for every required material evaluation;
6. every code limit and resistance stage is traceable.

The generic kernel does not assume a universal concrete crushing strain, steel ultimate strain,
balanced point, strength-reduction factor, or maximum compression cap.

## 2. Ultimate strain-domain interface

```ts
export interface UltimateStrainDomain {
  /** Initial state parameters including all code/material breakpoints. */
  seedParameters(): readonly number[]; // strictly increasing, normally [0,1]

  /** Map strain-plane sample direction and normalized path parameter to a boundary strain plane. */
  stateAt(beta: number, t: number): UltimateStrainState;

  /** Explain controlling limits for reporting and traceability. */
  classify(state: UltimateStrainState): FailureMode;

  /** True only if endpoints are common poles across beta. */
  topology(): 'twoCommonPoles' | 'closedBands';
}

export interface UltimateStrainState {
  q: GeneralizedStrain;
  beta: number;
  t: number;
  control: Readonly<Record<string, number | string>>;
  clauseRefs: readonly string[];
}
```

`beta` in this interface is a strain-domain sampling parameter. It must not be treated as the
moment direction of a demand. After the surface has been generated, demand queries use
`thetaLoad = atan2(Muy, Mux)` and operate on the finished `P-Mx-My` geometry.

The adapter may implement conventional strain domains, pivot rules, or another verified mapping.
It must prove that the mapping covers the intended resistance boundary for its supported section and
material scope. A generic 19-point schedule is not proof of completeness.

### Seed schedule policy

An adapter may seed points at:

- uniform compression/tension states when defined;
- neutral axis at reinforcement layers;
- reinforcement zero stress/yield/strain-control limits;
- concrete stress-law breakpoints and ultimate strain limits;
- strength-reduction transition breakpoints;
- axial-cap intersection candidates.

Seed strains are derived from the authoritative adapter/material definitions, not hard-coded values
such as `0.003` that may conflict with `fy/Es`. After sorting, duplicate parameters within tolerance
are merged and the physical control variable must remain monotone.

### Configurable reporting stations

The two poles are mandatory and are not editable:

- pure compression uses uniform `epsCu`;
- pure tension uses the smallest declared tensile rupture strain among the steel grades present;
  grades without a declared limit contribute the documented preview fallback `25 ×` the largest
  compiled yield strain in that undeclared group. The smallest applicable candidate governs. When
  no grade declares rupture, the fallback is also extended to the deepest configured steel-strain
  station so the path cannot reverse before reaching the pole.

Between those poles, a project persists an ordered list of zero or more stations. Every item has a
stable positive integer ID, a user label, and exactly one criterion:

| Criterion | Meaning at the controlling far-tension bar |
|---|---|
| `c-over-c1` | neutral-axis depth `c = ratio × c1`; ratio must be positive |
| `steel-stress-ratio` | tensile stress `fs = ratio × fyd`, where `fyd = fy/gammaS`; ratio is in `[0,1]` |
| `steel-strain` | signed tensile strain under the compression-positive convention; value is non-positive |

The engine resolves `steel-stress-ratio` by inverting the compiled stress-strain law on its tensile
pre-yield branch. It does not replace a nonlinear/user curve with `fs/Es`. If the requested stress
is not reachable on that branch, analysis fails with `INVALID_ANALYSIS_OPTIONS`.

The array order is the engineering compression-to-tension path and controls display indices
`P0…Pn`. Stable station IDs are used for persisted references such as refinement probes; array
indices are not identifiers. For every direction, the controlling-bar strain must be monotone from
compression to tension. Reversed schedules fail before a surface is returned. Stations that collapse
onto the same material-limit state remain traceable; a custom schedule produces a warning so the
user can decide whether the duplicate is intentional.

The default profile reproduces the former P0–P18 schedule exactly:

The current web preview follows the `PM-advanced (7) 2D.xlsx` station intent for plotting shape:

- `P0`: pure compression, `eps0 = epscu`, curvature zero;
- `P1..P4`: neutral-axis depth ratios `C/C1 = 3, 2, 1.5, 1.2`;
- `P5`: far tension reinforcement stress equals zero;
- `P6..P9`: far tension reinforcement stress ratios `fs/fyd = 0.25, 0.5, 0.75, 1.0`;
- `P10..P17`: far tension reinforcement strains `0.003, 0.005, 0.0075, 0.01, 0.015, 0.025, 0.03, 0.05`
  in tension;
- `P18`: pure tension; for the default SD400 without declared rupture this resolves to
  `eps0 = -0.05`, curvature zero.

For a vertical slice this sequence should plot with moment near zero at `P0`, increasing to a peak,
then decreasing back toward zero at `P18`. If this visual order is reversed or crosses to the
unexpected side of the origin, check the station strain mapping and axis/sign convention before
changing chart presentation settings.

## 3. Exact geometry for one direction

For every `β`, obtain `uMin,uMax` from exact polygon support (file `02`) and exact bar projections.
The adapter selects which concrete edge and reinforcement layer controls each strain domain.

For the common two-point interpolation case:

```text
κ = (εtop−εcontrol)/(utop−ucontrol)
ε0 = εtop−κ·utop
κx = κ·cosβ
κy = κ·sinβ
```

The sign/orientation mapping belongs to one tested helper. Reject zero control distance, bars outside
the validated concrete region, or a mapped state that violates its declared ultimate strain domain.

### Direction seed contract

A project chooses one of two periodic seed grids:

- `uniform`: integer count `4…360` plus `startDeg` in `[0,360)`;
- `explicit`: `4…360` distinct angles, strictly increasing in `[0,360)`.

Angles are persisted in degrees for human audit and converted once to radians in the kernel. An
explicit grid may be nonuniform. The closing interval always runs from the last angle to the first
angle plus 360°, so no direction is duplicated merely to close the topology.

Refinement is either `fixed` or deterministic midpoint `adaptive`. Adaptive options persist
relative tolerance, maximum passes, maximum directions (`≤720`), and probes by stable station ID or
`all`. Every seed direction is retained. The result stores both the requested options and the actual
post-refinement direction array.

## 4. Surface vertex

```ts
export interface SurfaceVertex {
  id: number;
  beta: number;
  t: number;
  strainState: UltimateStrainState;
  nominal: NominalStateEvaluation;
  designResistance: Resultant;
  failureMode: FailureMode;
  appliedStages: readonly AppliedResistanceStage[];
}
```

The nominal/reference evaluation is mandatory for audit. The design resultant is produced once by
the selected standard profile. For global-factor profiles it is `phi` times the complete nominal
vector. For design-material profiles it is a separate stress-law evaluation at the same stored
strain state and is not generally `phi` times nominal.

## 5. Adaptive tensor-grid construction

Use a periodic grid in `β` and a global ordered grid in `t`. A common grid makes triangulation and
error accounting deterministic.

### Initial grid

```text
β = configured uniform or explicit periodic directions
t = adapter.seedParameters()
```

### Midpoint error test

For every beta interval and state interval, evaluate actual midpoint states not already sampled.
Compare each actual midpoint resultant to the bilinear/edge interpolation of neighboring accepted
vertices using fixed scales `Pref,Mref`:

```text
eR = max(|ΔP|/Pref, |ΔMx|/Mref, |ΔMy|/Mref)
```

Test both the design resultant and the nominal/reference resultant. Also test changes in
failure-mode/resistance-stage regions. Insert
the midpoint beta line or state line globally when the worst affected cell exceeds tolerance.

Global insertion is intentionally conservative: if one direction needs a material/reduction
breakpoint, all directions receive that `t` line so topology remains rectangular.

### Iteration

```ts
while (true) {
  const assessment = assessAllMidpoints(grid);
  if (assessment.maxError <= tolSurface) break;
  if (grid.levels >= maxLevels || grid.vertices >= maxVertices)
    return surfaceFailure('SURFACE_NOT_CONVERGED', assessment);
  grid = insertRequiredMidlines(grid, assessment);
}
```

All limits are hard. Non-convergence is a typed failure, never a warning followed by an accepted
surface.

The midpoint chord test estimates interpolation error of the sampled model; file `06` also checks
demand utilization and compares with an independent reference solver.

## 6. Explicit triangulation

For each adjacent periodic beta pair and adjacent `t` pair, form a quad and split it into two
triangles. Choose the diagonal that minimizes normalized resultant-space distortion, with a
deterministic tie-breaker. Keep vertex order consistent with outward orientation.

For `twoCommonPoles` topology:

- deduplicate the common endpoint at each pole;
- connect each pole to the first/last interior beta ring with triangle fans;
- do not create zero-area triangles from repeated pole vertices.

```ts
export interface OrientedSurfaceMesh {
  vertices: readonly SurfaceVertex[];
  triangles: readonly { i:number; j:number; k:number }[];
  bounds: { P:[number,number]; Mx:[number,number]; My:[number,number] };
  topologyReport: SurfaceTopologyReport;
  errorReport: SurfaceDiscretizationReport;
}
```

## 7. Surface topology validation

Before using a surface for adequacy:

- every triangle has finite coordinates and non-negligible normalized area;
- every undirected edge belongs to exactly two triangles;
- adjacent triangles use opposite directions on their common edge;
- mesh is one closed connected two-manifold unless adapter scope explicitly permits more;
- signed enclosed volume is nonzero and orientation is corrected once if necessary;
- detect non-adjacent triangle intersections/self-intersections;
- zero action `(0,0,0)` is inside the design domain within tolerance;
- stored bounds enclose every vertex.

Failure of any topology check blocks engineering use.

## 8. Design transformation and axial caps

For every accepted strain state, first store the nominal/reference result and contribution ledger,
then execute exactly one resistance format from file `11`:

- a global factor multiplies the complete nominal `(P,Mx,My)` vector once;
- a design-material method reevaluates the design stress laws at the same state;
- a contribution transform is permitted only with proof of factorability;
- a hybrid follows its explicitly declared stage order.

Do not multiply the already combined concrete-plus-steel nominal result by separate concrete and
steel factors. Do not combine a global `phi` method with a material-factor alternative. Run
adaptive refinement in design space because transition factors or design yield points can add
kinks not present on the reference surface.

An axial cap is a half-space intersection of the closed design domain, for example `P≤Pcap`. Clip
intersected triangles, create the cap-face polygon(s), triangulate those faces, and rerun topology
validation. Do not merely set `P=Pcap` on selected vertices.

All discontinuities or kinks introduced by design rules must be included in adaptive-error checks.

## 9. Fixed-P contours

Do not scan each beta curve for one supposedly monotone `P` segment. Intersect every surface triangle
with plane `P=Pu`:

1. classify vertices relative to the plane with a scale-aware tolerance;
2. compute edge intersections;
3. handle coplanar cap triangles without duplicate edges;
4. collect and snap segment endpoints using normalized tolerance;
5. stitch segments into oriented closed loops;
6. validate loop closure and self-intersection;
7. retain multiple loops/holes if present.

This contour is used for plots and fixed-P point-in-domain checks.

For a single load combination, the fixed-`P` moment capacity is a ray query on this contour:

1. compute `thetaLoad = atan2(Muy, Mux)` and `Mu = sqrt(Mux^2 + Muy^2)`;
2. intersect the `P = Pu` contour with the ray `Mx = t*cos(thetaLoad)`,
   `My = t*sin(thetaLoad)`;
3. use the first positive boundary intersection as `Mb`;
4. report the secondary fixed-axial moment ratio as `Mu/Mb`.

Do not select the contour point whose strain-plane sample angle is nearest `thetaLoad`. The sampled
strain-plane angle generated the surface; it is not generally the same as the moment angle of the
resultant at that point.

## 10. Moment-direction vertical slices

A `P-Mtheta` chart for a demand direction is the intersection of the finished `P-Mx-My` surface
with the vertical plane through the `P` axis:

```text
Mx*sin(thetaLoad) - My*cos(thetaLoad) = 0
```

Every intersection point is plotted with:

```text
Mtheta = Mx*cos(thetaLoad) + My*sin(thetaLoad)
P      = P
```

This is a geometric slice of the surface mesh. It is not the strain-domain curve at
`beta = thetaLoad`, except in special cases where the resultant moment direction happens to match
the sampled strain-plane angle.

The intersection is a set of **triangle segments**, not an unordered set of points. Build a graph
whose nodes are shared surface-edge/surface-vertex intersections and whose edges are the segments
contributed by individual triangles. Traverse that graph to emit one or more connected paths:

- a closed path repeats its first point only after graph traversal proves that the last segment
  returns to that node;
- an open path remains open and is reported as a topology defect; the plotting adapter must never
  force-close it;
- multiple loops remain separate Plotly traces;
- sorting all intersections by `P` is prohibited because it invents chords whenever a branch is
  non-monotone or the section is asymmetric.

`P0` and the pure-tension pole are identical in every strain-plane direction because their
curvature is zero. They are not necessarily on every vertical moment plane: reinforcement that is
eccentric about the net-concrete centroid can give a uniform-strain pole a nonzero moment vector.
In that case the closed plane section connects through the adjacent cap triangles rather than
through the pole itself.

When the UI option **Opposite** is enabled, render the complete ordered path. The negative branch is
not obtained by negating the positive branch. When **Opposite** is disabled, clip each connected
path against `Mtheta >= 0` and explicitly interpolate every `Mtheta = 0` crossing; filtering a point
cloud by sign is not a valid clipping algorithm.

## 11. Plotting

Plotly is a presentation adapter only. Supply the explicit `i,j,k` triangle indices. Plotly's
`alphahull:0` constructs a convex hull and is prohibited for the resistance surface because it can
display non-capacity regions as valid.

Current web preview implementation uses Plotly.js (`plotly.js-dist-min`) rather than custom SVG.
Until an accepted adaptive mesh exists, the preview 3D view uses a Plotly `surface` trace over the
beta/station grid so users can rotate, zoom, hover, and click points. Demand points are displayed
as `scatter3d` markers, and the two 2D views use `scatter` traces with app sliders for fixed `P`
and rotation angle. This is an interactive preview surface, not a certified resistance domain.
After the engine emits an accepted `OrientedSurfaceMesh`, the 3D view shall use `mesh3d` with the
engine-provided vertices and triangle indices.

Display:

- nominal/reference surface plus design resistance, with the selected method ID and each applied
  resistance stage available on hover/report;
- convergence resolution and estimated error;
- failure mode and controlling strains on hover;
- demand point and proportional ray;
- fixed-P contour produced from triangle slicing;
- vertical `P-Mtheta` slice produced from the moment-direction plane
  `Mx*sin(thetaLoad) - My*cos(thetaLoad) = 0`;
- clear warning when a surface is preview-only or non-certified.

## 12. Independent reference method

For verification fixtures, build selected boundary points using a separately implemented constrained
optimization method that maximizes a chosen resultant direction subject to the adapter's ultimate
strain constraints. This follows published approaches for complete arbitrary-section interaction
diagrams and provides an algorithmically independent comparison with the strain-path sampler.

The production surface and the reference optimizer must not share interpolation, triangulation, or
search code.
