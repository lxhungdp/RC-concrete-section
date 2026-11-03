# Capacity Detail Actions and Value Traces

Status: implemented; presentation gates passed on 2026-11-03. Preview only.

## Task packet

- Objective: one toolbar Detail action before Excel opens the complete inspector; each calculated value
  opens its own compact derivation without comboboxes, contents navigation, unrelated state derivations,
  unrelated sections or components. The row/stage is fixed and shown as a read-only caption.
- Class: 2, result-identical presentation/evidence selection. Requirements: ENG-RES-001/002,
  development/04 result-query identity, and the workspace design standard.
- Owners: SectionResultsPanel, ChartCalculationDialog, existing chart-data-table view selectors.
- Inputs: existing row evidence and mechanics-owned PointCalculationAudit DTOs. Outputs: focused
  readable calculations; no new solver, factors, interpolation algorithm or numerical result.
- Supported values: Vertical P/M-beta and Fixed-P Mx/My, in the selected Design/Nominal stage.
  IDs, branches and sampling directions remain identification/inspection parameters.
- Blocking failures: stale audit attached to another row/stage; unrelated component substituted;
  physical field assigned to a cap/interpolation; double reduction; computed value used as input.
- Oracles: component selection/projection tests; existing point-audit reconciliation; production
  browser checks for mouse/keyboard triggers, close/focus restore, target-only sections, stage/row
  identity, both mechanics, interpolation/cap boundaries, units, themes and narrow layouts.
- Schema/report/kernel impact: none. Full Detail workbooks remain unchanged. Focused PDF prints
  only the displayed trace through the shared shell. Shared controls/palette remain unchanged.
- Out of scope: code-profile interpretation, kernel/audit DTO redesign, new numerical formulas.

## Implementation

The shared toolbar has one standard 26px Detail action directly before Excel; the table has no
additional action column or row-wide click handler. Each available numeric value is a native compact
quiet action with a component/stage/row accessible name. Table identification and missing values
remain noninteractive. No cell borders, control tokens or drawing colours changed.

The focused dialog has one document column with a fixed row/stage caption, the selected concrete
and net-steel component, the declared resistance route, and only the stored cap/interpolation steps
needed for that value. Detailed reinforcement terms use a standard disclosure. General inputs,
contents navigation, comboboxes and unrelated components remain in the
complete Detail inspector. The shared PDF action prints the current trace.

Audit responses are matched to the current request, point IDs and resistance stage. A focused final
result is withheld until every requested source audit reconciles. Missing, unavailable or mismatched
source evidence cannot acquire a different row's calculation. The full inspector retains its
existing diagnostic sections and export actions. The reinforcement equation caption uses the audit's
resolved/stored As; it no longer falsely states that every bar area is derived from its diameter.

## Verification

- `npm run check:structure`, `npm run typecheck` and `git diff --check`: passed.
- Focused result-table/component selection tests: 16 passed, including exact stage/sign selection,
  absent source/component handling, the existing projection adapter and unreconciled evidence.
- `npm test`: passed (420 unit tests, 5 AdSec evidence tests, 11 CAD tests, JSON round trip,
  stress-strain/equivalent-block workbook integrations, demand-check export and PDF report checks).
- Production `npm run build` and `npm run check:web-bundle`: passed.
- [Production browser checks](../../tools/verification/capacity-traces/browser.mjs): passed for both
  mechanics, Design/Nominal P/M and Mx/My, physical stations, axial caps and interpolated Fixed-P
  rows. The exact canonical final value matches the source row in metric and US display units.
  Checks cover a single toolbar Detail before Excel at the same 26px height, noninteractive row
  identification cells, complete inspector selection, keyboard opening/Escape/focus restoration,
  zero comboboxes or contents navigation in the focused dialog, reinforcement disclosure,
  cancelled/stale audit requests, intentional unreconciled evidence, light/dark and 360px layouts.
  There were no page or worker errors. Captured evidence is under
  `outputs/capacity-value-traces/` (browser JSON, screenshots and gate logs).

No kernel, code profile, project schema, persistence, load effect, utilization, report classification
or export computation changed. Numerical benchmark suites were not repeated for this Class 2 view
change; the existing audit reconciliation and regression/export suites remain the numerical evidence.
This is a tested presentation change to Preview output, not an engineering release or independent
validation of either mechanics model.

## Follow-up: criterion derivation, notation and final-value layout

Status: implemented; presentation checks passed (2026-11-03).

The compact trace must retain the derivation from its own stored criterion through the compatible
origin strain and curvature components. Reuse the existing audit's uniform-strain, declared-depth,
controlling-bar or resolved-state evidence; never infer a different criterion or recompute a state
in React. Display the already stored normal components to explain the x/y curvature mapping.
Use the existing TechnicalEquation/KaTeX renderer for authored focused formulas, with proper Greek
symbols, subscripts, fractions, scientific notation and selected-unit formatting. Full precision
remains in DTOs. A single focused final value must occupy the available width and keep its value
and actual unit together, including P in metric and US views. These are Class 2 presentation
corrections with no kernel, schema, resistance or utilization change.

Verification passed:

- `npm run check:structure`, `npm run typecheck`, `git diff --check` and 19 focused table/trace/
  TechnicalEquation tests.
- Full `npm test`: 420 unit, 5 AdSec and 11 CAD tests, JSON round trip, both workbook routes,
  demand-check workbook and PDF report integrations.
- Production build and web bundle gate. Initial JavaScript is 338.3 KiB gzip within the existing
  375 KiB budget; Plotly/worker/Excel lazy chunks remain within their existing budgets.
- The production browser suite now checks criterion-to-origin-strain and curvature notation,
  source-audit component values at oblique directions, no formula-render errors (including expanded
  reinforcement terms), correct Greek/subscript MathML, and exact canonical final values in both
  display-unit presets. Final labels, numbers and units share a row and remain inside their result
  block on desktop and 360px screens. Both themes and both mechanics pass without page/worker errors.
  Evidence is under `outputs/capacity-trace-notation/`.

The stress-strain audit supports the uniform-strain pole and both nonuniform criterion forms. The
existing equivalent-block pole audit returns `missing-physical-state` because it has no unique
neutral-axis depth; the browser explicitly checks that this remains unavailable with no fabricated
block geometry, strain derivation or completed final result. Supported block depth/bar criteria,
physical Fixed-P endpoints, cap/interpolation evidence and oblique component traces pass. This
follow-up does not add a new pole-audit calculation route. No numerical benchmarks were repeated
for these presentation-only changes; engineering release/acceptance status remains unchanged.

The final structure scan initially overlapped an unrelated concurrent Next.js build and encountered a
disappearing generated `.next/export-marker.json`. Repeating the scan after that build finished
passed; the failure did not identify a source-layout violation.

## Follow-up: Capacity table value type

Status: implemented; presentation checks passed (2026-11-03).

The P/M value spans inherited the compact action's 11px command-label size after becoming trace
buttons. Assign their existing table-data text role (12px) in the table typography owner instead.
The compact 22px action geometry, quiet appearance, numeric face, row layout and focus behavior
remain unchanged. The same value cell serves Design/Nominal and Fixed-P components. Calculation
modal typography retains its preceding sizes, including its math renderer. No new control density, role, skill
workflow, engineering rule, numeric value, schema or export calculation is introduced.

Verification covers rendered value size against its own table cell, compact action dimensions,
unchanged modal text, both themes/mechanics/stages/sources, units and narrow layouts, followed by
the normal application gates.

The final correction changes only the value-content rule in `workspace-chrome.css`. Browser checks
measure every Capacity result span at 12px, equal to its table cell, while its action remains 22px
high. Full/focused modal facts and table values retain their previous 11px size. Both mechanics,
Design/Nominal, Vertical/Fixed-P, metric/US, light/dark and narrow layouts pass. Canonical values,
unit labels, final-result bounds and trace actions remain covered by the existing suite. Evidence:
`outputs/capacity-trace-font/` final browser JSON/screenshots and gate logs. A browser timing check
was corrected to wait for the table to remount after returning from Options before measuring it.
Structure/typecheck, 19 focused tests, full `npm test` (420 unit, 5 AdSec, 11 CAD and the existing
JSON/workbook/PDF integrations), production build, bundle budgets and `git diff --check` passed.
No numerical benchmark was repeated for this presentation-only correction.

## Follow-up: resistance-factor derivation

Status: implemented; audit regression and presentation gates passed (2026-11-03). Preview only.

- Objective: expose the calculation of the selected state's resistance factor before multiplying
  its Nominal component into Design, in the complete and focused inspectors.
- Class: 2, additive lazy audit evidence with identical resistance results. Requirements:
  ENG-MAT-004/006, ENG-RES-002 and development/04 query/evidence identity.
- Authorities: engineering/04 and 05, docs/11 and 12, development/01, 04, 05 and 07, and existing
  edition-specific adapter provenance. No coefficient, branch interpretation or code identity changes.
- Owners: existing strength-reduction evaluators, physical point-audit DTOs in @pm/analysis and the
  block bridge, then ChartCalculationDialog. No factor arithmetic or classification in React.
- Contract: additive non-persisted factor evidence, explicitly separate strain-controlled and AS
  axial/bending routes. Nominal/material-factor audits have no global-factor evidence. Preserve
  stored bar identity, original input strengths/modulus, active parameters, selected classification,
  transition operands, computed factor and its reconciliation to the stored point.
- Fail closed: missing controlling bar/material, mismatched factor, unknown source branch or
  unavailable physical evidence cannot produce a fabricated explanation or complete selected value.
  Geometric cap/interpolation points retain their separate source calculations.
- Oracles: existing independent coefficient/branch fixtures plus audit-to-source checks for both
  mechanics, compression/transition/tension, reinforcement classes, modified coefficients, AS
  clamping and axial branches, and material-factor/nominal exclusions. Surface/UR immutability is
  checked before/after audits and through regression gates.
- Impact: no project JSON/schema, surface, force/moment signs, units, sampling, solver, factor,
  utilization, export computation or engineering release status change. Only lazy audit payloads
  and their presentation grow. No new normative data or dependency.
- Gates: structure/typecheck, focused and complete tests, production build/bundle, production browser
  traces and relevant numerical regression checks. No independent code-profile certification claimed.

The physical point audit retains the actual evaluator's controlling bar/material, strain limits,
selected classification and factor. Its factor must match the stored point exactly before the
explanation is available. The view shows the applicable branch and substituted interpolation, then
the existing Nominal-to-Design multiplication. AS retains its own bounded bending expression and
axial interaction operands. Material-strength routes display their declared material-factor
expressions and explicitly have no additional global factor. Formula rendering, unit formatting,
modal typography and Capacity table controls reuse their existing owners.

The evaluator arithmetic is unchanged. The existing global transition-denominator guard and AS
bending-expression operands are named in their original owners so the audit can expose them without
duplicating an independent rule. Factor evidence is requested lazily with the existing point audit;
it is not added to every surface point, persisted project input or general report computation.

Verification:

- Structure/typecheck and 63 focused owner tests passed. Full `npm test` passed: 424 unit, 5
  AdSec and 11 CAD tests, project JSON round trip, both mechanics workbooks, demand-check workbook
  and PDF report checks. Missing/mismatched factor evidence fails closed; surface and utilization
  values remain unchanged before and after lazy audits.
- Production build and bundle budgets passed. Initial JavaScript remains 339.4 KiB gzip within
  the existing 375 KiB budget; the worker is 79.6 KiB within 120 KiB. No dependency or budget change.
- Production browser checks passed for 63 focused traces across KDS stress-strain, ACI block, AS
  block and EN material-strength routes. Coverage includes the three strain-factor branches,
  AS compression/combined-compression/combined-tension branches, active expressions, exact source
  and final values, Nominal exclusion, cap/interpolation sources, missing-factor and stale-response
  suppression, full/focused inspectors, metric/US units, both themes, keyboard and 360px layouts.
  No page or worker errors occurred. Capacity numeric text remains 12px; modal typography is unchanged.
- `npm run bench:equivalent-block` passed with no verification failures. The existing portable
  capacity fingerprint gate passed using the actual Node v24.20.0, npm 11.19.0 and V8
  13.6.233.17-node.53 matching baseline provenance. Windows/x64 versus the macOS/arm64 baseline
  produced 17 permitted resultant roundoff differences, worst section-normalized delta
  `4.957e-17` against the unchanged portable limit `1.776e-15`. Inverse equilibrium evidence is
  unchanged. The platform-specific exact gate is not claimed on Windows; initial attempts with
  Node v24.22.1 stopped at provenance validation. No baseline, tolerance or comparison policy changed.
- The matching runtime was downloaded temporarily under ignored outputs from the official Node
  distribution and verified against its official SHA-256 checksum; it is not a project dependency.
  Gate logs, browser evidence and screenshots are under `outputs/capacity-factor-trace/`.

The new contract is additive, lazy calculation evidence only. No project schema, persistent input,
resistance surface, utilization, report calculation or profile acceptance status changed. These
checks verify this audit/presentation change; they do not independently certify a code profile or
promote Preview output to an engineering release.
