# P-M-M Surface Sampling, Slices, and Plot Semantics

Both mechanics use one station definition, `unified-27-v2`. Current model formulas and complete
defaults are summarized in
[`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md).

## 1. A surface is a sampled engineering object

A P-M-M surface is built from two independent coordinates:

- a state coordinate, which moves from uniform compression through flexure to uniform tension;
- a direction coordinate, which rotates the strain gradient or compression-block normal through
  360 degrees.

Both coordinates are persisted inputs. A calculation selects exactly one independent mode:

- **Fixed** builds the editable 27-by-36 grid and performs no adaptive probes;
- **Adaptive** starts from its declared fixed criteria/directions, refines each meridian's station
  schedule independently, and refines directions from the common angular seeds.

The result exposes the selected mode as `designSurface` and `nominalSurface`. Deprecated
`designFixed`/`nominalFixed` fields are compatibility aliases to those same objects; they do not
trigger a hidden second fixed calculation.

## 2. Shared 27-station coordinate

The ordered schedule from compression to tension is:

```text
P0       exact uniform-compression pole
P1..P6   c/D = 3, 2, 1.5, 1.2, 1.1, 1
P7..P25  εₛ/εy = 0, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75,
          2, 2.5, 3, 4, 5, 7.5, 10, 20
P26      exact uniform-tension pole
```

`D` is the projected total section depth in the active direction. `εₛ` is the tensile-strain
magnitude of the controlling longitudinal bar and `εy` is that bar material's yield strain. The
outside/on-section branch is therefore geometry-normalized; the inside-section branch is
material-normalized. The schedule is owned once by `@pm/stations` and persisted as
`unified-27-v2` in both analysis DTOs.

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
numerically collapses onto a pole is retained in the public 27-station metadata but omitted from the
triangulation to prevent degenerate triangles. No code transition, rupture-event, or adaptive
station is inserted automatically.

## 3. Direction semantics and defaults

For the stress-strain model, `beta` is the direction of increasing compression strain:

```text
kx = kappa cos(beta)
ky = kappa sin(beta)
```

The neutral-axis line is perpendicular to that gradient. The demand angle is calculated from
`(Mx,My)` in result space and is not interchangeable with either line angle.

Fixed default shared by both mechanics:

```text
36 uniform seed directions (10-degree spacing)
27 fixed stations
36 fixed directions
no production midpoint probes or adaptive insertion
```

Adaptive mode instead owns its refined station set per meridian. Rows with unequal station counts
are connected by explicit geometry/topology using their monotone state coordinates; station array
indices across two directions are never treated as physical correspondence.

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

## 5. Independent Fixed and Adaptive modes

Fixed mode does not evaluate hidden midpoint probes. It calculates only the 27 × 36 requested
states, so changing to Section Results does not pay for a second error-measurement grid.

Adaptive mode is a separate calculation, not an overlay on Fixed. It measures true midpoint states
against chords and inserts station or direction midpoints only when the error exceeds tolerance.
Each meridian is retained after it converges; inserting a station in one meridian does not rebuild
or index-pair every other meridian. ULS checks and plots consume all points and the explicit
triangulation of the selected mode.

## 6. Dataset ownership

Every result distinguishes these datasets:

- `designSurface`: active Design surface for the selected Fixed or Adaptive mode;
- `nominalSurface`: active nominal/reference surface, whose independently adaptive station
  topology may differ from Design;
- `points` and `nominalPoints`: compatibility top-level arrays for those active datasets;
- `designFixed` and `nominalFixed`: deprecated aliases to the active datasets, retained for old
  persisted/report consumers only;
- `exactDirection`: a newly evaluated direct meridian for a typed angle or a valid solved demand
  state; it uses the selected mode's station policy and no angular interpolation.

The 3D display and fixed-P interpolation use the active dataset. A fixed-P diagnostic interpolates
actual `P` on its authoritative triangulation, never by station index.

## 7. Fixed-P contour

A fixed-P plot is the geometric intersection of the triangulated surface with the plane
`P = Ptarget`. Each intersected triangle contributes a line segment; segments are welded into
ordered closed paths. Plot markers are elements of those same paths, not results from a parallel
interpolator.

The contour is useful for visualization and for a secondary fixed-P diagnostic. It is built from
`designSurface` or `nominalSurface`; it is not the governing utilization calculation.

## 8. Direct vertical meridian and exact angles

The overview slider stops only at the 36 fixed directions (0, 10, 20 degrees, and so on) and shows
the directly calculated meridian at that beta. It is not a vertical plane cut and does not select a
nearby adaptive direction. Typing an arbitrary angle explicitly launches a new exact-direction
calculation; there is no angular interpolation.

For a valid demand inverse, beta is recovered from the exact strain gradient and the same exact
direction calculation is run again for the demand chart. Uniform-strain, axial-cap, failed, or
inadmissible states have no unique neutral-axis direction and must not invent one.

## 9. Governing factored-demand check

Demand combinations are explicitly `factoredULS`. The governing check intersects the Design
surface with the proportional ray

```text
lambda (Pu, Mux, Muy), lambda >= 0
```

and reports utilization from the boundary intersection. Nominal capacity, Design capacity, and
factored Demand remain distinct in the UI and report. No chart is allowed to relabel Nominal as
Design or apply a resistance factor to factored Demand.

## 10. Field display

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

## 11. Plot acceptance checks

- all final sampled directions are present exactly once in each eligible contour;
- fixed-P contains only fixed-grid intersections and exact vertical curves contain only their
  requested beta;
- pure compression and pure tension are direction independent;
- triangle topology is closed before and after an axial cap;
- fixed-P contour points satisfy the requested P within numerical tolerance;
- principal-axis and quadrant angle tests pass;
- changing only display units does not rebuild engineering states;
- production surfaces contain exactly the configured fixed station/direction rows.

## 12. Measured sampling evidence

The permanent harnesses hold all 27 stations fixed and compare the production 36-direction grid
against a 144-direction reference. Exact per-case timing, point counts, and ray differences are
printed by the benchmark commands and summarized in `12`.
