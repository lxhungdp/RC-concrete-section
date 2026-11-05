# Full plotted-point data in Demand Check

Status. Implemented and verified on an isolated production build.

The raw-series text presentation below is historical. It is superseded by the compact Nominal/Design
tables in [the simple-curve-data packet](2026-11-05-simple-curve-data.md); its original verification
evidence applies to the earlier format.

- Objective. Include every point used to draw the Fixed-P Mx-My and vertical P-M charts in their
  existing Data modal, Copy all and Save as text.
- Scope and class. Presentation-only Class 2. DEV-ARCH-006 and ENG-RES-002 require a coherent
  snapshot of the displayed result. Engineering/05, root 05 and development/04 retain ownership
  of centroidal actions, beta/theta semantics and separate nominal/design datasets.
- Owner. The web chart-text presentation adapter and its ResultsWorkspace caller.
- Input. Public Plotly graph-div data for the displayed 2D chart and its existing unit labels.
- Output. All finite coordinate pairs in original series/order, including repeated closure
  points. Null gaps separate paths. Include names, original indices, labels and custom data.
  Hidden series stay hidden. Fixed-P identifies its common P with full available precision.
- Failure behavior. A plot that is still loading identifies missing point data. No fabricated
  coordinates or alternate field, result or series can supply it.
- Constraints. Existing modal/file behavior, captured frame, engineering inputs and results retain
  their current owners. No new dependency, solver, resistance factor, schema or report change.
- Oracles. Pure formatting tests for precision, gaps, labels, closure, hidden traces and long data.
  Real-browser per-point comparison against plotted data for both mechanics and both vertical
  views, plus exact copy/save parity and unchanged analysis-job counts. Run full tests/build/bundle.

The public graph-div data contract is documented in the
[Plotly function reference](https://plotly.com/javascript/plotlyjs-function-reference/).

## Delivered behavior and evidence

- The existing Data modal appends tab-separated point tables for the displayed 2D plot. Each
  nonempty visible trace keeps its own name and mode. Every row retains its original index,
  path, coordinate pair, point label and custom data. Closure duplicates and signed zero remain
  intact. JSON encoding preserves literal Unicode, tabs and line breaks in point metadata.
- Fixed-P labels Mx/My with the selected moment unit and identifies the exact displayed P.
  Vertical charts label M-theta or M-beta and P with the existing moment/force units. The numeric
  strings come directly from the plotted display coordinates without further rounding.
- Six focused tests passed, including a 5,000-point curve with no truncation, typed arrays,
  null/non-finite gaps, hidden traces, metadata, precision and loading/empty states.
- Full `npm test` passed, including 633 unit tests, five AdSec tests, CAD tests, canonical project
  round trips, independently recalculated Excel workbooks and reproducible PDFs. Its lint gate
  passed structure, documentation, traceability and typecheck.
- Production build `sN4RyM-jQzlwNFKE1jrXe` passed, along with all four existing bundle budgets.
- The actual Edge browser passed eight populated Data modals across KDS stress-strain and KDS
  equivalent-block fixtures. All six 2D tables matched every plotted coordinate, index, label
  and custom-data value. The total was 1,042 coordinate pairs. Theta and direct-beta were both
  checked. All eight Copy all and UTF-8 downloads matched the captured modal text exactly.
- Existing no-new-analysis checks, same-page modal, literal user labels, previous-frame warning,
  copy fallback, cancelled save, focus restoration, drag/resize and narrow/dark checks passed.
  Clipboard and picker failure checks use isolated browser adapters as in the owning text task.
- Local evidence is under `outputs/demand-points`. The reproducible browser harness remains
  `tools/verification/demand-data/browser.mjs`. This is presentation parity evidence for those
  fixtures and graph modes. Canonical engineering results and release status retain their owners.

## Follow-up on 97 coordinates versus 22 boundary points

The first built-in example was opened through its actual Project menu on the current dev server.
The audit compared both the exported tables and the rendered SVG path commands/marker elements.

| View and series | Data coordinate rows | Rendered geometry |
|---|---:|---|
| Demand-theta, nominal P-M loop | 97 | 97 SVG path vertices |
| Demand-theta, Design P-M loop | 126 | 126 SVG path vertices |
| Direct-beta, nominal P-M meridian | 27 | 27 SVG path vertices |
| Direct-beta, Design P-M meridian | 23 | 23 SVG path vertices |
| Direct-beta, station markers | 21 | 21 SVG markers |
| Direct-beta, Pmax crossing | 1 | 1 SVG marker |
| Fixed-P, nominal Mx-My contour at the first load's Pu | 77 | 77 SVG path vertices |

The 97-row series is the complete geometric demand-plane cut of the nominal triangulated surface.
Its triangle-edge crossings belong to the plotted polyline. The numbered station subset describes
a different object. At Direct beta = 0 degrees the example has 21 physical station markers and
one qualified Pmax crossing, giving 22 boundary audit points. The drawn meridian also includes the
existing M = 0 point at Pmax that closes the cap to the axial line, giving 23 plotted coordinates.
That closing point has explicit axial-center provenance in the kernel and is excluded from
physical-station audit rows. The station markers, Design curve and nominal curve keep separate
trace identities throughout.

This audit confirms the existing export source. No production curve or point table was reduced
or resampled. The repeatable check is `tools/verification/demand-data/counts.mjs`. Its coordinate
and SVG evidence is in `outputs/demand-point-counts`.

## Per-point provenance of the 97-row nominal cut

The standalone `tools/verification/demand-data/provenance.mjs` reconstructs each edge crossing
using the current sliceMomentPlane branch and exactly matches its P, Mx, My and station coordinate.
It then compares the projected/display coordinates with the actual browser capture. All 97 rows
matched exactly. The input is the first built-in KDS example and its first load combination.

- The nominal dataset has 972 records, 27 stations, 36 directions and 1,800 triangles.
- The normalized UI demand angle is approximately 21.0812449396 degrees.
- There is one closed path with 96 distinct coordinates. The 97th row repeats the first row.

| Source of distinct coordinates | Count |
|---|---:|
| Uniform-compression pole | 1 |
| Crossings of edges between directions at the same station | 48 |
| Crossings of diagonal edges between stations and directions | 44 |
| Crossings of edges between stations at the same beta | 2 |
| Uniform-tension pole | 1 |
| Distinct coordinates | 96 |
| Repeated first point to close the path | 1 |

For row 2, the source edge joins station 2 at beta 10 degrees and station 2 at beta 20 degrees.
Its signed moment-plane values are 5.805126445377991 and -18.94689284799594 kN m.
The edge fraction is 0.23453142859063672. Interpolating the three actions gives P =
33,829.13726654612 kN, Mx = 79.14112654947627 kN m and My = 30.508259855611854 kN m.
Projecting to the demand direction gives M-theta = 84.81787447783488 kN m, exactly the second
coordinate of the plotted nominal curve.

The audit writes `outputs/demand-point-provenance/nominal-97.csv` and `nominal-97.json` with
every point's source vertex/edge, original vertex indices, source beta/station, endpoint actions,
signed plane values, interpolation fraction and resulting display coordinates. These are
geometric intersections of the sampled surface. The audit introduces no new physical stations,
material evaluations, tolerance, curve or production code.
