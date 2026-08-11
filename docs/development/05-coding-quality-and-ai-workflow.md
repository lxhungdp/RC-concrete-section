# Coding Quality and AI Vibe-Coding Workflow

This protocol makes fast AI-assisted implementation auditable. It is not a substitute for
engineering or independent review.

## 1. Task packet

Every result-affecting coding task begins with a short task packet:

```text
Objective:
Engineering requirement IDs:
Allowed packages/files:
Input contract:
Output contract:
Blocking failure cases:
Acceptance tests/oracles:
Schema/provenance/report impact:
Out of scope:
```

If an engineering value, method, convention, or applicability decision is missing, the coding agent
records the gap and stops that branch. It does not select a common-looking value from memory.

## 2. Required AI workflow

### Before editing

1. Read `docs/00-README.md`, the complete relevant engineering documents, and the relevant
   development pipeline documents.
2. Inspect current package APIs, tests, project schema, and uncommitted changes.
3. Map the request to requirement IDs and name any conflict/gap.
4. Define the smallest end-to-end package pipeline slice and its tests.
5. Identify whether the change is preview-only or result-affecting and assign a change class.
6. For biaxial result/check work, explicitly name which angle is a strain-plane sampling angle and
   which angle is a demand moment direction. If the task cannot answer that distinction, stop before
   editing calculation or plotting code.

### During implementation

1. Change the owning package first; expose a stable API.
2. Add validation and typed failure behavior before wiring UI convenience paths.
3. Preserve raw/persisted/normalized/compiled/result layer boundaries.
4. Keep formulas pure and independently testable.
5. Add tests at the same time as the code, including failure boundaries and invariants.
6. Wire the app as a consumer; do not duplicate package logic in components.
7. Update schema/version/provenance/docs when contracts or results change.

For `P-Mx-My` charts and checks, never let an implementation shortcut replace a demand-direction
surface query with "pick the nearest beta row." This is a common vibe-coding failure because both
numbers look like angles. The correct loadcase angle is `thetaLoad = atan2(Muy, Mux)`; it cuts the
completed surface by ray/plane geometry.

### Before handoff

1. Run format/lint/type checks, package unit tests, affected integration tests, and appropriate
   regression/V&V suites.
2. Inspect the final diff for unrelated changes, hidden defaults, duplicated truth, and stale docs.
3. Report what is implemented, what remains preview/unverified, tests run, and known limitations.
4. Do not describe a task as complete when a required gate was skipped or could not run.

## 3. Coding rules

### Types and validation

- TypeScript strict mode is mandatory.
- Public unknown/JSON input passes runtime validation; compile-time types are insufficient.
- Use discriminated unions and exhaustive switches; unreachable defaults throw invariant errors.
- Avoid `any`, unchecked casts, non-null assertions, and optional fields that change engineering
  meaning without a discriminant.
- All numeric public inputs are finite and range-checked.
- Use immutable/read-only normalized and result objects.

### Functions and state

- Calculation functions are pure and deterministic.
- No global mutable current material, current standard, current origin, or tolerance.
- No unit conversion, rounding, factor application, or adequacy decision inside React render code.
- Round only presentation copies. Never feed formatted values back to the kernel.
- Expected engineering failures return typed results; exceptions identify programmer/invariant
  defects.

### Numerical code

- State units, signs, scales, admissible domain, tolerance, and convergence criteria at the API.
- Use scale-aware combined absolute/relative tolerances.
- Use compensated sums where force/moment cancellation matters.
- Add finite checks at material, fiber, linear algebra, and result boundaries.
- Put hard iteration, mesh, memory, and time limits on every adaptive loop.
- Preserve a simpler scalar/reference implementation for differential tests where appropriate.
- Optimization follows profiling and retains tolerance-equivalent behavior.

### Dependencies

- Prefer standard language/package code for simple operations; add a dependency only for a bounded
  capability with an adapter and test fixtures.
- Pin versions for released builds; record license and numerical/reporting role.
- Do not hide a network/download requirement inside the test command.
- Dependency upgrades affecting numerics receive Class 3 or higher review.

## 4. Forbidden shortcuts

| Shortcut | Why prohibited |
|---|---|
| put a factor/strain limit in a component | creates untraceable engineering truth |
| silently default unknown material/standard/model | can calculate the wrong method while appearing successful |
| use `NaN`, `Infinity`, zero, or empty arrays as status codes | confuses invalid state with engineering data |
| analyze editor draft state directly | bypasses apply/validation/normalization and reproducibility |
| use geometry summary warnings as complete validation | misses topology, references, cover, and capability gates |
| use convex hull for capacity plotting | can display non-capacity volume |
| accept last adaptive level after resource limit | converts non-convergence into false confidence |
| update snapshots/workbook targets without engineering classification | hides result drift |
| implement Excel/PDF formulas as a second solver | creates divergent engineering behavior |
| mark a profile verified because formulas compile | omits clause trace, examples, applicability, and independent review |

## 5. Testing standard

Use the smallest sufficient combination of:

- unit tests for formulas, schemas, issue codes, and pure transforms;
- boundary/branch tests at every material, geometry, factor, and tolerance breakpoint;
- property-based tests for translation/rotation/reflection/scaling/order invariants;
- differential tests against independent implementations;
- integration tests across package pipeline stages;
- regression fixtures tied to approved evidence and tolerances;
- UI tests for stale/disabled/error/progress states;
- visual/data verification for Excel/PDF output;
- performance/resource/cancellation tests for workers/adaptive loops.

Each test names its requirement ID and oracle. Test tolerances are justified from the quantity and
scale; they are not loosened until a failure disappears.

CI runs `npm run check:security` and rejects every high or critical production advisory. The current
ExcelJS 4.4 dependency retains a moderate `uuid` advisory for buffer-based v3/v5/v6 calls; this
application does not call those APIs, and npm's proposed automatic fix is an unsafe ExcelJS
downgrade. That exception remains documented and must be reevaluated on every ExcelJS update.

## 6. Review checklist

Reviewers ask:

- Is the engineering rule present in the engineering group, and did code preserve it?
- Is there one authoritative data value and one resistance sequence?
- Are persisted definitions separate from compiled functions and results?
- Can invalid input reach a calculation through any UI/import/API path?
- Are errors typed and tied to an entity/path?
- Are exact geometry and integration approximation kept separate?
- Are units/origin/sign/action basis explicit at every boundary?
- Are strain-direction samples, derived N.A. line angles, and demand moment-direction angles kept
  explicitly separate?
- Does the governing check use the adaptive 3D Design ray, fixed-P use only the fixed grid, and an
  exact vertical meridian trigger a new calculation instead of nearest-angle interpolation?
- Are preview/current/stale/accepted/released states impossible to confuse?
- Do tests cover both sides of every changed branch and an independent oracle where required?
- Does provenance/versioning make old and new results distinguishable?

## 7. Decision records

Create an ADR/engineering decision record for choices involving:

- mechanics or strain convention;
- geometry topology/tolerance/offset/triangulation algorithm;
- material law or design-code interpretation;
- utilization, convergence, uncertainty, or acceptance;
- public schema-v1 contract or parser-v1 behavior;
- numerically relevant dependency;
- result/report integrity and release workflow.

Record context, decision, alternatives, engineering impact, package impact, evidence, reviewers, and
supersession rule. Do not bury the decision only in a pull-request conversation.

## 8. Safe worktree behavior

AI-assisted work assumes existing changes belong to the user. Inspect and preserve them, avoid
unrelated formatting or rewrites, and do not restore/delete files merely because Git shows them as
changed. If a requested change overlaps ambiguous work, report the conflict before destructive
action.

## 9. Handoff template

```text
Outcome:
Requirements implemented:
Packages/contracts changed:
Validation/failure behavior:
Tests and oracles run:
Status (preview/reviewed/verified):
Schema/provenance/report impact:
Known limitations and next gate:
```
