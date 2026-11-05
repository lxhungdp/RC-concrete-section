# Inline Options rows

Date: 2026-11-04. Change class: 1, presentation only. Status: implemented and regression-checked.
Engineering outputs remain Preview.

Objective: apply the Units label/control row principle to Points, Mesh and remaining Resistance
choices. Keep native controls, parameter meanings, table layouts, validation, commit/cancel/reset,
canonical data, sampling/mesh rules and defaults unchanged.
Authorities: workspace-style-design composition standard; development/09 implementation map;
development/01 package boundaries and development/04 Options pipeline. No engineering rule changes.
Owners: AnalysisOptionsPanel and DesignBasisPanel markup; side-panel.css feature layout.

Scalar fields use a label and control on the same row with aligned editors. Long visible captions
and choice labels are shortened where needed; existing descriptions and tooltips retain their
meaning. The multi-value angle draft gets more horizontal space. Tables, checkboxes, long narrative
textareas and existing shared control dimensions retain their roles. No new dependency or CSS
control palette/density is introduced.

Verification: structure/typecheck, focused existing analysis-options tests, full tests, production
build and web-bundle gate. Inspect fixed/adaptive Points for both mechanics, uniform/explicit
directions, automatic/fixed mesh, and Resistance choices at default/minimum/mobile widths in both
themes. Compare canonical input and retained surface identity through presentation navigation.
Expected failures: stacked/overlapping fields, clipped options or numbers, hidden settings, state
mutation on navigation or broken native interactions.

## Delivered slice

All scalar labels in the fibre and block AnalysisOptionsPanel use an inline row. Numeric and
ordinary choice editors align in the same column. Automatic/fixed mesh, fixed/adaptive sampling,
uniform/explicit directions and the angle-list draft retain their original elements and handlers.
Fixed/Adaptive and Automatic/Fixed size choices use compact captions; resolved counts and existing
behavior descriptions remain visible. The station maximum's tooltip explicitly includes both poles.

Resistance's AS class and Custom transition choices use the same row composition. Their full
accessible names remain explicit; short visible captions and option titles preserve the existing
class/rule definitions. The AS class control and multi-value angle draft have functional wider
columns. Scalar field height, type, states, units, validation, commit/cancel/reset and all stored
option values remain unchanged. Narrative reason textareas retain their multiline form role.

## Verification evidence

Runtime: Node 24.22.1 / npm 11.19.1, Windows x64. Existing working-tree changes were preserved.

| Gate | Outcome |
|---|---|
| `npm run check:structure`, `npm run typecheck` | passed |
| Focused analysis-options/application tests | 18/18 passed |
| `npm test` | passed: 483 unit tests, 5 AdSec tests, CAD, project round trip, independently recalculated fibre/block/demand workbooks, deterministic/Unicode PDF |
| `npm run build` | passed |
| `npm run check:web-bundle` | passed: initial 344.6/375 KiB, Plotly 1325.4/1400 KiB, worker 81.3/120 KiB, Excel 248.1/300 KiB gzip |
| Production browser | eight configurations, 84 layout snapshots and 306 scalar-row measurements passed at default, minimum-sidebar and mobile widths in both themes |
| Row geometry and readability | every measured row is 26px high; labels and controls share a centreline, do not overlap, and remain within the pane; longest choice labels and current numeric values fit |
| Navigation/no-op invariants | exact canonical input and retained surface identity in every case; no extra `buildSurface` jobs and no page errors |
| Scrolled Points fields | fibre/block adaptive directions and explicit-angle entry remain reachable and readable at minimum sidebar width, visually inspected in both themes |
| `git diff --check` | passed |

Permanent harness: `tools/verification/options-layout/browser.mjs`. Evidence is ignored under
`outputs/options-layout/`, including fixtures, light/dark screenshots, scrolled direction screenshots
and `browser-evidence.json`; logs are `outputs/options-inline-*.log`. Build/browser execution used
the same sandbox escalation as earlier UI checks and a local production server on port 3002.

No numerical default, engineering equation, tolerance, schema, report contract, result classification
or acceptance status changed. This is UI verification and does not qualify a design profile for
released engineering use. Numerical benchmarks are outside this unchanged-mechanics slice.

## Materials Column type follow-up

The Materials > Concrete Column type label and native select now reuse the same inline wide row.
The only application change is the existing row classes on that label in MaterialPanel. The wide
choice column accommodates Qualifying spiral at the minimum sidebar width. Labels, option values,
handlers, classification, cap factors, validation and persistence are unchanged. This is Class 1
presentation work under the same workspace composition authority. Extend the existing layout
harness to exercise Ties / other and Qualifying spiral in fibre and block fixtures; check both
themes and default/minimum/mobile widths.

Verification passed: structure/typecheck, four focused design tests, full `npm test` (483 unit
tests plus existing integration suites), production build, bundle and whitespace gates. The two
Materials fixtures passed twelve browser snapshots in both themes and three widths. Each Column
type row is 26px high, its label and combobox share a centreline, and both option texts fit without
overlap or clipping. The browser scrolls the row into view for actual visual inspection. Canonical
input and retained surface responses remain exact through navigation, with no extra surface jobs
or page errors. Evidence: ignored `outputs/material-column-row/` and
`outputs/material-column-*.log`. Use `PM_LAYOUT_FILTER=column` to run these cases alone. No numeric,
schema or engineering-status impact.

## Steel curve-stage width follow-up

Historical layout evidence: the selector was subsequently removed in favor of a fixed Design
preview; see [the follow-up](2026-11-05-steel-design-curve-default.md).

Curve stage now uses the existing material-parameter row and the same section-relative value-width
variable as fy, Es, yield strain and hardening fields. The material field-width selector includes
native selects alongside inputs and compound fields. Compact Ref./Design captions retain the full
Reference material/Design material titles and unchanged `reference`/`design` values.
This is Class 1 presentation work: no new field size, state, material law, engineering value or
event/persistence behavior. Verify equal actual field widths above/below the chart and both curve
stages in light/dark at default/minimum/mobile widths.

Verification passed: structure/typecheck, 13 focused material tests, full `npm test` (483 unit tests
plus existing integration suites), production build, bundle and whitespace gates. Three fixtures
(KDS fibre, KDS block and EN, using the existing project-owned hardening authoring helper) passed
18 layout checks in both themes and three widths. Each check exercised both curve stages and
compared the selector with surrounding material value frames: all 138 frame comparisons matched.
Observed widths were 148px, 89px and 223px for default, minimum-sidebar and mobile layouts. Row
height remains the shared 26px. Canonical inputs and retained surface responses remained exact,
with no extra surface jobs or page errors while changing presentation stage.

The first narrow-layout check caught the full Reference caption exceeding the 89px frame; compact
Ref./Design captions fixed it without widening other fields or changing typography/tolerances.
Full names remain available in the selected control's tooltip and option titles. Evidence is under
ignored `outputs/steel-stage-width/` and `outputs/steel-stage-width-*.log`, including Reference/Design
screenshots and `browser-evidence.json`. Use `PM_LAYOUT_FILTER=curve` for the focused browser cases.
No numerical, schema, report or engineering-status change.

## Demand Check offset rows follow-up

Offset X and Offset Y in Load reference each use one inline wide row: label beside the existing
native numeric field, unit and spinner. Their container stacks the two labelled pairs, keeping
editors aligned and readable at minimum sidebar width. Reuse the existing row layout and standard
field geometry; no control-type or event changes. Class 1 presentation only, under development/09
and the workspace composition standard. The draft/axes preview, explicit Apply, Convert semantics,
canonical origin/action conventions, validation, persistence and report evidence retain the
development/16 contract. Verify the existing reference/unit tests, application gates and production
draft/Apply/Convert browser harness, plus actual row geometry in both themes and narrow layouts.
Verification passed: structure/typecheck, ten focused load-reference tests, full `npm test` (483
unit tests plus existing integration suites), production build, bundle and whitespace gates. The
production reference harness passed both mechanics, including native mouse spinners, draft-only
axis preview, Apply with/without Convert, unchanged centroidal curves and utilization on Convert,
new-load input at the applied origin, Metric/US round trip, empty-loadcase preview and Escape.
Fourteen layout checks measured 28 offset rows across light/dark and default/minimum/phone sizes:
each is 26px high with matching 144px fields, no label overlap, clipped current values or horizontal
panel overflow. No page or worker errors occurred.

An initial harness comparison captured the previous selected loadcase's completed chart. The
harness now waits for both plots' Demand point to match the selected canonical load before taking
or comparing snapshots, consistent with development/17's outgoing-frame contract. Exact final
curve comparisons and the existing binary64 comparison bound remain unchanged; no application
calculation or oracle was altered. Evidence is ignored under `outputs/demand-offset-rows/` and
`outputs/demand-offset-row-*.log`, including `browser-evidence.json` and `row-layout-evidence.json`.
No numerical, schema, report or engineering-status impact.
