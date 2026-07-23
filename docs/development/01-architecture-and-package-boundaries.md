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
| `@pm/ids` | positive integer allocation/gap fill | identity utilities only; no engineering meaning |
| `@pm/geometry` | editor DTO, primitives/booleans, properties, rebar helpers | split public submodules for definitions, validation, normalization, exact properties, rebar validation, and analysis adapters |
| `@pm/materials` | material DTOs, stores, model compilers, KDS helpers | definitions/validation/compilation only; no complete design-code claim in a material tag |
| `@pm/project` | project v2 DTO, JSON parse/serialize, warnings, round-trip | persistence envelope and migrations; no numerical analysis or UI behavior |
| `@structures/cad-drawing` | reusable view/navigation foundation | presentation only; never an analysis dependency |
| `@pm/web` | current integrated editor | application composition only; move reusable domain/use-case logic into packages |

The current packages are the starting boundaries. Do not rewrite them into one application module.

## 3. Target packages

Add packages only when their contract is exercised by a real slice. Target responsibilities are:

| Package | Owns | Must not own |
|---|---|---|
| `@pm/domain` | branded canonical quantities, issue/result types, provenance identities, hashes/contracts | React, storage, design-code coefficients |
| `@pm/loadings` | load case/combination definitions, validation, transformations | section resistance or UI tables |
| `@pm/analysis-core` | fibers/quadrature, forward mechanics, scaled algebra, service solver, surface numerical primitives | code selection, UI, report formatting |
| `@pm/design-codes` | registry and versioned profile adapters with clause trace | global current standard, UI state, generic geometry editing |
| `@pm/engine` | validate/normalize/compile/orchestrate/check/cancel/progress/cache protocol | presentation rendering |
| `@pm/results` | immutable result DTOs, query helpers, plot/report-neutral view models | recomputation of material/resistance rules |
| `@pm/report` | report model plus Excel/PDF adapters | acceptance decisions or hidden recalculation |

`@pm/project` may depend on serializable definition types, but it does not depend on compiled
evaluators or the analysis engine. `@pm/report` depends on accepted result contracts, never the other
way around.

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

CPU-heavy validation, meshing, surface generation, and batch checks run outside the UI thread when
needed. Worker messages contain serializable versioned definitions and results. Compiled material
functions are rebuilt inside the worker.

All loops have resource/time limits, cancellation, progress stages, and deterministic merge order.
Single-thread and parallel paths must be tolerance-equivalent. Performance work follows profiling
and may not silently loosen engineering tolerances.

## 9. Dependency governance

Pin exact production and development versions instead of `latest` or floating ranges for released
engineering builds. Record license, numerical role, assumptions, wrapper, security status, and
regression coverage. A lockfile alone does not make a floating manifest an intentional dependency
policy.

Numerically relevant dependency updates receive change classification and full affected regression,
not automatic merge after type checking alone.
