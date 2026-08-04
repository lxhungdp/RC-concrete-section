# P-M-M Surface Sampling, Slices, and Plot Semantics

The filename is retained so existing links remain stable. The production default is no longer the
historical 19-point/24-direction grid. Current model formulas and complete defaults are summarized in
[`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md).

## 1. A surface is a sampled engineering object

A P-M-M surface is built from two independent coordinates:

- a state coordinate, which moves from uniform compression through flexure to uniform tension;
- a direction coordinate, which rotates the strain gradient or compression-block normal through
  360 degrees.

Both coordinates are persisted inputs. The returned result records the effective station list,
effective direction list, interpolation estimate, refinement passes, and warnings. UI plotting must
use the returned samples; it must not recreate an assumed fixed grid.

## 2. Model-specific station coordinates

### 2.1 Stress-strain integration

The compatible strain plane is

```text
eps(x,y) = eps0 + kx (y-y0) + ky (x-x0)
```

The default contains 25 stations, `P0...P24`. It includes nine mandatory strength-reduction
transition nodes: yield at `0/8` and eight additional fractions through `8/8`. Their physical
strains are resolved from the selected KDS or ACI resistance rule and the controlling steel grade.

The remaining landmarks cover neutral-axis depth, pre-yield steel stress, post-transition tension,
deep tension, and the two exact uniform-strain poles. See `12` section 2.1 for the authoritative
schedule.

The legacy `PREVIEW_STATIONS` constant remains only for the imported workbook regression fixture.
It is a deliberately named 19-station compatibility oracle and is not the project default.

### 2.2 Equivalent rectangular stress block

The state coordinate is physical neutral-axis depth `c`, represented by extreme-tension-strain or
`c/D` landmarks. The code adapter supplies `a = beta1 c`, constant block stress, and the extreme
compression strain. The default starts with 37 neutral-axis states plus two exact poles and refines
stations independently to a 0.75% chord target. The code adapter also inserts nine yield-to-phi
transition events at the controlling longitudinal bar in every direction, plus a declared steel
rupture event. These events are not approximated from the concrete tension edge.

The two station systems must not be merged. A stress-strain station does not define a rectangular
block, and a block `c/D` sample does not define a concrete stress-strain integration state.

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

The permanent harness is `npm run bench:strain-sampling`. Against a 144-direction,
33-transition-node reference, the five-fixture worst 3D ray errors were:

| Sampling | Worst error |
|---|---:|
| legacy 19 x 24 fixed | 7.800% |
| 25 x 36 fixed | 1.791% |
| production 25 x 36 seed plus adaptive | **0.521%** |

The production configuration reached its angular tolerance for all five cases and found every test
ray intersection. Exact per-case timing and point counts are recorded in `12` and reproduced by the
benchmark command.
