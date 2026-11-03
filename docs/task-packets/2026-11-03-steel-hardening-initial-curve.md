# Immediate valid hardening defaults and persistent chart

Objective: turning Off -> On must fill valid editable endpoints and immediately draw the inclined
curve. Both states retain the material chart. Requested 2026-11-03; this supersedes the previous
empty-endpoint authoring decision, not the existing saved-data contract.

Requirements: ENG-MAT-001/002/004/005/007. Class 4 for new-curve initialization, Class 1 for
stable chart presentation. Profiles remain preview/draft; no accepted/released result is created.

Allowed owners/files: engineering/04, the control/source registry, code-en1992 reference constants
and tests, material facade, project authoring helper/tests, MaterialPanel/SteelHardeningFields,
browser verification and linked development/package documentation. No constitutive, section,
resistance, schema, dependency, migration, commit or deployment change is needed.

Source: CEN EN 1992-1-1:2004 Annex C, Table C.1, Class B; publicly presented by J.C. Walraven,
JRC, 22 February 2008, page 23, accessed 2026-11-03:
<https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/EN1992_1_Walraven.pdf#page=23>.
The reference pair is k = 1.08 and epsUk = 0.05 (strain ratio). These are the published lower-bound
reference values, used as an editable curve template. They do not certify the supplied steel grade,
and are not adopted as KDS bridge/ordinary-code hardening coefficients. The KDS project-modified
flag and EN no-National-Annex status retain their meaning. The cutoffs remain separately declared.

Input/output contract: current fy/Es, physical bounds and DesignBasis determine the compatible
initial endpoint. Normal materials start at 5% with peak stress 1.08 fy (or k = 1.08). If the
Reference/source/Design yield strain reaches the template cutoff, the helper extends the endpoint
by the governing yield/cutoff-factor offset. It validates the definition rather than repairing
invalid existing physical data. The same serialized model feeds chart and calculation. Opening or
editing an existing valid law never replaces it by the starter. During an invalid edit the SVG
frame remains, with an explicit diagnostic and no fabricated stress line.

Blocking failures: invalid/non-finite current material, incompatible physical bound, unsupported
profile/law, and all existing material-domain/convergence failures. No invalid input is promoted
to a valid calculation solely to keep the chart visible.

Oracles/gates: source-node and independent endpoint/tangent calculations, material-stage and
extreme-yield initialization, physical-bound preservation, invalid input tests; browser tests
assert nonblank defaults and a nonempty curve immediately after On, a plateau for Off, stable axes
and diagnostic on a temporarily cleared endpoint, both themes/stages and three supported routes;
full tests/structure/typecheck, portable baseline regression, production build and bundle budgets.
Do not change existing result baselines or tolerances.

Execution evidence, 2026-11-03:

- `npm test` passed: structure, typecheck, 455 unit tests, AdSec/CAD, JSON and workbook round trips,
  independent Excel recalculation, demand and PDF integration checks.
- The local Edge regression passed for KDS fibre, KDS block and EN. It asserts two populated
  endpoint fields and a drawn curve immediately after On, the Off plateau, preserved imported
  overrides, editable endpoints, both themes, Reference/Design and signed/narrow views. An invalid
  edit retains axes and an explicit diagnostic. No page or worker errors occurred.
- The browser's uniform-tension oracle independently interpolates the two line segments, then
  sums bar forces. For the existing complex fixture, the starter gives P = -5315755.725610777 N
  for KDS fibre, -5315755.725610779 N for KDS block and -5396379.338576923 N for EN. These are new
  explicitly initialized curves; imported/custom endpoint laws reproduce their previous results.
- `bench:verify:portable` passed using baseline Node 24.20.0/npm 11.19.0. The baseline was recorded
  on darwin/arm64, so strict environment identity is unavailable on Windows. The reviewed portable
  comparison retains the already observed 17 resultant roundoff differences (worst normalized
  delta 4.957e-17), with unchanged inverse errors. No oracle or tolerance was changed.
- Production build and all web-bundle budgets passed. Visual inspection confirmed populated KDS/EN
  On charts, the Off plateau, light/dark presentation and the invalid-edit axes.

Logs, browser evidence and screenshots are under `outputs/steel-hardening` (ignored by Git), with
`initial-curve-*` logs and `*-auto-on.png`, `*-off-curve.png`, `*-invalid-frame.png` captures.
The source node and project initialization/failure tests are permanent package tests.

Numeric impact is confined to newly authored hardening definitions, which previously had invalid
zero endpoints. No stress law, section formula, resistance factor, stored schema, export format or
existing valid definition changes. Material endpoints remain explicit project inputs. Stage 1 and
preview/draft restrictions remain; this task does not complete independent discipline review,
material-grade qualification, accepted-result or released-report gates.
