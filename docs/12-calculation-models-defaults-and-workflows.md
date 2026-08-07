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
| Calculation profile | `kds-2024-stress-strain`, `en-1992-1-1-2004-stress-strain` or `custom-stress-strain` | `kds-142020-equivalent-block`, `aci-318-19-22-equivalent-block`, `as-3600-2018-amd2-equivalent-block` or `custom-equivalent-block` |
| Concrete state | stress is evaluated from strain at every integration point | constant compression stress acts only inside a clipped block of depth `a` |
| Concrete discretization | verified triangle/quadrature mesh | exact polygon/half-plane clipping; no concrete fiber mesh |
| Primary state variable | compatible strain plane `(eps0, kx, ky)` | block-normal angle and neutral-axis depth `c` |
| Forward problem | integrate concrete and steel stresses | clip the block, integrate its area/centroid, then add steel |
| Inverse problem | safeguarded Newton solve on strain-plane variables | bracketed scalar solves plus bounded angular search/refinement |
| Field result | full strain and full material stress over the section | full compatible strain; concrete stress only in `0 <= depth <= a` |

The models are separate packages because `sigma_c = f(eps_c)` and a code-equivalent block are
different constitutive statements. Sampling one with the other's equations would produce a smooth
number but not the resistance defined by the selected method.

The shared project convention is `Mx = sum(F*(y-y0))` and `My = sum(F*(x-x0))`. Both mechanics,
their workbooks, the demand solvers, plots, and field UI use these same component signs without a
backend-specific transform. The convention is tested on an asymmetric section so `My = 0` symmetry
cannot hide a regression.

### 1.1 User-defined concrete models and legacy Custom profiles

The current standard workflow does not present `Custom` as a Code. The selected Code exposes the
concrete models it permits. KDS stress-strain currently permits its default parabolic law or a
user-defined curve; the latter marks the Code profile modified and requires an audit reason.

The two schema-v1 `custom-*` profiles remain readable for backward compatibility. They run the same
kernel as their published siblings and change only where the parameters come from.

| Item | Published profile | Custom profile |
|---|---|---|
| Concrete model | fixed by the standard | user-selected among the models that mechanics can evaluate |
| `alpha`, `n`, `eps0`, `epsCu` | code table for `fck` | user input |
| `beta1`, block stress factor | code table for `fck` | user input on the `user-block` concrete model |
| Steel law | elastic-perfectly-plastic | elastic-perfectly-plastic, bilinear, or a user table |
| `phi` factors, transition rule, axial cap | code defaults, deviations need a narrative | user input, no narrative required |
| Status | `draft` pending named review | `user-defined`, outside the review ladder |

EN does not yet offer a generic user curve: design-material reevaluation needs a declared
characteristic-to-design curve transformation, and blindly scaling the entire tabulated curve would
incorrectly reduce elastic stiffness.

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

All profiles use `unified-27-v2`:

| Stations | Physical criterion |
|---|---|
| `P0` | exact uniform-compression pole |
| `P1...P6` | `c/D = 3, 2, 1.5, 1.2, 1.1, 1` |
| `P7...P25` | `εₛ/εy = 0, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7.5, 10, 20` |
| `P26` | exact uniform-tension pole |

Here `D` is the projected full section depth in the active direction. `εₛ` is the tensile-strain
magnitude at the controlling longitudinal bar and `εy` is that bar material's yield strain. The
schedule deliberately contains no automatically inserted strength-reduction transition point.
Design and nominal resistance use the same 27 fixed states. The five additional values around the
high-curvature yield range are fixed criteria, not adaptive results.

### 2.2 Direction default

The stress-strain model uses 36 uniform directions at 10 degrees. The production default is:

```text
stations                 = 27 fixed
directions               = 36 fixed
midpoint probes          = none
adaptive insertion       = none
```

An arbitrary typed vertical angle is evaluated as one new exact 27-station meridian. It is not added
to or used to rebuild the 3D surface. Fixed angles reuse the existing 36 meridians.

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

The equivalent-block pipeline consumes the same `unified-27-v2` criteria:

```text
fixed stations              = shared 27-station schedule
Design station refinement   = none
nominal stations            = the same 27 fixed states
automatic bar events        = none
seed directions             = 36
direction refinement        = none
```

For every strain-ratio criterion, the kernel solves `c` so the controlling longitudinal bar is at
the requested strain. It then applies the selected adapter's block law. A requested layer may
numerically equal a pole for a particular model; it remains part of the public 27-station schedule
but is omitted from the mesh topology to avoid degenerate triangles.

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

The KDS calculation mechanics and KDS resistance route are independent selections. Either KDS
mechanics can use the Main-body global-factor route or the KDS 14 20 20:2022 Appendix route. The
Appendix solves a characteristic reference surface and a reduced-material Design surface with
concrete/reinforcement multipliers `0.65/0.90`, uses `epsilon_c0` at pure compression and
`epsilon_cu` when the neutral axis is inside (with the compatible pivot between them), and checks
`e_min = 15 + 0.03h` on demand. It does not add the Main-body `phi` or axial cap.

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

Both mechanics can export their dedicated calculation workbook. Stress-strain projects additionally
provide concrete-mesh Excel/DXF audits. Equivalent-block projects export clipped-block geometry and
steel/resultant ledgers; they have no concrete integration-mesh export.

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

`npm run bench:strain-sampling` compares the fixed stress-strain dataset against a 144-direction
reference. `npm run bench:pipelines` does the same cross-model check with a dense equivalent-block
reference. Both production candidates preserve the canonical 27 × 36 grid exactly. The denser
reference is benchmark-only and does not change application results.

Each benchmark run prints its own fixed-grid differences and ray-hit rates; measured values are not
copied into this document because they depend on the case matrix and runtime revision. Acceptance
requires a 100% ray-hit rate. No resistance-factor or material-factor transition station is
inserted dynamically.

The production-faithful `bench:equivalent-block` matrix adds KDS and ACI versions of rectangle,
hollow, L-shaped, and disconnected-island sections. It uses the same fixed 27 stations, verifies
closed topology and station/direction convergence, compares faceted rays with exact refinement, and
checks direct fixed-axial roots. It does not insert resistance-transition stations. Surface
reuse for multiple load combinations remains part of the measured workflow.

The benchmark is a regression gate, not design-code validation. Code validation still requires
independent clause calculations, analytical sections, commercial-program comparisons with matched
assumptions, and signed review evidence.
