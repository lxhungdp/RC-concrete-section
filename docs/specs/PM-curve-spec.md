# P–M Interaction Curve Calculation Spec for RC Sections
### Basis for program development — compiled from `PM-basic (inverse).xlsx` and `PM-advanced (4).xlsx`

> Reference standard: **KDS 24 14 21 : 2025** (Korea Standard), clause 3.1.2.5 (2)
> Units: mm, N, MPa (N/mm²), Nmm — reported results: kN, kNm

---

## 1. Problem Statement

Given an arbitrary RC section (rectangular, or polygon with holes) under eccentric compression/tension:

1. **Forward problem:** build the **P–M** interaction curve (uniaxial bending) or the **P–Mx–My** interaction surface (biaxial bending) — the locus of nominal axial force / moment pairs at the ultimate limit state.
2. **Inverse problem:** given a demand pair (Pu, Mu) → find the strain state (ε₀, κ), neutral axis position, and extreme fiber strains.

**Method:** fiber method / mesh integration
- Plane sections remain plane (Bernoulli): strain varies linearly over the depth.
- The concrete compression zone is divided into strips parallel to the neutral axis; stresses are integrated numerically.
- Steel is treated as discrete bars.

---

## 2. Sign Conventions and Coordinate System

| Quantity | Convention |
|---|---|
| Origin | **Centroid of the gross section** |
| X axis | horizontal, positive to the right |
| Y axis | vertical, positive upward |
| Strain ε | **compression positive (+), tension negative (−)** |
| Stress | compression positive (+), tension negative (−) |
| Axial force P | compression positive (+), tension negative (−) |
| Moment Mx | positive when the top fibers (y > 0) are more compressed: Mx = Σ F·y |
| Moment My | My = Σ F·x |
| Compression face | **topmost** fiber (y = +h/2 for rectangle; y = Ymax for polygon) |
| c (neutral axis depth) | measured **downward from the top compression face**, positive |
| Rotation angle p | degrees, positive counterclockwise, about the centroid |

**Plane strain equation (uniaxial):**

```
ε(y) = ε0 + κ·y
```
- `ε0` : strain at the reference axis (centroid, y = 0)
- `κ`  : curvature (1/mm), positive when the top fiber is more compressed than the bottom
- Neutral axis: `y_NA = −ε0/κ` (from centroid) ; `c = h/2 + ε0/κ` (from compression face, rectangular section)

When the neutral axis lies within the section and the compression face reaches εcu:
```
ε0 = εcu · (c − h/2) / c        κ = εcu / c
```
(more general form: ε0 = εcu − κ·y_top, κ = εcu/c, where y_top is the compression face coordinate)

---

## 3. Material Models (KDS 24 14 21)

### 3.1 Concrete — parabolic stress–strain

Parameters as functions of fck:
```
εcu = MIN( 0.0033 − (fck − 40)/100000 , 0.0033 )      # ultimate strain
εco = MAX( 0.002  + (fck − 40)/100000 , 0.002  )      # strain at parabola peak
n   = MIN( 1.2 + 1.5·((100 − fck)/60)^4 , 2 )         # parabola exponent
```

Stress–strain relationship (0.85 factor already included):
```
0 ≤ εc ≤ εco :   fc = 0.85·fck · [ 1 − (1 − εc/εco)^n ]
εc > εco     :   fc = 0.85·fck
εc < 0 (tension) : fc = 0                              # concrete carries no tension
```
Original Excel formula:
`fc = IF(ε>=0, IF(ε<=eco, 1-(1-ε/eco)^n, 1), 0) * 0.85 * fck`

### 3.2 Steel — elastic–perfectly plastic

```
fs = ε·Es , capped in [−fy, +fy]      →  fs = MAX(MIN(ε·Es, fy), −fy)
```

**Effective stress of steel in the compression zone** (subtract the concrete displaced by the bar, to avoid double counting since concrete strips are integrated over the full width):
```
fs_eff = MAX(MIN(ε·Es, fy), −fy) − IF( ε·Es ≥ 0 , fc(ε) , 0 )
Fs     = fs_eff · As
```
where fc(ε) is the concrete stress at the same strain level as the bar.
Special case pure compression (P0): `fs_eff = fy − 0.85·fck`.

### 3.3 Resistance factors (factored values)

```
φc = 0.65 (concrete)      φs = 0.9 (steel)
P_factored = 0.65·P_concrete + 0.9·P_steel     (same for M)
```
→ Therefore P and M must be **accumulated separately for concrete and steel** throughout the entire calculation.

---

## 4. Discretization (Mesh) and Convergence Criteria

- Divide the **compression zone** (from the compression face down to the neutral axis, mesh height `Hmesh = MIN(c, h)`) into `ny` equal strips of thickness `t = Hmesh/ny`.
- Evaluation point of strip i is at **mid-strip**:
  - Rectangle (measured from compression face): `di = t·(i − 0.5)` → `y_i = h/2 − di`
  - Polygon: `y_i = Ymax − (i − 0.5)·t`
- Each strip: `ε_i = ε0 + κ·y_i` → `fc_i` → `Fc_i = fc_i·Ac_i` → `Mc_i = Fc_i·y_i`
- Steel: each bar individually, at its true coordinates (not meshed).

**Mesh convergence criterion:** run two meshes (e.g. ny and 2ny); converged when
```
|ΣF₁ − ΣF₂|/ΣF₁ ≤ 0.1%   and   |ΣM₁ − ΣM₂|/ΣM₁ ≤ 0.1%
```
- Mesh sizes surveyed: 50, 100, 200, 400, 600, 800, max 1000.
- Minimum strip thickness: 1 mm.
- The Excel files use ny = 50 (basic, P–M points) and 100 (inverse); conclusion: ny = 100 is sufficiently converged.

**Force resultants:**
```
P  = ΣFc_i + ΣFs_j          (tension steel is automatically negative via fs_eff)
M  = ΣFc_i·y_i + ΣFs_j·y_j
```

---

## 5. Workflow FILE 1 — `PM-basic (inverse).xlsx` (rectangular, uniaxial bending)

### 5.0 Input data (Input sheet)
- b × h (400×600), coordinates of each rebar (X, Y relative to centroid), common diameter dia → As = π·dia²/4 per bar.
- fck, fy, Es; derive εcu, εco, n.
- Named ranges: `b, h, dia, As, fck, fy, Es, ecu, eco, n, pc, ps`.

### 5.1 Point P0 — pure compression / pure tension (P0 sheet)
Neutral axis at infinity, uniform strain = εcu (compression) or large tension:
```
Pure compression:  Pc = 0.85·fck·Ac        Ps = Σ (fy − 0.85·fck)·As_j
                   M  = Σ Fs_j·y_j          (≠ 0 if rebar layout is asymmetric)
Pure tension:      P  = Σ (−fy)·As_j        Pc = 0
```
(Excel: Ac = gross b·h; the displaced-concrete deduction lives inside the steel fs_eff.)

### 5.2 Intermediate points — 3 neutral-axis control modes

Control rebar = the bar farthest from the compression face: `y_ctrl = MIN(y_rebar)`, `d = h/2 − y_ctrl`, `C1 = d` (= 530 in the example).

| Sheet | Control variable | Swept values | Formula for c |
|---|---|---|---|
| `P_c` | ratio C/C1 | 3, 2, 1.5, 1.2, 1 | `c = (C/C1)·C1` |
| `P_fy` | control steel stress fs/fy | 0, 0.25, 0.5, 0.75, 1 | `c = εcu/(εcu + (fs/fy)·fy/Es) · d` |
| `P_es` | control steel strain εs | 0.002, 0.003, 0.005, 0.0075, 0.01, 0.015, 0.025, 0.03, 0.05 | `c = εcu/(εcu + εs) · d` |

Physical meaning:
- C/C1 ≥ 1: section fully/mostly in compression (upper branch of the curve, from P0 down to the fs = 0 point).
- fs/fy = 0 → 1: from the point where steel starts to be in tension down to the **balanced point** fs = fy.
- εs > εy: tension-controlled failure region, approaching pure tension (εs = 0.05).

Each point:
```
ε0 = εcu·(c − h/2)/c ;  κ = εcu/c ;  Hmesh = MIN(c, h) ;  t = Hmesh/ny
→ integrate concrete strips + each rebar → (P_conc, P_steel, M_conc, M_steel)
```

### 5.3 Assembly (P-M chart sheet)
- Table P0…P13: each row lists (control variable, e = M/P, ε0, κ, P_conc, P_steel, M_conc, M_steel, SumP, SumM, P_factored, M_factored).
- Two curves plotted: Nominal and Factored.

### 5.4 Inverse problem (Inverse P-M sheet — Excel Solver)
- Unknowns: `x1 = ε0×1000`, `x2 = κ×10⁶` (scaled for Solver stability).
- From (ε0, κ) → mesh the **full section height h** (ny = 100; strips in tension yield fc = 0 automatically) → P_cal, M_cal.
- Objective: `MIN( (Pu − P_cal)² + (Mu − M_cal)² )`, GRG Nonlinear + Automatic Scaling.
- After convergence derive: y_NA = −ε0/κ, c = h/2 + ε0/κ, ε_top = ε0 + κh/2, ε_bot = ε0 − κh/2, e = M/P.

### 5.5 Inverse problem (Newton sheet — 2-unknown Newton–Raphson)
```
x = [ε0; κ]
R(x) = [P(ε0,κ) − Pu ; M(ε0,κ) − Mu]
J = [∂P/∂ε0  ∂P/∂κ ; ∂M/∂ε0  ∂M/∂κ] = [a b; c d]
Δx = −J⁻¹·R  →  closed form:  Δε0 = −(d·rP − b·rM)/DET ;  Δκ = −(−b·rP + a·rM)/DET ;  DET = ad − bc
x_new = x + Δx
```
- The Jacobian is computed **analytically** from the fiber tables (derivative of the material model w.r.t. ε, weighted by area and y): a = Σ(∂F/∂ε0), b = c = Σ(∂F/∂κ) = Σ(∂M/∂ε0) (symmetric matrix), d = Σ(∂M/∂κ). Each iteration occupies its own column block in the sheet.
- Initial guess: ε0 = 0.0005, κ = 5e−6. Convergence: difference ≤ 10⁻⁴ (0.01%); in practice ~4–5 iterations, max 20.
- Results match Solver (cross-check).

---

## 6. Workflow FILE 2 — `PM-advanced (4).xlsx` (arbitrary section with holes, biaxial bending)

### 6.0 Core idea
Biaxial bending is handled by **keeping the neutral axis horizontal and rotating the section by angle p about its centroid**, solving as a uniaxial problem in the rotated frame, then **projecting forces/moments back to the original frame** → the pair (Mx, My). Sweep p = 0° → 360° in 15° steps → each angle is one "meridian" of the 3D P–Mx–My interaction surface. One sheet per angle (0-degree, 15-degree, 30-degree, …); the Summary sheet collects results.

### 6.1 Geometry (per angle sheet)
- **Boundary**: closed polygon, up to ~10 vertices (last vertex repeats the first). **Hole1, Hole2**: hole polygons.
- **Shoelace area:** `A = ½·|Σ(x_i·y_{i+1} − x_{i+1}·y_i)|` ; holes taken **negative**. `A_net = A_bound + A_hole1 + A_hole2`.
- **Polygon centroid:** `Xc = Σ(x_i + x_{i+1})·D_i / (3·ΣD_i)` with `D_i = x_i·y_{i+1} − x_{i+1}·y_i` (Yc analogous); net centroid = area-weighted average (holes negative).
- **Rotation about centroid (xc, yc):**
```
x' = xc + (x − xc)·cos(p) − (y − yc)·sin(p)
y' = yc + (x − xc)·sin(p) + (y − yc)·cos(p)
```
Applied to boundary, holes, and every rebar. After rotation: `Depth = Ymax − Ymin`, `Width = Xmax − Xmin`.

### 6.2 Strip width at elevation y (replaces the fixed b) — the core of "arbitrary section"

For each mesh strip at `y_i = Ymax − (i − 0.5)·t`:

1. **Intersect the horizontal line y = y_i with every polygon edge** (edge from (x1,y1) to (x2,y2), in form ax + by + c = 0 with a = y1−y2, b = x2−x1, c = x1·y2 − x2·y1):
   ```
   x_int = (−b·y_i − c) / a        (skip horizontal edges, a = 0)
   ```
2. **Filter valid intersections** (lying within the edge segment):
   - vertical edge (x1 = x2): check `min(y1,y2) ≤ y_i ≤ max(y1,y2)`
   - otherwise: check `min(x1,x2) ≤ x_int ≤ max(x1,x2)`
3. Merge intersections from boundary + all holes, **sort ascending by X, remove duplicates (unique)**.
4. **Even–odd rule:** in-section length = `X_{n+1} − X_n` for odd n (pairs 1–2, 3–4, …); even-n segments are outside the section / inside holes. → holes are subtracted automatically.
5. `L_i = Σ inside segments` ; `Ac_i = L_i · t` ; strip X-centroid = weighted average of segments: `x̄_i = Σ(L_seg·x_mid_seg)/L_i`.

### 6.3 Biaxial internal forces
In the rotated frame, solve as uniaxial: `ε_i = ε0 + κ·(y'_i − yc)` → `fc_i` → `Fc_i = fc_i·Ac_i`.

Project back to the original frame:
```
Force components:   Fcy = Fc·cos(p)        Fcx = Fc·sin(p)
Strip centroid rotated back to the original frame:
   x0 =  (x' − xc)·cos(p) + (y' − yc)·sin(p)
   y0 = −(x' − xc)·sin(p) + (y' − yc)·cos(p)
Moments:            Mcx = Fcy · y0          Mcy = Fcx · x0
```
Steel is fully analogous (Fsy, Fsx, Msx, Msy), using fs_eff.
Totals: `P = ΣFc + ΣFs` ; `Mx = ΣMcx + ΣMsx` ; `My = ΣMcy + ΣMsy` ; `M_res = √(Mx² + My²)`.

> Current sign note in Excel: P is taken as the total F (no cos split), Mx/My per the formulas above; at p = 0 → Fcx = 0, My = 0, matching the uniaxial case.

### 6.4 Points on each meridian (per angle p)

| Point | Condition | How c is computed |
|---|---|---|
| P0 | Pure compression | Pc = 0.85·fck·A_net ; Ps = Σ(fy − 0.85fck)·As_j ; Mx = My = steel moment sum (=0 if symmetric) |
| P1 | fs(ctrl) = 0 | C1 = Ymax − y_ctrl (lowest bar after rotation) ; c = C1 |
| P2 | fs(ctrl) = 0.5·fy | c = εcu/(εcu + 0.5fy/Es)·C1 |
| P3 | fs(ctrl) = fy (balanced) | c = εcu/(εcu + fy/Es)·C1 |
| P4 | εs(ctrl) = 0.05 | c = εcu/(εcu + 0.05)·C1 |
| P5 | Pure tension | P = −fy·ΣAs |

Control rebar selected automatically: `INDEX/MATCH` on the bar with smallest y' after rotation. ny = 50, t = c/ny.

### 6.5 Summary
Table of P0–P5 for each angle (P, Mx, My — both Nominal and Factored 0.65/0.9). Design intent: full sweep 0–360° in 15° steps (file currently has 0/15/30).

---

## 7. Important Notes / Gotchas for Programming

1. **Compression positive, tension negative** throughout — all fc, fs, fs_eff formulas follow this convention.
2. **fs_eff subtracts displaced concrete**: only when the bar is in the compression zone (ε ≥ 0); the deduction is fc(ε) at the bar's actual strain (not the constant 0.85fck, except in pure compression).
3. **Concrete strips mesh only the compression zone** for forward P–M points (Hmesh = MIN(c, h/Depth)); but the **inverse** problem meshes the **full height** since (ε0, κ) is free — tension strips naturally return fc = 0.
4. **Evaluation point at mid-strip** (i − 0.5), not at strip edges.
5. Concrete carries **no tension**; the P–M curve still extends to negative P thanks to the steel.
6. Moments are taken **about the gross-section centroid** (not the plastic centroid) — even P0 has M ≠ 0 if the rebar layout is asymmetric.
7. Polygon: vertices entered in order, **last point = first point** (closed ring); Shoelace/centroid formulas use ABS so they are orientation-independent, but hole areas must be assigned negative sign manually.
8. **Horizontal edges** (y1 = y2) are skipped in intersection search (division by zero); when a strip line passes exactly through a vertex, handle with unique/tolerance logic.
9. Intersections must be **deduplicated** before even–odd pairing (an intersection at a vertex shared by 2 edges is counted twice).
10. The balanced point (fs = fy) is where the control mode switches; the density of swept points determines curve smoothness — a program should allow a continuous sweep of c rather than the discrete milestones used in Excel.
11. Newton–Raphson: scale the unknowns (ε0×10³, κ×10⁶), Jacobian is symmetric (b = c), include a DET check; add line search / fallback for when (Pu, Mu) lies outside the interaction surface (no solution).
12. Mesh convergence: dual check (F and M), 0.1%; min mesh 50, min thickness 1 mm, max 1000 strips.
13. φ factors split concrete/steel (0.65/0.9) → all P, M sums must keep the **two components separate** until the final step.
14. Biaxial bending: angle p is the **section rotation angle** (equivalent to the neutral-axis inclination with opposite sign); the resulting (Mx, My) are already in the original frame — no back-rotation needed.
15. Reference results for the sample case (b×h = 400×600, 12∅32, fck 30, fy 400): P0 nominal = 9433.1 kN; fs=0 point: P = 5998.9 kN, M = 615.5 kNm; pure tension = −3538.7 kN. Advanced (p=0): P0 = 33981.4 kN. Use these as test cases.

---

## 8. Suggested Program Architecture

```
input:  geometry {boundary[], holes[][], rebars[{x,y,dia}]}, material {fck, fy, Es}, factors {φc, φs}
core:
  material.py    : fc(ε), fs(ε), fs_eff(ε)           # section 3
  geometry.py    : shoelace area/centroid, rotate, strip_width(y) (even–odd)   # sections 6.1–6.2
  fiber.py       : integrate(ε0, κ, angle) → (Pc, Ps, Mx_c, Mx_s, My_c, My_s)  # sections 4, 6.3
  pm_curve.py    : sweep c (or εs control) → P–M curve for one angle; sweep angles → 3D surface   # sections 5.2, 6.4
  inverse.py     : Newton–Raphson (Pu, Mu) → (ε0, κ)  # section 5.5
  convergence.py : auto-refine mesh to the 0.1% criterion  # section 4
output: point tables (nominal + factored), P–M / P–Mx–My plots, inverse solution (ε0, κ, y_NA, c, ε_top, ε_bot)
```
