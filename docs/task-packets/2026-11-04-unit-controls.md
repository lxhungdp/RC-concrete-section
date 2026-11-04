# Unit controls and shared presentation groups

Date: 2026-11-04. Change class: 2, expected identical canonical inputs and engineering results.
Status: implemented and regression-checked; engineering outputs remain Preview.

Objective: replace the preset selector with Metric/US actions, remove stored preset identity and
Custom mode, and expose five unit choices. Dimensions include bar diameter; stress includes modulus.
Requirements: UNITS-001 through UNITS-006, DEV-ARCH-002/003/006.
Authorities: engineering/02 (unit boundaries), development/10 (display-unit pipeline),
development/02 (interchange), and the workspace-style-design standard (ordinary shared controls).
Owners: @pm/units, DisplayUnits, existing workbook adapters and browser verification harnesses.

Input contract: canonical numbers plus an immutable five-group presentation selection. Workbook
Units v1 independently declares seven source quantities, including diameter and modulus.
Output contract: preference v2 contains version and five groups only. Quick-fill actions replace
those choices; they have no selected mode. Presentation copies use shared dimension/stress units.
Blocking failures: malformed/unsupported preferences, source-unit reinterpretation, nonfinite or
incompatible conversion, canonical/result drift, and new analysis jobs caused by unit selection.

Acceptance/oracles: existing independent conversion anchors; exact no-op and canonical JSON
identity; both-mechanics report/result invariants; source-unit workbook round trips including mixed
diameter/modulus declarations; browser actions, five fields, reload persistence, both themes and
narrow layout. Run structure, typecheck, focused tests, full tests, build and web-bundle gates.

Schema/provenance/report impact: browser preference v2 only. Existing workbook Units v1 retains
its source declarations. Project JSON, worker/result DTOs, numeric audit ledgers and calculation
formulas retain their contracts. Reports consume the five-group selection through @pm/units.
Out of scope: mechanics, material laws, factors, signs, tolerances, analysis defaults, dependencies,
CAD colours and unrelated existing working-tree changes.

## Delivered slice

`@pm/units` owns the five-group preference v2 and resolves diameter from length and modulus from
stress. Metric/US constants contain choices only. `DisplayUnitsPanel` uses two independent shared
actions and five native selects, with no selected mode or explanatory implementation paragraph.
No feature CSS or shared primitive changed.

Workbook helpers accept an explicit `UnitContext`. Their existing v1 declaration still contains
seven quantities; its strict parser retains each source unit. Exports expand the five-group UI
selection into these declarations. Project, section/rebar and loadcase adapters consume the same
quantity converter; no transport formula or numeric ledger was replaced. Existing browser harness
callers use buttons instead of the removed preset select.

## Verification evidence

Runtime: Node 24.22.1, npm 11.19.1, Windows x64. Evidence applies to this working tree, which already
contained separate hardening and skill changes; those changes were preserved and are outside this
packet's review scope.

| Gate | Outcome |
|---|---|
| Focused units/pipeline tests | 13/13 passed; independent conversion anchors, grouped aliases, exact no-op edits, source-unit declarations, both-mechanics result invariants |
| `npm run check:structure` and `npm run typecheck` | passed, including the full-test entry gates |
| `npm test` | passed: 483 unit tests, 5 AdSec tests, CAD, project round trip, independently recalculated fibre/block/demand workbooks, deterministic/Unicode preview PDF |
| `npm run build` | passed |
| `npm run check:web-bundle` | passed: initial 344.5/375 KiB, Plotly 1325.4/1400 KiB, worker 81.3/120 KiB, Excel 248.1/300 KiB gzip |
| Production browser, both mechanics | passed: five fields, ordinary Metric/US actions, no preset state, v2 reload persistence, keyboard action, 260px sidebar, narrow layout, light/dark |
| Browser numerical boundaries | exact canonical input and retained surface identity through unit/no-op/cancel cycles; zero unit-only worker jobs; authored 100 kip conversion and invalid blank rejection pass; zero page errors |
| `git diff --check` | passed |

Evidence: ignored `outputs/unit-controls-*.log` and `outputs/unit-controls/` (screenshots, PDF
previews and `browser-evidence.json`). The browser tests use a local production server on port
3002 because 3001 was occupied. Existing requirement anchors and numeric tolerances were retained.

Initial checks exposed a test's absolute Display-sheet row assumption after two preference rows
were removed; it now locates the same declared demand by label and checks the same expected values.
The old browser harness's material text locator also predated mathematical labels; it now uses the
existing `fc` accessible name. An initial structure/build overlap raced Next's generated directory
removal; the completed build and repeated full tests passed. Sandbox build-directory/profile
permission failures were retried outside the sandbox with the same source and budgets.

Limitations: the former browser preference v1 is not migrated; the first v2 session starts with
the existing Metric defaults. The workbook/project versions and their stored numeric values are
unchanged. This presentation slice introduces no numerical acceptance or release claim. Numerical
benchmarks and independent structural review are outside its unchanged-mechanics scope.

## Inline unit rows

Follow-up on 2026-11-04: place each unit label and its combobox on one line. This is presentation
only, with no preference, numeric, event or persistence change. The Units feature uses one shared
two-column grid with labelled subgrid rows, keeping the existing native fields and their standard
geometry. Labels remain unwrapped; the combobox column aligns across all five rows and can shrink
at the minimum sidebar width. No shared primitive, typography, theme token or CAD colour changes.
Owners: DisplayUnitsPanel markup and side-panel.css feature layout, following the existing workspace
composition standard. Recheck structure/typecheck, existing unit tests, full tests, build, bundle,
and actual row alignment at default/minimum/mobile widths in both themes.

Verification passed: structure/typecheck, 13 focused unit/pipeline tests, full `npm test` (483 unit
tests plus the existing integration suites), production build, bundle gate and whitespace check.
The production browser passed ten layout snapshots covering fifty rows: labels and fields share
one control-height row, all comboboxes align, controls stay inside the pane, and even the widest
unit option fits without clipping. Both mechanics retain the canonical input/surface invariants,
zero unit-only worker jobs, no-op/cancel behavior and zero page errors. Screenshots and measurements
are under ignored `outputs/unit-rows/`, including `row-layout-evidence.json`; logs are
`outputs/unit-row-*.log`. No schema, numerical or engineering-status impact.
