# Materials and Design-Standard Rules

## 1. One user selection, separate internal responsibilities

The Materials page exposes one calculation-profile selector so the user cannot create an accidental
combination of mechanics, material law, standard, factors, and analysis defaults. Internally, the
selection resolves four separate objects:

1. serializable concrete and steel material definitions;
2. compiled runtime material evaluators;
3. the calculation mechanics and matching analysis-options DTO;
4. the edition-specific DesignBasis and code adapter.

The UI simplicity does not collapse these responsibilities in code. A material tag alone is never
proof of a complete standard check.

## 2. Implemented calculation profiles

| User profile | Mechanics | Concrete resistance | Resistance treatment |
|---|---|---|---|
| KDS 2024 - Stress-strain integration | full stress-strain integration | KDS concrete curve at integration points | KDS global resultant factor and cap |
| KDS 14 20 20 - Equivalent rectangular block | exact clipped block `a=beta1 c` | `eta 0.85 fck` in the active block | KDS global resultant factor and cap |
| ACI 318-19(22) - Whitney equivalent block | exact clipped block `a=beta1 c` | `0.85 f'c` in the active block | ACI state-dependent phi and cap |

The material compiler deliberately rejects an ACI Whitney definition in the fiber/stress-strain
kernel. That is a routing guard, not a missing ACI capability: the ACI calculation profile routes to
the separate implemented block adapter where `beta1` changes the physical block depth.

## 3. Material definitions

Every persisted definition is serializable and finite. It records stable ID/name, source standard,
model discriminant, all model parameters or curve points, elastic modulus where relevant, strain
limits, factor fields, compression-positive convention, and derivation provenance.

Do not independently edit contradictory values such as `fy`, `Es`, `epsY`, and curve yield points.
One authoritative value derives the others, or semantic validation proves agreement.

User curves require strictly increasing finite strain coordinates, explicit interpolation,
extrapolation/rupture policy, and deterministic one-sided tangent behavior at kinks. Invalid curves
do not fall back to a default law in an engineering calculation.

## 4. Concrete model distinction

A stress-strain law and an equivalent rectangular block are not interchangeable:

- stress-strain integration evaluates `sigma_c = f(eps_c)` throughout the concrete mesh;
- an equivalent block applies a constant code stress only inside `0 <= depth <= a`, where
  `a = beta1 c`, and zero outside.

The equivalent block is a resistance-level approximation of resultants. It must not be drawn as a
material stress-strain curve or extended through the full neutral-axis depth `c`.

## 5. Steel and transition rules

Steel behavior defines elastic response, yield/plateau or hardening, and ultimate strain when known.
The DesignBasis separately owns the strain at which the tension-controlled resistance factor is
reached:

```text
ACI 318-19(22): eps_t,limit = eps_y + 0.003

KDS current profile:
  fy <= 400 MPa: eps_t,limit = 0.005
  fy >  400 MPa: eps_t,limit = 2.5 eps_y
```

These are persisted as discriminated rules, not one shared `transitionExtraStrain`. The stress-strain
surface samples nine points from yield through the active rule's upper limit. Both block adapters use
the same profile-owned limits for phi evaluation and insert those nine events at the controlling
longitudinal bar for each neutral-axis direction.

For the block pipeline, a declared steel ultimate strain is a mechanical boundary, not descriptive
metadata. It must exceed yield strain, bounds surface/end-point states, and is checked against every
bar in an exact inverse result. A code axial-cap face is identified as strain-unevaluated because it
does not correspond to one unique neutral-axis state.

## 6. Nominal and Design resistance

For every ULS state:

1. evaluate and retain the Nominal/reference resultant ledger;
2. apply exactly one profile-declared resistance format;
3. apply the profile axial cap where enabled;
4. retain factor/classification/controlling-strain evidence with the Design point.

For global-resultant profiles, phi multiplies the complete `P-Mx-My` ledger once. It is not embedded
again in material stresses, and factored Demand is not reduced. For a design-material profile, the
same strain state is reevaluated with design material strengths instead of applying a global factor.

## 7. Persisted and reported evidence

Project schema v1 stores the selected calculation profile, complete material definitions,
model-specific analysis options, and complete DesignBasis. Reports expose:

- characteristic/input and effective material values;
- calculation profile, standard document/edition, method ID, and verification status;
- transition-rule type and parameters;
- Nominal and Design resultants and contribution ledgers;
- phi classification, controlling tensile/yield strains, and tension-controlled limit;
- axial-cap status and actual surface refinement evidence.

There is no schema migration or profile inference layer in the pre-release v1 project.

## 8. Current status

The material laws, both numerical mechanics, and KDS/ACI adapters are implemented and tested as
preview capability. They are not a released design certification. Independent clause calculations,
commercial comparisons with matched assumptions, named structural review, accepted-result gating,
and report-release evidence remain required.

## 9. Acceptance gates

| ID | Gate |
|---|---|
| `ENG-MAT-001` | strict schema, finite/range, reference, and model/profile consistency validation passes |
| `ENG-MAT-002` | compiled evaluators are deterministic over their declared domains and expose tangents/limits |
| `ENG-MAT-003` | stress-strain and equivalent-block routes cannot be mixed |
| `ENG-MAT-004` | standard identity, edition, applicability, parameters, transition rule, and cap are traceable |
| `ENG-MAT-005` | analytical, clause, transition, axial-cap, and independent comparison tests pass |
| `ENG-MAT-006` | contribution ledgers reproduce totals and anti-double-reduction tests pass |
| `ENG-MAT-007` | the result records actual sampling/convergence and cannot release after a failed gate |

Detailed formulas and defaults are in
[`../12-calculation-models-defaults-and-workflows.md`](../12-calculation-models-defaults-and-workflows.md);
resistance sequencing is in
[`../11-design-standards-and-resistance-formats.md`](../11-design-standards-and-resistance-formats.md).
