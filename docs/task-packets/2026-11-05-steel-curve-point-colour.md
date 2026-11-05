# Steel curve transition-point colour

Presentation-only change, Class 1. The user requests blue transition points on the Steel
stress-strain chart. The shared material-curve circle role uses the existing curve accent token,
including filled and hollow markers. Curve coordinates, marker shapes, text and mechanics retain
their existing owners. The visual owner is globals.css; workspace-style-design governs themes.

## Verification

- `npm test` passes, including structure/typecheck, 629 unit tests, AdSec, CAD, project round trip,
  recalculated workbooks and deterministic preview PDFs. Production build and bundle gate pass.
- Production Edge checks verify all filled-point fills and hollow-point strokes equal the curve
  stroke in both themes and Reference/Design stages. Curve path coordinates are identical across
  the theme round trip. Both rendered chart screenshots were inspected.
- Evidence is retained under ignored `outputs/steel-point-colour*` files and directories.
  No new source tests or numerical changes were needed for this colour-only edit.
