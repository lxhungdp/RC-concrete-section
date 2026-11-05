# Demand Direct-beta menu transition

Status: reproduced, repaired and change-verification gates passed. Preview only; no engineering
release acceptance.

- Objective: prevent a transient enlarged red load ray and axis jump when returning from Capacity
  to Demand Check with Direct beta selected as the large chart in the first built-in example.
- Requirements: ENG-RES-002, DEV-ARCH-006; development/04 owns chart-shell and completed-frame
  presentation. Classification: Class 2 presentation lifecycle correction, result-identical.
- Owners: web ResultsWorkspace completed-frame lifecycle, SectionDrawingClient selected-detail
  request, existing current-frame identity helper,
  and real-browser navigation verification. No calculation package changes are authorized by this fix.
- Contract: retain one completed Demand frame on a menu change only while its surface and source
  row exist. Reuse requires the current demand/result/surface, applied context and requested beta.
  Initial pending evidence cannot mount an incomplete ray-only P-M plot. Existing previous-frame
  labelling and stale/current-result guards remain authoritative.
  Navigation alone must not force another check or rebuild a matching completed field/curve frame.
- Blocking boundaries: edited/deleted demand, changed surface or applied context, changed inspection
  beta, aborted jobs and unavailable evidence cannot be silently substituted with a current result.
- Oracle: requestAnimationFrame observations and compositor screenshots of intermediate menu frames;
  exact settled trace/axis equality; current-source guards; no extra field/exact jobs for an unchanged
  completed frame. Cover both primary layouts, themes, bases, theta visibility and narrow layout.
- Reproduction: the current production build briefly has only `Proportional load path` and `Demand
  point` in the vertical plot. It autoscales to approximately M=[0,4237], P=[-1397,26544] before the
  resistance curves restore the full range. Its source line width remains 1.8 pixels; the apparent
  enlargement comes from the incomplete viewport. The field snapshot is cleared on leaving Demand.
- Impact/exclusions: no engineering inputs, source actions, surface, station, sign/unit convention,
  beta/theta meaning, UR, classification, schema, dependency, workbook/PDF or acceptance-state change.
- Gates: structure/docs/traceability/typecheck, focused frame/results tests, full application tests,
  isolated production build/bundle and failing-before/passing-after real-browser transition checks.
  Numerical benchmarks are outside this presentation-only change.

## Repair and scope

ResultsWorkspace retains its one completed field/exact-curve frame across Capacity/Demand menu
changes. It reuses that frame only after the existing current-demand/result/surface guard and the
shared immutable applied-input identity check pass, with the same requested exact-beta direction.
Surface replacement and deletion of the source row withdraw retained evidence. A first incomplete
frame uses the existing Preparing chart placeholder, so Plotly never autoscales a transient ray-only
vertical chart. Chart-shell identities remain workspace-specific.

SectionDrawingClient previously forced another selected-loadcase solve on every Demand entry.
It now checks the complete selected demand snapshot, declared check basis and applied-input
identities before reusing it. A changed demand, basis, surface or applied context still requests its
own result. No new result cache, persistent state, engineering formula or alternate solve was added.

The shared `sameLoadcaseAnalysisInputs` helper has an explicit success case and replacement tests
for every reference it owns. Existing row/revision/frame tests continue to reject edited or deleted
demands, replacement inverse results and changed resistance surfaces. This is transient Preview
presentation history and does not confer accepted-result identity or close release gates.

## Verification

- Before repair, `transition.mjs` fails its intermediate-frame assertion on the isolated earlier
  production build. Compositor frame 013 in `outputs/demand-navigation-transition/before-confirm`
  visibly contains the enlarged red ray with no resistance curves. The rAF record observes the
  incomplete ray-only data and its smaller automatic axes before the completed curve arrives.
- The production fix passes the original large-Direct-beta sequence with full trace and automatic
  axis equality and no navigation analysis jobs. The automatic viewport is established at the
  final panel dimensions with the existing Autoscale control before each comparison; this avoids
  confusing the small-chart viewport retained by ordinary layout resizing with menu corruption.
- The completed initial matrix passes 35 round trips: the original sequence, two repetitions of
  both primary layouts × both governing bases × theta hidden/visible × light/dark, and two narrow
  dark layouts. Intermediate rAF states and compositor frames are retained, rather than testing
  only the settled image. Its evidence is `outputs/demand-navigation-transition/matrix`.
- The final expanded run passes 36 round trips and zero page errors. Selecting the third loadcase
  requests its detail at Pu=5000 kN; editing Pu to 6000 kN requests a new check and commits that new
  demand point in the current frame. Returning through Capacity retains the edited frame with no
  navigation jobs. These assertions preserve the recalculation boundary instead of treating every
  cached result as reusable. Final evidence is `outputs/demand-navigation-transition/final` with
  13 compositor frames for the original transition plus the repeated-scenario rAF records.
- Focused frame/results tests pass (37 existing frame/profile cases, followed by all seven frame
  cases including the new applied-context replacement oracle). Full `npm test` passes 686 unit
  tests, five ADSEC checks, eleven CAD tests, project round trips, independently recalculated
  stress-strain/equivalent-block/demand workbooks, and PDF checks. The command includes structure,
  documentation, traceability and typecheck. No reference value or tolerance was modified.
- The isolated production build passes with ID `trXhC37Z_M3Ow6PE8nXsf`; bundle budgets pass at
  initial 353.5/375 KiB gzip, Plotly 1325.4/1400, analysis worker 69.3/120 and Excel 248.1/300.
  Runtime: Windows, Node 24.22.1/npm 11.19.1. Build output is `apps/web/dist/demand-transition-next`;
  gate logs use `outputs/demand-transition-`. No dependency or numerical package is changed.
- Requirement linkage records this partial Preview evidence while leaving ENG-RES-002 and
  DEV-ARCH-006 release coverage open. General independent engineering release acceptance remains
  outside this UI lifecycle fix.
