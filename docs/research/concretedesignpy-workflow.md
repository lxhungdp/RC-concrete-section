# ConcreteDesignPy Workflow Study

Repository: `https://github.com/albertp16/concretedesignpy`

Study date: 2026-07-17

Purpose:

This document summarizes the architecture, computational workflow, algorithms, strengths, limits, and reusable lessons from `albertp16/concretedesignpy` for future comparison against our own P-M-M column design software.

---

## 1. Project Identity

`concretedesignpy` is a Python reinforced-concrete design library plus Flask web application. It is oriented toward practical code-based calculators rather than being only a numerical fiber engine.

Declared scope:
- NSCP 2015.
- ACI 318-19 / ACI 318M-14.
- Beam flexure, shear, torsion, deflection.
- Column P-M and P-M-M interaction.
- Moment-curvature.
- Mander confined concrete.
- Joint shear.
- Development length.
- Web app with Plotly, MathJax, and print-ready calculation reports.

Project structure from README:

```text
concretedesignpy/
  calculators/
    beam_moment.py
    beam_shear.py
    beam_torsion.py
    beam_deflection.py
    column_interaction.py
    column_biaxial.py
    column_flexural.py
    joint_shear.py
    mander.py
    moment_curvature.py
    development_length.py
    alternative_inertia.py
    rebar_layout.py
    diagrams.py
  webapp/
    app.py
    routes/
    templates/
    static/
```

High-level design philosophy:

```text
engineering calculator modules -> Flask API routes -> web UI/reporting
```

This is closer to a product/workflow app than a pure section-analysis kernel.

---

## 2. User Workflow

The typical column workflow is:

1. User enters rectangular column geometry.
2. User enters material strengths and reinforcement layout.
3. Backend generates bar coordinates.
4. Backend computes uniaxial P-M or biaxial P-M-M interaction.
5. Optional load combinations are checked against capacity.
6. Results are returned to the web app as JSON.
7. Frontend plots diagrams and displays checks/reports.

For uniaxial column interaction:

```text
POST /column/interaction
  input:
    b, h, fc, fy, cover, d_bar, n_bars or manual_bars
    optional load combinations
  calculator:
    generate_interaction_diagram()
    check_capacity()
  output:
    P-M points, phi factors, capacity check, rebar layout SVG
```

For biaxial column interaction:

```text
POST /column/biaxial
  input:
    b, h, fc, fy, cover, d_bar, nx, ny
    n_angles, n_c_values, nx_fibers, ny_fibers
    optional load combinations
  calculator:
    generate_biaxial_diagram()
    check_biaxial_capacity()
    extract_contour_at_pu()
  output:
    P-M-M surface points, Mx-My contours, capacity checks, section SVG
```

---

## 3. Uniaxial P-M Algorithm

Source module: `concretedesignpy/calculators/column_interaction.py`

The uniaxial interaction algorithm is ACI/ShortCol-style and rectangular-section-specific.

### 3.1 Inputs

```text
fc, fy
b, h
n_bars, d_bar, cover, tie diameter
optional custom bar depths and areas
n_points or c_step
confinement = tied or spiral
ecu = 0.003
```

Bars are represented by distances from the compression face, not full 2D coordinates for the uniaxial case.

### 3.2 Concrete Model

The uniaxial P-M interaction uses the Whitney rectangular stress block:

```text
beta1 = 0.85                      if fc <= 28 MPa
beta1 = max(0.85 - 0.05*(fc-28)/7, 0.65)   if 28 < fc < 55 MPa
beta1 = 0.65                      if fc >= 55 MPa
```

For each neutral-axis depth:

```text
a = beta1 * c
a_eff = min(a, h)
Cc = 0.85 * fc * a_eff * b
ycc = a_eff / 2
```

This is simpler than our Excel-derived parabolic/fiber concrete integration.

### 3.3 Steel Model

Linear strain compatibility:

```text
es_k = ecu * (c - ds_k) / c
fs_k = clamp(es_k * Es, -fy, +fy)
```

Compression bars subtract displaced concrete when they fall inside the Whitney stress block:

```text
fc_at_bar = 0.85 * fc if ds_k <= a_eff else 0
F_bar = As_k * (fs_k - fc_at_bar)
```

This is the same important double-counting correction used in our Excel interpretation.

### 3.4 Resultants

Compression positive:

```text
Pn = Cc + sum(F_bar)
Mn = Cc * (yc - ycc) + sum(F_bar * (yc - ds_k))
```

Where `yc = h/2` from the compression face.

### 3.5 Strength Reduction

ACI phi factor is based on extreme tension steel strain:

```text
compression-controlled:
  phi = 0.65 for tied columns
  phi = 0.75 for spiral columns

tension-controlled:
  phi = 0.90

transition:
  linear interpolation
```

Pure compression cap:

```text
Po = 0.85*fc*(Ag - Ast) + fy*Ast
Pn,max = 0.80*Po for tied
Pn,max = 0.85*Po for spiral
```

Factored values:

```text
Pu = phi * min(Pn, Pn,max) if compression
Mu = phi * Mn
```

This differs from our Excel/KDS workflow, where concrete and steel are factored separately (`phi_c`, `phi_s`). For our software, this confirms that strength reduction should live in a code-rule layer, not inside the numerical kernel.

### 3.6 Capacity Check

The demand check is simple interpolation:

1. Sort interaction points by `Pu`.
2. Find the two points bracketing demand `Pu`.
3. Interpolate `phi_Mn`.
4. Compute:

```text
D/C = Mu_demand / phi_Mn_capacity
```

This is practical for web UI and load-combination checks, but it is only a 2D uniaxial check.

---

## 4. Biaxial P-M-M Algorithm

Source module: `concretedesignpy/calculators/column_biaxial.py`

This is the closest part to our target P-M-M problem, but it is still limited to rectangular sections.

### 4.1 Geometry

The section is a rectangle centered at `(0, 0)`.

Concrete is discretized into a regular 2D grid:

```text
dx = b / nx_fibers
dy = h / ny_fibers
fiber_area = dx * dy
fiber centers = meshgrid over the rectangle
```

Rebars are generated around the rectangular perimeter:

```text
top face: nx bars
bottom face: nx bars
side faces: ny - 2 intermediate bars on each side
```

This is much simpler than arbitrary polygon slicing.

### 4.2 Neutral-Axis Angle Sweep

The algorithm sweeps neutral-axis normal angle from `0` to `180` degrees:

```text
angles = linspace(0, pi, n_angles + 1)
```

For each angle:

```text
projection = x*cos(theta) + y*sin(theta)
d_max = max(corner projections)
d_min = min(corner projections)
section_depth = d_max - d_min
fiber_dist = d_max - fiber_projection
bar_dist = d_max - bar_projection
```

This is conceptually similar to our unified biaxial strain-field approach.

### 4.3 Capacity Calculation

For each neutral-axis depth `c`:

```text
a = beta1 * c
in_block = fiber_dist <= a
concrete_force = 0.85 * fc * fiber_area for in-block fibers
```

Bar strain:

```text
bar_strain = ecu * (c - bar_dist) / c
bar_stress = clamp(bar_strain * Es, -fy, +fy)
```

Concrete displacement correction:

```text
fc_at_bar = 0.85 * fc if bar_dist <= a else 0
bar_force = As * (bar_stress - fc_at_bar)
```

Resultants:

```text
Pn  = sum(concrete_forces) + sum(bar_forces)
Mnx = sum(F * y)
Mny = sum(F * x)
```

Strength reduction:

```text
phi = ACI strain-based phi
Pu  = phi * capped(Pn)
Mux = phi * Mnx
Muy = phi * Mny
```

### 4.4 Mx-My Contours and Capacity Check

To check a demand `(Pu, Mux, Muy)`:

1. Extract the Mx-My contour at the demand axial load `Pu`.
2. Interpolate within each angle group.
3. Mirror contour points from `0-180` to `180-360`.
4. Convert demand moment vector to polar form.
5. Find/interpolate capacity radius at the demand angle.
6. Compute:

```text
D/C = sqrt(Mux^2 + Muy^2) / capacity_radius
```

This is a useful practical method for demand checks against a P-M-M surface.

### 4.5 Limitations Relative to Our Target

The biaxial module:
- Uses only rectangular geometry.
- Uses Whitney stress block, not nonlinear parabolic concrete fibers.
- Uses rectangular grid fibers, not polygon/hole intersection slices.
- Does not support arbitrary holes/cutouts.
- Does not support multiple concrete material regions.
- Does not implement an inverse Newton solver for `(epsilon0, kx, ky)`.
- Uses ACI-specific phi logic inside the calculation function.

Useful lesson:

The contour-at-Pu method is a good product-level capacity check layer after the surface is generated.

---

## 5. Moment-Curvature Workflow

Source module: `concretedesignpy/calculators/moment_curvature.py`

There are two modes.

### 5.1 Quick 6-Point Mode

Function:

```text
moment_curvature_analysis()
```

This is a closed-form rectangular beam/section calculation:

1. Before cracking.
2. After cracking.
3. Elastic limit at `0.45fc`.
4. Steel yielding.
5. Concrete peak strain.
6. Concrete ultimate strain.

It computes:
- Gross inertia `Ig`.
- Transformed inertia `It`.
- Cracked inertia `Icr`.
- Modular ratio.
- Cracking moment.
- Yield and ultimate points.

This is fast and report-friendly, but not general enough for arbitrary P-M-M sections.

### 5.2 Advanced Incremental Fiber Mode

Function:

```text
moment_curvature_advanced()
```

Supports:
- Hognestad concrete.
- Mander concrete via `mander_params`.
- Axial load.
- Compression steel.
- Polygon width variation through `polygon_width_at()`.
- Optional top/bottom steel plates for retrofit/composite strengthening.
- Event detection: cracking, steel yield, peak moment, ultimate.
- Ductility ratio.
- Fiber stress/strain plot data.

Algorithm:

```text
for each top concrete strain increment:
    binary search neutral-axis depth c
    for each trial c:
        integrate concrete strips
        add tension steel
        add compression steel
        add external plates if present
        enforce axial equilibrium
    record curvature phi = ec_top / c
    record moment
    detect events
```

This is an excellent reference for our future moment-curvature layer.

Important difference:
- It solves only a uniaxial section direction.
- Polygon support is width-at-y based, not full arbitrary biaxial geometry.

---

## 6. Mander Confined Concrete

Source module: `concretedesignpy/calculators/mander.py`

This module computes confined concrete parameters transparently:

Inputs:

```text
fc
fy_transverse
b, h
cover
main bar diameter
tie diameter
number of bars along x/y
tie spacing
number of tie legs along x/y
```

Outputs:

```text
core dimensions bc, dc
transverse steel ratios rho_x, rho_y
longitudinal steel ratio in confined core
clear bar spacings
effective confined core area
confinement effectiveness ke
lateral confining stresses fl_x, fl_y
confined strength fcc
confined peak strain ecc
ultimate strain ecu
Mander curve parameters r
stress-strain curve points
```

This is product-quality because it returns intermediate quantities, not just final `fcc`. That makes reports auditable.

Lesson for our software:

Confined concrete should be implemented as a reportable calculation object with intermediate steps, not a hidden material parameter.

---

## 7. Web Application Pattern

`concretedesignpy` exposes calculator functions through Flask routes. The route layer:

- Parses JSON.
- Converts UI-specific input into calculation input.
- Calls the calculator.
- Adds load-combination checks.
- Adds SVG section drawings.
- Removes heavy details from response payload where needed.
- Returns JSON to frontend.

Example pattern:

```text
route input -> normalize units/input -> run calculator -> add checks/plots -> jsonify
```

This is a useful architecture for our eventual app:

```text
core engine is pure Python
API layer handles UI payload and reporting needs
frontend consumes JSON and plots
```

---

## 8. Sign Conventions

The repository is not fully consistent across modules:

Uniaxial `column_interaction.py`:
- Compression positive.
- Tension negative.
- Moment about gross centroid.

`fkit`-like style is not used here.

Biaxial `column_biaxial.py`:
- Compression positive in strain/stress comments.
- Uses `Mnx = sum(F*y)` and `Mny = sum(F*x)`.

Important:

Our own software must define signs once and enforce them across all modules. `concretedesignpy` is a reminder that product calculators can drift if each module evolves independently.

---

## 9. Strengths

- Practical engineering scope, not just numerical analysis.
- Strong web-app orientation.
- Good load-combination overlay/check concept.
- Includes both uniaxial and biaxial column interaction.
- Includes moment-curvature and Mander confinement.
- Report/audit mindset through MathJax and formula substitution.
- SVG section diagram generation.
- ACI/NSCP code-check layer already represented.
- Simple JSON endpoints that map well to a future web UI.

---

## 10. Limitations

- Column P-M/P-M-M is largely rectangular-section-focused.
- Biaxial P-M-M uses Whitney block and rectangular grid, not arbitrary polygon with holes.
- Code rules are mixed directly into calculator functions.
- No general material-region fiber engine for columns.
- No general inverse solver for arbitrary `(Pu, Mux, Muy)`.
- No arbitrary section boolean geometry engine.
- The biaxial surface is a generated surface plus contour check, not a direct 3-variable equilibrium solve.

---

## 11. Lessons for Our Software

Adopt:
- Flask/API-style separation between calculator and UI payload.
- Load-combination checking against generated interaction curves/surfaces.
- Mx-My contour extraction at target `Pu`.
- Report-friendly intermediate values.
- Mander confinement as a transparent sub-report.
- Moment-curvature event detection and ductility metrics.
- SVG/visual section outputs.

Avoid or improve:
- Do not hard-code ACI phi logic inside the response kernel.
- Do not restrict geometry to rectangles.
- Do not use separate sign conventions per module.
- Do not duplicate uniaxial and biaxial engines.
- Do not rely only on Whitney block if our validated target is parabolic/fiber integration.

Suggested integration into our roadmap:

```text
Stage 1:
  Use our Excel-derived arbitrary polygon P-M-M kernel.

Stage 2:
  Add concretedesignpy-style API endpoints and load-combination checks.

Stage 3:
  Add Mx-My contour extraction and demand/capacity ratio.

Stage 4:
  Add Mander confinement and moment-curvature with event detection.

Stage 5:
  Add code modules such as ACI/KDS as replaceable rule layers.
```

---

## 12. Source Files Read

- `README.md`
- `concretedesignpy/calculators/column_interaction.py`
- `concretedesignpy/calculators/column_biaxial.py`
- `concretedesignpy/calculators/moment_curvature.py`
- `concretedesignpy/calculators/mander.py`
- `concretedesignpy/webapp/routes/column.py`

