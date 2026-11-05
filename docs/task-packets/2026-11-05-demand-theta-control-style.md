# Demand load-angle control styling

Implemented presentation-only change, Class 1. The user requests the existing chart checkbox style, a compact
caption, stable layout when toggling, and red dotted load-angle curves.

- Reuse the shared `ws-check pm-field-check` role and its selected state beside Mr/Mn.
- Show `θ cut`, retaining the full accessible name and explanatory tooltip.
- Remove the checked-only angle span and explanatory footer paragraph. The tooltip and chart
  point/series data retain the load-angle meaning without adding layout content on selection.
- Use red for theta Nominal, Design and pre-cap paths. Retain their existing line patterns.
- Numerical data, check basis, field selection, units and plot queries retain their existing owners.

## Verification

- The 31 focused chart tests pass, including red theta-series styling across existing material,
  sampling, check-basis and display-unit cases.
- The final `npm test` passes, including structure/docs/traceability/typecheck, 677 unit tests,
  AdSec, CAD, project round trip, recalculated workbooks and preview PDFs. Earlier full runs exposed
  stale signed-projection expectations during the existing Direct-beta magnitude change. The
  value-trace test now checks the independent 3-4-5 magnitude oracle required by root 05 section 8;
  the workbook expectation was updated concurrently in the working tree. No numerical production
  code was changed by this styling task.
- An isolated production build and bundle gate pass. Six browser scenarios cover light/dark at
  1600, 900 and 390 pixels. The control matches Mr/Mn dimensions and typography. Header, chart,
  canvas, checkbox rectangle, header text and notes remain identical after toggling. Public Plotly
  theta traces are red. Screenshots were inspected and no browser errors occurred.
- Evidence is retained under ignored `outputs/demand-theta-style*` files/directories. This is
  presentation verification of the current Preview application, with no schema or engineering
  acceptance change.
