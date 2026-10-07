# Editable project Excel import/export

Objective: add an Excel/JSON selector to Import Export, default Excel, and a compact editable
workbook that reconstructs every applied project input through the existing project parser.
Follow-up objective: remove decorative/native-table formatting, consolidate related inputs, and
detect editable blocks by keywords rather than fixed row positions. Users can insert/delete rows
and copy new outer, hole, and material blocks while preserving explicit IDs and references.
Compact follow-up: version 3 uses single-cell outer/hole markers with contextual hole ownership,
optional hidden technical IDs, four visible demand columns, concise Project information, and hidden
Analysis/Resistance settings. New/copied row IDs use the existing identity owner; engineering values
and the current factoredULS demand basis are preserved. No material parameter is derived in Excel.

Change class: 3, input boundary/pipeline behavior; no mechanics, defaults, resistance rules,
canonical schema, or result classification changes.

Requirements: `DEV-ARCH-002/003/007`; development/02 sections 2, 8, 9, 10;
engineering/02 sections 1, 2, 4, 5; engineering/06 sections 2, 6.

Owners/allowed files: development/02 first; web project workbook adapter and project-menu UI;
web workbook tests; project task packet. Existing ExcelJS 4.4.0 is reused without a new dependency.
Spreadsheet skill layout guidance applies; repository runtime workbook generation uses the existing
ExcelJS adapter convention. Artifact Tool is used for disposable visual inspection, not shipped code.

Input: canonical applied `PmProjectDocument` on export; untrusted XLSX bytes on import.
Output: editable version-3 workbook or typed failure; validated canonical project plus warnings.
Blocking failures: malformed ZIP/workbook, resource limits, formulas/cached values, missing columns,
invalid types/units, duplicate keys/entities, broken references, unsupported schema/profile/options,
and any project-parser failure. Preserve the current project on every import failure.

Oracles: independent canonical JSON fixtures from every bundled example; exact full-document
equality after XLSX round trip; direct cell-edit assertions for geometry/materials/loads/options;
invalid workbook mutations and project-parser failures; relocated/repeated headers, reordered columns,
blank-row insertion, copied/add/delete blocks, and row-order-sensitive polygon/curve workflows.
Gates: structure, typecheck, focused workbook tests, full npm test, production build,
web bundle, and cross-model pipeline benchmark for unchanged numeric behavior.

Impact: new external workbook contract only; existing schema-v1 JSON and parser unchanged.
Metadata, IDs, optional fields, full-precision values, signs, units, and profile provenance preserved.
Imported input edits invalidate/recompute through the existing project apply path.

Out of scope: calculation/report workbook redesign, formulas/recalculation in input workbooks,
legacy XLS/CSV project import, numerical kernels, code-profile verification, accepted/released output.

## Compact follow-up verification

Header follow-up: Section and Rebar headers omit mm; Loadings headers omit N/N.mm. Each sheet
declares its canonical units once in the first note row. Export and keyword/header detection use
the same concise names. No unit conversion, engineering input value or canonical JSON field changed.
Fresh structure/typecheck and all 340 unit tests passed, including all 10 workbook tests and exact
round trips of the 14 independent JSON fixtures. Production build and web-bundle checks passed.
The three affected sheets were rendered and visually inspected; independent openpyxl loading,
ZIP CRC/XML parsing and concise-header/hidden-state checks passed. Aggregate npm test remains
blocked by the same four ADSEC source-hash failures; subsequent aggregate phases did not run in
this label-only follow-up (their preceding compact-layout evidence is retained below).

Implemented version 3. Relevant authority additionally includes the public allocateIds identity
allocator (the existing @pm/ids owner, consumed through @pm/geometry) and createLoadCombination
factoredULS owner. Oracles include unchanged full-document fixtures, blank/copied-row identity
allocation, contextual hole ownership, hidden advanced settings, reduced visible columns, and
missing hidden metadata failing closed. Existing IDs survive an unedited round trip; copied/missing
technical hints are assigned fresh IDs without changing engineering values. Authoritative outer,
hole and material IDs remain explicit and unique. No numerical owner or canonical JSON schema changed.

Fresh verification on Node 24.20.0 / npm 11.19.0:

- structure, typecheck, focused workbook suite (10 tests), and git diff whitespace checks passed;
- every one of the 14 independent JSON fixtures round-tripped with exact full-document equality;
  AS/custom/adaptive routes, optional bar references, curves, directions and Unicode also passed;
- 340 unit tests passed on the final adapter, including material visibility and literal loading
  names beginning with # or matching the LOADINGS marker;
- CAD (11 tests), JSON roundtrip, fibre/block Excel, demand-check, PDF report and pipeline benchmark
  passed; the benchmark reported no failures;
- production build and web bundle gate passed: initial gzip 374.2 KiB / 375 KiB and Excel lazy
  chunk 248.1 KiB / 300 KiB;
- all seven sheets were rendered and visually inspected; visible ranges exclude hidden ID columns.
  Advanced sheets/rows remain readable by import; missing sheets fail rather than selecting defaults;
- independent openpyxl loading, ZIP CRC checks and XML parsing passed, and confirmed five visible
  sheets, two hidden sheets and four visible loading columns. The formula-error scan found no matches.

Aggregate npm test passed structure/typecheck/unit phases and still failed at the unchanged ADSEC
source-hash mismatch described below. The evidence and fixtures were preserved. Final status is an
implemented input feature with incomplete aggregate verification, not accepted engineering output.
The previously reported Excel recovery warning has no supplied recovery log or offending workbook;
native Excel behavior must not be claimed verified from an ExcelJS reload alone.

## Version-2 redesign verification

Implemented version 2 with seven plain-cell sheets, explicit per-block field/type contracts,
keyword scanning, movable named headers, repeated record headers, and row-ordered polygon/station/
curve definitions. Outer/hole/material IDs are on their block markers; hole parents and bar steel
references remain explicit. No fixed input-row/column positions or native Excel Tables are used.
Basic text formats protect project dates/identifiers and literal labels during Excel editing;
booleans are exported as TRUE/FALSE. The canonical JSON schema and all numerical owners are unchanged.

Fresh verification on Node 24.20.0 / npm 11.19.0:

- `check:structure`, `typecheck`, and focused workbook suite: 8 tests passed, including exact
  round trips of all 14 independent JSON fixtures and the additional profile/option variants;
- relocated rows/columns, blank-row insertion, case/space-normalized markers, repeated/reordered
  headers, hole-before-outer association, copied outer/hole/steel blocks, vertex insertion/deletion,
  complete block removal, repeated rebar tables, custom curves, and typed malformed-input failures;
- `test:unit`: 338 tests passed; the final text-format change also passed the focused suite;
- `test:cad`, `test:roundtrip`, `test:excel-export`, `test:excel-block`, `test:demand-check`,
  `test:pdf-report`, and `bench:pipelines` passed (pipeline failures: none);
- final production `build` and `check:web-bundle` passed: initial gzip 374.2 KiB / 375 KiB,
  Excel lazy chunk 248.1 KiB / 300 KiB;
- Artifact Tool rendered all seven sheets; every sheet was visually inspected, including the final
  TRUE/FALSE/text-value presentation. The formula-error scan matched zero entries.

Aggregate `npm test` still fails at the pre-existing ADSEC source-hash conflict documented below.
The immutable evidence was not changed. Native Excel open/edit/save remains unexecuted; the
workbook edits above are serialized/reloaded with ExcelJS. The unchanged UI uses the same validated
project-apply path. Version-1 preview workbooks require re-export; there is no silent migration.
This is an implemented input feature with incomplete aggregate verification, not engineering
acceptance or release evidence. The evidence below is scoped to the preceding fixed-row preview.

## Preceding preview evidence

Status: implemented preview input workflow; aggregate verification remains incomplete because the
existing ADSEC fixture-integrity gate fails. No accepted-result or released-report claim.

Implemented files: `apps/web/features/section-editor/project/project-xlsx.ts`,
`SectionDrawingClient.tsx`, `apps/web/app/globals.css`, the owning development/02 contract,
`apps/web/test/project-xlsx.test.ts`, and this packet. The Excel module is loaded on demand.
Workbook format v1 is new; canonical project schema v1 and numerical kernels are unchanged.
The workbook boundary additionally rejects duplicate load IDs, non-factoredULS basis, unknown
explicit bar material references, and attempts to grant profile review/verification status.

Passed on Node 24.20.0 / npm 11.19.0:

- `check:structure`, `typecheck`, and `git diff --check`;
- `test:unit`: 336 tests; final focused workbook suite: 6 tests, covering all 14 canonical project
  fixtures, AS, both custom routes, both adaptive routes, optional references, curves, explicit
  directions, full-precision values, visible edits, sorted records, and typed failure mutations;
- `test:cad`, `test:roundtrip`, `test:excel-export`, `test:excel-block`, `test:demand-check`,
  and `test:pdf-report`;
- `bench:pipelines`: no failures; analytical/kernel and independent workbook ledger evidence also
  passed in the existing suites;
- final production `build` and `check:web-bundle`: initial gzip 374.2 KiB / 375 KiB;
- Artifact Tool imported and rendered all ten worksheets; representative ranges were visually
  inspected, and the formula-error scan found zero matches;
- localhost UI: Excel selected by default, JSON selection changes import accept/command labels,
  and importing the XLSX fixture restores 24 points, 18 bars, two holes, and area 1,120,000 mm2.

`npm test` passed its unit phase and failed at `test:adsec` because source hashes do not match
the retained manifest. For example, `Adsec_P16_Case1-2_KDS근사byEC2.md` has SHA256
`9c08ebf4adb10c4177ba15c90bc324cf333da80e1724d2d57a80e1f61a63b322`
in both HEAD and the working tree; the manifest expects
`6d952aaf71249ea5d8d90629866eeede822c3318c490ed5fbd1364cb5ef529dc`.
The source and oracle were preserved. Resolving that independent evidence conflict is a separate
task and remains a blocking aggregate gate.

Environment limitations: installed Next.js is 16.3.0 while the manifest pins 16.3.5; dependencies
were not changed. Native Excel open/edit/save was not available. The in-app browser's export
download event timed out despite no reported application error, so native download/save is not
claimed as verified. The existing project popover is clipped at the browser's narrow 713 px view;
the new selector was visually checked at 1280 px. The temporary browser/server were closed.
Numerical/design acceptance and released reporting remain subject to the existing independent gates.
