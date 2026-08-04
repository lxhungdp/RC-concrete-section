# Loadings, Analysis, Results, and Reports

## 1. Loading terminology and scope

A **load case** is a source action state. A **load combination** is an action vector assembled and
factored for a declared check. The current project model persists
`LoadCombination { id, name, actionBasis: 'factoredULS', P, Mx, My }`; the Results menu therefore
reports one row per combination. If future source load cases
are introduced, each combination retains its component case IDs and factors.

The current web workflow embeds loadcase creation and editing in the Results sidebar. A separate
top-level Loadings menu is intentionally avoided until source-load management grows beyond simple
Pu/Mux/Muy combinations.

Current v1 sign caveat: `LoadCombination.My` carries no convention discriminator and is passed
unchanged to the selected backend. Stress-strain interprets it against `My = +sum(F*x)`; the block
backend produces/checks `My = -sum(F*x)`. Nonzero-`My` block demand remains preview-only until the
two-backend boundary is unified or explicitly transformed.

The accepted-product target is that every demand records:

- stable ID/name and optional source-case trace;
- `P`, `Mx`, `My` in canonical units;
- action basis (`factoredULS`, `service`, or another explicitly supported basis);
- origin, axes/sign convention, and any transformation from the source system;
- combination rule/version and governing design situation where applicable.

Factored ULS combinations and service actions shall not share an untyped table or solver request.
The current schema-v1/UI implements only `factoredULS`; `service` is a future typed extension, not a
currently selectable action basis.

## 2. Loading validation

Before analysis:

- all values are finite and resource limits are satisfied;
- IDs are unique and names are not used as keys;
- demand origin/axes/units match resistance or are transformed explicitly;
- the selected analysis mode accepts the action basis;
- duplicate combinations are reported but not silently merged;
- zero demand is valid and handled explicitly;
- loads outside the declared section-action scope are rejected.

## 3. ULS analysis contract

An analysis request binds an immutable snapshot of:

- normalized geometry and reinforcement;
- validated material definitions;
- exact design basis/profile and method;
- factored load combinations;
- expanded accuracy/resource options;
- engine/schema versions.

The engine builds the nominal/reference surface and the design resistance domain. Adequacy is based
on point location in a closed, oriented, topology-verified design domain. The default utilization is
proportional 3D loading:

`R(λ) = λ(Pu, Mux, Muy)`, `UR = 1 / λcap`.

A fixed-`P` moment ratio may be reported only as a named secondary metric. It is not total
utilization and does not make a pure-axial demand have zero utilization.

For that secondary fixed-axial metric, compute `thetaLoad = atan2(Muy, Mux)`, slice the completed
surface by `P = Pu`, and intersect the resulting `Mx-My` contour with the ray
`Mx = t*cos(thetaLoad), My = t*sin(thetaLoad)`. The boundary value is `Mb = t` and the component
coordinates are `Mbnx = Mb*cos(thetaLoad)`, `Mbny = Mb*sin(thetaLoad)`. This query is geometric; it
must not use the strain-plane sampling angle as a proxy for the demand moment direction.

Classification uses a numerical uncertainty interval and approved margin:

- `adequate` only when the entire interval is below the acceptance boundary;
- `inadequate` only when the entire interval is above the rejection boundary;
- otherwise `indeterminate`.

## 4. Accepted-product Results contract

The current Results workspace implements preview plots, load-combination editing/checks, and
model-specific field views. It does not yet satisfy the immutable accepted-result identity,
uncertainty interval, result history, or release gates required by this section.

The Results module consumes an immutable result DTO; it does not recalculate material factors or
capacity. It provides:

- run status, stale/current state, result ID/hash, timestamp, and engine/profile versions;
- summary of geometry, materials, design basis, units, origin, and exclusions;
- table per load combination: demand, location, utilization interval, classification, governing
  boundary point/state, and warnings;
- nominal/reference and design P-M/P-Mx-My surfaces with explicit mesh connectivity;
- fixed-`P` contours created by slicing the surface triangles;
- vertical `P-Mtheta` demand-direction slices created by intersecting the surface with
  `Mx*sin(thetaLoad) - My*cos(thetaLoad) = 0`;
- selected load path, governing point, failure classification, and controlling strains;
- convergence/error evidence and resolution history;
- diagnostics for invalid, cancelled, non-converged, or preview runs.

Plots shall use the accepted oriented triangle mesh. A convex hull of sampled capacity points is
prohibited because it can show non-capacity regions as valid.

Changing any analysis input makes the displayed result stale. Stale results may be viewed for
comparison but cannot be released as the current report.

## 5. Result package

Every successful engineering result includes:

- complete normalized input snapshot and hash;
- reference frame, canonical/presentation units, and sign convention;
- standard/profile identity, verification state, method, options, and clause traces;
- nominal/reference surface, design surface, applied resistance stages, and topology report;
- per-combination checks and governing states;
- integration, surface, geometry, algebra, and utilization convergence evidence;
- uncertainty interval, classification policy, warnings, and scope statement;
- engine/dependency versions and reproducibility metadata.

Diagnostic partial data is a separate preview type. It cannot satisfy this contract.

## 6. Target report capability

There is no current top-level Report menu. Each mechanics now has its own calculation-result
workbook, the mesh audit exports remain the stress-strain Excel/DXF files under Analysis Options,
and `Demand Check` exports a preview PDF design report. A **released** report — one generated from
an accepted result — remains unimplemented.

The implemented PDF follows the section order below: input (section drawing beside the section,
material and resistance data), section capacity (Nominal and Design interaction diagrams per
published direction), factored ULS demand (one row per combination with its utilization and
verdict), and then a detailed calculation per combination the engineer selected — transverse
section with the neutral axis and compression zone, longitudinal section with the strain and stress
diagrams over the depth, the interaction diagram carrying the load point and the governing
proportional ray, the concrete and resultant ledger, the per-bar ledger, and the solver evidence.
Detail pages are opt-in per combination because which cases are worth working through is an
engineering judgement, not a software default.

Because no accepted-result contract exists yet, every page of that PDF is watermarked `PREVIEW` and
states that it is not an accepted design result, as §"PDF output" below requires.

Reports are generated only from an `acceptedResult`. The report layer formats existing engineering
data and shall not apply a new factor, rounding decision, interpolation, or adequacy rule.

### Common report contents

- project/result identity and integrity hash;
- input section drawing, dimensions, bar schedule, material definitions, and loading table;
- design basis, exact method/profile, applicability, and scope exclusions;
- calculation assumptions and conventions;
- result summary and one table per combination;
- governing surface/contour plots and selected detailed states;
- convergence, uncertainty, warnings, review/approval fields, and software version;
- appendices sufficient to trace result stages without redistributing prohibited normative text.

### Excel output

Excel is a controlled presentation/export artifact. Full-precision engineering values are stored in
data cells; displayed rounding is formatting. If formulas are included, they are versioned,
protected where appropriate, independently tested, and never become an untracked second calculation
engine. A machine-readable sheet records result ID/hash and schema.

### PDF output

PDF is a fixed released representation with page numbering, revision, result identity/hash, units,
warnings, and approval state on appropriate pages. Plot rasterization/vector export shall preserve
labels and governing data without changing values.

`preview` watermarks and blocking warnings are mandatory when a non-accepted artifact is exported
for review. Such an artifact is not a released engineering report.

## 7. Acceptance gates

| ID | Gate |
|---|---|
| `ENG-LOAD-001` | demand basis/origin/units/signs are compatible and traceable |
| `ENG-AN-001` | exact verified profile and supported scenario selected |
| `ENG-AN-002` | integration and surface converge for demand-relevant quantities |
| `ENG-AN-003` | resistance-domain topology and demand query invariants pass |
| `ENG-RES-001` | uncertainty-aware classification and governing-state trace complete |
| `ENG-RES-002` | result is immutable, reproducible, current, and integrity-identified |
| `ENG-REP-001` | report consumes only an accepted result and reproduces DTO values exactly |
| `ENG-REP-002` | Excel/PDF visual and data integrity verification passes |
