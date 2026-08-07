# 08 — Software Architecture, API, Performance, and Security

The engine is safety-relevant calculation software. Correct formulas are necessary but insufficient;
the system must make invalid states difficult to construct and unsupported results impossible to
mistake for certified output.

## 1. Layering and dependency direction

```text
UI / report / Plotly
        ↓
application orchestration / workers / cache
        ↓
ULS checks and service-response use cases
        ↓
mechanics, materials, geometry, numerical primitives
        ↓
immutable domain types and typed errors
```

Design-code adapters depend on stable kernel interfaces. The kernel never imports a code adapter,
UI, Plotly, storage, network, or worker API.

Use dependency-inversion interfaces for polygon clipping, linear solves, clocks, hashing, and
parallel execution so production and verification implementations can differ.

## 2. Functional core and immutable normalization

- Raw input DTOs are never mutated.
- Validation returns a frozen normalized model or typed errors.
- Geometry/material IDs are stable and preserved in diagnostics.
- Pure functions produce the same bitwise or tolerance-equivalent result for the same normalized
  input, engine version, dependency versions, and options.
- No global mutable material registry or implicit "current standard".
- No hidden defaults after normalization; expanded options are stored in provenance.

## 3. Target public API separation

The interface below is a release architecture requirement, not an API exported by the current
repository. Current preview orchestration uses `@pm/analysis`,
`@pm/analysis-equivalent-block`, and the web worker/client directly.

```ts
export interface PmEngine {
  analyzeUls(input: UlsRequest, signal?: AbortSignal): Promise<EngineeringResult<UlsAnalysis>>;
  checkDemands(surface: CertifiedDesignDomain, demands: readonly DesignDemand[]):
    EngineeringResult<readonly DemandCheck[]>;
  solveService(input: ServiceRequest, signal?: AbortSignal):
    Promise<EngineeringResult<EquilibriumSuccess>>;
  validateInput(input: UnknownRequest): ValidationReport;
}
```

Use different request/result types for ULS and service analysis so factored demand cannot be passed
accidentally to the physical equilibrium solver.

Only a successful result that carries a `CertifiedDesignDomain` brand can enter report-generation
or downstream adequacy APIs. Preview surfaces use a different type.

## 4. Runtime schemas and current v1 policy

Compile-time types do not validate JSON. Use the current local runtime parser for the project
boundary. Every persisted calculation contract in the repository is v1:

```ts
PM_PROJECT_VERSION = 1
DESIGN_BASIS_VERSION = 3
ANALYSIS_OPTIONS_VERSION = 1
STRAIN_DOMAIN_SURFACE_METHOD = 'strain-domain-surface-v1'
EQUIVALENT_BLOCK_SURFACE_METHOD = 'equivalent-block-surface-v1'
```

The project schema remains v1. Its embedded DesignBasis has explicit v1 -> v2 factor-expression
and v1/v2 -> v3 EN compression-domain migrations; unsupported versions fail. Analysis-option and
surface method IDs remain v1. A different project schema version is outside the current scope; an old standard edition
or unit convention may never be reinterpreted silently.

## 5. Errors, warnings, and fail-closed behavior

Exceptions are reserved for programmer defects at internal boundaries. Expected engineering/input
failures use `EngineeringResult`.

Each issue contains:

```ts
export interface EngineeringIssue {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  path?: string;
  entityId?: string;
  context?: Readonly<Record<string, string | number | boolean>>;
}
```

Internal exceptions are caught once at the application boundary, assigned a correlation ID, logged
without sensitive input leakage, and returned as `INTERNAL_INVARIANT_FAILURE`.

No `console.warn` determines engineering acceptance.

## 6. Determinism and reproducibility

- Sort normalized rings, bars, fibers, vertices, and triangles deterministically where order is not
  semantically fixed.
- Use deterministic midpoint-refinement tie breaking.
- Randomized property/fuzz tests store seeds; production analysis uses no randomness.
- Cache keys include normalized input, exact standard edition/amendment/national annex, `methodId`,
  resistance-profile and adapter versions, engine version, dependencies affecting numerics, and
  expanded accuracy options.
- Results record platform/runtime information needed to investigate numeric differences.
- Do not round internal calculations; round only copied presentation values.

## 7. Concurrency and workers

CPU-heavy meshing and surface evaluation run outside the UI thread. Worker protocol messages are
versioned and contain only serializable data; compiled material evaluators are reconstructed inside
the worker from definitions.

Required release capabilities:

- cancellation through `AbortSignal`;
- monotone progress stages (`validate`, `mesh`, `surface`, `refine`, `check`, `finalize`);
- time and memory budgets;
- worker crash converted to typed failure;
- no acceptance of incomplete worker output;
- deterministic merge order for parallel batches.

Parallelism is optional and must produce tolerance-equivalent results to single-thread execution.

Current behavior is narrower: aborting a client request drops its late result, but a synchronous job
already executing in the worker or main-thread fallback is not interrupted. Monotone progress,
time/memory budgets for every job, and cooperative checkpoints are still open.

## 8. Performance budgets

Establish benchmark fixtures and explicit budgets for:

- ordinary compact section;
- hollow/thin-feature section;
- asymmetric section with many bars;
- design and verification accuracy profiles;
- batch of at least 100 demand points.

Measure validation, clipping, forward evaluation, adaptive refinement, topology validation, and
demand queries separately. Track peak memory and UI-blocking time.

Optimization order:

1. profile;
2. remove allocation/material lookup overhead in the fiber loop;
3. batch surface states;
4. add spatial acceleration for clipping and triangle queries;
5. parallelize deterministic independent batches;
6. consider higher-order/adaptive quadrature only with new V&V evidence.

Never loosen engineering tolerances as a hidden performance optimization.

### 8.1 Implemented fixtures and measured baseline

`packages/pm-analysis/bench/sections.ts` holds the fixture set required above: a compact square,
an asymmetric 60-bar wall, a circular and a hollow-circular pier, a thin-walled box, a concave
L-shaped core, the verified reference case, and the same geometry driven by a tabulated material law.
`npm run bench` runs each in its own process and reports min-of-N per stage.

Steps 2 and 4 are done. Measured with same-process A/B on the reference fixtures, every pair
producing a bit-identical result:

| Change | Effect |
|---|---|
| Constitutive parameters hoisted out of the fibre loop, KDS `n=2` closed-form law | ×1.94 |
| Same, tabulated 13-point law (per-call sort removed) | ×10.61 |
| Boundary-cell spatial classifier, `h` = 50 / 25 / 12.5 / 6.25 mm | ×2.06 / ×3.99 / ×6.06 / ×8.99 |
| One prepared mesh shared by surface, loadcases and field map | ×1.58 on a realistic UI flow |

The clipping win grows as the mesh refines, because the share of cells that touch the boundary
falls; this is what makes surface refinement affordable at all.

The material and mesh A/B figures above were remeasured on 2026-07-27 with Node 20.19.2; every
checksum/quadrature invariant had zero delta. The full eight-section fingerprint then reported
`IDENTICAL` over 24 capacity quantities per section. Steps 3, 5 and 6 remain open. Measurement note:
these figures use min-of-N same-process A/B runs. On a loaded workstation, identical code measured
back to back varied by up to a factor of two, so a single timed run is not evidence of anything.

## 9. Dependency governance

For each third-party package record:

- exact version and lockfile integrity;
- license and redistribution compatibility;
- maintenance/security status;
- numerical role and assumptions;
- wrapper interface and fallback plan;
- regression fixtures covering expected input degeneracies.

At minimum evaluate polygon clipping, runtime schema validation, robust predicates/triangulation if
used, Plotly, build tooling, and test frameworks. Plotly is not a calculation dependency.

Automated dependency updates must run full V&V regression; numerical packages are not auto-merged
on unit tests alone.

## 10. Security and misuse resistance

- Treat imported JSON as untrusted.
- Reject prototype-polluting keys and unexpected schema fields where practical.
- Limit vertices, holes, bars, material points, mesh levels, surface vertices, and execution time.
- Do not evaluate user JavaScript material functions.
- Escape all user labels in reports/plots.
- Avoid embedding full sensitive project data in telemetry or exception messages.
- Sign or hash certified result packages so downstream systems can detect modification.

## 11. Target reporting boundary

The current `@pm/report` output is a preview stress-strain calculation workbook plus stress-strain
mesh Excel/DXF. It does not consume a certified result DTO, does not render PDF, and does not yet
provide an equivalent-block ledger workbook.

Reports consume only certified result DTOs and must show:

- scope and exclusions;
- standard/edition/amendment/national annex, `methodId`, profile/adapter version, and verification
  state;
- reference frame and units;
- factored demand, governing design-resistance point, corresponding nominal/reference point, and
  the resistance stages applied exactly once;
- utilization definition and uncertainty interval;
- convergence evidence;
- warnings and independent-review status;
- engine version and result hash.

The report must not use phrases such as "code compliant" when any required adapter, convergence, or
V&V gate is incomplete.

## 12. Code quality gates

- TypeScript strict mode, including strict null checks and no implicit `any`;
- lint and format checks;
- no unchecked array access in numerical kernels unless guarded by construction and tested;
- exhaustive switches for discriminated unions;
- branch coverage focused on errors/edge cases, not only a global percentage;
- public API documentation and worked examples;
- architecture decision records for changes to mechanics, utilization, tolerances, or dependencies;
- peer review by both a numerical/software reviewer and a structural-engineering reviewer.
