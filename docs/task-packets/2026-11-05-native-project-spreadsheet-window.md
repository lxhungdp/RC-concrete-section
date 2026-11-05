# Native Gridcraft project app window

Presentation superseded by the [single title-row packet](2026-11-05-project-spreadsheet-title-bar.md).
The separate header described below is historical verification evidence. Current editing places
Update/window controls in the native filename row, preserving the transport/input contracts here.

Status: implemented; application verification passed on 2026-11-05. Class 3 input/transport
workflow change, Preview. Cross-agent runtime verification is incomplete because Claude CLI is
not installed; independent engineering/release approval remains open.

Objective: show the original Gridcraft editor as a modeless app window inside P-M, with no separate
browser address bar. Add a separate app title bar above the unchanged native UI. Its right side is
primary Update to Project, Minimize, Maximize/Restore and Close, in that order. Keep all original
Gridcraft title/ribbon/menu/formula/tab/status controls and Open/Save; never insert Update into its
ribbon. This reflects the latest explicit user instruction. No desktop install or browser-chrome
API is required; the main P-M browser remains an ordinary browser.

Authorities: root control map; development/01, /02 section 10, /04, /05 and /09; engineering/02 and
/06; root 08/09; canonical workspace standard and spreadsheet/units/project owners. Requirements:
DEV-ARCH-002/003/007, UNITS-003/005 and ENG-LOAD-001. This changes presentation, file/session
orchestration and transport only, not mechanics, coefficients, native project JSON, workbook-v1
schema, unit/reference rules or engineering acceptance policy.

Owners: shared MovableDialog owns transient move/resize and modeless min/max/restore geometry.
ProjectSpreadsheetWindow orchestrates the native frame; the application Gridcraft window/client
owns parent/origin/session checks and transport, and xlsx-file owns file selection/saving. The
pinned Gridcraft patch exposes full native UI and routes native file actions through the bounded
file adapter. @pm/spreadsheet validates complete evaluated inputs through its single v1 reader.
The existing project-apply callback publishes one complete document.

Input: captured applied project/source units, or a bounded workbook staged through native Open.
Output: independent formula-bearing XLSX, or evaluated values committed by explicit Update.
Generated Project files remain plain with dark-blue inputs only. Native Save preserves authored
styles/formulas/layout/helper sheets. Only the nine declared project sheets and current format
properties enter Update; helpers remain independent. Generic workbooks can open/edit/save, while
Update requires complete Project XLSX v1. Formulas/layout stay outside project JSON. Existing
table dialogs retain cells-only presentation, sizes and header protection.

A fresh session is registered before iframe navigation, including Strict Mode remount. Closing
retires it and rejects pending operations. Minimize keeps the draft mounted; restore retains its
prior normal/maximized bounds. Repeated toolbar Excel clicks restore/focus the draft. There is no
backdrop/focus trap. Native Escape stays inside Gridcraft. Applied-input changes invalidate a late
Update even when IDs match; unchanged metadata copies do not. Native files and Update share one
busy boundary. Startup stays covered until workbook/theme and two paint frames are ready.

Blocking failures: failed initialization, retired session, incompatible metadata/sheets/units,
unsupported input/formula result, resource/calculation exhaustion, stale project or late response.
No failure may partially update P-M. Expected errors use native Gridcraft feedback. Save/Open do
not apply project values. Current-workbook metadata is validated, never an earlier file's metadata.
No formula cache is used as an input oracle; array buffers are normalized at the ExcelJS realm
boundary. No numerical tolerance, regression baseline or release status is changed.

Allowed files: shared window and project toolbar/controller, application file/client/window
adapters and focused tests; Gridcraft host/patch/loader and rebuilt artifact/manifest; current
architecture, persistence/pipeline/design/input documentation and traceability. Preserve existing
local work. No dependency/upstream revision upgrade, commit or push.

Oracles/gates: actual native menu Open/Save/keyboard and app-bar Update through WebAssembly;
full-project evaluated equality in both mechanics, stale-cache recalculation, independent formatted
Save/helper fill, invalid/stale/closed/busy cases; modeless focus/reopen, min/max/restore/resize and
initial-paint checks; existing table regressions; structure/docs/traceability/typecheck, focused
and full tests, pinned Rust artifact check, production build/bundle, authorized security audit and
unchanged-result benchmark. Validate paired skill discovery. UI QA does not confer independent
engineering release.

## Delivered contracts

- The shared document primitive supports native modal showModal() and modeless show() separately.
  Project uses the latter: no backdrop, focus trap, separate browser popup or address bar.
  A 1280 by 840 preferred window is viewport-clamped. Its separate app bar uses shared action
  roles, with primary Update to Project immediately before Minimize, Maximize/Restore and Close.
  The pinned native title/menu/ribbon/formula/tabs/status layout is unchanged.
- Application protocol v4 checks source, origin and a fresh per-frame session. Native actions are
  limited to Open/Save/Save As; Update is a parent app-bar action, not a native command. Busy state
  serializes files/Update and pauses editing. Closing cancels pending presentation and transport;
  the initial populated frame is shown only after workbook/theme acknowledgement and paint.
- Native file staging preserves authored content within existing resource limits. The project
  adapter selects only the nine required sheets and current workbook properties, using the same
  strict v1 reader and existing apply boundary. Independent helpers remain in the XLSX. No JSON
  schema, unit/sign/reference rule, resistance calculation or result acceptance state changes.
- Applied input references and editable metadata values guard stale updates. Exporting unchanged
  project metadata does not falsely invalidate the draft. Formula results always discard former
  literal precision notes. ExcelJS input buffers are copied into the importing realm before ZIP
  parsing, avoiding cross-window File.arrayBuffer failures.

## Verification evidence

Evidence is in ignored outputs/native-project-window/. Runtime: Windows x64, Node 24.22.1 /
npm 11.19.0 for application gates; exact benchmark provenance uses Node 24.20.0 / npm 11.19.0.

- npm test: passed. Includes structure, documentation and 39-requirement traceability checks,
  TypeScript, 739 unit tests, 5 ADSEC tests, 11 CAD tests, project round trip and Excel/Demand/PDF
  integration checks. Focused owner tests passed. AVA's optional update-store check printed a
  permission notice; all CAD assertions and the test command succeeded.
- npm run build with PM_NEXT_DIST_DIR=dist/native-project-window-next: passed, using an isolated
  directory. npm run check:web-bundle: passed (initial 353.6/375.0 KiB gzip; Excel 248.1/300.0 KiB).
- npm run build:gridcraft and npm run check:gridcraft: passed using the pinned source/lock/toolchain;
  lazy asset size 8.84/10.00 MiB gzip. No external dependency revision was changed.
- npm run check:security: passed the declared High/Critical threshold. The two previously documented
  Moderate ExcelJS/uuid entries remain; no force downgrade or unreviewed lock change was made.
- npm run bench:verify: passed, bit-identical 8 sections by 24 capacity quantities with unchanged
  inverse-equilibrium evidence. npm run bench:pipelines: five cases, zero failures. No baseline or
  tolerance was edited.
- tools/verification/project-spreadsheet/browser.mjs: passed on development and isolated production
  servers through actual Edge/WebAssembly UI. The final production run opened populated data in
  about 1.0 seconds; this is local observation, not a performance guarantee. It covers the exact
  app-bar order/primary style, no separate browser window, original File menu/Quick Access Save/
  Ctrl+O/Ctrl+S, fast formula entry, stale-cache recalculation, helper relative fill, authored-format
  Save, both mechanics, repeated complete Update and values-only reopening. Formula-error, generic
  workbook and stale-input Update leave P-M unchanged. Close during startup and parent reload retire
  the frame. Minimize, maximize after manual resizing, restore, keyboard move/resize, narrow viewport,
  native Escape, toolbar refocus and Update from the compact bar preserve the draft. Light/dark,
  File-menu, minimized, maximized and resized screenshots are retained; no page errors occurred.
- Existing table-spreadsheet and loadcase-spreadsheet browser suites: passed against production.
  Protected headers, formulas, fill, exact no-op, independent As, explicit geometry Apply, values-only
  Update, invalid/resource/stale cases and reopen behavior are preserved. Two harmless missing-resource
  console messages were logged by the existing Loadcase suite; its page-error array is empty.
- Canonical/Claude skill schema validation and structure parity: passed. Installed Codex CLI explicit
  and description-triggered read-only invocations both loaded the complete skill/standard and reported
  the required separate app bar. Claude CLI is unavailable: its two runtime invocations remain
  unexecuted, so this is not a claim of complete cross-agent runtime verification.

Remaining boundaries: window controls operate within the P-M browser viewport, not the operating
system; the main P-M page remains an ordinary web page. Gridcraft is the pinned upstream alpha,
not a claim of complete Microsoft Excel compatibility. Closing discards unsaved transient work.
No calculation/release assurance is inferred from UI tests; independent release gates stay open.
