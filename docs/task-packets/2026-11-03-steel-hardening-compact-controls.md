# Compact hardening controls and strain-axis projections

Objective: implement the requested checkbox, paired epsUk and radio-selected k/fuk row, linked
editable alphaEpsilon (%) and epsUd without an input-mode menu, remove Advanced, and project
epsUd/epsUk onto the horizontal strain axis with dashed vertical guides.

Requirements: ENG-MAT-001/002/005/007. Class 2 input-interaction refactor with Class 1 plotting;
unchanged constitutive mechanics, defaults, factors, admissibility and serialized discriminants.

Authorities/owners: engineering/04 §5, control map, project authoring helper; MaterialPanel,
SteelHardeningFields and layout-only side-panel CSS; existing project/material tests and browser
verification. Apply the existing workspace native-checkbox/radio/field roles. Prior packets retain
their historical evidence. No new normative interpretation or value is introduced.

Contract: changing strength radio preserves the curve. Editing alphaEpsilon stores a factor;
editing epsUd stores an absolute cutoff, with the other field derived. The last edited basis
determines subsequent response to epsUk changes. Import/open never converts existing data merely
to display both fields. Existing independent physical limits remain active, visibly identified,
and removable only by an explicit user action. Imported tabulated laws keep their data and mixed
checkbox state until an explicit selection. Numeric/transport/report contracts stay unchanged.

The graph projects the declared design and construction points, including when a physical bound
governs earlier. Coincident limits share a guide and label; distinct nearby labels are staggered
in presentation space. Invalid data retain axes and diagnostics, without fabricated projections.

Blocking cases: existing invalid/non-finite material data, conversion failures, unsupported scope
and existing analysis failures. Verification: focused last-edited-basis and invalid-input tests;
browser checkbox/radio/linked-field use, exact saved discriminants, unchanged curves and independent
worker-capacity oracle, physical-bound preservation/clear, axis projection coordinates, coincident
and nearly coincident markers, signed/Reference/Design views, both themes and narrow layouts;
structure/typecheck, full npm test, portable regression, production build and bundle gate.

Out of scope: new standards, numerical law/solver changes, new physical rupture assumptions,
schema migrations, dependency changes, profile qualification, accepted/released outputs or commits.

## Delivered behavior and evidence — 2026-11-03

The hardening checkbox and native radios replace both authoring menus. epsUk and the selected
strength input share a two-column row with headings above the values; linked alphaEpsilon/epsUd
occupy the next row. Strength conversion uses the existing package helper. The cutoff setter now
accepts the edited field's basis explicitly; only that representation is stored, with its companion
derived. Focus and unchanged numeric edits retain the current basis and full stored precision.
Display copies trim floating-point tails; exact values remain available in the input title and are
never replaced by display rounding. There is no Advanced disclosure. Imported physical bounds
remain visible and active until the explicit Clear physical bound action is used.

Axis projections use the same compiled curve and view transform as the plotted construction and
design points. Both vertical guides terminate at the horizontal strain axis. A 100% cutoff shares
one marker/label; separate nearby labels stagger without moving their actual coordinates. Signed
views identify the negative tensile locations as -epsUd/-epsUk. Physical cutoffs stay separately
identified and do not overwrite the declared design or construction markers.

Passed gates:

- Focused project/material tests: 16 passed, including the new last-edited cutoff-basis test and
  independent interpolation/tangent/limit evidence.
- Full `npm test`: repository structure, typecheck, 460 unit tests, 5 AdSec tests, CAD, JSON and
  metric/US workbook round trips, independent Excel recalculation, demand and PDF integrations.
- Final browser regression for KDS fibre, KDS block and EN: checkbox/radio operation, coupled fields,
  unchanged curve/capacity under equivalent entry, exact saved discriminants, no-op precision,
  invalid-input rejection, legacy physical-bound preservation and explicit clearing, both themes,
  260 px sidebar, Reference/Design and signed views. Guide endpoints, strain-axis coordinates and
  near/coincident marker handling passed. No unexpected page or worker errors occurred.
- Independent two-point stress interpolation and bar-force summation reproduced the previous
  fixture capacities. KDS custom-cutoff direct/percentage cases remain -5311654.06224225 N for
  both mechanics; EN remains -5486651.656026218 N. These are compression-positive synthetic
  regression cases, not normative material values.
- `bench:verify:portable`, using baseline Node 24.20.0/npm 11.19.0, retains the already documented
  17 platform roundoff differences, worst normalized delta 4.957e-17, and unchanged inverse errors.
  Windows cannot satisfy strict identity with the darwin/arm64 baseline. No oracle or tolerance
  was changed.
- Final explicit typecheck, production build and bundle checks passed. Initial gzip JavaScript is
  344.1/375 KiB; Plotly, analysis-worker and Excel budgets also passed. Diff whitespace check passed.

Logs are `outputs/steel-hardening/compact-controls-*.log`; browser details are in
`browser-evidence.json`, exported `*-ui-inputs.json` files and the current screenshot set, including
`*-auto-on`, `*-close-axis-points`, `*-signed-curve` and `*-sidebar-minimum` PNGs. These artifacts are
ignored by Git. Visual review confirmed the requested compact layout, clean numeric display and
dashed projections in both themes and at minimum width.

No constitutive law, result formula, resistance factor, stored schema or report format changes.
Defaults and preview/draft status remain unchanged. KDS hardening is still project-defined and EN
still has no selected National Annex; independent discipline review and accepted/released-result
gates remain open. No commit or deployment was made.
