# Single Project spreadsheet title row

Status: implemented; application verification passed on 2026-11-05. Class 1 presentation change,
Preview. Cross-agent runtime verification remains incomplete because Claude CLI is unavailable.

Objective: remove the separate P-M header row. Show only native Open/Save/Undo/Redo icons at the left
and the native truncated filename centred. Replace the right Search/Share/Comments/theme cluster
with primary Update to Project, Minimize, Maximize/Restore and Close on that same row. Keep the
native ribbon, menus, formula bar, sheet tabs, file actions and editing behavior below it.

Authorities: docs/00, control map; development/01, /04, /05, /09; root 08; canonical workspace
standard. Requirement DEV-ARCH-007. This supersedes the separate app-bar presentation in the
native-project-spreadsheet-window packet. No engineering or persistence contract changes.

Owners: the pinned Gridcraft title-bar patch reserves its right-hand slot, renders the four native
left commands and keeps the centred filename. Shared MovableDialog owns overlay action roles, drag/resize/min/max bounds
and accessible controls. ProjectSpreadsheetWindow selects the integrated presentation only.

Input/output: unchanged project capture, native file staging, bounded protocol v4 and evaluated
atomic Update. No workbook/schema, unit, formula, engineering algorithm, acceptance or report
change. No new dependencies or upstream revision. Preserve all existing local work.

Blocking UI failures: duplicate title rows, intercepted native left buttons, title/control overlap,
lost drag/min/max/restore or draft state, startup cancellation regression, altered native file or
Update behavior. No new transport action or general engine API.

Allowed files: shared window CSS/component, Project presentation, pinned title-bar patch/artifact,
focused browser verification and current UI/architecture/pipeline/dependency docs and paired skill.
No commit or push is requested.

Acceptance: actual populated native title row in both themes, native Save/Open and formulas,
atomic repeated/invalid/stale Update, title dragging and min/max/restore/resize, narrow viewport,
startup close, existing table regressions; structure/docs/trace/typecheck/focused tests, full
application tests, production build, artifact/bundle and authorized security gates. Complete paired
skill schema/CLI invocation checks where installed. UI verification does not close release gates.

## Delivered layout and impact

The native canvas now starts at the window's upper edge. A 38px transparent shared-control overlay
shares Gridcraft's existing title row, rather than consuming a second row. Only Open, Save, Undo
and Redo remain at the left, using native command/undo availability. AutoSave, Home, the Undo-list
chevron and More are omitted in Project mode. The native renderer still centres/truncates the
filename and unsaved marker. Its right Search/Share/Comments/theme cluster is omitted only in
Project-host mode and reserves a 240px slot plus 8px inset for accessible P-M action buttons.
Update remains primary and immediately precedes Minimize, Maximize/Restore and Close.

A transparent centre hit area provides pointer dragging and double-click maximize; native left
controls remain clickable. Shared keyboard move/resize and window bounds remain with MovableDialog.
Normal minimum width is 680px where the viewport permits, keeping both control groups usable;
the compact minimized bar retains its prior width and adds the outer border to its measured height.
Minimize retains the mounted draft. Native File/View menus still offer theme selection, and opening
inherits P-M's theme. Existing modal/table callers do not select the integrated title-row modifier.
Protocol v4, file/session lifetimes and the entire spreadsheet/project-value pipeline are unchanged.
No engineering package, result/schema, source-unit or report contract changed in this presentation slice.

## Original single-row verification

Evidence: ignored outputs/project-spreadsheet-title-bar/. Windows x64, Node 24.22.1, npm 11.19.0;
pinned Gridcraft source/toolchain unchanged. This evidence predates the four-icon left-cluster
follow-up; its current verification is recorded below.

- npm test: passed, including structure, documentation, 39-requirement traceability, TypeScript,
  739 unit tests, 5 ADSEC tests, 11 CAD tests, project round-trip and all Excel/Demand/PDF integrations.
  Focused window/client/revision/project spreadsheet tests: 22 passed. AVA's optional update-store
  permission notice did not fail CAD assertions or the command.
- npm run build:gridcraft and check:gridcraft: passed; the rebuilt source/artifact manifest matches.
  Lazy assets remain 8.84/10.00 MiB gzip. Only the bounded title-row source patch changed.
- Isolated production npm run build and check:web-bundle: passed. Initial JavaScript remains
  353.6/375.0 KiB gzip, Excel lazy chunk 248.1/300.0 KiB; other bundle ceilings also passed.
- Authorized npm run check:security: passed the declared High/Critical threshold. The two previously
  documented Moderate ExcelJS/uuid entries remain; no dependency version changed.
- Actual Edge/WebAssembly Project browser verification: passed on development and production.
  Geometry assertions show the iframe begins within 2px of the outer window top, and all Update/
  window controls fit in the existing 38px filename row. Screenshots in light/dark confirm one
  row, native left controls/centred filename, and removal of the right Search/Share cluster.
  Quick Access Save, Ctrl+O/Ctrl+S, fresh formulas/helper fill, formatted XLSX Save, atomic/repeated
  values-only Update, invalid/generic/stale rejection, close during startup, parent reload,
  pointer title drag, keyboard move/resize, min/max/restore, Update while minimized and narrow
  viewport all passed; no page errors occurred. No engine command test API was introduced.
- Existing Section/Rebar and Loadcase spreadsheet browser suites: passed against production,
  preserving cells-only layout, protected headers, formulas/fill, exact no-op, independent As,
  explicit geometry Apply, stale/resource/error rejection and values-only reopening.
- Paired canonical/Claude skill schemas and structure parity: passed. Installed Codex CLI explicit
  and description-triggered read-only checks both read the complete skill/standard and reported
  the single native title row. Claude CLI is not installed, so its runtime checks remain unexecuted.

Numerical benchmarks were not repeated for this presentation-only change: no engineering inputs,
algorithms, tolerances or numerical dependencies were changed; full result/report regression ran.
The earlier app-window packet retains its unchanged-result benchmark evidence. This UI verification
does not confer independent engineering or release approval.

## Open/Save/Undo/Redo follow-up

Latest user instruction: replace the left AutoSave/Quick Access cluster with only Open, Save,
Undo and Redo icons, in that order. Class 1 presentation-only change; the same DEV-ARCH-007
contract and scope apply. The pinned title-row patch changes rendering only; it reuses file.open,
file.save, edit.undo and edit.redo, with no new engine or transport API. The transparent parent
drag region starts after the reduced left cluster. Filename/right controls, workbook inputs,
bounded file/session handling, atomic Update, numerical results and project JSON are unchanged.

Verification passed on 2026-11-05; evidence directory outputs/project-spreadsheet-quick-access/.

- The rebuilt artifact and isolated production build passed source/manifest and bundle checks.
  Lazy Gridcraft remains 8.84/10.00 MiB gzip; initial/Excel JavaScript remain within their existing
  ceilings. An initial Windows mapped-file lock prevented replacing the old WASM; retrying after
  the verification browser closed published it successfully. Subsequent build and browser gates
  used the new checked artifact, rather than the earlier file.
- npm test passed: structure/docs/39-requirement traceability, typecheck, 739 unit tests, 5 ADSEC,
  11 CAD, project round-trip and all report/Excel/PDF integrations. Authorized security audit passed
  the High/Critical threshold; the same two documented Moderate ExcelJS/uuid entries remain.
- Actual development and production Edge/WebAssembly flows passed. Open and Save were clicked in
  the new left positions. Undo restored the complete previous literal cell; Redo restored its formula
  and current result. Ctrl+O/Ctrl+S also passed. Screenshots show exactly four left icons without
  AutoSave/Home/history-chevron/More, the centred filename and unchanged right controls/ribbon.
  Formula/fill/file caches, repeated atomic Update, invalid/stale rejection, value-only reopen,
  title drag, min/max/restore, minimized Update, startup close and viewport checks all passed.
- Production Section/Rebar and Loadcase browser regressions passed; no page errors occurred.
- Paired skill schemas/structure and installed Codex CLI explicit/description-triggered read-only
  invocation checks passed against the four-icon standard. Claude CLI remains unavailable, so
  its runtime invocation checks are still unexecuted. No cross-agent runtime completeness or
  engineering/release approval is claimed.

No numerical benchmark was repeated for this rendering-only follow-up; no engineering algorithm,
input, tolerance, unit, schema, numerical dependency or acceptance policy changed.

## Toolbar entry icon follow-up

On 2026-11-06 the Project Excel action adopted the green File Excel solid SVG from Font Awesome
Free 6.7.2 under CC BY 4.0. `WorkspaceIcons.tsx` embeds attribution in the SVG metadata. The
workspace design standard defines the green glyph as a toolbar presentation exception.

The production browser check measured a 14 CSS-pixel icon in both themes and exercised the Excel
button and Close. The rendered SVG carried its attribution. Screenshots and browser evidence are
in `outputs/toolbar-excel-icon/`. The full test suite with 739 unit tests, production build,
bundle check, paired skill validators and both Codex CLI discovery checks passed. Claude CLI
runtime checks are unexecuted because Claude CLI is unavailable.

## Project menu file actions

On 2026-11-06 the spreadsheet entry point moved to `Project` in the `Import / Export / Open` group.
Import, Export and text-only Open share a row below the format selector. Open displays the current
project workbook or restores its existing draft. The spreadsheet's native Open loads local XLSX.
The Project popover layers above a modeless draft, and closing a newly opened workbook returns focus
to the Project trigger.

The full suite with 741 unit tests passed for the menu entry point. The final row passed lint,
production build, bundle and browser checks. Browser evidence in `outputs/project-menu-open-row/`
covers the desktop and 360 CSS-pixel layouts, workbook Open/Save and draft restoration. Paired skill
validation and both Codex CLI discovery checks passed. Claude CLI runtime checks are unexecuted
because Claude CLI is unavailable.
