# Report menu

The Report workspace follows Demand Check and precedes Options. Its sidebar contains the
loadcase detail picker, the PDF and Excel actions, and their progress and export messages.
Demand Check owns load entry, the load reference and chart visibility. Both menus display
the same active loadcase charts. The geometry-only route keeps its single Section menu.

This is a Class 2 presentation refactor. The workflow owner is
[development/04](../development/04-loadings-analysis-results-and-report-pipelines.md).
`SectionDrawingClient` owns navigation, chart state, export selection and export handlers.
`DemandCheckPanel` and `ReportPanel` present the controls for their respective workspaces.
The existing preview export pipelines keep their worker payloads and output formats. The change
introduces no numerical, persistence or public API change.

## Verification

- The full `npm test` run passed structure and strict TypeScript checks, 416 unit tests, five
  AdSec checks, 11 CAD tests, project round-trip and all workbook and PDF integration gates.
  The focused loadcase selection, calculation trace and sidebar layout tests also passed.
- The production build and all four bundle budgets passed. The initial bundle was 338.2 KiB
  gzip against a 375 KiB limit. Earlier build attempts encountered a write-permission failure
  and a transient TypeScript error during concurrent work on the Capacity inspector.
- The display-units browser regression passed with stress-strain and equivalent-block fixtures.
  It checks menu order, absence of the Report picker under Demand Check and a PDF download
  through Report with the project's chosen display units.
- In Edge, direct keyboard navigation opened Report. Empty-project export buttons were disabled.
  All, None and individual selection worked. A Demand Check round trip retained the selection.
  The PDF and Excel downloads both carried the selected detail ID. Light, dark and 360px layouts,
  sidebar resizing and the geometry-only route were checked. The browser reported no page errors.
- Skill schema and canonical/adapter parity checks passed. The design-standard edit updates
  only the menu name in an existing example. CLI skill-discovery probes were not run.

Browser evidence and test logs are under `outputs/report-menu/`. Verification is scoped to
workspace behavior and preview exports.
