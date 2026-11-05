# Demand P-M viewport after workspace navigation

Status. Reproduced, repaired and verified on development and production builds.

- Objective. Preserve the visible resistance curves after opening the first example, entering
  Demand Check, opening Capacity and returning to Demand Check.
- Owners. Results chart-shell identity in the web feature and the owning development/04 pipeline.
  ENG-RES-002 and DEV-ARCH-006 require coherent result presentation.
- Classification. Presentation-only Class 2 lifecycle correction. Canonical inputs, actions,
  numerical kernels, stored checks, factors, schemas and report contracts are outside this change.
- Input and output. The same stored surface and selected demand must produce the same P-M
  traces and automatic axis ranges on a menu round trip. Beta and theta remain distinct.
- Failure reproduced. Edge retains the full nominal/design trace coordinates, but the chart
  viewport changes to small empty-plot ranges. Only a short segment of the load ray is visible.
- Cause. Unkeyed chart-shell siblings change roles across the two workspace layouts. React
  reuses the Capacity Fixed-P Plotly host as the Demand vertical chart. Plotly retains its
  previous axis ranges under the shared UI revision.
- Repair. Scope the shell identity to workspace mode and chart role. Ordinary updates within
  the same chart keep their existing identity.
- Regression oracle. Real browser menu clicks, full trace-coordinate and actual axis-range
  comparison, rendered paths and screenshots. Include repeated navigation, both themes,
  both vertical views, both governing bases and a narrow viewport.
- Required gates. Focused results tests, structure, typecheck, full tests, production build
  and web bundle check. The browser regression must fail on the old shell and pass after repair.

## Evidence

- Starting revision. Clean checkout at `245a06d`. The only production edit is the chart-shell
  React key in `ResultsWorkspace.tsx`.
- Before repair. The first KDS example retained every P-M trace coordinate and seven rendered
  paths. However, x changed from approximately [-6538, 6538] to [-1, 6] and y changed from
  approximately [-8000, 36191] to [-1, 4]. The viewport assertion failed with those exact ranges.
  The earlier trace-only assertion passed despite the visible failure.
- After repair. The original menu sequence passes on the current dev server and production
  build, with exact trace and axis-range equality. The production regression also passes two
  round trips in each combination of light/dark, proportional/Constant-P and Demand-theta/
  Direct-beta, plus a 390px-wide dark view. Eighteen round trips pass in total, including the
  original sequence. No page errors or worker error responses were observed.
- Gates. Full `npm test` passed, including 618 unit tests, five AdSec tests, eleven CAD tests,
  project round trips, independently recalculated Excel exports and PDF verification.
  Structure, documentation, traceability and typecheck passed through its lint gate.
  Production build and all four web bundle budgets passed.
- Local evidence. `outputs/demand-navigation/before` contains the failed viewport assertion
  data and screenshots. `fixed-dev` and `production` contain the repaired data and screenshots.
  The browser regression is `tools/verification/demand-navigation/browser.mjs`.
- Scope. This establishes presentation regression coverage for the first built-in KDS example.
  Its stored engineering result and Preview status are preserved.
