# Programming audit remediation

Date: 2026-11-04. Status: remediation implemented and locally checked; Preview only.
Current online dependency-advisory evidence remains unavailable pending metadata-egress approval.

## Controlled task

- Objective: resolve AUD-001 through AUD-009 from the repository programming audit, in order,
  preserving the existing uncommitted Constant-P and Fixed-P/Adaptive work.
- Requirements: ENG-GEO-001/003/006, ENG-MAT-001/002/005, ENG-AN-003, ENG-RES-002 and
  DEV-ARCH-001 through DEV-ARCH-007; the control map selects the owning authorities.
- Classes: Class 3 for input/mesh/resource contracts and verification tooling; Class 4 for the
  constitutive tangent correction on inconsistent steel definitions; Class 2 for result-identical
  module extraction and batch allocation reduction; Class 1 for documentary corrections.
- Owners: geometry mesh/validation, material validation/compilation, analysis preparation and
  queries, project parsing, web import/execution adapters, verification tooling and mapped docs.
- Input contract: canonical mm, MPa, N and N mm, compression positive; exact section geometry
  remains separate from integration points. Public compilation accepts validated definitions;
  stored yield strain, when supplied, must agree with the effective elastic yield point.
- Output contract: finite results or typed blocking failures; mesh preparation requires the same
  source geometry; existing valid resultants, factors, classifications and public facades remain
  stable. No accepted-result or released-report status is introduced.
- Blocking cases: mismatched mesh, non-finite strain/origin/arithmetic, invalid material,
  inconsistent yield data, import resource exhaustion, unresolved oracle drift or dependency cycle.
- Oracles: analytical rectangle/quadrature and material-derivative checks, API failure probes,
  existing exact/portable capacity fingerprints, unchanged external UMD numbers, independently
  recalculated workbooks, topology/path fixtures and deterministic worker/fallback comparisons.
- Schema/provenance/report impact: mesh source identity is transient. No new project schema,
  normative coefficient, resistance rule or standard profile. Legacy verification-project input
  may be compared through its documented canonicalization boundary without replacing numeric
  external evidence. Resource limits are implementation safety bounds and must be documented.
- Out of scope: member design, new mechanics/strain domains, profile certification, numerical
  baseline replacement, tolerance relaxation, unrelated styling, commits and pushes.

## Disposition register

| Finding | Required disposition | Status |
|---|---|---|
| AUD-001 | Bind an integration mesh to its exact source definition and reject a mismatch | Implemented; the equal-area wrong-rectangle probe is rejected; translated/changed geometry cannot reuse the key |
| AUD-002 | Validate public state/origin/material inputs and finite reductions | Implemented; non-finite states/origins/arithmetic, invalid model parameters and mismatched model-specific compilers fail with typed evidence |
| AUD-003 | One effective yield point for stress, tangent and declared limits | Implemented; contradictory snapshots are rejected and the independently calculated plateau derivative agrees in both strength stages |
| AUD-004 | Bounded JSON/entity preflight before expensive geometry work | Implemented; file/text/entity limits precede expensive work; browser JSON import uses a disposable cancellable validation worker |
| AUD-005 | Reconcile legacy P16 input serialization; retain numeric oracles and fingerprint policy | Implemented; P16 and portable fingerprint pass; archived input, numeric fixtures and tolerances remain unchanged |
| AUD-006 | Reconcile live schema, capability, package and cancellation documentation | Implemented; current v3/legacy contracts, Preview capabilities, result ownership, cancellation and target-only interfaces are explicit; broken skill-reference link corrected |
| AUD-007 | Source-only architecture checks, dependency/export checks, traceability and CI parity | Implemented; lint, local-link/live-contract, DAG/export and 39-requirement traceability gates pass; CI includes ADSEC and sampling modes; online security gate remains pending |
| AUD-008 | Cohesive contract/use-case modules and declared direct dependencies | Implemented; neutral contracts/audits/errors have explicit result-package subpaths, block production code no longer imports stress-strain analysis, and worker/fallback share one execution owner |
| AUD-009 | Reuse immutable triangle preparation with measured equivalent batch results | Implemented; exact complete-result comparisons pass; the original 100-demand probe prepares 1,550 wrappers once instead of 200 times |

## Verification plan

Run focused owner tests after each slice, then structure, typecheck, full tests, production build,
bundle budgets, strain sampling, equivalent-block, pipeline and sampling-mode benchmarks. Replay
the approved portable fingerprint with the existing Node 24.20.0/npm 11.19.0 reference runtime.
Exact replay against a Darwin/arm64 recording is not claimed on Windows/x64. Keep benchmark and
external numeric fixtures unchanged unless separately reviewed evidence requires a change.

Dependency advisory access remains subject to the earlier explicit metadata-egress approval
request; local remediation does not imply that approval. Independent structural/code-profile
review and accepted/released-result qualification remain open release gates.

## Delivered contracts and ownership

- Geometry owns the transient `ConcreteMesh.geometryKey`, exact source-coordinate identity and
  bounded validation. `prepareAnalysisFromMesh` rejects a foreign/missing key before integration.
  Existing meshes built by `buildConcreteMesh` carry the key automatically; manually assembled
  meshes must satisfy this provenance-bearing contract. This is not a project-schema field.
- Materials owns validated generic/model-specific compilers, finite compiled limits/evaluation,
  and the effective yield snapshot. Invalid input is blocked rather than normalized into a new
  engineering definition. Expected material failures are mapped consistently at application
  execution boundaries. Hardening construction rules and standard coefficients are unchanged.
- Project owns JSON UTF-8/entity preflight and typed parser failures. Geometry/material budgets
  reuse their owning constants; the web file adapter checks size before `text()`. The JSON-import
  worker applies only a successful parser result, rejects worker failure, terminates on abort and
  suppresses late results. Worker-free/recent/example paths retain bounded synchronous parsing;
  inner-loop cooperative cancellation is not claimed.
- `@pm/results/contracts`, `/audit` and `/errors` own shared DTOs, pure trace assembly and common
  input errors. Existing analysis facades retain their public exports. Constitutive/surface
  mechanics remain independent. `application/analysis/execution.ts` owns both mechanics' use
  cases and the existing bounded prepared/surface caches; worker handles and export I/O stay in
  adapters. Further decomposition of the substantial analysis facade is possible future work.
- Web, block bridge and results manifests declare their direct dependencies. Read-only comparison
  confirms all 19 workspace manifests agree with lockfile metadata; no dependency version or
  third-party package was added/upgraded. The block bridge uses stress-strain analysis only in
  tests through a declared development dependency.
- `check:structure` ignores generated trees/symlinks and checks static/type imports, re-exports,
  static dynamic imports, public exports, declared direct dependencies, relative bypasses and
  cycles. It enforces inward core/presentation, application and standard-adapter boundaries.
  Computed module specifiers/global runtime behavior still require review.
- [The traceability registry](../development/verification-matrix.json) links all 39 declared
  requirements to authorities, real implementation symbols, tests/oracles and evidence records.
  Its partial/open coverage and null independent reviewers are explicit; a passing link check
  does not establish complete acceptance. `check:docs` checks local targets and selected live
  schema/release-gate contracts, not every sentence's truth.

There is no project-schema revision, changed normative coefficient, new resistance route,
accepted-result status or released-report contract. Valid numerical/regression evidence is
preserved. Previously accepted contradictory/non-finite/oversized public input now fails closed.
`ParseProjectFailure` carries an explicit `INVALID_PROJECT` or `PROJECT_RESOURCE_LIMIT` code.
Existing user styling, Constant-P, Fixed-P/Adaptive, field and report work was preserved; no commit
or push was created.

## Verification evidence

Reference execution: Windows/x64, Node 24.20.0 and npm 11.19.0. Local evidence directory:
`C:/Users/USER/.codex/visualizations/2026/11/04/01a1a56f-b560-77f1-b37b-0dde0a31f0cc`.

| Gate | Observed result | Evidence file |
|---|---|---|
| `npm test` | Passed: 618 main unit tests, 5 ADSEC tests, 11 CAD checks, project round trips, independent workbook recalculation and PDF data/structure/reproducibility | `pm-fixes-final-test.log` |
| `npm run lint` and final doc/trace replay | Passed: structure, TypeScript, 138 Markdown files/353 local targets and 39 requirement links | Full-test log; `pm-fixes-final-docs.log` |
| `npm run build` | Passed, production routes generated | `pm-fixes-final-build.log` |
| `npm run check:web-bundle` | Passed: initial 351.7/375 KiB, Plotly 1325.4/1400 KiB, analysis worker 69.5/120 KiB, Excel 248.1/300 KiB; gzip ceilings unchanged | `pm-fixes-final-bundle.log` |
| `npm run bench:verify:portable` | Passed: 17 allowed resultant-roundoff deviations, worst section-normalized delta `4.957e-17`; structural/state policy unchanged | `pm-fixes-final-bench-verify-portable.log` |
| `npm run bench:strain-sampling` | Passed, no failures | `pm-fixes-final-bench-strain-sampling.log` |
| `npm run bench:equivalent-block` | Passed, no verification failures | `pm-fixes-final-bench-equivalent-block.log` |
| `npm run bench:pipelines` | Passed, no failures | `pm-fixes-final-bench-pipelines.log` |
| `npm run bench:sampling-modes` | Passed, no failures | `pm-fixes-final-bench-sampling-modes.log` |
| `npm run verify:p16` | Passed through documented legacy-input canonicalization; object field order alone is ignored, while numeric values, identity and array order remain checked | `pm-fixes-final-verify-p16.log` |
| Original public-API reproductions | All five defect probes now reject the invalid input; 100/100 batch utilizations remain finite | `pm-fixes-api-probes.json` |
| Actual production Edge worker/fallback replay | Passed: 19 profile/mode/shape configurations and 228 table verdicts under both demand bases, including JSON imports and the unresolved hardening diagnostic | `pm-fixes-browser.log`, `pm-fixes-browser/browser.json` |

The numerical/external baseline and example fixture files have no diff from this remediation.
The final full-suite replay recorded 416 source/configuration/fixture paths before and after;
`pm-fixes-snapshot-after-final.json` reports no changed paths during that replay. Documentation
handoff edits were checked separately with the final doc/trace gates.
The P16 change compares the archived v1 input through the existing canonical export boundary;
it does not replace external UMD numbers. The concurrent Fixed-P repair's serializer preserves
legacy polar fingerprint order while application paths retain adjacency; this remediation reran
the existing gate rather than changing that oracle. Exact replay of a Darwin/arm64 recording is
not claimed on Windows/x64.

The browser runner required approved sandbox escalation because loopback fetch returned `EACCES`.
It used a separate loopback server and closed its own process afterward. This approval did not
grant npm-registry metadata egress.

### Batch allocation and resource experiment

`pm-fixes-batch-ab.mjs` privately compiles the same current kernel with and without only the
explicit-topology wrapper cache. It does not edit production source or a baseline. Complete returned
objects match production in each variant and their aggregate result hashes agree. The original
100-demand/1,550-triangle probe drops from 200 preparations/310,000 wrappers to one/1,550.
Direct DTO vertex/index/direction edits also invalidate cached wrappers in owner tests.

Two warmups and nine measured batches per case, fresh process per variant; median milliseconds:

| Distinct-P workload | Uncached | Cached |
|---|---:|---:|
| 20 demands, proportional 3D | 19.99 | 15.92 |
| 20 demands, Constant P | 34.10 | 29.54 |
| 100 demands, proportional 3D | 63.96 | 59.23 |
| 100 demands, Constant P | 153.98 | 140.03 |

Observed heap deltas fell in these runs, but whole-process peak RSS was 252,160 KiB uncached and
260,360 KiB cached, including common model preparation. This is not evidence of lower total peak
memory or a universal speedup. The cache retains O(triangles) wrappers per live points/topology
identity through WeakMaps; queries still scan triangles per demand. Cross-demand contour caching,
spatial acceleration, Wasm and the broader private performance candidate remain deferred.

## Remaining gates and status

All nine implementation dispositions have local software/numerical evidence. The task is not a
release approval: qualified independent profile/engineering review, accepted-result uncertainty,
immutable result/report provenance and the other mapped Stage 1 release gaps remain open.
The supplied analytical/differential tests are independent computations, not independent qualified
structural review. No cross-agent CLI runtime verification is claimed from correcting one skill
documentation reference; the skill frontmatter/workflow and Claude adapter contract are unchanged.

`npm run check:security` has no fresh result. Automatic approval review rejected the earlier
`npm audit` because it would send potentially sensitive dependency names/versions to the external
npm registry without explicit permission. This work did not retry or bypass that rejection.
The source/manifest fixes, local lockfile checks and completed tests do not imply a current clean
advisory assessment. The existing security CI gate remains enabled.
