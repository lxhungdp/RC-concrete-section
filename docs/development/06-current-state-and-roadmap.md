# Current-State Assessment and Roadmap

Assessment date: **2026-08-04**.

This file describes implemented capability, not certification. Exact model formulas and defaults are
in [`../12-calculation-models-defaults-and-workflows.md`](../12-calculation-models-defaults-and-workflows.md).

## 1. Capability matrix

| Area | Implemented now | Remaining gate |
|---|---|---|
| Project | strict schema v1; profile, geometry, materials, factored loadings, model-specific analysis options, DesignBasis; exact round trip | accepted-result artifact and signed release metadata |
| Profile selection | one Materials selection atomically binds KDS stress-strain, KDS block, or ACI block mechanics and defaults | add only edition-scoped profiles with independent review evidence |
| Geometry | multiple solids/holes, rebars, exact properties, clipping, triangle/quadrature mesh | complete production topology/cover acceptance UX |
| Materials | persisted concrete/steel definitions, compiled stress/tangent laws, material support gates | finish independent curve verification for every declared scope |
| Stress-strain kernel | prepared mesh, 25-state default, nine code-aware transition nodes, 36-direction seed, adaptive angular refinement, full fields, inverse Newton | accepted-result numerical-uncertainty gate and larger independent oracle set |
| Equivalent-block kernel | standard-independent exact clipping, forward evaluator, inverse solvers, adaptive station/direction surface, block field | independent clause calculations and additional commercial cross-checks |
| KDS block adapter | KDS 14 20 20 parameter table, `a=beta1 c`, block stress, KDS phi transition and axial cap | named structural-code review and release status above draft |
| ACI block adapter | ACI 318-19(22) beta1, Whitney stress, phi transition and axial cap | named structural-code review and release status above draft |
| Resistance | Nominal/Design separation, global-factor and design-material formats, single ledger scaling, axial cap | accepted-result/profile certification workflow |
| Demand | explicit `factoredULS`, governing 3D proportional ray, secondary fixed-P diagnostic | immutable accepted check artifact and batch governance |
| Results | 3D surface, fixed-P and vertical slices, model-specific fields/evidence | final accepted-result-only presentation rules |
| Report | formula-audited Excel result and mesh exports | released PDF and cryptographic result identity |
| Performance | worker protocol, prepared-analysis cache, mesh benchmarks, sampling and pipeline benchmarks | memory budgets, larger batches, cooperative cancellation checkpoints |

## 2. Closed hazards

- A Whitney law is no longer evaluated as a local fiber stress. Fiber/material requests for that law
  fail closed, while the ACI calculation profile routes to the implemented equivalent-block adapter.
- Missing steel references, empty concrete, mesh resource excess, and failed mesh self-checks are
  typed fatal errors.
- The former fixed 24-direction stress-strain default was replaced. Production now starts at 36
  directions and adaptively refines all 25 stations to a 0.5% angular chord target.
- The sparse design-factor transition was replaced by nine code-aware nodes. ACI and KDS transition
  limits are stored as different discriminated rules rather than one ambiguous increment.
- Project versioning was reset to the intended pre-release schema v1. No migration or compatibility
  work is carried in the active parser.
- Nominal resistance, Design resistance, and factored Demand are different DTO stages and UI terms.

## 3. Numerical evidence for the new stress-strain default

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

## 4. Current P0 blockers before engineering release

1. **No accepted-result contract.** Preview surface/check DTOs are not a signed, immutable design
   artifact with complete input and implementation hashes.
2. **Profiles remain draft for release purposes.** Clause-level unit tests exist, but independent
   calculations and named discipline review are not complete.
3. **Numerical uncertainty is not yet an acceptance gate.** Surfaces expose evidence, but the
   product does not yet prevent report release after a missed tolerance or unresolved cap.
4. **Geometry/material verification matrix is incomplete.** More topology, high-strength,
   multi-material, and property-based cases are required.
5. **Final report release is incomplete.** Excel is an audit preview; accepted-result-only PDF,
   provenance signature, and render verification remain open.

## 5. P1 engineering and architecture work

- move expensive production builds fully behind worker/cache/progress controls;
- add targeted refinement around the governing demand intersection and report utilization drift;
- define an immutable result identity covering canonical inputs, options, profile, package versions,
  effective sampling, warnings, and solver evidence;
- extend independent analytical and commercial-program comparison fixtures for both mechanics;
- finish model-specific Results field presentation and report tables without duplicating formulas in
  React or workbook code;
- reduce large editor components without moving engineering ownership into UI helpers.

## 6. Rules that remain fixed

- one calculation-profile selection in Materials owns model/code/default coherence;
- the two numerical kernels remain independent and communicate only through common input/result
  contracts;
- stress-strain mesh controls never enter the equivalent-block DTO;
- standard-specific `beta1`, block stress, strain limits, phi rules, and caps live in code adapters or
  DesignBasis, never in the generic block kernel;
- all demand used by the governing check is factored ULS;
- every result-affecting default change updates code, tests, benchmarks, schema documentation, UI
  help, and report evidence in one change set.

## 7. Verification commands

```text
npm run typecheck
npm run test
npm run build
npm run bench:strain-sampling
npm run bench:pipelines
npm run bench:verify
```

Passing these commands supports regression confidence. It does not replace structural-code approval
or justify changing a profile from `draft` to a released/verified design status.
