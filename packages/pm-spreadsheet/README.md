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
- `project-xlsx` writes four visible v2 input sheets (Section, Rebar, Material and Loadings) in
  the captured Options units, with no cell notes or frozen rows. Source units are declared in the
  workbook properties. Both readers validate the same input
  groups and use the project registry for default analysis, resistance and Check Basis. The v1 reader
  also consumes its legacy profile, units and input origin for interpretation.
- `project` decodes current evaluated snapshots through the same reader before one atomic Update.
  Native Open/Save retain user workbook styles and formulas. Independent helper sheets remain
  outside the import boundary. The Project spreadsheet window uses the existing application
  project-apply boundary and its applied-input revision guard.

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
Standalone section/loadcase exchange contracts remain separate.

The adapter adds no external dependency version. The ExcelJS transitive uuid moderate advisories
and upstream Gridcraft alpha limitations remain documented in tools/gridcraft/README.md; it does
not upgrade the software's Preview engineering status. See the shared-table and project-dialog
task packets and the project-spreadsheet-title-bar packet for actual gates and limitations.
