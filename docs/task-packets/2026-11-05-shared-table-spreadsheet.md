# Shared table spreadsheet pipeline

Status: implemented and regression-tested Preview; no engineering release approval.

- Objective: extract the loadcase XLSX editor into a reusable package pipeline and use the same
  modal for the selected Concrete Outer/Hole coordinates and applied Rebar table.
- Change class: 3 (input adapter/pipeline). No mechanics, material law, resistance rule, tolerance,
  project schema or release-state change.
- Requirements: ENG-GEO-001/002/005, REBAR-AS-001..003, UNITS-001..005 and the inward dependency
  contract in development/01. These are input-editing features, not new verified design capability.
- Owners: development/01 package/runtime separation; development/03 draft/Apply and reinforcement
  editing; engineering/03 geometry/stored-area rules; @pm/geometry validation, @pm/project load
  reference/identity, @pm/units conversion. @pm/spreadsheet is an outward XLSX adapter package.
- Input contract: bounded XLSX plus explicit table mapping, source units, original numeric values
  and immutable target identity. Gridcraft is a transient authoring engine, never a P-M solver.
- Output contract: fully checked evaluated scalar rows; one atomic Update callback; no formulas or
  spreadsheet layout in project JSON. Coordinates update only the selected unlocked draft ring;
  Apply remains the geometry transition. Rebars update the existing applied-input path.
- Blocking failures: invalid archives/metadata/headers/IDs/finite numbers; formula errors/dates;
  unsupported workbook content; resource exhaustion; unresolved steel IDs; invalid topology/bar
  disks/overlap; stale/locked/deleted targets; cancelled or disposed sessions. No partial update.
- Identity: preserve literal positive unique IDs, allocate blank IDs against all reserved IDs in
  the existing namespace, and retain the selected row when it survives. Imported material references
  are explicit IDs, never guessed from a name or silently replaced.
- Rebar provenance: diameter and stored As remain independent. Unchanged dimensions preserve their
  source snapshot; changing either dimension clears it to Manual. Positional/material edits retain
  dimensional provenance. Full-precision no-op unit transport remains exact.
- Acceptance/oracles: shared workbook/snapshot protocol tests; independent explicit unit tuples;
  exact no-op and edited-value tests; point namespace and complete draft topology rejection;
  independent dia/As/material and provenance cases; production browser formula/fill/Save/Update,
  stale/locked/cancel and light/dark/narrow checks for all three tables. Existing project round-trip,
  workbook/PDF and both mechanics regression/sampling/pipeline gates remain unchanged.
- Impact: a versioned generic host protocol replaces the fixed Loadcases/5-column host mapping.
  New coordinate and rebar authoring workbook kinds are explicit; legacy section/project exchange
  formats retain their readers and exporters. No schema/report numeric changes for a no-op Update.
- Exclusions: engineering formulas in sheets, persisted workbook sessions, multi-region parent
  assignment, code-specific detailing/cover qualification, new external dependencies, baseline or
  tolerance rewrites, unrelated result/chart work, commits and pushes.

## Verification evidence

Production-browser verification exposed an upstream transport defect: a formula containing
`22.56758334191025+1` saved its constant as `22.5675833419103`, while keeping the prior cached
result. Reopening/recalculation therefore changed diameter. The bounded source patch now chooses
the existing exact scientific representation whenever the display formatter loses binary64 bits.
No oracle/tolerance is changed. Native Rust parser/printer tests and browser save/reopen cover it.

The single package now owns generic table/ZIP/unit transport and the three pure table adapters.
The web owns one `shared/SpreadsheetDialog`, one Gridcraft client and one file-saving adapter.
Existing web loadcase/unit/archive module paths re-export the package to retain their callers;
browser download code remains in the web facade. Section/Rebar components only select the adapter
and publish through their existing state owners. The legacy whole-section workbook remains an
explicit separate exchange format, not an inferred reader for the new table workbook kinds.

Evidence is written to ignored `outputs/shared-table-spreadsheet/`:

- `final-focused.log`: 54 focused tests pass. Oracles include exact literal no-op transport in both
  unit systems, explicit independent inch/mm and in²/mm² tuples, selected-Hole preservation and
  rejection, ID reservations, independent dia/As, dimensional source invalidation, material references,
  malformed/formula-error/date cells and resource bounds. No baselines/tolerances are rewritten.
- `final-npm-test.log`: the full application suite passes (702 unit tests, 5 ADSEC cases, 11 CAD
  cases, project round-trip, independent HyperFormula workbooks for both mechanics and Demand Check,
  and deterministic preview PDFs). The later selected-Hole test is included in the focused count.
- `rust-formula-final.log`: 36 unit and 8 integration parser/printer tests pass, including bit-exact
  constants, negative zero, subnormal/minimum/maximum binary64 values. The final WebAssembly build
  uses Rust 1.95.0 / wasm-bindgen 0.2.129 with the unchanged reviewed lockfile.
- `gridcraft-final-build.log` / `final-build.log`: pinned artifact build/hash checks and the
  isolated production build pass. The artifact remains 8.82/10 MiB gzip.
- `final-bundle.log`: initial 352.7/375 KiB, Plotly 1325.4/1400, analysis worker 69.3/120 and
  Excel 248.1/300 KiB gzip. The spreadsheet WASM remains outside the worker and is fetched on modal opening.
- `bench-portable.log`, `bench-strain.log`, `bench-block.log`, `bench-pipelines.log`: all existing
  numerical gates pass. The portable fingerprint uses the required Node 24.20.0/npm 11.19.0 pair:
  17 permitted resultant-roundoff deviations, worst section-normalized 4.957e-17. This is the
  declared cross-platform policy, not same-platform bit identity. Other checks/builds use Windows
  x64 Node 24.22.1/npm 11.19.1. No new structural method or coefficient is introduced.
- `browser-block.log`, `browser-strain.log`, `block/`, `strain/`: real Edge/Gridcraft coordinate
  and rebar tests pass for the block rectangle and complex stress-strain section with holes.
  They check 600 × 500 size, selected Outer/Hole mapping, locked Update, draft-only coordinates
  until Apply, unchanged applied bars, exact rebar no-op, independent As on a formula diameter edit,
  repeated Update, formula-preserving Save/reopen, literal values on a fresh modal, cancellation,
  project-replacement stale-target rejection, and light/dark/narrow layouts. No page errors occur.
- `browser-loadcases.log` / `loadcases/`: existing real-canvas header lock, formula, drag-fill,
  paste, undo/redo, automatic imported-cache recalculation, formula/helper bounds, Save as,
  values-only reopen and pointer/keyboard move/resize regression passes after extraction.
- `opening.log` / `opening/`: the narrow dark opening remains covered through open/theme/paint;
  cancellation during presentation, failed WASM startup and recovery/reopen pass. The inspected
  filmstrip moves from the parent Opening surface directly to populated cells. No page errors occur.
- `final-structure.log`, `docs.log`, `traceability.log` and the final typecheck record the static
  gates. The dependency guard permits only ExcelJS at this outward adapter boundary and rejects
  domain imports of @pm/spreadsheet. No skill workflow/standard is changed in this slice.
- `../shared-table-spreadsheet-security.log`: fresh authorized npm production audit passes the
  High/Critical gate. The two existing Moderate ExcelJS/uuid advisories remain; no external
  dependency version is added or changed and no breaking automatic downgrade is applied.

The project remains Stage 1 Preview. Stored geometry/rebar values change only on the declared
Update/Apply transitions. Project JSON schema, mechanics, resistance rules and report classification
are unchanged. Full Excel compatibility and accepted engineering/released-report qualification
remain outside this implementation.
