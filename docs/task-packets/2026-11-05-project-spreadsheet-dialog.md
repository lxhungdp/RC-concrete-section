# Project spreadsheet workspace

Subsequent presentation: the [native app-window packet](2026-11-05-native-project-spreadsheet-window.md)
supersedes this packet's modal/hidden-toolbar presentation. The results below describe that earlier
implementation; current Project editing uses the unchanged native Gridcraft UI and separate app bar.

Status: implemented; software verification passed on 2026-11-05. Class 3 input/transport pipeline
change, Preview. Independent engineering/release approval remains open.

Objective: add an accessible Excel icon beside Project in the main toolbar. Open the current
applied project in the pinned Gridcraft engine, with a larger movable/resizable modal, sheet
navigation, Open file, Save and atomic Update. All project rows/cells remain editable. The latest
user instruction makes the XLSX presentation plain: only input text is dark blue, with no fills,
bold text or decorative header styling.

Authorities: control map; engineering/02 and /06; development/01, /02 section 10, /04, /05, /09 and
/17; root 08/09; workspace-style-design standard. Requirements: DEV-ARCH-002/003/007,
UNITS-001..006 and ENG-LOAD-001/ENG-REP-002. No design-code, mechanics, coefficient, numerical
tolerance, source-unit, JSON schema or acceptance-policy change.

Owners: @pm/spreadsheet project adapter validates the complete evaluated workbook using the
existing first-format v1 reader. The web Gridcraft client owns origin/session-checked transport;
the shared spreadsheet dialog owns lifecycle, controls and sizing. The pinned Rust host adds a
bounded whole-workbook mode with native bottom tabs. The existing application project-apply boundary
publishes all validated inputs and invalidates derived results. Formula text/layout remain in the
modal and saved XLSX only; P-M receives evaluated scalar values.

Input: current applied project and captured source units, or a Project XLSX v1 file opened into
the draft. Output: formula-bearing XLSX for Save, or one validated project document for Update.
Required identities, checked unit precision and bindings are retained without a duplicate input
snapshot. Formula cells cannot reuse literal quantity precision notes. Headers remain editable;
invalid labels or required-field deletion fail at Update instead of being locked in the grid.

The project modal starts at 1200 x 760 CSS pixels, clamped to the viewport. It reuses the existing
covered initial-paint transition and shared action/dialog roles. The user's follow-up requires
Gridcraft's native worksheet tabs below the cells, without a separate top navigation bar.
Project rows are unfrozen and unprotected. Existing table modals retain their current size and
protection. A composed applied-input revision protects against late/stale Update;
successful repeated Updates keep the editing workbook/formulas open. Closing discards the draft.

One presentation-only formatter classifies values from the visible table layout for both initial
Project export and modal Save. It clears font decoration/fills/borders and applies dark blue to
inputs, including appended records, independently of imported colours. Cached labels may guide
appearance only; formula caches never become project input evidence. Imported shared styles are
detached before formatting so a heading and data cell cannot recolour each other.

Allowed files: spreadsheet package project/workbook transport, exports and tests; shared web
dialog/client and project wrapper; toolbar/icon/layout owners; Gridcraft host/loader, pinned patch
and rebuilt artifact/manifest; current architecture/persistence/pipeline/input/design docs and
traceability. Preserve all existing local changes. No external dependency or upstream revision
upgrade, no commit or push.

Blocking failures: incompatible metadata/schema/units/profile/model, invalid scalar/date/formula
result, topology/reference or physical-limit failure, missing/duplicate required inputs, stale
target, resource/calculation exhaustion, disposed iframe or unknown host response. None can
partially update P-M. Save retains the draft without applying it.

Oracles: canonical project fixture equality over both mechanics/profiles; independent numeric
formula and US-unit examples; all-sheet and repeated-update tests; missing/invalid/stale/resource
cases; browser editing/fill, tab navigation, save/reopen and whole-project publication; plain
font/fill assertions and native/read-only artifact inspection where applicable. Existing capacity
fingerprints and pipeline fixtures remain unchanged.

Gates: structure/docs/traceability/typecheck, focused package/client tests, Rust host/build checks,
full npm test, production build/bundle, security and relevant unchanged-result benchmark. UI review
covers both themes, narrow layout, focus/move/resize, initial presentation and existing table
regressions. Independent engineering release approval remains outside this feature.

## Delivered slice

- `@pm/spreadsheet/project` owns whole-workbook preparation and evaluated-snapshot decoding through
  the existing v1 reader. The decoder bounds all dense allocations, checks every sheet/cell and
  returns one validated document. Formula quantity results ignore former literal precision notes.
- `ProjectSpreadsheetDialog` composes the shared dialog; the toolbar's Excel icon opens it beside
  Project. It starts at 1200 x 760 CSS pixels and clamps to the viewport. Its rows are unprotected
  and unfrozen. The pinned Gridcraft native bottom tabs, navigator and scrollbar handle navigation;
  there is no duplicate parent tab bar or general sheet-command bridge.
- The shared dialog accepts asynchronous adapters, a bounded Save postprocessor and a target
  comparator. A complete applied-input revision is checked before and after asynchronous work.
  The existing application project-apply boundary updates every group and clears derived results.
  Repeated Update advances the revision and retains formulas in the draft; closing discards it.
- `formatProjectWorkbook` is the one plain-style owner for initial Project export and modal Save.
  It classifies editable values from the visible layout, including appended records, rather than
  inherited colours. Only input text is dark blue (`FF00008B`); headings are regular, without cell
  fills/borders. Imported shared styles are detached, and column styling does not allocate missing
  cells across a sparse rectangle. Values, formulas, notes, units and identities are not rewritten
  by presentation logic.
- Protocol v3 explicitly distinguishes table and workbook mode. The rebuilt checked artifact uses
  the same upstream revision, Rust lock and license bundle. Existing loadcase/coordinate/rebar
  schemas, 600 x 500 dialogs, protected table headings and engineering publication owners remain.

No numerical kernel, design-code interpretation, coefficient/default, source-unit selection,
native project JSON schema, workbook-v1 schema or acceptance policy is changed by this slice.
The working tree includes earlier authorized input/workbook/report changes; those are preserved.
No commit or push was performed.

## Verification evidence

Disposable evidence is under ignored `outputs/project-spreadsheet/`. These checks assess the
combined local working tree, not an isolated release commit.

| Check | Observed result |
|---|---|
| Focused project-workbook/adapter/revision/client tests | 35 passed, including all seven profiles with canonical/US source units, simultaneous group edits, formula precision, invalid/oversized snapshots, appended input styling and sparse-allocation regression |
| `npm test` | Passed: 731 unit tests, 5 ADSEC tests, 11 CAD tests, project round trips, both calculation-workbook integrations, demand-check workbook and PDF checks |
| Structure, docs, traceability and strict TypeScript | Passed in the full gate; final documentation/link checks rerun after this record |
| `npm run build` / `check:web-bundle` | Passed using isolated `apps/web/dist/project-spreadsheet-next`; initial/Plotly/worker/Excel gzip 353.6/1325.4/69.2/248.1 KiB, within unchanged budgets |
| Pinned Rust artifact build / `check:gridcraft` | Passed using existing offline dependency caches, Rust 1.95.0 and the locked source; source/patch/artifact manifest verified; lazy assets 8.82/10.00 MiB gzip |
| `npm run check:security` | Passed High/Critical threshold; the existing two Moderate ExcelJS/uuid advisories remain. No external dependency or lock revision was added/upgraded |
| `npm run bench:verify` | Exact baseline comparison passed: 8 sections x 24 capacity quantities, no bit changed, using installed matching Node 24.20.0/npm 11.19.0 Windows x64 runtime; no tolerance/provenance bypass |
| `npm run bench:pipelines` | Passed, five block pipeline cases, no failures |
| Actual production project editor | Native bottom tabs, all nine sheets, unlocked headings, independent formula Save, all-group/repeated atomic Update, source-unit/reference conversion, values-only reopen, stale-cache recalculation, formula/header errors and stale-project rejection passed; equivalent-block whole-project no-op remained exact |
| Existing table browser regressions | Loadcase formula entry, drag fill, undo/redo, Save/Open, header protection, helpers, error/resource rejection and values-only reopen passed; Coordinates/Rebars retained locked/draft Apply, exact no-op, independent As, repeated Update and stale/cancel guards |
| Presentation/lifecycle | Light/dark and 390px viewport, keyboard focus/Escape, movement/resizing, covered initial paint, cancellation during opening, startup failure and recovery passed. Local initial-ready measurements were about 1.3-1.5 s, not a cross-device performance guarantee |
| Plain XLSX / native Microsoft Excel | Excel 16.0 build 20527 opened, recalculated and saved a separate copy; complete evaluated project/identity equality passed. Independent ZIP/XML checks found 471 cells, 352 dark-blue input cells, 12 retained formulas and no used bold/fill styles in either file |
| Read-only Artifact Tool review | All nine sheets rendered and inspected with plain headings, concise Greek/unit labels and dark-blue values |
| Skill parity and runtime discovery | Canonical/Claude adapter platform validation and repository parity passed. Installed Codex CLI explicit and description-triggered read-only invocations identified native bottom tabs and the plain XLSX rule. Claude CLI is unavailable; its runtime invocation was not executed |

The initial browser-address checks were corrected to account for frozen panes/hidden identity
columns and declared kN/kN m source units; actual value assertions then passed. The plain-style
regression exposed imported shared-style aliasing and a potentially dense column-setter path;
both were fixed before the final gates. No oracle, tolerance or baseline was changed.

Remaining limits: Project Update still requires the explicit nine v1 sheet names, labels and
complete valid inputs; editable structural changes are diagnosed rather than guessed. Save may
retain an unfinished draft without applying it. Formula/layout state remains in the modal/XLSX
only. Gridcraft alpha is not a claim of full Excel compatibility. Native Excel coverage is one
representative whole-project formula workbook in this version. Stage 1 scope, Preview/draft status
and independent accepted-result/released-report gates remain unchanged.
