# Product Scope and Engineering Workflow

## 1. Purpose

P-M evaluates the cross-sectional response and resistance of reinforced-concrete sections under
axial force and biaxial bending. Its target ULS output is a design resistance domain in
`(P, Mx, My)` and a check for each declared factored demand.

Uniaxial P-M is a constrained view of the same biaxial problem; it is not a separate mechanics
engine. A rectangle is a polygon input, not a separate calculation method.

## 2. Supported engineering modes

### ULS resistance

Input actions are factored design actions. A versioned design-code profile supplies ultimate strain
domains, material sets, reduction rules, classifications, caps, and applicability limits. Output is
design resistance, adequacy, utilization, governing state, numerical evidence, and provenance.

An interior ULS demand does not have a unique physical strain state merely because it lies inside a
capacity surface.

### Physical/service response

Input actions are physical or service actions and materials are appropriate response laws. An
equilibrium solver may return one admissible response branch with convergence evidence. ULS
strength-reduction factors are not applied.

### Verification/reference analysis

A slower and algorithmically independent path checks production algorithms and selected fixtures.
It must not reuse the production surface interpolation/search logic as its oracle.

## 3. Included target scope

- one or more polygonal concrete regions, each with zero or more holes, when the selected analysis
  capability explicitly supports that topology;
- discrete nonprestressed reinforcement bars;
- plane sections remaining plane and perfect concrete-steel bond;
- short-section axial force and biaxial bending resistance;
- nominal/reference and design-resistance domains;
- batch checks for load combinations;
- proportional 3D utilization and fixed-axial-load slices for secondary reporting;
- convergence, uncertainty, diagnostics, provenance, plots, Excel reports, and PDF reports.

The first verified analysis release may intentionally restrict the input capability to one connected
concrete region with holes. The editor and project format can support multiple regions earlier, but
the analysis must reject unsupported topology with a typed blocking issue.

## 4. Excluded until separately specified and verified

- member slenderness, second-order effects, frame stability, and buckling;
- shear, torsion, anchorage, confinement behavior beyond an explicit resistance-profile option;
- creep magnification, fire, fatigue, cyclic degradation, durability, and construction stages;
- prestressing, FRP, composite structural shapes, bond slip, local bar buckling, or non-planar strain
  fields;
- automatic selection or legal interpretation of a jurisdiction's governing standard.

The UI and report shall display exclusions relevant to the selected analysis. A section result shall
not be titled “column design complete” when member-level checks are excluded.

## 5. Module workflow and gates

| Module | Engineering input | Required output gate |
|---|---|---|
| Geometry | concrete boundaries, holes, bars, origin/axes | valid normalized topology and reinforcement references |
| Materials | concrete/steel definitions and sources | validated material definitions and compatible selected profile |
| Loadings | cases/combinations, action basis, origin/axes/units | finite, uniquely identified, basis-compatible demands |
| Analysis | normalized scenario, profile, accuracy options | converged accepted result or typed failure |
| Results | immutable result package | plots/tables derived without recomputing engineering rules |
| Report | accepted result plus presentation options | released Excel/PDF carrying result identity and limitations |

The user may edit modules in any order, but analysis starts only after all prerequisite gates pass.
Changing Geometry, Materials, Loadings, design basis, or analysis options makes downstream Results
and Report stale.

## 6. Result-state lifecycle

```text
draft inputs
  -> valid input snapshot
  -> normalized analysis scenario
  -> preview or design calculation
  -> converged engineering result
  -> accepted result
  -> released report
```

No state may be skipped. A cancelled or non-converged calculation may retain explicitly branded
diagnostic preview data, but it cannot enter acceptance or report-release APIs.

## 7. Product success criteria

The product succeeds when an independent reviewer can answer, from the saved result alone:

1. What section, bars, materials, and demands were checked?
2. Which origin, axes, signs, and units were used?
3. Which exact standard/profile/method and resistance sequence were applied?
4. What numerical resolution, convergence, and uncertainty support the classification?
5. What governs each demand and what is outside scope?
6. Can the same version reproduce the result from the stored input snapshot?
