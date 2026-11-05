# @pm/spreadsheet

Outward, browser-independent XLSX authoring adapter. No React, DOM, file picker, network, analysis
solver or persistence state. ExcelJS 4.4.0 (MIT) is pinned for file transport; Gridcraft remains the
separate pinned web authoring engine. ExcelJS never calculates or trusts formula caches on Update.

Pipeline: bounded ZIP -> declared units/table schema -> protected template -> versioned engine
mapping -> evaluated scalar snapshot -> complete typed validation -> one feature-owned commit.
`SheetError.code` identifies format, cell, resource or stale-target failures. The application
handles files, modal lifetime, current-target checks and atomic publication.

- Root exports: generic schema, protocol v2, snapshot decoder and numeric-cell boundary.
- `units` / `archive`: shared strict source metadata and ZIP preflight.
- `loadcases` / `loadcase-xlsx`: load-reference-aware mapping through @pm/project and @pm/units.
- `geometry`: selected-ring draft and applied-rebar mapping through @pm/geometry and @pm/units.

New tables declare their own schema/build/prepare/read adapter and use the shared web dialog.
Mapped headings are highlighted and protected, body/helper cells remain editable, ID is hidden,
and only evaluated values cross Update. Formulas/layout remain in the session or saved XLSX.
Full-precision quantity-source metadata preserves literal no-op round trips. Formula cells always
convert their evaluated value from the declared source unit. Rebar As remains independent of dia.

Safety limits are transport bounds, not numerical tolerances: 10 MiB compressed, 64 MiB declared
expanded, 256 ZIP entries, 100,001 rows, 64 columns and 1,000,000 populated cells. The dense evaluated
snapshot is additionally bounded to 1,000,000 mapped slots before allocation. Geometry owners
add their smaller input limits. Unsupported/invalid content fails without partial publication.
Existing legacy section/project workbook formats remain separate explicit exchange contracts.

The adapter adds no external dependency version. The ExcelJS transitive uuid moderate advisories
and upstream Gridcraft alpha limitations remain documented in tools/gridcraft/README.md; it does
not upgrade the software's Preview engineering status. See the shared-table task packet for gates.
