# Current-State Assessment and Roadmap

Assessment date: **2026-07-23**.

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
| ACI Whitney model | helper/type/UI option | implemented but blocked | `beta1` is unused in current local stress evaluation; redesign required |
| project JSON | schema/version/meta, geometry/material/loadings, import/export, round-trip self-test | implemented | migrations, strict semantic issues, no invisible repair, result/design-basis artifacts |
| Loadings data | empty/combination definitions and clone/create helpers | implemented seed | action basis/frame, validator, future owning package when complexity warrants |
| Results-sidebar loadcases | add/edit/delete/duplicate/select Pu/Mux/Muy combinations in Results | implemented preview | typed validation, import, stale-state graph, accepted demand checks |
| analysis core | detailed specifications only | not implemented | packages, mechanics, mesh, surface, checks, V&V |
| design-code registry | detailed specification only | not implemented | exact profiles, traceability, review/evidence |
| Results | Plotly 3D preview surface, 2D fixed-P slice, vertical slice, lazy inverse loadcase detail | implemented preview | accepted result contract, DTO-driven plots, checks, convergence evidence; preserve the strain-angle vs demand-angle separation |
| Report | Excel/PDF model/renderers | not implemented | accepted-result-only pipeline and render verification |
| tests | TypeScript check script and one project round-trip self-test | initial only | geometry/material/unit/property/differential/UI/V&V suites |

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
   plausible curve from invalid definitions.
3. **ACI Whitney is modeled at the wrong abstraction.** `beta1` is displayed/stored but not used in
   the evaluator, so it cannot enter analysis.
4. **No exact design basis/profile in project or engine.** Family labels (`KDS`, `ACI318`, `EC2`)
   cannot select a verified resistance method.
5. **No analysis/result acceptance types.** Preview and engineering output are not yet separated in
   code because the engine does not exist.
6. **Insufficient verification.** Geometry/material behavior currently lacks the required test
   matrix and independent oracles.

### P1 - architecture and data-integrity risks

1. `SectionDrawingClient.tsx` combines many use cases and UI concerns, increasing accidental
   coupling as Results/Report grow.
2. Removing a steel material can leave bars referring to a missing ID; parsing later warns and
   selects a default, which is unsuitable for accepted analysis.
3. Project parsing currently repairs an invalid default steel ID after parsing rather than returning
   an explicit repair decision.
4. Schema v2 has no migration path or exact design-basis/result artifact.
5. Package manifests use floating ranges/`latest` for major UI dependencies; result-relevant builds
   need an intentional pin/update policy.
6. The root test command invokes `npx --yes tsx` although `tsx` is not declared as a project
   development dependency, making the test path potentially network-dependent.
7. Current editor coordinate rounding/fixed tolerances are not separated from engineering topology
   and convergence tolerances.

### P2 - scale-up risks

1. Current v2 stores one concrete material while geometry can store multiple regions.
2. Current loadings support combinations but not source load-case provenance.
3. No content hash/stale-state graph exists for downstream Results/Report.
4. No worker protocol, cancellation, resource preflight, or deterministic cache exists for future
   surface calculations.
5. Report content and integrity schema are not yet defined in code.

## 4. Documentation decisions closed by this baseline

- engineering and programming instructions are separate groups;
- the current UI flow is Geometry -> Materials -> Results -> Report;
- the current input packages are retained and hardened rather than bypassed;
- multiple geometry regions are a persisted/editor capability but are analysis capability-gated;
- project v2 units are fixed by schema, while external adapters must declare source units;
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
