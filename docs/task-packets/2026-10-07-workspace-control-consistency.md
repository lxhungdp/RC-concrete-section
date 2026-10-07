# Workspace control consistency

Objective: unify Capacity/Demand Check Hide/Show chart controls, give every
editable table cell small rounded focus borders, and rename the toolbar's
misleading Open action to Project with a project icon.

Change class: 1, presentation only. Authorities: docs/00, development/01 and /04,
docs/08, development/09 and the canonical workspace-style-design skill.
Owners: shared tokens/chrome, sidebar strip layout, DemandCheckPanel markup,
SectionDrawingClient toolbar label/icon, design contract and skill/Claude adapter.

Contract: both visibility strips use the standard 26px action buttons, 13px/400
text, 6px corners, 10px horizontal padding and 6px icon gap, from existing shared
action tokens. The user's follow-up rejects the intermediate use of compact
table buttons for sidebar chart visibility. Selected/hidden
states retain dimensions and typography; pressed state and original handlers
remain. Plot-header Hide/layout icons use 22px square targets and 6px corners.
Table inputs/selects/textareas use a shared 4px corner token, including focus;
existing 24px editors, accent focus border and native commit/validation remain.
Project uses a simple 16px outline-file icon and 13px/500 menu text, accessible
name Project menu, and the
existing information/import/export/history/example popup and dismissal handlers.

No calculation, engineering input/default/validation, result eligibility,
project schema, report, dependency, primary palette, CAD colour, pane spacing or
depth changes. Preserve unrelated uncommitted work. No new tests that merely
mirror CSS. Acceptance: rendered both-theme control metrics/state/visibility,
table focus corners across owning editors, project menu activation/dismissal,
structure/typecheck, focused owner tests, application tests, build/bundle and
canonical/adapter schema validation. Record failed/unexecuted gates below.

## Verification evidence

- Structure, strict TypeScript and the final production build passed. Bundle
  gate passed: initial JavaScript 372.7/375 KiB, Plotly 1325.7/1400 KiB, worker
  116.9/120 KiB and Excel 248.1/300 KiB, measured as gzip.
- All 35 focused results tests and 340 application/package unit tests passed.
  Aggregate `npm test` stopped at the same four pre-existing ADSEC source-hash
  failures: KDS/P16 `9c08ebf4` versus manifest `6d952aaf`, ACI `be988e18` versus
  manifest `922c722e`. No source, manifest, oracle or tolerance changed.
  Separately executed downstream gates passed: 11 CAD tests, project JSON
  round trip, stress-strain and equivalent-block Excel exports, Demand Check
  workbook and PDF report. Three output-writing integration gates initially
  hit sandbox EPERM and passed when rerun with local filesystem approval.
  Later CSS/icon refinements were checked by build and rendered UI; unit tests
  were not rerun for every visual iteration.
- In both themes, Capacity/Demand Check chart visibility matched on all
  measured style fields: 26px height, 13px/400 text, 6px corners/icon gap,
  10px horizontal padding, colours and borders. Hidden states retained size and
  typography. Pointer Hide and Enter Show worked in both result workspaces.
  Plot-header icon targets measured 22px with 6px corners.
- Project/Materials text matched family, size (13px), weight (500), line height
  and colour in both themes. The trigger rendered the 16px outline-file icon.
  Project menu activation by pointer/Enter and Escape/outside dismissal passed;
  information, Excel/JSON, recent files and grouped examples remained available.
- Section points, Rebar, Loadings, Materials curve and Options table inputs
  measured 4px corners and one accent focus border in both themes. The Options
  criteria select retained 4px corners and 12px typography after Escape;
  editor heights remained 24px. The material-curve inspection used the owned
  browser's test fixture; the original fixture was reloaded afterwards.
- At 360px viewport, standard chart buttons stayed 26px and the page had no
  horizontal overflow. Project popup stayed within the viewport (left 40px,
  right 326px). The temporary viewport override was reset. Browser console had
  no errors or warnings. All 135 baseline CAD style signatures remained present
  in both themes (160 current elements including existing annotations/selection).
- Canonical/Claude-adapter schema validation and structure parity passed.
  Current-revision explicit and description-triggered Codex CLI skill probes
  remain unexecuted: the prior automatic approval review rejected external
  transmission of the private skill/design documents, and the user has not
  authorized that transmission. Claude CLI was unavailable in the preceding
  environment check; its runtime probes remain unexecuted. Schema validation
  does not establish cross-agent runtime discovery.

Local evidence is in the task visualization directory under `workspace-style-qa`:
`consistency-measurements.json`, `consistency-tests.log`, integration logs and
`consistency-*.png`. Numeric/schema/report impact: none. Aggregate ADSEC and
cross-agent runtime gates remain unresolved; engineering preview/release status
is unchanged.

## Project information text-only refinement

The user's follow-up removes both the decorative briefcase and chevron from
the Project information row inside Project menu. SectionDrawingClient retains
its existing named button and dialog handler; the toolbar Project file icon
and other menu actions retain their roles. Development/09 records the text-only
row. No numeric, schema or report impact; class 1 presentation change.

Rendered light/dark checks found zero SVGs in that row, with the existing
13px/400 text and 256px width. Pointer and Enter both opened the correct dialog.
Structure/typecheck, 15 focused project tests, 340 unit tests, production build
and bundle gate passed (initial JavaScript 372.6/375 KiB gzip). Aggregate tests
still stop at the same four ADSEC source-hash failures described above.
Separate CAD, JSON, Excel and PDF downstream checks passed. Evidence:
`workspace-style-qa/project-information-text-*.png`,
`project-information-text-evidence.json` and `project-text-only-*.log` in the
task visualization directory. No skill source change or new CLI probe.
