# Calculation Trace modal refinement — task packet

Objective:
Refine the Results row Calculation Trace so the browser presents only decision-relevant inputs and
summaries, while a point-specific Excel audit remains the full-precision route for every concrete
integration point. Make the origin-strain derivation follow the station criterion that actually
generated the selected compatible state, give the trace a consistent visual hierarchy, and make a
selected maximum-axial cap row calculate its geometric source crossing and projection through to
the exact displayed result without inventing a compatible strain state.
For every selected state affected by the maximum-axial limit, retain and audit the physical
pre-cap criterion calculation first, then show the explicit comparison with the cap and the
geometric operation that produces the displayed capped result.

Engineering requirement IDs:
`ENG-MAT-002`, `ENG-MAT-003`, `ENG-MAT-004`, `ENG-AN-001`, `ENG-RES-001`, `ENG-REP-002`.

Change class and status:
Class 4 report-classification change, preview-only and numerically result-identical. This change
adds criterion and axial-cap provenance to a lazy audit DTO, replaces the former cap `unavailable`
classification with a geometric audit classification, and changes its presentation/export. It does
not change station generation, material evaluation, mesh integration, equivalent-block clipping,
resistance factors, stored resultants, project data, or acceptance/release status.

Owners and contracts:

- compatible strain and station evidence: `@pm/analysis`;
- stress-strain axial-cap source crossing and radial-projection evidence: `@pm/analysis`;
- equivalent-block axial-cap source-edge evidence: `@pm/equivalent-block`, normalized by
  `@pm/analysis-equivalent-block`;
- equivalent-block audit evidence: `@pm/analysis-equivalent-block`;
- lazy serialization: web analysis worker/client contracts;
- presentation: Results Calculation Trace dialog and styles;
- complete concrete evidence: the point-specific concrete audit workbook in `@pm/report`.

Input contract:
The existing audit request plus the exact `StationDefinition` associated with each selected
physical surface vertex. Fixed-P continues to send the lower and upper station definitions
separately; an interpolated row still has no invented strain plane. A cap vertex carries its
physical pre-cap source state and ledger, plus the exact
maximum-axial reference, cap ratio/limit, source vertex or edge endpoints, interpolation ratio, and
radial projection factor when applicable.

Output contract:
For a `c/D` station, the audit derives `c` from the declared ratio and exact projected depth. For
an `epsilon_s/epsilon_y` station, it records the applicable yield-strain basis, requested and
applied controlling-bar strain, exact compression-edge-to-bar depth, and derives curvature,
neutral-axis depth, and origin strain in that order. Adaptive/resolved states are labelled as such.
The stress-strain audit also publishes one concrete summary for independent reconciliation. The
modal displays that summary as one row and the dedicated concrete workbook expands it on one
visible calculation sheet: the selected state/material inputs, every mesh point and its
`epsilon -> sigma_c -> F_c -> Pc/Mcx/Mcy` columns, and formula totals. The equivalent-block route
exports the corresponding exact clipped-polygon edge ledger because it has no integration mesh.
Nominal/reference and Factored/Design contributions share one six-value comparison table. A second
header-level workbook reuses that concrete sheet builder, adds Input and formula-driven Steel
detail, then links both into Summary. Fixed-P exports both physical brackets and formula-interpolates
their totals; it does not invent one strain plane for the selected contour point. A cap state uses a
separate `axial-cap` audit DTO and an `Axial Cap` workbook sheet whose formulas calculate
`Pcap`, the source crossing, any radial projection, and the selected `P/Mx/My`. Before that cap
stage, the modal and complete workbook reuse the ordinary Concrete/Steel calculation for the
retained physical pre-cap source. This source calculation reconciles to the retained uncapped
resultant; it is not represented as the non-unique strain state of the final cap-face point.

Blocking failure cases:
Existing typed audit failures remain authoritative. Missing station provenance falls back to a
truthful resolved-state trace; it must not be presented as a declared `c/D` or bar-strain route.
Non-finite terms or reconciliation failures remain blocking. No fallback mechanics or fabricated
criterion is permitted. A cap point without stored cap provenance remains unavailable; a cap trace
whose geometric formulas do not reconcile to the stored result fails closed.

Acceptance tests and oracles:

- analytic compatibility checks independently reproduce `epsilon_y`, `epsilon_s`, `d`, curvature,
  `c`, and `e0` for controlling-bar stations in both mechanics pipelines;
- `c/D` stations remain criterion-aware and exact;
- concrete summary totals equal the detailed owner ledger and the stored point;
- the modal omits quadrature-point/triangle-rule detail, shows one concrete summary row, and places
  one compact `Excel + download` action beside it for the physical state being viewed;
- the modal header exposes compact View, Stage, and Criteria selectors backed by the same complete
  Vertical/Fixed-P and Design/Nominal table queries, and changing them keeps the modal open;
- the Criteria selector preserves a Vertical station or Fixed-P direction/branch identity across
  stages; if geometric clipping removes that identity, the modal reports it unavailable and never
  substitutes another calculation by row ordinal;
- the obsolete “trace from project inputs” subtitle is absent, and the complete Excel action is on
  the selector row with right alignment;
- stress-strain cap rows analytically reproduce the cap limit, source-edge interpolation, radial
  factor, and stored `P/Mx/My`; equivalent-block cap rows reproduce their exact clipped source-edge
  intersection; neither cap audit contains a fabricated strain or neutral-axis state;
- every cap audit first reproduces a retained physical pre-cap criterion state through the same
  compatible-strain, Concrete, Steel, and resistance-stage calculations as an uncapped row, then
  compares its calculated axial resistance with `Pcap` and records why the capped result is selected;
- one resultant table places `P/Mx/My` Nominal/reference values beside the three Factored/Design
  values without applying a resistance rule in React;
- calculation criteria are unfilled rows inside one formula panel rather than separately boxed
  formula cards;
- all displayed equations use the shared calculation font token and consistent sub/superscript
  rendering;
- the point-specific concrete workbook contains no unrelated project/chart sheets, its formula
  totals reproduce the selected stage's concrete `Pc`, `Mcx`, and `Mcy`, and formula scans pass;
- the header-level Calculation Trace workbook contains Input, reused Concrete detail, Steel detail,
  and a formula-linked Summary; non-exact Fixed-P rows retain separate below/above detail pairs and
  reproduce the selected interpolated `P/Mx/My` without visible stored-result comparison rows;
- when a selected state is a cap-face point, that workbook includes the physical pre-cap Concrete
  and Steel sheets, then a formula-driven `Axial Cap` comparison/projection sheet and Summary;
- a geometric-only cap endpoint is labelled as geometric in Input, with strain, curvature, and
  resistance factor reported as unavailable rather than as a physical or pre-cap state;
- workbook number formats retain full-precision values while suppressing trailing zeroes according
  to quantity type: compact scientific strain/curvature, optional-decimal coefficients, two displayed
  decimals for calculated Concrete/Steel stresses, forces, and resultants, and at most three displayed
  decimals for summary resultants;
- the resultant comparison table has visible vertical group separators at both
  `Contribution | Nominal/reference` and `Nominal/reference | Factored/Design` boundaries;
- structure, typecheck, focused owner tests, full tests/build, web-bundle, and relevant unchanged-
  result benchmarks pass.

Schema/provenance/report impact:
No persistence, project schema, capacity, or released-report change. The preview surface DTO gains
axial-cap provenance including the retained physical pre-cap source, and the lazy audit DTO gains
preview-only criterion/summary/cap fields. New
worker export requests and point-specific
preview workbook formats are added for both the concrete-only evidence and complete Calculation
Trace evidence; the existing chart-audit workbook remains available from the Results toolbar and
is not changed.

Out of scope:
Changing design-code coefficients, station schedules, strain caps, solvers, mesh rules, resistance
results, Fixed-P interpolation, the existing full chart-audit workbook, or product verification
status.

Independent audit follow-up — 2026-09-03:

- found and blocked ordinal stage remapping when equivalent-block Design cap clipping removes a
  Vertical criterion that remains present on the Nominal surface;
- found and removed geometric-only cap Input wording that described a zero-valued DTO placeholder
  as a resolved physical/pre-cap state;
- added explicit preview/profile provenance to the workbook, user-visible export failures, and
  modal focus containment/restoration;
- classified these corrections as Class 4 presentation/report-contract work with no capacity,
  station schedule, material law, solver, or stored-result change.

Verification record — 2026-09-03:

- focused stress-strain and equivalent-block audit tests passed, including independent analytic
  checks of `epsilon_y -> epsilon_s -> d -> kappa -> c -> epsilon0` and declared `c/D` derivation;
- `npm test` passed 276 unit tests plus CAD, round-trip, station coverage, Excel, demand-check, and
  PDF integration suites; disposable report outputs remained under the ignored output tree;
- the focused point-workbook tests opened both mechanics variants, recalculated formula totals with
  HyperFormula, reproduced the selected concrete resultants, found no formula errors, and verified
  that the quantity-specific number formats survived XLSX serialization and reload;
- the complete Calculation Trace workbook tests recalculated Vertical and non-exact Fixed-P cases
  with HyperFormula, verified the shared concrete-sheet builder, preserved both Fixed-P physical
  endpoints, and reproduced the selected `P/Mx/My` through Summary formulas with no formula errors;
- spreadsheet render review covered Input, Concrete, Steel, and Summary. The Input sheet owns shared
  concrete/steel law data, Steel exposes one row per bar, and Summary visibly assembles concrete,
  reinforcement, total resistance, and the selected workbook result;
- follow-up workbook review removed the visible stored-result/difference rows from Summary, confirmed
  that Input has no frozen pane, and verified two-decimal display formats on calculated Concrete and
  Steel stress, force, and contribution columns while retaining full formula precision;
- `npm run build` and `npm run check:web-bundle` passed; the Calculation Trace dialog is loaded only
  when opened, keeping initial JavaScript within budget;
- `npm run bench:verify` reported bit-identical capacity fingerprints for 8 sections, and
  `bench:strain-sampling`, `bench:equivalent-block`, and `bench:pipelines` reported no failures;
- browser review covered stress-strain `epsilon_s/epsilon_y`, uncapped `c/D`, and equivalent-block
  rows. The modal had no horizontal overflow, parameter labels and values used the same size with
  restrained value weight, equations had no per-row border or text decoration, triangle-rule text
  was absent, and each physical trace showed one concrete summary with one `Excel` action and a
  download icon. The resultant stage used one grouped Nominal/Factored table; computed styles
  confirmed a solid one-pixel separator at both group boundaries. The new header-level Excel action
  was visible beside Close and enabled for an auditable physical row. No console errors were observed.
- follow-up browser review confirmed that the View, Stage, and Criteria selectors expose all rows from
  the active table query, preserve the matching row across Design/Nominal, switch Vertical/Fixed-P
  without closing the modal, retain the modal with a disabled Criteria selector when a query is empty,
  and have no horizontal overflow at a 390 px viewport. No console errors were observed.
- axial-cap follow-up added independent analytic oracles for both mechanics. Stress-strain verifies
  `Pcap`, the source-edge ratio, crossing `P/Mx/My`, the structured radial factor, and the stored cap
  point. Equivalent-block independently verifies the clipped source-edge intersection. Both audits
  prove that no compatible `state` was attached, and both report zero reconciliation drift in the
  exercised fixtures;
- the formula-driven cap workbook recalculated in HyperFormula with no formula errors, reuses the
  normal Concrete and Steel detail builders for the retained pre-cap criterion, compares that total
  with `Pmax`, and links the final `Axial Cap` result into Summary;
- browser review of the concise `c/D = 3` axial-cap row showed the full pre-cap sequence through
  compatible strain, 6,144 concrete points, reinforcement, and resistance assembly. It reproduced
  `Pcalculated = 2,652 kN`, compared it with `Pmax = 2,121.6 kN`, selected the cap, then showed
  `t → Rcross → q → Rcap`, reproduced `12.39 kN·m`, and reported normalized
  reconciliation `0.000e+0`. The obsolete subtitle was absent; View/Stage/Criteria and Excel shared one
  control row, Excel was right aligned, the modal had no horizontal overflow, and no console errors
  were observed;
- after lazy-loading the Results sidebar with the rest of the Results workspace, production build
  and `check:web-bundle` passed at 373.0/375.0 KiB initial, 113.0/120.0 KiB worker, and
  248.1/300.0 KiB Excel. Browser verification confirmed the lazy sidebar still loaded all 27 rows;
- `bench:verify` remained bit-identical over 8 sections. `bench:strain-sampling`,
  `bench:equivalent-block`, and `bench:pipelines` completed with no verification failures.
- after the pre-cap trace addition, `npm test` passed 277 unit tests and all CAD, round-trip, station,
  Excel, Demand Check, and PDF suites. Production build passed; `check:web-bundle` remained within
  budget at 374.2/375.0 KiB initial, 113.8/120.0 KiB worker, and 248.1/300.0 KiB Excel. The four
  numerical benchmark gates passed and `bench:verify` remained bit-identical over 8 sections.
- independent-audit corrections passed 23 focused report/UI tests, including fail-closed selector
  identity and a geometric-only equivalent-block cap workbook with `N/A` strain/curvature/factor;
  the full `npm test` pipeline, production build, and all four numerical benchmark gates passed.
  `bench:verify` remained bit-identical over 8 sections. `check:web-bundle` passed at
  374.6/375.0 KiB initial, 114.0/120.0 KiB worker, and 248.1/300.0 KiB Excel.
- browser verification reproduced the 27-row Nominal versus 21-row clipped Design case. Switching
  `c/D = 3` to Design showed the explicit unavailable state, disabled Excel, and did not substitute
  `epsilon_s/epsilon_y = 0`; returning to Nominal restored `c/D = 3`. Initial focus, Tab wrapping,
  body-scroll locking, trigger-focus restoration, 390 px overflow, and console errors were checked.
- final workbook QA opened the serialized XLSX with the independent artifact reader, found zero
  formula-error cells, inspected the `#,##0.###` Summary formats, and rendered all five sheets.
  Input provenance, wrapped calculation-state labels, Concrete material-law layout, Steel state
  columns, Axial Cap comparison, and the formula-linked Summary were visually reviewed.
