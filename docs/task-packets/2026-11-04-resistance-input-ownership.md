# Resistance input ownership

Date: 2026-11-04. Change class: 2, presentation/authoring refactor with identical stored inputs
and engineering results on navigation. Status: implemented and regression-checked; Preview only.

Objective: show only applicable Resistance inputs that are not already authored in Materials.
Requirements: ENG-MAT-004/006, UNITS-001/003 and the workspace engineering-input composition contract.
Authorities: control-map ownership; development/07 UI contract; engineering/04 material versus
resistance-factor distinction; docs/11 resistance formats; workspace-style-design standard.
Owner: web DesignBasisPanel. No package formula or project/schema change.

Input: current immutable DesignBasis. Output: the existing validated canonical basis after an
explicit edit. Opening or leaving a panel must not write or reset any factor, class, cap or reason.
Materials retains material factors, non-AS class and cap inputs. Resistance retains active phi,
applicable transition inputs, AS compression-factor class and declared minimum eccentricity.
Missing required reasons remain enterable; an existing Materials reason is not shown again.

Blocking failures: duplicate editable values, inactive AS transition input, hidden-field mutation,
cross-owner resets, lost narrative, invalid draft publication or missing required independent input.
Oracles: compare visible field ownership across supported profiles, exact project JSON and worker
surface identity on navigation, explicit active-factor edits with reason validation, and preserved
outside/hidden values. Test Materials-to-Resistance navigation, both themes and narrow widths.
Gates: structure, typecheck, focused design tests, full tests, build, bundle and browser evidence.

Impact: no numerical formula, standard default, project/workbook schema, worker/result DTO, report
classification or engineering status change. Existing Preview restrictions remain. Other current
working-tree changes, new standards and material authoring redesign are out of scope.

## Delivered behavior

`DesignBasisPanel.tsx` no longer repeats material-factor components, class/cap controls or their
derived multiplier summaries. The full-profile reset action is removed because it could overwrite
values owned by Materials. Only the active compression coefficient is editable; the inactive
coefficient and all other stored fields remain intact. AS retains its own class selector and pure
tension factor, with no unused common-schema strain field or fixed coefficient in the class label.

A required missing reason appears when a local edit needs it. Once entry starts it stays editable
through state echoes for that panel session. A populated reason received from Materials is retained
without another editor. AS keeps its reason editor here because Materials has no AS reason field.
Validation, draft publication, defaults, hidden stored values and the Preview status are unchanged.

## Verification

Runtime: Node 24.22.1 / npm 11.19.1, Windows x64. Existing working-tree changes outside this slice
were preserved. The modified application owner is DesignBasisPanel only; shared controls, Materials,
package kernels and report builders were not edited for this task.

| Gate | Outcome |
|---|---|
| `npm run check:structure`, `npm run typecheck` | passed |
| Focused `packages/pm-design/test` tests | 4/4 passed |
| `npm test` | passed: 483 unit tests, 5 AdSec tests, CAD, project round trip, independently recalculated fibre/block/demand workbooks and deterministic/Unicode preview PDF |
| `npm run build` | passed |
| `npm run check:web-bundle` | passed: initial 344.6/375 KiB, Plotly 1325.4/1400 KiB, worker 81.3/120 KiB, Excel 248.1/300 KiB gzip |
| Production browser | all nine profile/mechanics cases passed in light/dark and narrow layouts; no page errors |
| Publication and ownership | active spiral phi edits preserve Materials cap/class/reason and inactive phi exactly; missing-reason edits remain unpublished; character-by-character reason entry survives state echoes; returning to Resistance does not repeat the populated reason |
| Navigation invariants | exact canonical input and retained surface identity for all nine cases; zero navigation-triggered `buildSurface` jobs |
| `git diff --check` | passed |

Measured numeric inputs in Resistance:

| Profile | Numeric inputs |
|---|---|
| KDS Main body, either mechanics | active phi-c, phi-t, fixed strain limit, grade threshold, high-strength multiplier (5) |
| KDS Appendix, either mechanics | declared minimum-eccentricity constant and depth factor (2) |
| ACI | active phi-c, phi-t, strain increment (3) |
| EN | none; material factors remain in Materials (0) |
| AS | active phi-o and pure-tension phi (2), plus its class selector |
| Legacy Custom, either mechanics | active phi-c, phi-t and strain increment (3) for the tested yield-plus-strain rule; its existing rule selector remains available |

Permanent harness: `tools/verification/resistance-inputs/browser.mjs`. Ignored evidence is under
`outputs/resistance-inputs/` and `outputs/resistance-inputs-*.log`, including exported fixtures,
light/dark/narrow screenshots and `browser-evidence.json`. Browser runs used a local production
server on port 3002. Build/browser execution used the same sandbox escalation required by prior UI
checks. Initial harness failures concerned unit suffixes and help/option text in field-label
matching; those locators were corrected without changing product labels, expected values or gates.

No engineering equation, factor/default, numerical tolerance, baseline, schema, workbook format or
report eligibility was changed. These UI checks do not certify a design-code profile or release an
engineering result. Independent numerical/code-profile release gates remain outside this slice.
