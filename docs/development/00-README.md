# Development Instructions - Package, Pipeline, and Coding Baseline

This group is for software engineers and coding agents. It explains how the code implements approved
engineering intent. Read [`../engineering/00-README.md`](../engineering/00-README.md) first, then use
[`../01-control-map.md`](../01-control-map.md) before changing formulas, parameters, schemas, result
behavior, or package ownership.

## 1. Read Order

| Step | Document | Use it for |
|---|---|---|
| 1 | [`01-architecture-and-package-boundaries.md`](01-architecture-and-package-boundaries.md) | Package ownership, dependency direction, runtime separation. |
| 2 | [`02-data-contracts-persistence-and-versioning.md`](02-data-contracts-persistence-and-versioning.md) | Sole current v1 project/options/method/schedule contracts and parser-v1 behavior; no migration/backward-compatibility layer. |
| 3 | [`03-geometry-and-material-pipelines.md`](03-geometry-and-material-pipelines.md) | Validation, normalization, compilation, UI-to-domain boundaries. |
| 4 | [`04-loadings-analysis-results-and-report-pipelines.md`](04-loadings-analysis-results-and-report-pipelines.md) | Loadcase data, engine orchestration, results, Plotly adapter, reports. |
| 5 | [`05-coding-quality-and-ai-workflow.md`](05-coding-quality-and-ai-workflow.md) | Testing discipline, review workflow, AI coding constraints. |
| 6 | [`06-current-state-and-roadmap.md`](06-current-state-and-roadmap.md) | Current implementation status and phased delivery order. |
| 7 | [`07-design-resistance-implementation.md`](07-design-resistance-implementation.md) | Nominal/design separation, factored ULS checks, UI, workbook and verification status. |
| 8 | [`08-standard-code-method-model-registry.md`](08-standard-code-method-model-registry.md) | Code -> method -> concrete-model capabilities, EN factor ownership, AS fail-closed scope. |

The numbered root files are technical references, not competing implementation instructions. The
control map names the single owner for each rule or parameter.

The current two-kernel routing and numerical defaults are summarized in
[`../12-calculation-models-defaults-and-workflows.md`](../12-calculation-models-defaults-and-workflows.md).

## 2. Mandatory Development Principles

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

## 3. Standard Pipeline

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

Do not bypass stages. Do not send editor state directly to the kernel or compiled functions into
persistence.

This is the target accepted-product pipeline. The current preview implements persisted definitions,
validation/preparation, numerical surfaces/checks, UI view models, a shared format-neutral
`ReportModel`, formula-audited result workbooks for both mechanics, stress-strain mesh Excel/DXF,
and a deterministic watermarked preview PDF. It does not yet implement immutable `AcceptedResult`,
result identity/signature, or released-report eligibility and approval.

## 4. Definition Of Done

A development slice is complete only when:

- requirement IDs and engineering scope are named;
- public data/API changes and compatibility are documented;
- validation and failure behavior are implemented;
- suitable unit, integration, property/invariant, and regression tests pass;
- lower packages do not import UI, project state, plotting, report, browser, or network concerns;
- current-state docs and the control map are updated when ownership or parameters change;
- result-impacting changes include provenance/version and verification impact.
