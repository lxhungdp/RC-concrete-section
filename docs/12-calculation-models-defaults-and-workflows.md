# Calculation Models, Defaults, and Workflows

Status: implemented preview. The numerical pipelines are tested, but design-code profiles remain
`draft` until the independent code-review and release gates in `09` are complete.

This document is the concise engineering map of the two calculation models. They share geometry,
reinforcement, result DTOs, demand checks, and reporting terminology. They do not share their
concrete resistance kernel or their surface-station algorithm.

## 1. The two models

| Item | Stress-strain integration | Equivalent rectangular stress block |
|---|---|---|
| Method ID | `strain-domain-surface-v1` | `equivalent-block-surface-v1` |
| Calculation profile | `kds-2024-stress-strain` or `custom-stress-strain` | `kds-142020-equivalent-block`, `aci-318-19-22-equivalent-block` or `custom-equivalent-block` |
| Concrete state | stress is evaluated from strain at every integration point | constant compression stress acts only inside a clipped block of depth `a` |
| Concrete discretization | verified triangle/quadrature mesh | exact polygon/half-plane clipping; no concrete fiber mesh |
| Primary state variable | compatible strain plane `(eps0, kx, ky)` | block-normal angle and neutral-axis depth `c` |
| Forward problem | integrate concrete and steel stresses | clip the block, integrate its area/centroid, then add steel |
| Inverse problem | safeguarded Newton solve on strain-plane variables | bracketed scalar solves plus bounded angular search/refinement |
| Field result | full strain and full material stress over the section | full compatible strain; concrete stress only in `0 <= depth <= a` |

The models are separate packages because `sigma_c = f(eps_c)` and a code-equivalent block are
different constitutive statements. Sampling one with the other's equations would produce a smooth
number but not the resistance defined by the selected method.

Current blocking convention note: the project DTO only stores `My` and does not enforce its sign.
The stress-strain backend and workbook compute `My = sum(F*x)`; `@pm/equivalent-block` computes
`My = -sum(F*x)`. The bridge, demand solver, plots, and field UI pass whichever value the selected
backend returns without transformation. Cross-model comparison and nonzero-`My` block checks remain
preview-only until one convention is selected or an explicit boundary transform is verified on
asymmetric sections.

### 1.1 Custom profiles

Each mechanics has one `Custom` profile. It runs the same kernel as its published siblings and
changes nothing about the mechanics; what it changes is where the parameters come from.

| Item | Published profile | Custom profile |
|---|---|---|
| Concrete model | fixed by the standard | user-selected among the models that mechanics can evaluate |
| `alpha`, `n`, `eps0`, `epsCu` | code table for `fck` | user input |
| `beta1`, block stress factor | code table for `fck` | user input on the `user-block` concrete model |
| Steel law | elastic-perfectly-plastic | elastic-perfectly-plastic, bilinear, or a user table |
| `phi` factors, transition rule, axial cap | code defaults, deviations need a narrative | user input, no narrative required |
| Status | `draft` pending named review | `user-defined`, outside the review ladder |

Two guards keep this from becoming a way to smuggle an unevaluable state into a kernel:

- persistence rejects a project whose concrete model the selected mechanics cannot evaluate — a
  block law cannot reach the fibre kernel, and a fibre law carries no `beta1` for the block kernel;
- a non-elastic-perfectly-plastic steel law is accepted only by the custom block profile. A
  published block profile is calibrated against that idealization, so accepting another law there
  would silently change what the code check means.

`@pm/code-custom` derives nothing. Where the KDS adapter reads Table 4.1-2 and the ACI adapter
computes `beta1` from `f'c`, the custom adapter validates ranges and uses what it was given. Its
concentric reference stress defaults to the block stress — the ACI pattern — and only becomes a
separate, unreachable `P0` reference point when the user raises it, which is the KDS pattern.

## 2. Stress-strain integration equations

For reference origin `(x0,y0)` and compression-positive strain,

```text
eps(x,y) = eps0 + kx (y-y0) + ky (x-x0)
sigma_c = concreteLaw(eps)
sigma_s = steelLaw(eps)
```

The forward resultants are

```text
P  = integral_A sigma_c dA + sum_i sigma_si Asi - displaced-concrete correction
Mx = integral_A sigma_c (y-y0) dA + sum_i sigma_si Asi (yi-y0) - correction
My = integral_A sigma_c (x-x0) dA + sum_i sigma_si Asi (xi-x0) - correction
```

The inverse solver seeks a compatible strain plane whose three resultants match the three factored
demand components. It uses the consistent tangent/Jacobian, scaling, line search, admissibility
checks, and bounded fallback described in `03` and `04`.

In the current ULS UI this inverse state is a diagnostic source for the selected section field; it
does not determine adequacy. Governing utilization still comes from the factored-demand ray against
the Design surface. Convergence of this diagnostic Newton solve must not be presented as proof that
an interior ULS demand has a unique physical failure state.

### 2.1 Production sampling default

The default schedule is `P0...P24`, or 25 stations in total:

- `P0`: exact uniform-compression pole;
- four neutral-axis landmarks `c/c1 = 3, 2, 1.5, 1.2`;
- five steel-stress landmarks `fs/fyd = 0, 0.25, 0.5, 0.75, 1.0`;
- eight additional code-aware transition landmarks at `1/8...8/8` of the interval from yield to
  the tension-controlled limit; the yield landmark is `0/8`, so there are nine mandatory nodes in
  this transition region;
- six code-aware post-transition landmarks at `eps_t,limit` plus `0.0025, 0.005, 0.010,
  0.020, 0.025, 0.045`; for the common `eps_t,limit = 0.005` case these resolve to `0.0075,
  0.010, 0.015, 0.025, 0.030, 0.050`;
- `P24`: exact uniform-tension pole, limited by the declared steel rupture strain when available.

The transition-node strain is computed for the controlling bar in each direction:

```text
eps_t(r) = eps_y + r (eps_t,limit - eps_y),  r = 0/8, 1/8, ..., 8/8
```

The selected resistance profile owns `eps_t,limit`:

```text
ACI 318-19(22): eps_t,limit = eps_y + 0.003

KDS current profile:
  fy <= 400 MPa: eps_t,limit = 0.005
  fy >  400 MPa: eps_t,limit = 2.5 eps_y
```

Thus, the nine nodes remain correct when steel grade or code changes. They are not nine hard-coded
strain numbers.

### 2.2 Direction default

The stress-strain model starts with 36 uniform directions at 10 degrees. The production default then
performs midpoint refinement over all stations with:

```text
relative chord tolerance = 0.005
maximum passes           = 6
maximum directions       = 360
```

Thirty-six is the seed count, not the promised final count. A result records the actual directions,
passes, maximum measured interpolation error, and whether the tolerance was reached. A fixed
36-direction run remains available as an explicit user option, but it does not have the same error
control as the production adaptive default.

`beta` is the strain-gradient direction. It is not the neutral-axis line angle and it is not the
demand moment angle. All conversions live in the angle-semantics utilities and are tested at the
principal axes and in every quadrant.

## 3. Equivalent rectangular stress-block equations

For block-normal coordinate `u`, extreme compression coordinate `u_max`, and neutral-axis depth
`c > 0`, the equivalent block depth is

```text
a = beta1 c
block = { point | 0 <= u_max - u <= a }
```

Concrete stress is zero outside that clipped region. Inside it:

```text
ACI 318-19(22): sigma_block = 0.85 f'c
KDS 14 20 20:  sigma_block = eta 0.85 fck
```

`beta1`, `eta`, and the extreme compression strain are supplied by the selected code adapter. The
kernel clips every solid and hole against the block half-planes, integrates exact clipped area and
centroid, and deducts displaced concrete for bars inside the active block. Steel strain remains
compatible with `c` and the extreme compression strain; steel stress comes from the registered
steel law.

The forward evaluator returns `c`, `a`, `beta1`, block polygon, strain plane, concrete/steel/
displaced-concrete ledgers, and total resultants. The inverse pipeline brackets the physical depth,
uses robust scalar root solving for a fixed direction or axial level, and refines the angular
surface independently of the stress-strain solver.

### 3.1 Production sampling default

The equivalent-block pipeline intentionally has different controls:

```text
initial neutral-axis states = 37, plus two exact poles
bar events                  = 9 yield-to-phi nodes per steel definition, plus declared eps_u
station refinement          = adaptive, tolerance 0.0075, max 6 passes, max 128 states
seed directions             = 24
direction refinement        = adaptive, tolerance 0.0075, max 6 passes, max 360 directions
```

Those defaults were verified for the block kernel and must not be relabeled as the stress-strain
25-station/36-direction schedule. Both models expose their own station and direction controls on the
same Analysis Options page.

The 37 user-controlled states remain a concrete-edge/depth schedule. Code and rupture events are a
separate transient layer: for every direction the engine solves `c` so the controlling longitudinal
bar is exactly at the requested strain. Rows can therefore have different station counts. A monotone
zipper triangulation connects adjacent rows without warping the baseline states or moving a phi kink
back to the concrete tension edge.

### 3.2 Physical compression closure and code reference points

ACI uses the same `0.85 f'c` block stress for the flexural compression limit and its concentric
reference. KDS high-strength concrete is different: the flexural block is `eta 0.85 fck`, while the
literal concentric `P0` expression uses `0.85 fck`. The KDS surface closes at the physically reachable
`eta`-reduced limit. `P0` remains available as a named code reference point but is never connected to
the surface by triangles. This prevents interpolation through a capacity band that no neutral-axis
state can produce.

## 4. Nominal, Design, and factored Demand

Both models use the same result language:

- **Nominal** is the reference resistance before the selected resistance treatment;
- **Design** is the usable resistance after the selected global factor or design-material
  reevaluation and, where enabled, the axial cap;
- **Demand** always means a `factoredULS` action combination in the governing check.

For global-factor profiles, each compatible state is evaluated nominally and the complete resultant
ledger is multiplied once by the state-dependent `phi`. The factor is not applied separately to
concrete and steel, and it is not applied a second time to demand. For design-material profiles, the
same strain state is reevaluated with design material laws rather than multiplied by a global
factor.

The governing biaxial check intersects the Design surface with the 3D proportional ray through
`(Pu,Mux,Muy)`. Fixed-P contours are display and diagnostic slices; they are not a substitute for the
governing 3D utilization check.

## 5. End-to-end workflow

```text
Geometry + rebars
  -> one Materials code/model/profile selection
  -> model-specific Analysis Options
  -> prepare the corresponding kernel
  -> build Nominal surface
  -> apply/re-evaluate Design resistance and axial cap
  -> intersect factored Demand ray
  -> expose state, convergence, factors, ledgers, and field map
  -> expose preview export actions supported by that model
```

The code/model selection is made once in Materials and resolves the calculation profile, material
definitions, resistance basis, and matching analysis-options DTO. Downstream code switches on the
profile/method ID; it does not infer a model from UI text.

Current export support is intentionally asymmetric: stress-strain projects can export the
calculation workbook and the concrete-mesh Excel/DXF audits. Equivalent-block projects can display
their block field and solver trace, but the calculation workbook is blocked until a dedicated
clipped-block ledger is implemented; they have no concrete integration-mesh export.

### 5.1 Inverse acceptance, diagnostics, and reuse

The proportional block solver first intersects the faceted Design surface, then uses that branch as
the seed for exact clipped-polygon equilibrium refinement. Only `converged` and a code-defined
`cap-face-governed` result can be accepted. If the exact solve exhausts its iterations, status is
`mesh-fallback`: the approximate faceted capacity is retained for diagnosis, but `converged=false`
and `ok=false`.

The reported equilibrium vector is `R_exact(state) - lambda D`, not a reconstructed zero. Ledger
assembly diagnostics are named `componentForceResidual` and component moment residuals; they only
check that concrete and steel components add to the stored resultant and are not presented as an
equilibrium proof.

When a physical state exists, admissibility evaluates maximum concrete compression and every bar
strain against the actual code/material limits. Declared steel `eps_u` bounds surface construction
and is enforced by the inverse result. An axial-cap face has no unique compatible strain state, so it
is explicitly marked `evaluated=false` rather than assigned a fabricated `eps_c=eps_cu` check.

The worker caches the immutable core Design surface by profile, geometry, rebars, materials,
DesignBasis, and analysis options. Load combinations are deliberately absent from that key, so a
batch reuses one surface; changing any resistance-domain input invalidates it.

## 6. Verification and benchmark evidence

`npm run bench:strain-sampling` compares three stress-strain configurations against a
144-direction/33-transition-node reference. The run dated 2026-08-04 used five structural fixtures
and 96 three-dimensional demand rays per fixture.

| Configuration | Points | Worst ray error over five fixtures | Build-time range |
|---|---:|---:|---:|
| legacy 19 x 24 fixed | 456 | 7.800% | 64-675 ms |
| 25 stations x 36 fixed | 900 | 1.791% | 172-1,874 ms |
| production 25 x 36 seed + adaptive | 1,400-2,500 | **0.521%** | 456-8,865 ms |

All 1,440 candidate ray intersections were found. Every production case reported angular
convergence and was more accurate than the legacy configuration. The benchmark deliberately shows
the cost: the quality increase is not free, especially for a dense tall section. Worker execution,
prepared-analysis caching, and result-staleness rules are therefore part of the product workflow.

`npm run bench:pipelines` independently compares the block configurations with a
96-state/144-direction block reference on the same five geometries:

| Equivalent-block configuration | Points | Worst ray error | Build-time range |
|---|---:|---:|---:|
| 19 initial states x 24 fixed | 481 | 4.988% | 37-117 ms |
| 37 initial states x 24 fixed | 673-697 | 2.079% | 61-189 ms |
| production 37-state/24-seed adaptive at 0.75% | 1,633-4,267 | **0.601%** | 249-2,271 ms |

The production block pipeline found every ray and reached its 0.75% station/direction targets. Its
0.601% worst error and the stress-strain pipeline's 0.521% worst error place the two independent
models at comparable sampling quality for this fixture set; equality of point counts is neither
required nor technically meaningful because the underlying state variables differ.

The production-faithful `bench:equivalent-block` matrix adds KDS and ACI versions of rectangle,
hollow, L-shaped, and disconnected-island sections. Across those eight cases, the worst faceted
surface-to-exact correction was 0.918%, all topologies were closed, all station/direction refinements
converged, exact residuals were below `7.4e-10`, and fixed-axial relative error was at most
`1.21e-13`. The fixed-axial benchmark uses the production 96x96 defaults plus event depths and took
34-54 ms/solve on the recorded machine. Reusing one surface for 20 load combinations gave an
estimated measured-component speedup of 5.15x-6.80x over rebuilding it for every combination.

The benchmark is a regression gate, not design-code validation. Code validation still requires
independent clause calculations, analytical sections, commercial-program comparisons with matched
assumptions, and signed review evidence.
