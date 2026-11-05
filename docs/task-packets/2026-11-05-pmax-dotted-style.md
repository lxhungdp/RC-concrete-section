# Consistent excluded-Pmax line style

Class 1 presentation correction. Demand P-M Direct-beta and optional load-angle overlays now use
the same dotted line as Capacity for Design geometry before the Pmax cap. The caption says Dotted.
Owners: demand-pm-chart.ts and ResultsWorkspace.tsx. Authority: docs/05 excluded-cap geometry display
and workspace-style-design. No coordinate, point, factor, check, report or persistence change.
Existing unrelated working-tree changes are preserved. Verification passed: lint (structure,
documentation, traceability, TypeScript), 31 existing Demand P-M tests, production build and bundle.
Isolated production browser checks confirm `dot` for Direct-beta and theta before-cap traces in
both mechanics/themes and matching `dot` in Capacity. Caption and screenshots were checked.
Evidence: ignored `outputs/pmax-dotted-style/`. Temporary local server stopped after verification.
No new test duplicating the two presentation literals was added. Engineering status is unchanged.
