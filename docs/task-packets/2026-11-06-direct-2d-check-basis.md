# Direct 2D Load Ray check basis

Class 4 preview utilization change. ENG-LOAD-001, ENG-AN-003, ENG-RES-001 and
ENG-REP-002 apply. Engineering/05 and root 05 own the check and projection.
Project owns the persisted choice. Analysis owns the candidate, exact meridian
and crossing. The worker, chart, detail and report carry its evidence.

The approved plan adds a fixed-neutral-axis 2D check using the existing
magnitude-mapped Design segments. A qualified demand equilibrium supplies beta
for fibre analysis. A qualified proportional capacity reference supplies beta
for block or when fibre equilibrium supplies no direction. Beta is frozen before
the 2D check and recorded with its source. The reference calculation supplies no
governing 2D ratio. Evaluate minimum-eccentricity candidates under the selected
basis. Undefined angles, ambiguous intersections and failed evaluation retain
typed unavailable evidence. Physical fields require qualified material states.

Verify a planar analytical crossing, asymmetric sections, both mechanics, both
sampling modes, bounds/cap cases, both existing bases, persisted workbook/JSON
round trips and agreement across batch/detail/chart/report. Released design
approval and changes to material laws are outside this task.

## Evidence

- The test oracle independently solves the crossing fraction from the two
  station coordinates and compares the projected moment ratio with the
  selected utilization. Both mechanics share that result across batch,
  selected detail and PDF assembly. Existing geometric unit cases cover
  tangency, overlap, multiple intersections and unavailable coordinates.
- The export exercise writes PDF and XLSX for Fixed and Adaptive in both
  mechanics, reconciles workbook lambda and UR against the analysis, and
  round-trips the basis through JSON and the project input workbook.
- The edge exercise covers zero demand, NG bending, cap-governed biaxial
  demand with a before-cap physical field, and unresolved pure axial cases.
  The absence of a qualified angle or crossing leaves UR unavailable.
- The browser exercise switches all three methods, opens Detail and Data,
  reconciles downloaded text with the displayed snapshot, and switches
  the help modal from its Korean default to English. It exercises the
  light desktop and dark narrow layouts for both mechanics.
- Structure, typecheck, traceability, the full `npm test` run (743 unit
  tests and integration checks), `bench:pipelines`, production build and web
  bundle budgets passed. The final modal and Data download were rechecked
  on the production build in Edge.

The preview uses the existing Fixed screening policy and the exact
meridian's station estimate for Adaptive. A qualified independent structural
review and the repository release gates remain required for released design.
Temporary scripts, plots and exported evidence are in `outputs/direct-2d/`.

The 3D help text now describes the ray test against the planes of the
triangular faces, the rejection of hits outside each triangle and the
selection of the nearest valid forward crossing. Edge verified the
Korean default, the English translation and the narrow modal. Screenshots
are in `outputs/check-basis-3d-copy/`.

The P–M header shows a resolved beta as a read-only value alongside the
load-angle checkbox. Both use three decimal places from the displayed
loadcase frame, and Data includes the same angles. Edge verified two
loadcase transitions, both checkbox states, zero moment and narrow
wrapping. Evidence is in `outputs/demand-angle-readouts/`.

The beta status now inherits the chart control density. Edge measured
the beta readout, theta checkbox, Mr/Mn and Data at the same 20 px height,
6 px inline padding, 4 px corner radius and 11 px text. Measurements
covered the checked and unchecked states and the narrow dark layout.

The P–M footer follows the same primary-chart visibility rule as the
Field result cards. Edge verified the large and small layouts, the switch
back to Field as primary, and equal Data values in both sizes. Evidence
is in `outputs/demand-pm-footer/`.
