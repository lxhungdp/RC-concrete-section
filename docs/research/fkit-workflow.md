# fkit / FiberKit Workflow Study

Repository: `https://github.com/wcfrobert/fkit`

Package name: `fiberkit`

Study date: 2026-07-17

Purpose:

This document summarizes the architecture, computational workflow, algorithms, strengths, limits, and reusable lessons from `wcfrobert/fkit` for future comparison against our own P-M-M column design software.

---

## 1. Project Identity

`fkit` is a Python fiber-section analysis toolkit. It is not primarily a code-check web app. It is a reusable numerical modeling library for sections made from fibers.

Declared scope:
- Moment-curvature analysis.
- P+M interaction analysis.
- Cracked moment of inertia.
- Stress/strain data for every fiber at every load step.
- Rich material models.
- Section builders for common shapes.
- Matplotlib and Plotly visualizations.

High-level design philosophy:

```text
fiber material models -> Section object -> analysis methods -> dataframes/plots
```

This is closer to the computational engine style we want, though it is not yet the arbitrary polygon P-M-M engine from our Excel study.

---

## 2. User Workflow

Typical `fkit` workflow:

1. Define material models.
2. Create a section manually or through `sectionbuilder`.
3. Preview the section.
4. Run moment-curvature analysis.
5. Extract fiber data.
6. Calculate cracked inertia if needed.
7. Run P-M interaction.
8. Plot/export results.

README quick-start pattern:

```python
import fiberkit as fkit

fiber_concrete = fkit.patchfiber.Hognestad(fpc=4, take_tension=True)
fiber_steel = fkit.nodefiber.Bilinear(fy=60, Es=29000)

section = fkit.Section()
section.add_patch(xo=0, yo=0, b=18, h=24, nx=25, ny=25, fiber=fiber_concrete)
section.add_bar_group(xo=2, yo=2, b=14, h=3, nx=4, ny=2,
                      area=0.6, perimeter_only=False, fiber=fiber_steel)

section.run_moment_curvature(phi_target=0.0003)
section.calculate_Icr(Es=29000, Ec=3605)
section.run_PM_interaction(fpc=4, fy=60, Es=29000)

fkit.plotter.plot_MK(section)
fkit.plotter.plot_PM(section)
```

This is an excellent example of a clean engineering API.

---

## 3. Core Object Model

Source module: `fiberkit/section.py`

Central class:

```text
Section
```

Key attributes:

```text
patch_fibers      area fibers, usually concrete
node_fibers       point fibers, usually rebar
area              total patch area
centroid          geometric centroid from patch fibers
ymax              top/extreme y coordinate
depth             total section depth

moment-curvature result arrays:
  curvature
  neutral_axis
  momentx
  momenty
  K_tangent

PM interaction:
  PM_surface
  df_PM_results
```

Key public methods:

```text
add_bar()
add_bar_group()
add_patch()
mesh()
run_moment_curvature()
calculate_Icr()
run_PM_interaction()
get_node_fiber_data()
get_patch_fiber_data()
get_all_fiber_data()
export_data()
```

Design lesson:

A `Section` object that owns geometry, fibers, analysis state, and exportable result tables is a strong pattern for a developer-facing library.

For our software, we may split state more strictly:

```text
SectionDefinition  -> immutable input geometry/material assignment
SectionMesh        -> generated fibers/slices
AnalysisResult     -> output history/tables
```

But `fkit` is a very useful starting mental model.

---

## 4. Fiber Types

### 4.1 Patch Fibers

Source module: `fiberkit/patchfiber.py`

Patch fibers:
- Have polygon vertices.
- Occupy area.
- Are mainly used for concrete, steel plates, wood, FRP, or any area material.
- Compute area and centroid by shoelace formula.

Base patch fiber stores:

```text
vertices
area
centroid
ecc
depth
tag
strain history
color history
```

Compression/tension sign convention in `fkit`:

```text
compression = negative
tension = positive
```

This is opposite to our Excel/KDS convention, where compression is positive.

### 4.2 Node Fibers

Source module: `fiberkit/nodefiber.py`

Node fibers:
- Have one coordinate and an assigned area.
- Are mainly used for rebars.
- Use the same stress-strain interface as patch fibers.

Base node fiber stores:

```text
coord
area
ecc
depth
tag
strain history
color history
```

### 4.3 Material Interface

Both patch and node fibers expose:

```text
stress_strain(strain)
color_map(strain, stress)
```

This is one of the best design ideas in `fkit`: analysis code does not need to know the exact material model. It only asks each fiber for stress at a strain.

Our own kernel should follow the same abstraction:

```text
Material.stress(epsilon)
Material.tangent(epsilon)
Material.color/state(epsilon) optional
```

---

## 5. Material Models

`fkit` supports a broad set of material models.

Concrete / patch-oriented models:
- Hognestad.
- Todeschini.
- Mander.

Steel/general models:
- Bilinear.
- Multilinear.
- Ramberg-Osgood.
- Menegotto-Pinto.
- Custom trilinear.

The models can be assigned to either patch fibers or node fibers where appropriate.

Important behavior:
- Hognestad and other concrete models use compression as negative.
- Concrete tension can be ignored or included depending on `take_tension`.
- Steel models can include hardening and fracture/maximum strain.

Lessons:
- Material models should be first-class objects.
- User-defined or multilinear materials are important for research and retrofit.
- Confined and unconfined concrete can be modeled simply by assigning different material objects to different fiber regions.

---

## 6. Section Creation Workflow

Source module: `fiberkit/sectionbuilder.py`

Users can create sections manually:

```python
sec = fkit.Section()
sec.add_patch(...)
sec.add_bar(...)
sec.add_bar_group(...)
```

Or through parametric builders:

```text
rectangular
rectangular_confined
circular
flanged
wall
wall_BE
wall_layered
wall_speedcore
wide_flange
W_AISC
```

Notable features:
- Rectangular sections with top/bottom bar groups.
- Confined core and unconfined cover.
- Circular sections approximated by trimming rectangular fibers based on radius.
- Flanged sections.
- Wall sections.
- Boundary element wall sections.
- Layered walls.
- SpeedCore-style composite wall.
- Steel wide-flange sections and AISC W-shape lookup.

Design lesson:

Parametric section builders are very valuable even if the underlying engine supports arbitrary polygons. Most users want fast creation of common engineering sections.

Our software should eventually have:

```text
core arbitrary geometry engine
plus sectionbuilder convenience layer
```

---

## 7. Meshing and Geometry Handling

`Section.add_patch()` creates a rectangular grid of quadrilateral patch fibers.

For each patch:

```text
vertices = [node1, node2, node3, node4, node1]
area and centroid = shoelace formula
```

`Section.mesh()`:

1. Computes total patch area.
2. Computes centroid from patch fibers.
3. Optionally rotates section by an angle.
4. Finds section `ymax` and depth.
5. Updates every fiber location:

```text
depth = section_ymax - fiber_y
ecc = [fiber_x - centroid_x, centroid_y - fiber_y]
```

Limit:

`fkit` does not implement arbitrary polygon slicing with holes in the way our Excel `PM-advanced` file does. It approximates geometry by assembling many quadrilateral fibers. That is general enough for many shapes, but holes/curved boundaries are handled by constructing/removing fibers, not exact strip intersection.

Lesson:

There are two viable geometry strategies:

1. Patch-fiber meshing:
   - Very flexible material-region assignment.
   - Easy to inspect every fiber.
   - Approximate geometry unless mesh is fine.

2. Strip intersection:
   - Exact width integration for polygon rings.
   - Efficient for P-M surface generation.
   - More complex when assigning multiple materials/regions.

Our own software may combine both:

```text
strip integration for fast capacity surfaces
patch fiber mesh for stress visualization, moment-curvature, and material regions
```

---

## 8. Moment-Curvature Algorithm

Source: `Section.run_moment_curvature()`

Algorithm documented in the source:

```text
0. Increment curvature from 0 to target curvature.
1. At each curvature, use secant method to search for neutral-axis depth.
2. Neutral axis is correct when force equilibrium is established.
3. For each fiber:
     calculate fiber depth from top
     calculate strain from curvature and NA depth
     calculate stress from fiber material
     calculate force = stress * area
     calculate moment = force * eccentricity
4. Record moment and move to next curvature.
```

Implementation details:

```text
phi_list = linspace(0, phi_target, N_step)
root = secant_method(verify_equilibrium, curvature)
verify_equilibrium(NA):
    sumF = sum(fiber force at curvature and NA)
    return sumF - P
```

At the converged neutral axis:

```text
for each patch fiber and node fiber:
    update(curvature, correct_NA, solution_found=True)
    accumulate Mx, My
```

The method stores:

```text
Curvature
Moment
NeutralAxis
MinorAxisMoment
Axial
Slope
```

Important note from source:

For asymmetric sections, minor-axis moment may develop even during nominally one-direction moment-curvature analysis, because the fixed neutral-axis orientation may not align with the resulting moment vector.

This is a valuable observation for our biaxial solver and reporting.

---

## 9. P-M Interaction Algorithm

Source: `Section.run_PM_interaction()` and `get_PM_data()`

This method performs ACI 318 P-M interaction using simplified code assumptions, independent of user-defined fiber material curves.

Key assumptions:
- Concrete uses rectangular stress block.
- Steel uses elastic-perfectly-plastic behavior.
- Extreme compression strain is `0.003`.
- Current implementation only uses rotations `0` and `180` degrees.

Source note:

```text
PM_surface key = degrees from 0 to 360
right now only 0 and 180
```

Algorithm:

```text
1. Mesh section.
2. Determine beta factor by ACI.
3. Generate 300 neutral-axis depths from near zero to 10*section depth.
4. Compute PM data for rotation 0.
5. Rotate section 180 degrees.
6. Compute PM data for rotation 180.
7. Rotate back.
8. Return dataframe with nominal and factored P, Mx, My.
```

For each neutral axis depth:

Concrete patch fiber:

```text
if fiber.depth <= beta*c:
    stress = -alpha*fpc
else:
    stress = 0
```

Node/rebar fiber:

```text
strain = 0.003 * (depth - c) / c
stress = strain * Es capped by fy
compression bar force includes displaced concrete correction:
    force = (stress + 0.85*fpc) * area
```

Then:

```text
P = sumF
Mx = sumMx
My = sumMy
phi = ACI strain-based factor
```

Strength reduction:

```text
phi_P = phi * P
phi_Mx = phi * Mx
phi_My = phi * My
```

Limit:

This is not a full P-Mx-My surface. It is a two-sided uniaxial P-M curve with some minor-axis moment tracking. For a true arbitrary biaxial engine, angles must sweep all directions and the strain field should be represented in `(epsilon0, kx, ky)` or `(epsilon0, kappa, theta)`.

---

## 10. Cracked Moment of Inertia

Source: `Section.calculate_Icr()`

This method runs after moment-curvature analysis.

Workflow:

1. Compute gross moment of inertia from patch fibers.
2. For each curvature step:
   - Include all node fibers transformed by modular ratio.
   - Include only patch fibers with nonzero stress.
   - Compute cracked centroid.
   - Compute cracked inertia from active fibers.
3. Add `Icr` and `Icr/Ig` to the moment-curvature result dataframe.

Lesson:

Once every fiber stores strain history, many derived engineering quantities become easy to calculate. This supports the idea of retaining rich fiber state for advanced modes.

---

## 11. Visualization and Data Transparency

Source: `fiberkit/plotter.py`

`fkit` provides:
- Material stress-strain preview.
- Material comparison plots.
- Section preview with patch and node fibers.
- Moment-curvature plots.
- 3D interactive moment-curvature visualization.
- P-M interaction plots.
- Icr plots.
- Animation support.

The 3D Plotly moment-curvature visualization builds frames of fiber states at each load step. This is a strong product idea:

```text
analysis results are not just numbers; they are inspectable fiber states
```

For our software:
- Store enough result data to visualize strain/stress state at selected points.
- Let users click an interaction point and see section stress blocks, steel stress, neutral axis, and controlling strain.

---

## 12. Sign Conventions

`fkit` convention:

```text
compression strain/stress = negative
tension strain/stress = positive
```

The README and source explicitly use this in fiber models.

Moment-curvature:

```text
strain = curvature * (-NA_depth + fiber.depth)
```

P-M interaction source note:

```text
+P = tension
-P = compression
+Mx compresses bottom fibers
-Mx compresses top fibers
```

This is opposite to the Excel/KDS convention we documented:

```text
compression positive
tension negative
P compression positive
```

Lesson:

If we borrow architecture or ideas from `fkit`, do not copy its sign convention blindly. Our kernel must expose a consistent internal sign convention and convert at adapters if needed.

---

## 13. Strengths

- Clean fiber-object abstraction.
- Strong separation between material models and section analysis.
- Very flexible material library.
- Easy developer-facing API.
- Parametric section builders for common shapes.
- Fiber-level data transparency.
- Moment-curvature solver is general and understandable.
- Cracked inertia calculation uses stored fiber states.
- Good visualization philosophy.
- MIT licensed and small enough to understand.

---

## 14. Limitations

- Compression sign convention differs from our target.
- P-M interaction is ACI rectangular-stress-block oriented, not the same as our parabolic/KDS Excel model.
- PM interaction only rotates 0 and 180 degrees in the inspected version.
- No exact arbitrary polygon-with-holes strip solver.
- No direct 3-variable inverse solver for `(Pu, Mux, Muy)`.
- Material region assignment is flexible through patches, but geometry authoring for arbitrary holes requires manual meshing/patch construction.
- More library/toolkit than complete design-code product.

---

## 15. Lessons for Our Software

Adopt:
- `Material.stress(epsilon)` abstraction.
- Patch fiber / node fiber separation.
- Section object with mesh/fiber data.
- Parametric section builders.
- Fiber state history for visualization and debugging.
- Moment-curvature solver based on curvature increments plus neutral-axis root finding.
- Plotly-style interactive inspection.
- Exportable dataframes/tables.

Improve:
- Use our own consistent compression-positive sign convention.
- Build a true biaxial P-M-M surface by sweeping all neutral-axis angles.
- Support exact arbitrary polygon/hole geometry from the Excel advanced model.
- Keep design-code phi rules outside the kernel.
- Add inverse `(epsilon0, kx, ky)` solver.
- Add load-combination and capacity-ratio workflows inspired by `concretedesignpy`.

Recommended hybrid architecture:

```text
fkit-style material and fiber objects
        +
Excel-derived arbitrary polygon P-M-M algorithm
        +
concretedesignpy-style API/report/check workflow
```

This combination is likely stronger than copying either project directly.

---

## 16. Source Files Read

- `README.md`
- `fiberkit/__init__.py`
- `fiberkit/section.py`
- `fiberkit/sectionbuilder.py`
- `fiberkit/patchfiber.py`
- `fiberkit/nodefiber.py`
- `fiberkit/plotter.py`

