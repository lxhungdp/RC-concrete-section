# Field metrics follow chart layout

Class 1 presentation change. Owner: ResultsWorkspace field footer; authority: workspace-style-design
and development/04 stable demand-field presentation. Objective: show the four existing metric cards
only for the primary (large) field chart. Secondary charts omit populated and placeholder cards.
Keep status/qualification notes visible. Native hidden containment retains the data snapshot used
by the Data dialog while omitting the metric cards from layout and accessibility. Reuse primaryChart;
add no CSS, state, input or calculation.
Unrelated working-tree changes are preserved. No numerical, schema or report impact.

Verification passed: lint (structure, documentation, traceability and TypeScript), 107 results-owner
and chart-audit tests, final production build and bundle budgets. Populated isolated production
browser checks passed for both mechanics, light/dark, 1600px/900px, switching between both secondary
positions and the primary field. Secondary charts have zero visible cards and a 383px plot area;
primary charts restore four cards. The Data dialog retains all four groups while compact.
Screenshots and logs are under ignored `outputs/field-metrics-layout/`.

Two earlier broad unit runs encountered unrelated concurrent resultant-magnitude changes: first
chart-value-trace, then the chart-audit formula expectation (673/674 passing each run). Those owners
were updated concurrently; the final 107-test run includes both previously failing files and passes.
No unrelated test or numerical owner was edited for this presentation task. No full engineering
verification or accepted/released status is claimed. The temporary local server was stopped.
