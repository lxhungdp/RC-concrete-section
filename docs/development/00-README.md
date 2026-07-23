# Development Instructions — Package, Pipeline, and Coding Baseline

This group defines how software implements the approved engineering intent. It is for software
engineers and coding agents. Read the complete
[`../engineering/`](../engineering/00-README.md) group first.

## Read order

1. [`01-architecture-and-package-boundaries.md`](01-architecture-and-package-boundaries.md)
2. [`02-data-contracts-persistence-and-versioning.md`](02-data-contracts-persistence-and-versioning.md)
3. [`03-geometry-and-material-pipelines.md`](03-geometry-and-material-pipelines.md)
4. [`04-loadings-analysis-results-and-report-pipelines.md`](04-loadings-analysis-results-and-report-pipelines.md)
5. [`05-coding-quality-and-ai-workflow.md`](05-coding-quality-and-ai-workflow.md)
6. [`06-current-state-and-roadmap.md`](06-current-state-and-roadmap.md)

## Mandatory development principles

| ID | Rule |
|---|---|
| `DEV-001` | Engineering rules enter code through versioned contracts and profiles, never through UI conditionals. |
| `DEV-002` | Each pipeline stage has a typed input, typed success output, typed issues, and explicit invariants. |
| `DEV-003` | Persist serializable definitions; compile runtime functions after validation and never serialize them. |
| `DEV-004` | The calculation core is deterministic, immutable, environment-independent, and free of UI/report dependencies. |
| `DEV-005` | Package dependencies point inward toward stable domain contracts; circular dependencies are prohibited. |
| `DEV-006` | Invalid or non-converged engineering states fail closed; console messages are not acceptance logic. |
| `DEV-007` | Preview, accepted result, stale result, and released report are different types/states. |
| `DEV-008` | Tests trace to requirement IDs and include edge/failure behavior, not only happy paths. |
| `DEV-009` | Schema, numeric dependency, algorithm, and design-code changes are versioned and impact-assessed. |
| `DEV-010` | A coding AI may implement requirements but may not invent engineering assumptions or normative values. |

## Standard implementation pipeline

```text
RawDefinition
  -> ValidationReport
  -> NormalizedDefinition
  -> CompiledRuntimeModel
  -> AnalysisScenario
  -> EngineeringResult
  -> ResultViewModel
  -> ReportModel
  -> Excel/PDF
```

Do not bypass a stage for convenience. Do not send editor state directly to the kernel or compiled
functions into persistence.

## Definition of done for a development slice

A slice is complete only when:

- its engineering requirement IDs and scope are named;
- public data/API changes and compatibility are documented;
- validation and failure behavior are implemented;
- unit, integration, property/invariant, and regression tests appropriate to risk pass;
- no lower package imports UI, project state, plotting, report, browser, or network concerns;
- relevant documentation and current-state matrix are updated;
- result-impacting changes include provenance/version and V&V impact;
- the app demonstrates the slice without becoming a second source of engineering truth.
