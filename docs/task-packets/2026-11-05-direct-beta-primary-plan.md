# Direct-beta primary Demand P-M plot

Status. Implemented Preview; required software/numerical gates passed. The user approved resultant moment magnitude for Direct beta,
an optional dotted theta cut, unchanged governing UR and plotted-data correspondence on 2026-11-05.

## Controlled basis

- Objective. Always display the fixed-neutral-axis Direct-beta curve as the main Demand P-M
  curve. Compute its intersection with the displayed 2D load path. Add the true demand-direction
  surface cut as an independently selectable dotted overlay.
- User decision. Each Direct-beta station uses M_R = hypot(Mx, My). Treat the resulting station
  coordinates as a planar P-M polyline for the requested 2D intersection.
- Requirements. ENG-AN-003, ENG-RES-001/002, ENG-REP-002 and DEV-ARCH-002/006.
- Authorities. Engineering/02 owns coordinates and signs. Engineering/05 owns the selected Design
  check and its interpretation. Root 05 owns the two curve families and plot semantics.
  Development/04 owns execution, coherent frames, chart data and exports. Engineering/06 owns
  change classification and verification.
- Classes. Class 3 for the new numerical 2D query and transient evidence contract, with Class 2
  presentation wiring. A change to governing utilization/classification requires Class 4 review.
- Owners. The existing analysis query package, mechanics-neutral result contracts where needed,
  web view-state/plot adapters and the existing worker execution boundary.
- Scope. Demand P-M presentation and its geometric 2D intersection. Preserve the exact geometry,
  material/profile definitions, independent mechanics, canonical actions and governing check owner.
- Allowed files. Root 05, engineering/05, development/04, control map, analysis geometry helpers
  and their tests, Demand view/chart/Data adapters and browser verification under tools/verification.
- Blocking failures. Non-finite mapped coordinates, missing exact direction, undefined zero-demand
  paths and unresolved overlap remain explicit diagnostics. They never supply an adequacy verdict.
- Exclusions. No mechanics, resistance factors, standards, surface sampling, governing UR,
  classification, persisted project schema or general report ledger change.
- Delivery boundary. This packet records implementation and executable evidence below. Existing
  user changes to spreadsheet, load-reference, field and Data features are retained.

## 1. Two curve families on one chart

### Primary Direct beta

Use the exact direction curve already requested for the displayed field frame. Its physical
stations share the selected strain-gradient beta and therefore the same neutral-axis line
orientation whenever a neutral axis is defined. Neutral-axis depth changes along the stations.

For each stored 3D action point, the canonical 2D coordinate is x = M_R = hypot(Mx, My), y = P.
Retain the source P, Mx, My, beta, station identity, resistance stage and point role.
Preserve original station order and existing path breaks. The main dataset is the existing
one-sided exact-beta curve.

The 2D polyline joins those transformed endpoints. Intersections must use those same straight
2D segments. Interpolating a 3D segment and then taking its magnitude is a different operation.
The query and plot must consume the same canonical 2D point array.

Keep Nominal and Design as independent series. Existing visibility logic already retains at least
one resistance stage. Exact cap crossings and axial-center closure points keep their geometric
roles and never acquire a physical-station label.

Beta follows the currently displayed qualified demand/capacity field as it does today. Where the
physical field has no defined gradient, use the existing explicitly selected inspection beta and
label that source. Expose beta and the existing neutral-axis angle label as distinct quantities.
The overlay checkbox does not change beta.
Split the current mode-dependent activeAngle into explicit beta and demand-theta values in the
Demand pipeline. The station generator consumes beta, the true surface cut consumes theta, and
the displayed load path consumes the resultant demand magnitude. Kernel angles remain radians,
with degrees only at the existing presentation boundary.

### Optional demand-direction cut

The `Load-angle section θ` checkbox is off by default. It adds the
existing geometric slice of the completed 3D surface at the checked centroidal demand angle.
The primary Direct-beta curve stays visible.

Reuse sliceMomentPlane independently on the active Nominal and Design datasets. Retain its
original topology and all geometric intersection vertices. The existing signed M-theta coordinate
can represent the full section loop. On the forward loading half-plane it equals the resultant
moment magnitude. The opposite half-plane retains its negative sign, so the full loop is not
folded onto the positive-M side.

The solid Direct-beta curve and dotted load-angle curve therefore share the same positive-M
loading coordinates. Their station and geometric-vertex counts remain separate.

## 2. Load path and intersections

Use the checked centroidal demand, including the existing declared minimum-eccentricity
adjustment where applicable. Draft/applied load-reference offsets keep their existing conversion
boundary. Let M_d = hypot(Mux, Muy).

| Selected check basis | Displayed path in x=M, y=P |
|---|---|
| Proportional 3D | (lambda M_d, lambda Pu), lambda >= 0 |
| Constant P | (lambda M_d, Pu), lambda >= 0 |

Extend the displayed path through its qualified intersections, including outside-demand cases.
Use separate identities for two distinct intersections.

- **I-beta-2D.** Intersections with the Design Direct-beta polyline after its magnitude mapping.
  Show their plotted coordinates and 2D load multipliers. Retain the source path/segment,
  endpoint identities and 2D interpolation fraction. These identify the flattened 2D construction.
- **I-theta-3D.** The existing governing Design-surface crossing for the selected loading path.
  Map its stored 3D actions to the corresponding P-M coordinates. With the overlay enabled,
  verify that this point lies on the dotted Design cut within the existing geometric criteria.

The implementation keeps the table UR and OK/NG/CHECK with the existing governing check.
I-beta-2D is a separately labelled geometric diagnostic. Its coordinates or multiplier do not
supply a compatible field state. A request to use its ratio as the governing UR would be a
separate change to engineering/05.

The Direct-beta query must operate on open polylines as well as qualified geometric closure
segments. The current Fixed-P radial query assumes a closed contour and qualified transverse
exit, so it cannot be substituted directly. Reuse suitable geometry primitives through the
analysis owner and preserve the different contracts.

Return all distinct forward intersections in path order and provide their multipliers in sorted
order for presentation. Deduplicate a hit shared by adjacent segments. Keep a single transverse
intersection, multiple intersections, tangency, collinear overlap, zero-length demand, missing
curve and invalid arithmetic distinguishable. Multiple or overlapping crossings need explicit
diagnostic presentation before any primary 2D marker is selected.

## 3. Presentation and interaction

Replace the mutually exclusive Demand-theta/Direct-beta radios with the persistent Direct-beta
view and the independent checkbox. Use a plain P-M title with a concise fixed-N.A./Direct-beta
caption. The horizontal axis is labelled M with the selected moment unit.

| Series or point | Proposed representation |
|---|---|
| Direct-beta Design | Solid existing Design colour |
| Direct-beta Nominal | Existing Nominal/reference colour and stage distinction |
| Load-angle section | Dotted line in its corresponding resistance-stage colour |
| I-beta-2D | Distinct hollow marker labelled as a 2D Direct-beta intersection |
| I-theta-3D | Existing governing-crossing marker, identified with the dotted overlay |
| Excluded pre-Pmax part | Separate dash-dot convention and explicit before-Pmax label |

The current pre-Pmax overlay also uses dots. Within Demand P-M, reserve dots for the new
load-angle layer and update the pre-Pmax style and caption through root 05 and the web adapter.
This style choice is scoped to this chart. Preserve the existing permitted-domain geometry and
explicit before-cap field evidence.

Show the true crossing with its overlay so the marker and dotted curve form one readable layer.
Keep the existing governing check available in the table/summary when that layer is hidden.
Avoid placing the governing UR beside an unlabeled 2D diagnostic marker.

Keep the chart shell keyed by workspace and chart role, preserving the navigation repair.
Re-fit the viewport when the displayed coordinate frame, units or layer visibility changes.
Theme-only updates retain the current viewport. Layer toggles must not create an apparently
empty plot through inherited axis ranges.

The same completed frame owns beta, field state, both curve families, demand and crossings.
During a loadcase change, retain the existing explicitly labelled outgoing frame until its
replacement is coherent. Field unavailability still permits qualified curve inspection.

## 4. Data and export correspondence

The Data modal continues to read the actual plotted traces. Separate the solid Direct-beta
Nominal/Design tables, dotted load-angle tables, load paths and intersection markers.

Add point-role metadata to the new trace construction so Data can distinguish a physical station,
cap-edge crossing, axial-center closure, surface-cut vertex and 2D diagnostic crossing.
Carry the original Mx/My, selected beta/theta and the adopted M-coordinate definition.
Use distinct coordinate-row and physical-station counts. Preserve every drawn coordinate,
source order, closing point and disconnected path.

Copy all and Save as capture the same immutable text snapshot. They start no analysis request.
General PDF/Excel result contracts keep their governing check semantics. Inspect affected
chart/audit export callers for angle or curve-family assumptions during implementation.

## 5. Implementation sequence

1. **Owner contract first.** Update root 05 sections 8–10 for the primary magnitude-mapped
   Direct-beta curve, optional plane cut, two labelled intersections and pre-cap line style.
   Append the 2D diagnostic distinction to engineering/05. Update development/04 and the control
   map where its existing plot-default description applies.
2. **Pure canonical geometry.** Add the Direct-beta magnitude mapping and bounded 2D load-path
   intersection query in the existing analysis owner. Preserve source identifiers and separate
   numerical failures/ambiguities. Share the common result contract across both mechanics while
   retaining their independent state evaluation.
3. **Frame assembly.** Reuse exact-beta results and active surface datasets. Build the direct 2D
   array once and use it for both intersection and drawing. Derive the optional dotted layer
   from the existing surface slice. Avoid another surface build on a layer toggle.
4. **View state and chart wiring.** Replace the internal verticalMode choice with an independent
   overlay flag defaulting to false. Update all callers and tests. This is transient view state.
   Canonical project JSON remains at its existing schema.
5. **Evidence presentation.** Wire distinct markers, labels, counts, Data tables and relevant
   chart/audit exporters. Retain the centroid C/load-origin O overlay behavior.
6. **Verification and review.** Run the numerical and UI gates below, inspect both curve families
   on asymmetric examples and record exact data-to-render comparisons before release of the slice.

## 6. Verification and acceptance

### Independent numerical oracles

- A geometric fixture with A=(P=10,Mx=0,My=0), B=(P=0,Mx=6,My=8) maps to the 2D line
  x+y=10. Demand (P=2,Mx=3,My=0) gives lambda=2 and the plotted crossing (M=6,P=4).
  The corresponding point on the original 3D edge differs from lambda times the demand.
  This catches accidental promotion of the flattened crossing to the real 3D ray crossing.
- Analytic polyline cases for vertex hits, path breaks, repeated closure points, open curves,
  multiple crossings, tangent contact, collinear overlap and zero demand.
- For the true plane cut, the stored 3D crossing mapped into P-M must agree with the selected
  surface-slice/load-path crossing. Test both proportional and constant-P bases.
- With one fixed exact-beta dataset, changing theta alone leaves all Direct-beta magnitude
  coordinates identical. The optional surface-cut coordinates can change with theta.
- Test both symmetric and asymmetric sections. Equality between the direct and true-section
  crossings is valid in special cases and must remain visible without artificial separation.

### Regression matrix

- All registered profiles/resistance routes in Fixed and Adaptive, both mechanics and bases.
- Inside, boundary and outside demands, positive/negative/pure axial force, zero moment,
  mixed-sign moments, declared hardening and unavailable physical-field evidence.
- Exact station and point-role counts, cap edges and excluded pre-Pmax portions.
- Governing surface, stored 3D/constant-P crossing, UR, interval and classification invariance
  under overlay toggles and presentation-unit changes.
- Metric/US data-to-plot equality for both line families and both intersection identities.
- First-example Demand -> Capacity -> Demand, repeated layer toggles, rapid loadcase switches,
  delayed/failed curve requests, both themes and a narrow viewport.

Run structure, documentation, traceability, typecheck, focused owner tests, full npm test,
production build and the existing bundle gate. Because this slice adds a numerical query,
include the applicable portable capacity fingerprint, strain-sampling, equivalent-block and
cross-model pipeline gates. Keep the existing numerical baselines and tolerances.

Acceptance requires that the default plot always contains its available Direct-beta series,
the checkbox adds the dotted true plane cut, both intersections follow their declared source,
and every Data coordinate matches the curve or marker actually rendered.

## 7. Implementation and evidence

- Root 05, engineering/05 and development/04 now own the approved behavior. The control map
  and verification matrix identify the new geometry owner and executable oracles.
- `@pm/analysis` exports `buildDemandPmGeometry`, `resultantMomentCoordinate` and
  `intersectPmLoadPath`. The new query is a geometric diagnostic and never enters the governing
  check pipeline. Both mechanics retain their independent capacity generation and field evaluation.
- `demand-pm-chart.ts` formats canonical paths and labelled crossings for Plotly. The transient
  view flag replaces the former exclusive mode. Data reads the rendered traces, including
  source components, angle definitions, point roles and separate station/coordinate counts.
  Intersection source indices explicitly refer to zero-based Design direct paths/segments.
- No canonical project schema, resistance formula, governing UR, uncertainty, classification or
  general PDF/Excel ledger changed. Accepted-result immutability (ENG-RES-002) remains open.
- Analytical query tests cover the independent x+y=10 construction, distinct 2D/3D points,
  Constant P, tangency, shared vertices, multiple hits, overlap, disconnected paths, scaling,
  zero paths, missing curves and non-finite arithmetic.
- The focused suite passed 40 tests. Its 30 profile/route/sampling scenarios cover all registered
  profiles, KDS resistance routes and declared hardening fixtures, with both check bases,
  inside/outside loads and Metric/US presentation. Plane-cut queries reproduce stored governing
  crossings at the existing normalized geometry criteria; theta changes leave Direct-beta data
  unchanged when the exact-beta dataset is held fixed.
- Final production browser evidence is under ignored `outputs/direct-beta-plot-final`,
  `outputs/direct-beta-data-final` and `outputs/direct-beta-navigation-final`. First-example Direct beta
  has 27 Nominal and 23 Design coordinates (21 physical Design stations, one cap crossing and
  one axial-center closure). Enabling theta adds 97 Nominal and 126 Design cut coordinates.
  Every exported coordinate matches its rendered SVG path/marker. No analysis job or table UR
  changes during the toggle/Data checks. Eight populated Data/copy/UTF-8-save scenarios pass
  across both mechanics. Eighteen navigation round trips pass across both bases/layer states,
  light/dark and a 390px viewport, with no browser/worker errors.
- Numerical gates passed strain sampling, equivalent block and cross-model pipelines. The
  permanent capacity fingerprint passes portable comparison on the installed reference
  Node 24.20.0/npm 11.19.0. It retains the existing allowance: 17 cross-platform resultant
  roundoff deviations, worst section-normalized delta 4.957e-17, with no baseline/tolerance edit.
  The ordinary development runtime is Node 24.22.1/npm 11.19.1.
- Initial sandbox attempts could not build a Next.js output directory or launch/reach Edge.
  The production build and browser gates subsequently ran in the authorized host environment.
  The user's development server was retained; a separate production server used port 3106.
- Final `npm test` passed, including structure, documentation, requirement traceability, typecheck,
  674 unit tests, 5 ADSEC tests, CAD tests, project round trips and both mechanics' workbook,
  demand-check and PDF gates. Final production build `GAPm1PvtxuZcsWlLmG42a` and the unchanged
  bundle budgets passed. Initial JavaScript is 353.6 KiB gzip against 375.0 KiB; Plotly,
  analysis-worker and Excel chunks also remain within their existing budgets.
- The final browser rerun passed all point/SVG/Data comparisons, 8 Data/copy/save scenarios and
  18 menu round trips. Light/dark and narrow screenshots were inspected. Final logs use the
  `outputs/direct-beta-*-final.log` names. No source baseline, tolerance or dependency changed.
- All evidence remains Preview verification. No design-code profile, accepted result or released
  report is promoted, and independent release review remains outstanding.
