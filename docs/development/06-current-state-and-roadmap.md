# Current-State Assessment and Roadmap

Assessment date: **2026-07-27**.

This assessment is based on the current source, project scripts, Geometry/Materials UI, project JSON
round-trip, and the detailed technical specifications. It records capability, not blame or implied
certification.

## 1. Current capability matrix

| Area | Implemented now | Status | Main gap before engineering use |
|---|---|---|---|
| project workspace | npm workspaces and TypeScript path aliases | implemented | dependency/version and per-package test discipline |
| IDs | positive integer gap-fill helpers | implemented | namespace uniqueness validation at full document level |
| Geometry UI | draw rectangle/circle/polygon, edit points, visibility/lock/duplicate, boolean union/subtract, Apply | implemented preview | large component, complete validity gate, explicit editing-vs-analysis tolerance |
| geometry persistence | `GeometryInput` with multiple outers, holes, outer-owned rebars | implemented | production adapter to normalized analysis model |
| geometry math | polygon boolean, area, centroid, perimeter, primitives | implemented preview | topology, exact inertia/support, robust tolerances, numerical mesh |
| rebar UI | manual bars, three quick generators, steel assignment | implemented preview | cover semantics, concave/hole containment, spacing, overlap, orphan reference protection |
| material UI | concrete/steel editors and curve preview | implemented preview | invalid intermediate states and production validation UX |
| material definitions | one concrete, multiple steels, several model discriminants | implemented preview | exact source/profile separation, ranges, extrapolation, versions |
| material compilation | stress/tangent/limit helpers | implemented preview | silent fallback, admissibility/breakpoints/components, analytical tangents |
| KDS helpers | derived concrete parameters/modulus and default definitions | implemented preview | exact normative profile trace and independent verification |
| ACI Whitney model | helper/type/UI option | **blocked in code** | `beta1` is unused in local stress evaluation. `@pm/materials/support` now declares the model unsupported; the selector disables it and `@pm/analysis` throws `UNSUPPORTED_CONCRETE_MODEL`. Redesign as a resistance-level adapter is still required. |
| project JSON | schema v4, meta, geometry/material/loadings/analysis/design basis, v3 migration, import/export, round-trip self-test | implemented | strict semantic issues, no invisible repair, accepted-result artifacts |
| Loadings data | factored-ULS combinations and clone/create helpers | implemented seed | source-load provenance/frame and future owning package when complexity warrants |
| Results-sidebar loadcases | add/edit/delete/select Pu/Mux/Muy combinations plus CSV import/export and 3D UR | implemented preview | accepted-result/stale-state graph |
| analysis core | fibres, mesh, strain stations, nominal/design surfaces, slicing, inverse solve, field map and ULS ray check | implemented preview | profile V&V, accepted result contract and uncertainty gate |
| design-code registry | `@pm/design`, exact profile identity, global-factor and design-material formats | implemented draft preview | clause trace bundle, jurisdiction/annex gating and independent review |
| Results | Plotly 3D preview surface, 2D fixed-P slice, vertical slice, lazy zoomable section-mesh inspector with exact/LOD modes, Excel/DXF mesh audit export, lazy inverse loadcase detail | implemented preview | accepted result contract, DTO-driven plots, checks, convergence evidence; preserve the strain-angle vs demand-angle separation |
| Report | Excel audit workbook with `Design_Check` | implemented preview | accepted-result-only eligibility, integrity metadata, PDF and render verification |
| analysis kernel package | `@pm/analysis` — fibres, stations, surface, slicing, inverse solve, field map | implemented preview | moved out of `apps/web/lib`; still one module, still preview mechanics |
| report package | `@pm/report` — result workbook plus Section-mesh Excel/DXF audit export | implemented preview | moved out of `apps/web/lib`; accepted-result-only pipeline still missing |
| worker protocol | versioned job/cancel messages, queue-drop on cancel, `AbortSignal` on every client call, 250 ms debounce, prepared-analysis cache keyed by canonical input | implemented | progress stages, time/memory budgets, deterministic parallel batches |
| kernel performance | hoisted constitutive parameters, boundary-cell spatial classifier, one prepared mesh per input revision, analytic consistent tangent | implemented | batched surface states, parallel batches ([`../08`](../08-software-architecture-and-api.md) §8.1) |
| mesh admission | `RESOURCE_LIMIT`, empty region and failed self-check are typed fatal errors | implemented | automatic mesh refinement to a declared `tolMesh` |
| numerical uncertainty | measured mesh error and per-surface direction-sampling estimate; opt-in β refinement | implemented preview | state-direction refinement, per-utilization uncertainty ([`../06`](../06-mesh-sizing-and-convergence.md) §7) |
| benchmark fixtures | 8 sections, process-isolated timing, committed capacity fingerprint gated in CI | implemented | 100-demand batch fixture, memory and UI-blocking budgets |
| tests | typecheck, 73 `node --test` assertions, 11-test `cad-drawing` suite, project/station/workbook self-tests, production build, exact dependency pins | baseline in place | geometry/material property/UI suites; independent design-code verification |

## 2. Strengths to preserve

- Geometry, Materials, and Project are already separate workspace packages.
- Editor draft boundaries are distinct from applied/persisted geometry.
- Rebars reference steel by stable integer ID rather than display name.
- Material definitions are persisted while runtime functions are recompiled.
- Project JSON has an explicit schema and version.
- Geometry supports more than one region at the input level, allowing future scale-up.
- The newer technical specifications correctly emphasize exact geometry, adaptive convergence,
  typed failure, nominal/design separation, and anti-double-reduction.

## 3. Blocking inconsistencies and risks

### P0 - engineering correctness blockers

1. **No production geometry gateway.** `summarizeSection` warnings are too weak for topology and bar
   acceptance.
2. **Material compilation fails open.** Unknown/default branches and fallback values can produce a
   plausible curve from invalid definitions. *Partly closed:* a rebar whose `steelMaterialId` does
   not exist is now a typed `MISSING_STEEL_MATERIAL` fatal error rather than a bar that contributes
   zero. The remaining unknown/default compile branches still fall back silently.
3. **ACI Whitney is modeled at the wrong abstraction.** `beta1` is displayed/stored but not used in
   the evaluator. *Closed as a hazard, open as a capability:* the model is now rejected by
   `@pm/materials/support` and by the kernel, so it cannot reach a result; the correct
   resistance-level adapter is still to be written.
4. ~~**No exact design basis/profile in project or engine.**~~ **Closed as a preview capability.**
   Schema v4 persists exact profile identity and `@pm/design` owns two resistance formats.
   **Verification remains open:** all currently enabled KDS, ACI and EN profiles are `draft`.
5. **No accepted-result contract.** The engine now returns nominal and design preview surfaces, but
   preview/current/stale/accepted remain insufficiently separated for released engineering output.
6. **Insufficient verification.** Geometry/material behavior currently lacks the required test
   matrix and independent oracles.
7. ~~**Mesh admission fails open.**~~ **Closed** — a mesh over its cell budget used to return empty
   and the surface build carried on with the reinforcement alone, plotting a complete interaction
   diagram whose `P0` was 6.3× too low. `MESH_RESOURCE_LIMIT`, `EMPTY_CONCRETE_SECTION` and
   `MESH_NOT_VERIFIED` are now typed fatal errors.
8. **The direction grid is the governing numerical error.** Measured at 1–16% in moment against
   0.1% from the integration mesh, and always conservative
   ([`../06`](../06-mesh-sizing-and-convergence.md) §5.1). The estimate is reported per surface and
   refinement exists, but the default 24-direction grid is unchanged and no accepted result may be
   issued without recording which grid produced it.

### P1 - architecture and data-integrity risks

1. `SectionDrawingClient.tsx` combines many use cases and UI concerns, increasing accidental
   coupling as Results/Report grow. **Still open** — 2 300 lines, 34 `useState`.
2. ~~Removing a steel material can leave bars referring to a missing ID.~~ **Closed** — the kernel
   rejects it; parse-time still only warns, so the UI should block the edit as well.
3. Project parsing currently repairs an invalid default steel ID after parsing rather than returning
   an explicit repair decision.
4. Schema v4 migrates v3 inputs and persists the exact design basis; accepted-result artifact
   migration remains open.
5. ~~Package manifests use floating ranges/`latest`.~~ **Closed** — every dependency is pinned to an
   exact version and CI installs with `npm ci`.
6. ~~The root test command invokes `npx --yes tsx`.~~ **Closed** — `tsx` is a pinned devDependency
   and the scripts call it directly.
7. Current editor coordinate rounding/fixed tolerances are not separated from engineering topology
   and convergence tolerances.

### P2 - scale-up risks

1. Current v3 stores one concrete material while geometry can store multiple regions.
2. Current loadings support combinations but not source load-case provenance.
3. No content hash/stale-state graph exists for downstream Results/Report.
4. ~~No worker protocol or cancellation.~~ **Partly closed** — the protocol is typed and versionable,
   every client call takes an `AbortSignal`, a cancelled job is dropped from the worker queue, and
   edits are debounced by 250 ms. A job already running still completes: interrupting it needs
   cooperative checkpoints in the kernel. Resource preflight and a deterministic cache remain open.
5. Excel preview content is implemented, but accepted-result integrity and report-release schemas
   are not yet defined in code.

## 4. Documentation decisions closed by this baseline

- engineering and programming instructions are separate groups;
- the current UI flow is Geometry -> Materials -> Results -> Analysis Options -> Report;
- the current input packages are retained and hardened rather than bypassed;
- multiple geometry regions are a persisted/editor capability but are analysis capability-gated;
- project v4 units are fixed by schema, while external adapters must declare source units;
- material family labels are not complete design-code profiles;
- loadcases distinguish action basis and eventually source cases from combinations;
- Results are immutable artifacts with preview/current/stale/accepted states;
- Report consumes only accepted results and shares one format-neutral model for Excel/PDF;
- current Geometry and Materials behavior remains preview until its production gates pass.

## 5. Recommended phased roadmap

### Phase 0 - documentation baseline

- maintain the role-based instruction structure and [`../01-control-map.md`](../01-control-map.md);
- assign requirement IDs and resolve remaining normative decisions;
- preserve the current detailed numerical specifications as supporting references.

Exit: structural and software owners approve scope, conventions, package/pipeline boundaries, and
current-state classification.

### Phase 1 - shared foundations

- introduce shared typed issues/results/provenance and canonical hashing;
- make tests fully local/reproducible and pin intentional dependency versions;
- add schema/migration test harness and stop invisible import repair;
- introduce input hash and stale-state graph in the app.

Exit: package-level validation failures and project round-trips are deterministic and fully tested.

### Phase 2 - harden Geometry and Materials

- implement geometry schema/topology/normalization/exact-property/rebar validators;
- define cover semantics and restrict/validate generators;
- implement strict material validation, explicit extrapolation/admissibility, analytical tangents,
  breakpoints, and contribution components;
- remove accepted fallback paths and block/redesign ACI Whitney;
- add full unit/property/differential fixtures.

Exit: normalized geometry and compiled material set are typed production gateway outputs, still
without claiming a verified design code.

### Phase 3 - complete Results-sidebar loadcase slice

- harden Results-sidebar combination editing and project round-trip;
- create `@pm/loadings` only when action-basis/frame-aware contracts, source-load provenance, or
  import/edit behavior outgrow the project seed;
- add cross-module readiness and stale-result behavior.

Exit: Geometry, Materials, and loadcases form a complete validated input snapshot.

### Phase 4 - mechanics/reference kernel

- implement exact geometry support, integration/quadrature/refinement, forward resultants,
  contribution ledger, scaled algebra, and independent fixtures;
- reproduce approved Excel examples as regression evidence without treating them as normative truth;
- implement service solver only behind its separate request type if needed.

Exit: mechanics verification Gate C passes for a standard-neutral reference mode.

### Phase 5 - one complete ULS design profile

- select exact first standard/edition/method and complete clause trace;
- implement strain domain, nominal/design sequencing, surface refinement, caps, topology, demand
  checks, utilization, and uncertainty;
- verify that loadcase `P-Mtheta` slices use `thetaLoad = atan2(Muy, Mux)` and surface
  ray/plane intersections, not nearest strain-plane sample rows;
- run the full structural/design-code verification matrix and independent review.

Exit: one declared scope can produce an accepted result; all other profiles remain draft/blocked.

### Phase 6 - Results

- add result schemas/package, history/current/stale states, tables, plots, per-combination details,
  convergence and diagnostics;
- ensure plots use explicit surface triangles and result DTO values only;
- keep strain-domain sampling parameters out of UI demand-direction semantics.

Exit: structural reviewers can audit every accepted combination through the UI.

### Phase 7 - Report

- add format-neutral report model and eligibility checks;
- implement Excel, then PDF renderers;
- add data and visual render verification, template/version/integrity metadata, preview watermarking,
  and released-report workflow.

Exit: Excel/PDF reproduce accepted result content and pass report release gates.

## 6. Next recommended coding slice

The safest next implementation slice is **Phase 1 shared foundations**, followed by the Geometry and
Materials gateways. Specifically:

1. add local test tooling as declared dependencies and organize package test scripts;
2. introduce shared `EngineeringIssue`, `EngineeringResult`, and validation report contracts;
3. make material compilation exhaustive and reject invalid definitions instead of falling back;
4. add referential-integrity checks that block deletion/opening of orphaned steel assignments;
5. add a normalized geometry validator entry point distinct from `summarizeSection`;
6. wire the UI to show typed blocking issues while retaining existing editing behavior.

This produces an end-to-end improvement in the already built Geometry/Materials slices and creates
the stable foundation needed before loadcases or numerical analysis are expanded.

## 7. Roadmap Update Rule

When a capability is implemented, update its row with evidence links and keep its status at
`implemented` or `preview` until the applicable engineering gates pass. Do not move directly from
`not implemented` to `verified` in one code change without the required independent evidence.
