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

- **Fixed** builds the editable base grid, adds the three fibre pure-tension transition stations
  described in §2.3, and performs no adaptive probes;
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

### 2.3 Pure-tension transition stations and finite endpoint-hardening boundary

The base schedule remains `unified-27-v2`. Between the last selected intermediate criterion and
uniform tension, the fibre route adds explicit transition stations:

- **Adaptive** adds one `tension-pole-transition-ratio` seed at ratio `0.5` along the declared
  strain path. Its ID is `pure-tension-transition-50` and its label is `Pure tens 50%`.
- **Fixed** adds three `tension-transition-edge-strain-ratio` states. In each, the extreme
  compression fibre is at `1`, `2/3` and `1/3`·εcu (IDs `tension-edge-strain-100/67/33`, labels
  `Tens εc/εcu = …`). What else holds the state:
  - without a finite hardening boundary, the controlling bar stays at the pole strain. These are
    the tensile pivot and two states of its rotation towards zero compression;
  - with a finite hardening boundary, the state lies on the steel-limit leg, starting at the joint
    concrete/steel limit. Its curvature is the smallest one whose edge strain reaches the target,
    which is exact for the piecewise-linear boundary.

The default Fixed fibre schedule therefore has 30 station descriptors before any cover-gap
stations.

Why the Fixed states are placed by edge strain rather than by path ratio:

- on the steel-limit leg, curvature-uniform ratios fall almost on the pole, because concrete
  compression ends within a few percent of the joint curvature;
- the zero-compression corner can share the pole's resultant when the bars have yielded and the
  concrete has no stress.

With the edge strain above zero the concrete is still compressed, so the resultant still changes
and a Fixed state cannot collapse onto the tension pole. When the last base station is already
clamped at the joint limit, the `1` state coincides with it. The two later states still sample the
branch, so it is never a single chord (2026-11-09 review item 8).

The ratios are a project sampling choice, not a code requirement or a new material limit. See the
2026-11-05 decision and the
2026-11-18 Fixed transition stations.

With endpoint-defined hardening, the analysis owner resolves the Adaptive 50% seed and the Fixed
edge-strain states from the compatible concrete and per-material steel inequalities. At 50% the
path reaches the joint limit. Without
active hardening, the existing three-leg transition from the last state through its tensile
pivot and zero-compression state to uniform tension is retained. The two laws share a sampling
ratio, not an asserted identical physical strain plane. Their material laws and pole strains do
not change.

Each grade contributes its own tensile support and, when physically bounded, its compression
support. The boundary reaches the joint concrete/steel limit, follows the active steel envelope,
and may change controlling grade before uniform tension. Adaptive refines these physically defined
transition intervals through the same boundary, including the final interval to the pole. Fixed
does not claim a measured interpolation bound from its three transition stations. The legacy unbounded
transition intervals retain their existing exclusion from adaptive probing, with the explicit
50% seed still retained. The adaptive station budget must accommodate the resolved seeds,
including this midpoint; an insufficient budget is typed `INVALID_ANALYSIS_OPTIONS` rather than
silently exceeded. Point coordinates, traces and declared
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
27 base stations (28 resolved fibre stations including the 50% transition)
36 seed directions plus the geometric supplementary rows below
no production midpoint probes or adaptive insertion
```

### 3.1 Fixed geometric supplementary rows

A Fixed full surface adds rows that depend only on the exact section geometry, never on sampled
error. A seed always keeps its exact value; a supplement that coincides with a seed (within
`1e-9` rad) is that seed. An exact single-meridian calculation receives no supplement, and
Adaptive sampling is unchanged. Each result lists the source of every row in `directionSources`
(`seed`, `tension-control-event` or `normalized-gap`), aligned with `directions`.

Runtime vertex identity uses the full stored angle, never its rounded display label. Distinct
retained rows must have distinct point IDs and independently paired Nominal/reference states,
including a geometric event very close to a configured seed (review correction R1).

**Tension-control event rows.** With the gradient `g` and the bar centres `p_i`, the deepest bar
minimises `g . p_i`. It changes exactly when `g` is opposite an outward normal of a convex-hull
edge of the bar centres, and there both the station states (which are referred to the deepest
bar) and the controlling tensile strain have a crease. One row is added at every such direction,
so the rows are bounded by the number of hull edges and therefore by the number of bars. Bridging
the concave crease with a 10-degree chord over-predicted capacity by up to 4.3 % (fibre) and
5.0 % (block) on an asymmetric bar layout; see audit finding F-02 and its
fix record. Concrete-support
switches were checked on a control section and do not reproduce the over-prediction; they add no
row. The geometric rule is owned by `@pm/geometry` (`supportSwitchGradientAngles`); the fibre
route maps it to `beta = pi/2 - theta` and the block route uses the block normal `theta` directly.

### 3.2 Fixed normalized-gap rows

On an elongated section a uniform angular step cuts the section very unevenly: a 10-degree chord
near the weak axis of a 250 x 2500 wall under-predicted capacity by 15.8 % (fibre) and 15.2 %
(block); see audit finding F-03. With the net-concrete area covariance `C` (exact second moments
about the centroid divided by the area, `netConcreteAreaCovariance`) and `S = C^(1/2)`, the
normalized direction of a gradient `g` is `S g / |S g|`. After the seeds and the §3.1 rows, every
gap whose normalized angular width `d` exceeds the mean seed spacing `h = 2 pi / seeds` receives
`ceil(d / h) - 1` rows equally spaced in normalized angle (`normalizedGapGradientAngles`, source
`normalized-gap`). The linear map has a positive determinant and preserves the cyclic order. The
total row count is at most twice the existing rows. A circular or square section adds none.

### 3.3 Fixed cover-gap stations

Between `c/D = 1` (neutral axis on the far concrete edge) and `eps_s/eps_y = 0` (neutral axis on
the controlling bar) the schedule has no state. Where the controlling bar is far from the far edge,
one chord spans that whole gap; on a 500 mm square at its 135-degree diagonal this under-predicted
by 13.0 % (fibre) and 14.4 % (block). With the gap `g_c = (t - min) / D` in `c/D` units, where `t`
is the controlling-bar projection, `min` and `D` are the far-edge projection and the projected
depth, and `h_c` is the schedule's own last outside step (`UNIFIED_DEPTH_RATIOS`: 1.1 to 1, so 0.1),
a Fixed station schedule receives `n = max over rows of ceil(g_c / h_c) - 1` stations at gap ratios
`k / (n + 1)`, `k = 1..n`. They are named `cover-gap-k-of-n`, have the shared definition
`neutral-axis-control-gap-ratio`, and are resolved by each row with its own extents. This applies to
the stress-strain fixed schedule and to the equivalent-block `cover-gap-ratio` stations alike.
The block mesher's depth-ordering proxy for a cover gap is `1 - r * 1e-9`, strictly between the
`eps_s/eps_y = 0` station and `c/D = 1`. A schedule without that adjacent pair, or with every gap
at most `h_c`, is unchanged. An ordinary 60 mm cover on a 500 mm side has a gap of 0.12 and
receives one station. The record and gate are in the
F-03 task packet.

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

Fixed mode does not evaluate hidden midpoint probes. It calculates the selected base grid plus
the explicit fibre transition (28 × 36 by default for fibre, 27 × 36 for block) and the geometric
supplementary rows of §3.1, so changing to Capacity does not pay for a second error-measurement
grid.
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
capacity intersection. The repair packet owns
the differential evidence.

The contour is useful for visualization and for a fixed-P diagnostic. It is built from
`designSurface` or `nominalSurface`. It is not the proportional governing calculation; the separate
`constantAxial` check basis in §9 uses the same Design surface and is verified against this contour.

## 8. P–M at θ (load-direction curve)

Capacity and Demand Check draw the same vertical P–M diagram: the **P–M at θ** curve. In Capacity, θ
is a moment direction the user sets with the θ slider (whole degrees) or the input (any angle); it is
never snapped to the sampled strain directions. In Demand Check, θ is `thetaLoad` of the checked
demand. The fixed strain-direction (β) meridian, its slider and the exact-β calculation were removed
on 2026-11-19: a fixed-β meridian points its moment along one direction at one state only, so no
other point of it lies in any single load plane.

The P–M chart is the **load-direction curve**
of [engineering/05](engineering/05-loadings-analysis-results-and-reports.md) §3: the vertical plane of
`thetaLoad`, horizontal coordinate `Mθ = Mx cos θ + My sin θ` (equal to `M_R` on the forward
branch). The curve is the physical cut of the surface: the geometric cut of the triangulated surface
gives the order, and each crossing is moved along its triangle edge onto the exact physical state
whose moment points along θ. That state comes from Brent's method on the mechanics' own station-state
rule and Design-resistance evaluator (Nominal separately).
- A ring crossing is a station point with its own β.
- A diagonal or meridian crossing is a labelled state between its two stations.
- An edge with no physical family (block pole edges) stays a geometric `interpolated` point and is
  listed as unresolved.
- A block jump across θ is kept at the nearer exact state and reported as a discontinuity.

Poles are the surface's uniform-strain points. The Design curve is cut from the reduced geometry
before any axial cap, then clipped at `Pmax` with the exact affine edge intersection and the cap-face
segment to the axis. The clipped part is drawn as before-cap geometry. A demand with `Mux = Muy = 0` has no `thetaLoad`; the chart then shows that no
load-direction curve exists. Hover and Chart data list the criterion (station, or the two stations
and fraction), β, `P`, `Mθ`, `Mx` and `My`. The triangulated surface cut at `thetaLoad` is not
drawn. Demand Check displays the strength-point `β (N.A.)` of §10 as a read-only value with three
decimals in degrees; the checked load angle is shown beside it.

β and θ remain separate quantities: θ selects the plane, and each point carries the β of its own state.

**Capacity specifics.**
- The ± option also draws θ + 180°, the other half of the same vertical plane, at negative `Mθ`;
  θ then stays within [0°, 180°).
- The 3D view highlights the same curve on the surface.
- While a new θ is being built, the previous complete curve stays on screen, drawn at its own θ, and
  the header reads `Building curve…`.

**Chart data (result panel) and audits.** The P–M rows are the curve points in curve order, with a β
column (one decimal, unit in the header). The panel lists station, pole and cap rows by default; the
`Between` check adds the interpolated states, which keep the curve's row numbers. A between row reads
compactly (`εₛ/εy 0.25→0.375 · 91.8%`), with the full criterion in its tooltip, the Excel export and
Detail. Sampling statistics sit behind a collapsed `Sampling` disclosure.
- A between-stations row carries the station definition that reproduces it (the adaptive
  interpolation of its two stations at its fraction).
- Geometric rows (cap edge, cap axis, zero-moment crossing) carry no strain state.
- The calculation inspector and the formula audit workbook re-derive each row from its own β (a
  per-row β column) and must reproduce the engine values.
- Sum Mx/My contributions before taking a magnitude; individual moment magnitudes do not add.

The curves are not gated by demand-equilibrium convergence.

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
Demand-plane plots use the checked demand direction, including any declared code adjustment. In
Demand P–M, the proportional path runs from the origin through `(Mθ, P)` of the demand, and the
Constant-P path runs horizontally at `Pu`; both lie in the plane of the load-direction curve (§8).
The curve crossing of the selected path is computed on the displayed Design paths and reported as
a diagnostic ratio beside the governing UR: its difference from the governing UR is the
triangulated-surface discretization. Preserve all distinct forward hits; distinguish tangency,
overlap, missing geometry and zero-length paths; ambiguous crossings leave the diagnostic
unavailable. The diagnostic never replaces the governing UR, its interval or its verdict.
Fixed-P retains the actual Pu; a plane outside the axial range has no contour and must not be
silently clamped. The governing UR comes only from the unchanged Design-surface query.

When a maximum axial-resistance cap clips the Design domain, retain the Design dataset before
that cap as separate diagnostic geometry, with its own original topology. Draw only its portion
above the cap in the same colour as the corresponding Design curve. Use dotted lines outside
Demand P–M; Demand P–M uses dash-dot for before-cap paths, with the same explicit exclusion label. This is
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

Demand Check shows the **Field at capacity** of the selected check for every classification and
both mechanics ([engineering/05](engineering/05-loadings-analysis-results-and-reports.md) §3 angle
convention and §5; decision record): the
proportional capacity state on the 3D ray, or the constant-P capacity state at `P = Pu` in the
direction `thetaLoad`. Its β is the β (N.A.) shown by Demand Check and the reports. The displayed
capacity multiplier identifies the boundary state relative to the checked demand and selected check
basis. Classification and NG tint come from the governing check. Missing qualified evidence remains
explicitly unavailable. Indeterminate retains its classification. This supersedes the 2026-11-04
mechanics-specific basis, which showed the equilibrium at the entered demand for non-NG stress-strain
cases; that equilibrium remains a solver diagnostic only.

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
- production surfaces contain exactly the configured fixed station/direction rows plus the §3.1
  supplementary rows, each labelled by `directionSources`.

## 12. Measured sampling evidence

The permanent harnesses hold all 27 stations fixed and compare the production 36-direction grid
against a 144-direction reference. Exact per-case timing, point counts, and ray differences are
printed by the benchmark commands and summarized in `12`.
