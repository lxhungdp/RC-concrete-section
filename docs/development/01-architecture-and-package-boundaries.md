# Architecture and Package Boundaries

## 1. Architectural style

Use a functional calculation core surrounded by adapters:

```text
apps/web, import/export, Excel/PDF, plots
                    |
             application/use cases
                    |
            orchestration engine
          /      |       |       \
   geometry  materials loadings design-code profiles
          \      |       |       /
          domain contracts + numerical primitives
```

Dependencies point downward/inward. The core never imports React, Next.js, DOM APIs, Plotly,
filesystem/network APIs, project UI state, or report libraries.

## 2. Current packages and required responsibility

| Package | Current responsibility | Boundary to preserve/harden |
|---|---|---|
| `@pm/units` | immutable presentation selections, explicit canonical/display boundary conversion and editable formatting | no engineering equations, solver, React, storage or I/O; kernels cannot depend on it |
| `@pm/ids` | positive integer allocation/gap fill | identity utilities only; no engineering meaning |
| `@pm/geometry` | editor DTO, primitives/booleans, properties, rebar helpers | split public submodules for definitions, validation, normalization, exact properties, rebar validation, and analysis adapters |
| `@pm/materials` | material DTOs, stores, model compilers, KDS helpers | definitions/validation/compilation only; no complete design-code claim in a material tag |
| `@pm/project` | canonical project-v3 DTO and load-reference translation, explicit centroidal v1/v2 readers, JSON parse/serialize, warnings, round-trip | persistence envelope and profile/options registry; no numerical analysis or UI behavior; documented version-specific defaults and one-time legacy area materialization |
| `@pm/design` | DesignBasis identity, resistance formats/factors, transition rules, and material-set preparation | generic resistance sequencing; no geometry solving or UI state |
| `@pm/results` | mechanics-neutral adequacy status, utilization interval, and screening classification policy | no surface construction, material/resistance recomputation, React, or report formatting |
| `@pm/analysis` | stress-strain preparation, forward/inverse mechanics, adaptive surface, slices, demand checks, and field maps | stress-strain route only; no equivalent-block emulation |
| `@pm/equivalent-block` | standard-independent block preparation, clipping, forward/inverse solvers, surfaces, topology, and admissibility | no project schema, UI, or KDS/ACI constants |
| `@pm/code-kds142020` | KDS block law, endpoints, phi transition, and cap | KDS policy only; no generic clipping or project state |
| `@pm/code-aci318` | ACI 318-19(22) Whitney law, endpoints, phi transition, and cap | ACI policy only; no generic clipping or project state |
| `@pm/code-custom` | user-declared block law, endpoints, phi transition, and cap | derives nothing from a code table; validates ranges and uses what the project gives it; never claims clause traceability |
| `@pm/analysis-equivalent-block` | project/profile/result bridge for the block kernel and adapters | routing/normalization only; do not merge it into the stress-strain kernel |
| `@pm/report` | result workbooks for both mechanics, stress-strain mesh Excel/DXF, the format-neutral `ReportModel`, and the PDF renderer on the `@pm/report/pdf` subpath | shared spine in `workbook-common.ts`; the PDF is deliberately not re-exported from the index so the analysis worker never bundles it; no accepted-result release contract yet |
| `@structures/cad-drawing` | reusable view/navigation foundation | presentation only; never an analysis dependency |
| `@pm/web` | current integrated editor | application composition only; move reusable domain/use-case logic into packages |

The current packages are the starting boundaries. Do not rewrite them into one application module.

`@pm/report` declares `sideEffects: false`: its modules define data/functions and perform no
registration or external work at import time. This allows consumers of filenames/error types to
avoid loading workbook builders and their numerical dependencies in the initial browser bundle.
Preserve that import-time purity; actual export work remains inside the explicitly called builders.

## 3. Possible future extractions — not current package names

The following rows describe possible later ownership boundaries. A row explicitly marked
`extension` grows an existing package; the other names are not import targets in the current
repository and must not be cited as if they already own runtime behavior. Add one only when its
contract is exercised by a real slice and movement from the current owners is explicit.

| Package | Owns | Must not own |
|---|---|---|
| `@pm/domain` | branded canonical quantities, issue/result types, provenance identities, hashes/contracts | React, storage, design-code coefficients |
| `@pm/loadings` | load case/combination definitions, validation, transformations | section resistance or UI tables |
| `@pm/analysis-core` | fibers/quadrature, forward mechanics, scaled algebra, service solver, surface numerical primitives | code selection, UI, report formatting |
| `@pm/design-codes` | registry and versioned profile adapters with clause trace | global current standard, UI state, generic geometry editing |
| `@pm/engine` | validate/normalize/compile/orchestrate/check/cancel/progress/cache protocol | presentation rendering |
| `@pm/results` extension | grow the existing classification package into immutable result DTOs, query helpers, and plot/report-neutral view models | recomputation of material/resistance rules |
| `@pm/report` extension | accepted-result report model plus Excel/PDF adapters | acceptance decisions or hidden recalculation |

In the current repository, `@pm/analysis` and `@pm/analysis-equivalent-block` provide most engine/
result functions, `@pm/results` owns the shared three-state classification slice, and the web worker
orchestrates them. `@pm/project` may depend on serializable
definition types, but it does not depend on compiled evaluators or the analysis engine. The current
`@pm/report` still accepts preview calculation inputs; the target dependency direction is for its
release renderers to consume accepted result contracts, never the other way around.

## 4. Dependency rules

| ID | Rule |
|---|---|
| `DEV-ARCH-001` | No circular workspace-package dependency. |
| `DEV-ARCH-002` | A package imports another package only through its public exports, not deep private paths. |
| `DEV-ARCH-003` | Domain packages do not import `apps/*`. |
| `DEV-ARCH-004` | Geometry and material packages do not import one another; cross-references are resolved in orchestration through IDs/contracts. |
| `DEV-ARCH-005` | Standard adapters depend on stable kernel contracts; the kernel does not select/import a concrete standard profile. |
| `DEV-ARCH-006` | Results/report packages cannot mutate or reconstruct accepted engineering results. |
| `DEV-ARCH-007` | Third-party numerical/geometry/report libraries are wrapped behind local interfaces. |

Use a dependency check in CI once new packages are introduced.

## 5. Public API policy

Each package has:

- a small root export for stable common APIs;
- explicit subpath exports when different consumers need separate definition/runtime adapters;
- runtime schemas for public unknown/JSON data;
- discriminated result/issue types;
- no default branch that silently substitutes another engineering model;
- semantic version/provenance identity for result-affecting behavior.

Public functions either accept already validated branded/normalized types or perform a clearly named
validation/parse step. A function named `summarize` does not imply full analysis validation.

## 6. Application/use-case layer

The current `SectionDrawingClient.tsx` contains editor state, geometry operations, project I/O,
module navigation, and rendering in one component. Preserve its behavior while extracting by use
case:

```text
features/geometry/   editor state, apply command, geometry panels
features/materials/  material definition editor and preview
features/loadings/   cases/combinations editor
features/results/    run state, per-combination tables, plots
features/report/     report options, preview, release/download
application/         project session, stale-state graph, analysis jobs
```

Feature code calls package APIs. It does not reproduce geometry formulas, material derivations, load
transformations, utilization, or report acceptance logic.

The `/geometry` route presents the same section editor with a single Section menu. Both routes use
the shared [workspace design system](09-workspace-design-system.md), including light/dark chrome,
controls and transient sidebar resizing. Its existing independent drawing palette remains scoped
to `#geometry-workspace`. Concrete/Rebar editing, project I/O, validation, units, and applied-section
state use the same owners. The route adds only presentation controls for selection and fitting the
camera; it changes no engineering DTO, calculation, schema, or verification status.

## 7. State and invalidation

Maintain separate state for:

- editor drafts (camera, selection, locks, unapplied boundaries);
- canonical applied project inputs;
- normalized/compiled transient cache;
- analysis job state/progress/cancellation;
- immutable result history and current result pointer;
- report drafts/releases.

The current input hash includes geometry, materials, loadings, design basis, and expanded analysis
options. When it changes, any result with a different hash is `stale`; report release is disabled.

## 8. Workers, performance, and determinism

CPU-heavy meshing, surface generation, demand checks, field maps, and exports currently run in a Web
Worker when available. Worker messages contain serializable definitions and results; compiled
material functions are rebuilt inside the worker. A main-thread fallback exists.

Current abort behavior is boundary cancellation: the client stops waiting and drops a late worker
result, but a synchronous job already executing in the worker or fallback is not cooperatively
interrupted. Progress stages, time budgets, and inner-loop cancellation checkpoints remain release
requirements rather than implemented behavior.

All loops must ultimately have resource/time limits, cooperative cancellation, progress stages, and deterministic merge order.
Single-thread and parallel paths must be tolerance-equivalent. Performance work follows profiling
and may not silently loosen engineering tolerances.

### Optional workspace chunk preloads

`SectionDrawingClient` preloads results and mesh/block views on menu hover/focus. These optional
imports handle rejected promises locally, just like the existing Plotly preload. Actual navigation
continues through `next/dynamic`: it can retry a failed preload, while a persistent mount failure
remains visible through the application recovery boundary. No global rejection suppression,
automatic document reload, alternate calculation route or input mutation is introduced.

The 2026-10-27 transport fix is presentation-only and changes no numerical/schema/report contract.
`tools/verification/module-loading/browser.mjs` blocks chunk requests in an isolated production
browser. Before the fix, repeated hover/focus generated four unhandled results rejections and eight
mesh/block rejections. Verification requires zero optional-preload rejections after the fix,
successful view mounting once requests recover, and visible recovery for a permanently failed
navigation. Both production and the running localhost:3001 Webpack dev server pass these preload
and recovery checks after the fix; persistent-failure recovery is checked in production, including
exactly one main-document request. Full `npm test`, production build and existing bundle budgets
pass. Evidence is kept under ignored `outputs/module-loading/`.

The original dev endpoint returned HTTP 200 during investigation. The initial transient network/
chunk failure was not independently reproduced without fault injection; its network cause remains
unconfirmed. The original stack and before/after browser checks identify the unhandled optional
import rejections as the cause of the repeated application-error logs.

## 9. Dependency governance

Pin exact production and development versions instead of `latest` or floating ranges for released
engineering builds. Record license, numerical role, assumptions, wrapper, security status, and
regression coverage. A lockfile alone does not make a floating manifest an intentional dependency
policy.

The supported public-preview execution line is Node.js `24.x` with npm `11.x`. Root
`engines`/`devEngines`, the repository `.npmrc` strict-engine policy, and the shared runtime guard
reject Node.js 20/22 and npm 10/12 while permitting compatible patch releases selected by a managed
deployment platform. `.nvmrc` and `packageManager` retain the preferred reference pair Node.js
`24.20.0`/npm `11.19.0`; CI verifies that exact pair so numerical and generated-artifact evidence is
reproducible. CI actions must themselves use the Node.js 24 action runtime. Node/npm do not define
an engineering coefficient, but a runtime change can alter parsing, floating-point execution paths,
bundling, or report bytes; therefore evidence produced on another patch must record its runtime and
pass the applicable portability, numerical-matrix, workbook/PDF, build, security, and bundle gates.

Numerically relevant dependency updates receive change classification and full affected regression,
not automatic merge after type checking alone.

## 10. Physical repository layout

The physical tree follows ownership and execution role. Folder names are plural, lowercase, and
stable; spaces are prohibited in new paths.

```text
apps/web/
  app/                         Next.js route entry points only
  application/analysis/        worker client, serializable contract, presentation DTO packing
  features/section-editor/
    analysis/                   analysis configuration and mesh workspace
    design/                     resistance-basis UI
    geometry/                   section/rebar input and geometry file adapters
    loadings/                   loadcase input
    materials/                  material and calculation-profile input
    results/                    result view state, plots and demand evidence
    shared/                     feature-local presentation utilities
  test/                         web unit tests, grouped by feature/application concern
  workers/                      worker runtime entry points only

packages/<workspace-package>/
  src/                          production runtime and public exports only
  test/                         unit/integration verification; never exported
  bench/                        package-owned performance fixtures and baselines, when needed

docs/examples/
  equivalent-block/            compact generated project fixtures
  reference-case/              archived external/reference workbooks and reports

tools/
  fixtures/                     deterministic fixture generators
  verification/                engineering comparison and verification utilities

bench/
  equivalent-block/            block-kernel performance work
  stress-strain/               fibre/strain-domain performance work
  cross-model/                 comparisons spanning mechanics
```

Rules:

- `src` cannot contain files named `*.test.ts`, `*.selftest.ts`, benchmark runners, or reference
  fixtures;
- tests may import a package through its public API, or use a relative `../src` import when the test
  intentionally verifies an internal package contract;
- examples are immutable verification inputs unless a named generator owns them; generated report
  outputs must not appear as unexplained source changes;
- worker clients and workers share types only through `application/analysis/worker-contract.ts`;
  neither side imports the other's runtime module;
- moving a public module requires a compatibility export or an explicit API change record. Moving
  test/bench/docs files requires updating every script and traceability reference in the same patch.

`npm run check:structure` enforces the non-negotiable physical rules and runs before the full test
pipeline. Extend that gate whenever a new repository-level layout invariant is adopted.
