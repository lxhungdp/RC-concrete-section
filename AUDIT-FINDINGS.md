# Independent Audit Findings — pm-column-designer

**Audit date:** 2026-08-07
**Commit audited:** `c1fe77f` ("fixed error") on branch `dev/22points`, working tree clean apart from this file.

> The audit was originally performed against the working tree while it sat uncommitted on top of
> `77f0880`. That tree was then committed as `c1fe77f`. Every finding below was **re-verified against
> `c1fe77f` after the commit**: all 23 hold, all line references are current, and all measured
> numbers reproduce identically.
**Scope:** structural-engineering correctness, design-code compliance, programming practice, software/pipeline design — measured against the bar for commercial engineering software.

## How to use this document

Every finding below is written to be **independently verifiable**. Each one carries:

- **Claim** — one falsifiable sentence.
- **Evidence** — exact `file:line` references and quoted code.
- **Reproduce** — a command to run, plus what the output should be if the claim is true.
- **Impact** — why it matters commercially.

A verifier should be able to confirm or refute each finding without trusting this document. Where a
finding depends on a standards clause rather than on code, the clause is named so it can be checked
against the actual document.

**Severity key**

| Level | Meaning |
|---|---|
| **P1** | Blocks commercial release. Wrong engineering output, silent data loss, or a dead safety gate. |
| **P2** | Serious gap. Ships, but fails a professional review or a real customer workflow. |
| **P3** | Technical debt. Not urgent, compounds. |

---

## Summary table

| ID | Sev | Category | Finding |
|---|---|---|---|
| [S-01](#s-01) | P1 | Standards | EN 1992 all-compression stations use the wrong strain domain, and the self-declared warning does not mention it |
| [S-02](#s-02) | P2 | Standards | EN 1992 has no National Annex mechanism; `αcc = 1.0` hardcoded |
| [S-03](#s-03) | P2 | Standards | SI-only; ACI 318 implemented with no US customary units |
| [S-04](#s-04) | P3 | Standards | Product name implies member design; scope is section-only |
| [N-01](#n-01) | P1 | Numerics | `docs/04` specifies a continuation solver that does not exist in code |
| [N-02](#n-02) | P1 | Numerics | `docs/06` error budget / convergence workflow is not implemented anywhere |
| [N-03](#n-03) | P2 | Numerics | Fixed 36-direction sampling carries up to 1.24 % error; adaptive mode disabled in baseline |
| [N-04](#n-04) | P2 | Numerics | Demand ray–surface intersection is brute force over all triangles |
| [N-05](#n-05) | P3 | Numerics | `applyAxialCap` derives the cap from sampled vertices, not from exact `P0` |
| [C-01](#c-01) | P1 | CI/Code | The "Reference fixture is current" CI gate checks a path that does not exist — it can never fail |
| [C-02](#c-02) | P1 | CI/Code | ~10 000 lines of UI have zero automated tests |
| [C-03](#c-03) | P2 | CI/Code | No linter, no formatter, no coverage, no `npm audit`; 4 high-severity CVEs open |
| [C-04](#c-04) | P2 | CI/Code | CI runs a strict subset of `npm test` |
| [C-05](#c-05) | P2 | CI/Code | God module: `pm-analysis/src/index.ts` is 4 210 lines |
| [C-06](#c-06) | P2 | CI/Code | No React error boundary; a render throw yields a blank page |
| [C-07](#c-07) | P3 | CI/Code | 12 × `window.alert` / `window.confirm` as the error-reporting channel |
| [D-01](#d-01) | P1 | Product | No persistence of any kind — a page refresh destroys all work |
| [D-02](#d-02) | P1 | Product | No undo/redo in a geometry editor |
| [D-03](#d-03) | P1 | Product | Project format has no migration path; bumping the version orphans every saved file |
| [D-04](#d-04) | P1 | Product | PDF report silently deletes every non-ASCII character, including all Korean |
| [D-05](#d-05) | P2 | Product | No i18n; no LICENSE file; no third-party licence inventory |
| [D-06](#d-06) | P2 | Product | Single worker, no in-flight cancellation, no parallelism |
| [D-07](#d-07) | P1 | Process | The V&V regime described in `docs/09` has no artifact in the repository |

---

# 1. Standards and design-code compliance

<a name="s-01"></a>
## S-01 — P1 — EN 1992 uses the wrong ultimate strain domain in the all-compression region, and the declared limitation does not cover it

### Claim

For the EN 1992 profile, capacity states with the neutral axis outside the section (`c/D > 1`) pin
`εcu2` at the extreme compression fibre. EN 1992-1-1:2004 Figure 6.1 (domain 5) instead requires the
strain plane to pivot about `εc2` at a depth `(1 − εc2/εcu2)·h` from the most compressed face. The
implementation therefore produces **higher strains at every fibre than EN 1992 permits**, which for
the parabolic-rectangular law means **higher stress and an unconservative capacity**. The engine's own
mismatch warning describes only EC2 domains 1–2 (the tension side) and does not mention this.

### Evidence

The pivot correction exists but is gated to the KDS Appendix profile only:

`packages/pm-analysis/src/index.ts:1517-1540`
```ts
  let compressionBoundaryStrain = epsCu
  if (
    (station.kind === 'neutral-axis-ratio' ||
      station.kind === 'neutral-axis-depth-ratio' ||
      station.kind === 'neutral-axis-control-gap-ratio') &&
    designBasis.format === 'designMaterialReevaluation' &&
    designBasis.compressionEndpoint === 'peak-stress-strain'   // <-- line 1523
  ) {
    const neutralAxisDepth = compressionProjection - controlProjection
    if (neutralAxisDepth > sectionDepth) {
      const pivotDepth = (1 - pureCompressionStrain / epsCu) * sectionDepth
      compressionBoundaryStrain =
        pureCompressionStrain * neutralAxisDepth /
        Math.max(1e-9, neutralAxisDepth - pivotDepth)
    }
  }
```

The EN design basis does **not** set that flag:

`packages/pm-design/src/index.ts:241` — `export const createEn1992DesignBasis = ...`
`packages/pm-design/src/index.ts:292` — `compressionEndpoint: 'ultimate-strain',`

(For contrast, `createKdsAppendixDesignBasis` at line 297 sets `compressionEndpoint: 'peak-stress-strain'`
at line 334 — that is the only profile the pivot branch ever fires for.)

The declared limitation omits the compression side entirely:

`packages/pm-materials/src/support.ts:88-96`
> `'EN 1992-1-1 material laws are paired with the ACI/KDS concrete-pivot strain domain. EC2 domains 1–2 pivot on the reinforcement limit εud instead, so the tension-controlled part of this surface is not an EN 1992 boundary and the result is preview only.'`

Only one strain domain exists in the type system at all:

`packages/pm-materials/src/support.ts:62`
```ts
export type StrainDomainId = 'concrete-pivot-ultimate'
```

Six of the twenty-seven stations sit in the affected region — `c/D = 3, 2, 1.5, 1.2, 1.1, 1`
(see `UNIFIED_DEPTH_RATIOS` and the schedule assertion in
`packages/pm-analysis/test/integration/analysis.selftest.ts`).

### Worked magnitude (hand check, `fck ≤ 50`: `εc2 = 0.002`, `εcu2 = 0.0035`, `n = 2`)

Pivot C sits at `(1 − 0.002/0.0035)·h = 0.4286·h` from the most compressed face.
Take station `c/D = 1.5` (neutral axis at `1.5h`, whole section in compression):

| | Extreme fibre ε | Least-compressed fibre ε | σ/fcd at least-compressed fibre |
|---|---|---|---|
| Engine (pins `εcu2`) | 0.003500 | 0.001167 | 0.827 |
| EN 1992 domain 5 (pivot C) | 0.002800 | 0.000933 | 0.715 |

`σ/fcd = 1 − (1 − ε/εc2)²` on the parabolic branch. The engine is ~15 % high at the least-compressed
fibre and high everywhere else on the parabolic branch, so **P and M are both overestimated**.

### Reproduce

```bash
grep -n "compressionEndpoint === 'peak-stress-strain'" packages/pm-analysis/src/index.ts
```
Expect a single hit at line 1523 — proving the pivot has exactly one gate.

```bash
grep -n "createEn1992DesignBasis\|createKdsAppendixDesignBasis\|compressionEndpoint: '" packages/pm-design/src/index.ts
```
Expect `createEn1992DesignBasis` at 241, `compressionEndpoint: 'ultimate-strain'` at 292 (inside it),
`createKdsAppendixDesignBasis` at 297, `compressionEndpoint: 'peak-stress-strain'` at 334.

### Impact

An EN 1992 user receives a non-conservative resistance surface in the compression-controlled region,
and the software's own disclosure text tells them the problem is on the *tension* side. A reviewer
reading the warning would not know to distrust the compression branch.

### Suggested resolution

Either implement EC2 pivot C for `compressionEndpoint: 'ultimate-strain'` under the EC2 standard, or
block `c/D > 1` stations for the EN profile with a typed issue. Also extend the
`strainDomainMismatch` message to name domain 5.

---

<a name="s-02"></a>
## S-02 — P2 — EN 1992 has no National Annex mechanism

### Claim

`αcc` is fixed at 1.0 with no way to select a National Annex. This is the EN base-document
recommended value, but essentially every national implementation overrides it (UK NA, and many
others, use `αcc = 0.85`). Users in NA jurisdictions get `fcd` about 15 % higher than their governing
document allows.

### Evidence

`packages/pm-code-en1992/src/index.ts:12-15`
```ts
/** Recommended values; Nationally Determined Parameters may replace them. */
export const EN1992_ALPHA_CC = 1
export const EN1992_GAMMA_C = 1.5
export const EN1992_GAMMA_S = 1.15
```

`packages/pm-design/src/index.ts:252`
```ts
nationalAnnex: 'None selected'
```

`packages/pm-code-en1992/src/index.ts:8`
```ts
verificationStatus: 'draft-unverified'
```

The comment acknowledges NDPs may replace the values, but no selection mechanism, NA registry, or
per-country parameter set exists in the codebase.

### Reproduce

```bash
grep -rn "nationalAnnex\|NationalAnnex\|NDP" --include="*.ts" packages | grep -v node_modules
```
Expect only the literal string `'None selected'` and type declarations — no NA data or selector.

### Impact

The EN profile cannot be used for a real Eurocode submission in any country with an NA, which is all
of them. It is honestly labelled `preview` / `draft-unverified`, so this is a completeness gap rather
than a mislabelling.

---

<a name="s-03"></a>
## S-03 — P2 — SI-only; ACI 318 shipped without US customary units

### Claim

There is no unit-system abstraction. All inputs and outputs are mm / N / MPa. ACI 318-19 is
implemented, but its user base works in inches, kips, and psi/ksi, and must convert by hand.

### Evidence

```bash
grep -rn "kip\|inch\|imperial\|unitSystem\|ksi\|psi" --include="*.ts" --include="*.tsx" packages apps | grep -v node_modules
```
Returns no unit-system code (only unrelated substring matches such as `skipping`, `epsilon`).

There are also no branded/dimensional types — force, moment, stress, and length are all bare
`number`, so a unit error cannot be caught by the type checker.

### Impact

Manual unit conversion at the input boundary is a well-known source of engineering error, and it
removes the entire North American market from the addressable scope of an otherwise complete ACI
implementation.

---

<a name="s-04"></a>
## S-04 — P3 — Product name implies member design; the scope is section-only

### Claim

The package is named `pm-column-designer`, but slenderness, second-order effects, frame stability,
buckling, shear, torsion, and anchorage are all out of scope. The product is a section calculator.

### Evidence

`package.json:2` — `"name": "pm-column-designer"`

`docs/engineering/01-product-scope-and-workflow.md:66-70`
> excluded until separately specified and verified:
> - member slenderness, second-order effects, frame stability, and buckling;
> - shear, torsion, anchorage, confinement behavior beyond an explicit resistance-profile option;

`docs/development/07-design-resistance-implementation.md:122` — "This is a **section-strength**
check. It does not include member slenderness, second-order effects…"

### Impact

The scope exclusion is documented honestly and repeatedly — this is a positioning issue, not a
defect. But competing commercial tools (spColumn / PCACOL) include slenderness, so the name sets an
expectation the product does not meet.

---

# 2. Numerics and solution verification

<a name="n-01"></a>
## N-01 — P1 — `docs/04` specifies a continuation solver that does not exist

### Claim

`docs/04-initial-guess-feasibility-newton.md` prescribes an elastic seed matrix `K0`, load
continuation `λ: 0 → 1` with step halving, an Armijo line search, a reciprocal-condition estimate,
and a configurable `EquilibriumOptions` interface. **None of this is implemented.** The shipped solver
uses a hardcoded seed, plain descent backtracking, and hardcoded tolerances.

### Evidence — what the document promises

`docs/04-initial-guess-feasibility-newton.md` §3, §4, §5:

- §3 "Assemble the service elastic generalized stiffness directly about the declared reference origin… Solve the scaled system `K0 q0 = D`."
- §4 "A single Newton jump from zero to the full demand is not the default. Trace the branch using a load factor `λ`… If correction fails, halve `Δλ`…"
- §4 declares an interface:
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
- §5 "Solve with partial pivoting and **record a condition estimate**."
- §5 "Backtrack `α` until an **Armijo** decrease is obtained."

### Evidence — what the code does

`packages/pm-analysis/src/index.ts:623-624`
```ts
const NEWTON_RESIDUAL_TOL = 1e-8
const NEWTON_MAX_ITERATIONS = 30
```

`packages/pm-analysis/src/index.ts:3885` — `const solveRawInversePreviewFromPrepared = (`
`packages/pm-analysis/src/index.ts:3898`
```ts
  let state: StrainState = { e0: 0.0002, kx: 0, ky: 0 }
```
Fixed seed. No `K0`. No load factor. The backtracking loop accepts on plain descent
(`trialNorm < norm`), not on an Armijo condition, and `break`s out silently when no step is accepted.

### Reproduce

```bash
grep -rn "EquilibriumOptions\|minLoadStep\|maxLoadStep\|incrementTol\|Armijo\|reciprocalCondition\|minReciprocalCondition" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```
Expect **zero** hits in `packages/` and `apps/`. (One unrelated hit on the word "continuation"
appears in a comment at `packages/pm-analysis/src/index.ts:646`.)

```bash
grep -n "let state: StrainState = { e0: 0.0002" packages/pm-analysis/src/index.ts
```
Expect line 3898.

### Impact

A zero-curvature seed with no load continuation is precisely the configuration that fails for a
lightly reinforced section under large biaxial moment near the balance point. The failure mode is a
silent `break` reported as "Preview solver stopped before strict convergence" — the user is not told
that the algorithm the documentation describes was never attempted.

### Suggested resolution

Either implement the documented algorithm, or rewrite `docs/04` to describe the shipped one. The
current state is the dangerous option: the document would satisfy an auditor while the code would not.

---

<a name="n-02"></a>
## N-02 — P1 — The `docs/06` error budget and convergence workflow is not implemented

### Claim

`docs/06-mesh-sizing-and-convergence.md` prescribes an error budget with named error sources, `h → h/2`
mesh refinement, Richardson order estimation, a `tolMesh` acceptance gate, and convergence assessed on
a vector of engineering quantities of interest. **None of this exists in code.** The only mesh-related
benchmark is a *speed* benchmark. The mesh quality number actually shown to the user measures polygon
geometry, not capacity error.

### Evidence — what the document promises

`docs/06-mesh-sizing-and-convergence.md` §1 defines error sources `efp`, `esolve`, `emesh`, `ebeta`,
`estate`, `egeom`. §4 prescribes:
```text
pobs = log2(|fh−fh/2| / |fh/2−fh/4|)
efine ≈ |fh/2−fh/4|/(2^pobs−1)
```
and "Refinement stops successfully only when all required quantities meet `tolMesh`."

### Evidence — what `bench:mesh` actually does

```bash
npm run bench:mesh
```
Actual output:
```
h (mm)   grid cells   all-cell boolean   spatial fast path   speed-up   quadratic Δ
    50          720              30.7 ms             15.8 ms      1.95×       0.00e+0
    25         2880             111.4 ms             30.3 ms      3.68×       0.00e+0
  12.5        11520             451.5 ms            102.2 ms      4.42×       0.00e+0
  6.25        46080            2235.3 ms            264.8 ms      8.44×       0.00e+0
```
This is a timing comparison of two boolean-clipping strategies plus a check that the quadrature
integrates a quadratic exactly. It contains **no capacity quantity and no convergence assessment**.

### Evidence — what the user is shown instead

`packages/pm-geometry/src/mesh.ts:58,63` — the mesh report exposes `areaError` and `ok`. On the
reference case at `h = 50 mm`, `areaError ≈ −2.58e-8 mm²`. That number describes how well the
triangulation reproduces the *polygon area*. It says nothing about the error in `P`, `Mx`, or `My`.

### Independent measurement performed during this audit

A convergence probe was written against the shipped reference case
(`docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json`), building the full
production 27 × 36 surface via `buildPreviewSurfaceFromPrepared` at four mesh sizes and comparing
matched vertices against the finest mesh:

| h (mm) | triangles | reported `areaError` (mm²) | max ΔP / P-span | max ΔM / M-span |
|---:|---:|---:|---:|---:|
| 50   |    896 | −2.58e-8 | 0.0537 % | **0.1924 %** |
| 25   |  3 584 | −1.03e-7 | 0.0242 % | 0.0682 % |
| 12.5 | 14 336 | −4.12e-7 | 0.0034 % | 0.0082 % |
| 6.25 | 57 344 | −1.65e-6 | (reference) | (reference) |

**The engine converges correctly** — roughly second order, ~0.1–0.2 % at the default mesh, which is
acceptable engineering accuracy. The finding is not that the numbers are wrong. The finding is that
**the product cannot demonstrate this about itself**: it reports a geometric residual of `1e-8 mm²`
where the actual capacity uncertainty is `~2e-3` relative, three orders of magnitude apart and
measuring a different thing.

### Reproduce

```bash
grep -rn "richardson\|Richardson\|tolMesh\|pobs" --include="*.ts" . | grep -v node_modules
```
Expect zero hits.

```bash
npm run bench:mesh
```
Expect the timing table above — confirm no capacity quantity appears in it.

### Impact

`docs/06` §1 opens with "An engineering result is accepted only when all numerical error sources
relevant to that result are controlled." No mechanism in the shipped product controls, measures, or
reports `emesh`. A licensed engineer signing off on output has no evidence to sign against.

---

<a name="n-03"></a>
## N-03 — P2 — Fixed 36-direction sampling carries up to 1.24 % error, and adaptive refinement is disabled

### Claim

Production surfaces use 36 fixed strain-plane directions. Measured against a 144-direction reference,
the resulting capacity error reaches 1.24 % on a tall dense-reinforced rectangle. The adaptive
refinement that would reduce this is disabled in the shipped baseline.

### Evidence

```bash
npm run bench:pipelines
```
Actual results (`maxRayErrorVsUnified27x144`, block pipeline):

| case | error |
|---|---|
| circular | 0.088 % |
| hollow-circular | 0.236 % |
| reference | 0.605 % |
| square-compact | 0.745 % |
| **tall-rectangle-dense** | **1.239 %** |

`README.md:19-20`
> "Production surfaces use 36 fixed directions; station/direction adaptive refinement and automatic
> transition/event insertion are disabled in this baseline."

### Mitigating evidence (credit where due)

The direction and station sampling error **is** surfaced in the UI:
`apps/web/features/section-editor/results/SectionResultsPanel.tsx:231` renders
`summary.refinement.withinTolerance` with an `is-warning` class. This is better practice than most
commercial tools, which report no discretisation error at all.

Also note that the benchmark only covers the **equivalent-block** pipeline. There is no equivalent
direction-error benchmark for the stress-strain pipeline.

### Impact

1.24 % on a utilization ratio is material when a design lands at UR = 0.99. The error is disclosed
but not reducible in the shipped configuration.

---

<a name="n-04"></a>
## N-04 — P2 — Demand ray–surface intersection is brute force over all triangles

### Claim

`intersectSurfaceWithDemandRay` iterates every triangle of the surface for every demand. No BVH,
k-d tree, or angular index. `docs/09` §4.3 lists a differential test for "accelerated vs brute-force
triangle queries", implying an accelerated path that does not exist.

### Evidence

`packages/pm-analysis/src/index.ts:3731`
```ts
  for (const triangle of previewSurfaceTriangles(surface.points, surface.triangles)) {
```
with no spatial pre-filter before the Möller–Trumbore test. Two further full scans exist at lines
3345 and 3468.

`docs/09-verification-validation-and-release.md` §4.3:
> "accelerated vs brute-force triangle queries"

```bash
grep -rn "BVH\|bvh\|kdTree\|k-d tree\|spatialIndex\|boundingVolume" --include="*.ts" packages | grep -v node_modules
```
Expect zero hits.

### Impact

A 27 × 36 surface is roughly 1 900 triangles. Cost is `O(combinations × triangles)`. A few hundred
load combinations is tolerable; the 10³–10⁴ combinations a real building project generates is not.
This is a scaling ceiling, not a correctness defect.

---

<a name="n-05"></a>
## N-05 — P3 — `applyAxialCap` derives the cap from sampled vertices rather than exact `P0`

### Claim

The maximum-axial-resistance cap (`0.80·φ·P0` / `0.85·φ·P0`) is computed as the maximum `P` over the
already-sampled surface points, not from the exact pure-compression pole. It is correct only because
the `pure-compression` station happens to be in the schedule.

### Evidence

`packages/pm-analysis/src/index.ts:3041`
```ts
  const pole = Math.max(...points.map((point) => point.P))
```

Two secondary concerns on the same line:
1. If the station schedule ever omits the exact pure-compression pole, or a caller passes an already-clipped point set, the cap is silently computed from the wrong value.
2. `Math.max(...array)` spreads every element as a function argument. With adaptive sampling the point count is not statically bounded; a sufficiently large surface throws `RangeError: Maximum call stack size exceeded`.

### Impact

Low probability, high consequence — a wrong axial cap is a direct overestimate of design resistance
in the compression-controlled region. The fix is to pass the exact pole through explicitly and to use
a reduce-based max.

---

# 3. Programming practice and CI

<a name="c-01"></a>
## C-01 — P1 — The "Reference fixture is current" CI gate checks a nonexistent path and can never fail

### Claim

The CI step that is supposed to catch a stale reference fixture diffs a file path that does not
exist. `git diff --exit-code` on an unmatched pathspec exits 0, so the gate passes unconditionally
and has never been able to detect anything.

### Evidence

`.github/workflows/ci.yml`
```yaml
      - name: Reference fixture is current
        run: |
          npm run fixture:reference-json
          git diff --exit-code -- "docs/example case/PM-advanced (7) 2D.pm-project.json"
```

But the fixture writer targets a different directory:

`packages/pm-analysis/test/fixtures/write-reference-case.ts:12`
```ts
const target = resolve(process.cwd(), 'docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json')
```

`docs/example case/` does not exist; the real directory is `docs/examples/reference-case/`.

### Reproduce

```bash
ls "docs/example case" 2>/dev/null || echo "MISSING"
```
Expect `MISSING`.

```bash
git diff --exit-code -- "docs/example case/PM-advanced (7) 2D.pm-project.json"; echo "exit=$?"
```
Expect `exit=0` — the gate reports success against a path that is not there.

### Impact

The reference fixture is the regression oracle for the whole stress-strain pipeline
(`packages/pm-analysis/test/integration/analysis.selftest.ts` asserts against it). A stale fixture
would be caught by `test:pm-stations` in most cases, but the dedicated gate meant to catch drift is
inert. One-line fix.

---

<a name="c-02"></a>
## C-02 — P1 — Roughly 10 000 lines of UI have zero automated tests

### Claim

There is not a single component test, render test, or end-to-end test in the repository. The entire
React layer is untested.

### Evidence

```bash
find . -name "*.test.tsx" -not -path "*/node_modules/*" | wc -l
```
Expect `0`.

```bash
grep -rn "playwright\|cypress\|@testing-library\|vitest\|jsdom" package.json apps/web/package.json 2>/dev/null
```
Expect no test-runner or DOM-testing dependency.

The untested surface, by line count:

| File | Lines |
|---|---:|
| `apps/web/features/section-editor/SectionDrawingClient.tsx` | 2 917 |
| `apps/web/features/section-editor/results/ResultsWorkspace.tsx` | 2 272 |
| `apps/web/features/section-editor/materials/MaterialPanel.tsx` | 1 176 |
| `apps/web/features/section-editor/analysis/AnalysisOptionsPanel.tsx` | 869 |
| `apps/web/features/section-editor/results/SectionFieldChart.tsx` | 756 |
| others (panels, charts, workspaces) | ~2 000 |

`SectionDrawingClient.tsx` alone holds **44 `useState` hooks**:
```bash
grep -c "useState" apps/web/features/section-editor/SectionDrawingClient.tsx
```
Expect `44`.

The five test files under `apps/web/test/` cover only pure helper modules
(`section-mesh-view`, `section-xlsx`, `chart-data-table`, `section-field-angles`,
`surface-plot-geometry`) — no component is ever rendered.

### Impact

Every user-facing regression — a broken import, a mis-wired panel, a chart that stops updating — is
found by a human or by a customer. The engineering kernel is well tested; the layer the customer
actually touches is not tested at all.

---

<a name="c-03"></a>
## C-03 — P2 — No linter, no formatter, no coverage, no dependency audit; 4 high-severity CVEs open

### Claim

`npm run lint` is an alias for the type checker. There is no ESLint/Biome, no Prettier, no coverage
measurement, and no `npm audit` in CI. Production dependencies currently carry 6 known
vulnerabilities, 4 of them high.

### Evidence

`package.json`
```json
"lint": "npm run typecheck",
"typecheck": "tsc --noEmit",
```

```bash
ls | grep -iE "eslint|prettier|biome"
```
Expect no config files at the repository root.

```bash
grep -rn "coverage\|c8\|nyc\|istanbul" package.json .github/workflows/ci.yml
```
Expect no hits.

```bash
npm audit --omit=dev
```
Actual result at `c1fe77f` — **6 vulnerabilities (2 moderate, 4 high)** in production dependencies:

| Package | Severity | Issue |
|---|---|---|
| `sharp` `<0.35.0` | **high** | inherited libvips CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 (GHSA-f88m-g3jw-g9cj) |
| `postcss` `<=8.5.22` | **high** | reached via `next` |
| `brace-expansion` `<=1.1.17 \|\| 2.0.0 - 2.1.3` | **high** | transitive |
| `uuid` `<11.1.1` | moderate | missing buffer bounds check in v3/v5/v6; reached via `exceljs >=3.5.0` |

Including dev dependencies the total is **12 vulnerabilities (7 moderate, 5 high)**.

Reproduce both counts:
```bash
npm audit --omit=dev 2>&1 | grep -E "^[0-9]+ vulnerabilit"   # 6 vulnerabilities (2 moderate, 4 high)
npm audit           2>&1 | grep -E "^[0-9]+ vulnerabilit"   # 12 vulnerabilities (7 moderate, 5 high)
```

`.github/workflows/ci.yml` contains no `npm audit`, no dependency-review action, and no SAST step.

### Impact

`tsc --noEmit` catches type errors, not unused variables, floating promises, exhaustive-deps
violations, or accidental `any`. With no formatter, style is per-author. With no audit gate, CVEs
accumulate silently in a product that will be distributed to customers.

---

<a name="c-04"></a>
## C-04 — P2 — CI runs a strict subset of `npm test`

### Claim

Three test suites that `npm test` runs locally are absent from CI and can rot undetected.

### Evidence

`package.json` — `npm test` runs:
`check:structure`, `typecheck`, `test:unit`, `test:cad`, `test:roundtrip`, `test:pm-stations`,
`test:excel-export`, `test:excel-block`, `test:pdf-report`

`.github/workflows/ci.yml` runs:
`typecheck`, `test:unit`, `test:cad`, `test:roundtrip`, `test:pm-stations`, `test:excel-export`,
(dead fixture gate), `bench:verify`, `build`

Missing from CI: **`check:structure`**, **`test:excel-block`**, **`test:pdf-report`**.

`check:structure` is the repository-layout invariant checker
(`tools/architecture/check-repository-layout.ts`) — the guard on package boundaries. It is never run
by CI.

### Reproduce

```bash
grep -n "run:" .github/workflows/ci.yml
```
Compare against the `test` script in `package.json`.

---

<a name="c-05"></a>
## C-05 — P2 — God module: `pm-analysis/src/index.ts` is 4 210 lines

### Claim

The analysis kernel is one file holding roughly 120 top-level declarations spanning at least eight
unrelated responsibilities.

### Evidence

```bash
wc -l packages/pm-analysis/src/index.ts
```
Expect `4210`.

Responsibilities co-located in that single module:

| Concern | Approx. lines |
|---|---|
| Station schedule definition and labelling | 630–880 |
| Fibre assembly, material resolution, mesh binding | 886–1070 |
| Forward evaluation and consistent tangent | 1070–1180 |
| Strain-plane construction from stations | 1245–1600 |
| Surface triangulation and topology | 1599–1800 |
| Legacy fixed surface builder | 1904–2347 |
| Independent adaptive surface builder | 2349–2824 |
| Design surface, φ application, axial cap | 2883–3263 |
| Contour slicing and moment-plane geometry | 3324–3600 |
| 3×3 linear solve, ray–triangle, utilization | 3638–3860 |
| Newton inverse solver | 3885–3980 |

Companion offenders: `SectionDrawingClient.tsx` (2 912), `ResultsWorkspace.tsx` (2 272),
`pm-report/src/excel/stress-strain.ts` (1 917), `pm-equivalent-block/src/surface.ts` (1 558),
`pm-project/src/validate.ts` (1 225).

### Impact

The module cannot be reviewed in isolation, cannot be unit-tested by responsibility, and every
change touches the same file — guaranteeing merge conflicts on any multi-author team. For a codebase
whose own `docs/09` requires "independent software/numerical reviewer" sign-off, a 4 210-line
reviewable unit is an obstacle to the stated process.

---

<a name="c-06"></a>
## C-06 — P2 — No React error boundary; a render throw yields a blank page

### Claim

There is no error boundary component, no `componentDidCatch`, and no Next.js `error.tsx` or
`global-error.tsx`. Any exception thrown during render unmounts the tree and leaves a white screen
with no recovery and no way to save work.

### Evidence

```bash
grep -rn "ErrorBoundary\|componentDidCatch" apps/web --include="*.tsx" | grep -v "\.next"
find apps/web/app -name "error.tsx" -o -name "global-error.tsx"
```
Expect zero hits from both.

`apps/web/app/` contains only `layout.tsx`, `page.tsx`, `globals.css`, `side-panel.css`.

### Impact

Compounds directly with [D-01](#d-01): because nothing is persisted, a blank screen means the user
loses the entire model, not just the current view.

---

<a name="c-07"></a>
## C-07 — P3 — `window.alert` / `window.confirm` as the error-reporting channel

### Claim

Import/export failures and destructive-action confirmations use native browser modals.

### Evidence

```bash
grep -rn "window.alert\|window.confirm" apps/web --include="*.tsx" | grep -v "\.next"
```
Expect 12 hits across:
- `apps/web/features/section-editor/loadings/LoadingsPanel.tsx:210`
- `apps/web/features/section-editor/SectionDrawingClient.tsx` — lines 1094, 1139, 1144, 1382, 1580, 1603, 1610, 1623, 1628, 1665, 1719

### Impact

Native modals block the main thread, cannot be styled, are suppressible by the browser after repeated
use, cannot be tested, and cannot show structured multi-issue validation output — which is exactly
what a project-import failure needs to show.

---

# 4. Product and pipeline design

<a name="d-01"></a>
## D-01 — P1 — No persistence of any kind; a page refresh destroys all work

### Claim

The application stores nothing. No `localStorage`, no `IndexedDB`, no `sessionStorage`, no server, no
autosave, no crash recovery, no recent-files list. Closing or refreshing the tab loses the entire
model.

### Evidence

```bash
grep -rn "localStorage\|indexedDB\|sessionStorage" --include="*.ts" --include="*.tsx" apps packages | grep -v node_modules
```
Expect **zero** hits.

```bash
find apps/web/app -type f
```
Expect only `layout.tsx`, `page.tsx`, `globals.css`, `side-panel.css` — no API route, no server
action, no database layer.

The only way to persist a model is an explicit manual file download/upload round trip through
`parseProjectDocument` / `serializeProjectDocument`.

### Impact

This alone disqualifies the product from commercial engineering use. A user who spends an hour
drawing a complex section and then hits a stray refresh, a browser crash, or the render exception
from [C-06](#c-06) loses everything with no recovery path. Every commercial competitor autosaves.

---

<a name="d-02"></a>
## D-02 — P1 — No undo/redo in a geometry editor

### Claim

The section drawing editor supports boolean operations, polygon editing, and rebar layout, but has no
undo or redo.

### Evidence

```bash
grep -rni "undo\|redo\|useHistory\|commandStack" apps/web --include="*.tsx" --include="*.ts" | grep -v "\.next"
```
Expect zero hits.

State is held in 44 independent `useState` hooks in `SectionDrawingClient.tsx` with no command
pattern, no immutable history stack, and no state snapshot mechanism, so undo cannot be retrofitted
cheaply.

### Impact

Baseline expectation for any drawing tool since roughly 1990. A mis-clicked boolean subtract means
redrawing the section.

---

<a name="d-03"></a>
## D-03 — P1 — Project format has no migration path

### Claim

`parseProjectDocumentValue` requires exact version equality. The moment `PM_PROJECT_VERSION` is
incremented, every project file any customer has ever saved becomes unreadable.

### Evidence

`packages/pm-project/src/types.ts:11`
```ts
export const PM_PROJECT_VERSION = 1 as const
```

`packages/pm-project/src/validate.ts:1153`
```ts
  assert(value.version === PM_PROJECT_VERSION, `Unsupported project version: ${String(value.version)}`)
```

There are ad-hoc migration helpers — `migrateLegacyAnalysis` at `validate.ts:621`, EN factor
migration at `validate.ts:1101` — but these normalise *within* version 1. There is no
version → version migration chain, no `migrations` registry, and no read-old/write-new capability.

### Reproduce

```bash
grep -rn "PM_PROJECT_VERSION" packages/pm-project/src/
```
Confirm a single constant with a single equality assertion and no dispatch table.

### Impact

Every future schema change is a breaking change for the installed base. This gets more expensive
every day it is deferred, because the number of files in the wild only grows. The fix is cheap
*now* (add a `migrations: Record<number, (doc) => doc>` chain while there is only one version) and
expensive later.

---

<a name="d-04"></a>
## D-04 — P1 — The PDF report silently deletes every unsupported character, including all Korean

### Claim

The PDF writer uses only the standard-14 Type1 fonts with WinAnsiEncoding plus a 17-entry punctuation
map and the Symbol font. Any character outside that set is **dropped without a warning, a
substitution glyph, or an error**. For a product whose primary design code is KDS (Korea), the
official design report cannot print a Korean project name.

### Evidence — the drop happens here

`packages/pm-report/src/pdf/font-metrics.ts:125-143`
```ts
  for (const character of text) {
    const symbol = SYMBOL_CODES.get(character)
    if (symbol !== undefined) { push(SYMBOL, symbol); continue }
    const winAnsi = WIN_ANSI_CODES.get(character)
    if (winAnsi !== undefined) { push(latin, winAnsi); continue }
    const code = character.codePointAt(0) ?? 0
    if (code >= 32 && code <= 126) { push(latin, code); continue }
    if (WIDTHS[latin].has(code) && code <= 255) push(latin, code)   // line 141
  }
```
Line 141 is the last statement in the loop body. A character that fails all four tests falls off the
end and is never pushed — it vanishes.

`WIN_ANSI_CODES` (`font-metrics.ts:94-100`) contains exactly 17 entries: `– — ° ± ² ³ · × ÷ ' ' " " … − ‑ ‒`.
`WIDTHS[latin]` is built by `ascii([...])` at `font-metrics.ts:25,34` and covers ASCII only, so the
line-141 fallback never fires for Latin-1 accents either.

`packages/pm-report/src/pdf/writer.ts:262-264` confirms only non-embedded standard-14 fonts:
```ts
      F1: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
      F2: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
```

`packages/pm-report/src/pdf/writer.ts:8-13` states the design intent:
> "**Determinism.** No embedded font subset… **No dependency.** The web bundle gains nothing; the standard-14 fonts are in the reader."

### Evidence — demonstrated, not inferred

Running `splitTextRuns` directly and decoding the emitted byte codes:

```
in : "Column C1"              out: "Column C1"
in : "기둥 C1 설계"            out: " C1 "
in : "Cột trục A — tầng 3"     out: "Ct trc A  tng 3"
in : "Säule Nr. 5"             out: "Sule Nr. 5"
```

Note the third and fourth lines: even `ä` (WinAnsi 0xE4) and Vietnamese diacritics are lost, so this
is not only a CJK limitation — the writer does not deliver the Latin-1 coverage that WinAnsiEncoding
implies.

### Reproduce

Create a scratch file and run it with `tsx`:
```ts
import { splitTextRuns } from '@pm/report/pdf/font-metrics'
const decode = (t: string) =>
  splitTextRuns(t, 'F1' as never).flatMap(r => r.codes).map(c => String.fromCharCode(c)).join('')
for (const s of ['기둥 C1 설계', 'Cột trục A — tầng 3', 'Säule Nr. 5']) {
  console.log(JSON.stringify(s), '->', JSON.stringify(decode(s)))
}
```

### Impact

A design report is a professional deliverable that may carry legal weight. Silently deleting
characters from a project title, a member mark, or an engineer's name is worse than failing loudly.
The code comment at `font-metrics.ts:111-113` argues a visible gap beats a silent `?`, but for
commercial software neither is acceptable — the correct answer is an embedded TrueType subset with
Identity-H encoding, which was explicitly declined for bundle-size and determinism reasons.

### Suggested resolution

Embed a subsetted TrueType font (e.g. Noto Sans / Noto Sans KR) with Identity-H. Failing that, at
minimum raise a blocking error listing the unrepresentable characters rather than dropping them.

---

<a name="d-05"></a>
## D-05 — P2 — No i18n; no LICENSE; no third-party licence inventory

### Claim

All UI strings are hardcoded English with no internationalisation framework, in a product whose lead
design code is Korean. The repository has no licence file and no inventory of third-party licences.

### Evidence

```bash
grep -rn "i18n\|useTranslation\|next-intl\|react-intl\|locale" apps/web --include="*.tsx" --include="*.ts" | grep -v "\.next"
```
Expect zero hits.

```bash
ls LICENSE* COPYING* 2>/dev/null || echo "NO LICENSE"
```
Expect `NO LICENSE`.

Third-party production dependencies with no recorded licence review:
`@jscad/regl-renderer`, `exceljs`, `gl-mat4`, `gl-vec3`, `lucide-react`, `next`, `react`,
`react-dom`, plus `plotly.js-dist-min` (referenced by `apps/web/types/plotly.js-dist-min.d.ts`).

### Impact

The IP position is undefined — there is nothing stating what may be done with this code, and no
evidence that the transitive dependency licences are compatible with commercial distribution. This
must be resolved before any release.

---

<a name="d-06"></a>
## D-06 — P2 — Single worker, no in-flight cancellation, no parallelism

### Claim

All analysis runs on one Web Worker. A running job cannot be interrupted; cancellation only drains
the queue of jobs not yet started. There is no parallelism across strain-plane directions, which is
embarrassingly parallel work.

### Evidence

`apps/web/workers/pm-analysis.worker.ts:61-66`
```ts
/**
 * Jobs withdrawn before they were dequeued. A worker cannot interrupt itself mid-computation, so
 * this drains the backlog that accumulates while one job runs — which is exactly what a rapid edit
 * produces. The job already running still completes; the client discards its result.
 */
const cancelled = new Set<string>()
```

The comment is an accurate self-description of the limitation.

Secondary issue — cache keys are full payload serialisations, recomputed on every message:

`apps/web/workers/pm-analysis.worker.ts` (`blockSurfaceInputKey`, `preparedBlockFor`)
```ts
  const key = JSON.stringify(payload)
```
This is `O(size of section + rebars + materials)` per message and is sensitive to object key order,
so two structurally identical payloads can miss the cache.

### Impact

On a fine mesh the surface build measured 2.4 s single-threaded in this audit (h = 6.25 mm, 57 344
triangles). During that window the user cannot cancel, and a rapid edit sequence queues work that is
computed and then thrown away.

---

<a name="d-07"></a>
## D-07 — P1 — The V&V regime described in `docs/09` has no artifact in the repository

### Claim

`docs/09-verification-validation-and-release.md` defines a formal V&V process aligned to ASME V&V 10
and IEEE 1012, including a machine-readable requirements traceability matrix, mandatory independent
reviewer roles, and a "no orphan code rule" release gate. **No traceability artifact of any kind
exists in the repository.**

### Evidence — what the document requires

`docs/09` §3:
> Maintain a machine-readable matrix:
> ```text
> Requirement ID -> specification section -> implementation symbol
>                -> verification tests -> evidence artifact -> reviewer/status
> ```
> No orphan code rule or untested requirement is allowed in a release candidate.

`docs/09` §2 requires four distinct roles including "independent licensed/qualified structural
engineer for mechanics and code mapping" and states "the person who implements a design-code rule
shall not be the sole verifier of that rule."

### Evidence — what exists

```bash
grep -rln "Requirement ID" --include="*.md" --include="*.ts" --include="*.json" --include="*.csv" . | grep -v node_modules
```
Expect hits **only inside `docs/`** — that is, only the document describing the matrix, never a matrix.

```bash
git shortlog -sn --all
```
Actual:
```
    36	hung
    11	lxhungdp
```
Two identities, plausibly the same person. There is no review metadata, no CODEOWNERS file, and no
sign-off record anywhere in the repository or in CI.

```bash
ls .github/
```
Expect only `workflows/` — no PR template, no CODEOWNERS, no review checklist.

### Impact

This is the highest-level risk in the project and the reason it is listed as P1. The documentation
set is genuinely excellent — it would satisfy an external auditor reading it in isolation. The
implementation does not meet it. Findings [N-01](#n-01), [N-02](#n-02), and [C-01](#c-01) are each a
specific instance of the same pattern: a documented control that does not exist in code.

For safety-relevant engineering software, a documented-but-absent control is worse than an absent
control, because it manufactures unearned confidence in the output.

---

# 5. What is genuinely good

Stated for balance, and because a verifier should test these claims too rather than assume the audit
is uniformly negative.

| Area | Evidence |
|---|---|
| **KDS 14 20 20 constants are correct** | `KDS_PARAMETER_TABLE` (`pm-code-kds142020/src/index.ts:105-112`) matches Table 4.1-2 for `fck` 40→90 on all four parameters (`η`, `β1`, `εco`, `εcu`). φ = 0.65 / 0.70 / 0.85 and caps 0.80 / 0.85 match KDS 14 20 10. Tension-controlled limit 0.005 for `fy ≤ 400`, else `2.5εy` — correct. |
| **ACI 318-19 constants are correct** | `aci318Beta1` = `max(0.65, 0.85 − 0.05(f'c − 28)/7)` matches Table 22.2.2.4.3 (SI). `εcu = 0.003`, tension-controlled limit `εty + 0.003`, φ 0.65 / 0.75 / 0.90 — all correct per Table 21.2.2. |
| **Mesh convergence is real** | Independently measured: ~0.19 % at `h = 50 mm` falling to 0.008 % at `h = 12.5 mm` against an `h = 6.25 mm` reference, roughly second order. The kernel is numerically sound. |
| **Newton scaling is done properly** | `index.ts:3905-3918` non-dimensionalises the Jacobian before solving; `solve3` uses partial pivoting with a scale-relative pivot tolerance rather than a raw determinant guard. |
| **Fail-closed error design** | `AnalysisInputError` with a typed `AnalysisErrorCode` union (`index.ts:50-68`); no silent fallback values substituted for missing definitions. |
| **Bit-identity regression gate** | `npm run bench:verify` fingerprints 8 sections × 24 capacity quantities and fails CI on any bit change. Stronger than most commercial practice. |
| **Discretisation error is disclosed to the user** | `SectionResultsPanel.tsx:231` renders the refinement tolerance status. Most commercial tools report nothing. |
| **Provenance per clause** | Every code package carries a `*_PROVENANCE` object naming the exact clause, `implementationVersion`, and `verificationStatus`, and the EN/AS packages honestly self-label as `preview` / `draft-unverified`. |
| **Kernel test suite passes** | `npm run test:unit` → 220 tests, 220 pass, 0 fail. |

---

# 6. Suggested fix order

| # | Finding | Action | Effort |
|---|---|---|---|
| 1 | [C-01](#c-01) | Correct the CI path to `docs/examples/reference-case/projects/...` | one line |
| 2 | [D-04](#d-04) | Embed a subsetted TrueType font with Identity-H, or hard-fail on unrepresentable characters | days |
| 3 | [D-01](#d-01), [D-02](#d-02) | IndexedDB autosave + a command-pattern history stack | weeks |
| 4 | [D-03](#d-03) | Add a version→version migration chain while only v1 exists | days |
| 5 | [S-01](#s-01) | Implement EC2 pivot C, or block `c/D > 1` for the EN profile; extend the mismatch message | days |
| 6 | [C-03](#c-03) | Add `npm audit`, ESLint, and coverage to CI; patch the 4 high CVEs | days |
| 7 | [N-01](#n-01), [N-02](#n-02), [D-07](#d-07) | Reconcile docs with code — implement the controls, or restate the documents to describe what ships | weeks |
| 8 | [C-06](#c-06), [C-07](#c-07) | Error boundary; replace native modals with in-app diagnostics | days |
| 9 | [C-05](#c-05) | Split `pm-analysis/src/index.ts` along the responsibility boundaries listed in C-05 | weeks |
| 10 | [N-02](#n-02) | Implement the `docs/06` convergence study as a CI job so the product can evidence its own error budget | weeks |

---

# 7. Verification environment

For a reviewer reproducing these results:

```
OS        Windows 11 (10.0.26200)
Node      as pinned by CI: 20.19.2
Package   npm@11.5.0
Repo      F:\1. Works\Structures\p-m
Branch    dev/22points @ c1fe77f
```

Commands used during this audit:

```bash
npm run test:unit          # 220 pass / 0 fail
npm run bench:mesh         # timing table, no convergence data
npm run bench:pipelines    # maxRayErrorVsUnified27x144 per case
npm audit --omit=dev       # 6 vulnerabilities, 4 high
```

## Post-commit re-verification log

Every claim was re-run against `c1fe77f` after the commit landed. Results:

| Check | Before (`77f0880` + dirty tree) | At `c1fe77f` | Status |
|---|---|---|---|
| `npm run test:unit` | 220 pass / 0 fail | 220 pass / 0 fail | unchanged |
| Dead CI gate exit code | `0` | `0` | unchanged |
| `.test.tsx` file count | 0 | 0 | unchanged |
| `useState` in `SectionDrawingClient.tsx` | 44 | 44 | unchanged |
| `window.alert` / `window.confirm` count | 12 | 12 | unchanged |
| `localStorage`/`indexedDB`/`sessionStorage` hits | 0 | 0 | unchanged |
| undo/redo hits | 0 | 0 | unchanged |
| ErrorBoundary hits | 0 | 0 | unchanged |
| i18n hits | 0 | 0 | unchanged |
| `EquilibriumOptions`/`Armijo`/`minLoadStep` hits | 0 | 0 | unchanged |
| Mesh convergence, worst ΔM at h=50 mm | 0.1924 % | 0.1924 % | unchanged |
| `npm audit --omit=dev` | 6 (2 mod, 4 high) | 6 (2 mod, 4 high) | unchanged |
| `pm-analysis/src/index.ts` | 4 210 lines | 4 210 lines | unchanged |
| `SectionDrawingClient.tsx` | 2 912 lines | 2 917 lines | +5, finding unaffected |

All pinned line references — `pm-analysis/src/index.ts:1523, 3041, 3898, 623-624`;
`pm-design/src/index.ts:241, 292, 297, 334`; `pm-materials/src/support.ts:62, 88`;
`pm-project/src/types.ts:11`; `pm-project/src/validate.ts:1153`;
`pm-report/src/pdf/font-metrics.ts:141`; `.github/workflows/ci.yml:52` — resolve to the same code at
`c1fe77f` as when first recorded.

The mesh-convergence figures in [N-02](#n-02) come from a purpose-written probe that loads
`docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json`, calls
`buildConcreteMesh` at `cellSize` ∈ {50, 25, 12.5, 6.25} with `maxCells: 4_000_000`, builds the full
production surface via `buildPreviewSurfaceFromPrepared`, and compares vertices matched on
`(beta, station)` against the finest mesh. That probe is not part of the repository; a verifier
should rewrite it independently rather than trusting these numbers.
