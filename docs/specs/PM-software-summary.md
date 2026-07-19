# Unified P-M-M Analysis Summary for Software Development

Source workbooks:
- `PM-basic (inverse).xlsx`: rectangular reinforced-concrete section, uniaxial P-M curve, plus inverse solving by Excel Solver and Newton-Raphson.
- `PM-advanced (4).xlsx`: arbitrary polygon section with holes and rebars, biaxial P-Mx-My calculation by rotating the section through several angles.

Core conclusion:

There is only one general problem: biaxial axial-force and bending interaction of an arbitrary reinforced-concrete section. A uniaxial P-M curve is a special meridian of the same P-Mx-My surface, usually with `My = 0` or with a fixed neutral-axis angle. A rectangular section is only a four-vertex polygon with no holes.

---

## 1. Problem Definition

Given:
- A concrete section boundary, possibly with holes.
- Discrete reinforcing bars with coordinates and diameters.
- Material properties: `fck`, `fy`, `Es`.
- Optional strength factors: `phi_c = 0.65`, `phi_s = 0.90`.

Compute:
- Forward capacity:
  - Uniaxial: interaction curve `(P, M)`.
  - Biaxial: interaction surface `(P, Mx, My)`.
- Inverse demand solution:
  - Given `(Pu, Mux, Muy)`, find the strain state that produces the internal resultants, or report that demand is outside capacity.

Main method:
- Plane sections remain plane.
- Concrete is integrated by fiber or strip mesh.
- Steel is treated as discrete bars.
- Concrete carries compression only.
- Steel carries compression and tension, with yield capping.

---

## 2. Coordinate System and Sign Conventions

Use a single convention everywhere.

| Item | Convention |
|---|---|
| Global origin | Gross concrete-section centroid, including holes, before considering steel |
| Global X | Positive to the right |
| Global Y | Positive upward |
| Strain | Compression positive, tension negative |
| Stress | Compression positive, tension negative |
| Axial force `P` | Compression positive, tension negative |
| Moment `Mx` | `Mx = sum(F * y)` |
| Moment `My` | `My = sum(F * x)` in the Excel convention |
| Concrete tension | Ignored, `fc = 0` when strain is negative |
| Rotation angle `theta` | Counterclockwise rotation of the section/work axis about the centroid |
| Neutral-axis depth `c` | Distance from the extreme compression fiber to the neutral axis, measured perpendicular to the neutral axis |

The Excel files use `Mx = sum(F*y)` and `My = sum(F*x)` without the usual structural-analysis sign flip sometimes used for one axis. For software, keep this convention internally and only transform signs at output if another external convention is required.

---

## 3. Unified Strain Field

The general biaxial strain field can be written in component form:

```text
epsilon(x, y) = epsilon0 + kx * (y - yc) - ky * (x - xc)
```

Where:
- `epsilon0` is strain at the centroid.
- `kx` is curvature contribution producing `Mx`.
- `ky` is curvature contribution producing `My`.
- `(xc, yc)` is the centroid. In the preferred centered coordinate system, both are zero.

Equivalent angle form:

```text
kappa = sqrt(kx^2 + ky^2)
theta = atan2(ky, kx)
y_theta = -(x - xc) * sin(theta) + (y - yc) * cos(theta)
epsilon = epsilon0 + kappa * y_theta
```

Interpretation:
- `theta = 0` gives `epsilon = epsilon0 + kappa*y`, the uniaxial case about the X axis.
- A uniaxial problem is not a separate algorithm. It is the general biaxial problem with a fixed angle, commonly `theta = 0`, and with the other moment component expected to be zero for symmetric geometry/loading.
- Negative bending can be represented by `theta + 180 degrees` while keeping `kappa >= 0`.

Neutral axis:

```text
epsilon = 0
y_theta_NA = -epsilon0 / kappa
c = y_theta_max - y_theta_NA
```

Where `y_theta_max` is the maximum projected coordinate in the compression direction.

When the extreme compression fiber is fixed at ultimate concrete strain `epsilon_cu`:

```text
kappa = epsilon_cu / c
epsilon0 = epsilon_cu - kappa * y_theta_max
```

For the rectangular basic workbook with centroid at zero and top fiber `h/2`:

```text
epsilon0 = epsilon_cu * (c - h/2) / c
kappa = epsilon_cu / c
```

---

## 4. Material Models

### 4.1 Concrete

The workbooks follow the KDS-style parabolic concrete stress block.

Derived parameters:

```text
epsilon_cu = min(0.0033 - (fck - 40)/100000, 0.0033)
epsilon_co = max(0.002  + (fck - 40)/100000, 0.002)
n          = min(1.2 + 1.5 * ((100 - fck)/60)^4, 2)
```

Concrete stress:

```text
if epsilon < 0:
    fc = 0
elif epsilon <= epsilon_co:
    fc = 0.85 * fck * (1 - (1 - epsilon/epsilon_co)^n)
else:
    fc = 0.85 * fck
```

Units:
- `fck`, `fc`: MPa = N/mm2.
- Strain is dimensionless.

### 4.2 Steel

Bare steel stress:

```text
fs = clamp(Es * epsilon_s, -fy, +fy)
```

Effective steel stress used in force summation:

```text
fs_eff = fs - concrete_deduction
```

Where:

```text
concrete_deduction = fc(epsilon_s) if epsilon_s >= 0 else 0
```

Reason:
- Concrete mesh integration includes the full concrete area, including the space occupied by bars.
- For compression bars, subtract concrete stress at the bar location to avoid double-counting displaced concrete.
- For tension bars, concrete stress is already zero, so no deduction is applied.

Steel force:

```text
Fs = fs_eff * As
As = pi * dia^2 / 4
```

Pure compression special case:

```text
fs_eff = fy - 0.85*fck
```

Pure tension:

```text
fs_eff = -fy
```

---

## 5. Geometry Model

Use the arbitrary-section model for all cases.

### 5.1 Rectangle as Polygon

A rectangular section `b x h` becomes:

```text
(-b/2, +h/2)
(+b/2, +h/2)
(+b/2, -h/2)
(-b/2, -h/2)
```

No separate rectangular integration path is required. The polygon strip algorithm will return constant width `b` for this case.

### 5.2 Polygon Area and Centroid

For each closed ring:

```text
D_i = x_i*y_{i+1} - x_{i+1}*y_i
A = 0.5 * sum(D_i)
Cx = sum((x_i + x_{i+1}) * D_i) / (3 * sum(D_i))
Cy = sum((y_i + y_{i+1}) * D_i) / (3 * sum(D_i))
```

Recommended implementation:
- Normalize ring orientation.
- Boundary area is positive.
- Hole areas are negative.
- Net area and centroid are area-weighted sums:

```text
A_net = A_boundary - sum(A_holes)
C_net = sum(A_ring * C_ring) / A_net
```

The Excel workbook uses absolute values for several area formulas and manually assigns hole areas as negative. Software should make this explicit and robust.

### 5.3 Rotation for Biaxial Meridians

For a given angle `theta`, rotate boundary, holes, and rebars about the centroid:

```text
x' = xc + (x - xc)*cos(theta) - (y - yc)*sin(theta)
y' = yc + (x - xc)*sin(theta) + (y - yc)*cos(theta)
```

The neutral axis is horizontal in the rotated frame. The section is then solved like a uniaxial problem in `y'`.

After finding strip centroids in the rotated frame, convert them back to global coordinates for moment summation:

```text
x = xc + (x' - xc)*cos(theta) + (y' - yc)*sin(theta)
y = yc - (x' - xc)*sin(theta) + (y' - yc)*cos(theta)
```

---

## 6. Strip/Fiber Integration for Arbitrary Sections

For each strain state `(epsilon0, kappa, theta)`:

1. Rotate geometry by `theta`.
2. Determine the mesh range.
3. Divide the range into horizontal strips.
4. For each strip, compute the concrete area inside the polygon minus holes.
5. Compute strain, stress, force, and moments.
6. Add steel bar forces and moments.

### 6.1 Mesh Range

Forward capacity points with the compression face fixed at `epsilon_cu`:

```text
Hmesh = min(c, section_depth)
```

Only the compression zone needs concrete integration.

Inverse solving with free `(epsilon0, kx, ky)`:

```text
Hmesh = full section depth
```

Tension strips naturally give `fc = 0`.

### 6.2 Strip Location

For `ny` strips:

```text
t = Hmesh / ny
y_i = y_top - (i - 0.5) * t
```

Use mid-strip evaluation, not strip edges.

### 6.3 Horizontal Line Intersection

At each strip elevation `y_i`, intersect the horizontal line with all polygon edges.

For edge `(x1, y1)` to `(x2, y2)`:

```text
a = y1 - y2
b = x2 - x1
c_line = x1*y2 - x2*y1
```

Line equation:

```text
a*x + b*y + c_line = 0
```

Intersection with `y = y_i`:

```text
x_int = (-b*y_i - c_line) / a
```

Rules:
- Skip horizontal edges where `a = 0`.
- Keep only intersections inside the edge segment.
- Deduplicate intersections at vertices with a tolerance.
- Sort intersections by `x`.
- Apply the even-odd rule:
  - segment 1-2 is inside,
  - 2-3 is outside,
  - 3-4 is inside,
  - and so on.

For each inside segment:

```text
length = x2 - x1
x_mid = (x1 + x2) / 2
area_segment = length * t
```

For the strip:

```text
Ac_i = sum(length_segments) * t
xbar_i = sum(length_segment * x_mid_segment) / sum(length_segments)
ybar_i = y_i
```

If no inside segment exists, skip the strip.

---

## 7. Section Response Kernel

All forward points and inverse iterations should call one kernel:

```text
section_response(epsilon0, kappa, theta, geometry, material, ny)
    -> Pc, Ps, Mxc, Mxs, Myc, Mys
```

Or in component curvature form:

```text
section_response(epsilon0, kx, ky, geometry, material, ny)
```

Concrete strip contribution:

```text
epsilon_i = epsilon0 + kappa * y_theta_i
fc_i = concrete_stress(epsilon_i)
Fc_i = fc_i * Ac_i
Pc += Fc_i
Mxc += Fc_i * y_global_i
Myc += Fc_i * x_global_i
```

Steel bar contribution:

```text
epsilon_s = epsilon0 + kappa * y_theta_bar
fs = clamp(Es * epsilon_s, -fy, +fy)
fs_eff = fs - (concrete_stress(epsilon_s) if epsilon_s >= 0 else 0)
Fs = fs_eff * As
Ps += Fs
Mxs += Fs * y_bar_global
Mys += Fs * x_bar_global
```

Nominal totals:

```text
P  = Pc + Ps
Mx = Mxc + Mxs
My = Myc + Mys
```

Factored totals:

```text
P_phi  = phi_c*Pc  + phi_s*Ps
Mx_phi = phi_c*Mxc + phi_s*Mxs
My_phi = phi_c*Myc + phi_s*Mys
```

Important: keep concrete and steel components separate until the final factoring step.

---

## 8. Forward Interaction Surface Workflow

### 8.1 Control Rebar

For each angle `theta`, identify the control tension bar:

```text
control bar = bar with minimum y_theta
C1 = y_theta_max - y_theta_control
```

This is the bar farthest from the compression face.

### 8.2 Unified Sweep Parameter

The Excel files use three sweep styles:
- `C/C1`
- `fs/fy`
- target steel strain `epsilon_s`

All can be unified as a target control-bar strain `epsilon_ctrl`.

Compression at the extreme fiber is fixed:

```text
epsilon_top = epsilon_cu
```

For a target control-bar strain `epsilon_ctrl`:

```text
c = epsilon_cu / (epsilon_cu - epsilon_ctrl) * C1
kappa = epsilon_cu / c
epsilon0 = epsilon_cu - kappa * y_theta_max
```

This formula works when compression is positive and tension is negative:
- `epsilon_ctrl = 0` gives `c = C1`.
- `epsilon_ctrl = -fy/Es` gives the balanced/yield point.
- More negative `epsilon_ctrl` moves toward pure tension.
- Positive `epsilon_ctrl` gives compression-controlled points with `c > C1`.

Legacy mapping:

| Excel control | Software equivalent |
|---|---|
| `C/C1 = r` | `c = r*C1`, then `epsilon_ctrl = epsilon_cu * (1 - C1/c)` |
| `fs/fy = r` in tension | `epsilon_ctrl = -r*fy/Es` |
| target `epsilon_s` | `epsilon_ctrl = -epsilon_s` |

Suggested default sweep:

```text
P0 pure compression
C/C1: 3, 2, 1.5, 1.2, 1
fs/fy: 0.25, 0.5, 0.75, 1.0
epsilon_s: 0.003, 0.005, 0.0075, 0.01, 0.015, 0.025, 0.03, 0.05
P pure tension
```

A program should allow additional interpolation/refinement for smoother curves.

### 8.3 Pure Compression

Uniform compression:

```text
epsilon = epsilon_cu
kappa = 0
Pc = 0.85 * fck * A_net
Ps = sum((fy - 0.85*fck) * As_j)
P = Pc + Ps
Mx = sum((fy - 0.85*fck) * As_j * y_j)
My = sum((fy - 0.85*fck) * As_j * x_j)
```

Concrete moment is zero if moments are taken about the concrete centroid. Steel moment may not be zero if the bar layout is asymmetric.

### 8.4 Pure Tension

Uniform tension:

```text
Pc = 0
Ps = sum(-fy * As_j)
P = Ps
Mx = sum(-fy * As_j * y_j)
My = sum(-fy * As_j * x_j)
```

### 8.5 Surface Assembly

For biaxial analysis:

```text
for theta in angles:
    compute one meridian curve: [(P, Mx, My), ...]
assemble all meridians into a P-Mx-My surface
```

The advanced workbook currently contains `0-degree`, `15-degree`, and `30-degree` sheets and states the design intent of sweeping from `0` to `360` degrees with `15` degree spacing. Software should support arbitrary angle spacing.

For uniaxial analysis:

```text
angles = [0 degrees]
```

For a full positive/negative uniaxial curve:

```text
angles = [0 degrees, 180 degrees]
```

Or include more angles if the section is asymmetric and the designer wants the true directional capacity.

---

## 9. Inverse Solver Workflow

Demand:

```text
Pu, Mux, Muy
```

General unknowns:

```text
x = [epsilon0, kx, ky]
```

Residual:

```text
R(x) = [
    P(x)  - Pu,
    Mx(x) - Mux,
    My(x) - Muy
]
```

Use Newton-Raphson:

```text
J * dx = -R
x_new = x + dx
```

The tangent matrix can be accumulated from the same fibers used for force integration.

For each fiber or bar:

```text
dF = Et * A * d_epsilon
d_epsilon = d_epsilon0 + y*d_kx - x*d_ky
```

Thus each contribution to the tangent matrix is based on:

```text
v = [1, y, -x]
J += Et * A * outer([1, y, x], v)
```

Use the exact residual sign convention implemented in code and verify numerically. Because the workbook's `My` convention is `sum(F*x)`, do not silently switch to `-sum(F*x)`.

Solver cases:

| Case | Unknowns | Notes |
|---|---|---|
| Pure axial | `epsilon0` only | If curvature is nearly zero, angle is meaningless |
| Uniaxial fixed angle | `epsilon0, kappa` | Equivalent to the `PM-basic` Newton sheet |
| Full biaxial | `epsilon0, kx, ky` | General software target |

Practical details from the basic workbook:
- Scale unknowns for numerical stability:
  - `epsilon0 * 1000`
  - `kappa * 1e6`
- Use full-height mesh during inverse iterations.
- Stop when residuals are within tolerance, e.g. relative error `<= 1e-4`.
- Use a maximum iteration count, e.g. 20 to 30.
- Add damping or line search if residual grows.
- If the demand is outside the interaction surface, return a clear "capacity exceeded" result rather than forcing convergence.

Post-processing:

```text
kappa = sqrt(kx^2 + ky^2)
theta = atan2(ky, kx)
y_NA = -epsilon0 / kappa
c = y_theta_max - y_NA
epsilon_max = max fiber strain
epsilon_min = min fiber strain
```

---

## 10. Mesh Convergence

The workbooks compare two mesh densities and check force and moment differences.

Recommended convergence loop:

```text
ny = 50 or 100
while ny <= 1000:
    response_1 = section_response(..., ny)
    response_2 = section_response(..., 2*ny)
    if relative_difference(P) <= 0.001 and relative_difference(M_resultant) <= 0.001:
        accept response_2
    ny *= 2
```

Use:

```text
M_resultant = sqrt(Mx^2 + My^2)
```

Minimum strip thickness:

```text
t >= 1 mm
```

Important numerical safeguards:
- Deduplicate polygon intersections with tolerance.
- Handle strip lines through vertices.
- Skip zero-length segments.
- Skip horizontal edges in intersection calculation.
- Avoid division by zero when `P` is near zero and eccentricity `e = M/P` is requested.
- Detect `kappa` near zero before computing neutral-axis depth.

---

## 11. Reference Values for Regression Tests

Use workbook values as regression tests.

From `PM-basic (inverse).xlsx`, rectangular sample:

```text
b = 400 mm
h = 600 mm
dia = 32 mm
fck = 30 MPa
fy = 400 MPa
Es = 200000 MPa
```

Important reference outputs:

```text
Pure compression P0 nominal:
P = 9433.098 kN
M = -69.274 kNm in the workbook sample due to asymmetric active bar rows

fs = 0 point:
P = 5998.868 kN
M = 615.476 kNm

Pure tension:
P = -3538.690 kN
M = 73.991 kNm
```

Inverse/Newton sample in the basic workbook:

```text
Demand approximately:
P = 2000 kN
M = 500 kNm

Solution approximately:
epsilon0 = 2.257259e-4
kappa = 3.136983e-6 1/mm
```

From `PM-advanced (4).xlsx`, arbitrary polygon sample:

```text
At theta = 0 degrees:
Pure compression P0 nominal P = 33981.434 kN
Factored P0 P = 23443.290 kN
```

Use these tests in stages:
1. Rectangle polygon at `theta = 0` must reproduce the basic workbook.
2. Advanced polygon at `theta = 0`, `15`, and `30` degrees must reproduce the advanced workbook.
3. Inverse fixed-angle solver must reproduce the basic Newton sheet.
4. Full biaxial inverse must reduce to fixed-angle uniaxial when `ky = 0` or `Muy = 0` on a symmetric section.

---

## 12. Recommended Software Architecture

```text
geometry/
  polygon_area_centroid()
  normalize_rings()
  rotate_geometry()
  horizontal_slices_at_y()
  rectangle_to_polygon()

materials/
  concrete_stress()
  concrete_tangent()
  steel_stress()
  steel_tangent()
  steel_effective_stress()

analysis/
  section_response()
  pure_compression_response()
  pure_tension_response()
  build_meridian(theta)
  build_interaction_surface(angles)
  solve_inverse_newton()
  mesh_convergence()

postprocess/
  factored_response()
  neutral_axis()
  strain_limits()
  utilization()
  export_curve_tables()
  plot_pm_curve()
  plot_p_mx_my_surface()
```

The most important design rule: do not create separate engines for uniaxial and biaxial problems. Implement one biaxial arbitrary-section engine. Uniaxial compression/bending is only a constrained call to that engine.

---

## 13. Implementation Checklist

- Use compression-positive signs consistently.
- Keep `Mx = sum(F*y)` and `My = sum(F*x)` to match the Excel files.
- Convert every rectangle into a polygon and use the same strip intersection logic.
- Keep concrete and steel resultants separate until strength factoring.
- Use effective steel stress in compression bars to avoid concrete double-counting.
- Mesh concrete at mid-strip locations.
- Use full-height mesh for inverse solving.
- Use compression-zone-only mesh for forward points controlled by `c`.
- Deduplicate polygon intersections before even-odd pairing.
- Treat holes as negative area or through even-odd intersection logic.
- Implement mesh convergence with both axial force and moment checks.
- Implement inverse solving in component curvature form `(epsilon0, kx, ky)`.
- Reduce the inverse solver to 2 unknowns for fixed-angle uniaxial checks.
- Build regression tests directly from the two workbooks before adding UI or plotting.

