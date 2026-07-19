# Unified P–M Analysis Workflow — Merging Uniaxial and Biaxial into One General Problem
### Companion to `PM-curve-spec.md` — design basis for a single computation engine

> Principle: **there is only one problem — biaxial bending of an arbitrary polygon section.**
> Uniaxial bending is the degenerate case where the neutral-axis angle is fixed (θ = 0)
> and/or the demand in the other direction is zero (Muy = 0).
> A rectangle is just a 4-vertex polygon with no holes.

---

## 1. Why the two Excel files are the same problem

| Aspect | PM-basic (uniaxial) | PM-advanced (biaxial) | Unified view |
|---|---|---|---|
| Geometry | b × h rectangle | polygon + holes | polygon + holes (rectangle auto-converted to 4 vertices) |
| Strip width | constant b | intersection / even–odd rule | always even–odd (returns constant b for a rectangle) |
| Strain field | ε = ε0 + κ·y | ε = ε0 + κ·y′ (rotated frame) | ε = ε0 + κ·y′(θ), with θ = 0 for uniaxial |
| Moment | M (single) | Mx, My | (Mx, My); uniaxial reports Mx, and My ≡ 0 by symmetry |
| Curve | 2D P–M curve | 3D P–Mx–My surface | surface = family of meridians; uniaxial curve = meridian at θ = 0 |
| Inverse | 2×2 Newton (ε0, κ) | — (not implemented) | 3×3 Newton (ε0, κ, θ); reduces to 2×2 when θ is fixed |

Verified consequence: running the unified engine on the rectangle 400×600, 12∅32, fck 30, fy 400 at θ = 0 **must** reproduce the basic-file results (P0 = 9433.1 kN; fs=0 point: 5998.9 kN / 615.5 kNm; pure tension −3538.7 kN), and on the advanced geometry at θ = 0 must reproduce P0 = 33981.4 kN. These are the regression test cases.

---

## 2. Unified strain field

Two equivalent parametrizations; the engine uses (ε0, κ, θ), the inverse solver may use either.

**Parametrization A — rotation form (used by the engine):**
```
ε(x, y) = ε0 + κ · y0(θ)
y0 = −(x − xc)·sin θ + (y − yc)·cos θ     # distance from the θ-inclined axis through the centroid
```
- θ : neutral-axis direction angle (section rotated by θ so the NA is horizontal in the working frame)
- κ ≥ 0 : curvature magnitude; ε0 : strain at the centroid
- **Uniaxial about x = the special case θ = 0** → y0 = y − yc, identical to the basic file.
- Negative uniaxial bending (compression at bottom) = θ = 180°, not κ < 0. Keeping κ ≥ 0 makes θ unique.

**Parametrization B — component form (useful for the 3-DOF inverse):**
```
ε(x, y) = ε0 + κx·(y − yc) − κy·(x − xc)
κx = κ·cos θ ,   κy = κ·sin θ      ⇔      κ = √(κx² + κy²) ,  θ = atan2(κy, κx)
```

Neutral axis (line ε = 0): `y0_NA = −ε0/κ` measured perpendicular to the NA from the centroid;
depth from the extreme compression fiber: `c = y0_max − y0_NA` where `y0_max = max over section of y0`.

Sign conventions: unchanged from `PM-curve-spec.md` §2 (compression +, y up, Mx = ΣF·y, My = ΣF·x, moments about the gross centroid).

---

## 3. The single computation kernel

Everything — every point of every curve, every Newton iteration — calls one function:

```
section_response(ε0, κ, θ, geometry, material, ny) → {Pc, Ps, Mxc, Mxs, Myc, Mys}
```

Algorithm (all steps already validated in the Excel files):

```
1. Rotate boundary, holes, rebars by θ about the gross centroid (xc, yc).      # spec §6.1
2. Determine mesh band:
     forward points (compression-face controlled): Hmesh = min(c, Depth)
     free (ε0, κ) e.g. inverse iterations:         Hmesh = Depth (full height)  # spec §7.3
   Strip thickness t = Hmesh / ny, evaluation at mid-strip y′_i.
3. For each strip i:
     width & X-centroid by horizontal-line/polygon intersection, even–odd rule # spec §6.2
     ε_i = ε0 + κ·(y′_i − yc)  →  fc_i (parabolic, no tension)                 # spec §3.1
     Fc_i = fc_i · L_i · t
4. For each rebar j (true rotated position, not meshed):
     ε_j = ε0 + κ·(y′_j − yc)  →  fs_eff (elastic–plastic, minus displaced concrete)  # spec §3.2
     Fs_j = fs_eff · As_j
5. Rotate each force application point BACK to the original frame:
     x0 =  (x′ − xc)·cos θ + (y′ − yc)·sin θ
     y0 = −(x′ − xc)·sin θ + (y′ − yc)·cos θ
6. Accumulate, concrete and steel kept separate (for φc/φs):                   # spec §3.3
     P   = ΣF                        (scalar, force is along the member axis)
     Mx  = ΣF · y0                   My  = ΣF · x0
```

At θ = 0 steps 1 and 5 are identity operations and the kernel is *exactly* the basic-file computation — no special-case code path needed.

> Note on the Excel Fcy/Fcx = F·cosθ/F·sinθ columns: those are an intermediate bookkeeping device;
> algebraically Mcx = F·cosθ·y0 and Mcy = F·sinθ·x0 as implemented there. The kernel above
> reproduces the same Mx, My. Keep one consistent definition (moments about global X and Y axes,
> Mx = ΣF·y0, My = ΣF·x0) and validate against the Excel numbers at θ = 0, 15, 30.

---

## 4. Unified control parameter for forward curve points

The two files use three different sweep variables (C/C1, fs/fy, εs). They all collapse into **one scalar: the strain in the control rebar, ε_ctrl** (compression +):

```
Control rebar: the bar with minimum y′ after rotation (farthest from compression face)
C1 = y0_max − y0_ctrl          # distance compression face → control bar, in rotated frame
Given target ε_ctrl (with compression face pinned at εcu):
    c  = εcu / (εcu − ε_ctrl·sign) ... in the file convention:  c = εcu/(εcu + εs_t)·C1
    where εs_t = tension strain magnitude of control bar
```

Mapping of all legacy sweep points onto the single ε_ctrl axis (tension shown negative):

| Legacy point | Legacy variable | Equivalent ε_ctrl |
|---|---|---|
| P0 pure compression | — | εcu (uniform, κ = 0) |
| C/C1 = 3, 2, 1.5, 1.2 | c = k·C1, k > 1 | +εcu·(c − C1)/c (bar in compression) |
| fs = 0 | c = C1 | 0 |
| fs/fy = 0.25 … 1.0 | c = εcu/(εcu + fs/Es)·C1 | −0.0005 … −0.002 (= −fy/Es) |
| εs = 0.002 … 0.05 | c = εcu/(εcu + εs)·C1 | −0.002 … −0.05 |
| Pure tension | — | uniform tension, κ = 0 |

**Unified sweep:** ε_ctrl from +εcu down to −0.05 (any density; recommended: the union of both files' milestone lists as default, plus optional uniform refinement for smooth plotting). Endpoints P0 and pure tension are closed-form (spec §5.1) — same formulas for both problems, with A_net and per-bar Σ for the polygon case.

From ε_ctrl each point gets:
```
c  = εcu/(εcu + max(−ε_ctrl, 0))·C1        (ε_ctrl ≤ 0, NA inside or below control bar)
c  = C1·εcu/(εcu − ε_ctrl)                  (0 < ε_ctrl < εcu, NA below control bar)
ε0 = εcu − κ·y0_max ,   κ = εcu/c
→ section_response(ε0, κ, θ)
```

---

## 5. General forward workflow (curve and surface)

```
INPUT
  geometry: boundary[], holes[][], rebars[{x, y, dia}]      # rectangle → 4-vertex polygon
  material: fck, fy, Es  → derived εcu, εco, n
  factors:  φc = 0.65, φs = 0.9
  angles:   Θ = [θ1 … θm]        # uniaxial: Θ = [0] (add 180° for the negative branch)
                                  # biaxial:  Θ = 0 … 345° step 15° (or finer)
  sweep:    E = [ε_ctrl values]  # §4
  mesh:     ny initial (e.g. 100), convergence tol 0.1%

FOR each θ in Θ:
    rotate geometry, find control rebar, C1
    P0 point (closed form)                                   # pure compression
    FOR each ε_ctrl in E:
        (ε0, κ) from §4  →  section_response(ε0, κ, θ)
        store (P, Mx, My) nominal  and  (0.65·Pc + 0.9·Ps, …) factored
    pure-tension point (closed form)
    → one meridian curve

OUTPUT
  m = 1  → classic 2D P–M chart (report Mx; My = 0 for symmetric sections)
  m > 1  → 3D interaction surface P–Mx–My (mesh of meridians)
           + optional horizontal slices: Mx–My contour at given P levels

VERIFY (always):
  re-run one meridian with 2×ny → dual 0.1% criterion on ΣF and ΣM   # spec §4
  regression: θ = 0 must match the Excel reference values             # §1
```

---

## 6. General inverse workflow — one solver, three demand cases

Demand: (Pu, Mux, Muy). Unknowns and reductions:

| Case | Given | Unknowns | System |
|---|---|---|---|
| (a) Uniaxial, symmetric section | Muy = 0, θ known = 0 | ε0, κ | 2×2 Newton — *identical to the basic file's Newton sheet* |
| (b) Uniaxial demand, asymmetric section | Muy = 0 but θ unknown | ε0, κ, θ | 3×3 Newton |
| (c) Full biaxial | Pu, Mux, Muy | ε0, κ, θ (or ε0, κx, κy) | 3×3 Newton |

**3×3 Newton–Raphson (component form B is smoother for differentiation):**
```
x = [ε0; κx; κy]
R(x) = [P − Pu ;  Mx − Mux ;  My − Muy]
J = ∂R/∂x   (3×3, symmetric: J = ∫ Et(ε)·[1, y0, −x0]ᵀ[1, y0, −x0] dA + Σ steel terms,
             Et = tangent modulus of the material law at the fiber strain)
Δx = −J⁻¹ R ;  x ← x + Δx ;  iterate until |R| relative ≤ 1e−4, max 20 iterations
```
Implementation notes carried over and generalized from the basic file:
- **Scaling:** solve in scaled variables (ε0×10³, κ×10⁶) — same trick as the Excel Solver/Newton sheets.
- **Analytic Jacobian** from the same fiber loop (accumulate Et·A, Et·A·y0, Et·A·x0, Et·A·y0², Et·A·x0·y0, Et·A·x0²) — one extra set of running sums inside `section_response`, no extra pass.
- **Full-height mesh** during iterations (ε0, κ free; tension strips → fc = 0).
- Case (a) is literally case (c) with the 3rd row/column deleted — one solver implementation with a mask, not two solvers.
- **Degeneracies:** κ → 0 (pure axial) makes θ meaningless → detect ‖(κx, κy)‖ < tol and drop to a 1-DOF problem in ε0. Demand outside the interaction surface → Newton diverges; guard with max-iteration + residual-growth check and report "capacity exceeded" together with the closest achievable point (fallback: damped Newton / line search on ‖R‖²).
- Post-processing per solution: NA angle θ = atan2(κy, κx), κ = ‖(κx, κy)‖, y0_NA = −ε0/κ, c = y0_max − y0_NA, extreme-fiber strains, utilization ratio vs. the factored surface.

---

## 7. What changes vs. the two Excel files (migration checklist)

1. **Delete the rectangle-specific path** — feed b×h through the polygon pipeline (4 vertices, 0 holes). The constant-width formula becomes a test of the intersection routine, not separate code.
2. **Replace three sweep variables with ε_ctrl** (§4); keep the legacy milestone values as the default sweep so outputs remain comparable cell-by-cell.
3. **Single moment convention:** (Mx, My) always computed, even for θ = 0 (My then serves as a symmetry check — should be ~0 for symmetric sections, and is *meaningful* for asymmetric ones).
4. **Inverse solver generalized to 3×3** with the 2×2 case as a masked reduction; drop the Excel-Solver (GRG) path — keep it only as an independent validation method.
5. **One sheet per angle → one loop over θ**; the Summary sheet becomes the surface assembly step.
6. **Convergence loop automated** (Excel does it manually with two mesh columns): run ny, 2ny until the 0.1% dual criterion passes, cap 1000 strips, min thickness 1 mm.
7. Keep concrete/steel resultants separate end-to-end for φc/φs — unchanged.
8. All spec §7 gotchas apply verbatim (mid-strip evaluation, dedup of vertex intersections, horizontal-edge skip, holes negative, moments about gross centroid, etc.).

---

## 8. Unified module architecture

```
input:  geometry {boundary[], holes[][], rebars[{x,y,dia}]}   # rect → polygon adapter
        material {fck, fy, Es} → {εcu, εco, n}
        factors {φc, φs} ;  angles Θ ;  sweep E ;  demands [(Pu, Mux, Muy)]

core:
  material.py     fc(ε), Et_c(ε), fs(ε), fs_eff(ε), Et_s(ε)        # stress + tangent modulus
  geometry.py     to_polygon(rect), shoelace_area/centroid, rotate(θ),
                  strip_slices(y) → [(x_start, length)]             # even–odd
  kernel.py       section_response(ε0, κ, θ | ε0, κx, κy)
                  → {Pc, Ps, Mxc, Mxs, Myc, Mys, J-sums}            # §3 + Jacobian sums
  sweep.py        control_points(ε_ctrl list, θ) → meridian          # §4–5
  surface.py      loop Θ → meridians → 3D surface, P-level slices
  inverse.py      newton(demand, mask) — 3×3 / 2×2 / 1-DOF           # §6
  convergence.py  auto-refine ny until 0.1% dual criterion           # spec §4

tests:
  test_basic.py     rectangle @ θ=0  vs PM-basic reference numbers   # §1
  test_advanced.py  polygon @ θ=0,15,30 vs PM-advanced reference numbers
  test_inverse.py   (2000 kN, 500 kNm) → ε0=2.2573e−4, κ=3.1370e−6   # Newton sheet
  test_degenerate.py pure axial, demand outside surface, NA through vertex

output: point tables (nominal + factored), 2D P–M chart, 3D P–Mx–My surface,
        Mx–My slices, inverse report (ε0, κx, κy, θ, c, fiber strains, utilization)
```

**Bottom line:** one kernel, one sweep parameter, one solver with a mask. The uniaxial problem is never coded separately — it is the θ = 0 meridian and the masked inverse of the general biaxial problem.
