# Column Designer Benchmark and Product Requirements

Research date: 2026-07-17

Primary benchmark: Eagle Eye Column Designer, `https://eaglei.tech/column`.

Supporting benchmarks:
- CSiCol by Computers and Structures, Inc.
- Oasys ADC.
- CADS RC Column Designer.

Purpose:

This note translates market/product research into requirements for our own reinforced-concrete column P-M-M software. It should be read together with `PM-software-summary.md`, which defines the computational kernel.

---

## 1. What Eagle Eye Column Designer Appears to Be

Eagle Eye Column Designer is presented as a web-based reinforced-concrete column design and verification tool for axial-flexural members. Its product message is not only "calculate an interaction diagram"; it sells a complete workflow:

```text
materials -> geometry -> confinement -> reinforcement -> loading -> capacity -> moment-curvature -> reporting
```

The page positions the tool for:
- Building engineers: column and shear wall design, slenderness, 3D interaction.
- Bridge engineers: complex pier shapes and composite sections, ductility analysis.
- Retrofit specialists: existing RC capacity and strengthening/composite sections.
- Researchers and educators: interactive learning and visualization of column behavior.

Important implication for us:

The computational P-M-M engine is necessary, but not enough. The useful product is a structured engineering workflow around that engine.

---

## 2. Eagle Eye Feature Inventory

### 2.1 Materials

Eagle Eye highlights:
- Concrete properties.
- Mander confined and unconfined concrete models.
- Steel properties with Park strain-hardening.
- Custom stress-strain relationships.

What this means for us:
- Our current Excel-derived material model is enough for first P-M-M validation, but a serious product needs a material-model abstraction.
- We should support at least:
  - Unconfined concrete model from the current workbook.
  - Confined concrete model, likely Mander-type.
  - Elastic-perfectly-plastic steel.
  - Optional strain-hardening steel, such as Park or a multilinear curve.
  - User-defined stress-strain curves.

### 2.2 Geometry

Eagle Eye highlights:
- Arbitrary cross-section creation.
- Geometric properties and dimensions.
- Multiple parametric shapes: solid, hollow, flanged.
- Standard steel shapes for composite columns.
- Shape merging and subtracting.
- Holes and cutouts.
- Feature editing.
- Automatic section properties.
- ETABS import.
- CDB legacy import.

What this means for us:
- The arbitrary polygon engine from `PM-advanced (4).xlsx` is the right base.
- We also need a geometry authoring layer:
  - Parametric rectangle, circle, polygon, wall, T/L/I/flanged shapes.
  - Boolean operations: union, subtract holes, merge shapes.
  - DXF or at least CSV/JSON import for vertices.
  - Rebar pattern generators.
  - Section property report: area, centroid, Ix, Iy, Ixy, gross dimensions, reinforcement ratio.
- For MVP, manual JSON/table input is acceptable; for a real product, graphical editing becomes central.

### 2.3 Confinement

Eagle Eye highlights:
- Confinement region definition.
- Confined concrete model.
- Confining material properties.
- Spiral/tied reinforcement.
- Auto confinement.

What this means for us:
- Confinement is a major differentiator. It affects ductility and moment-curvature more than basic strength checks.
- We need to represent multiple concrete regions:
  - Cover concrete: unconfined.
  - Core concrete: confined.
  - Possibly multiple confinement zones.
- The fiber mesh must be able to assign each concrete fiber to a material region, not just one global concrete model.

### 2.4 Reinforcement

Eagle Eye highlights:
- Longitudinal rebar patterns.
- Bar size and spacing requirements.
- Rectangular/circular draw tools for simple plans.
- All-shape draw tools in paid tiers.

What this means for us:
- Do not force users to type every bar coordinate for common sections.
- Add generators:
  - Bars around rectangle perimeter.
  - Bars around circle.
  - Bars along wall boundary.
  - Custom point bars.
  - Multiple bar groups with different diameters.
- Add detailing checks:
  - Min/max reinforcement ratio.
  - Minimum spacing.
  - Cover.
  - Bar count and symmetry warnings.

### 2.5 Loading

Eagle Eye highlights:
- Load points.
- Axial loads and moments.
- Design load combinations.
- Design loads shown against capacity.

What this means for us:
- We need a load-combination table, not only one `(P, Mx, My)`.
- Each demand point should be plotted against the P-M-M surface.
- The software should compute:
  - Capacity ratio.
  - Governing load combination.
  - Nearest capacity point or utilization index.
  - Pass/fail with explanation.

### 2.6 Section Capacity

Eagle Eye highlights:
- Section properties.
- Elastic stresses.
- Interaction diagram.
- Animated interaction diagram.
- Multiple curves.
- Capacity ratios.
- Detailed results.
- Loading capacity.

What this means for us:
- We need both ultimate nonlinear capacity and elastic service-level checks.
- "Multiple curves" suggests comparison workflows:
  - Different `fck`.
  - Different `fy`.
  - Different reinforcement layouts.
  - Nominal vs factored.
  - Confined vs unconfined.
- For usability, every plotted capacity point should be inspectable:
  - `P, Mx, My`.
  - Neutral-axis angle.
  - `epsilon0, kx, ky`.
  - Max/min concrete strain.
  - Max/min steel strain.
  - Controlling bar.
  - Concrete/steel force components.

### 2.7 Moment-Curvature

Eagle Eye highlights:
- Moment-curvature.
- Moment-curvature details.
- Section stresses for loads.
- Max curvature plot.
- Axial load-strain plot.
- Ductility learning/animation content.

What this means for us:
- P-M-M surface is only the strength envelope. Engineers also need behavior/stiffness/ductility.
- Add a second analysis mode:
  - Fix axial load `P`.
  - Increase curvature along a selected bending direction.
  - Solve for `epsilon0` at each curvature so axial equilibrium is maintained.
  - Track moment, stiffness degradation, steel yielding, concrete crushing, ultimate curvature.
- Outputs:
  - `M-phi` curve.
  - Curvature at first steel yield.
  - Curvature at peak moment.
  - Ultimate curvature.
  - Ductility ratio.
  - Fiber stress/strain snapshots.

### 2.8 Slenderness and Second-Order Effects

Eagle Eye explicitly mentions slenderness and 3D interaction for building engineers. CADS also emphasizes effective height, slenderness ratio, end conditions, and stocky/slender columns.

What this means for us:
- The Excel workbooks solve cross-section capacity, not member stability.
- A useful column design product also needs member-level checks:
  - Clear height.
  - End conditions / effective length factors.
  - Braced vs unbraced / sway vs non-sway.
  - Moment magnification or second-order effects.
  - Minimum eccentricity.
  - Code-specific slenderness limits.
- This should be a separate layer above the section engine.

### 2.9 Reports and Export

Eagle Eye highlights:
- Simple report.
- Detailed report.
- Word and Excel export.
- Visual representation of cross-section.
- P-M and M-M interaction diagrams.
- Capacity point details.
- Moment-curvature, axial curvature, axial load, capacity ratio.

CADS similarly emphasizes headed calculation sheets, Word export, and AutoCAD detailing/schedules.

What this means for us:
- Reporting is not optional if the tool is for practicing engineers.
- Minimum report package:
  - Project metadata.
  - Inputs and units.
  - Code/material assumptions.
  - Geometry and reinforcement drawing.
  - Section properties.
  - Load combinations.
  - P-M-M interaction plots.
  - Demand/capacity checks.
  - Governing details.
  - Warnings and assumptions.
  - Validation/version hash.

### 2.10 Codes

Eagle Eye lists broad international code support:
- ACI 318-19
- CSA A23.3-14
- RCDF 2017
- Eurocode 2:2004
- BS 8110-97
- NTC 2008
- TS 500:2000
- IS 456:2000
- Chinese 2010
- KBC 2016
- Hong Kong CP-2013
- Singapore CP 65-99
- AS 3600-18
- NZS 3101:2006

What this means for us:
- Multi-code support is a product feature, but it should not be built into the numerical kernel.
- Structure the software as:

```text
kernel: geometry + fibers + generic material curves
code layer: material parameters, phi factors, strain limits, minimum eccentricity, slenderness rules, detailing limits
report layer: code-specific wording and pass/fail checks
```

For our current context, KDS/KBC-oriented behavior is probably the first target because the Excel workbooks use Korean-standard material parameters.

---

## 3. Comparison With Other Column Design Tools

### 3.1 CSiCol

CSiCol markets itself as a comprehensive column analysis/design package for concrete, reinforced concrete, and composite cross-sections. It includes a Quick Design Wizard, ETABS import, predefined parametric shapes, hollow/flanged shapes, standard steel shapes, text/DXF shape import, multiple P-M or M-M curves, and reports.

Lesson:
- Any-shape cross-section + composite section + ETABS import + report is a mature-market expectation.
- DXF/text import should be on our roadmap.
- Multiple curve overlay is valuable for design comparison.

### 3.2 Oasys ADC

ADC is broader than columns: beams, slabs, columns, piles. For columns, it emphasizes axial loads and end moments, automatic eccentricity effects, and reinforcement options satisfying structural and detailing criteria.

Lesson:
- Users often want "design mode", not just "check mode".
- Design mode proposes reinforcement arrangements; check mode verifies a chosen arrangement.
- We should eventually support both:
  - Check existing section.
  - Auto-search reinforcement layouts.

### 3.3 CADS RC Column Designer

CADS emphasizes fast input, end conditions, effective height and slenderness, cover calculator, design/check modes, economical reinforcement selection, headed calculation sheets, Word export, and AutoCAD detailing/schedules.

Lesson:
- Member-level design and constructability are expected in engineering workflows.
- Detailing and report automation can matter as much as numerical sophistication.

---

## 4. Gap Analysis Against Our Current Excel-Derived Understanding

What we already understand well:
- Fiber/strip integration.
- Arbitrary polygon with holes.
- Biaxial P-Mx-My as the general problem.
- Uniaxial as a constrained biaxial case.
- Nominal and factored capacity.
- Steel effective stress with concrete deduction.
- Newton inverse solving concept.

What we still need to add:

| Area | Missing capability |
|---|---|
| Geometry UI | Parametric section library, graphical editing, booleans, DXF/import |
| Materials | Confined concrete, strain hardening steel, custom curves |
| Region modeling | Multiple concrete regions and material assignment per fiber |
| Reinforcement | Pattern generators, spacing/cover/detailing checks |
| Loads | Load combination table, demand plotting, governing combination |
| Design mode | Automatic reinforcement search/optimization |
| Slenderness | Effective length, braced/unbraced, second-order/magnification checks |
| Moment-curvature | Full behavioral curve at fixed axial load |
| Visualization | 2D section, 3D P-M-M surface, M-M slices, animated interaction |
| Reporting | Simple/detailed reports, Word/Excel/PDF export |
| Validation | Benchmarks against Excel, hand examples, code examples, regression suite |
| Import/export | ETABS later, DXF/CSV/JSON first |

---

## 5. Recommended Product Roadmap

### Stage 1 - Calculation Kernel

Goal: reproduce the two Excel files reliably.

Required:
- Arbitrary polygon with holes.
- Discrete rebars.
- Current KDS-style material model.
- P-Mx-My surface by angle sweep.
- Fixed-angle uniaxial curve.
- Nominal/factored results.
- Mesh convergence.
- Regression tests.

Deliverable:
- CLI or library function returning tables and plots.

### Stage 2 - Engineer-Usable Check Tool

Goal: make the kernel usable for a real design/check workflow.

Required:
- JSON/table project input.
- Load combination table.
- Capacity ratio.
- Governing load case.
- Section drawing.
- P-M and M-M plots.
- Simple report.

Deliverable:
- Desktop/web prototype for "check mode".

### Stage 3 - Geometry and Reinforcement Authoring

Goal: reduce input friction.

Required:
- Parametric shapes.
- Holes/cutouts.
- Rebar pattern generators.
- Section property calculation.
- Import/export JSON/CSV; later DXF.

Deliverable:
- Visual section editor.

### Stage 4 - Advanced Behavior

Goal: match the differentiators seen in Eagle Eye.

Required:
- Confined concrete regions.
- Mander model.
- Strain-hardening steel.
- Moment-curvature analysis.
- Ductility metrics.
- Fiber stress/strain visualization.

Deliverable:
- Research/advanced engineering mode.

### Stage 5 - Member Design and Automation

Goal: move from section checker to column designer.

Required:
- Slenderness and second-order effects.
- Design/check mode split.
- Auto reinforcement search.
- Code-specific detailing rules.
- Report export.
- ETABS/DXF integration.

Deliverable:
- Practical competitor to commercial column-design workflows.

---

## 6. Key Design Decision

The kernel should remain code-agnostic and geometry-general:

```text
arbitrary section + material curves + strain field -> response
```

Everything else should be layered:

```text
code rules -> design assumptions -> detailing checks -> reports -> UI workflows
```

This keeps the core clean and allows the product to grow from KDS/KBC validation into ACI, Eurocode, and other design-code modules later.

---

## 7. MVP Scope Recommendation

For our next implementation step, build the following:

1. General P-Mx-My kernel from `PM-software-summary.md`.
2. Input schema for:
   - boundary polygon,
   - holes,
   - rebars,
   - materials,
   - load combinations.
3. Output:
   - P-Mx-My point table,
   - P-M curve at selected angle,
   - Mx-My slices at selected axial loads,
   - demand/capacity ratio,
   - governing load case.
4. Validation:
   - reproduce `PM-basic (inverse).xlsx`,
   - reproduce `PM-advanced (4).xlsx` at 0, 15, and 30 degrees.

Do not start with:
- ETABS import,
- full report writer,
- auto design,
- all international codes,
- confinement,
- slenderness.

Those are important, but they are second-layer product features. First, the response kernel and validation must be very solid.

---

## 8. Sources

- Eagle Eye Column Designer: `https://eaglei.tech/column`
- CSiCol product page: `https://www.csiamerica.com/products/csicol`
- Oasys ADC product page: `https://www.oasys-software.com/products/structural-software/adc/`
- CADS RC Column Designer: `https://cads.co.uk/portfolio-item/rc-column-designer/`

