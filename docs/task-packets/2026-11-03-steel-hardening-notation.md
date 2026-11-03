# Hardening notation and quiet control presentation

Objective: remove the hardening checkbox frame, separate the k/fuk radio choices, and render
engineering symbols with Greek bases and proper subscripts in the steel fields, formulas and SVG.

Class 1 presentation only. Owners: existing workspace stress-caption checkbox role, layout-only
radio separation in side-panel.css, a material-symbol presentation component, MaterialPanel and
SteelHardeningFields. No symbol meaning, material input, persisted key, stress law, limit, factor,
calculation, schema, export/report format or dependency changes. Existing accessible names remain.

Use native var/sub for HTML and italic base/subscript tspans for SVG; no equation renderer or font
download. Reuse the existing borderless checkbox context instead of overriding the shared field
primitive. Separate radios with the existing group-separator token and normal shared spacing.
Preserve whole-choice wrapping, clickable labels, native keyboard operation and both themes.

Verification: structure/typecheck and focused owner tests; full application test suite; browser
assertions for borderless resting/hover checkbox, radio separation, actual subscript markup in
fields/axis labels, narrow and signed views, and existing value/persistence/capacity invariants;
production build and bundle budgets. Numerical benchmarks are unnecessary for this presentation
slice; the existing constitutive/fixture oracles must remain unchanged. Profiles remain preview/draft.

## Delivered evidence — 2026-11-03

The steel stress caption now composes the existing borderless inline checkbox role. Radio choices
use a logical-start separator and shared spacing, retaining whole-choice wrapping at minimum width.
`MaterialSymbol.tsx` supplies native HTML var/sub or SVG italic-base/subscript-tspan presentation
for fuk, fy, fyd, Es, Eh, strain/stress symbols, the strain coefficient and known steel factors.
Unknown project-defined factor/design symbols retain their declared text. Accessible input names
and all stored keys/values are unchanged.

Passed:

- Full `npm test`: structure/typecheck, 460 unit tests, 5 AdSec tests, CAD, JSON and metric/US
  workbook round trips, independent workbook recalculation, demand and PDF integrations.
- Browser regression for both KDS mechanics and EN: four zero-width checkbox borders in resting
  and hover states; a visible radio separator with positive spacing; real HTML/SVG subscripts;
  both themes, signed/Reference/Design and 260 px sidebar views. Existing controls, saved input
  bases, full-precision no-op edits, invalid-input evidence, physical-bound handling and independent
  worker-capacity checks also passed. No unexpected page or worker errors occurred.
- Visual review confirmed the unframed checkbox, separated radios, proper subscripts and preserved
  axis guides/markers, including minimum-width wrapping.
- Production build and all bundle gates: initial gzip JavaScript 344.1/375 KiB, with lazy/worker
  budgets passing. Diff whitespace check passed.

Logs are `outputs/steel-hardening/notation-*.log`; the current browser evidence and screenshots
are under the same ignored artifact directory. No result baseline, tolerance, material definition,
resistance route, export contract, dependency or certification status changed. No commit/deployment.
