# P-M-M Surface Sampling, Slices, and Plot Semantics

Both mechanics use one station definition, `unified-22-v1`. Current model formulas and complete
defaults are summarized in
[`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md).

## 1. A surface is a sampled engineering object

A P-M-M surface is built from two independent coordinates:

- a state coordinate, which moves from uniform compression through flexure to uniform tension;
- a direction coordinate, which rotates the strain gradient or compression-block normal through
  360 degrees.

Both coordinates are persisted inputs. The returned result records the effective station list,
effective direction list, interpolation estimate, refinement passes, and warnings. UI plotting must
use the returned samples; it must not recreate an assumed fixed grid.

## 2. Shared 22-station coordinate

The ordered schedule from compression to tension is:

```text
P0       exact uniform-compression pole
P1..P6   c/D = 3, 2, 1.5, 1.2, 1.1, 1
P7..P20  εₛ/εy = 0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 20
P21      exact uniform-tension pole
```

`D` is the projected total section depth in the active direction. `εₛ` is the tensile-strain
magnitude of the controlling longitudinal bar and `εy` is that bar material's yield strain. The
outside/on-section branch is therefore geometry-normalized; the inside-section branch is
material-normalized. The schedule is owned once by `@pm/stations` and persisted as
`unified-22-v1` in both analysis DTOs.

### 2.1 Stress-strain integration

The compatible strain plane is

```text
eps(x,y) = eps0 + kx (y-y0) + ky (x-x0)
```

The strain-domain solver constructs the compatible strain plane that satisfies each shared
criterion. `UNIFIED_STATIONS` is the derived runtime form used by preview helpers and reports.

### 2.2 Equivalent rectangular stress block

The block solver converts every shared criterion to physical neutral-axis depth `c`, then applies
the selected code adapter's `a = beta1 c`, block stress, and compression-strain limit. A layer that
numerically collapses onto a pole is retained in the public 22-station metadata but omitted from the
triangulation to prevent degenerate triangles. The default performs no station refinement and adds
no automatic transition or rupture-event station.

## 3. Direction semantics and defaults

For the stress-strain model, `beta` is the direction of increasing compression strain:

```text
kx = kappa cos(beta)
ky = kappa sin(beta)
```

The neutral-axis line is perpendicular to that gradient. The demand angle is calculated from
`(Mx,My)` in result space and is not interchangeable with either line angle.

Stress-strain production default:

```text
36 uniform seed directions (10-degree spacing)
adaptive midpoint refinement over all stations
relative tolerance 0.005; max passes 6; max directions 360
```

Equivalent-block production default:

```text
24 uniform seed directions
adaptive midpoint refinement
relative tolerance 0.0075; max passes 6; max directions 360
```

These are direction controls only; both models still return the same 22 station definitions.

The final direction count is therefore geometry-dependent. In the 2026-08-04 stress-strain
benchmark it ranged from 56 to 100 for the five measured fixtures.

## 4. Surface topology

Uniform-compression and uniform-tension poles are single physical vertices. Intermediate rows are
closed cyclic rings. Triangles connect adjacent directions and adjacent stations; degenerate
duplicates are omitted without opening the topology.

Every returned point carries at least:

```text
station ID and order
beta and compatible state
P, Mx, My
concrete, steel, and displaced-concrete ledger
Nominal/Design resistance evidence where applicable
```

Equivalent-block points additionally carry `c`, `a`, `beta1`, block polygon, controlling tensile
strain, and adapter provenance.

## 5. Adaptive direction test

For an adjacent pair of sampled directions, the engine evaluates the true midpoint state and
compares it with the chord used by the triangulation. A midpoint is inserted when the normalized
resultant error exceeds the configured tolerance. The process stops only when all probes pass or a
configured pass/direction cap is reached.

The stress-strain default probes every station. An empty explicit probe list means “measurement not
taken” and reports `NaN`; it must never be displayed as zero error. A fixed grid can report a finite
estimate but does not refine itself.

## 6. Fixed-P contour

A fixed-P plot is the geometric intersection of the triangulated surface with the plane
`P = Ptarget`. Each intersected triangle contributes a line segment; segments are welded into
ordered closed paths. Plot markers are elements of those same paths, not results from a parallel
interpolator.

The contour is useful for visualization and for a secondary fixed-P diagnostic. It is not the
governing utilization calculation.

## 7. Governing factored-demand check

Demand combinations are explicitly `factoredULS`. The governing check intersects the Design
surface with the proportional ray

```text
lambda (Pu, Mux, Muy), lambda >= 0
```

and reports utilization from the boundary intersection. Nominal capacity, Design capacity, and
factored Demand remain distinct in the UI and report. No chart is allowed to relabel Nominal as
Design or apply a resistance factor to factored Demand.

## 8. Field display

Stress-strain model:

- strain is shown across the full section;
- concrete and steel stresses are shown where their material integrations are evaluated.

Equivalent-block model:

- compatible strain is shown across the full section;
- concrete stress is constant only in the clipped depth `0 <= d <= a` and zero outside it;
- the UI shows neutral-axis depth `c`, block depth `a`, `beta1`, block angle, block polygon, steel
  strain/stress, and the complete resultant ledger.

Drawing concrete block stress over the full compression depth `c`, or smoothing it into a
stress-strain curve, would misrepresent the method and is prohibited.

## 9. Plot acceptance checks

- all final sampled directions are present exactly once in each eligible contour;
- pure compression and pure tension are direction independent;
- triangle topology is closed before and after an axial cap;
- fixed-P contour points satisfy the requested P within numerical tolerance;
- principal-axis and quadrant angle tests pass;
- changing only display units does not rebuild engineering states;
- a result that misses its configured refinement tolerance carries a visible warning and cannot be
  promoted to an accepted result.

## 10. Measured sampling evidence

The permanent harnesses hold all 22 stations fixed and compare direction policies against a
144-direction reference. In the 2026-08-06 five-section run, the adaptive worst ray errors were
0.317% for stress-strain and 0.575% for equivalent block; every tested ray intersected the surface.
Exact per-case timing and point counts are printed by the benchmark commands and summarized in `12`.
