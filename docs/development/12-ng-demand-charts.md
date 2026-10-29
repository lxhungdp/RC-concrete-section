# Outside-Demand Charts and Capacity Fields

The all-case capacity-field display decision recorded here is superseded by
[the demand/capacity field correction](13-demand-field-basis.md). The numerical resolver and
outside-demand geometric plotting evidence below are retained as historical implementation evidence.

Status: implemented and regression-checked; Preview only. The user authorized this repair on 2026-10-29.

## Task packet

- Objective: retain complete geometric demand plots and stored utilization when inverse equilibrium
  is unavailable, including demands outside the resistance surface.
- Change class: 3, result presentation/query pipeline and diagnostic boundary-state refinement;
  no adequacy rule is to change. The boundary-state resolver requires independent forward replay,
  proportional scaling checks, poles, cap faces, invalid states and both resistance formats.
- Requirements: ENG-LOAD-001, ENG-AN-003, ENG-RES-001; plot semantics in root document 05,
  sections 8–10, and engineering/05 sections 3–4.
- Owners: root document 05 first; development/04; web ResultsWorkspace and its plot adapters.
  Existing @pm/analysis surface queries and governing check remain authoritative.
- Input: current immutable surface, canonical factored demand, composed inverse/check evidence.
  Demand theta is atan2(My,Mx); strain beta remains a distinct physical-state direction.
- Output: geometric Design/Nominal moment-plane paths, actual Fixed-P contours, checked-demand
  rays and stored governing crossing/UR regardless of inverse status; physical field only when
  an admissible state exists. Old demand/surface revisions must never be mixed.
- Blocking failures: stale evidence, missing surface/crossing, invalid topology, fabricated field
  states, clamped axial demand, angle substitution, non-finite plot ordinates, or changed UR/verdict.
- Oracles: analytical closed polyhedral slices/rays; existing independent moment-plane tests;
  production browser cases for inside/outside, axial/biaxial, both mechanics, units, and transitions.
  Existing numerical fingerprints and benchmark results must remain unchanged.
- Schema/provenance/report impact: no persisted contract or governing result changes. The transient
  inverse DTO gains typed optional capacity-field evidence. On-screen fields now inspect that
  physical boundary state; inverse diagnostic report contracts remain unchanged.
- Exclusions: replacing the governing capacity solver, extrapolated material fields, new screening margins, inferred
  neutral axes, code-profile changes, accepted-result promotion, and unrelated UI styling.

## Investigation

Before repair, ResultsWorkspace discarded the field frame when inverse.ok was false. Both Design and
Nominal vertical paths then return empty unless a valid inverse beta and exact meridian exist.
The composed result already retains the independent proportional Design crossing and UR. The
existing demand guides are orthogonal guides, not the origin-to-demand proportional path.
The @pm/analysis sliceMomentPlane query already implements the required topology-based vertical
slice; it does not require or construct an inverse strain state.

The two inverse routes have different objectives. Stress-strain calls
solveRawInversePreviewFromPrepared with the full demand and nominal/physical material evaluator;
it seeks R(q) = D. Equivalent block calls solveProportionalRayCapacity with the Design evaluator;
it seeks a boundary state and load multiplier, R_design(q_cap) = lambda_cap D. The latter field is
therefore a capacity state, including when the entered demand is outside the Design surface.
The former can have an admissible equilibrium above Design capacity because resistance reduction
separates Design from the underlying material response. Inverse failure alone does not prove NG.

Representative numerical investigation on 2026-10-29 uses the existing KDS-REAL-05 stress-strain
and ACI-EB-01 block fixtures. For each, a biaxial seed P=2 MN, Mx=800 MN mm, My=350 MN mm finds
one stored Design-ray crossing. Demands are then 0.5, 1, 1.2, 2 and 5 times that crossing. These
are diagnostic queries; the fixtures, material laws, options and baselines are not edited.

| Route | UR | Inverse converged/admissible | Maximum concrete strain | Vertical geometric slice |
|---|---:|---|---:|---|
| KDS stress-strain | 0.5 | yes / yes | 0.0006002002 | one path, 105 points |
| KDS stress-strain | 1.0 | yes / yes | 0.0013830908 | one path, 105 points |
| KDS stress-strain | 1.2 | yes / yes, despite Design inadequacy | 0.0018074220 | one path, 105 points |
| KDS stress-strain | 2.0 | no / no | 0.0034343488 > 0.0033 | one path, 105 points |
| KDS stress-strain | 5.0 | no / no | 0.0051639862 > 0.0033 | one path, 105 points |
| ACI block | 0.5–5.0 | yes / yes, same ray-capacity state | 0.003 within roundoff | one path, 124 points |

KDS UR=2 stops after four iterations with normalized residual 0.05926275; UR=5 stops after one
with residual 0.85261472. The iteration limit is 30, so increasing that limit alone cannot fix
these early stops. The loop can stop when the scaled tangent solve fails or no backtracked step
reduces residual. This investigation does not attribute a unique physical nonexistence proof to
either non-converged iterate. Full evidence is in ignored outputs/ng-demand-charts/investigation.json.

## Implemented repair

1. Separate governing Design check, demand equilibrium diagnostic, and physical capacity-field
   evidence in the result contract. NG must not gate geometric plots or stored UR.
2. Always retain the surface, demand markers, geometric demand-direction slice, proportional ray
   and its Design crossing. Keep Fixed-P at the actual Pu and state when that plane has no contour.
3. For capacity-field inspection, resolve a compatible boundary state through the owning mechanics
   and label it as Field at capacity. Do not present it as equilibrium at an outside full demand.
   Reuse the existing block capacity state; independently qualify the stress-strain boundary resolver.
   Interpolating facet strains or solving nominal equilibrium at the faceted Design
   crossing is not automatically the governing Design boundary state.
4. Direct beta curves remain available for an explicitly selected direction or a qualified physical
   capacity state. Keep beta distinct from the moment-plane theta used for the governing plot.
5. Geometric cap faces and genuinely unresolved physical states retain geometry/check evidence
   while explicitly marking strain, stress and a unique neutral axis unavailable. Do not fabricate
   a field or reinterpret a last iterate as a converged state.

The investigation itself changed no production code. The authorized implementation adds a lazy,
bounded diagnostic refinement while preserving material laws, existing inverse tolerances, stored
inputs and governing UR/classification. `capacity-field.ts` owns the new refinement;
`createCapacityFieldEvaluator` reuses the surface's constitutive and resistance owners. The existing
3x3 linear solve and normalized inverse limits move without arithmetic changes into internal
`linear-solve.ts` and `inverse-options.ts`. Uniform axial plateaus prefer the independently replayed
declared pole, rather than an arbitrary non-uniform state with identical resultants.

The transient field DTO distinguishes available states from zero demand, no crossing, axial cap,
non-convergence, inadmissibility, non-finite demand and field-evaluation failure. A faceted strain interpolation is never
published as a field. Its physical multiplier/resultants are separate from the unchanged stored
governing crossing and utilization. Block zero demand no longer calls a nonzero-ray solver; it
returns an explicitly unevaluated inverse diagnostic and the independent check retains UR=0.

## Verification evidence

- Focused owner and application cases pass for eight structural fixtures under KDS global factors,
  KDS design materials and EN design materials. Checks include forward Design-resultant replay,
  compatible strain/admissibility, positive proportional multiplier, inside/outside ray scaling,
  and unchanged governing check data.
- Independent uniform rectangle/steel force oracles pass for compression and tension. Cap faces,
  zero demand, absent topology, non-finite demand and an unusable refinement seed fail closed.
- Both-mechanics application tests retain physical capacity fields for UR=0.5, 2 and 5, even when
  full-demand stress-strain equilibrium fails. Field-map steel strains/stresses/forces remain
  finite and geometric moment-plane paths remain closed.
- Adaptive L-section tests cover all bending quadrants, zero/negative axial force, and omitted versus
  explicitly declared steel rupture data. They require an active actual concrete/steel limit. These
  cases caught a final-chord seed on a yielded plateau. The resolver now uses the existing c/D
  boundary when rupture is unspecified, qualifies the actual declared steel boundary otherwise,
  and seeds that finite interval with four bounded probes. It does not interpret the assumed
  uniform-tension pole strain as a material rupture limit or publish a merely interior state.
- Unchanged `bench:verify:portable`, `bench:strain-sampling`, `bench:equivalent-block` and
  `bench:pipelines` pass using the baseline's Node 24.20.0/npm 11.19.0 runtime. Official runtime
  archives were checksum-verified; test/build use Node 24.22.1/npm 11.19.1. No baseline or numerical
  tolerance was rewritten. The Windows portable comparison is not an exact macOS provenance claim.
- Final `npm test` passes: structure and strict type checks, 391 unit tests, five AdSec tests,
  11 CAD tests, project round trips, independently recalculated Excel/demand exports, and the
  reproducible preview-PDF checks. `npm run build` and `npm run check:web-bundle` pass. Compressed
  initial/worker bundles are 374.2/119.9 KiB against unchanged 375/120 KiB limits.
- The permanent production-browser harness, `tools/verification/demand-charts/browser.mjs`, passes
  inside, biaxial NG (UR=2 and 5), capped axial NG and zero-demand cases for both mechanics. It
  checks actual coloured field pixels, Demand-theta and Direct-beta curves, independent geometric
  crossing-on-curve distance, selected 3D load paths, unchanged stored results after a unit change,
  and a separately entered 17.5-degree inspection beta. Both themes and 900-pixel layout are captured;
  additional 360-pixel checks show no chart overflow and retain the standard joined controls.
- Blocking the actual lazy capacity-field chunk preserves the worker reply, UR=2, geometry and
  geometric Design crossing with typed `evaluation-error` field evidence and no uncaught browser
  errors. Worker/fallback use an explicit try/await/catch so both synchronous worker chunk-loader
  failures and rejected imports are contained. Independent field-map and exact-curve requests settle
  separately before committing one coherent visual frame.

The production browser served an isolated copy of the completed build under ignored outputs,
because other local builds can replace the shared `.next` directory. No production configuration
or development server was changed for this isolation. Evidence includes both numerical and browser
checks; it does not promote this Preview implementation to an accepted result or released report.

Remaining limits are explicit: a cap face or unresolved physical state has no manufactured field;
an actual Pu outside the axial range has no Fixed-P Design contour; a zero ray has no capacity
crossing or unique physical direction. Existing report ledgers continue to show their original
inverse diagnostics. No persisted schema, material law, code profile, governing surface, UR or
adequacy rule is changed by this repair.

Detailed logs, browser evidence and screenshots are under ignored `outputs/ng-demand-charts/`.
This is scoped verification of Preview behaviour, not design-code validation or release acceptance.
