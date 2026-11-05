# Concise Demand Check chart notes

Presentation-only wording change, Class 1. The user requests short notes that identify the drawn
features at a glance. Keep the permanent theta explanation and compact marker/Pmax legends.
Longer definitions remain in tooltips; errors retain their explicit unavailable/ambiguous meaning.
The pre-cap field still gives its actual P > Pmax comparison and identifies capped capacity for UR.
Geometry, units, data, classification and layout roles retain their existing owners.

## Verification

- Full `npm test` passes with structure/docs/traceability/typecheck, 680 unit tests, AdSec, CAD,
  project round trip, independently recalculated workbooks and preview PDF checks. No new source
  tests were needed for this wording-only edit.
- Isolated production build and bundle gate pass. Browser checks cover both themes at 1600,
  900 and 390 pixels. Each standard P-M note is at most 60 characters; the permanent theta note
  and stable toggle layout are retained. Screenshots were inspected with no browser errors.
- Existing pre-cap browser assertions use the shortened unavailable-contour caption. Evidence
  is under ignored `outputs/concise-demand-notes*` files/directories. Numerical results, persisted
  schema and verification/release state are unaffected.
