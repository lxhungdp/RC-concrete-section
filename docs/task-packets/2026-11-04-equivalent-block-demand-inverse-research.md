# Demand equilibrium for a section designed by equivalent stress block

Research plan, 2026-11-04. The question is whether an OK loadcase can have a traceable strain and stress field at the checked actions. The deliverable at this stage is a model choice and verification plan. A future change to material response or mechanics is Class 4 under [engineering/06](../engineering/06-verification-acceptance-and-change-control.md). Relevant requirements are ENG-MAT-003, ENG-LOAD-001, ENG-AN-002 and ENG-RES-001.

## What the existing inverse solves

In the inspected working tree (HEAD `4709046` plus local changes), the block adapter targets either `(λP, λMx, λMy)` or `(P, λMx, λMy)`. The unknown multiplier places the result on the resistance boundary. The fibre diagnostic instead solves for three strain-plane components at the three checked actions. The current field selector requires qualified full-demand equilibrium for an OK loadcase. See the [block adapter](../../packages/pm-analysis-equivalent-block/src/index.ts), [fibre inverse](../../packages/pm-analysis/src/index.ts), [field selector](../../packages/pm-analysis/src/loadcase-field.ts) and [field contract](../development/13-demand-field-basis.md).

A conventional block specifies a stress magnitude, a depth rule and an ultimate strain domain. It does not specify how concrete stiffness, stress or cracking evolves up to that state. For example, multiplying a nonuniform strain plane by a positive factor preserves its zero-strain line and compressed side. A fixed block based solely on that line retains the same concrete resultant even as the strains approach zero. Steel may still change stress. Freeing the extreme strain while retaining that concrete rule therefore cannot establish a general pre-peak concrete response.

## Evidence and candidate models

1. Mander, Dutta and Goel derive a rectangular block by matching the compressive force and its position for an assumed concrete response. The block factors depend on the strain reached. Appendix A.3.1 gives the general construction, and Fig. 4-2 illustrates dependence on extreme strain. Their bridge-pier overstrength and confinement calibrations have a different scope from this project. Use the construction for a first uniaxial experiment. [MCEER-98-0003, §4.2 and Appendix A.3.1 (1998)](https://www.eng.buffalo.edu/mceer-reports/98/98-0003.pdf)
2. Bonet, Romero, Miguel and Fernandez describe integration by layers or their perimeters for RC sections of arbitrary geometry under axial force and biaxial bending. Their comparison with fibre integration gives an independent algorithm family for evaluating all three resultants at a trial strain plane. Rotter also describes boundary integration of resultants and tangent stiffness for polygonal sections and integrable material laws. These are forward operators within an inverse iteration. [Bonet et al. (2004), publisher preview](https://www.sciencedirect.com/science/article/pii/S0045794903004425), [Rotter (1985), publisher abstract](https://ascelibrary.org/doi/10.1061/%28ASCE%290733-9445%281985%29111%3A12%282659%29)
3. For experimental validation, Kristiawan et al. report load versus gauge strain for concrete and reinforcement under eccentric compression. Screen their **unpatched control CN** in Figs. 1 and 4 for a uniaxial comparison. Establish gauge positions, section actions including eccentricity and measured deflection where relevant, material inputs, sign conversion and reading uncertainty before using the curves. Independent biaxial gauge evidence is still needed for a general biaxial claim. [Kristiawan et al. (2019)](https://link.springer.com/article/10.1007/s40091-019-0214-8)

Sources consulted 2026-11-04. These research sources supply hypotheses, integration methods and a candidate experiment. Any future edition-specific material choice needs its own applicable published basis and review.

## Pilot A — one bending axis and a constant-width compression zone

Assume plane sections, perfect bond, monotonic loading and a specified compression response. For this pilot neglect concrete tension and place the neutral axis inside a rectangular section. Let `z` measure depth from the compressed edge, `c` be neutral-axis depth and `b` be width. At a trial state, calculate the gross concrete force and its first moment about that edge. In project units these are N and N·mm.

```text
ε(z)   = εedge (1 − z/c)
C      = b ∫[0,c] σc(ε(z)) dz
Q      = b ∫[0,c] z σc(ε(z)) dz
a      = 2 Q/C
σeq    = C/(b a)
```

The last two identities follow from a uniform block with centroid at half its depth. They require positive force and a block depth within the material region being represented. For bars, use compatible strains and their own law. If gross concrete includes the area assigned to a bar, subtract the displaced concrete using the chosen response law at the bar under the project's embedded-bar convention. Matching the gross concrete resultants does not justify replacing that local stress with the block intensity.

**An inverse calculation with an analytical answer.** Take a synthetic 200 × 300 mm rectangle, one centred steel row of 1,000 mm² at depth 250 mm, compression-only linear concrete with modulus 30,000 MPa and elastic steel with modulus 200,000 MPa. Apply pure bending `Mx = +32.5 kN·m` about the centroid, with the upper edge in compression. All these values are manufactured test inputs. With `κ > 0`, axial equilibrium gives `b Ec c² / 2 = As Es (d − c)`. The positive root is 100 mm. Moment equilibrium gives `κ = Mx / [(b Ec c²/2)(d − c/3)] = 5 × 10⁻⁶ /mm`.

| Quantity | Solution |
|---|---:|
| Concrete edge strain / stress from its law | +0.0005 / +15 MPa |
| Steel strain / stress from its law | −0.00075 / −150 MPa |
| Equivalent uniform intensity / depth | +11.25 MPa / 200/3 mm |
| Concrete compression / steel tension force | +150 kN / −150 kN |
| Reassembled P / Mx / My | 0 / +32.5 kN·m / 0 |

Exact rational arithmetic reproduces these values. The two concrete stresses answer different display questions even in this elementary case. A material-stress heatmap evaluates the response law at each displayed location. A diagram of the equivalent block labels its uniform intensity explicitly.

## Pilot B — biaxial equilibrium and the limit of a single block

For an irregular section, matching force and depth of the compression resultant leaves its transverse position to be checked. An exact counterexample uses dimensionless depth `0 ≤ z ≤ 1` and unit width. Across the top third, the section occupies `0 ≤ x ≤ 1`. Across the rest it occupies `1/2 ≤ x ≤ 3/2`. Prescribe `σ(z) = 1 − z`. Force and depth moment fix the equivalent top block uniquely at depth 2/3 and stress 3/4 for this orientation. The table gives the direct integrals over both rectangles.

| Integral | Linear stress | Equivalent top block |
|---|---:|---:|
| ∫σ dA | 1/2 | 1/2 |
| ∫zσ dA | 1/6 | 1/6 |
| ∫xσ dA | 13/36 | 3/8 |

The transverse moment differs by 1/72, including after translation to the section centroid since the two forces agree. This counterexample rules out using the constant-width uniaxial reduction as a general biaxial forward operator. For a general polygon, compare integration over clipped constitutive layers with an independently converged fibre calculation under *the same specified laws*. A layer integral must retain force and both first moments, with holes subtracted.

Use the project strain plane `q = (ε0, κx, κy)` and `ε = ε0 + κx(y − y0) + κy(x − x0)`. Solve `Rresponse(q) = Dchecked` about the same origin with compression positive, `Mx = ΣF(y − y0)` and `My = ΣF(x − x0)`. Strain-plane variables also represent uniform strain without a finite neutral axis. The direction of the strain gradient is a result of equilibrium. A biaxial demand's moment direction alone does not prescribe it. See [forward mechanics](../03-forward-analysis-and-jacobian.md) and [inverse solver and admissibility](../04-initial-guess-feasibility-newton.md).

## Work sequence and decision gates

| Stage | Work product | Evidence required to proceed |
|---|---|---|
| 1. Define the response | A written scenario for monotonic, pre-peak section response. For the OK use case, identify the diagnostic target as the factored checked vector after origin conversion and any governing code adjustment. Record the response-law source and stage, initial stiffness, tensile/cracking policy, steel law and strain limits. A physical/service scenario requires a separately declared action basis and corresponding materials. | Structural reviewer can identify the target and material set for each requested profile. Missing material evidence makes that profile unsupported. Resistance factors and the axial cap belong to the capacity check. |
| 2. Run the rectangular pilot | From an input load, recover curvature, neutral-axis depth, edge and bar strains. Start with the worked oracle, then use a documented nonlinear compression curve at several demand levels with direct integration as the comparator. | Check resultant equilibrium, recovered strains and centroid of compression separately. Exercise both signs of bending, transition to full compression, uniform strain, zero load and steel yielding. Identify domain limits explicitly. |
| 3. Compare biaxial operators | Use clipped-layer or perimeter integration and an independent reference with separate geometry integration. Try rectangles under oblique bending, the stepped counterexample, an eccentric hole and asymmetric bars. | Replay all three resultants. Check dimensionless residual, strain increments, admissibility, quadrature refinement, axis rotation and origin translation. Predeclare tolerances against independent evidence. Test analytic or algorithmic tangents against finite differences away from and one-sided at material breakpoints. |
| 4. Establish which inverse solutions can be shown | Use scaled load continuation from the declared initial state and a safeguarded corrector, with bounded steps and work. Store response-law identity, load path, residuals, conditioning and material-limit evidence. | Recover prescribed strains on identifiable branches. For singular, ambiguous, out-of-domain or unconverged states return an explicit diagnostic. For zero demand distinguish a declared virgin elastic state from an unknown loading history. Compare pre-peak gauge histories separately from forward/inverse arithmetic. |
| 5. Decide product scope | Review the validated geometry, loads and material domain. For supported cases expose strain, concrete stress from its law and per-bar strain/stress, with a separate equivalent-block display if its meaning is useful. | Design-check UR, classification and capacity field retain their own evidence under both proportional and constant-P checks. Replay inverse evidence against the checked vector. Specify a distinct result basis in the worker, UI and report before enabling a demand field. |

For a first prototype, use the rectangular pilot as the hand-checkable benchmark. For the general product case, compare the added value of a layer-based operator with using the existing strain-plane machinery under an explicitly selected diagnostic response model. This lets a project keep equivalent block for strength design and identify exactly which model supplied its demand stresses. Qualification of a concrete response law per profile and independent strain measurements remain open. The present packet contains research and analytical checks only.
