# Demand Check loadcase file buttons

The two buttons above the Loadcases table both displayed `Excel`. The user
requested visible action names and a compact file format label. `LoadingsPanel`
now renders `Export XLSX` and `Import XLSX` as text. Each accessible name starts
with its visible label and identifies the loadcase workbook. The [workspace design standard](../../.agents/skills/workspace-style-design/references/design-standard.md)
records the presentation decision.

## Verification

- In an isolated Edge session, both buttons displayed their full action and
  format, contained no SVG and were clickable at viewport widths of 390 and
  1440 px in both themes. The labels also fit the 260 px minimum desktop sidebar.
- Export downloaded `loadcases.xlsx` with a named test loadcase. After adding
  another row, activating Import with Enter and selecting the exported file
  restored the exported row count and name.
- All three loadcase workbook tests passed, covering headers and units,
  round-trip data and duplicate ID rejection.

## Loadcase table actions

Export XLSX and Import XLSX now form the left group below the table. Add stays
right-aligned and can wrap below that group in a narrow sidebar. The `Detail calculation`
button in the Loadcases header opens the selected combination by stable ID.
A click, Enter or Space selects a row. The button is disabled without a current
selection or ready surface. The six columns retain the editable demands, UR
and row deletion. The workflow owner is
[development/04](../development/04-loadings-analysis-results-and-report-pipelines.md).

This Class 2 UI refactor affects LoadingsPanel, its workspace callback, table
layout and browser selectors. Numerical calculations and workbook formats
retain their existing contracts.

- Thirteen focused selection, calculation trace, XLSX and layout tests passed.
  The full application test suite, production build and all four bundle budgets passed.
- In production Edge, two identically named rows with distinct IDs opened
  their own traces. Keyboard selection, dialog focus restoration, deleting the
  selected row, an empty table and exporting then reimporting XLSX all passed.
- The display-units browser checks opened the calculation trace for the selected ID on both
  the stress-strain and equivalent-block fixtures. The footer layout was also
  checked at desktop, minimum sidebar and phone widths in light and dark themes.
  Logs and screenshots are under `outputs/demand-table-actions/`.
- The `Detail calculation` label fits inside its button at the default sidebar width,
  the 260 px minimum sidebar width and a 390 px phone viewport. The production
  browser check opened the selected loadcase using the full accessible name.
