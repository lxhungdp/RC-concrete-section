# Loadings, Analysis, Results, and Report Pipelines

## 1. Loadings package

The current `LoadingsInput` with `combinations[]` is a valid minimal persistence seed. Extract its
business logic from `@pm/project` when loadcase validation, source-load provenance, or import/edit
behavior becomes large enough to need a dedicated package.

Target definitions distinguish action basis:

```ts
type FactoredUlsCombination = {
  id: number
  name: string
  actionBasis: 'factoredULS'
  P: number
  Mx: number
  My: number
  referenceFrameId: string
  sourceCaseIds?: readonly number[]
}

type ServiceCombination = {
  id: number
  name: string
  actionBasis: 'service'
  P: number
  Mx: number
  My: number
  referenceFrameId: string
}
```

Do not use an optional `isFactored` Boolean. Discriminated request types prevent sending a ULS
demand to the service solver.

### Loadings pipeline

```text
table/import
  -> validate definitions and IDs
  -> convert declared external units/signs
  -> transform to analysis reference frame
  -> normalized demand batch
  -> persist definition / send immutable snapshot to engine
```

The current UI supports add/edit/delete and Excel import/export in `LoadingsPanel`, owned by the
dedicated `Demand Check` workspace. The current persistence helpers live in `@pm/project`; a future
`@pm/loadings` extraction will own richer source-case validation and transformations. Demand Check
retains input order while using stable IDs.

The current web UI keeps simple `Pu/Mux/Muy` entry and governing checks together in `Demand Check`
rather than exposing a separate source-load-management module. The user can edit a combination,
select its row, open its concise trace with `Detail calculation`, and switch between combinations without
closing the dialog. `Capacity` remains the resistance-surface and chart workspace.

The `Report` menu follows `Demand Check`. Its sidebar owns the detail-loadcase selection, the
preview PDF and Excel export actions, and their status messages. The adjacent charts continue to
show the active Demand Check combination. Selecting cases for export affects only the reports.

The v1 DTO needs no `My` mechanics discriminator. The UI and worker pass the canonical component
unchanged, and both `@pm/analysis` and `@pm/equivalent-block` use `+F*(x-x0)`. Asymmetric ledger
tests protect this boundary because symmetric sections would not expose a sign mismatch.

## 2. Analysis orchestration

Current schema v3 (and the explicit centroidal v1/v2 readers) resolves one of two independent mechanics before preparation:

```text
strain-domain-surface-v1
  -> @pm/analysis (stress-strain mesh, shared 27 stations, 36 fixed directions)

equivalent-block-surface-v1
  -> @pm/analysis-equivalent-block
  -> @pm/equivalent-block + selected adapter (shared 27 stations)
```

The orchestration may normalize both outputs to common Nominal/Design/Demand result contracts, but
must never pass stress-strain mesh options into the block kernel or emulate a code block with fiber
stress. Model-specific fields remain attached to each result. See `../12` for the exact workflows.

The target orchestration boundary below is not yet a standalone `@pm/engine` package. Today,
`SectionDrawingClient.tsx`, the analysis client, and `pm-analysis.worker.ts` route requests to the
two analysis packages. A later engine extraction may own the same sequence without moving formulas
out of their kernels:

```text
Project input snapshot
  -> validate schema/resources
  -> normalize geometry and reference frame
  -> validate/compile materials
  -> resolve one design profile and method
  -> normalize/transform demand batch
  -> build/refine integration and resistance domains
  -> check demands and quantify uncertainty
  -> return immutable result or typed failure
```

Surface refinement occurs inside each compared integration level so error sources are not
confounded. Cancellation returns a failure/diagnostic state, never an accepted partial result.

Target engine API, not a current exported interface:

```ts
interface PmEngine {
  analyzeUls(request: UlsRequest, signal?: AbortSignal): Promise<EngineeringResult<UlsAnalysis>>
  solveService(request: ServiceRequest, signal?: AbortSignal): Promise<EngineeringResult<ServiceResponse>>
  validateProject(request: unknown): ValidationReport
}
```

`checkDemands` may reuse an accepted design domain only when the geometry/material/profile/options
hash matches and the new demands use the same reference frame/action basis.

### Implemented stress-strain sampling-options pipeline

```text
AnalysisOptions editor
  -> immutable canonical DTO in React state
  -> canonical project JSON / worker message
  -> structural validation in @pm/project
  -> material- and geometry-aware resolution in @pm/analysis
  -> prepared mesh/material evaluators reused
  -> custom station rows + uniform/explicit direction seeds
  -> optional deterministic midpoint refinement
  -> PreviewSurface { requested options, resolved stations, actual directions, error evidence }
  -> plots / inverse queries / Excel
```

Equivalent-block options use a separate path:

```text
EquivalentBlockAnalysisOptions editor
  -> canonical project JSON / worker message
  -> structural validation in @pm/project
  -> @pm/analysis-equivalent-block profile bridge
  -> @pm/equivalent-block + selected KDS/ACI adapter
  -> selected Fixed 27-state schedule or independent Adaptive seed schedule
  -> no refinement in Fixed; per-meridian station and angular refinement in Adaptive at 1%
  -> active Design/Nominal datasets with authoritative explicit topology
  -> common PreviewSurface and model-specific block fields
```

No concrete integration-mesh option enters the second path.

There is one authoritative options object. The UI, worker, fallback execution, export/import, cache
identity, plots, and Excel renderer do not maintain parallel station or angle constants. Geometry
and material changes invalidate prepared analysis; station/direction changes invalidate the surface
and every derived inverse/field result but reuse the prepared geometry/material work.

Labels and stable station IDs belong to persistence and audit. Surface point order is a transient
resolved index. Refinement probes therefore reference IDs, while numerical arrays use the resolved
index only after validation.

## 3. Design-code registry

The application requests a profile by full identity, never by organization label alone. Registry
lookup returns a profile or a typed unknown/unverified error. Profiles are immutable and include:

- standard document/edition/amendment/jurisdiction/annex;
- `methodId`, `profileVersion`, and verification status;
- required options/classifications and applicability validation;
- reference/design material construction;
- ultimate strain domain and resistance-stage evaluator;
- domain caps and clause trace.

The engine injects the selected adapter into stable core interfaces. No UI component directly
multiplies factors or chooses strain limits.

## 4. Results package

A future `@pm/results` package will own immutable accepted-result schemas and pure
query/presentation adapters. It does not exist today. Current preview surface/check/field DTOs and
query helpers are exported by `@pm/analysis`, with the block bridge normalizing into those types.
The accepted product still requires separate brands/types:

```ts
type PreviewResult = { kind: 'preview'; inputHash: string; issues: readonly EngineeringIssue[] }
type AcceptedResult = { kind: 'accepted'; inputHash: string; resultHash: string; value: UlsAnalysis }
type StaleResult = { kind: 'stale'; result: AcceptedResult; currentInputHash: string }
```

The accepted ULS DTO includes normalized inputs/provenance, nominal and design surfaces, per-demand
checks, numerical evidence, scope, warnings, and exact stage history. Plot/view-model adapters copy
or reference values; they never call material or resistance evaluators.

The current Preview inverse DTO distinguishes its equilibrium/capacity-ray diagnostic from a
composed Design-surface check. Once composed, it carries the governing three-state `adequacy` and
`utilizationInterval`. The web worker, fallback path, PDF model, general demand workbook, and block
workbook consume that decision. A report format does not infer adequacy from `UR <= 1`, inverse
convergence, or strain admissibility.

### Result queries

- per-combination summary/detail;
- point-in-domain and stored utilization evidence;
- fixed-`P` contour from triangle slicing;
- row-level Vertical vertex evidence and Fixed-P bracketing/interpolation evidence for the on-screen
  calculation inspector;
- hover/failure-mode/contribution information;
- unit-formatted copies for presentation;
- result comparison by compatible basis/profile.

If a query needs engineering data not present in the result DTO, extend/version the DTO and engine
output. Do not reconstruct it in React.

### Plotting adapter choice

The web Results workspace uses Plotly.js as the interactive engineering plotting adapter. Plotly was
chosen over hand-authored SVG because the result views require built-in pan/zoom/rotate, hover,
modebar controls, click events, and filled 3D surfaces. Current preview implementation loads
`plotly.js-dist-min` only in client components and uses:

- explicit `mesh3d` with stored triangle indices for current `P-Mx-My` resistance surfaces; a
  Plotly `surface` trace is retained only as a fallback when triangle connectivity is absent and for
  the translucent slicing planes;
- `scatter3d` for resistance meridians, topology and geometric slice outlines; the Capacity 3D
  chart contains resistance geometry only, with no loadcase markers, proportional demand paths,
  demand-related field markers or utilization crossings. Loadcase selection and checks belong to
  Demand Check; clicking the Capacity resistance surface does not select a loadcase;
- `scatter` for fixed-`P` `Mx-My` contours and vertical `P-Mtheta` slices;
- a dedicated interactive canvas renderer for the clipped-cell section mesh under **Analysis
  Options > Mesh**, because drawing every triangle and optional quadrature point as individual
  Plotly traces is unnecessary overhead;
- app-level range sliders for quickly changing fixed `P` and the slice rotation angle.

`npm run check:web-bundle` is the production bundle gate. It measures gzip bytes for the initial
route, Plotly, the analysis worker and Excel. The share-only Brotli codec is removed with project
share links; it has no remaining bundle budget. The checked-in ceilings are
budgets, not targets: a deliberate increase requires an implementation review and a budget change
in the same patch. This gate changes no engineering input, result, or fingerprint.

The section-mesh chart is available only to the stress-strain route. Equivalent-block projects show
an exact-clipping explanation instead because they have no concrete integration mesh. The chart is
an inspector, not a duplicate of the static section drawing. It supports
cursor-centred wheel zoom, drag pan, keyboard/button zoom, fit, a physical scale bar and per-triangle
hover information. The worker packs the same `ConcreteMesh` owned by `PreparedAnalysis` into
cell-ordered transferable typed arrays. React must not regenerate a display mesh from the section
boundary. Triangle coordinates remain `Float64`; actual degree-2 Gauss locations are reconstructed
from the kernel's exported barycentric rule, so display transfer does not duplicate three point
objects per triangle.

Rendering is viewport-cullable and frame-bounded. When a base cell is smaller than 2.5 device
pixels, or more than 60,000 triangles are visible, the chart explicitly labels and draws a clipped
grid LOD. Exact outer/hole rings remain visible. Zooming until the visible work is within budget
automatically reveals every actual triangle and optional Gauss point in that viewport. LOD is never
presented as the integration triangulation. A requested display over 750,000 triangles is rejected
as a presentation resource limit without changing or invalidating the engineering analysis.

The footer reports `h`, cells, triangles, integration points, the area sanity error, and the mesh
verification state. This architecture is important for high-aspect-ratio sections: because the seed
rule uses `h = Dmin/32`, a 0.1 m × 10 m section has about 102,400 base cells even though a
geometrically similar compact section is inexpensive.

The slice rotation angle is a moment-direction angle. For loadcase mode it is
`thetaLoad = atan2(Muy, Mux)`. It must be applied as a geometric query on the completed surface:
fixed-`P` checks intersect the `P = Pu` contour with the ray
`Mx = t*cos(thetaLoad), My = t*sin(thetaLoad)`, and vertical charts intersect the surface with
`Mx*sin(thetaLoad) - My*cos(thetaLoad) = 0`. It must not select the strain-plane sample row whose
angle happens to be nearest `thetaLoad`.

The current preview already uses explicit `mesh3d` whenever stored `i/j/k` triangle indices are
available. Do not use Plotly `alphahull` for resistance domains. Plotly remains a presentation
adapter only: it must display values already stored in the result DTO and must not perform
mechanics, resistance reduction, or adequacy logic.

## 5. Results UI state

The two on-screen calculation inspectors default to an interactive technical-document layout: a
sticky contents rail links to the existing ordered calculation steps, the current section is
highlighted while the document scrolls, equations and sections expose stable in-document anchors,
and tables retain one auditable value row per source item. Its content is one continuous reading
surface with typographic section breaks and technical table rules, not a stack of dashboard cards.
The former compact `Classic` modal remains implemented behind the local presentation flag but is
not exposed in the current UI. The header offers Excel audit export and browser print-to-PDF for the
currently selected trace. Print styling isolates the open inspector, keeps its identifying context
and Preview statement, expands the scroll surface, and omits navigation and interactive controls;
it does not create or promote an accepted/released engineering report. Neither export presentation
path can request, recalculate, factor, classify, or mutate an engineering result.

KaTeX `0.18.2` (MIT) is the bounded presentation dependency for authored TeX equations in these
inspectors. It is wrapped by the web-only `TechnicalEquation` component with trusted commands
disabled and HTML+MathML output enabled. KaTeX has no numerical, material, resistance, solver,
classification, persistence, worker, Excel, or PDF role; the visible values remain copies of the
existing audit/result DTOs. Plain explanatory formula rows remain React text when they combine
prose and evidence that is not an authored TeX expression.

The table below is the target accepted-result lifecycle. The current application implements
missing/ready/working/error preview states and invalidates derived surface/check/field data, but it
does not yet persist immutable accepted/stale result history or enable released-report actions.

| State | UI behavior |
|---|---|
| missing/invalid inputs | Run disabled; direct links to blocking entities |
| ready | Run enabled; prior results shown only as stale/history |
| running | progress stages and cancel; input editing either locks or clearly cancels/stales job |
| failed/cancelled | diagnostics and optional branded preview; no acceptance/report action |
| accepted/current | target only: tables, plots, evidence, and report action enabled |

Analysis settings are edited in the separate top-level **Options** workspace, not in a
Capacity dialog. Its engineering tabs are `Points`, `Mesh`/`Block`, and `Resistance`; `Units` is a separate presentation-only preference. Valid option changes
update the canonical project state, invalidate the surface and derived inverse/field/quick-check
data, then trigger worker recomputation. Resistance auto-publishes valid edits; code-factor changes
that depart from defaults are withheld until an override reason makes the draft valid.
Reinforcement classification and disabling only the axial cap are explicit analysis choices and do
not require that reason.

Results overview has exactly three charts: Vertical slice, 3D P-Mx-My, and Fixed-P Mx-My. Loadcase
detail has Section field, Fixed-P Mx-My, and Vertical slice. Each mode allows one large primary chart
and two secondary charts; hidden charts can be restored, but there is no fourth Section-mesh chart
inside Results.

Demand Check uses the pure `@pm/analysis` `resolveLoadcaseField` query to select Field at demand
from a qualified non-NG stress-strain inverse, and Field at capacity only for a governing
`inadequate` check. Missing demand equilibrium never selects capacity as a hidden fallback.
Equivalent-block inverse output is a capacity-ray state, so its non-NG demand field is explicitly
unavailable; no block strain is scaled or replaced with a fibre response. An indeterminate check
remains indeterminate even if its diagnostic demand field exists. Every NG chart uses the shared
theme-aware semantic failure tint. Both field-basis labels are prominent semantic badges. Field
basis, tint, NA angle and plots use one coherent displayed frame during selection changes.
The capacity field uses typed `capacityField` evidence on the transient inverse DTO.
The stress-strain worker and async fallback lazily load `@pm/analysis/capacity-field`;
the block bridge retains its existing physical proportional-capacity state. Governing crossing,
UR, interval and decision remain the existing Design-surface check. A complete visual frame can
contain no field map, so zero demand and unresolved fields retain geometry, curves and
check evidence. The legacy block inverse slots for zero demand are explicitly unevaluated; the
geometric zero-demand check owns UR=0 and no block-capacity solve is attempted.
Cap-governed fields instead query the retained physical Design boundary before Pmax on the same
checked load ray, using each mechanics' existing physical refinement. Available field evidence
discriminates the permitted Design boundary from a before-axial-cap boundary with its cap limit.
The latter has an explicit label/note and a separate marker; it never changes the stored governing
check. Original pre-cap Design geometry/topology is retained on transient surface/exact-curve DTOs
for same-colour dotted overlays of only the excluded portions. See [development/14](14-before-axial-cap-fields.md).
The corrected cap operation intersects the original domain with P <= Pmax, inserting actual
source-edge crossings and retaining the original below-cap side geometry. The shared geometric
intersection owner also supplies the dotted path endpoints. `Pmax intersection` rows expose the
cut explicitly without a physical-station ID. Chart-audit exports identify geometric ledger anchors
and leave their strain/curvature and physical-criterion values blank. See
[development/15](15-exact-axial-cap-intersections.md) for the governing-result correction and oracles.
Field-module loading or evaluation failures return typed unavailable-field evidence without
discarding the already computed governing check. Explicit try/await/catch contains synchronous
worker chunk-loader failures as well as rejected imports. Field-map and exact-curve requests
settle independently, then commit one coherent visual frame.

The vertical chart offers the geometric Demand-theta slice and a separately labelled Direct-beta
inspection with standard joined controls. Theta uses the checked moment vector; beta uses the
qualified selected demand/capacity state or an explicitly selected inspection angle. Zero moments identify the
theta plane as inspection rather than a unique demand direction. The Capacity overview contains
Design/Nominal resistance surfaces, their existing Direct-beta and Fixed-P slices, and explicitly
qualified before-Pmax geometry. Its chart data do not depend on loadcase selection or checks.
See [the Capacity presentation packet](18-capacity-resistance-only.md). Presentation units change
only copied ordinates. The task and evidence are recorded in
[the NG chart repair packet](12-ng-demand-charts.md). Existing report inverse-diagnostic contracts
are unchanged; the new on-screen capacity field is not silently substituted into report ledgers.

| accepted/stale | view/compare allowed; report release disabled for current project |

Results are keyed by input hash and result ID, not by the currently selected row name.

The Capacity Fixed-P table labels the selected Design moment components `Mrx`/`Mry` and the
Nominal components `Mnx`/`Mny`. These are presentation labels for the existing stage-specific
`Mx`/`My` values; they introduce no additional resistance reduction or component transformation.

The Capacity table toolbar has one Detail action immediately before Excel for the complete
calculation inspector, whose criterion selector exposes every row. A row or its identifying cells
do not open a dialog. Each available result value opens
a component-focused calculation trace for that same row and resistance stage (`P`/projected `M`
or `Mx`/`My`). The focused mode uses a compact shared document shell with a fixed row/stage caption
and no comboboxes or contents navigation. It retains the criterion-to-strain derivation needed
for the selected value, including the stored curvature direction and components, while omitting
general input, geometry, unrelated state derivations/components and full-row export actions. Reinforcement terms expand on demand. It consumes
the same worker audit DTOs:
compatible state, relevant concrete and net-steel contributions, one declared resistance route,
cap construction when applicable, and the selected Fixed-P endpoint interpolation. It cannot
invent a physical strain state at an interpolated or cap-face point. The value trace has no source,
stage or criterion switching; it remains tied to the clicked value. Closing restores the initiating
action. Before Nominal-to-Design multiplication, the trace exposes the lazy mechanics-owned
factor audit: controlling steel/strain, applicable transition limit, selected branch, active
coefficients and interpolation for strain-controlled factors; AS uses its own bending/axial
capacity-factor evidence. A design-material route identifies its material factors without inventing
a global multiplier. React formats these operands and the stored factor; it does not select a
branch or evaluate a resistance rule.
See [the value-trace packet](19-capacity-value-traces.md).

Envelope-table selection is presentation state only. The selected row carries a discriminated
`vertical` or `fixedP` evidence object from the same package query that built its displayed values.
React may format that evidence and draw explanatory geometry, but it must not search for different
brackets, evaluate materials, apply factors, or reconstruct a capacity result. The inspector header
reuses the table's complete Vertical/Fixed-P and Design/Nominal queries and exposes every returned
row through compact native selectors. Changing source or resistance stage resolves the same stable
Vertical station key or Fixed-P direction/branch from the freshly queried rows. A source change
starts at the first row of the new source. If the same criterion is absent after a stage change, the
dialog stays open and identifies that criterion as unavailable until the user selects another one;
it never substitutes by row index. When a query has no rows, the dialog stays open with a disabled
Criteria selector so the user can switch back without reopening it. Vertical, Fixed-P, Design, and Nominal evidence
cannot be mixed accidentally.

Opening the inspector sends a lazy `buildPointAudits` worker request containing the applied inputs,
calculation-profile identity, selected resistance stage, and exact stored vertex or Fixed-P bracket
vertices together with each vertex's stored station definition. `@pm/analysis` owns the stress-
strain trace; `@pm/analysis-equivalent-block` owns the exact-block trace. Each returns a serializable
DTO of effective laws, formulas/provenance, compatible depth profile, complete concrete/rebar
evidence, resistance stages, and stored-result reconciliation. The origin trace is criterion-aware:
`c/D` derives `c` from projected depth, while `epsilon_s/epsilon_y` derives the controlling steel
strain and compression-edge-to-bar distance before calculating curvature, `c`, and `epsilon0`.
Uniform and adaptive states retain explicit, truthful routes. The browser shows one concise
concrete summary from the audit DTO plus one point-specific Excel action and does not reconstruct
strain-plane or material mechanics. A separate lazy `exportConcretePointAudit` worker request
builds one visible calculation sheet for the exact physical state: stress-strain exports list every
mesh point and formula columns through `Pc/Mcx/Mcy`; equivalent-block exports list the exact
clipped-polygon edges and their shoelace/resultant formulas because that mechanics route has no
mesh. Workbook totals reproduce the summary row shown in the inspector. Nominal/reference and
Factored/Design contribution ledgers are presented side by side in one result table rather than as
separate tables. The modal header also exposes one lazy `exportCalculationTraceAudit` workbook.
For a Vertical row it contains `Input`, the reused point-specific `Concrete` detail, a formula-driven
per-bar `Steel` ledger, and `Summary`; the summary links the two detail totals and calculates the
selected `P/Mx/My` and projected `M-beta` without displaying a stored-result comparison. A non-exact Fixed-P row exports both lower and upper
physical-state Concrete/Steel sheet pairs, then performs the displayed interpolation by formula in
`Summary`. It never assigns an invented strain plane to the interpolated point. The existing
chart-audit export in the Results toolbar is unchanged. Fixed-P
endpoints are queried and exported
independently; the browser never
assigns an invented strain state to the interpolated contour point. Closing or changing the selected
row aborts an outstanding request.

An axial-cap vertex is a separate audit discriminant, not an `unavailable` physical state and not a
fabricated compatible state. The Design surface stores the cap provenance needed by the lazy audit:
the retained physical pre-cap criterion point when the structured surface replaces one, maximum
axial reference, cap ratio/limit, the source vertex or edge endpoints, source-edge interpolation,
and any structured radial projection. The dialog first sends the retained point through the normal
physical audit and reconciles its Concrete/Steel calculation; it then compares that axial result
with the maximum permitted value and evaluates the geometric cap formulas through the selected
stored `P/Mx/My`. The final face still has no unique material state. The complete workbook reuses
the pre-cap Concrete/Steel builders before its `Axial Cap` sheet; a cap point without a retained
physical criterion remains a geometric-only cap audit. The Excel and print-to-PDF actions share the
technical-document header; selectors remain in the document context row, and the obsolete “trace
from project inputs” subtitle is not shown.
For that geometric-only case, Input labels the endpoint as geometric and records strain, curvature,
and resistance factor as unavailable rather than publishing the DTO's non-physical placeholder
numbers as a resolved or pre-cap state.

The Loadcases header in Demand Check has one `Detail calculation` button. With a selected combination
and a ready resistance surface, it opens that combination's calculation trace by stable ID. Closing the
dialog returns focus to that button. Export XLSX and Import XLSX sit on the left below the table and
Add sits on the right. The calculation dialog header exposes every
current combination through one compact selector
and exports the selected combination through the existing `exportDemandCheck` worker route with
that ID as the only worked-through detail. The body consumes the existing quick-check and composed
inverse DTOs. It does not intersect the surface, calculate utilization, classify adequacy, apply
minimum eccentricity, or solve equilibrium in React. Quick-check output therefore carries the
declared `proportional3D` definition, finite capacity multiplier when one exists, checked demand
moment direction, and fixed-`P` demand/capacity moment magnitudes needed to explain its stored
ratios. While either DTO is pending or belongs to an older demand revision, the dialog stays open
and reports that evidence as pending instead of showing stale values.

## 6. Report package

Hardening report contract: chart, selected-point and shared demand workbooks bind the same resolved
per-material/per-stage steel law. Their endpoint/tangent formulas must have declared, grade-specific
names and survive independent recalculation. Optional physical strain and active tensile cutoff
have separate labels; absence of a physical bound does not remove a declared design cutoff.

This section separates current preview behavior from the target released-report architecture. The
current `@pm/report` package builds one format-neutral `ReportModel`, formula-audited calculation
workbooks for both mechanics, stress-strain mesh Excel/DXF audit files, and a deterministic
watermarked preview PDF. These artifacts are still built from preview inputs: the package does not
yet consume an immutable `AcceptedResult`, validate released-report eligibility, or attach a result
identity/signature and approval record.

The report pipeline is deliberately downstream:

```text
AcceptedResult
  -> validate report eligibility/currentness
  -> build versioned ReportModel
  -> apply presentation units/template/options
  -> render Excel and/or PDF
  -> verify rendered artifact
  -> ReleasedReport metadata + file
```

`ReportModel` is format-neutral and contains all tables, text, plots, warnings, evidence summaries,
and integrity metadata. Excel and PDF renderers consume the same model so their engineering content
cannot diverge.

### Report renderer rules

- no resistance factor, adequacy classification, or numerical interpolation in a renderer;
- full-precision stored values and display-only rounding;
- deterministic template/version and worksheet/section names;
- user text escaped/sanitized;
- result ID/hash, report schema/template version, timestamp, and current/stale status embedded;
- preview exports visibly watermarked and structurally distinct from released reports;
- output files rendered/opened in automated tests and checked for required content;
- Excel formulas, if any, are presentation formulas only and independently verified.

## 7. Caching and invalidation graph

Use content-addressed caches with typed keys:

- geometry normalization key;
- material compilation key;
- design profile key;
- analysis scenario/options key;
- demand-batch key;
- report result/template/presentation key.

Changing report units or layout invalidates only report output. Changing load combinations can reuse
a compatible accepted resistance domain but creates new demand checks and a new result hash.
Changing geometry, materials, station schedule, direction seed, design method, or accuracy options
invalidates the analysis domain.

Cache entries never upgrade preview data to accepted data and include numerically relevant
dependency versions.

The equivalent-block worker implements this rule directly: its core Design surface key includes the
profile, geometry, rebars, materials, analysis options, and DesignBasis, but excludes the load
combination. Repeated demand checks reuse that immutable core surface; any resistance-domain input
change produces a different key and rebuilds it.

## 8. Pipeline tests

This is the required release test set. Current `npm test` covers the numerical packages,
canonical-v2 and legacy-v1 round trips, UI helper logic, CAD, both mechanics' calculation workbooks, the demand-check
workbook, and deterministic preview-PDF rendering/content checks. It does not yet cover
accepted-result hashing, renderer eligibility from accepted/stale brands, or true cooperative
cancellation.

- ULS/service request types cannot be interchanged;
- demand frame/unit transformations and round-trip invariants;
- deterministic batch order and duplicate-ID failures;
- engine fail-closed behavior for every prerequisite stage;
- worker/main-thread equivalence, cancellation, crash, timeout, and resource limits;
- stale-state transitions for every input class;
- result schema round-trip and hash stability;
- plot/view-model values equal source result DTO values;
- Excel/PDF outputs contain required identity, units, warnings, tables, and plot data;
- renderers cannot accept preview/stale result brands as released reports.

## 9. Delivery status and remaining order

1. **Implemented preview:** dedicated `Capacity`, `Demand Check`, and `Report` workspaces, project round
   trip, analysis-option validation, two independent mechanics, five selectable code calculation
   routes, adaptive preview surfaces/checks, model-specific fields, calculation-trace workbooks for
   both mechanics, stress-strain mesh Excel/DXF, demand-check workbook, shared `ReportModel`, and a
   deterministic watermarked preview PDF.
2. **Next integrity work:** confirm and test the documented parser-v1 defaults, add shared typed
   issues, canonical hashing, and
   a complete stale-state graph.
3. **Production gates:** finish geometry/material validation gateways, accepted-result numerical
   uncertainty and topology gates, independent code-profile review, and cooperative cancellation.
4. **Reporting:** make `Capacity`, `Demand Check`, and the existing report builders consume an
   immutable accepted DTO; enforce accepted/current eligibility; attach result identity, signature,
   approval, and rollback metadata; then qualify the existing Excel/PDF renderers for released
   reports without weakening their Preview path.

### Display-unit boundary

See [the unit decision and task packet](10-display-units.md). Native inputs and all calculation
requests/results remain canonical. Only export request contracts carry optional `presentationUnits`.
`ColumnReportModel` records that selection and uses neutral `p`, `mx`, `my`, `force` and `axialCap`
view-field names for selected-unit action values. Drawing geometry and explicitly MPa-named stress
fields remain canonical and are converted at their rendering boundary. This is a report API change,
not an engineering result DTO or project JSON change. Excel audit ledgers retain all existing
formula/unit contracts; a Display sheet copies explicit input/result values into selected units.


### Applied load-input origin

See [the load-reference packet](16-load-reference-origin.md). Canonical v3 persists a centroid-offset
load-input reference while retaining centroidal combinations. @pm/project owns validation and pure
translation. The Load reference form precedes Report; native numeric spinners and typed drafts
preview only the section drawing's LOAD axes. Apply follows a borderless Convert checkbox and
commits one immutable loading/reference transaction. Convert preserves the canonical array exactly;
unchecked Apply reinterprets the old input values. New rows are authored at the applied origin.
No per-row origin history is required. Import resets the editor; unit selection, draft changes and
checkbox changes cannot mutate a calculation. Native fields enter their full-precision editing
representation on focus; automated editing must wait for that representation before replacing it.

Direct, Fixed-P, demand-plane and 3D views and their demand markers stay centroidal. Physical field,
neutral-axis and resultant overlays retain their centroidal state; the separately labelled LOAD
axes may preview an unapplied input origin. A no-loadcase view can show geometry and load axes
without manufacturing a physical field. Neither offset nor Convert rebuilds the capacity surface.

Project workbook v6 and standalone loadcase sheets declare their reference and convert authored
values once at import/export. Existing centroidal workbook readers retain their explicit contracts.
Calculation trace dialogs identify entered values at O and converted values at C. PDF identity and
Excel Load reference evidence keep those inputs separate from unchanged centroidal ledgers/curves.
Report results and adequacy rules are not redefined by this input-reference feature.


### Stable demand-field presentation

The completed demand frame is replaced atomically after its field map and direction curve settle.
During a loadcase switch or a demand edit (including unchecked load-reference Apply), one outgoing
frame may remain visible only on the same immutable resistance surface and while its row still
exists. It is explicitly labelled as the previous completed result; strict current-demand guards
continue to exclude its values from current row checks and calculation dialogs. Deleted rows,
missing selections and changed surfaces withdraw that frame. This is transient Preview display
history, not an accepted or current result.

The section-field footer reserves its status area and all four metric cards across demand,
capacity, before-Pmax and unavailable states. Missing physical fields display unavailable values.
The drawing fit uses exact section bounds and the visible LOAD-axis origin, identically in field
and outline views. Applying an already previewed origin therefore cannot change that fit.
See [the presentation task packet](17-stable-demand-field-layout.md) for evidence and limits.
