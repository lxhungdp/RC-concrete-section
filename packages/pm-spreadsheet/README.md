# @pm/spreadsheet

Outward, browser-independent XLSX authoring adapter. No React, DOM, file picker, network, analysis
solver or persistence state. ExcelJS 4.4.0 (MIT) is pinned for file transport; Gridcraft remains the
separate pinned web authoring engine. ExcelJS never calculates or trusts formula caches on Update.

Pipeline: bounded ZIP -> declared units/input schema -> authoring template -> versioned engine
mapping -> evaluated scalar snapshot -> complete typed validation -> one feature-owned commit.
`SheetError.code` identifies format, cell, resource or stale-target failures. The application
handles files, modal/app-window lifetime, current-target checks and atomic publication.

- Root exports: generic schema, protocol v4 table/workbook mappings, bounded native workbook preparation, snapshot decoder and numeric-cell boundary.
- `units` / `archive`: shared strict source metadata and ZIP preflight.
- `loadcases` / `loadcase-xlsx`: load-reference-aware mapping through @pm/project and @pm/units.
- `geometry`: selected-ring draft and applied-rebar mapping through @pm/geometry and @pm/units.
- `project-xlsx`: the first external Project input format v1; human engineering sheets, dark-blue
  input text without fills/bold, source Units and strict import through the project validator. The web module
  is a facade. Private field and presentation modules are not separate file readers.
- `project`: bounded evaluated-snapshot decoding through the same v1 reader. `projectFromWorkbookEditor`
  selects the nine required project sheets and current format properties, leaving extra helper sheets
  independent. The Project spreadsheet window calls the existing application project-apply boundary only
  after every group validates. Native Open stages bounded bytes without formatting rewrites; Save
  retains engine workbook styles/formulas. Gridcraft's native UI owns editing/file actions; shared Update and window controls occupy
  the native filename row's reserved right slot, without an extra header. There is no general command
  bridge or project formula persistence. The lower-level
  `prepareProjectSpreadsheet` and `exportProjectSpreadsheet` retain strict plain-template semantics.

Project XLSX contains applied definitions/options only, without UI state, results or report choices.
All nine sheets are visible; Options replaces Analysis. Readonly identity and compatibility
properties contain no duplicate of an editable value. Material yield bindings and resistance
override checks reuse the installed `@pm/materials` and `@pm/design` owners, with no adapter formula.
Unknown format, missing required inputs, conflicting units or metadata and invalid values/references
fail without partial apply. Direct file import rejects formulas; the transient editor supplies
their current evaluated results instead of trusting file caches. Native JSON versions are independent
of workbook v1. The nine required sheets and labels are the explicit project schema even though
the project editor leaves cells unlocked.

New tables declare their own schema/build/prepare/read adapter and use the shared web dialog.
Mapped headings are highlighted and protected, body/helper cells remain editable, ID is hidden,
and only evaluated values cross Update. Formulas/layout remain in the session or saved XLSX.
Full-precision quantity-source metadata preserves literal no-op round trips. Formula cells always
convert their evaluated value from the declared source unit. Rebar As remains independent of dia.

Safety limits are transport bounds, not numerical tolerances: 10 MiB compressed, 64 MiB declared
expanded, 256 ZIP entries, 100,001 rows, 64 columns and 1,000,000 populated cells. The dense evaluated
snapshot is additionally bounded to 1,000,000 mapped slots before allocation, combined across all
sheets in whole-workbook mode. Sheet count is capped at 256. Geometry owners
add their smaller input limits. Unsupported/invalid content fails without partial publication.
Standalone section/loadcase exchange contracts remain separate. No earlier Project XLSX reader or
migration is implemented.

The adapter adds no external dependency version. The ExcelJS transitive uuid moderate advisories
and upstream Gridcraft alpha limitations remain documented in tools/gridcraft/README.md; it does
not upgrade the software's Preview engineering status. See the shared-table and project-dialog
task packets and the project-spreadsheet-title-bar packet for actual gates and limitations.
