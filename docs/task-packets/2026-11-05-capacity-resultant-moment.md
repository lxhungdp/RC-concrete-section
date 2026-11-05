# Capacity Direct-beta resultant moment

Status: implemented; required change-verification gates passed. Preview only, not engineering
release acceptance.

## Controlled task

- Objective: use resultant moment magnitude for Capacity Direct beta, consistently with Demand
  Check, the plotted Data snapshot, the Envelope table, selected-value derivations and their
  formula-driven audit workbooks.
- User authorization: the 2026-11-05 follow-up explicitly requests the same magnitude convention
  in Capacity plots and Data. A subsequent clarification keeps M_R positive and places the
  beta+180 branch on the opposite side of the chart to show the complete two-sided diagram.
- Class: 3 for the derived numerical/view/report pipeline. No mechanics, resistance policy,
  demand query, utilization or classification changes.
- Requirements: ENG-AN-003, ENG-RES-001, ENG-REP-002, DEV-ARCH-002/006. Accepted-result identity
  and engineering release remain outside this change.
- Authorities: root 05 section 8 owns Direct-beta plot coordinates; engineering/02 owns signs,
  units and origins; engineering/05 owns unchanged governing checks; development/04 owns
  charts/tables/audit export correspondence; engineering/06 owns change class and gates.
- Allowed owners: analysis Direct-beta geometry adapters; Capacity plot/table/value/Data
  adapters; the existing chart and calculation-trace audit workbooks; focused tests and browser
  verification; the owning authority documents and verification matrix.
- Inputs: existing immutable Nominal/Design surface or exact-direction vertices, their actual
  action components and physical/geometric roles. Beta remains the strain-gradient parameter,
  distinct from each point's moment direction and the demand angle theta.
- Outputs: P unchanged, M_R from the shared resultant-magnitude adapter. Map stored endpoints
  before joining the 2D polyline. Both beta and beta+180 branches retain nonnegative M_R. Their
  plotted coordinates are respectively +M_R and -M_R, on separate paths with branch identities.
  Apply the same convention to cap and before-cap geometry. The existing 3D geometry stays in P/Mx/My.
- Data: a Capacity Direct-beta Data snapshot reads every actual plotted coordinate, including
  closure/cap points and any opposite branch. It explicitly distinguishes signed M_plot from
  positive M_R. The Envelope remains a primary-beta physical-
  station/cap audit subset and is explicitly distinct from that complete coordinate snapshot.
- Audit arithmetic: sum concrete and net-steel Mx/My components first, then take the resultant
  magnitude. Magnitudes of individual contributions are not additive. Cap interpolation also
  acts on source components before the final magnitude. Preserve resistance sequencing.
- Blocking failures: missing/unreconciled source evidence, invalid arithmetic and unavailable
  physical cap/pole states cannot manufacture a derivation or change a governing verdict.
- Independent oracles: 3-4-5 resultants with beta intentionally different from moment direction;
  opposing contribution vectors; signed component preservation; point-by-point agreement among
  stored actions, plot, Data, Envelope and independently recalculated workbook formulas.
- Matrix: both mechanics, registered profiles, Fixed/Adaptive, Design/Nominal, oblique angles,
  poles/caps, metric/US, opposite branches, menu round trips and light/dark/narrow UI.
- Schema/provenance/report impact: no project or canonical result schema change. Capacity audit
  M columns/formulas now mean magnitude. The shared Direct-beta sheet in the demand workbook
  inherits the same meaning and its demand marker must use the same coordinate. General
  governing theta slices, UR, classification and component ledgers remain unchanged.
- Exclusions: no new code coefficient, sampling policy, tolerance, dependency, surface solver,
  governing demand check, member analysis or accepted/released engineering capability.

## Required gates

Structure, docs/traceability, typecheck, focused geometry/table/value/workbook tests, full npm test,
production build and existing bundle budgets. Run the applicable portable capacity fingerprint,
strain-sampling, equivalent-block and cross-model pipeline gates without altering baselines.
Verify real production SVG/Data/Envelope/trace/workbook behavior before handoff.

## Implemented slice

- The shared analysis adapter owns M_R = sqrt(Mx^2 + My^2) and the display branch sign.
  Primary beta uses +M_R; beta+180 uses -M_R. Original P/Mx/My, station identities, the
  three-dimensional surface, resistance policy and governing demand results are unchanged.
- Capacity curves, physical/key markers, before-cap paths and cap intersections follow the
  same side convention. Exact-direction results expose their single computed beta; the
  sampled-opposite control is disabled while that result is active.
- Capacity Data copies every actual plotted coordinate at stored precision, with branch identity,
  signed M_plot, positive M_R and original Mx/My. The Envelope remains the documented primary-beta
  physical-station/cap audit subset. Data copy/save does not launch analysis.
- Selected-value derivations assemble signed concrete/net-steel component vectors before taking
  the magnitude. The formula-driven audit workbooks use SQRT of the final component squares.
  The shared Direct-beta diagnostic sheet and its demand marker use the same convention; UR,
  governing theta-domain queries and OK/NG/CHECK logic are unchanged.
- The owning root 05/development 04 contracts, control map, value-trace follow-up and requirement
  verification matrix record this meaning. There is no project/result schema, dependency,
  design-code coefficient, tolerance or acceptance-state change.

## Verification evidence

- Independent hand oracles cover a 3-4-5 vector with beta different from its moment direction,
  immutable signed source actions, positive opposite-branch M_R with negative M_plot, separate
  paths and poles. Counteracting concrete/steel vectors verify that component assembly precedes
  magnitude and that contribution magnitudes are not added.
- Focused geometry/table/value/audit tests passed. The final complete `npm test` passed 680 unit
  tests, five ADSEC checks, CAD/round-trip checks, both mechanics workbook checks, demand-check
  workbook checks and PDF checks. Independent workbook recalculation remains enabled.
- Final `npm run lint` passed structure, docs, traceability and typecheck. The production build
  passed with build ID `HWKsmXUZ2Os6iLRdfc2H3`. Existing web bundle budgets passed: initial
  353.4/375 KiB gzip, Plotly 1325.4/1400, worker 69.3/120 and Excel 248.1/300.
- Portable capacity fingerprint verification passed using the repository reference runtime
  Node 24.20.0/npm 11.19.0. Its 17 portable-equivalent resultant roundoff deviations had worst
  section-normalized delta 4.957e-17, within the existing criteria. No baseline or tolerance
  was changed. Strain-sampling, equivalent-block and cross-model pipeline benchmarks passed.
- Production Edge verification captured 18 charts, including seven Capacity Data copy/save
  scenarios: sampled beta, opposite branch, oblique branches, exact beta, Nominal only, dark
  theme and a 390-pixel viewport. Actual SVG vertices, markers, Data and source magnitudes
  agreed; source components and governing demand status stayed intact. No browser/worker
  errors or extra analysis jobs were observed. The final rerun includes the widened axis-label
  margin and positive-M_R/signed-coordinate tooltips.
- The focused calculation-dialog browser gate passed 63 traces across stress-strain/KDS and
  ACI, AS 3600 and EN equivalent-block routes, including existing metric/US, theme, narrow-screen
  and failure-suppression checks. The navigation gate passed 18 menu round trips with both
  demand bases, layer states and themes.
- Evidence is retained under `outputs/capacity-magnitude-points-final`,
  `outputs/capacity-magnitude-traces-final` and `outputs/capacity-magnitude-navigation-final`;
  gate logs use the `outputs/capacity-magnitude-` prefix. Production output used the isolated
  `apps/web/dist/capacity-magnitude-next` directory so concurrent work and the user's development
  server were preserved.

These gates verify this derived-coordinate/report change. They do not grant independent
engineering release acceptance, certify a design-code profile or extend Stage 1 scope.
