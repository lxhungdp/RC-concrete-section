# Demand and capacity field selection

Status: scoped correction implemented and regression-checked; Preview only. User-authorized
correction on 2026-10-29. The equivalent-block demand-response gap below remains explicit.

## Task packet and decision

- Objective: restore the section field at the checked entered demand for non-NG cases; reserve
  Field at capacity for NG cases and tint every Demand Check chart for that NG case.
- Change class: 3, result-query and presentation pipeline. No mechanics, material law, numerical
  tolerance, surface, governing crossing, UR, uncertainty interval or classification may change.
- Requirements: ENG-LOAD-001, ENG-AN-003, ENG-RES-001; root document 05 sections 8–10 and
  engineering/05 sections 3–5. The user's correction supersedes the all-case capacity-field display
  decision in development/12, while retaining its outside-demand geometric plots and resolver.
- Owners: root document 05 first; engineering/05; development/04; @pm/analysis field selection;
  ResultsWorkspace and the shared chart status surface in workspace-chrome.css.
- Input: current matching inverse/check DTO, active mechanics method, immutable surface and demand.
  Demand theta, strain parameter beta and the actual epsilon-zero NA line remain distinct.
- Output: a typed field with explicit demand/capacity basis or typed unavailable evidence. The
  existing governing `inadequate` decision alone selects capacity; a checked non-NG case requires
  qualified demand equilibrium. Indeterminate remains indeterminate. NG styling follows the same
  complete displayed frame as its field, curves and labels. Both Field at demand and Field at
  capacity use prominent noninteractive badges composed from the shared accent/failure colours.
- Blocking failures: missing check, stale frame, non-converged/inadmissible/non-finite state,
  missing capacity evidence, cap face, or unsupported demand-equilibrium mechanics. None may
  fabricate a field, change the decision, or discard valid geometric plots.
- Known capability gap: the equivalent-block inverse solves a capacity ray, not the full entered
  demand. Its non-NG field must be unavailable. A new demand-response material/mechanics route is
  outside this correction and cannot be inferred from the ULS block.
- Acceptance oracles: exact selection of existing stored states; demand forward resultant replay;
  distinct non-NG fields as demand scales; NG state/NA proportional-ray replay; failed inverse
  without fallback; NG with converged inverse still selects capacity; unchanged checks and surface.
  Browser QA covers OK/NG transitions, strain/stress, both themes, narrow layouts and unavailable
  fields without changing field ramps or drawing colours.
- Schema/provenance/report impact: no persisted schema or report result change. A pure typed
  display-field query is added to @pm/analysis; existing inverse and capacity DTOs remain intact.
- Out of scope: SLS support, new constitutive models, block-as-fibre substitution, solver changes,
  resistance/profile changes, report-release promotion, and unrelated working-tree changes.

## Verification

- `npm test` passes, including structure/typecheck, 396 unit tests, the independent-source audit,
  CAD, project round trip, both mechanics' workbooks, demand-check workbooks and preview PDFs.
- Focused field tests cover both classifications and indeterminate evidence, NG with a converged
  inverse, failed non-NG without capacity fallback, unsupported block demand equilibrium, cap faces,
  unchecked/mismatched evidence and non-finite/inadmissible states. An independent uniform-section
  concrete/steel arithmetic oracle recovers two prescribed demand strains and bar stresses; the
  resulting fields change with load while the surface and governing checks remain unchanged.
- Production build and `check:web-bundle` pass on Node 24.22.1/npm 11.19.1. The first sandbox build
  failed with EPERM while writing Next output; the same build passed outside that sandbox. No
  application/configuration workaround was introduced.
- `bench:strain-sampling`, `bench:equivalent-block` and `bench:pipelines` pass. Strict and portable
  fingerprint invocations on Node 24.22.1 were refused for baseline runtime provenance mismatch.
  With the existing reference Node 24.20.0/npm 11.19.0 runtime, `bench:verify:portable` passes under
  the approved cross-platform policy: 17 resultant roundoff deviations, worst section-normalized
  delta 4.957e-17. This is not an exact same-environment replay of the recorded baseline. No
  baseline, tolerance, material law, surface algorithm or governing check was changed here.
- The production browser harness verifies actual field-map requests use the demand inverse state
  for OK stress-strain cases and the qualified capacity state for NG. Both mechanics retain curves,
  stored UR and crossing. Non-NG block fields are unavailable as specified. OK/NG selection,
  strain/stress views, prominent labels, all-chart NG backgrounds, both themes, 900px and 360px
  layouts, unit round trips and capacity-module failure injection pass without browser errors.
- Logs, synthetic browser inputs, screenshots and structured evidence are retained under ignored
  `outputs/demand-field-basis/`. The harness is `tools/verification/demand-charts/browser.mjs`.

No persisted schema, report result or SLS capability changed. Numerical evidence and UI QA remain
Preview evidence, not independent design-code approval or release acceptance. No skill definition
or adapter was changed; this task does not claim new cross-agent skill discovery verification.
