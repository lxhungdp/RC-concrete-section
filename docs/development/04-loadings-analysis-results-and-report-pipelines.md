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

The current UI supports add/edit/delete and CSV import/export in `LoadingsPanel`, embedded in the
Results sidebar. The current persistence helpers live in `@pm/project`; a future `@pm/loadings`
extraction will own richer source-case validation and transformations. Results retain input order
while using stable IDs.

Current web UI keeps loadcase entry inside the Results sidebar rather than exposing a separate
top-level Loadings module. This keeps the user workflow direct: add or edit Pu/Mux/Muy, click a
loadcase row, then inspect the forward plots and lazy inverse detail in the same screen.

The v1 DTO needs no `My` mechanics discriminator. The UI and worker pass the canonical component
unchanged, and both `@pm/analysis` and `@pm/equivalent-block` use `+F*(x-x0)`. Asymmetric ledger
tests protect this boundary because symmetric sections would not expose a sign mismatch.

## 2. Analysis orchestration

Current schema v1 resolves one of two independent mechanics before preparation:

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
  -> project v1 JSON / worker message
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
  -> project v1 JSON / worker message
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

### Result queries

- per-combination summary/detail;
- point-in-domain and stored utilization evidence;
- fixed-`P` contour from triangle slicing;
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
- `scatter3d` for demand/loadcase points that can be clicked to trigger lazy inverse evaluation;
- `scatter` for fixed-`P` `Mx-My` contours and vertical `P-Mtheta` slices;
- a dedicated interactive canvas renderer for the clipped-cell section mesh under **Analysis
  Options > Mesh**, because drawing every triangle and optional quadrature point as individual
  Plotly traces is unnecessary overhead;
- app-level range sliders for quickly changing fixed `P` and the slice rotation angle.

`npm run check:web-bundle` is the production bundle gate. It measures gzip bytes for the initial
route, Plotly, the analysis worker and Excel, plus raw Brotli WASM bytes. The checked-in ceilings are
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

Analysis settings are edited in the separate top-level **Analysis Options** workspace, not in a
Results dialog. Its three tabs are `Points`, `Mesh`, and `Design Resistance`. Valid option changes
update the canonical project state, invalidate the surface and derived inverse/field/quick-check
data, then trigger worker recomputation. Design Resistance auto-publishes valid edits; factor or
reinforcement-class changes that depart from defaults are withheld until an override reason makes
the draft valid. Disabling only the axial cap does not require that reason.

Results overview has exactly three charts: Vertical slice, 3D P-Mx-My, and Fixed-P Mx-My. Loadcase
detail has Section field, Fixed-P Mx-My, and Vertical slice. Each mode allows one large primary chart
and two secondary charts; hidden charts can be restored, but there is no fourth Section-mesh chart
inside Results.

| accepted/stale | view/compare allowed; report release disabled for current project |

Results are keyed by input hash and result ID, not by the currently selected row name.

## 6. Report package

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
schema-v1 round trip, UI helper logic, CAD, mesh workbook, and stress-strain workbook formulas; it
does not yet cover accepted-result hashing, PDF rendering, or true cooperative cancellation.

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

1. **Implemented preview:** Results-sidebar combinations, project round trip, analysis-option
   validation, two independent mechanics, five selectable code calculation routes, adaptive preview
   surfaces/checks, model-specific fields, stress-strain Excel, and mesh Excel/DXF.
2. **Next integrity work:** confirm and test the documented parser-v1 defaults, add shared typed
   issues, canonical hashing, and
   a complete stale-state graph.
3. **Production gates:** finish geometry/material validation gateways, accepted-result numerical
   uncertainty and topology gates, independent code-profile review, and cooperative cancellation.
4. **Reporting:** make Results consume an immutable accepted DTO, implement the equivalent-block
   ledger export, add a format-neutral report model, then release-tested Excel/PDF renderers.
