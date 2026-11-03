# Shared Concrete and Steel material-curve presentation

Objective: give Steel the same chart frame, aspect ratio, plot margins, axes, mid-grid, stroke,
typography and caption treatment as Concrete while preserving steel-specific controls and markers.

Class 1 presentation only. Owner: material-editor chart rendering and the existing material-curve
CSS role. Extract Concrete's existing 250 x 110 SVG frame into MaterialCurveFrame and consume it
from both charts. Coordinates are display geometry, not material or numerical-analysis parameters.
Keep stress evaluators, hardening construction/cutoff, stage selection, strain conventions,
physical bounds, persistence and every engineering result unchanged.

The Steel controls stay outside the shared figure. Retain its existing piecewise-linear ordinates,
epsUd/epsUk projections, signed view, coincident/nearby markers and invalid-input diagnostic frame.
Use the shared axis colour for auxiliary guides; give subscript labels enough clearance within the
common viewport. Concrete's curve ordinates and mapping retain the reference frame coordinates.

Verification: rendered-frame/style comparison against Concrete in both themes, normal/minimum
sidebar widths, On/Off and Reference/Design/signed Steel views; existing precision, saved-input,
marker-coordinate and independent worker-capacity browser assertions. Run structure/typecheck,
focused owner coverage through npm test, production build and bundle budgets. No new unit tests
for a reversible drawing-layout change; no numerical benchmark or new dependency is required.
All profiles remain preview/draft, with no accepted-result or release claim.

## Delivered evidence — 2026-11-03

Both renderers now consume MaterialCurveFrame and its display coordinates. Steel uses Concrete's
250 x 110 aspect ratio, plot margins and common mid-grid, so existing shared curve strokes and text
scale equally. Its view controls are outside the figure. Projection guides inherit the axis colour;
yield/strain annotations were positioned within the common viewport, retaining proper subscripts,
signed tensile labels, coincident/nearby points and physical-bound information. Concrete curve
sampling and display ordinates retain their prior mapping; only common axis-label clearance changes.

Passed:

- Full `npm test`: repository structure/typecheck, 460 unit tests, 5 AdSec tests, CAD, JSON and
  metric/US workbook round trips, independent Excel recalculation, demand and PDF integrations.
- Browser assertions compare rendered frame/dimensions, figure spacing/background, curve and axis
  stroke, label typography and caption style in both themes. Actual Concrete fibre charts provide
  the reference; the equivalent-block profile, which intentionally has no Concrete stress-strain
  miniature, is compared against that measured per-theme reference. All three Steel routes passed.
- Existing On/Off, Reference/Design/signed, narrow sidebar, precision/no-op, saved-input, invalid
  draft, physical-bound and independent capacity checks passed. The fixture capacities retain
  their previous values. No unexpected page or worker errors occurred.
- Visual inspection confirmed matched Concrete/Steel presentation and readable retained Steel
  markers in both themes and at the minimum sidebar width.
- Production build and all bundle gates passed; initial gzip JavaScript is 344.1/375 KiB. Diff
  whitespace check passed. No numerical benchmark was needed for this presentation-only slice.

Evidence is in ignored `outputs/steel-hardening/curve-style-*.log`, `browser-evidence.json`, the
current Steel captures and `*-concrete-reference.png` / `*-concrete-alternate-theme.png` images.
No numerical model, engineering result, factor, persistence/schema, export format, dependency or
verification status changed. No commit or deployment was made.
