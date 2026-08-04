# Current-State Assessment and Roadmap

Assessment date: **2026-08-04**.

This file describes implemented capability, not certification. Exact model formulas and defaults are
in [`../12-calculation-models-defaults-and-workflows.md`](../12-calculation-models-defaults-and-workflows.md).

## 1. Capability matrix

| Area | Implemented now | Remaining gate |
|---|---|---|
| Project | version-locked schema v1; canonical exports contain profile, geometry, materials, factored loadings, model-specific options, and DesignBasis; exact canonical round trip | remove/formalize limited parser defaults; accepted-result artifact and signed release metadata |
| Profile selection | one Materials selection atomically binds KDS stress-strain, KDS block, or ACI block mechanics and defaults | add only edition-scoped profiles with independent review evidence |
| Geometry | multiple solids/holes, rebars, exact properties, clipping, triangle/quadrature mesh | complete production topology/cover acceptance UX |
| Materials | persisted concrete/steel definitions, compiled stress/tangent laws, material support gates | finish independent curve verification for every declared scope |
| Stress-strain kernel | prepared mesh, 25-state default, nine code-aware transition nodes, 36-direction seed, adaptive angular refinement, full fields, inverse Newton | accepted-result numerical-uncertainty gate and larger independent oracle set |
| Equivalent-block kernel | standard-independent exact clipping, forward evaluator, exact-refined inverse solvers, bar-event/adaptive surface, rupture/admissibility, block field | independent clause calculations and additional commercial cross-checks |
| KDS block adapter | KDS 14 20 20 parameter table, `a=beta1 c`, block stress, KDS phi transition and axial cap | named structural-code review and release status above draft |
| ACI block adapter | ACI 318-19(22) beta1, Whitney stress, phi transition and axial cap | named structural-code review and release status above draft |
| Resistance | Nominal/Design separation, global-factor and design-material formats, single ledger scaling, axial cap | accepted-result/profile certification workflow |
| Demand | explicit `factoredULS`, governing 3D proportional ray, secondary fixed-P diagnostic | immutable accepted check artifact and batch governance |
| Results | 3D surface, fixed-P and vertical slices, model-specific fields/evidence | final accepted-result-only presentation rules |
| Report/export | stress-strain formula-audited result workbook; stress-strain mesh Excel/DXF | equivalent-block result ledger, immutable accepted result, released PDF, and cryptographic result identity |
| Performance | worker protocol, prepared-analysis and block Design-surface caches, mesh/sampling/pipeline benchmarks | memory budgets, larger batches, cooperative cancellation checkpoints |

## 2. Closed hazards

- A Whitney law is no longer evaluated as a local fiber stress. Fiber/material requests for that law
  fail closed, while the ACI calculation profile routes to the implemented equivalent-block adapter.
- Missing steel references, empty concrete, mesh resource excess, and failed mesh self-checks are
  typed fatal errors.
- The former fixed 24-direction stress-strain default was replaced. Production now starts at 36
  directions and adaptively refines all 25 stations to a 0.5% angular chord target.
- The sparse design-factor transition was replaced by nine code-aware nodes. ACI and KDS transition
  limits are stored as different discriminated rules rather than one ambiguous increment.
- Project versioning was reset to the intended pre-release schema v1 and no version-migration work
  is carried. Limited omitted-field/default normalization remains in the active parser and is now an
  explicit cleanup decision rather than hidden compatibility behavior.
- Nominal resistance, Design resistance, and factored Demand are different DTO stages and UI terms.
- KDS `P0` is now a code reference point; the high-strength flexural surface closes on its
  eta-reduced physical compression limit, eliminating an unsupported interpolation band.
- Declared steel rupture strain is enforced in the block surface and inverse result; cap-face states
  are explicitly marked strain-unevaluated.
- Failed exact block refinement is `mesh-fallback`, never reported as converged, and equilibrium
  residuals are computed from the exact response rather than reconstructed by identity.
- Validated maximum sampling sizes and imported polygon extents use reduction loops rather than
  argument-spread extrema, avoiding engine stack limits.

## 3. Open consistency hazards found by the documentation audit

- **Equivalent-block `My` sign boundary:** project/stress-strain resultants use `My = sum(F*x)`;
  `@pm/equivalent-block` uses the local convention `My = -sum(F*x)`. The bridge currently does not
  transform it. Nonzero-`My` block checks, especially asymmetric sections, remain blocking preview
  output until a single explicit convention map and cross-kernel regression tests are implemented.
- **Schema-v1 strictness gap:** there is no version migration, but the parser currently defaults an
  omitted DesignBasis, stress-strain mesh, and concrete density; it also repairs an invalid default
  steel ID and ignores unknown extra properties. Canonical exports are complete. Decide whether to
  remove these paths for strict pre-release v1 or formally retain/document them as normalization.
- **Equivalent-block workbook:** Results blocks Excel export for the block route because the current
  workbook is a fiber/stress-strain ledger. A dedicated block area/centroid, `c`, `a`, `beta1`,
  steel, resistance-stage, admissibility, and solver-evidence workbook remains required.

## 4. Numerical evidence for the new stress-strain default

The permanent `bench:strain-sampling` harness uses five structural geometries and a
144-direction/33-transition-node reference:

| Configuration | Worst 3D demand-ray error | Points per surface | Measured build time |
|---|---:|---:|---:|
| legacy 19 x 24 fixed | 7.800% | 456 | 64-675 ms |
| 25 x 36 fixed | 1.791% | 900 | 172-1,874 ms |
| production 25 x 36 seed + adaptive | 0.521% | 1,400-2,500 | 456-8,865 ms |

All production runs reached the configured angular tolerance and found every sampled ray
intersection. The dense tall section exposes the cost clearly; performance work must preserve the
result fingerprints and convergence evidence.

## 5. Current P0 blockers before engineering release

1. **Cross-kernel sign contract is unresolved.** The equivalent-block `My` convention is not yet
   mapped to the project convention.
2. **No accepted-result contract.** Preview surface/check DTOs are not a signed, immutable design
   artifact with complete input and implementation hashes.
3. **Profiles remain draft for release purposes.** Clause-level unit tests exist, but independent
   calculations and named discipline review are not complete.
4. **Numerical uncertainty is not yet an acceptance gate.** Surfaces expose evidence, but the
   product does not yet prevent report release after a missed tolerance or unresolved cap.
5. **Geometry/material verification matrix is incomplete.** More topology, high-strength,
   multi-material, and property-based cases are required.
6. **Schema-v1 parsing is not fully strict.** Limited omitted-field/default repair paths remain.
7. **Final report release is incomplete.** Stress-strain Excel is an audit preview; block Excel,
   accepted-result-only PDF,
   provenance signature, and render verification remain open.

## 6. P1 engineering and architecture work

- add progress/cooperative-cancellation checkpoints to expensive production builds;
- add targeted refinement around the governing demand intersection and report utilization drift;
- define an immutable result identity covering canonical inputs, options, profile, package versions,
  effective sampling, warnings, and solver evidence;
- extend independent analytical and commercial-program comparison fixtures for both mechanics;
- finish model-specific Results field presentation and report tables without duplicating formulas in
  React or workbook code;
- reduce large editor components without moving engineering ownership into UI helpers.

## 7. Rules that remain fixed

- one calculation-profile selection in Materials owns model/code/default coherence;
- the two numerical kernels remain independent and communicate only through common input/result
  contracts;
- stress-strain mesh controls never enter the equivalent-block DTO;
- standard-specific `beta1`, block stress, strain limits, phi rules, and caps live in code adapters or
  DesignBasis, never in the generic block kernel;
- all demand used by the governing check is factored ULS;
- every result-affecting default change updates code, tests, benchmarks, schema documentation, UI
  help, and report evidence in one change set.

## 8. Verification commands

```text
npm run typecheck
npm run test
npm run build
npm run bench:strain-sampling
npm run bench:equivalent-block
npm run bench:pipelines
npm run bench:verify
```

Passing these commands supports regression confidence. It does not replace structural-code approval
or justify changing a profile from `draft` to a released/verified design status.
