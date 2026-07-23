# Verification, Acceptance, and Change Control

## 1. Evidence types

- **Requirements verification** checks implementation against written requirements.
- **Code verification** checks equations and algorithms against analytical/independent oracles.
- **Solution verification** estimates numerical error for one run.
- **Validation** establishes adequacy of the selected model over its claimed engineering range.
- **Design-code verification** checks exact clauses, choices, limits, and examples for one profile.

These evidence types are complementary. Unit tests are not validation; mesh convergence is not
design-code verification; agreement with one spreadsheet is not proof of general correctness.

## 2. Minimum verification matrix

The release evidence covers combinations of:

- rectangles, circles/annuli, concave sections, holes, thin ligaments, asymmetric and multi-region
  inputs within supported scope;
- symmetric/asymmetric reinforcement, grades, ratios, and material breakpoints;
- pure compression/tension/bending and general biaxial combinations;
- compression-controlled, transition/balanced, and tension-controlled states;
- principal/non-principal angles, cap faces, near-tangent rays, and surface edges/vertices;
- preview/design/verification numerical profiles and resource limits;
- translations, rotations, reflections, scaling, input ordering, and unit conversions.

Each test declares its oracle: analytical, independent implementation, authoritative example,
published benchmark, experimental validation, or approved regression fixture.

## 3. Release gates

| Gate | Required outcome |
|---|---|
| A — specification | scope, conventions, equations, profile, output meaning, and acceptance policy approved |
| B — input kernels | geometry, material, loading, schema, and migration contracts verified |
| C — mechanics | forward resultants, tangents, scaling, integration, and invariants verified |
| D — resistance/checks | strain domains, resistance sequencing, adaptive surface, topology, utilization, and uncertainty verified |
| E — design code | clause trace, exact edition/method, examples, applicability, anti-double-reduction tests, and independent structural review pass |
| F — system/report | workers, cancellation, reproducibility, security, performance, Results UI, Excel/PDF, and stale-state controls pass |
| G — release | regression, residual-risk acceptance, semantic version, evidence bundle, migration and rollback plan approved |

Failure of a required gate blocks the affected accepted-result/released-report capability.

## 4. Review independence

At minimum, evidence names:

- implementation author;
- independent software/numerical reviewer;
- independent qualified structural engineer familiar with the exact design standard;
- release approver responsible for evidence completeness.

The author of a design-code rule is not its sole verifier.

## 5. Requirement traceability

Maintain a machine-readable relationship:

```text
requirement ID
  -> engineering document/section
  -> package/API symbol
  -> verification test and fixture
  -> evidence artifact
  -> reviewer/status/version
```

No calculation rule may exist only in UI code, a spreadsheet cell, a comment, or a snapshot.

## 6. Change classes

| Class | Example | Minimum re-verification |
|---|---|---|
| 1 | wording/style with no engineering meaning | documentation/link checks |
| 2 | refactor/performance expected to be result-identical | affected unit/integration/regression and reproducibility checks |
| 3 | numerical algorithm, tolerance, dependency, schema, or pipeline behavior | kernel, convergence, structural matrix, migration, and differential suites |
| 4 | mechanics, material, utilization, design-code rule, report classification | all affected gates plus new structural/code review and validation impact |

Unexplained full-precision result drift is Class 4 until resolved.

## 7. Per-run acceptance

An `acceptedResult` requires:

- valid, supported, immutable inputs;
- verified selected profile for the declared use;
- all numerical dimensions converged within expanded options;
- valid surface topology/orientation and consistent demand query;
- uncertainty-aware classification;
- complete provenance and no blocking issue;
- result hash and current-state match.

Resource exhaustion, cancellation, warning-only continuation after a fatal invariant, or use of a
draft profile cannot produce an accepted result.

## 8. Current repository release state

The repository is before Gate B. Geometry and material input slices are implemented previews, while
their production validators and test matrices are incomplete. No design-code profile, analysis
surface, result package, or report renderer is currently eligible for engineering acceptance.

This statement changes only through evidence-backed change control, not when a menu or formula is
first implemented.
