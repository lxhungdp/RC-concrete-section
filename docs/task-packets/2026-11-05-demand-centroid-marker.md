# Persistent centroid marker in Demand Check

Status. Implemented and regression-checked on an isolated production build.

- Objective. Keep the section centroid identifiable while the Load reference origin is offset.
- Authorities. Engineering/02 section 2 and development/16 own the exact centroid and load-origin
  distinction. The workspace design skill owns shared presentation roles and theme parity.
- Classification. Class 2 presentation-only. The marker consumes the existing exact geometric
  centroid or field-map origin and the existing viewport transform.
- Owners. SectionMomentAxes, SectionFieldChart and SectionOutlineChart in the web results feature.
- Output. A shared visible C marker remains attached to the physical section. O follows preview
  and applied offsets. Zero offset shows C = O. Both field and geometry-only states support it.
- Contract. Existing load-reference translation, input values, canonical actions, checks, field
  evidence and chart data keep their current owners. No persistence or numerical API changes.
- Regression. Both mechanics, offset draft, Apply/Convert, unit changes, empty loadcases, both
  themes and narrow viewport. The marker must remain within the drawing and preserve its
  section-relative position. Run existing viewport/reference tests, full tests, build and bundle.

## Verification

- Twelve focused viewport, angle and load-reference tests passed.
- Full `npm test` passed, including 620 unit tests, five AdSec tests, eleven CAD tests,
  project round trips, independently recalculated workbooks and reproducible PDFs.
  Structure, documentation, traceability and typecheck passed through the lint gate.
- The isolated production build and its four existing gzip bundle budgets passed.
- The existing load-reference browser suite passed for KDS stress–strain and ACI block.
  It now checks the actual SVG centroid marker before editing, during offset preview, after
  Apply/Convert and in geometry-only mode. Marker position stays fixed relative to the section
  while O moves, and both return together after Escape. Both themes, narrow layouts and
  Metric/US transitions pass. Existing canonical-load, UR and curve-invariance checks also pass.
- The marker reuses the field map's calculation origin for physical fields and the existing exact
  net-concrete centroid for geometry-only views. It uses the shared display transform and existing
  foreground/panel colours. No numerical tolerance, engineering result or schema was changed.
- Evidence is in `outputs/demand-centroid`, including full gate logs and browser screenshots.
