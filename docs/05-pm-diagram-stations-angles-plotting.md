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

- **Fixed** builds the editable base grid, with the declared finite-steel transition layers when
  applicable, and performs no adaptive probes;
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

### 2.3 Finite endpoint-hardening boundary

The base schedule remains `unified-27-v2`. When an active grade uses endpoint-defined immediate
hardening, the fibre route supplements the selected schedule with seven explicit transition ratios
`0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875` before uniform tension. The analysis owner resolves
them from the compatible concrete and per-material steel inequalities. They are material-domain
layers, not resistance-factor events or new ductility defaults. A default fixed hardening surface
therefore reports 34 station descriptors. Unused grade definitions do not activate the extension.

Each grade contributes its own tensile support and, when physically bounded, its compression
support. The boundary reaches the joint concrete/steel limit, follows the active steel envelope,
and may change controlling grade before uniform tension. Adaptive refines these physically defined
transition intervals through the same boundary, including the final interval to the pole. The
legacy unbounded pole edge retains its existing treatment. Point coordinates, traces and declared
counts come from the resolved result, never a consumer's assumption of 27 rows.

The block route retains its independent fixed-extreme-compression-strain mechanics, clamps depths
to every active tensile bound, and checks signed material admissibility. A project physical steel
compression limit below that block's extreme strain is a typed unsupported material combination;
the fibre route can construct that compression boundary. Unresolved block tension-pole intervals
cannot be labelled converged by increasing display density.

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

The finite endpoint-hardening domain has no measured Fixed uncertainty bound; its Fixed check uses
the project's 2% screening margin. Adaptive must converge its direction and station estimates; those
estimates are not a universal certified capacity error.

Fixed mode does not evaluate hidden midpoint probes. It calculates only the 27 × 36 requested
states, so changing to Capacity does not pay for a second error-measurement grid.
These counts describe physical states before geometric clipping. Applying Pmax retains the
original permitted points and introduces exact geometric edge intersections, so the clipped
Design vertex count and per-meridian point count need not equal the physical station count.
Fixed demand checks use the 2% screening margin owned by `@pm/results`; cases whose resulting UR
interval crosses 1.0 are visibly `indeterminate`, not silently passed or failed. The margin is
measured only for stress-strain proportional checks; [engineering/05](engineering/05-loadings-analysis-results-and-reports.md)
§4 records the project decision for every other Fixed check. A consumer must not derive a verdict
from raw UR.

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

The transient contour retains path identity and closure on each point. Adjacency follows shared
surface-edge/vertex identities, including coplanar patch perimeters. Separate components are
rendered separately. An open or branched component cannot qualify a radial capacity query.
Physical-station subsets are audit markers and cannot replace the complete segment chain in a
capacity intersection. The [repair packet](task-packets/2026-11-04-fixed-p-adaptive-repair.md) owns
the differential evidence.

The contour is useful for visualization and for a fixed-P diagnostic. It is built from
`designSurface` or `nominalSurface`. It is not the proportional governing calculation; the separate
`constantAxial` check basis in §9 uses the same Design surface and is verified against this contour.

## 8. Direct vertical meridian and exact angles

The overview slider stops only at the 36 fixed directions (0, 10, 20 degrees, and so on) and shows
the directly calculated meridian at that beta. It is not a vertical plane cut and does not select a
nearby adaptive direction. Typing an arbitrary angle explicitly launches a new exact-direction
calculation; there is no angular interpolation.

For a valid demand inverse, beta is recovered from the exact strain gradient and the same exact
direction calculation can inspect that physical state. Demand Check defaults to the geometric
demand-moment-plane slice and separately offers Direct beta at the selected demand/capacity field angle.
Neither curve is gated by demand-equilibrium convergence. A direction without a unique physical
strain gradient remains an explicitly selected inspection angle, not an inferred neutral axis.

## 9. Governing factored-demand check

Demand combinations are explicitly `factoredULS`. The governing check intersects the Design
surface with the proportional ray

```text
lambda (Pu, Mux, Muy), lambda >= 0
```

and reports utilization from the boundary intersection. Nominal capacity, Design capacity, and
factored Demand remain distinct in the UI and report. No chart is allowed to relabel Nominal as
Design or apply a resistance factor to factored Demand.

That proportional ray is the default check basis. With `checkBasis = 'constantAxial'` the load path
is instead the horizontal line `(Pu, t cos(thetaLoad), t sin(thetaLoad))`, `t >= 0`, from the
`Pu` axis through the demand. Vertical charts draw that path horizontally at `Pu`, through the
stored capacity point. The cap never governs this ray, because a cap face is parallel to it. A demand
with `Pu` beyond the axial range has no crossing and shows no capacity point.

The origin-to-demand ray and stored governing crossing remain visible for outside demands.
Demand-plane plots use the checked demand direction, including any declared code adjustment;
Direct beta is a separate view and any load-path projection there is labelled as a projection.
Fixed-P retains the actual Pu; a plane outside the axial range has no contour and must not be
silently clamped. The governing UR still comes only from the unchanged Design-surface query.

When a maximum axial-resistance cap clips the Design domain, retain the Design dataset before
that cap as separate diagnostic geometry, with its own original topology. Draw only its portion
above the cap as dotted lines in the same colour as the corresponding Design curve. This is
already reduced Design resistance before the axial-domain operation, not Nominal resistance.
The capped domain is the intersection of that same pre-cap domain with `P <= Pmax`. For every
straddling source edge A-B, calculate `t = (Pmax - PA)/(PB - PA)` and retain the exact linear
intersection `(Pmax, MA + t(MB - MA))`. Keep every vertex and side-face portion below Pmax
unchanged, insert the edge crossings into the topology, and close the actual cap boundary. Do
not redistribute moments radially by station index. Synthetic cap vertices are geometric points,
not additional physical strain stations. The solid and dotted curves must share their cut endpoint.
When a plane-cut graph welds nearby numerical nodes, an exact stored cap-plane intersection takes
precedence over a nearby side-edge interpolation; welding must not move the cut below Pmax.
The previous radial-fill cap algorithm violated this invariant near the cut; its correction is
recorded in [development/15](development/15-exact-axial-cap-intersections.md). It can change
governing results in the previously distorted band; it does not change the Pmax value or physical
pre-cap states. A Fixed-P
plane above the cap can show an uncapped dotted contour only when that plane intersects the
retained pre-cap geometry; it still has no permitted Design contour. No sampling, extrapolation or
new governing resistance is introduced by this overlay.

### Load-input origin

The applied load origin changes only the input-reference adapter specified by engineering/02 §2.
Direct meridians, Fixed-P contours, demand-direction planes, 3D surfaces, governing intersections
and their displayed demand vectors remain centroidal. Never shear/translate those capacity datasets
for the input offset. A draft can preview the LOAD axes on the section drawing while the physical
strain plane and epsilon-zero neutral axis remain evaluated in the centroidal frame. Apply and
Convert semantics are recorded in development/16.

## 10. Field display

Demand Check selects its field by mechanics and the governing Design classification.
Stress-strain uses **Field at demand** for OK and other non-NG cases with qualified equilibrium
at the checked entered demand; NG uses **Field at capacity**. Equivalent block uses
**Field at capacity** for every checked classification because its inverse supplies a capacity
state. The displayed capacity multiplier identifies the boundary state relative to the checked
demand and selected check basis. Classification and NG tint come from the governing check.
Missing qualified evidence remains explicitly unavailable without substituting the other basis.
Indeterminate retains its classification. This user clarification supersedes the earlier all-case
capacity display decision. See the [task packet](task-packets/2026-11-04-mechanics-specific-field-basis.md).

The capacity field requires an admissible compatible state whose independently evaluated Design
resultants follow the selected check path. Proportional checks scale all three checked actions;
constant-P checks hold the checked axial force and scale its moments. A faceted ray intersection is
a seed, not a physical field.
Stress-strain refines beta, the existing compatible station coordinate, and a positive load factor
with bounded damped Newton; it reuses the same station-state and Design-resistance evaluators as
the surface. At the final finite-state-to-tension-pole chord, a declared steel rupture limit uses
the existing compatible tension-pole transition and must actually reach that material limit when
concrete no longer governs. With no declared rupture limit, the diagnostic instead continues the
existing concrete-limit neutral-axis-depth branch toward zero depth; an assumed pole strain must
not become an invented steel limit. It never assigns interpolated facet strains to a physical
field. This diagnostic adds no production sampling stations and claims no unique tensile strain
path. Equivalent block reuses its existing converged physical capacity-ray state. The
refined physical point and multiplier remain diagnostic evidence and do not replace the faceted
governing crossing, UR, interval, or verdict. Stress fields follow the existing constitutive laws
at that compatible state; global resultant factors are not applied to constitutive stress twice.
If the governing crossing is on the axial-cap face, continue the same checked three-component
proportional ray to the retained Design boundary before the cap and refine that physical state
using the same mechanics. The field may exceed Pmax and must carry explicit before-cap evidence,
the cap limit, the label **Field at capacity — before Pmax cap**, and a visible explanation that
it exceeds permitted Design resistance. Mark the field point separately from the unchanged
governing crossing. A near-cap refined physical state that exceeds the cap receives the same
qualification. Never use an interpolated/projected cap-face strain plane, select an arbitrary
point along the excluded curve, remove the cap from the governing check, or substitute Nominal.
Zero demand, missing pre-cap evidence, unresolved refinement and inadmissibility return typed
unavailable-field evidence. Geometry and demand plots remain available without fabricated strains.

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
