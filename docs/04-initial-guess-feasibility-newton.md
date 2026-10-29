# 04 — Physical/Service Equilibrium Solver

Filename retained for compatibility. This solver is **not** the ULS feasibility test. ULS adequacy
is decided from the verified design resistance domain in files `05` and `07`.

## 1. Problem definition

Given unfactored physical/service actions `D=(P,Mx,My)` and service-response materials, find one
admissible generalized-strain state `q=(ε0,κx,κy)` such that

`R(q)−D=0`.

The nonlinear map may be non-unique or locally singular. A returned state is an equilibrium branch
reached by the declared continuation path; do not label it "the exact strain plane" without a
uniqueness proof.

Do not pass a factored ULS demand to this solver to derive design strains. Strength-reduction
factors are reliability rules, not constitutive behavior.

## 2. Preconditions

- scenario mode is `serviceResponse` or an explicitly authorized physical nonlinear analysis;
- all actions, origin, and material units are consistent;
- materials provide stress, tangent, and admissible strain ranges;
- exact geometry and integration mesh passed sanity checks;
- scaled elastic seed matrix is nonsingular or an alternate seed is provided;
- resource and iteration limits are finite.

These preconditions do not assert that the requested equilibrium exists.

## 3. Elastic seed about the declared origin

Assemble the service elastic generalized stiffness directly about the declared reference origin:

```text
K0 = [ ΣEA    ΣEAy    ΣEAx  ]
     [ ΣEAy   ΣEAy²   ΣEAxy ]
     [ ΣEAx   ΣEAxy   ΣEAx² ]
```

Solve the scaled system `K0 q0 = D`. This automatically handles coupling and avoids silently moving
the moment origin to an elastic centroid. If service concrete tension is intentionally neglected,
that modeling choice belongs to the service material set and provenance.

## 4. Load continuation

A single Newton jump from zero to the full demand is not the default. Trace the branch using a load
factor `λ`:

`Dλ = λD`, `λ:0→1`.

Algorithm:

1. Start at `λ=0`, `q=0` or a validated initial state.
2. Predict the next state with the previous tangent/step.
3. Correct by damped Newton at `λnext`.
4. If correction fails, halve `Δλ` and retry from the last converged state.
5. If correction is easy, grow `Δλ` up to a configured maximum.
6. Stop with typed failure when `Δλ < minLoadStep`, material admissibility fails, conditioning falls
   below the allowed limit, or resource limits are reached.

```ts
export interface EquilibriumOptions {
  residualTol: number;
  incrementTol: number;
  maxNewtonIterations: number;
  initialLoadStep: number;
  minLoadStep: number;
  maxLoadStep: number;
  minReciprocalCondition: number;
  lineSearchMinFactor: number;
}
```

## 5. Scaled Newton corrector

At iteration `k`:

```text
rhat(qk) = scaleResultant(R(qk)−Dλ)
Jhat Δqhat = −rhat
qtrial = qk + α·unscaleUnknown(Δqhat)
```

Use the dimensionless scaling from file `03`. Solve with partial pivoting and record a condition
estimate. A raw determinant guard is prohibited.

### Merit function and line search

Use `ψ(q)=0.5·||rhat(q)||²`. Backtrack `α` until an Armijo decrease is obtained and all materials are
admissible. If no acceptable `α` remains, return `LINE_SEARCH_STAGNATION`; do not accept a tiny step
that increases the residual merely to keep looping.

Near piecewise-linear kinks, a semismooth active-segment change is acceptable. If repeated segment
oscillation occurs, reduce the load step or use a safeguarded trust-region fallback.

## 6. Convergence and acceptance

Require all conditions:

```text
||rhat||∞ <= residualTol
||Δqhat||∞ <= incrementTol
all material strains admissible
all values finite
```

Also detect stagnation: insufficient residual reduction over a fixed recent window is failure even
before `maxNewtonIterations`.

Recommended defaults are starting points to be verified, not universal engineering guarantees:

```text
residualTol  = 1e-8
incrementTol = 1e-8
maxNewtonIterations = 30 per load step
initialLoadStep = 0.1
minLoadStep = 1/1024
maxLoadStep = 0.25
lineSearchMinFactor = 2^-12
```

The appropriate tolerance must be tighter than integration/model error so nonlinear-solver error is
not governing.

## 7. Result type

```ts
export type EquilibriumFailureCode =
  | 'INVALID_MODE'
  | 'INITIAL_STIFFNESS_SINGULAR'
  | 'ILL_CONDITIONED'
  | 'LINE_SEARCH_STAGNATION'
  | 'MATERIAL_DOMAIN_EXCEEDED'
  | 'MIN_LOAD_STEP_REACHED'
  | 'MAX_ITERATIONS'
  | 'NON_FINITE';

export interface EquilibriumSuccess {
  ok: true;
  state: GeneralizedStrain;
  resultants: Resultant;
  loadFactor: 1;
  scaledResidual: number;
  scaledIncrement: number;
  totalIterations: number;
  loadSteps: readonly LoadStepRecord[];
  minReciprocalCondition?: number;
}

export interface EquilibriumFailure {
  ok: false;
  code: EquilibriumFailureCode;
  lastConvergedLoadFactor: number;
  lastState?: GeneralizedStrain;
  diagnostics: EquilibriumDiagnostics;
}
```

No partial state is returned as a successful response.

## 8. Relationship to ULS capacity states

The ULS surface stores strain states used to generate boundary points. Those states are useful for
failure-mode reporting and forward round-trip checks. They are not obtained by calling the service
solver with a factored demand.

For a surface verification round-trip, evaluate the stored `q` again and compare resultants with the
stored surface point. Do not demand that an inverse solve recover the same `q`, because plastic
plateaus can make the inverse non-unique.

## 9. Solver tests

- linear elastic problem converges in one corrector iteration;
- coupled asymmetric elastic section matches direct matrix solution;
- continuation reaches known nonlinear reference states;
- tangent kink crossing does not oscillate indefinitely;
- impossible/material-out-of-range demand fails deterministically;
- scale and unit-conversion invariance;
- condition estimate detects constructed near-singular systems;
- line search never accepts an inadmissible or residual-increasing state;
- all loop counts and load-step retries have hard limits.

## 10. Preview capacity-field refinement

This is separate from demand equilibrium and does not change governing utilization. The existing
surface-ray crossing seeds beta and the compatible station coordinate. Bounded damped Newton
solves the three normalized Design resultant residuals against a positive proportional multiplier.
State construction reuses the surface's station definitions and adaptive-state interpolation; no
new material domain or extrapolation is introduced. At the last chord, declared steel rupture uses
the existing compatible transition and requires an active declared limit after leaving the
concrete-limit branch. Without rupture data, continue the existing concrete-limit c/D branch to
zero depth rather than use the assumed uniform-pole strain as a steel limit. The finite interval
gets four seed probes at fractions 0, 1/4, 1/2 and 3/4, with multiplier projected onto the same ray,
to avoid starting on a yielded zero-tangent plateau. A collapsed compatible transition segment
is skipped only when its endpoint strain states agree within the existing normalized 1e-8 limit.
This does not add production stations or claim uniqueness. Reuse the inverse's 30-iteration and 1e-8
normalized residual limits, with at most 12 backtracks. Central finite differences use a 1e-6
parameter step (one-sided at domain endpoints); Newton increments are bounded to 0.25 rad and one seed-station interval per
iteration. The multiplier column is analytic. A non-converged or inadmissible state is unavailable,
never a successful field. The equivalent-block route retains its existing physical ray solver.
For an axial-cap-governed crossing, the seed is the intersection of the same checked demand ray
with the retained pre-cap Design dataset and its original topology. Refine on that physical
boundary without imposing the cap on this diagnostic query. Return explicit before-cap evidence
when its Design axial resultant exceeds the retained cap limit. The governing capped domain and
its query are never replaced. The equivalent-block bridge uses the same separation and its own
physical ray solver; neither mechanics borrows the other one's material law or strain state.
