# Mechanics-specific Demand Check field selection

Status: implemented and regression-checked, Preview only. User clarification 2026-11-04.

- Objective: stress-strain OK uses Field at demand and NG uses Field at capacity. Equivalent
  block uses Field at capacity for every checked classification. This supersedes the earlier
  [all-case capacity decision](2026-11-04-capacity-field-all-cases.md).
- Change class: 3, display-field routing. Requirements: ENG-LOAD-001, ENG-AN-003, ENG-RES-001.
- Owners: root 05 section 10, engineering/05, development/04 and control-map registry;
  `@pm/analysis` field selector, ResultsWorkspace, focused and production-browser tests.
- Input: current matching checked result and explicit mechanics method. Stress-strain retains
  demand basis for non-NG, including indeterminate, with qualified inverse equilibrium required.
- Output: the stored demand or capacity state selected by that rule, with matching label, metrics,
  neutral axis, exact-beta meridian and field-map request. Capacity displays its multiplier;
  demand identifies the checked entered actions. NG colour follows classification.
- Blocking failures: unchecked/mismatched evidence, failed or inadmissible demand equilibrium,
  missing/unqualified capacity, non-finite values and zero block demand without a capacity direction.
  No substitution between demand and capacity on failure. Keep typed unavailable evidence.
- Oracles: distinct stored demand/capacity identity; selection across mechanics and classifications;
  independent uniform-section demand strain/stress arithmetic; capacity forward replay; unchanged
  governing checks; production worker field-state equality, rendered pixels, labels, epsilon/sigma,
  themes, narrow layouts, transitions, pre-cap notes and field-module failure containment.
- Impact: restores explicit method in the transient display-query signature. No persisted schema,
  mechanics, factors, governing checks or report-ledger change. New inverse research is out of scope.

## Verification

- Eleven focused field/pre-cap tests pass. The mechanics/classification matrix covers demand
  convergence and failure, distinct stored states, unavailable capacity and no cross-basis fallback.
  Two independent uniform-section arithmetic cases recover the displayed demand strains and bar
  stresses for OK stress-strain cases; the displayed strain changes with demand.
- `npm test` passes with structure/typecheck, 579 unit tests, five AdSec cases, CAD, project
  round trip, independently recalculated fibre/block/demand workbooks and deterministic Unicode
  preview PDFs. The first structure invocation overlapped the production build's changing `.next`
  files and encountered a removed generated file. The full rerun after build completion passes.
- Production build, `check:web-bundle` and `bench:pipelines` pass. No new numerical formula,
  baseline, tolerance or material law was introduced.
- Both production-browser harnesses pass. Stress-strain OK worker requests match stored demand
  states and NG requests match capacity. Every block field request uses capacity. Rendered pixels,
  labels, epsilon/sigma, verdict colours, themes, narrow layouts, selection round trips, unit changes,
  pre-cap notes, cap-disabled imports, workbook download and lazy-field failure containment pass.
  Explicit unavailable states retain geometry and check evidence.
- Evidence is under ignored `outputs/field-basis-correction-*` logs/directories. Current verification
  remains Preview. No persisted schema, governing result, report-ledger or release-status change.
