# Before-axial-cap curves and capacity fields

Status: implemented and regression-checked, Preview only. User-authorized on 2026-10-29.

## Task packet

- Objective: show the Design resistance excluded by Pmax as same-colour dashed curves and resolve
  a cap-governed NG field on the same checked load ray at the physical Design boundary before cap.
- Change class: 3, diagnostic query/result and chart pipeline. Requirements: ENG-AN-003,
  ENG-LOAD-001, ENG-RES-001; root 04 section 10, root 05 sections 9-10 and engineering/05.
- Owners: root 05 and 04 first, engineering/05, development/04; stress-strain capacity-field
  resolver, equivalent-block bridge, retained pre-cap geometry, ResultsWorkspace chart adapters.
- Input: immutable current surface, its original pre-cap Design dataset/topology and the checked
  three-component demand. Distinguish demand direction, strain beta and the actual zero-strain NA.
- Output: diagnostic pre-cap geometry and a qualified capacity field with explicit before-cap
  evidence when Pmax is exceeded. The field marker and governing cap crossing remain separate.
- Invariants: no change to capped vertices/topology, UR, uncertainty interval, classification,
  cap/factor/material settings, demand-equilibrium selection, or retained governing capacity point.
  The dashed geometry is reduced Design resistance, never the Nominal dataset.
- Blocking failures: missing original pre-cap dataset, non-finite input, missing ray crossing,
  non-convergence, material inadmissibility, or unresolved field evidence. Never invent a field
  from projected/faceted strain planes or the last unsuccessful iterate.
- Verification: original KDS-REAL-05 cases 1 and 2, both Fixed/Adaptive where supported, scaled
  proportional rays, cap enabled/disabled and both mechanics. Replay physical resultants with
  independent scalar concrete/steel arithmetic or independent exact rectangular-block arithmetic;
  prove stored governing checks and capped geometry do not change. Check clipped curve crossings,
  dashed-only excluded portions, same trace colour, and distinct field/check markers.
- UI QA: demand/direct-beta and Capacity plots, labels/visible note, OK/cap-NG transitions,
  stress/strain, light/dark, narrow layouts, units and unavailable-field failures.
- Runtime contract impact: additive diagnostic datasets/field evidence only; no persisted project
  schema, governing check or report acceptance change. Existing reports remain Preview.
- Exclusions: new cap equilibrium model, new constitutive law, normative factor/profile changes,
  SLS/member analysis, sampling/tolerance changes, release promotion and unrelated dirty files.

The earlier cap-face-unavailable limitation in development/12 and development/13 is superseded
only for a qualified pre-cap physical field. The cap face itself still has no assigned strain.

## Verification

The owning changes are:

| Owner | Contract/change |
|---|---|
| `packages/pm-analysis/src/index.ts` | Retain the original pre-cap Design dataset/topology and exact meridian; discriminate available field boundary evidence. |
| `packages/pm-analysis/src/capacity-field.ts` | For a cap-face crossing, seed/refine against the retained physical pre-cap Design boundary on the same demand ray; preserve the capped check. |
| `packages/pm-analysis/src/loadcase-field.ts` | Carry/validate the explicit before-cap qualification for NG; preserve demand equilibrium selection for non-NG. |
| `packages/pm-equivalent-block/src/surface.ts` | Retain the original low-level surface when clipping; do not alter clipped vertices or topology. |
| `packages/pm-analysis-equivalent-block/src/index.ts` | Convert the retained original geometry and use the existing block ray solver for a separate qualified field; preserve the capped solver/check slots. |
| `packages/pm-analysis/src/axial-cap-display.ts` | Clip already sampled diagnostic paths geometrically at Pmax, including exact linear edge crossings; no extrapolation or strain interpolation. |
| `ResultsWorkspace.tsx`, `workspace-chrome.css` | Same-colour dashed excluded curves in P-M, Fixed-P and 3D; distinct field/check markers, explicit label/note, full badge wrapping and existing NG tint. |

- `npm test` passes: structure, strict TypeScript, 401 unit tests, independent-source audit, CAD,
  project round trip, both mechanics' Excel audits, demand-check workbooks and Preview PDFs.
- New success/failure evidence includes the unchanged original ULS-1/ULS-2 cases, Fixed/Adaptive
  modes in both mechanics, demand scaling, cap disabled, missing pre-cap geometry, malformed
  before-cap evidence, exact excluded-edge clipping and unavailable fields without a fallback.
- Independent scalar concrete/steel/displaced-concrete sums replay the stress-strain field on
  the same integration fibres. Independent half-plane clipping, polygon area/first moments and
  bar arithmetic replay the rectangular equivalent-block field. These are resultant checks, not
  independent geometry/mesh validation, a general uniqueness proof or code-profile approval.
- The original ULS-2 UR remains exactly `1.4115695666188057`; its governing cap point remains at
  `P = 17670345.61548323 N`. The separate qualified physical field is at approximately
  `P = 18846162.20130783 N`. ULS-1 retains its permitted physical boundary field. Queries preserve
  the complete stored surface and governing check; disabling the cap reproduces the retained
  pre-cap Design dataset, not the Nominal dataset.
- `bench:strain-sampling`, `bench:equivalent-block` and `bench:pipelines` pass. The approved
  `bench:verify:portable` replay passes using the retained reference Node 24.20.0/npm 11.19.0
  runtime: 17 cross-platform resultant roundoff deviations, worst section-normalized delta
  `4.957e-17`. This is portable equivalence, not an exact same-environment baseline replay.
  No baseline, numerical tolerance, code coefficient or governing check was changed.
- Production build and `check:web-bundle` pass on Node 24.22.1/npm 11.19.1. Initial JavaScript
  is 374.9/375 KiB gzip; the worker is 119.8/120 KiB. No budget was raised or dependency added.
- Production browser evidence covers the original cases plus cap-controlled and zero rays in
  both mechanics, Demand-theta and Direct-beta, dashed-only excluded ordinates and same colour,
  distinct markers, qualified field-map requests, cap enabled/disabled, stress/strain, both themes,
  900px/360px layouts, full label wrapping, unit round trips without recalculation, and field-module
  failure injection retaining the governing curves/check. No browser errors were observed.
  The previous axial-case harness assumption that no field could exist was replaced by the
  actual qualified strain-gradient availability rule; the zero-ray assertion correctly checks
  the absent boundary multiplier rather than treating its zero-resultant slot as a crossing.
- Logs are under ignored `outputs/case-12-field/`; new browser DTOs/screenshots are under
  `outputs/before-axial-cap/`, with the general demand regression under `outputs/demand-field-basis/`.
  Harness: `tools/verification/before-axial-cap/browser.mjs`. The earlier investigative findings
  in `outputs/case-12-field/findings.md` describe the pre-change early-return behaviour.

No persisted project schema, permitted resistance, report classification or release status changed.
Missing/non-converged/inadmissible physical fields remain unavailable. Equivalent-block non-NG
demand equilibrium remains unsupported as recorded in development/13. Named independent structural
review and accepted-result/released-report gates remain open; the evidence above is Preview V&V.
No skill definition or adapter was changed and no new cross-agent CLI-discovery claim is made.

## Presentation refinement

On 2026-10-29 the user requested continuous dotted lines for the excluded Design curves and a
small filled blue field-intersection marker matching the red demand point. This is Class 1
presentation only: `ResultsWorkspace.tsx` uses Plotly `dot` for the pre-cap overlays, a filled
circle of the same size as the red demand marker (10 px in 2D, 7 px in 3D), and an updated legend.
The governing cap-crossing marker remains distinct. No coordinates, physical states, UR, check,
schema or mechanics contract changes. The production browser harness checks the line pattern,
matching colour, filled symbol and equal marker size. `npm test` (401 unit tests plus the existing
application/export checks), production build and the web-bundle gate pass. The production browser
harness passes both mechanics, both themes and narrow layouts with the `dot` pattern and filled
equal-size marker. An initial browser attempt hit a temporarily missing production manifest;
restarting the test server after the manifest was present resolved it without a source change.
Logs and screenshots for this presentation refinement are under `outputs/before-cap-style/`.
Numerical benchmarks were not repeated for this presentation-only change; the prior numerical
evidence above remains applicable because no mechanics or query arithmetic changed.
