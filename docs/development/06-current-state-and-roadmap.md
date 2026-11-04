# Current-State Assessment and Roadmap

Implementation map: **2026-11-04**. Status: **Stage 1 cross-section Preview**.
This map records capability and remaining gates, not release approval. Engineering meaning remains
in the control-map authorities. Historical task packets are dated evidence for their recorded
working tree/runtime rather than a substitute for fresh verification.

## 1. Implemented capability

| Area | Current owner and capability | Remaining acceptance boundary |
|---|---|---|
| Project | `@pm/project`: canonical v3 with load reference/stored As; v1 diameter-only and v2 centroidal readers; DesignBasis v3/options v1 are separate contracts | immutable result identity and complete provenance |
| Selection | one profile registry binds mechanics, material standard, resistance profile and options | exact-edition independent profile review |
| Geometry | shared topology, identity, full bar-disk/overlap gates; exact boundary, properties, quadrature; source-bound mesh and resource preflight | normalization/source mapping, persisted region parents and code-specific detailing |
| Materials | validated compiled laws/tangents, consistent effective yield data, finite evaluation and endpoint hardening | complete clause/physical-validation matrix |
| Stress-strain | prepared mesh, exact-support states, independent Fixed/Adaptive sampling, forward/Newton and field/audit DTOs | integration/utilization uncertainty and independent reference coverage |
| Equivalent block | separate clipped-polygon kernel/adapters, independent sampling, inverse and admissibility | complete inverse coverage and independent profile qualification |
| Resistance | retained reference ledger, exactly one global-factor or design-material route, geometric axial clipping | verified profile and accepted-result gating |
| Demand | factored ULS, default proportional 3D or declared Constant-P basis, common three-state classification | immutable accepted checks and targeted error verification |
| Results | neutral contracts/audit assembly in `@pm/results`, separate constitutive owners, indexed surfaces, connected Fixed-P paths and exact-beta inspection | accepted/current/stale history and topology certification |
| Units | presentation-only `@pm/units`; canonical mm/N/MPa/N mm through workers and kernels | released-report qualification |
| Reinforcement | stored diameter/As, one-time Equation/Catalog fills and source snapshots | qualified normative catalogs and code detailing |
| Reports | independently recalculated workbooks, shared deterministic preview-PDF model, mesh/point/trace exports | accepted-result eligibility, hashes/signatures and approval |
| Execution | shared worker/fallback use cases, worker-owned handles, bounded LRU reuse, termination/replay, disposable cancellable JSON-import worker and lazy exports | cooperative checkpoints and complete time/peak-memory budgets |

## 2. Sampling and query status

Fixed defaults to `unified-27-v2`, 27 states by 36 directions. Endpoint hardening can add its
material-derived layers; axial clipping adds geometric points. Adaptive is independent, with
per-meridian refinement and indexed topology; unequal rows are never paired by array ordinal.
Root 05/06/12 and the project registry own actual seeds, limits and convergence evidence.

Every Fixed verdict uses the project-selected 2% screening policy in engineering/05 section 4.
Its measured scope is stress-strain proportional sampling. The use for block, finite-hardening
and Constant-P cases is explicitly unvalidated; it is not a universal capacity-error bound.
Adaptive remains indeterminate when either station or direction convergence fails.

The Fixed-P repair preserves triangle-cut adjacency, separate loops and cap perimeters. The block
Adaptive repair retains the combined facet estimator and original resource limits. Two documented
KDS finite-steel/pole intervals remain CHECK with explicit `state-stalled` evidence; they need a
separately reviewed admissible continuation. Two pre-existing AS hollow proportional exact inverse
cases remain unavailable physical states. Surface convergence does not remove those limitations.
See [the repair packet](../task-packets/2026-11-04-fixed-p-adaptive-repair.md).

## 3. Package and input boundaries

The mechanics remain independent. `@pm/results/contracts` owns common DTOs; `@pm/results/audit`
assembles existing trace operands without selecting a material law or resistance policy. Existing
`@pm/analysis` public exports remain available. Direct dependencies belong in the consumer manifest;
hoisting is not an ownership contract.

Public preparation rejects another section's mesh. Compilation rejects invalid or contradictory
parameters and finite arithmetic boundaries are explicit. JSON byte/entity, geometry and material
preflight runs before expensive topology/compilation. These are software work bounds, not accuracy
or engineering applicability limits. See the audit-remediation packet for current evidence.

## 4. Remaining release gates

1. **Result integrity:** immutable scenarios/results, dependency/profile identity, canonical hashes,
   current-state match and signed release metadata remain incomplete.
2. **Design-code verification:** implemented profiles remain draft/user-defined; independent
   calculations, exact-edition applicability and named structural review are not release-qualified.
3. **Numerical uncertainty:** integration refinement, targeted demand-utilization verification and
   combined uncertainty are not complete accepted-result gates.
4. **KDS Appendix interpretation:** resultant-direction minimum eccentricity has not received
   independent sign-off against separate principal-axis application for every sign combination.
5. **Geometry/material matrix:** normalization, region assignment, thin-feature/multi-material
   acceptance, detailing and complete invariant/physical-validation evidence remain incomplete.
6. **System/report release:** cooperative cancellation, full memory/time limits, immutable history,
   renderer eligibility, signatures and named residual-risk acceptance remain open.

Passing an aggregate command cannot promote Preview, a draft profile or a diagnostic inverse to
accepted/released engineering output. Gate identities and approvals remain in engineering/06/root 09.

## 5. Verification entry points

`npm run lint` runs source/architecture, documentation, traceability and TypeScript gates. `npm test`
adds owner/application tests, ADSEC/CAD, project round trips, independent workbook recalculation and
preview-PDF data/reproducibility checks. Numerical work also runs `bench:strain-sampling`,
`bench:equivalent-block`, `bench:pipelines`, `bench:sampling-modes`, the declared-runtime fingerprint
and `verify:p16`. Build/bundle and dependency advisory gates are separate system checks.

Exact fingerprint replay requires the recorded runtime/platform. Portable replay retains exact
structure/state data and only the approved resultant-roundoff allowance. P16 retains its archived
v1 input, compares through the documented canonical export boundary and retains external numbers.

## 6. Change records

- [Programming-audit remediation](../task-packets/2026-11-04-programming-audit-remediation.md)
- [Fixed-P and Adaptive repair](../task-packets/2026-11-04-fixed-p-adaptive-repair.md)
- [Hardening implementation](../task-packets/2026-11-03-reinforcing-steel-post-yield-plan.md)
- [Constant-P basis](../task-packets/2026-11-04-constant-p-check-basis.md)
- [Demand verdict matrix](../task-packets/2026-11-04-demand-verdict-matrix.md)
