# Single Source Control Map

Status: **authority map for documentation and implementation changes**.

This file prevents overlapping instructions. If a formula, tolerance, mesh parameter, design-code
factor, workflow rule, or result behavior appears in more than one place, use this map to decide the
single edit location first, then update downstream summaries, code, and tests.

## 1. How To Use This Map

| Change type | First action |
|---|---|
| Engineering formula, design-code rule, admissibility, or acceptance gate | Update the engineering authority named below, then implementation and verification evidence. |
| Software package/API/schema/workflow change | Update the development authority named below, then implementation and tests. |
| Mesh size, station schedule, plotting discretization, tolerance, or default | Update the parameter registry in this file before editing code. |
| Conflict between documents | Apply the authority order in [`00-README.md`](00-README.md), then correct the lower-authority document. |

Numbered root documents keep the detailed knowledge. Role READMEs summarize where to go; they must
not become separate formula books.

## 2. Topic Authority Map

| Topic | Edit here first | Detailed reference | Current implementation owner |
|---|---|---|---|
| Product scope, exclusions, lifecycle, release meaning | [`engineering/01-product-scope-and-workflow.md`](engineering/01-product-scope-and-workflow.md) | [`01-data-model-and-materials.md`](01-data-model-and-materials.md), [`07-integration-edge-cases-and-qa.md`](07-integration-edge-cases-and-qa.md) | Product/UI state only |
| Units, axes, origin, signs, terminology | [`engineering/02-data-conventions-and-terminology.md`](engineering/02-data-conventions-and-terminology.md) | [`01-data-model-and-materials.md`](01-data-model-and-materials.md), [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md) | Project schema and UI formatters |
| Geometry topology, holes, exact boundary, cover, rebar interpretation | [`engineering/03-geometry-and-reinforcement.md`](engineering/03-geometry-and-reinforcement.md) | [`02-meshing-2d.md`](02-meshing-2d.md) | `packages/pm-geometry`, web section editor |
| Material definitions and admissibility | [`engineering/04-materials-and-design-standards.md`](engineering/04-materials-and-design-standards.md) | [`01-data-model-and-materials.md`](01-data-model-and-materials.md), [`11-design-standards-and-resistance-formats.md`](11-design-standards-and-resistance-formats.md) | `packages/pm-materials` |
| Design standard/profile identity and resistance sequencing | [`11-design-standards-and-resistance-formats.md`](11-design-standards-and-resistance-formats.md) | [`engineering/04-materials-and-design-standards.md`](engineering/04-materials-and-design-standards.md), [`10-normative-references-and-change-control.md`](10-normative-references-and-change-control.md) | `packages/pm-design`, code adapters |
| The two calculation models, formulas, defaults, and workflows | [`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md) | [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md), [`05-pm-diagram-19points-angles-plotting.md`](05-pm-diagram-19points-angles-plotting.md) | `packages/pm-analysis`, `packages/pm-equivalent-block`, `packages/pm-analysis-equivalent-block` |
| Forward strain-state mechanics and resultants | [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md) | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | `packages/pm-analysis` |
| Service or inverse solver behavior | [`04-initial-guess-feasibility-newton.md`](04-initial-guess-feasibility-newton.md) | [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md) | `packages/pm-analysis`, `packages/pm-equivalent-block` |
| Mesh sizing, convergence, numerical uncertainty | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | [`02-meshing-2d.md`](02-meshing-2d.md) | versioned analysis-options DTOs in `packages/pm-project` |
| P-M surface, model-specific stations, direction refinement, 2D/3D plot semantics | [`05-pm-diagram-19points-angles-plotting.md`](05-pm-diagram-19points-angles-plotting.md) | [`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md), [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | analysis packages and `ResultsWorkspace.tsx` |
| Loadcase meaning, demand checks, result/report eligibility | [`engineering/05-loadings-analysis-results-and-reports.md`](engineering/05-loadings-analysis-results-and-reports.md) | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md) | Project loadings seed and Results sidebar |
| Package boundaries, dependency direction, runtime separation | [`development/01-architecture-and-package-boundaries.md`](development/01-architecture-and-package-boundaries.md) | [`08-software-architecture-and-api.md`](08-software-architecture-and-api.md) | Workspace packages |
| Project schema, persistence, versioning, and current parser normalization | [`development/02-data-contracts-persistence-and-versioning.md`](development/02-data-contracts-persistence-and-versioning.md) | [`08-software-architecture-and-api.md`](08-software-architecture-and-api.md) | `packages/pm-project`; schema version is v1 and no version-migration layer exists |
| Geometry/material implementation pipelines | [`development/03-geometry-and-material-pipelines.md`](development/03-geometry-and-material-pipelines.md) | Engineering geometry/material documents | `packages/pm-geometry`, `packages/pm-materials`, web editor |
| Analysis/results/report implementation pipelines | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md) | Engineering loadings/results document | Current web worker, analysis packages, `@pm/report`; accepted-result/report packages remain future work |
| Tests, coding quality, AI workflow, review discipline | [`development/05-coding-quality-and-ai-workflow.md`](development/05-coding-quality-and-ai-workflow.md) | [`09-verification-validation-and-release.md`](09-verification-validation-and-release.md) | All packages and apps |
| Current status and roadmap | [`development/06-current-state-and-roadmap.md`](development/06-current-state-and-roadmap.md) | All documents above | Planning only |

## 3. Parameter Registry

These entries are intentionally explicit so engineers know where a number is allowed to change.
Accepted-analysis parameters must eventually live in versioned package options, not in React.

| Parameter or behavior | Current edit location | Authority | Status |
|---|---|---|---|
| Stress-strain 25-station schedule and nine transition nodes | `packages/pm-project/src/analysis-options.ts` | [`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md) | implemented preview |
| Stress-strain 36-direction seed and 0.5% adaptive refinement | `packages/pm-project/src/analysis-options.ts` | [`05-pm-diagram-19points-angles-plotting.md`](05-pm-diagram-19points-angles-plotting.md) | implemented preview; not a demand-moment angle |
| Equivalent-block 37-state/24-direction adaptive defaults | `packages/pm-project/src/analysis-options.ts` | [`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md) | implemented preview |
| Canonical resultant signs and any kernel-to-project sign mapping | `engineering/02-data-conventions-and-terminology.md`, then the application bridge | [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md) | stress-strain conforms; equivalent-block `My` bridge discrepancy is open and blocking |
| Concrete integration-mesh density | `AnalysisOptions.mesh` and `packages/pm-geometry` | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | used only by stress-strain integration |
| Mesh/refinement tolerances and uncertainty evidence | versioned analysis-options DTOs and returned surface evidence | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | implemented preview; accepted-result gate remains open |
| KDS derived concrete parameters and defaults | `packages/pm-materials/src/standards/kds.ts` | [`11-design-standards-and-resistance-formats.md`](11-design-standards-and-resistance-formats.md) | preview/unverified |
| Concrete and steel material model contracts | `packages/pm-materials/src/*.ts` | [`engineering/04-materials-and-design-standards.md`](engineering/04-materials-and-design-standards.md) | preview |
| Rebar quick-generator defaults | `apps/web/components/section-editor/RebarPanel.tsx` `DEFAULT_PARAMS` | [`engineering/03-geometry-and-reinforcement.md`](engineering/03-geometry-and-reinforcement.md) | preview UI default |
| Loadcase input fields and units display | `apps/web/components/section-editor/LoadingsPanel.tsx` and project loadings types | [`engineering/02-data-conventions-and-terminology.md`](engineering/02-data-conventions-and-terminology.md), [`engineering/05-loadings-analysis-results-and-reports.md`](engineering/05-loadings-analysis-results-and-reports.md) | preview UI |
| Plotly adapter and chart interaction behavior | `apps/web/components/section-editor/PlotlyChart.tsx`, `ResultsWorkspace.tsx` | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md), [`05-pm-diagram-19points-angles-plotting.md`](05-pm-diagram-19points-angles-plotting.md) | preview presentation |
| Result and mesh audit exports | `packages/pm-report`, `ResultsWorkspace.tsx`, `AnalysisMeshWorkspace.tsx` | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md) | stress-strain result workbook and mesh Excel/DXF implemented; equivalent-block result workbook not implemented |

Rule: before a preview parameter is used for accepted results, move it into a versioned package
contract, add provenance, and update this registry.

Classic pitfall: a surface-sampling angle or neutral-axis/strain-plane angle is not the load moment
direction. Loadcase checks and `P-Mtheta` slices must compute `thetaLoad = atan2(Muy, Mux)` and
query the completed `P-Mx-My` surface geometrically. Do not select a sampled angle row just because
its label is numerically close to `thetaLoad`.

## 4. No-Duplication Rules

- Summaries may describe intent, but formulas, coefficients, mesh numbers, tolerances, and status
  gates must point to the mapped authority instead of repeating independent values.
- Code constants that affect results should reference the mapped authority in a short comment or
  nearby test name.
- Existing examples and spreadsheets are regression evidence. They do not override standards,
  engineering authority, or verified design-code profiles.
- If a future change needs a new owner, update this file in the same change set.

## 5. Preserved Reference Set

The refactor keeps the old knowledge by preserving these detailed references:

`01-data-model-and-materials.md`,
`02-meshing-2d.md`,
`03-forward-analysis-and-jacobian.md`,
`04-initial-guess-feasibility-newton.md`,
`05-pm-diagram-19points-angles-plotting.md`,
`06-mesh-sizing-and-convergence.md`,
`07-integration-edge-cases-and-qa.md`,
`08-software-architecture-and-api.md`,
`09-verification-validation-and-release.md`,
`10-normative-references-and-change-control.md`,
`11-design-standards-and-resistance-formats.md`,
all files under `engineering/`, and all files under `development/`.
