# 03 — Forward Mechanics, Scaling, and Linear Algebra

The forward evaluator is the trusted computational kernel. It is pure, deterministic, independent
of design-code reduction rules, and evaluated only in the declared reference frame.

## 1. Generalized strains and resultants

This section documents the implemented `@pm/analysis` stress-strain convention. It is not a claim
that the current equivalent-block backend uses the same `My` sign; that difference is recorded in
[`engineering/02-data-conventions-and-terminology.md`](engineering/02-data-conventions-and-terminology.md).

```ts
export interface GeneralizedStrain {
  e0: number;
  kx: number; // 1/mm; multiplies y
  ky: number; // 1/mm; multiplies x
}

export interface Resultant {
  P: number;  // N, compression positive
  Mx: number; // N·mm
  My: number; // N·mm
}
```

At fiber `i`:

```text
εi = ε0 + κx yi + κy xi
Fi = σi(εi) Ai
P  = ΣFi
Mx = ΣFi yi
My = ΣFi xi
```

Concrete fibers use the selected concrete material. Rebar fibers use the compiled embedded-rebar
material from file `01`.

## 2. Tangent matrix

For physical/service equilibrium, the consistent tangent is

```text
J = ∂(P,Mx,My)/∂(ε0,κx,κy)
  = [ ΣTA    ΣTAy    ΣTAx  ]
    [ ΣTAy   ΣTAy²   ΣTAxy ]
    [ ΣTAx   ΣTAxy   ΣTAx² ]
```

```ts
export interface ForwardResult {
  resultants: Resultant;
  /** Material/source ledger whose sum reproduces resultants. Mandatory in ULS mode. */
  contributions: readonly ResultantContribution[];
  tangent?: readonly [Vec3, Vec3, Vec3];
  strainExtrema: {
    concreteMin:number; concreteMax:number;
    rebarMin:number; rebarMax:number;
  };
  materialDomainOk: boolean;
}
```

The extrema over discrete fibers are diagnostics only. Ultimate compression limits use exact
section support geometry and the strain plane, not these fiber extrema.

```ts
export function forward(
  fibers: readonly Fiber[],
  materials: MaterialRegistry,
  q: GeneralizedStrain,
  withTangent = false,
): ForwardResult {
  const sums = new CompensatedForwardSums();
  for (const f of fibers) {
    const e = q.e0 + q.kx*f.y + q.ky*f.x;
    const m = materials.get(f.materialId);
    const stress = m.stress(e);
    const force = stress*f.area;
    sums.addResultant(force, f.x, f.y);
    for (const component of m.stressComponents(e)) {
      const group = contributionGroup(component.source, component.stress);
      sums.addContribution(group, component.materialId,
        component.stress*f.area, f.x, f.y);
    }
    if (withTangent) sums.addTangent(m.tangent(e)*f.area, f.x, f.y);
    sums.addStrain(f.kind, e, m.admissible(e));
  }
  return sums.finish(withTangent);
}
```

Use compensated summation for force, moment, and tangent accumulations. Reject any non-finite
material output immediately with material/fiber context.

`contributionGroup` is deterministic: concrete is split into compression/tension by stress sign,
reinforcement is split likewise, prestressing remains its own source, and displaced concrete
remains `displacedConcrete`. Zero stress uses a documented stable convention and has no numerical
effect. The adapter may further split a `material:<id>` group when the standard requires it.

The contribution ledger is engineering data, not a reporting approximation. Its vector sum must
equal the total forward resultant within the same compensated-summation tolerance. Full steel and
displaced-concrete components at embedded bars remain separate. A code adapter may map these
generic source/sign contributions to the factor groups in file `11`, but the mechanics kernel does
not know factor values.

## 3. Exact reference-frame behavior

Tests must prove:

- translation with transformed demand preserves adequacy;
- rotating section, bars, strain gradient, and resultants gives the corresponding rotated answer;
- reflection changes moment signs as expected;
- symmetric section plus symmetric strain gives the expected zero coupling component.

The forward kernel does not recenter fibers internally. Recentring is a geometry-normalization step
and the chosen origin is recorded.

## 4. Separate geometric and transformed elastic properties

Exact geometric area/centroid/inertia comes from polygon formulas in file `02`.

For a service-solver seed only, an equivalent elastic section may be formed from explicit service
elastic moduli:

```ts
export interface ElasticSeedProperties {
  EA: number;
  ESx: number;
  ESy: number;
  EIx: number;
  EIy: number;
  EIxy: number;
  elasticCenter: { x:number; y:number };
}
```

The elastic center shall not replace the declared result-reference origin. Do not derive physical
elastic modulus from a ULS design curve's initial tangent unless the design code explicitly defines
that use.

## 5. Dimensionless scaling

Raw tangent entries mix N, N·mm, and N·mm². Determinant thresholds on the raw matrix are therefore
unit- and size-dependent.

Choose fixed positive references:

```text
εref = code/scenario strain scale, normally of order concrete ultimate strain
Lref = max caliper depth of exact outer geometry
Pref = positive characteristic section force
Mref = Pref·Lref
```

Scale unknowns and resultants:

```text
qhat = [ε0/εref, κxLref/εref, κyLref/εref]
rhat = [P/Pref, Mx/Mref, My/Mref]
```

The solver uses `Jhat = ∂rhat/∂qhat`, whose entries are dimensionless and generally comparable.
References are fixed for the entire solve and recorded in provenance. `Pref` may be derived from a
conservative characteristic material/area scale or a previously built nominal surface, but never
from the current residual component.

## 6. Linear solve

Use Gaussian elimination/LU with partial pivoting for the 3×3 scaled system. A small internal
implementation is acceptable only with exhaustive tests; otherwise use a pinned, audited numerical
library behind this interface:

```ts
export interface LinearSolveResult {
  ok: boolean;
  x?: Vec3;
  reciprocalConditionEstimate?: number;
  reason?: 'singular' | 'illConditioned' | 'nonFinite';
}

export function solveScaled3(A: Mat3, b: Vec3, opts: {
  minReciprocalCondition: number;
}): LinearSolveResult;
```

Do not use Cramer's rule or compare `det(J)` with a power of one matrix entry. Determinants are not
a reliable condition measure, and the raw matrix has mixed dimensions.

## 7. Forward-kernel verification

Required tests:

1. Single-fiber closed-form resultants and tangent.
2. Linear elastic section compared with exact transformed-section equations.
3. Every material segment and kink approached from both sides.
4. Jacobian directional derivative:

   ```text
   [R(q+h·v)−R(q−h·v)]/(2h) ≈ J(q)v
   ```

   Use multiple `h` values and exclude exact constitutive kinks.
5. Translation/rotation/reflection invariants.
6. Reordered fibers produce equivalent results within summation tolerance.
7. Gross-concrete plus embedded-rebar result equals net-concrete plus full-steel result for a
   verification geometry where both are integrated independently.
8. The contribution-ledger sum reproduces the total for mixed concrete/reinforcement tension and
   compression states; embedded full-steel and displaced-concrete terms are independently visible.
9. Scale test: geometrically similar sections in mm and consistently converted units produce the
   correct force/moment scaling.

Random Monte Carlo integration may be a supplementary smoke test. It is not the primary accuracy
oracle because its own sampling error is too large for release verification.

## 8. Performance contract

The forward evaluator is allocation-free inside the fiber loop. Material lookup is compiled to
integer indices before analysis. Surface batches should evaluate multiple strain states per fiber
block where profiling demonstrates benefit, while retaining a scalar reference implementation for
verification.
