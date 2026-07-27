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

The UI supports add/edit/delete/duplicate/import, but validation and transformation live in
`@pm/loadings`. Results retain input order while using stable IDs.

Current web UI keeps loadcase entry inside the Results sidebar rather than exposing a separate
top-level Loadings module. This keeps the user workflow direct: add or edit Pu/Mux/Muy, click a
loadcase row, then inspect the forward plots and lazy inverse detail in the same screen.

## 2. Analysis orchestration

`@pm/engine` owns use-case sequencing, not mathematical formulas:

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

Suggested engine API:

```ts
interface PmEngine {
  analyzeUls(request: UlsRequest, signal?: AbortSignal): Promise<EngineeringResult<UlsAnalysis>>
  solveService(request: ServiceRequest, signal?: AbortSignal): Promise<EngineeringResult<ServiceResponse>>
  validateProject(request: unknown): ValidationReport
}
```

`checkDemands` may reuse an accepted design domain only when the geometry/material/profile/options
hash matches and the new demands use the same reference frame/action basis.

### Implemented sampling-options pipeline

```text
AnalysisOptions editor
  -> immutable canonical DTO in React state
  -> project v3 JSON / worker message
  -> structural validation in @pm/project
  -> material- and geometry-aware resolution in @pm/analysis
  -> prepared mesh/material evaluators reused
  -> custom station rows + uniform/explicit direction seeds
  -> optional deterministic midpoint refinement
  -> PreviewSurface { requested options, resolved stations, actual directions, error evidence }
  -> plots / inverse queries / Excel
```

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

`@pm/results` owns immutable result schemas and pure query/presentation adapters. It does not own
mechanics. Separate brands/types are required:

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

- `surface` for the preview `P-Mx-My` interaction surface from the strain-plane-angle/station grid;
- `scatter3d` for demand/loadcase points that can be clicked to trigger lazy inverse evaluation;
- `scatter` for fixed-`P` `Mx-My` contours and vertical `P-Mtheta` slices;
- a dedicated interactive canvas renderer for the clipped-cell section mesh, because drawing every
  triangle and optional quadrature point as individual Plotly traces is unnecessary overhead;
- app-level range sliders for quickly changing fixed `P` and the slice rotation angle.

The section-mesh chart is an inspector, not a duplicate of the static section drawing. It supports
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

When the accepted engine returns a verified triangulated surface, the 3D chart must switch to an
explicit `mesh3d` trace with stored `i/j/k` triangle indices. Do not use Plotly `alphahull` for
resistance domains. Plotly remains a presentation adapter only: it must display values already
stored in the result DTO and must not perform mechanics, resistance reduction, or adequacy logic.

## 5. Results UI state

| State | UI behavior |
|---|---|
| missing/invalid inputs | Run disabled; direct links to blocking entities |
| ready | Run enabled; prior results shown only as stale/history |
| running | progress stages and cancel; input editing either locks or clearly cancels/stales job |
| failed/cancelled | diagnostics and optional branded preview; no acceptance/report action |
| accepted/current | tables, plots, evidence, and report action enabled |

Results exposes a calculation **Options** dialog backed by the same canonical `AnalysisOptions`
contract as the Analysis module. The dialog edits an isolated draft:

- Cancel, Escape, backdrop click, and the close button discard the draft without invalidating the
  current result;
- Apply replaces the canonical options once, aborts/stales every surface, inverse solve, field map,
  and quick check from the prior revision, then rebuilds the surface in the worker;
- overview plots and loadcase quick checks update from the new surface automatically;
- if a loadcase detail is open, its inverse solve is rerun automatically after the new surface
  arrives;
- the dialog never owns a second persisted options object.

Each Results mode offers four chart choices. Three are visible by default and **Section mesh** is
off, so its potentially large geometry DTO is not transferred to the UI until requested. The chart
workspace has exactly three visual slots: one primary chart spanning both rows and two secondary
charts. Restoring a fourth choice replaces a visible secondary chart rather than silently changing
the established layout; the displaced chart remains available in the restore toolbar. Hiding the
primary promotes the first remaining visible chart, and the last visible chart cannot be hidden.

Mesh-chart visibility is presentation state, not analysis input and not project engineering data.
Changing it must not invalidate the surface, inverse solutions, or quick checks. A geometry/material
revision still invalidates the lazy worker payload so an old mesh is never shown as current.

| accepted/stale | view/compare allowed; report release disabled for current project |

Results are keyed by input hash and result ID, not by the currently selected row name.

## 6. Report package

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

## 8. Pipeline tests

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

## 9. Recommended vertical delivery order

1. Results-sidebar loadcase entry, project round-trip, and typed seed validation.
2. Shared typed issues, canonical hashing, and stale-state graph.
3. Geometry/material production validation gateways.
4. Minimal verified forward mechanics fixture without design-code claims.
5. One complete draft design-profile pipeline behind preview status.
6. Adaptive accepted result surface/checks after V&V gates.
7. Results UI driven only by result DTOs.
8. Format-neutral report model, Excel renderer, then PDF renderer with visual/data verification.
