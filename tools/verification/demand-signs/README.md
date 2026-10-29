# Demand sign guide

## Axis-aligned moment ellipses, 2026-10-29

Presentation-only follow-up: replace the sheared oblique loops with axis-aligned ellipses.
The Mux ellipse is vertical and the Muy ellipse is horizontal. Arrowheads sit at the visible
half's tangent point: +Mux points up and +Muy points right. The existing display scale, axis-end
clearance, centroid, labels and all engineering inputs/results remain unchanged. The drawing change
is confined to SectionMomentAxes; the separate MOM-FIELD-002 boundary finding remains open.
The existing browser check uses the current SectionOutlineChart accessible name, `Section geometry;
section field unavailable`, following the demand/capacity basis change documented in
[development/13](../../../docs/development/13-demand-field-basis.md). No field-selection logic changes.
Zero-demand layout QA retains the unavailable-field assertion for block mechanics. Stress-strain
zero demand is checked for visible centroidal axes without prescribing demand-field availability;
the owning field-basis pipeline determines that state.

Verification: `npm test` (including structure/typecheck and owner tests), production build and
web-bundle gate pass. Existing browser checks pass for both mechanics, the asymmetric section,
both themes and 900/560/390 px layouts without clipped labels or page errors. Visual inspection
confirms vertical Mux and horizontal Muy ellipses and the unchanged up/right arrowheads. Logs use
the `alignment-` prefix under ignored `outputs/demand-signs/`; `moment-icons-aligned.png` is the
current preview. These are presentation checks, not resolution of the separate material-boundary audit.

## Axis spacing and icon size, 2026-10-29

Presentation-only follow-up: extend both positive axis ends from 42 to 66 CSS pixels beyond the
section bounds, move moment-loop centres from 20 to 40 pixels beyond those bounds, and enlarge
loop paths and arrowheads by 25%. Label typography, centroid and positive directions are preserved.
SectionMomentAxes owns shared display margins for both physical-field and geometry-only views;
the renderers reserve room above and to the right for the extended annotations. No numerical,
schema, report or engineering-status contract changes. The separate MOM-FIELD-002 audit below
remains open and is outside this presentation follow-up.

Follow-up checks: `npm test` (including structure/typecheck and owner tests), production build and
web-bundle gate pass. The existing browser placement/visibility regression passes for both mechanics
and the asymmetric L case, in both themes and at 900/560/390 px widths. Visual inspection confirms
the larger loops, extra clearance and unchanged arrow directions. No labels are clipped; field and
geometry-only views retain the exact centroid. Logs use the `spacing-` prefix under ignored
`outputs/demand-signs/`; its field screenshots show the current spacing.

## Compression-side direction audit, 2026-10-29

Scope: current working-tree moment icons only, requirement ENG-LOAD-001 and engineering/02 §2.
The user requires the visible arrowhead to point toward the compressive fibre side in the
symmetric uniaxial illustration. The prior UI checks established centroid placement and visibility;
they did not verify this direction claim. Audit found both visible arrowheads reversed: +Mux down
and +Muy left. The new check reproduced a failure before correction while the actual +Mux field
had positive compression at the top and tensile steel at the bottom.

Finding `MOM-SIGN-001` (P2): the old icons could mislead demand-sign entry despite correct resultants
and correct field stresses. The UI requirements check for ENG-LOAD-001 failed. Both arrowheads
and their directed loop paths have been reversed; centroidal axes and numeric kernels are unchanged.

Independent oracle: on a symmetric rectangle with zero axial force and one moment component,
`Mx = ΣF(y−yc)` requires +Mux compression on +Y; `My = ΣF(x−xc)` requires +Muy compression
on +X. Negative moments reverse those sides. Compare four pure-bending fields from both mechanics
with the rendered SVG arrowhead and its loop tangent. This does not assert a particular compression
zone from moment signs alone for an asymmetric/biaxial/axially loaded section.

Correction scope: icon paths, accessible descriptions, regression checks and
this evidence record. Class 1 per docs/09 §10: UI only, unchanged resultants, profiles, units,
resistance factors, solvers, schemas, reports and Preview status. Prior generic spatial rotation
wording is not an engineering authority for the visible compression-side cue.

Run `node --import tsx tools/verification/demand-signs/rotation-audit.mjs` with the same browser
runtime environment described below. This regression checks the actual SVG triangle heading and
the directed tangent of the visible loop against the analytical compression-side oracle. It reads
the worker's compatible capacity state and actual rebar strains/stresses for a symmetric rectangle
at Pu = 0, then checks all four signed uniaxial demands for KDS equivalent-block and stress-strain
profiles. It does not derive a field from the icon, choose a sampled direction, or substitute a
visual sign for engineering adequacy.

Direction evidence after correction: all eight cases pass. +Mux has upward screen heading,
+Muy has rightward heading, and each loop's directed tangent agrees with its
arrowhead. Positive cases compress the +Y/+X edge; negative cases compress the opposite edge.
The saved pre-correction and post-correction +Mux demands and full-precision compression/tension
strain and stress evidence are exactly equal. Evidence, screenshots and the reproduced old
failure are under ignored `outputs/demand-signs/rotation-audit/` and
`outputs/demand-signs/rotation-audit-before.log`.

Additional finding `MOM-FIELD-002` (P2, open): a stricter concrete outer-fibre stress check finds
one corner in the stress-strain −Muy case at `(−200,−250)` mm with strain
`0.003300000000000001` against the declared `0.0033` limit, and stress zero. The KDS material owner
`packages/pm-materials/src/concrete/kds-parabolic.ts` carries compression only for strain <= epsCu;
the zero therefore occurs at its strict cutoff. The rebar compression/tension evidence and the
arrow-direction checks still pass. This audit does not authorize a new tolerance or strain clamp,
and does not alter material laws or capacity states to hide the failure. The script completes all
eight direction checks, records this separate finding, and exits nonzero while the strict concrete
edge gate remains unresolved. The earlier general UI checks do not establish this stronger claim.

Current verification status: icon direction corrected and checked against engineering/02 and eight
signed uniaxial fields. `npm test`, production build and web-bundle gate pass for the correction.
The additional exact-concrete-edge audit is incomplete because of MOM-FIELD-002; no accepted-result
or release eligibility is asserted. Numerical repair of the boundary issue is outside this icon
correction and requires the owning engineering change workflow and independent boundary oracle.

Presentation-only task, 2026-10-29. Authority: [engineering/02 §2](../../../docs/engineering/02-data-conventions-and-terminology.md)
and the [canonical workspace design skill](../../../.agents/skills/workspace-style-design/SKILL.md).
Field at capacity shows X/Y axes through the exact analysis origin. Fixed curved
arrows at their positive ends show +Mux about X and +Muy about Y. These reference arrows are
independent of demand sign, physical-field availability and the resultant visibility switch.

Owners: web ResultsWorkspace, SectionMomentAxes, SectionFieldChart, SectionOutlineChart, LoadingsPanel and diagram
layout in globals.css. Inputs are existing canonical demand components. Output is presentation only;
no mechanics, validation, numerical result, project schema, worker, report or release-state change.
The declared origin and `(My,Mx)` section mapping remain as specified by engineering/02. The field
uses its stored origin; the geometry-only fallback consumes the geometry owner's exact net-concrete
centroid. Screen projection cannot substitute the bounds centre or mesh centroid. At the visible
half of the X loop the +Mux arrow points up toward +Y; at the visible half of the Y loop the +Muy
arrow points right toward +X. These are the compression-side cues for the symmetric uniaxial
reference. The loop path follows the same direction as its arrowhead. No axial-force viewing
direction is inferred from this icon. Straight component arrows are omitted; Rm
and its perpendicular reference remain separate from the fixed moment-sign loops.

Acceptance: browser inspection of four quadrants, exact origin and axis crossing, zero demand/unavailable field, both mechanics,
strain/stress, resultant toggle, both themes and narrow layouts; existing section-angle owner tests;
repository structure/typecheck, complete test suite, production build and bundle gate. Evidence and
screenshots are written to ignored `outputs/demand-signs/`. Set PM_PLAYWRIGHT_MODULE to an installed
Playwright runtime and optionally PM_TEST_URL before running `node --import tsx
tools/verification/demand-signs/browser.mjs` against the local application.

Initial placement/visibility verification on 2026-10-29 (the later direction and concrete-edge audit is above):

- `npm test`: passed, including structure, typecheck, unit, ADSEC, CAD, project round-trip,
  both calculation workbooks, Demand Check workbook and PDF report checks.
- Final `npm run check:structure`, `npm run typecheck` and the five existing section-field-angle
  owner tests: passed after the final presentation refinements.
- `npm run build` and `npm run check:web-bundle`: passed. Initial JavaScript is 374.2 KiB gzip,
  within its 375 KiB budget. Sandbox restrictions on Edge launch and generated build-directory
  writes were resolved by running those checks outside the sandbox; those runtime gates passed.
- Browser: passed for a rectangle, an asymmetric L section and the complex stress-strain section.
  Exact net-concrete origin, crossing of both axes, all demand quadrants, zero/unavailable fields,
  strain/stress, resultant toggling, light/dark, 900/560/390 px layouts and fractional pixel scaling
  were checked. Labels fit and no page errors were observed. The L fixture explicitly distinguishes
  centroid from bounds centre. Authored SVG coordinates are checked without the float32
  quantization of `getPointAtLength`.
- Visual inspection: light/dark rectangle, asymmetric L, complex hollow section and narrow layout
  screenshots. SVG annotations share the canvas-to-CSS transform, including fractional backing-store
  rounding, and do not intercept field inspection pointers.

This is UI verification only and does not certify calculations or change their Preview status.
The canonical skill and Claude adapter are unchanged; cross-agent skill invocation gates do not
apply to this feature change. Existing unrelated user changes remain in the shared checkout.
