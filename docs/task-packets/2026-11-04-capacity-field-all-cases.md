# Capacity fields for every checked loadcase

Historical decision. Superseded by the user's subsequent
[mechanics-specific clarification](2026-11-04-mechanics-specific-field-basis.md).
The verification below records the earlier all-capacity implementation.

Status: implemented and regression-checked, Preview only. User-authorized 2026-11-04.

- Objective: display Field at capacity for OK, NG and indeterminate loadcases in both mechanics.
- Change class: 3, field-query and presentation pipeline. Requirements: ENG-LOAD-001,
  ENG-AN-003 and ENG-RES-001. This supersedes the classification-based display selection in
  development/13. It uses existing physical capacity evidence without a new demand-response model.
- Owners: root 05 section 10, engineering/05 section 5, development/04, control-map registry;
  `@pm/analysis` field selector, ResultsWorkspace and their focused/browser tests.
- Input: current matching checked loadcase DTO and its qualified `capacityField` evidence.
- Output: capacity-basis field for every classification, with a visible load multiplier and the
  existing explicit before-Pmax qualification when applicable. NG tint follows the governing check.
- Contracts: preserve governing check, surface, utilization, uncertainty, inverse diagnostics and
  report ledgers. Both proportional and constant-P checks retain their existing capacity queries.
  Strain-gradient beta comes from the selected physical capacity state; demand theta comes from
  the checked moment vector. They remain distinct from the actual zero-strain neutral-axis angle.
- Blocking failures: unchecked/mismatched evidence, missing or unresolved capacity, non-finite or
  inadmissible state, zero demand without a capacity direction. Keep typed unavailable evidence,
  geometry, curves and check results. Never substitute a demand state for missing capacity.
- Acceptance oracles: identity of distinct stored capacity states across all classifications and
  both mechanics; immutable input/check DTO; physical forward replay in existing capacity tests;
  normal entry-point field-map generation for OK and NG; unchanged checks on scaled demand rays;
  browser worker-request state equality, rendered pixels, epsilon/sigma, themes, narrow layouts,
  selection round trips, pre-cap notes and unavailable-field fault injection.
- Schema/provenance/report impact: simplified transient display-field query only. No persisted
  project or report result change. Preview remains the current verification state.
- Out of scope: material/mechanics/factor changes, demand-response inverse research, sampling,
  new numerical tolerances, SLS/member analysis and release promotion.

## Verification

- `npm test` passes, including structure/typecheck, 578 unit tests, five AdSec cases, CAD,
  project round trip, independently recalculated fibre/block/demand workbooks and deterministic
  Unicode preview PDFs. Focused field, pre-cap and constant-P tests pass. The uniform-demand
  analytical oracle still checks the separate inverse diagnostic while the display selects capacity.
- Production build and `check:web-bundle` pass. `bench:strain-sampling`,
  `bench:equivalent-block` and `bench:pipelines` pass without changed numerical baselines or limits.
- Production browser checks pass for both mechanics over two OK demands, three NG demands and
  zero demand. They assert capacity-state identity in worker map requests, coloured canvas pixels,
  epsilon/sigma switching, verdict-based label colour, NG backgrounds, light/dark and narrow layouts,
  selection round trips, unit changes, geometric plots and field-chunk failure containment.
  The before-cap harness also passes cap-governed/OK transitions, pre-cap notes, cap-disabled import,
  actual workbook download and retained uncapped overlays. Its historical expectations were aligned
  with the existing resistance-only Capacity workspace and the separate reserved before-cap note.
- The first full run encountered an in-progress constant-P residual change in the working tree.
  Its new helper referenced an unavailable `Resultant` type; the helper annotations now use the
  already imported `CapacityEvaluation['resultants']`. The final full run and build pass. Concurrent
  build-lock refusals were retried after the other build finished.
- The display query now takes only the checked result, since selection is mechanics-independent.
  Its transient return type is capacity-only. Application, tests and verification harness callers
  use this signature. Existing report inverse diagnostics and persisted inputs are unaffected.
- Evidence is under ignored `outputs/capacity-all-*` logs/directories. Zero demand has no unique
  capacity direction and remains an explicitly unavailable field. Other unresolved or inadmissible
  capacity states likewise retain typed evidence. This is Preview regression evidence, without
  promotion to independently approved design output.
