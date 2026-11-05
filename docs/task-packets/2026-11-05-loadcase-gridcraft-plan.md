# Loadcase Gridcraft modal — implementation and evidence

Date: 2026-11-05. Status: implemented Preview; final gate results are recorded below.
This feature changes no engineering acceptance or release status.

## Objective and user decisions

Demand Check has one outlined **Open XLSX** action in place of Import XLSX / Export XLSX.
It opens current P-M loadcases in an independent, movable, resizable Gridcraft modal. The large
Loadcases heading and file/Update actions share one header. Only the grid and its row/column
headings are shown; there is no ribbon, formula bar, sheet-tab bar, status bar or help footer.

Formulas, fill, editing and undo/redo belong to that draft. **Save as** writes its formula-bearing
XLSX. **Update** copies the current evaluated values into P-M in one operation and keeps the modal
open. Closing never applies values and discards the draft. Every new opening starts from current
numeric P-M inputs. No formulas, workbook state or layout are stored in project JSON.

**Open file** inside the modal preserves standalone P-M loadcase import. It replaces the draft
only. It requires declared Units / Load reference metadata and the Loadcases table; it does not
guess mappings for arbitrary Excel files. Working columns remain in the workbook but do not map
back to P-M.

## Controlled change packet

| Item | Contract |
|---|---|
| Change class | Class 3: formula-calculation dependency and loading-input pipeline; the preceding research plan was Class 1. |
| Requirements | `ENG-LOAD-001`, `ENG-RES-002`, `UNITS-001` through `UNITS-005`, `DEV-ARCH-001`, `DEV-ARCH-003`, `DEV-ARCH-007`. |
| Input | Current numeric combinations, captured display units and applied input reference; optionally a supported standalone P-M loadcase XLSX. |
| Output | One validated numeric combination array through the existing loadings owner, or a formula-preserving XLSX from the draft. |
| Blocking failures | Startup/open/save failure, bad headers/IDs/metadata, incomplete or erroneous action cells, non-finite numbers, resource exhaustion, or an input-context change during asynchronous Update. No partial write-back. |
| Oracles | Independent arithmetic and relative/absolute references; independent unit/lever-arm fixtures; exact no-op checks; current demand/regression fixtures for both mechanics. |
| Impact | Numeric authoring only. Project JSON remains v3; canonical N / N mm, reference translation, check basis, result DTOs and reports are unchanged. |
| Out of scope | Formula persistence in P-M, draft recovery, collaboration, load generation, capacity/acceptance calculations in a spreadsheet, full Microsoft Excel parity. |

Authorities read: [control map](../01-control-map.md),
[conventions](../engineering/02-data-conventions-and-terminology.md),
[loadings](../engineering/05-loadings-analysis-results-and-reports.md),
[change control](../engineering/06-verification-acceptance-and-change-control.md),
[architecture](../development/01-architecture-and-package-boundaries.md),
[persistence](../development/02-data-contracts-persistence-and-versioning.md),
[pipelines](../development/04-loadings-analysis-results-and-report-pipelines.md),
[coding workflow](../development/05-coding-quality-and-ai-workflow.md),
[architecture reference](../08-software-architecture-and-api.md),
[units](../development/10-display-units.md), [load reference](../development/16-load-reference-origin.md),
and the [workspace design standard](../../.agents/skills/workspace-style-design/references/design-standard.md).

## Pipeline and ownership

```text
P-M numeric loadcases
  -> existing loadcase workbook / unit / input-reference adapters
  -> independent Gridcraft workbook [formulas, fill, edit, Save as]
  -> Update commits active edit, reads current evaluated scalar values
  -> validate complete array, units, reference and IDs
  -> one immutable numeric loadings update
```

- `LoadingsPanel.tsx` launches `LoadcaseSpreadsheetDialog.tsx`. Shared `MovableDialog.tsx` also
  serves the existing Demand chart Data window, including native modality, focus restoration,
  pointer/keyboard movement and resizing. Grid dragging remains inside its iframe.
- `application/spreadsheets/gridcraft-client.ts` owns the narrow version-1 message protocol.
  Origin, source window, session and request ID are checked. Disposed/late replies cannot update
  another modal. `application/files/xlsx-file.ts` owns user-gesture saving and download fallback.
- `loadings/loadcase-spreadsheet.ts` owns table mapping, complete validation and exact unchanged
  value preservation. It reuses `loadcase-xlsx.ts`, `workbook-units.ts`, `@pm/units` and
  `@pm/project` for metadata, conversions, ID allocation and reference translation. The existing
  shared `allocateIds` utility is now also re-exported through `@pm/project`; allocation is batched.
- `shared/workbook-archive.ts` extracts the existing project XLSX ZIP preflight for both readers;
  the project reader retains its existing errors and limits.
- The bounded engine host reads the first five mapped columns: literal ID, text-valued Name,
  finite numeric Pu/Mux/Muy. Entirely blank mapped rows are ignored; empty names are permitted by
  the existing project contract. Duplicate/malformed IDs fail; blank IDs use the shared allocator.
  Date-formatted numbers, formula errors, booleans and numeric strings cannot become action values.
- Unit/reference metadata is captured from the source workbook, not current browser preferences.
  Updated actions convert units once and translate to centroid once. Unchanged canonical components
  and `pm-unit-source/v1` provenance are preserved. Formula cells cannot reuse stale literal notes.
- File open uses `DocState::new`, recalculates imported formulas and enables automatic calculation.
  Update reads the resulting current values; it does not independently rerun volatile formulas or
  ask ExcelJS to trust an imported cached result. A changed P-M input object blocks stale Update.

## Pinned dependency and bounded patch

Gridcraft upstream revision: `919a6b58fe6661de27af0609d02443ac9db467bf`, version 0.16.0,
inspected and built on 2026-11-05. It is Rust/egui/WebAssembly rather than a React grid library.
Primary source references:
[README](https://github.com/storytold/gridcraft/blob/919a6b58fe6661de27af0609d02443ac9db467bf/README.md),
[document state](https://github.com/storytold/gridcraft/blob/919a6b58fe6661de27af0609d02443ac9db467bf/crates/engine/src/lib.rs),
[web host](https://github.com/storytold/gridcraft/blob/919a6b58fe6661de27af0609d02443ac9db467bf/apps/gridcraft-web/src/host.rs),
[UI](https://github.com/storytold/gridcraft/blob/919a6b58fe6661de27af0609d02443ac9db467bf/crates/ui-egui/src/app.rs),
[NOTICE](https://github.com/storytold/gridcraft/blob/919a6b58fe6661de27af0609d02443ac9db467bf/NOTICE),
and [attribution](https://github.com/storytold/gridcraft/blob/919a6b58fe6661de27af0609d02443ac9db467bf/ATTRIBUTION.md).

The [integration owner](../../tools/gridcraft/README.md) records archive hash, exact compiler and
wasm-bindgen versions, reviewed Cargo.lock, source replacements, MIT/Apache notices and resource
limits. `check:gridcraft` verifies the source/lock/wrapper hashes and every included artifact. The
self-hosted assets load only after Open XLSX; normal application builds need no Rust compiler.
The separate lazy-asset size is 8.83 MiB gzip against a 10 MiB ceiling. Initial route/worker/export
ceilings are unchanged.

The patch hides application chrome, excludes unrelated file/navigation/code commands, disables
workbook recovery/autosave, and supplies ready/open/values/export/theme/close operations rather
than general command execution. It fixes lost same-frame input when in-cell editing first gains
focus and processes host requests after the UI input pass. Files/rows/columns/populated cells,
materialized arrays, concatenated text, formula size and calculation work are explicitly bounded.
External/structured references, Python, macros and iterative calculation are excluded.
Workbook shape, populated-cell count and unsupported content are checked at Open, Update and
Save as, including helper cells. These boundary checks do not preempt every intermediate UI edit.

The evaluator's work/time checks are cooperative at expression boundaries. A builtin cannot be
preempted by a parent timeout; same-origin iframes do not provide CPU or security isolation.
Upstream remains alpha. Compatibility claims cover the tested authoring cases below, not every
Excel function, workbook feature, input method, browser or device. Rejected workbook content and
unsupported/error action cells produce visible failures, without substituting a cached external value.

## Security evidence

The initial local RustSec scan found ZIP and webpki-root-certs vulnerabilities plus a Tokio
unsoundness advisory. The reviewed lock and source compatibility patch pin ZIP 9.2.0,
webpki-root-certs 1.0.10 and Tokio 1.53.3. A subsequent local `cargo-audit` 0.22.2 scan reports
zero known vulnerabilities. Four unmaintained-package warnings remain recorded:
proc-macro-error 1.0.4, zbus_names 4.3.4, zvariant 5.15.0 and zvariant_derive 5.15.0. None occurs
in the locked normal-dependency tree of the shipped wasm32 web target. This is not a universal
dependency-safety claim. The public advisory DB is dated 2026-11-03, revision
`965bf9ad083b58e6340d65829d85217b18be9290`.

The cached npm production audit initially reported zero vulnerabilities. After the user explicitly
authorized public dependency metadata egress, the fresh online `npm run check:security` completed
with exit 0 at the repository's High/Critical threshold. It reported two Moderate entries for the
existing `exceljs@4.4.0 -> uuid@8.3.2` chain:
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
The affected methods are UUID v3/v5/v6 with caller-provided output buffers. Installed ExcelJS
imports only v4 and calls it without arguments in
`lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`; P-M has no direct uuid package imports.
The affected path is absent from those inspected call sites. This is a scoped call-path assessment,
not a claim that the dependency package is advisory-free. ExcelJS and its npm lock remain unchanged;
the two Moderate entries remain explicit maintenance work. The earlier approval rejection was
resolved by user authorization, without a metadata-egress workaround.

## Verification evidence

Evidence is retained under ignored `outputs/gridcraft/`; generated report outputs and downloaded
source/cache/toolchains are not source changes. Tests use an isolated production output
`.next-gridcraft` and loopback port 3017, preserving the user's running dev build.
Application checks used Windows x64, Node 24.22.1 and npm 11.19.1; fingerprint replay alone used
the recorded Node/npm reference pair described below.

| Check | Outcome |
|---|---|
| Structure, documentation, traceability, TypeScript and full `npm test` | Passed, including both mechanics' independently recalculated workbooks, demand checks, project round trips and PDF checks. |
| Focused spreadsheet and bridge tests | Passed: arithmetic, non-finite/type/error boundaries, metadata, ZIP preflight, stable/duplicate IDs, 10,000-row batch allocation, source provenance, exact no-op metric/US/reference values, and late/cancelled protocol replies. |
| Pinned Rust/Wasm release build; `check:gridcraft` | Passed; hashes match and lazy assets fit the independent budget. |
| Cooperative budget tests | Two Rust tests passed: exhaustion blocks work, and nested work cannot reset the outer budget. |
| Production build; `check:web-bundle` | Passed. Initial JS 353.6/375 KiB, Plotly 1325.4/1400 KiB, analysis worker 69.5/120 KiB, Excel 248.1/300 KiB gzip. |
| Numerical matrix | `bench:strain-sampling`, `bench:equivalent-block`, `bench:pipelines` passed with empty failure arrays. |
| Portable capacity fingerprint | Passed with the cached reference Node 24.20.0/npm 11.19.0: 17 allowed resultant-roundoff deviations, worst section-normalized delta 4.957e-17. An initial Node 24.22.1/npm 11.19.1 run correctly failed provenance; no baseline or tolerance was changed. |
| Existing Demand Data browser regression | Eight populated windows across both mechanics passed copy/download, focus, movement/resize, narrow/dark and failure checks after shared-frame extraction. |
| Spreadsheet browser regression | The real Gridcraft canvas passed formula entry at 40 ms/character, relative/absolute fill, paste/undo/redo, values-only Update, formula-preserving XLSX, stale-cache recalculation on Open file, literal-only fresh reopening, atomic error blocking, edited-helper limits at Update/Save as, movement/resize, theme, narrow viewport and Escape. |
| Security | Local RustSec: zero vulnerabilities; four unmaintained warnings outside the shipped wasm32 normal-dependency tree. Fresh online npm gate passed: zero High/Critical, two Moderate entries in the existing ExcelJS/uuid chain, with the scoped call-path review above. |

The browser harness is
[`tools/verification/loadcase-spreadsheet/browser.mjs`](../../tools/verification/loadcase-spreadsheet/browser.mjs).
Its read-only diagnostic snapshot uses the same origin/session-checked values operation; editing,
fill, file opening, saving and Update go through the actual UI. Clipboard-paste coverage uses a
synthetic browser paste event without touching the OS clipboard. IME and native OS clipboard
integration are not independently qualified by that event test.

Final browser runs passed for KDS-EB-01 and KDS-REAL-05, with no unhandled page errors. Both also
passed absolute-reference fill, paste-event/undo and a fully visible header at a 390px viewport.
Cold modal opening in these local Edge runs was approximately two seconds; this is fixture/runtime
evidence, not a network/device performance guarantee. The final lint pass checked 145 Markdown
files / 374 local targets, 39 linked requirements and strict TypeScript. The full test run passed
674 main tests plus the ADSEC/CAD, round-trip, workbook, demand and PDF gates. No accepted-result
or released-report gate is claimed by these feature tests.
