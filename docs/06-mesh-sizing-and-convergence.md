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

### 4.1 Measured discretization error of the current seed rule

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

After the surface passes its local chord test, recompute demand utilization with one additional
targeted refinement around the intersected triangles. The utilization difference must satisfy
`tolUtilization`.

The intersected triangles are found by the demand ray or demand-direction plane, not by locating the
nearest strain-plane sample angle. A regression that passes only when `thetaLoad` equals a sampled
strain angle is under-tested.

### 5.1 Measured direction-sampling error, and what it costs

`PreviewSurface.directionError` now reports the β chord error of the grid it actually returned. The
engine evaluates the true state halfway between two sampled directions and compares it with the
chord the triangulation uses there. It is a sampled estimate over four probe stations, not a bound
(§11); measured against a full 19-station sweep it recovered at worst 92% and on average 97% of the
true worst, for about 21% of a surface build.

Those four probes are the verified default profile only and are persisted by stable station ID.
After a user changes the schedule, the UI initializes adaptive refinement with `probe: "all"` so a
legacy index set cannot silently stand in for the new path. An explicit empty ID list disables the
estimate and returns `NaN`, never a misleading zero.

At the default fixed grid of 24 directions:

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

The capacity change is **always positive**. Chord interpolation across a convex fixed-P contour cuts
the corner, so the 24-direction grid systematically under-reports capacity — conservative, but by an
amount nobody had measured. Per-station sweeps show the error rising with station index: the poles
`P0` and `P18` are direction independent and score exactly zero, while the deep-tension stations peak
near 16%.

Refinement is available through `SurfaceRefinementOptions` and is **off by default**, so no result
moves unless it is asked for. Turning it on is an engineering decision — it makes the reported
capacity less conservative — and it must be recorded with the result, not enabled globally.

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

## 8. Analysis options and result

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

Run refinement in a worker with progress stages and cancellation. Cancellation returns `CANCELLED`,
not a partially accepted result.

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
