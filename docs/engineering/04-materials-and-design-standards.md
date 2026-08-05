# Materials and Design-Standard Rules

## 1. Hierarchical user selection, one coherent resolved profile

The Materials page exposes `Code -> calculation method -> concrete model`. Each lower choice is
restricted by the selected Code's capability registry, so the user cannot create an accidental
combination of mechanics, material law, standard, factors, and analysis defaults. Internally, the
selection still resolves four separate objects:

1. serializable concrete and steel material definitions;
2. compiled runtime material evaluators;
3. the calculation mechanics and matching analysis-options DTO;
4. the edition-specific DesignBasis and code adapter.

The UI simplicity does not collapse these responsibilities in code. A material tag alone is never
proof of a complete standard check.

`Custom` is not a design Code. A user curve is a concrete-model choice under an applicable Code and
marks that profile modified; legacy custom profile IDs remain readable for schema-v1 compatibility.

## 2. Implemented calculation profiles

| User profile | Mechanics | Concrete resistance | Resistance treatment |
|---|---|---|---|
| KDS 2024 - Stress-strain integration | full stress-strain integration | KDS concrete curve at integration points | KDS global resultant factor and cap |
| KDS 14 20 20 - Equivalent rectangular block | exact clipped block `a=beta1 c` | `eta 0.85 fck` in the active block | KDS global resultant factor and cap |
| ACI 318-19(22) - Whitney equivalent block | exact clipped block `a=beta1 c` | `0.85 f'c` in the active block | ACI state-dependent phi and cap |
| EN 1992-1-1:2004 - Stress-strain preview | full stress-strain integration | EN parabolic-rectangular design law | material-strength reevaluation; no global phi |
| AS 3600:2018 Amd 1-2 - Equivalent rectangular block preview | exact clipped block `a=gamma c` | `alpha2 f'c` in the active block | AS Table 2.2.2 action/state-dependent capacity factor |

The AS route produces preview surfaces, demand checks, Excel workbooks and PDF reports. It is not a
released member-design implementation: section-shape reductions, slenderness, minimum eccentricity,
second-order effects and independent clause verification remain explicit release blockers.

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

Project schema v1 stores the selected calculation profile, material definitions, model-specific
analysis options, and DesignBasis. The target accepted-result/report contract exposes:

- characteristic/input and effective material values;
- calculation profile, standard document/edition, method ID, and verification status;
- transition-rule type and parameters;
- Nominal and Design resultants and contribution ledgers;
- phi classification, controlling tensile/yield strains, and tension-controlled limit;
- axial-cap status and actual surface refinement evidence.

All current persisted calculation code is v1 and there is no migration/backward-compatibility
layer. Within v1, the parser can derive a missing DesignBasis from material source and apply the
other defaults documented in the parser contract. This does not create another schema version or an
approved profile-selection workflow.

Current export boundary: the stress-strain result workbook exposes a subset of this evidence,
including `Design_Check`; the equivalent-block result workbook is not implemented and the UI blocks
that export rather than reusing the fiber ledger. Mesh Excel/DXF exports are likewise specific to
stress-strain integration.

## 8. Current status

The material laws, both numerical mechanics, and KDS/ACI adapters are implemented and tested as
preview capability. They are not a released design certification. Independent clause calculations,
commercial comparisons with matched assumptions, named structural review, accepted-result gating,
and report-release evidence remain required.

## 9. Acceptance gates

| ID | Gate |
|---|---|
| `ENG-MAT-001` | canonical schema/version, finite/range, reference, and model/profile consistency validation passes; any permitted v1 parser normalization is reported and tested |
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
