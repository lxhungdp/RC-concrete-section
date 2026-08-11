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
| The two calculation models, formulas, defaults, and workflows | [`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md) | [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md), [`05-pm-diagram-stations-angles-plotting.md`](05-pm-diagram-stations-angles-plotting.md) | `packages/pm-analysis`, `packages/pm-equivalent-block`, `packages/pm-analysis-equivalent-block` |
| Forward strain-state mechanics and resultants | [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md) | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | `packages/pm-analysis` |
| Service or inverse solver behavior | [`04-initial-guess-feasibility-newton.md`](04-initial-guess-feasibility-newton.md) | [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md) | `packages/pm-analysis`, `packages/pm-equivalent-block` |
| Mesh sizing, convergence, numerical uncertainty | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | [`02-meshing-2d.md`](02-meshing-2d.md) | versioned analysis-options DTOs in `packages/pm-project` |
| P-M surface, shared stations, direction refinement, 2D/3D plot semantics | [`05-pm-diagram-stations-angles-plotting.md`](05-pm-diagram-stations-angles-plotting.md) | [`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md), [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | analysis packages and `ResultsWorkspace.tsx` |
| Loadcase meaning, demand checks, result/report eligibility | [`engineering/05-loadings-analysis-results-and-reports.md`](engineering/05-loadings-analysis-results-and-reports.md) | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md) | Project loadings seed and Results sidebar |
| Package boundaries, dependency direction, runtime separation | [`development/01-architecture-and-package-boundaries.md`](development/01-architecture-and-package-boundaries.md) | [`08-software-architecture-and-api.md`](08-software-architecture-and-api.md) | Workspace packages |
| Project schema, persistence, versioning, and v1 parser behavior | [`development/02-data-contracts-persistence-and-versioning.md`](development/02-data-contracts-persistence-and-versioning.md) | [`08-software-architecture-and-api.md`](08-software-architecture-and-api.md) | `packages/pm-project`; the outer project schema is v1 with documented within-v1 normalization, but no cross-version migration framework exists |
| Geometry/material implementation pipelines | [`development/03-geometry-and-material-pipelines.md`](development/03-geometry-and-material-pipelines.md) | Engineering geometry/material documents | `packages/pm-geometry`, `packages/pm-materials`, web editor |
| Analysis/results/report implementation pipelines | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md) | Engineering loadings/results document | Current web worker, analysis packages, `@pm/report`; accepted-result/report packages remain future work |
| Tests, coding quality, AI workflow, review discipline | [`development/05-coding-quality-and-ai-workflow.md`](development/05-coding-quality-and-ai-workflow.md) | [`09-verification-validation-and-release.md`](09-verification-validation-and-release.md) | All packages and apps |
| Current status and roadmap | [`development/06-current-state-and-roadmap.md`](development/06-current-state-and-roadmap.md) | All documents above | Planning only |

## 3. Parameter Registry

These entries are intentionally explicit so engineers know where a number is allowed to change.
Accepted-analysis parameters must eventually live in versioned package options, not in React.

| Parameter or behavior | Current edit location | Authority | Status |
|---|---|---|---|
| Shared 27-station schedule for both mechanics | `packages/pm-stations/src/index.ts` | [`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md) | implemented preview |
| Mutually exclusive sampling modes: editable fixed 27 × 36, or independent adaptive from 12 criteria + 2 poles × 12 directions at 1% tolerance | `packages/pm-project/src/analysis-options.ts` | [`05-pm-diagram-stations-angles-plotting.md`](05-pm-diagram-stations-angles-plotting.md) | implemented for both mechanics; adaptive meridians own their station sets and are never paired by station-array index |
| Resultant signs | `engineering/02-data-conventions-and-terminology.md`, then each mechanics ledger | [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md) | implemented consistently: `Mx = ΣF(y-yc)`, `My = ΣF(x-xc)` in both mechanics, DTOs, plots and exports; asymmetric ledger tests guard the contract |
| Concrete integration-mesh density | `AnalysisOptions.mesh` and `packages/pm-geometry` | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | used only by stress-strain integration |
| Mesh/refinement tolerances and uncertainty evidence | versioned analysis-options DTOs and returned surface evidence | [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md) | implemented preview; accepted-result gate remains open |
| Report content and page order | `packages/pm-report/src/model/report-model.ts` (what the report says) and `packages/pm-report/src/pdf/column-report.ts` (how it is laid out) | [`engineering/05-loadings-analysis-results-and-reports.md`](engineering/05-loadings-analysis-results-and-reports.md) §6 | implemented preview; the model formats kernel results and introduces no factor, rounding rule or adequacy test |
| Governing check composed onto an inverse state | `packages/pm-analysis` `applyDesignCheckToInverse` | [`engineering/05-loadings-analysis-results-and-reports.md`](engineering/05-loadings-analysis-results-and-reports.md) | one owner for worker and report; the inverse's own utilization is the fixed-P diagnostic, not the governing number |
| Workbook defined-name legality | `packages/pm-report/src/excel/workbook-common.ts` `invalidDefinedNameReason` | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md) | one rule for both workbooks; deliberately stricter than Excel so a name is legal in every engine that may open the file |
| KDS derived concrete parameters and defaults | `packages/pm-materials/src/standards/kds.ts` | [`11-design-standards-and-resistance-formats.md`](11-design-standards-and-resistance-formats.md) | preview/unverified |
| EN 1992 material/design policy | `packages/pm-code-en1992` consumed by `packages/pm-materials` and `packages/pm-design` | [`11-design-standards-and-resistance-formats.md`](11-design-standards-and-resistance-formats.md) | executable draft; no National Annex and incomplete EC2 strain-domain boundary |
| AS 3600 equivalent block and capacity-factor policy | `packages/pm-code-as3600` through `packages/pm-analysis-equivalent-block` | [`11-design-standards-and-resistance-formats.md`](11-design-standards-and-resistance-formats.md) | executable draft; unverified and not releasable |
| Concrete and steel material model contracts | `packages/pm-materials/src/*.ts` | [`engineering/04-materials-and-design-standards.md`](engineering/04-materials-and-design-standards.md) | preview |
| Rebar quick-generator defaults | `apps/web/features/section-editor/geometry/RebarPanel.tsx` `DEFAULT_PARAMS` | [`engineering/03-geometry-and-reinforcement.md`](engineering/03-geometry-and-reinforcement.md) | preview UI default |
| Loadcase input fields and units display | `apps/web/features/section-editor/loadings/LoadingsPanel.tsx` and project loadings types | [`engineering/02-data-conventions-and-terminology.md`](engineering/02-data-conventions-and-terminology.md), [`engineering/05-loadings-analysis-results-and-reports.md`](engineering/05-loadings-analysis-results-and-reports.md) | preview UI |
| Plotly adapter and chart interaction behavior | `apps/web/features/section-editor/results/PlotlyChart.tsx`, `ResultsWorkspace.tsx` | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md), [`05-pm-diagram-stations-angles-plotting.md`](05-pm-diagram-stations-angles-plotting.md) | preview presentation |
| Result and mesh audit exports | `packages/pm-report`, `ResultsWorkspace.tsx`, `AnalysisMeshWorkspace.tsx` | [`development/04-loadings-analysis-results-and-report-pipelines.md`](development/04-loadings-analysis-results-and-report-pipelines.md) | both result workbooks, mesh Excel/DXF, shared `ReportModel`, and watermarked preview PDF implemented; accepted-result and released-report gates remain open |
| Calculation-profile identity: mechanics, material standard, resistance profile | `packages/pm-project/src/calculation-profiles.ts` `CALCULATION_PROFILES` | [`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md) | one table; persistence validation and the atomic Materials apply both read it instead of re-deriving from the profile id |
| User-defined block parameters `beta1`, `alpha`, `epsCu` | `packages/pm-materials` `user-block` concrete model, edited in `apps/web/features/section-editor/materials/MaterialPanel.tsx` | [`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md) §3 | implemented preview; the value reaching the kernel is `userBlockCompressionStress`, so display and integration cannot diverge |
| User-defined resistance factors and transition rule | `DesignBasis` with `profileId: custom-user-defined`, edited in `apps/web/features/section-editor/design/DesignBasisPanel.tsx` | [`11-design-standards-and-resistance-formats.md`](11-design-standards-and-resistance-formats.md) | `user-defined` status; no override narrative is required because there is no code default to deviate from |
| Results chart presentation state (angles, visibility, resistance stage) | `apps/web/features/section-editor/results/results-view.ts` | [`05-pm-diagram-stations-angles-plotting.md`](05-pm-diagram-stations-angles-plotting.md) | preview presentation; nothing here changes a resultant |

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
`05-pm-diagram-stations-angles-plotting.md`,
`06-mesh-sizing-and-convergence.md`,
`07-integration-edge-cases-and-qa.md`,
`08-software-architecture-and-api.md`,
`09-verification-validation-and-release.md`,
`10-normative-references-and-change-control.md`,
`11-design-standards-and-resistance-formats.md`,
all files under `engineering/`, and all files under `development/`.
