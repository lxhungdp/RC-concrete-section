# Compact loadcase modal and protected header

Date: 2026-11-05. Status: implemented; required checks pass; Preview only.

## Requested behavior

- Set the modal's default to the user's revised 600 × 500 CSS pixels; keep viewport clamping, movement
  and resizing.
- Remove visible cell notes from the embedded grid, including corner markers and hover panels.
  Keep quantity-source metadata for exact no-op unit transport rather than changing numeric values.
- Highlight and lock the mapped ID / Name / Pu / Mux / Muy header cells. Keep data and helper
  cells editable, including formula entry and fill.

Class 2 presentation/template change. Owners: development/04 spreadsheet workflow, the workspace
design standard, `loadcase-spreadsheet.ts`, and the bounded Gridcraft presentation patch. No new
dependency, formula evaluator, unit/reference rule, project schema, result DTO or acceptance state.

## Implementation

- `workspace-chrome.css` sets the default to 600 × 500 with the existing viewport limits and
  native/dialog resize behavior. The large heading and actions remain together.
- `loadcase-spreadsheet.ts` unlocks the bounded data/helper columns and existing data rows, then
  protects the five mapped headings. The header uses the approved light workspace accent on the
  paper grid, with bold white text. Password-free worksheet protection is also retained in XLSX.
  Header styles are copied before editing: imported body/helper cells sharing an ExcelJS style
  object must remain editable and retain their own appearance.
- The pinned Gridcraft UI patch suppresses note/comment corner markers and hover panels in
  cells-only mode, and removes comment/note creation actions from its context menu. Review commands
  cannot unprotect the header in the embedded UI. The stored notes remain available to Update and
  XLSX transport, preserving exact canonical provenance; only their modal presentation is omitted.
- The versioned message protocol, formula evaluator, source-unit/reference conversion, numeric
  values-only Update and project persistence contracts are unchanged.

## Verification evidence

Ignored evidence is under `outputs/gridcraft/`.

- Nineteen focused spreadsheet/bridge/XLSX tests pass, including exact metric/US/reference no-op
  transport, formula provenance, protection of every mapped heading, editable body/future helpers,
  and an imported shared-style regression.
- Real-canvas production checks pass for KDS-EB-01 and KDS-REAL-05 (`compact-final-block/` and
  `compact-final-strain/`). Both measured an initial 600 × 500 window and blocked header paste and
  clear. Formula entry/fill, paste/undo, Update, Save as, source-file recalculation, literal-only
  reopening, invalid-input/resource boundaries, movement/resize and narrow/dark checks pass.
- `note-hover.png` was inspected after an explicit note-bearing file was opened and the hover
  delay elapsed: no note triangle or popup is shown. The values snapshot still contains its source
  note. The highlighted/protected header also survives Save as.
- `compact-opening/` passes the no-flash presentation, cancellation, failed-Wasm-load and recovery
  checks. No unhandled page error was observed.
- The pinned Rust/Wasm build and artifact hash gate pass. Lazy assets are 8.82/10 MiB gzip; the
  dependency lock and host/numerical protocol sources are unchanged.
- Production build and bundle gates pass: initial JS 353.5/375 KiB gzip, Plotly 1325.4/1400,
  analysis worker 69.3/120 and Excel 248.1/300.
- The final full `npm test` passes with exit 0: structure, documentation, traceability, TypeScript,
  687 unit tests, ADSEC/CAD, project round trips, independently recalculated workbooks for both
  mechanics, demand checks and reproducible preview PDF. Evidence: `compact-final-npm-test.log`.
  These are software/UI regression results, not accepted engineering or release approval.
