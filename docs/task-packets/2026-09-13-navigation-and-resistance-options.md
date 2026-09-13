# Navigation and Resistance-options task packet

Date: 2026-09-13
Change class: **Class 3 — result-affecting UI pipeline access with result-identical kernels**
Status: implemented and locally verified; no profile or release-status promotion

## Objective

Align the top-level product navigation with the user workflow `Section -> Materials -> Capacity ->
Demand Check -> Options`, add the missing `Resistance` tab under Options, and make every numeric
coefficient already owned by the selected `DesignBasis` editable from that tab.

The existing Capacity-table `Nominal` and `Design` presentation choices remain unchanged: Nominal
is the stored reference resistance and Design is the resistance allowed for comparison with
factored ULS demand.

## Engineering requirement IDs and authorities

- `ENG-AN-001` — keep the selected calculation and resistance profile explicit.
- `ENG-RES-001` — preserve the governing resistance state and traceability.
- `DEV-ARCH-006` — UI consumes canonical engineering inputs/results and does not recreate a factor
  or resistance formula.
- `docs/11` sections 1–3 and 10 — preserve nominal-first evaluation, exactly one resistance route,
  and anti-double-reduction invariants.
- `docs/development/07` section 8 — Options owns the persisted design basis and valid edits publish
  directly without a second Apply action.

## Allowed packages and files

- `apps/web/features/section-editor/SectionDrawingClient.tsx`;
- `apps/web/features/section-editor/design/DesignBasisPanel.tsx`;
- `apps/web/app/globals.css`, `apps/web/app/side-panel.css`, and
  `apps/web/app/anchor-reference-theme.css` for the stable three-tab layout;
- current workflow/ownership documentation and this task packet;
- focused tests only if an owner contract must be extended.

## Input contract

The project-v1 `CalculationProfileId`, version-3 `DesignBasis`, materials, geometry, reinforcement,
loadcases, and model-specific analysis-options contracts remain unchanged. Units, compression-
positive `P`, `Mx = sum(F*(y-y0))`, and `My = sum(F*(x-x0))` remain unchanged.

## Output contract

- Top-level visible labels are `Section`, `Materials`, `Capacity`, `Demand Check`, and `Options`.
- Options exposes `Points`, model-specific `Mesh`/`Block`, and `Resistance` tabs.
- Resistance edits the same canonical `DesignBasis` already persisted, passed to workers, and
  recorded in result/report provenance.
- Code-profile coefficient changes are withheld until validation passes, demote the basis to
  `draft`, and require a recorded override reason; `custom-user-defined` remains `user-defined`.
- No adapter coefficient, formula, default, resistance sequence, surface topology, or adequacy
  rule changes.

## Blocking failure cases

- a UI-local factor or a second resistance editor state reaching the solver independently;
- a modified code profile published without the required override reason;
- a factor outside the existing typed DesignBasis validation range;
- double reduction, changed default result, schema drift, or profile-status promotion;
- TypeScript, structural, focused test, full test, or build failure attributable to this change.

## Acceptance tests and oracles

- source inspection confirms the Resistance tab renders `DesignBasisPanel` and passes
  `setDesignBasis` directly;
- existing `@pm/design` validation/default tests and project round-trip tests remain the contract
  oracle for edited factors and provenance;
- `npm run check:structure`, `npm run typecheck`, focused `@pm/design`/`@pm/project` tests,
  `npm test`, and `npm run build`;
- because no kernel or default changes, identical default fixtures are the numerical oracle; any
  unexplained regression or benchmark drift blocks completion.

## Schema, provenance, and report impact

No schema/version change. An edited and valid DesignBasis already invalidates cached analysis and
flows into the worker, project JSON, calculation trace, and preview exports. The UI exposes this
existing path; it does not add a new persistence or provenance field.

## Out of scope

- editing code-owned constitutive/block equations such as `beta1`, `eta`, `alpha2`, or `gamma`
  through the resistance UI; those remain adapter-owned, while the existing user-defined concrete
  models remain the supported project-owned route;
- changing a standard edition, clause interpretation, applicability range, formula, factor default,
  sampling schedule, convergence tolerance, utilization, or report eligibility;
- promoting any `draft` profile or preview output to reviewed, verified, accepted, or released.

## Verification record

Executed on Node.js 24.20.0/npm 11.19.0:

- `npm run check:structure` passed;
- `npm run typecheck` passed;
- focused `@pm/design` and `@pm/project` tests passed, 18/18;
- the full unit suite passed, 326/326;
- project round-trip, CAD, stress-strain Excel, equivalent-block Excel, Demand Check Excel, and PDF
  report integration gates passed;
- `npm run build` and the post-build `npm run check:web-bundle` gate passed;
- `npm run bench:verify` reported bit-identical results for 8 sections by 24 capacity quantities;
- browser smoke inspection confirmed all five navigation labels, the three Options tabs, editable
  global-resultant factors, editable KDS Appendix material/minimum-eccentricity factors, and the
  unchanged Capacity `Design`/`Nominal` selector; the development browser log contained no error;
- the final Options-tab refinement uses three fixed equal-width columns and per-tab active styling;
  browser switching across Points, Mesh, and Resistance completed without layout/state errors;
- the aggregate `npm test` command remains blocked after its 326 passing unit tests by the existing
  AdSec source/manifest SHA-256 mismatches for `p16-ec2-kds-approximation` and `p16-aci`. This task
  did not alter or re-accept those external-oracle files.
