# Node.js 24 Deployment Compatibility

Date: 2026-09-04  
Change class: **Class 3 — supported runtime/deployment contract**  
Status: implementation and local reference-runtime verification complete; independent review,
GitHub CI, and Vercel deployment evidence pending

## Objective

Permit managed deployment on any stable Node.js `24.x` patch with npm `11.x`, while continuing to
reject Node.js 20/22 and npm 10/12 and retaining Node.js `24.20.0`/npm `11.19.0` as the exact CI
reference pair.

## Requirements and contracts

- Owner: `docs/development/01-architecture-and-package-boundaries.md` §9 (`DEV-ARCH-007`).
- Input: npm evaluates root `engines` and `devEngines` before install; project scripts then invoke
  the shared runtime guard.
- Output: `24.19.0`, `24.20.0`, and later stable Node.js 24 patches with npm 11 pass the deployment
  gate; Node.js 20/22 and npm outside major 11 fail before project tooling executes.
- Preferred evidence runtime: `.nvmrc` and `packageManager` remain exact at Node.js `24.20.0` and
  npm `11.19.0`; GitHub Actions verifies this pair explicitly.
- Schema/provenance/report impact: none. No geometry, material, mechanics, resistance, utilization,
  report, or project-schema contract changes.

## Blocking failures and acceptance evidence

- malformed or exact patch declarations in deployment-facing `devEngines` fail the structure gate;
- focused policy tests cover accepted 24.x/11.x patches and rejection of Node.js 20/22 and npm
  10/12/missing provenance;
- `npm ci`, `npm run check:structure`, `npm run typecheck`, `npm test`, relevant numerical matrices,
  `npm run build`, `npm run check:security`, and `npm run check:web-bundle` must pass on the exact CI
  reference pair before release claims change;
- a Vercel deployment is external evidence and remains pending until the changed commit is pushed.

## Review of prior attempted fixes

- Commit `a9c7f25` corrected a real Node.js-24-generated fixture bit and missing npm fingerprint
  provenance. Those corrections remain necessary for the exact CI reference evidence and are not
  reverted.
- Commit `01f49d5` addressed a separate, reproduced GitHub Actions failure caused by bounded
  macOS/Ubuntu floating-point roundoff. The Ubuntu pin and typed portable fingerprint comparison
  remain necessary for cross-platform CI and are not Vercel workarounds, so they are not reverted.
- The Vercel failure is instead the pre-install `EBADDEVENGINES` mismatch between Vercel Node.js
  `24.19.0` and the former exact `24.20.0` declaration. This change corrects that contract directly.

## Verification result

Executed locally on the retained reference pair Node.js `24.20.0`/npm `11.19.0`:

- focused runtime-policy tests: 4/4 pass, including acceptance of Node.js `24.19.0` with npm 11 and
  rejection of Node.js 20/22, npm 10/12, missing npm provenance, and malformed policy ranges;
- the project-level `npm run check:runtime` guard was also executed with installed Node.js
  `20.19.2` and `22.22.3`; both were rejected as required;
- clean `npm ci`, `npm run check:structure`, `npm run typecheck`, and `npm test`: pass (317 unit
  tests, 11 CAD tests, project round-trip, Excel, Demand Check, and PDF verification);
- `npm run bench:verify` and `npm run bench:verify:portable`: pass, 8 sections x 24 capacity
  quantities bit-identical with no tolerance consumed;
- `npm run verify:p16`, `npm run bench:strain-sampling`, `npm run bench:equivalent-block`, and
  `npm run bench:pipelines`: pass with no reported verification failure;
- `npm run build` and `npm run check:web-bundle`: pass;
- `npm run check:security`: pass its high/critical gate; the pre-existing two moderate transitive
  `uuid` findings through ExcelJS remain documented.

The current host does not have Node.js `24.19.0` installed, so the focused test supplies that exact
version to the pure policy function rather than claiming a complete local build on Vercel's patch.
The decisive install-path evidence remains the next Vercel deployment after this change is pushed.

## Out of scope

Changing dependencies, numerical formulas, benchmark values, Vercel project settings, accepted
result eligibility, or release approval.
