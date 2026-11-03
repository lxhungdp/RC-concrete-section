# Minimal steel hardening inputs and two-segment calculation review

Objective: reduce ordinary hardening input to endpoint strain plus endpoint stress/strength ratio,
and verify that evaluation uses exact two-segment interpolation. Requested 2026-11-03.

Requirements: ENG-MAT-001/002/004/005/007. Class 4 for the explicitly declared endpoint cutoff of
new KDS/Custom curves; existing definitions, compilers and resistance mathematics are unchanged.
UI presentation within the slice is Class 1. All profiles retain draft/preview status.

Allowed files: the mapped material authority and authoring registry, project authoring helper and
tests, MaterialPanel/SteelHardeningFields, browser verification, focused material tests, and linked
development/persistence documentation. Preserve the existing uncommitted work. No dependencies,
schema revisions, migrations, commits, pushes or deployments are required.

Input contract: existing fy and Es determine the yield point. Hardening adds epsUk and either fu
or k = fu/fy. New project KDS/Custom curves end at the entered endpoint, an explicit identity
cutoff rather than a borrowed normative coefficient. EN retains the named recommended preview
factor from EN 1992-1-1:2004 §3.2.7(2), no National Annex. Advanced edits can specify a separate
factor/absolute cutoff and an independent physical bound. Existing saved choices remain exact.

Output contract: the same validated `linear-hardening` DTO feeds both supported mechanics and
their existing persistence/report pipelines. No parameter is discarded merely because its editor
is collapsed. Derived yield, slope and active strain cutoff are read-only information.

Calculation review: `compileLinearHardeningSteel` already evaluates an elastic segment and one
straight post-yield segment using its precomputed endpoint tangent. The plateau compiler is the
zero post-yield-slope case. Neither kernel samples the rendered SVG to obtain stress. Existing
signed admissibility, section strain-boundary construction and resistance sequencing remain
separate from this scalar stress interpolation and are retained.

Blocking failures: incomplete/contradictory endpoints, non-finite values, unsupported profile/law,
and existing domain/convergence failures. A single strength ratio does not silently supply a
missing endpoint strain. A separately declared physical bound does not become a design factor.

Oracles/gates: independent line interpolation at elastic/yield/post-yield ordinates, endpoint and
ratio equivalent input, authoring-default and saved-override tests, JSON/XLSX round trips, KDS/EN
browser On/Off and Advanced edits in both themes/narrow panels, structure/typecheck/full tests,
portable numerical regression, production build and web-bundle budgets. Numerical snapshots and
tolerances must not be updated to obtain a pass. Source rechecked: JRC/Walraven p.24, accessed
2026-11-03, <https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/EN1992_1_Walraven.pdf#page=24>.

Out of scope: a new steel grade catalogue, inferred grade ductility, a different KDS resistance
code, delayed hardening, member behaviour, or changing existing saved project resistance.

## Implemented outcome and evidence

The ordinary form contains two additional numeric editors: KDS/Custom starts with endpoint
strain and fu; EN starts with epsUk and k. Advanced retains strength-entry mode, factor/absolute
cutoff and optional physical bound. Redundant editable-looking yield-strain information is
removed from the endpoint form; the graph continues to show the derived yield and tangent.
The KDS endpoint identity is labelled as a project-defined limit. No constitutive or section
kernel was changed during this review.

Executed gates passed:

- structure and TypeScript checks;
- all 451 unit tests and the complete `npm test` integration pipeline, including independent
  Excel recalculation, PDF, JSON and metric/US workbook round trips;
- independent straight-line interpolation and plateau ordinates, authoring failure boundaries,
  and the source-backed EN single-bar stress at the design cutoff;
- browser assertions for exactly two visible ordinary inputs, two-input capacity, Off/On,
  Advanced edits, and both themes/signed narrow charts across KDS fibre, KDS block and EN;
- production build and all web-bundle budgets;
- the reviewed portable numerical regression using baseline Node 24.20.0/npm 11.19.0. Existing
  states/structural evidence and inverse errors retain their baseline behaviour; 17 resultants
  differ only by the already recorded cross-platform roundoff (worst normalized delta 4.957e-17).
  No oracle or tolerance was changed.

Browser evidence reconstructs the old KDS factor-0.8 capacity, -5.311654 MN, through Advanced after
the simplification. A newly entered KDS curve with the same construction point and the explicit
endpoint identity produces -5.414196 MN, as its different declared cutoff requires. EN's existing
recommended rule remains -5.486652 MN. The change in new KDS authoring is explicit; old definitions
are not rewritten. No browser page/worker errors were observed. Screenshots and logs are under
`outputs/steel-hardening` (ignored by Git).

The scalar stress law is already the requested two-segment interpolation. Yield is fy,eff/Es;
the inclined tangent is resolved once from the two endpoint ordinates. The plateau closure clamps
at fy,eff. A graph renderer draws those same evaluators; no pixel/table interpolation or separate
solver is introduced. The numerical tests additionally check both strain signs and Reference/
Design stages. Cutoff and section-domain checks remain separate because a finite stress value
outside the declared strain range cannot establish ultimate resistance.

Remaining limitations are inherited: profiles are preview/draft, KDS inclined steel is project
modified, EN has no National Annex, and acceptance/released-report and independent discipline
review gates remain open. Fixed hardening adequacy remains indeterminate; converged Adaptive
evidence is still required. This change makes no new performance or code-compliance claim.
