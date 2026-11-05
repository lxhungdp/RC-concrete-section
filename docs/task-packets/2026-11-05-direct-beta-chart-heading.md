# Direct-beta chart heading

Status: implemented and presentation gates passed. Presentation-only Class 1 wording change.

- Objective: replace the ambiguous Direct beta meridian heading with an explicit P/action and
  fixed-neutral-axis-angle description in Capacity and Demand Check.
- Owner: ResultsWorkspace chart headings and their existing Data dialog; development/04 owns
  presentation correspondence. Root 05 section 8 and engineering/02 retain coordinate/angle meaning.
- Copy: `P–M_R (Mx, My) · fixed N.A. angle`. Hover text explains the 2D resultant magnitude and
  beta as the strain-gradient normal to the neutral-axis line. A narrow heading retains the full
  native tooltip. The beta control, metadata and numerical values are unchanged.
- Exclusions: no mechanics, source actions, plotted coordinates, UR, code factors, chart identities,
  schema, report formulas, dependency, palette or shared control/layout change.
- Gates: structure/typecheck and existing focused/application tests, production build/bundle,
  and browser checks of both headings and Data in light/dark and narrow layouts. No new unit test
  is needed for literal wording; verify the actual rendered header and exported text.

## Evidence

- Both chart headers and Data dialog titles use the same shared string. The point-table body stays
  unchanged. The existing 3D Direct-beta trace names and chart keys also stay unchanged.
- Production Edge passes six populated states: Capacity/Demand in light/dark and both workspaces
  at 390 pixels in dark. The full title fits the normal large-chart header (184 pixels); narrow
  headers retain shared ellipsis and the complete title/explanation in the native tooltip. Data
  still contains Nominal/Design point tables, with no page errors.
- Full `npm test` passes 703 unit tests, five ADSEC checks, eleven CAD tests, project round trips,
  independently recalculated workbooks and PDF checks. Its lint gate passes structure, docs,
  traceability and strict typecheck. No additional literal-copy unit test was added.
- The isolated production build passes with ID `XyzFzs4VElJuV1fO3mZA6`; bundle gates pass at initial
  352.7/375 KiB gzip, Plotly 1325.4/1400, worker 69.3/120 and Excel 248.1/300. Runtime is Windows,
  Node 24.22.1/npm 11.19.1. Build output is `apps/web/dist/direct-beta-heading-next`.
- Browser screenshots, point text and measurements are under `outputs/direct-beta-heading`;
  gate logs use the `outputs/direct-beta-heading-` prefix. Final docs/link and whitespace checks
  also pass. These are wording/presentation checks and confer no engineering release acceptance.
