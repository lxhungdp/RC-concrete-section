# Current-State Assessment and Roadmap

Assessment date: **2026-08-04**.

This file describes implemented capability, not certification. Exact model formulas and defaults are
in [`../12-calculation-models-defaults-and-workflows.md`](../12-calculation-models-defaults-and-workflows.md).

## 1. Capability matrix

| Area | Implemented now | Remaining gate |
|---|---|---|
| Project | every persisted calculation contract is v1; canonical exports contain profile, geometry, materials, factored loadings, model-specific options, and DesignBasis; exact canonical round trip; documented parser-v1 defaults | accepted-result artifact and signed release metadata |
| Profile selection | one Materials selection atomically binds KDS stress-strain, KDS block, ACI block, or either `Custom` mechanics and defaults; the profile table is the single owner of mechanics/material-standard/resistance-profile coherence | add only edition-scoped profiles with independent review evidence |
| Geometry | multiple solids/holes, rebars, exact properties, clipping, triangle/quadrature mesh | complete production topology/cover acceptance UX |
| Materials | persisted concrete/steel definitions, compiled stress/tangent laws, material support gates | finish independent curve verification for every declared scope |
| Stress-strain kernel | prepared mesh, 25-state default, nine code-aware transition nodes, 36-direction seed, adaptive angular refinement, full fields, inverse Newton | accepted-result numerical-uncertainty gate and larger independent oracle set |
| Equivalent-block kernel | standard-independent exact clipping, forward evaluator, exact-refined inverse solvers, bar-event/adaptive surface, rupture/admissibility, block field | independent clause calculations and additional commercial cross-checks |
| KDS block adapter | KDS 14 20 20 parameter table, `a=beta1 c`, block stress, KDS phi transition and axial cap | named structural-code review and release status above draft |
| ACI block adapter | ACI 318-19(22) beta1, Whitney stress, phi transition and axial cap | named structural-code review and release status above draft |
| Custom block adapter | user-declared beta1/block stress/epsCu, either transition rule shape, elastic-perfectly-plastic, bilinear or tabulated steel; unit-tested to reproduce the ACI and KDS adapters exactly when given their parameters | none — it is `user-defined` by construction and is never promoted |
| Resistance | Nominal/Design separation, global-factor and design-material formats, single ledger scaling, axial cap | accepted-result/profile certification workflow |
| Demand | explicit `factoredULS`, governing 3D proportional ray, secondary fixed-P diagnostic | immutable accepted check artifact and batch governance |
| Results | 3D surface, fixed-P and vertical slices, model-specific fields/evidence | final accepted-result-only presentation rules |
| Report/export | stress-strain and equivalent-block formula-audited result workbooks; stress-strain mesh Excel/DXF; a format-neutral `ReportModel` and a deterministic, vector, watermarked preview PDF with per-combination detail selection | immutable accepted result, **released** PDF, and cryptographic result identity |
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
- Project versioning is the single pre-release v1 family: document, DesignBasis, analysis options,
  methods, and named schedules are all v1. No migration or backward-compatibility work is carried.
  Omitted-field defaults are explicit parser-v1 behavior.
- Nominal resistance, Design resistance, and factored Demand are different DTO stages and UI terms.
- KDS `P0` is now a code reference point; the high-strength flexural surface closes on its
  eta-reduced physical compression limit, eliminating an unsupported interpolation band.
- Declared steel rupture strain is enforced in the block surface and inverse result; cap-face states
  are explicitly marked strain-unevaluated.
- Failed exact block refinement is `mesh-fallback`, never reported as converged, and equilibrium
  residuals are computed from the exact response rather than reconstructed by identity.
- Validated maximum sampling sizes and imported polygon extents use reduction loops rather than
  argument-spread extrema, avoiding engine stack limits.
- The equivalent-block backend is selected by mechanics, not by excluding one profile id, so a newly
  added fibre profile can no longer fall through to a block adapter.
- Both result surfaces declare their `mechanics`, so a consumer never re-derives it from a method id.
- The governing design check is composed onto an inverse state in one place, so a second consumer
  cannot publish the fixed-P diagnostic where the governing utilization belongs.

## 3. Open consistency hazards found by the documentation audit

- **Equivalent-block `My` sign boundary:** the project-v1 DTO only names `My`; it enforces no
  formula. Stress-strain uses `My = +sum(F*x)`, block uses `My = -sum(F*x)`, and the bridge/UI pass
  both through unchanged. Nonzero-`My` block checks, especially asymmetric sections, remain
  blocking preview output until one convention or an explicit transform is regression-tested.
- **Equivalent-block workbook:** closed. `@pm/report/equivalent-block.ts` publishes the block
  ledger — clipped polygon with a shoelace reconciliation, `c`, `a`, `beta1`, block area/centroid,
  the bar ledger, the resistance stage and the solver evidence — and `npm run test:excel-block`
  recalculates it in an independent formula engine against the kernel.

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

1. **Cross-kernel sign contract is unresolved.** Stress-strain and block use opposite `My` signs;
   the neutral v1 project DTO/bridge does not map between them.
2. **No accepted-result contract.** Preview surface/check DTOs are not a signed, immutable design
   artifact with complete input and implementation hashes.
3. **Profiles remain draft for release purposes.** Clause-level unit tests exist, but independent
   calculations and named discipline review are not complete.
4. **Numerical uncertainty is not yet an acceptance gate.** Surfaces expose evidence, but the
   product does not yet prevent report release after a missed tolerance or unresolved cap.
5. **Geometry/material verification matrix is incomplete.** More topology, high-strength,
   multi-material, and property-based cases are required.
6. **Final report release is incomplete.** Both Excel workbooks and the PDF are audit previews. The
   PDF is deterministic and structurally verified, which is what a result-identity hash over it
   would need, but it is generated from a preview result: the accepted-result gate, the provenance
   signature and the approval fields remain open, and the watermark says so on every page.

## 6. P1 engineering and architecture work

- add progress/cooperative-cancellation checkpoints to expensive production builds;
- add targeted refinement around the governing demand intersection and report utilization drift;
- define an immutable result identity covering canonical inputs, options, profile, package versions,
  effective sampling, warnings, and solver evidence;
- extend independent analytical and commercial-program comparison fixtures for both mechanics;
- finish model-specific Results field presentation and report tables without duplicating formulas in
  React or workbook code;
- drive a second output format from the existing `ReportModel` rather than a second renderer;
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
