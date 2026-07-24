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
| Design standard/profile identity and resistance sequencing | [`11-design-standards-and-resistance-formats.md`](11-design-standards-and-resistance-formats.md) | [`engineering/04-materials-and-design-standards.md`](engineering/04-materials-and-design-standards.md), [`10-normative-references-and-change-control.md`](10-normative-references-and-change-control.md) | Future design-code registry |
| Forward strain-state mechanics and resultants | [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md) | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | Future `@pm/analysis-core`; preview in `apps/web/lib/pm-preview-analysis.ts` |
| Service or inverse solver behavior | [`04-initial-guess-feasibility-newton.md`](04-initial-guess-feasibility-newton.md) | [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md) | Future service solver; preview detail in `apps/web/lib/pm-preview-analysis.ts` |
| Mesh sizing, convergence, numerical uncertainty | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | [`02-meshing-2d.md`](02-meshing-2d.md) | Future versioned analysis options |
| P-M surface, 19-point stations, strain-angle grid, 2D/3D plot semantics | [`05-pm-diagram-19points-angles-plotting.md`](05-pm-diagram-19points-angles-plotting.md) | [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md), [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | `apps/web/lib/pm-preview-analysis.ts`, `apps/web/components/section-editor/ResultsWorkspace.tsx` |
| Loadcase meaning, demand checks, result/report eligibility | [`engineering/05-loadings-analysis-results-and-reports.md`](engineering/05-loadings-analysis-results-and-reports.md) | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md) | Project loadings seed and Results sidebar |
| Package boundaries, dependency direction, runtime separation | [`development/01-architecture-and-package-boundaries.md`](development/01-architecture-and-package-boundaries.md) | [`08-software-architecture-and-api.md`](08-software-architecture-and-api.md) | Workspace packages |
| Project schema, persistence, versioning, migrations | [`development/02-data-contracts-persistence-and-versioning.md`](development/02-data-contracts-persistence-and-versioning.md) | [`08-software-architecture-and-api.md`](08-software-architecture-and-api.md) | `packages/pm-project` |
| Geometry/material implementation pipelines | [`development/03-geometry-and-material-pipelines.md`](development/03-geometry-and-material-pipelines.md) | Engineering geometry/material documents | `packages/pm-geometry`, `packages/pm-materials`, web editor |
| Analysis/results/report implementation pipelines | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md) | Engineering loadings/results document | Web Results preview, future engine/results/report packages |
| Tests, coding quality, AI workflow, review discipline | [`development/05-coding-quality-and-ai-workflow.md`](development/05-coding-quality-and-ai-workflow.md) | [`09-verification-validation-and-release.md`](09-verification-validation-and-release.md) | All packages and apps |
| Current status and roadmap | [`development/06-current-state-and-roadmap.md`](development/06-current-state-and-roadmap.md) | All documents above | Planning only |

## 3. Parameter Registry

These entries are intentionally explicit so engineers know where a number is allowed to change.
Accepted-analysis parameters must eventually live in versioned package options, not in React.

| Parameter or behavior | Current edit location | Authority | Status |
|---|---|---|---|
| Preview 19-point station schedule `P0..P18` | `apps/web/lib/pm-preview-analysis.ts` `PREVIEW_STATIONS` | [`05-pm-diagram-19points-angles-plotting.md`](05-pm-diagram-19points-angles-plotting.md) | preview only |
| Preview strain-plane angle grid for 3D surface | `apps/web/lib/pm-preview-analysis.ts` `buildPreviewSurface` | [`05-pm-diagram-19points-angles-plotting.md`](05-pm-diagram-19points-angles-plotting.md) | preview only; not a demand-moment angle |
| Preview concrete fiber density | `apps/web/lib/pm-preview-analysis.ts` `buildConcreteFibers` mesh options | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | preview only |
| Accepted mesh refinement, tolerances, and uncertainty budget | Future `@pm/analysis-core` versioned options | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | not implemented |
| KDS derived concrete parameters and defaults | `packages/pm-materials/src/standards/kds.ts` | [`11-design-standards-and-resistance-formats.md`](11-design-standards-and-resistance-formats.md) | preview/unverified |
| Concrete and steel material model contracts | `packages/pm-materials/src/*.ts` | [`engineering/04-materials-and-design-standards.md`](engineering/04-materials-and-design-standards.md) | preview |
| Rebar quick-generator defaults | `apps/web/components/section-editor/RebarPanel.tsx` `DEFAULT_PARAMS` | [`engineering/03-geometry-and-reinforcement.md`](engineering/03-geometry-and-reinforcement.md) | preview UI default |
| Loadcase input fields and units display | `apps/web/components/section-editor/LoadingsPanel.tsx` and project loadings types | [`engineering/02-data-conventions-and-terminology.md`](engineering/02-data-conventions-and-terminology.md), [`engineering/05-loadings-analysis-results-and-reports.md`](engineering/05-loadings-analysis-results-and-reports.md) | preview UI |
| Plotly adapter and chart interaction behavior | `apps/web/components/section-editor/PlotlyChart.tsx`, `ResultsWorkspace.tsx` | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md), [`05-pm-diagram-19points-angles-plotting.md`](05-pm-diagram-19points-angles-plotting.md) | preview presentation |

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
