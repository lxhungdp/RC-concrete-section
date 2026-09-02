# P-M Column Designer: Instructions for Coding Agents

These instructions apply to the entire repository. They are the always-loaded safety and delivery
contract; detailed engineering truth remains in the linked authorities below.

## 1. Mission and Current Boundary

- Build auditable, conservative-in-process engineering software with the judgment expected of an
  experienced structural engineer, FEM/numerical-methods researcher, and senior software engineer.
- The product is currently **Stage 1: reinforced-concrete cross-section resistance only**. It does
  not perform member stability, slenderness, second-order analysis, load generation, detailing, or
  complete code compliance. Never imply otherwise.
- Calculation routes and reports are development/draft previews unless the documented independent
  verification and release gates say otherwise. A working formula or green test is not certification.
- A qualified engineer remains responsible for the governing jurisdiction, project design basis,
  model adequacy, input review, interpretation, and released design.

## 2. Authority and Conflicts

Start every non-trivial task at [`docs/00-README.md`](docs/00-README.md). For anything that can
change engineering meaning or a numeric result, also read the complete relevant documents selected
by [`docs/01-control-map.md`](docs/01-control-map.md) before planning or editing.

Apply this authority order:

1. governing law, adopted standard, approved project design basis, and approved interpretation;
2. verified edition-specific code profile and its clause traceability;
3. `docs/01-control-map.md` and the owning engineering document;
4. the owning development document and detailed numerical references;
5. implementation and tests;
6. examples, spreadsheets, UI labels, screenshots, and historical audit material.

If authorities or implementation disagree, stop the affected calculation/release path, state the
conflict, and resolve it at the highest applicable source. Never choose the value that makes a test
pass or produces a plausible-looking result. `AUDIT-FINDINGS.md` is commit-scoped historical
evidence, not a current release assessment.

## 3. Read-on-Demand Map

Read the linked file in full when its trigger applies; do not rely on this summary alone.

| Trigger | Required authorities |
|---|---|
| Product scope, lifecycle, terminology, units, axes, origin, or signs | [`engineering/01`](docs/engineering/01-product-scope-and-workflow.md), [`engineering/02`](docs/engineering/02-data-conventions-and-terminology.md) |
| Geometry, holes, bars, cover, exact properties, mesh, or convergence | [`engineering/03`](docs/engineering/03-geometry-and-reinforcement.md), [`docs/02`](docs/02-meshing-2d.md), [`docs/06`](docs/06-mesh-sizing-and-convergence.md), [`development/03`](docs/development/03-geometry-and-material-pipelines.md) |
| Materials, strain limits, a design standard, resistance factors, or code applicability | [`engineering/04`](docs/engineering/04-materials-and-design-standards.md), [`docs/10`](docs/10-normative-references-and-change-control.md), [`docs/11`](docs/11-design-standards-and-resistance-formats.md), [`docs/12`](docs/12-calculation-models-defaults-and-workflows.md) |
| Forward/inverse mechanics, Jacobian, solver, stations, surfaces, angles, demand, or utilization | [`docs/03`](docs/03-forward-analysis-and-jacobian.md), [`docs/04`](docs/04-initial-guess-feasibility-newton.md), [`docs/05`](docs/05-pm-diagram-stations-angles-plotting.md), [`docs/06`](docs/06-mesh-sizing-and-convergence.md), [`docs/07`](docs/07-integration-edge-cases-and-qa.md), [`docs/12`](docs/12-calculation-models-defaults-and-workflows.md), [`engineering/05`](docs/engineering/05-loadings-analysis-results-and-reports.md) |
| Project JSON, persistence, defaults, IDs, or versioning | [`development/02`](docs/development/02-data-contracts-persistence-and-versioning.md) |
| Packages, dependencies, web/worker boundaries, UI, Excel, PDF, or exports | [`development/01`](docs/development/01-architecture-and-package-boundaries.md), [`development/04`](docs/development/04-loadings-analysis-results-and-report-pipelines.md), [`docs/08`](docs/08-software-architecture-and-api.md) |
| Tests, benchmarks, numerical drift, acceptance, review, or release | [`development/05`](docs/development/05-coding-quality-and-ai-workflow.md), [`engineering/06`](docs/engineering/06-verification-acceptance-and-change-control.md), [`docs/09`](docs/09-verification-validation-and-release.md) |
| Current capability or roadmap claim | [`development/06`](docs/development/06-current-state-and-roadmap.md), then confirm in current code/tests |

For a standard-specific change, also read the relevant `packages/pm-code-*/README.md`, adapter,
tests, and exact official standard edition/amendment. Package documentation is implementation
context, never a substitute for the normative source.

## 4. Engineering Integrity: Non-Negotiable

- Do not invent, infer, assume, or recall from memory a formula, coefficient, limit, unit, sign,
  tolerance, default, clause interpretation, or applicability range. Introduce interpolation or
  extrapolation only when the mapped authority explicitly permits it. Otherwise obtain an
  authoritative source or leave a typed blocking gap.
- Prefer adopted standards, official errata/amendments, regulator/publisher material, and approved
  project documents. Use scholarly or vendor material only as supporting evidence. Record document,
  edition, amendment, jurisdiction/National Annex, clause/table, access date/link, units, and the
  project interpretation. Do not reproduce restricted standard text unlawfully.
- Never silently select “latest,” a different jurisdiction/annex, another code, or a fallback model.
- Keep units, compression-positive `P`, origin, axes, and moment signs explicit at every boundary.
  Preserve `Mx = sum(F*(y-y0))` and `My = sum(F*(x-x0))` unless the owning authority is formally
  changed with full impact review.
- Keep stress-strain integration and equivalent-block mechanics independent. Shared contracts do
  not authorize a shared hidden capacity formula or cross-method substitution.
- Keep exact geometry separate from numerical integration. A mesh/fibre cloud never defines the
  physical boundary, extreme fibre, cover, or section properties.
- Preserve nominal/reference evaluation before applying exactly one declared design-resistance
  route. Never double-reduce materials/resultants or compare factored ULS demand to nominal capacity.
- Demand adequacy comes from the governing Design resistance domain with explicit verification and
  uncertainty status, not from inverse-solver convergence or a convenient 2D/nearest-angle result.
- Keep strain/sampling direction, neutral-axis line angle, and demand moment direction distinct.
  Demand direction is derived from `(Muy, Mux)` and queries the completed `P-Mx-My` surface.
- Invalid topology/input, unsupported scope, unknown profile, non-finite arithmetic,
  non-convergence, resource exhaustion, and unresolved ambiguity fail closed with typed evidence.
- `preview`, `draft`, `reviewed`, `verified`, `acceptedResult`, and `releasedReport` are distinct
  states. Never promote one by wording, casting, snapshot updates, or UI presentation.
- Workbooks, commercial-software comparisons, examples, and existing regression baselines are
  evidence, not normative authority. Never overwrite an oracle or loosen a tolerance just to pass.

## 5. Software and Pipeline Contract

- Inspect `git status`, current owner APIs, callers, tests, and uncommitted work before editing.
  Preserve user changes and keep unrelated cleanup out of the patch.
- For result-affecting work, create the task packet required by
  [`development/05`](docs/development/05-coding-quality-and-ai-workflow.md): objective, requirement
  IDs, owners, contracts, blocking failures, oracles, impact, and out-of-scope items. Assign the
  change class from [`engineering/06`](docs/engineering/06-verification-acceptance-and-change-control.md).
- Change the single owner named in `docs/01-control-map.md` first, then update downstream contracts,
  implementation, verification evidence, provenance/schema, reports, and summaries in one slice.
- Preserve the pipeline: raw definition -> runtime validation -> normalized immutable model ->
  compiled runtime model -> analysis scenario -> engineering result -> view/report model.
- Use strict TypeScript, finite/range validation, discriminated typed results, exhaustive branches,
  pure deterministic kernels, explicit limits, and scale-aware numerical criteria. Expected
  engineering failures are data, not console messages or fabricated numeric sentinels.
- Dependencies point inward. Domain/numerical packages do not import React, Next.js, Plotly,
  browser/filesystem/network APIs, reports, UI state, or `tools/`. UI and reports consume package
  results and must not recreate formulas, factors, solvers, unit conversion, or acceptance logic.
- Add a dependency only for a bounded, reviewed need. Pin it, wrap it, document license/security and
  numerical role, and add regression coverage. Treat numerically relevant upgrades as engineering
  changes.
- Make the smallest complete change. Do not create compatibility behavior, migrations, public API
  changes, generated artifacts, commits, or pushes unless the task and authority require them.

## 6. Verification and Completion

Choose tests from risk and the owning pipeline; test both success and fail-closed boundaries.

- Documentation-only: verify links, terminology, status, and consistency with owner/code.
- Any code: run `npm run check:structure`, `npm run typecheck`, and focused owner tests.
- Cross-package/application change: run `npm test` and `npm run build`.
- Numerical/result-affecting change: additionally run the relevant `npm run bench:verify`,
  `npm run bench:strain-sampling`, `npm run bench:equivalent-block`, and/or
  `npm run bench:pipelines`; use independent analytical/differential evidence where required.
- Dependency/CI change: run `npm run check:security`; web bundle changes also run
  `npm run check:web-bundle` after a production build.

Do not claim completion when a required gate was skipped, failed, or lacks an independent oracle.
At handoff, report the outcome, authorities/requirements used, files/contracts changed, numeric or
schema/report impact, tests and oracles run, current verification status, and remaining limitations.
Write project documentation and code comments in precise English, using symbols and terminology
already established by the repository.

## 7. Cross-Agent Skills

- Canonical project skills live in [`.agents/skills`](.agents/skills). Claude Code discovery files
  live in [`.claude/skills`](.claude/skills) and must remain thin adapters that read the matching
  canonical skill completely before acting. Do not duplicate a workflow in both trees.
- Keep shared skills portable: use the Agent Skills directory convention and only `name` and
  `description` frontmatter unless a reviewed cross-agent need proves another standard field works
  in both tools. Put detailed references beside the canonical skill and link them relatively.
- A skill name, description, trigger boundary, and canonical link are one contract. Update the
  canonical skill and its Claude adapter in the same change; do not use repository symlinks as the
  portability mechanism.
- Validate skill parity with `npm run check:structure`, then run the platform validator and test one
  explicit and one description-triggered invocation in every installed agent CLI. Report an
  unavailable CLI as an unexecuted gate; never claim cross-agent runtime verification from schema
  validation alone.
