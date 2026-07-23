# 09 — Verification, Validation, and Release Gates

This quality plan is aligned with the concepts of ASME V&V 10 for computational solid mechanics and
IEEE 1012 for system/software V&V. Alignment is not a claim of formal certification.

## 1. Required terminology

- **Requirements verification:** did each implementation artifact satisfy its written requirement?
- **Code verification:** were the mathematical models and algorithms implemented correctly?
- **Solution verification:** how large is the numerical error for this particular calculation?
- **Validation:** does the mathematical/modeling representation adequately represent the intended
  physical/design application over the claimed range?
- **Uncertainty quantification:** what uncertainty remains in inputs, model form, experiments, and
  numerical solution?

Passing unit tests is not validation. Mesh convergence is not design-code verification. Agreement
with one workbook is not proof of physical validity.

## 2. Integrity and independence

Treat certified ULS adequacy as high-integrity engineering output. At least these roles are required:

- implementation author;
- independent software/numerical reviewer;
- independent licensed/qualified structural engineer for mechanics and code mapping;
- release approver responsible for evidence completeness.

One person may develop multiple parts, but the person who implements a design-code rule shall not be
the sole verifier of that rule.

## 3. Requirements traceability

Maintain a machine-readable matrix:

```text
Requirement ID -> specification section -> implementation symbol
               -> verification tests -> evidence artifact -> reviewer/status
```

Required requirement families:

- scope and exclusions;
- units/sign/reference frames;
- geometry topology and exact properties;
- material laws and extrapolation;
- forward equilibrium and tangent;
- ultimate strain domain;
- design-code reduction/caps;
- adaptive surface and topology;
- adequacy/utilization;
- error budget;
- API failure behavior, performance, security, and reporting.

No orphan code rule or untested requirement is allowed in a release candidate.

## 4. Code-verification test pyramid

### 4.1 Analytical unit tests

- polygon area, centroid, and inertia for rectangles, triangles, and regular shapes;
- linear elastic homogeneous section resultants/tangent;
- single- and two-fiber exact cases;
- piecewise material interpolation, slopes, kinks, rupture, extrapolation;
- origin transformation and axis rotation;
- ray–triangle and plane–triangle intersections;
- known closed tetrahedron/cube point-in-domain and utilization.

### 4.2 Property-based tests

- translation invariance with moment transformation;
- rotation and reflection covariance;
- positive geometric scaling: `P∝L²`, `M∝L³` for otherwise similar inputs;
- fiber/rebar input ordering invariance;
- refinement does not change exact area/first moments beyond floating tolerance;
- certified meshes are closed, consistently oriented, and have finite nonzero volume;
- demand exactly scaled from a stored boundary vertex gives `UR≈1`.

Every failing randomized test stores a reproducible seed and minimized fixture.

### 4.3 Metamorphic and differential tests

- gross concrete plus embedded bar vs independently meshed net concrete plus full bar;
- production forward evaluator vs scalar reference evaluator;
- accelerated vs brute-force triangle queries;
- production strain-path surface vs independent constrained-optimization reference points;
- TypeScript results vs an independent high-precision/reference implementation for selected cases.

### 4.4 Regression tests

Store approved fixture inputs and full-precision results with tolerances and evidence owner. A changed
result requires classification as bug fix, intended model/code change, dependency numeric change, or
unexplained regression. Snapshot updates without engineering review are prohibited.

## 5. Structural verification matrix

Cover the Cartesian combination of representative categories, not one sample section:

### Geometry

- rectangular/square;
- circular polygon and annulus;
- L, T, and irregular concave sections;
- one and multiple holes;
- thin ligaments and re-entrant corners;
- symmetric geometry with symmetric/asymmetric reinforcement;
- strongly asymmetric geometry and reinforcement.

### Reinforcement/material state

- low/high reinforcement ratio within adapter scope;
- different bar layers and steel grades;
- compression-controlled, balanced/transition, and tension-controlled states;
- pure compression, pure tension, pure bending, and combined biaxial bending;
- material and reduction-rule breakpoints.

### Numerical orientation

- principal and nonprincipal axes;
- angles midway between initial beta samples;
- demand rays through vertices, edges, faces, and near-tangent directions;
- axial-cap intersection and fixed-P contours near extrema.

Each cell of the matrix has a stated oracle: analytical, independent implementation, constrained
optimization, published example, or experimentally validated model.

## 6. Design-code profile and adapter verification

A standard resistance profile and its adapter reach `verified` only when:

1. Exact normative document, edition, method, jurisdiction/annex, amendments, and access date are
   recorded.
2. Every formula/limit has clause-level traceability; no value is copied from memory or secondary
   software documentation.
3. Required applicability limits and user choices are runtime validations.
4. Official or authoritative worked examples are reproduced within documented tolerance.
5. Independent structural reviewer signs the traceability matrix.
6. Nominal/reference totals reproduce their contribution-ledger sums; design-material laws are
   independently checked where applicable.
7. Material models, reduction transitions, axial caps, and exceptional cases are tested on both
   sides of every breakpoint.
8. Anti-double-reduction tests prove that alternative methods cannot be combined. In particular,
   the basic KDS global-factor method and the KDS 14 20 20 Appendix material-factor method are
   mutually exclusive.
9. Changes in a new code edition or resistance method create a new profile identity; they do not
   mutate historical results.

Where normative text is licensed, store clause identifiers and derived tests without redistributing
copyrighted text beyond permitted use.

## 7. Solution-verification evidence per run

Every design result package stores:

- mesh levels, fiber counts, successive differences, and observed-order validity;
- beta/state refinement history and worst interpolation cell;
- final topology/orientation/star-shaped reports;
- targeted utilization refinement and uncertainty interval;
- conditioning/floating-point diagnostics;
- resource/cancellation status;
- expanded tolerances and acceptance margin.

A result without this evidence is preview-only.

## 8. Validation of modeling assumptions

Code verification answers whether the equations were solved correctly. Validation must address
whether the selected section model is adequate for the stated use.

Validation evidence may include:

- comparison with published experimental results for short RC columns under biaxial loading;
- comparison with trusted code examples and independently validated section-analysis software;
- sensitivity studies for concrete law, steel hardening, confinement, and point-bar approximation;
- documented bounds showing when excluded member/slenderness effects become important.

Do not calibrate and validate on the same cases without disclosure. Report experimental and input
uncertainties. A ULS code-check tool may primarily validate against the normative calculation model,
but it must not claim to predict physical failure beyond that model's scope.

## 9. Release gates

### Gate A — Specification baseline

- scope, equations, conventions, result meanings, error budgets, and code edition approved;
- unresolved engineering decisions recorded; no contradictory instruction remains.

### Gate B — Kernel verification

- geometry, materials, forward evaluator, scaling, and linear algebra tests pass;
- independent derivative and invariance tests pass;
- dependency versions locked and audited.

### Gate C — Surface and checks

- adaptive convergence and closed-mesh topology pass across the structural matrix;
- pure axial utilization, cap faces, asymmetry, and non-monotone `P` cases pass;
- production results agree with independent reference solver within approved tolerance.

### Gate D — Design-code resistance profile and adapter

- clause traceability complete;
- exact edition, national annex, and `methodId` locked;
- nominal/reference ledger, resistance sequencing, and anti-double-reduction tests pass;
- authoritative examples pass;
- independent structural review signed;
- applicability validations and report wording approved.

### Gate E — System quality

- runtime schemas, failure handling, cancellation, resource limits, worker equivalence, security,
  performance, and reproducibility pass;
- preview and certified types cannot be confused;
- reports include all required provenance and warnings.

### Gate F — Release approval

- full regression on supported runtimes;
- known limitations and residual risks accepted by named approver;
- semantic version, migration notes, evidence bundle, and rollback plan published.

Failure of any required gate blocks production certification.

## 10. Change impact and re-verification

Classify every change:

- **Class 1:** comments/UI only, no result impact;
- **Class 2:** performance/refactor with expected identical results;
- **Class 3:** numerical algorithm/tolerance/dependency change;
- **Class 4:** mechanics, material, utilization, or design-code rule change.

Class 3 reruns kernel, convergence, structural, and differential suites. Class 4 additionally requires
new structural/code review and updated validation evidence. Unexplained full-precision result drift
is treated as Class 4 until resolved.

## 11. Reference standards for the V&V process

- ASME V&V 10-2019 (R2025), *Standard for Verification and Validation in Computational Solid
  Mechanics*.
- IEEE 1012-2024, *IEEE Standard for System, Software, and Hardware Verification and Validation*.

These references guide the credibility process; the project quality plan must record which
requirements are adopted, tailored, or out of scope.
