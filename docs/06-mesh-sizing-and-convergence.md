# 06 — Solution Verification, Error Budget, and Convergence

An engineering result is accepted only when all numerical error sources relevant to that result are
controlled. Exact polygon area does not imply exact force/moment capacity.

## 1. Separate error sources

Track at least:

| Source | Symbol | Controlled by |
|---|---:|---|
| floating-point/summation | `efp` | scaling, compensated sums, finite checks |
| nonlinear algebra | `esolve` | scaled residual/increment and conditioning |
| concrete integration mesh | `emesh` | `h → h/2` refinement |
| strain-plane angle sampling | `ebeta` | midpoint angle refinement |
| strain-state sampling | `estate` | midpoint state refinement |
| triangle/ray/slice geometry | `egeom` | normalized tolerances and topology tests |
| design-code implementation | not a numerical tolerance | clause review and code-verification tests |
| model-form uncertainty | not removed by refinement | scope statement and validation evidence |

Do not combine code/model uncertainty with numerical convergence. They require different evidence.

Do not use `ebeta` refinement as evidence that a demand-direction slice is correct. `ebeta` controls
how completely the surface is sampled in strain-state space. A loadcase direction
`thetaLoad = atan2(Muy, Mux)` is a geometric query on the finished surface and has its own
triangle/ray/slice error source `egeom`.

## 2. Quantities of interest

Convergence is assessed on a vector of engineering quantities, not one global maximum moment:

- design axial extrema;
- selected boundary vertices and midpoint resultants;
- fixed-P contour radii/coordinates at demanded and sentinel levels;
- proportional utilization for every requested demand;
- demand-direction `P-Mtheta` slice coordinates from the plane
  `Mx*sin(thetaLoad) - My*cos(thetaLoad) = 0`;
- governing boundary point and failure-mode classification;
- topology invariants.

If no demand is supplied during precomputation, use a documented sentinel set spanning axial levels
and moment directions. Demand-time refinement may still be required near the boundary.

## 3. Normalized comparison metric

For resultants:

```text
dR(a,b) = max(
  |Pa−Pb| /(atolP + rtol·Pref),
  |Mxa−Mxb|/(atolM + rtol·Mref),
  |Mya−Myb|/(atolM + rtol·Mref))
```

For scalar utilization:

```text
dUR = |URa−URb|
```

Near zero, use absolute tolerances; never divide by the current value alone.

## 4. Integration-mesh refinement

Starting from `h0` in file `02`, rebuild the concrete mesh and full relevant surface at `h/2`.
Compare quantities of interest after matching/interpolating the same `(β,t)` or demand paths.

At least two successively refined differences are required before labeling a Richardson estimate.
With `fh, fh/2, fh/4`, an observed order may be estimated only when differences are well separated,
same-signed/regular, and not dominated by roundoff:

```text
pobs = log2(|fh−fh/2| / |fh/2−fh/4|)
efine ≈ |fh/2−fh/4|/(2^pobs−1)
```

If these conditions fail, report the conservative last-level difference as an empirical bound and
do not call it Richardson extrapolation.

Refinement stops successfully only when all required quantities meet `tolMesh`. Hitting `maxLevels`,
`maxFibers`, time, or memory limits returns `MESH_NOT_CONVERGED`/`RESOURCE_LIMIT`.

### 4.1 Mesh inspection in Analysis Options

For the stress-strain route, **Analysis Options > Mesh** is a zoomable traceability view of the exact `ConcreteMesh` used
by the analysis revision. It is loaded lazily. At inspection zoom it draws all clipped triangles in
the visible viewport; optional Gauss-point markers are the actual quadrature locations derived from
the same exported degree-2 barycentric rule, not a new display sampling.

At overview scale the chart may show an explicitly labelled clipped-grid LOD to keep frame work
bounded. This happens when cells are sub-pixel or more than 60,000 triangles would be drawn in one
frame. The exact triangle buffers remain available and appear automatically after zooming. Section
rings are exact at every level, but the overview grid must not be interpreted as triangle topology.
The view uses transferable typed arrays, viewport cell ranges, batched canvas paths and
`requestAnimationFrame`; it never sends the raw triangle/quadrature object graph through
`postMessage`.

The display safety ceiling is 750,000 triangles. Exceeding it disables only the interactive view and
reports a resource message; it does not silently coarsen, replace, or invalidate the analysis mesh.
This distinction is required by the rule that presentation optimization must never change an
engineering result.

The chart's `Verified` badge means only that the mesh passed the area/first-moment sanity checks in
file `02` §8. Visual inspection and those invariants do **not** establish integration convergence.
Only the refinement comparison in this section controls `emesh`.

Equivalent-block projects do not show this mesh because their concrete block is integrated by exact
polygon clipping. The workspace displays that distinction explicitly; a display mesh created only
for coloring the field is not an equivalent-block integration mesh.

### 4.2 Measured discretization error of the current seed rule

Mesh refinement is not yet automatic; the seed rule `h0 = Dmin/32` from file `02` is used as is. Its
error has, however, been measured — surface states at `h0`, `h0/2` and `h0/4` against an `h0/12`
reference, over the benchmark fixtures:

| Section | `h0` | `max |ΔP|/Pspan` at `h0` | `max |ΔM|/Mspan` at `h0` |
|---|---:|---:|---:|
| reference (1500×1200, two voids) | 37.5 mm | 4.9e-4 | 1.2e-3 |
| compact 600×600 | 18.75 mm | 3.2e-4 | 8.6e-4 |
| hollow circular D1800/D1200 | 56.2 mm | 3.4e-4 | 8.4e-4 |
| thin-walled box, 250 mm walls | 62.5 mm | 8.2e-4 | 1.3e-3 |

Two consequences worth recording.

First, the seed rule survives the thin-walled case even though `Dmin` is taken from the **outer**
convex hull, so a 250 mm wall is covered by only four cells. That is not the accident it looks like:
the clipped-cell mesh is geometrically exact at any `h`, so wall thickness does not drive the error.
The only error source is a cell straddling a material breakpoint (`ε = 0`, `ε0`, `εcu`), which scales
with `h` against the strain gradient, not against a geometric feature.

Second, integration-mesh error is **not** the governing numerical error in this engine. Direction
sampling (§5) is roughly thirty times larger. Refining the mesh before the direction grid would buy
nothing.

## 5. Surface refinement

Angle and state refinements are separate from mesh refinement. File `05` controls them with actual
midpoint evaluations.

Required reports:

```ts
export interface SurfaceDiscretizationReport {
  converged: boolean;
  betaIntervals: number;
  stateIntervals: number;
  vertices: number;
  maxNominalChordError: number;
  maxDesignChordError: number;
  worstCell?: { beta0:number; beta1:number; t0:number; t1:number };
  levels: number;
}
```

For accepted results, after the surface passes its local chord test, recompute demand utilization
with one additional targeted refinement around the intersected triangles. The utilization
difference must satisfy `tolUtilization`. This demand-targeted utilization refinement and its
accepted-result gate are not yet implemented in the preview application.

The intersected triangles are found by the demand ray or demand-direction plane, not by locating the
nearest strain-plane sample angle. A regression that passes only when `thetaLoad` equals a sampled
strain angle is under-tested.

### 5.1 Measured direction-sampling error, and what it costs

`PreviewSurface.directionError` reports the beta chord error of the grid it actually returned. The
engine evaluates the true state halfway between sampled directions and compares it with the chord
used by the triangulation. The production stress-strain default probes all 25 stations; this is a
sampled estimator, not a mathematical upper bound (§11). An explicit empty probe list disables the
measurement and returns `NaN`, never a misleading zero.

The following table is a historical measurement of the former fixed 24-direction grid. It is kept
to explain why that default was retired; it is not the current production configuration:

| Section | `max |ΔP|/Pspan` | `max |ΔM|/Mspan` | Capacity change when refined to 192 directions |
|---|---:|---:|---:|
| reference | 1.2e-2 | 3.6e-2 | +0.003 % |
| compact 600×600 | 1.0e-2 | 3.3e-2 | +0.67 % |
| circular D900 | 3.3e-3 | 1.0e-2 | +0.81 % |
| hollow circular | 3.6e-3 | 1.1e-2 | +0.82 % |
| L-shaped core | 4.7e-2 | 8.8e-2 | +0.90 % |
| thin-walled box | 4.2e-2 | 1.1e-1 | **+3.81 %** |

The direction grid, not the integration mesh, is the governing numerical error: one to sixteen
percent in moment, against one tenth of a percent from the mesh.

The capacity change was positive for every case in that historical table. For a locally convex
fixed-P contour, chord interpolation cuts the corner and under-reports capacity, but the measured
sign is not a universal theorem for arbitrary non-convex or multi-loop slices. The current
stress-strain default starts from 36 directions and adaptively probes all 25 stations at 0.5%
relative tolerance. The effective direction count and convergence evidence are recorded with every
surface. The equivalent-block model retains its independent 24-direction seed and 0.75% adaptive
default because its station coordinate and exact clipped-block kernel are different. Its code-factor
kinks are inserted as controlling-bar events before adaptive error refinement.

The permanent post-change benchmark is `npm run bench:strain-sampling`. Against a 144-direction,
33-transition-node reference, worst 3D ray error over five fixtures fell from 7.800% for the legacy
19 x 24 fixed grid to 0.521% for the production 25-station/36-seed adaptive configuration. See `12`
for per-configuration cost and acceptance evidence.

## 6. Error budget hierarchy

Solver tolerances must be materially tighter than discretization tolerances. A recommended initial
budget for development is:

```text
scaled forward summation / algebra: <= 1e-10 where testable
service nonlinear residual:         <= 1e-8
mesh effect on utilization:         <= 2e-3
surface effect on utilization:      <= 2e-3
reported combined numerical band:   <= 5e-3 for design mode
verification fixtures:              target <= 1e-3 where references support it
```

These are project targets, not statements that every geometry can achieve them. The V&V program may
tighten them. A design-code adapter may require stricter limits.

## 7. Combined numerical uncertainty for utilization

Use conservative accumulation unless independence is justified:

```text
uUR = emesh,UR + esurface,UR + egeom,UR + esolve,UR
URinterval = [max(0,UR−uUR), UR+uUR]
```

Classification:

```text
URinterval.max < 1−acceptanceMargin  -> adequate
URinterval.min > 1+acceptanceMargin  -> inadequate
otherwise                            -> indeterminate
```

The design code or project quality plan defines `acceptanceMargin`. Numerical uncertainty shall not
be hidden by rounding.

## 8. Target accepted-result accuracy contract

The following interfaces are specification shapes, not current exported TypeScript. Current v1
inputs are `AnalysisOptions` and `EquivalentBlockAnalysisOptions`; preview surfaces expose
model-specific direction/station evidence but not the complete combined uncertainty object below.

```ts
export interface AccuracyOptions {
  mesh: { tolerance:number; maxLevels:number; maxFibers:number };
  surface: {
    tolerance:number;
    utilizationTolerance:number;
    maxLevels:number;
    maxVertices:number;
  };
  geometryTolerance: number;
  acceptanceMargin: number;
  profile: 'preview' | 'design' | 'verification';
}

export interface NumericalEvidence {
  profile: AccuracyOptions['profile'];
  converged: boolean;
  mesh: MeshConvergenceReport;
  surface: SurfaceDiscretizationReport;
  utilization?: UtilizationConvergenceReport;
  floatingPointChecks: FloatingPointReport;
  totalUtilizationUncertainty?: number;
}
```

Profiles are named collections of explicit values. The result stores expanded values, not only the
profile name.

`preview` results are never eligible for certified reporting.

## 9. Caching and reuse across refinements

Cache immutable geometry normalization, polygon properties, material compilation, and previously
evaluated `(meshLevel,β,t)` states. A finer mesh changes all integrated resultants, so do not reuse
coarse resultants as fine results. Reuse only topology/parameter scheduling where mathematically
valid.

Run refinement in a worker with progress stages and cooperative cancellation before release.
Currently an abort drops the client result but a running synchronous worker/fallback calculation may
finish in the background. It still cannot be accepted or displayed after cancellation.

## 10. Diagnosing non-convergence

Return diagnostics that distinguish:

- geometric sliver/topology problem;
- material discontinuity or unsupported softening;
- unresolved thin feature;
- abrupt design-rule transition missing from seed breakpoints;
- insufficient angle/state resolution;
- confusion between strain-plane sample angle and demand moment direction;
- near-tangent ray/surface intersection;
- resource exhaustion;
- actual algorithm defect.

Do not recommend blind refinement indefinitely. Preserve the last two level comparisons and worst
locations so a developer/engineer can investigate.

## 11. No universal error claim from one benchmark

A convergence study on one hollow or rectangular section may justify a regression fixture, not a
universal statement such as "N=40 gives 0.1% moment error." Production defaults are accepted only
through the validation matrix in file `09`, covering geometry, material, axial level, and moment
direction ranges.
