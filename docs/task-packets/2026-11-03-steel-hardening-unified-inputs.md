# Unified KDS and EN hardening inputs

Objective: implement the user-approved three-row form: epsUk, alternative k/fuk input, and
alternative direct epsUd/alphaEpsilon (%) input. Populate defaults immediately, retain On/Off
charts and existing definitions, and use the same serialized law throughout calculation/export.

Requirements: ENG-MAT-001/002/004/005/007. Class 4 for authoring-basis/default semantics, with
unchanged constitutive mechanics and numerical algorithms; presentation composes existing controls.

Owners/contracts: engineering/04 §5 and the control map first; project authoring policy and pure
conversion helpers; SteelHardeningFields; project/material tests; browser verification and linked
development documentation. Existing discriminants store one strength input and one cutoff input;
no schema/workbook revision, migration, numerical fallback, dependency or report-formula change.

Sources: EN 1992-1-1:2004 §3.2.7(2), Fig. 3.8 and Annex C, as publicly presented by JRC/Walraven,
22 February 2008, pages 23–24, accessed 2026-11-03:
<https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/EN1992_1_Walraven.pdf#page=24>.
The existing no-National-Annex EN preview cutoff stays at 90%. The current Class-B starter pair
remains an editable reference template, not grade certification. KDS 100% is the explicit project
endpoint declaration authorized by the user; it is not an adopted KDS bridge coefficient or a
claim that the EN symbols are mandatory KDS notation. KDS steel modification/draft evidence stays.

Input/output: strength-ratio mode follows fy; stress mode holds fuk. Strain-percentage mode follows
epsUk; direct mode holds epsUd. Switching modes preserves current ordinates and cutoff within
floating arithmetic, without formatting values back into inputs. Only the selected representation
is canonical. Invalid draft data return typed conversion failures or material validation evidence;
no fabricated reciprocal, hidden reset or invalid stress curve. Independent physical limits stay
optional, separately named and visible when active. Changing only epsUd must not change the tangent.

Oracles: independent endpoint interpolation and unchanged-tangent assertions; strength/cutoff basis
switching, editing dependency, percentage boundary and invalid conversion tests; JSON/XLSX round
trips; browser worker capacity comparisons for both KDS routes and EN, immediate defaults, direct
and percentage edits, preserved curve paths/capacity, invalid input, physical-bound precedence,
light/dark and narrow layouts. Gates: structure/typecheck, focused tests, full npm test, reviewed
portable numerical regression, production build and web-bundle budgets.

Out of scope: new standards/editions, National Annex qualification, bridge resistance adoption,
delayed hardening, cyclic/fracture/buckling models, accepted results, release, commits or deployment.
This supersedes the two-input ordinary layout, not its historical evidence or saved definitions.

## Delivered contract

`@pm/project` owns `steelHardeningInputValues`, `convertSteelHardeningStrengthInput`,
`convertSteelHardeningStrainLimitInput` and `withSteelHardeningStrainLimitValue`. Conversion
failures are typed data. The UI consumes their companions and percent adapter rather than
recreating strength/cutoff conversions. New KDS and EN definitions both select ratio strength
input; the default construction line is unchanged until a subsequent fy edit, which intentionally
follows the selected ratio. Existing stress-input definitions retain their absolute-stress basis.

The form has three numeric inputs with two visible mode selectors and computed companions.
Advanced retains only the optional physical bound. The chart distinguishes epsUd from epsUk,
labels equality when the cutoff reaches the construction point, and marks a controlling physical
bound separately. The original line continues dotted beyond the active tensile cutoff. Invalid
current input retains the frame and diagnostic without inventing a curve.

## Executed evidence — 2026-11-03

- Focused project/material tests passed, including independent interpolation, repeated basis
  conversions without mutation, input-dependency semantics, 90%/100% boundaries, unchanged
  tangent when only cutoff changes, physical precedence and invalid conversion evidence.
- Full `npm test` passed: repository structure, typecheck, 459 unit tests, 5 AdSec tests, CAD,
  JSON/metric-US workbook round trips, independent Excel recalculation, demand and PDF checks.
- The browser suite passed against both development and final production output for KDS fibre,
  KDS block and EN. It checked populated defaults, all four entry modes, unchanged path coordinates
  during mode conversion, exported JSON discriminants, actual worker capacities, fy/epsUk edits,
  physical limits, invalid endpoints/cutoffs, On/Off, both themes and Reference/Design views.
  Final captures include a 260 px sidebar and signed charts. No page or worker errors remained.
- Independent two-point interpolation and bar-force summation reproduced the final worker poles.
  KDS direct/percentage custom-cutoff results are -5311654.06224225 N for both mechanics; EN is
  -5486651.656026218 N. Adding a 0.02 physical bound gives -5106570.893815909 N for KDS fibre,
  -5106570.8938159095 N for KDS block and -5225814.557868708 N for EN. These are synthetic
  regression fixtures with compression-positive P, not normative material values.
- `bench:verify:portable` passed with baseline Node 24.20.0/npm 11.19.0. Strict platform identity
  cannot compare Windows with the darwin/arm64 baseline. The reviewed portable route retains
  the previously recorded 17 roundoff differences, worst normalized delta 4.957e-17, and unchanged
  inverse errors. No benchmark target or tolerance changed.
- Production build and bundle gates passed: initial gzip JavaScript 344.1/375 KiB; all other
  lazy/worker budgets passed. `git diff --check` passed.

Evidence is in ignored `outputs/steel-hardening/unified-inputs-*.log`, `browser-evidence.json`,
the exported `*-ui-inputs.json` projects and the `*-auto-on`, `*-direct-inputs`, `*-unified-*`,
`*-physical-curve`, `*-signed-*` and `*-sidebar-minimum` PNGs. Visual inspection confirmed the
three-row form, direct/percentage alternatives, separate strain markers and narrow layout.
Direct numeric editors preserve the full stored conversion precision; no display rounding is
written back to the model.

No existing valid definition, constitutive law, section algorithm, factor, transport version or
report calculation changes. Only newly initialized KDS strength input selects ratio instead of
stress. Preview/draft status, KDS project modification, EN no-National-Annex status and the open
independent discipline-review, material-qualification and accepted-result/release gates remain.
