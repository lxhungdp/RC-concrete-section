# Node.js 24 Runtime Hardening

Date: 2026-09-03  
Change class: **Class 3 — build/runtime dependency, CI execution contract, and runtime-bound
fingerprint migration**  
Status: runtime implementation, Node.js 24 fingerprint migration, and local gates complete;
independent review/CI reproduction remain required; no merge, tag, deployment, or engineering-status
promotion authorized

## Objective

Make Node.js 24.20.0 with npm 11.19.0 the only supported project development, test, build, and CI
runtime, and verify the existing engineering outputs on that exact runtime.

## Engineering requirement IDs

- `DEV-ARCH-007`: third-party runtime and build dependencies remain explicit and controlled;
- Gate B and Gate F from `engineering/06-verification-acceptance-and-change-control.md`;
- Gate B, Gate E, and Gate F from `docs/09-verification-validation-and-release.md`.

## Allowed packages/files

- `.nvmrc`, `.npmrc`, workspace package manifests, `package-lock.json`, and the shared runtime
  guard;
- `.github/workflows/ci.yml`;
- the repository-structure invariant, runtime/dependency ownership documentation, and this task
  packet;
- current release-candidate evidence updated only after the exact-runtime gates execute.

## Input contract

The owning development document already selects Node.js 24.20.0 and its bundled npm 11.19.0. The
repository must not broaden, silently substitute, or infer another runtime. The committed capacity
fingerprint predates that contract, has no runtime identity, and reproduces bit-for-bit on Node.js
20.19.2 and 22.22.2. Historical benchmark records remain commit-scoped evidence and are not active
runtime declarations.

## Output contract

- `.nvmrc`, exact root `engines`, `devEngines`, `packageManager`, and the lockfile agree on Node.js
  24.20.0/npm 11.19.0;
- `.npmrc` rejects dependency installation when the declared engine contract is not met;
- every supported root/workspace script invokes one shared exact-version runtime guard, and the
  structure check rejects any future unguarded script or runtime metadata drift;
- Node.js type declarations target major 24 rather than a newer runtime API surface;
- GitHub checkout/setup actions execute on their Node.js 24 action runtime and the job verifies the
  exact application runtime before installing dependencies;
- after explicit review authorization, the capacity fingerprint is deliberately regenerated once on
  the exact supported runtime, records its Node.js/npm identity, and future verification rejects a
  baseline/runtime mismatch;
- required tests, numerical matrices, reports, build, security, and bundle gates execute locally on
  the exact pinned runtime; any runtime-bound fingerprint movement is quantified and reviewed rather
  than silently accepted.

## Blocking failure cases

Any active configuration selecting Node.js 20 or 22, mismatch among runtime declarations,
dependency installation under a non-pinned runtime, a CI action that executes on an older Node.js
runtime, lockfile drift, unexplained drift beyond floating-point roundoff, report/export regression,
type/build/security failure, or bundle-budget failure.

## Acceptance tests/oracles

- exact `node --version` and `npm --version` checks after `.nvmrc` activation;
- repository-wide active-configuration scan for Node.js 20/22 selectors;
- `npm ci`, `npm run check:structure`, `npm run typecheck`, and the full `npm test` pipeline;
- `npm run bench:verify`, `npm run bench:strain-sampling`,
  `npm run bench:equivalent-block`, and `npm run bench:pipelines`;
- `npm run build`, `npm run check:web-bundle`, and `npm run check:security`.

## Investigation findings

### NV24-001 — the old fingerprint has no runtime provenance

Claim and requirements: capacity fingerprints must be reproducible on the supported runtime and
must not silently compare results from different V8/libm implementations (`ENG-MAT-002`, Gate B,
Gate F).

Evidence: the committed fingerprint matches Node.js 20.19.2 and 22.22.2 bit-for-bit. Node.js 24.20.0
changes only the `tall-rectangle-dense` fixture, the only benchmark case using the KDS
non-integer-exponent high-strength concrete branch. The changed capacity arrays have a maximum
absolute delta of `2.6703e-5 N·mm` and a maximum section-scale normalized delta of `4.895e-16`.
Mesh hashes and every stored strain state remain identical. The full analytical/unit/report suite
and the independent strain-sampling, equivalent-block, and cross-model matrices pass.

Interpretation: this is consistent with a runtime math-library rounding change in `Math.pow`, not an
engineering-model or algorithm change. V8 began routing its IEEE-754 functions through LLVM libm in
2026 ([Node.js V8 issue 308](https://github.com/nodejs/node-v8/issues/308), accessed 2026-09-03).
The inference is bounded by the evidence above; it is not a claim of platform-independent bit
identity.

Disposition: the harness records Node.js/npm identity and makes `bench:verify` fail before comparison
when the baseline runtime differs. The subsequent implementation authorization also included a
Class 4 compensated-summation change and correction of an invalid L-section benchmark rebar layout;
after the independent P16 comparison and focused analytical tests passed, the fingerprint was
regenerated on Node.js 24.20.0/npm 11.19.0. The prior oracle remains recoverable in Git history and
no tolerance was loosened or numeric value rounded.

### NV24-002 — metadata alone did not block old npm script execution

Claim and requirements: unsupported runtimes must fail before any development, test, build, or
benchmark entry point executes (Gate B, Gate E).

Evidence: npm 10.8.2 under Node.js 20.19.2 ignored `devEngines` for `npm run` and started the
structure checker. After adding the shared guard, the same command stops with the exact expected and
received Node.js/npm versions before loading project tooling. The guard passes on the pinned pair.

Disposition: keep the shared guard at every root/workspace script and enforce that invariant from
`check:structure`.

## Schema/provenance/report impact

This runtime-hardening slice changes no project schema, formula, design coefficient, station,
resistance surface, utilization, or report contract. The concurrent Class 4 remediation owns its
separate schema/result changes and fingerprint impact. Runtime and Node.js type declarations change;
therefore full result-identity and report/build evidence is required before release.

## Verification status

- pass: exact Node.js 24.20.0/npm 11.19.0 activation, clean `npm ci`, repository structure,
  typecheck, 306 unit tests, 11 CAD tests, project round-trip, Excel exports, Demand Check workbook,
  PDF report, production build, web-bundle budgets, and the high/critical dependency-audit gate;
- pass: strain-sampling, equivalent-block, and cross-model pipeline verification matrices;
- pass: the regenerated fingerprint records Node.js 24.20.0/npm 11.19.0 and `bench:verify` is
  bit-identical across 8 sections and 24 capacity quantities;
- outstanding: named independent review and CI reproduction on the committed candidate.

## Out of scope

Changing calculation mechanics, design-code profiles, dependencies unrelated to the Node.js type
surface, historical benchmark observations, accepted-result eligibility, deployment, or release
approval.
