# Joined workspace choice buttons

Objective: replace framed choice switches such as Basic/Point with ordinary
buttons that touch, have square joined edges and round only the outer ends.
Apply one shared role to equivalent choices throughout the workspace.

Change class: 1, presentation only. Authorities: docs/00, development/01 and /04,
docs/08, development/09 and the canonical workspace-style-design skill.
Owners: workspace-chrome.css; SectionDrawingClient, MaterialPanel, RebarPanel,
SectionResultsPanel, ResultsWorkspace and CalculationDialogFrame markup;
design contract and canonical skill/Claude adapter.

Contract: `ws-joined-buttons` uses existing standard action tokens (26px height,
13px/400 text, 10px horizontal padding, 6px icon gap). The wrapper has no border,
padding, surface or gap. Buttons own a 1px border, overlapped at one seam; outer
ends use 6px corners and joined edges are square. Selection uses existing accent
tokens, with no dimension/weight changes. Native radio semantics, tab/button
roles, disabled states, focus and handlers remain. Add pressed state to existing
rebar/field-mode/ring buttons. Highlight only the edited ring; do not highlight
its parent Outer when a Hole is selected. Wrap whole groups at narrow widths;
unusually wide Outer/Hole groups scroll within the navigation row.

Scope: sidebar module sub-tabs, Basic/Point, rebar patterns, Outer/Hole navigation, chart-data source
and resistance stage, 3D resistance surface, field mode and the existing gated
dialog view switch. No calculation, input/default, validation, schema, report,
dependency, primary palette or CAD colour changes. Preserve unrelated dirty work.

Acceptance: structure, typecheck, focused owner tests, application tests,
production build/bundle, canonical/adapter schema validation; rendered metrics,
square seams/outer corners, selection/focus/disabled behaviour, pointer/keyboard
interaction and narrow layouts in both themes. Record evidence below.

## Verification evidence

- Structure, strict TypeScript, 35 focused results tests and 340 application/package
  unit tests passed. Aggregate `npm test` stopped at the same four existing ADSEC
  source-hash failures: KDS/P16 `9c08ebf4` versus manifest `6d952aaf`, ACI
  `be988e18` versus `922c722e`. No source, manifest, oracle or tolerance changed.
- Separately executed downstream gates passed: 11 CAD tests, project JSON round
  trip, stress-strain and equivalent-block Excel exports, Demand Check workbook
  and PDF report. The production build and bundle gate passed (initial JavaScript
  372.7/375 KiB, Plotly 1325.7/1400, worker 116.9/120, Excel 248.1/300 gzip).
- Rendered all enabled choice owners in light and dark. Measured wrappers have
  26px height, zero padding/gap/border and transparent background. Their buttons
  have 26px height, 13px/400 text, 10px horizontal padding, square inner corners,
  6px outer corners and one overlapped 1px seam. Selection retains geometry/type.
  Basic/Point, Outer/Hole, rebar patterns, Material and Options tabs, chart-data
  source/stage, 3D surface and field mode use the same role.
- Pointer selection and Enter activation passed across button/tab groups. Native
  ArrowRight/ArrowLeft changed resistance-stage radios and preserved checked
  semantics and visible label focus. Hole selection highlighted only that Hole;
  Outer Enter restored its points. Stress Enter changed the field mode.
- At the 260px sidebar minimum, complete chart-data groups wrap to separate rows
  with no split seams. At a 360px viewport, both themes had no horizontal page
  overflow; controls remained 26px. Resize reset and viewport reset passed.
  Ring navigation reserves the existing 4px focus-ring extent through padding
  and compensating margins, without adding layout height or a surrounding frame.
  The final rendered inspection confirmed the complete keyboard-focus outline
  on Outer/Hole. Browser console contained no errors or warnings. Temporary
  preview servers and browser tabs were closed.
- All 135 pre-change CAD style signatures remained present in both themes
  (159 current elements). No drawing palette change. The calculation-dialog
  comparison switch remains gated off by its existing flag; its shared-role
  markup was updated without enabling it, so runtime interaction is unexecuted.
- Canonical/Claude-adapter schema validation and structure parity passed.
  Current-revision Codex CLI skill probes remain unexecuted because the prior
  automatic approval review rejected
external transmission of private skill/design documents and the user has not
authorized it. Claude CLI was unavailable at the preceding environment check.
Schema/parity validation does not establish cross-agent runtime discovery.

Local evidence: `workspace-style-qa/joined-measurements.json`,
`joined-tests.log` and `joined-*.png` in the task visualization directory.
Numeric/schema/report impact: none; engineering preview/release status unchanged.
