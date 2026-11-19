# Public Preview Release Candidate — 2026-09-03

Status: **base candidate committed on `dev/27stations` at `c154513`; current audit remediation is
uncommitted; nothing is merged, tagged, deployed, accepted, or released**

Version target: `0.1.0` public Preview.

## Scope

- Calculation Trace refinements in Section Results, including compact presentation, concrete/steel
  summaries, reusable Excel detail generation, and complete report-workbook export.
- Demand Check calculation trace, dedicated row action, compact table layout, unit display, loadcase
  switching, and fail-closed stale-result rendering.
- Report/export reuse and precision formatting without changing full-precision calculation values.
- Removal of generated, private, obsolete, and non-portable repository artifacts.
- Removal of obsolete workbook-derived audit claims; the retained complex section is explicitly a
  neutral software-regression input, not an external verification oracle.
- Owner-document synchronization, a supported Node.js 24.x/npm 11.x execution contract, and an
  exact Node.js 24.20.0/npm 11.19.0 CI reference pair.
- Fail-closed Fixed equivalent-block adequacy, kernel-owned three-state report verdicts, shared
  polygon/rebar validation, explicit user-curve clamp policy, and compensated stress-strain sums.

## Engineering impact

This candidate does not change design-code coefficients, station definitions, or the physical
stress-strain/equivalent-block formulae. It does tighten project input acceptance and canonical
user-curve persistence, changes Fixed equivalent-block verdicts to `indeterminate` without a
validated uncertainty bound, and uses compensated accumulation in the stress-strain kernel. The
quick-check decision is now kernel-owned and copied by PDF/Excel. Accepted-result and
released-report contracts remain unimplemented.

## Local evidence

- structure/type/focused tests: pass;
- full test suite: pass (306 unit tests, 11 CAD tests, project round-trip, station, both Excel paths,
  Demand Check workbook, and PDF report);
- capacity fingerprint: regenerated with explicit Node.js 24.20.0/npm 11.19.0 provenance after
  compensated-summation and invalid benchmark-fixture review; `bench:verify` is bit-identical over
  8 sections x 24 capacity quantities;
- package-owned material-law ordinate tests and the read-only P16 external comparison pass; P16
  regeneration changed 2,899 numeric values by at most `9.61e-9` relatively and `0.00255 N·mm`
  absolutely, consistent with the reviewed accumulation change;
- stress-strain, equivalent-block, and cross-model pipeline matrices: pass;
- production build and web-bundle budgets: pass;
- production dependency audit: zero high/critical vulnerabilities; two documented moderate findings;
- production browser smoke: Demand Check edit/switch/modal behavior passes with no console warning or
  error.

The exact pinned Node.js 24.20.0/npm 11.19.0 runtime produced the evidence above. Promotion remains
blocked until the runtime/result changes are independently reviewed and the CI job reproduces the
local result.

## Promotion gates

Before merging or deploying this candidate:

1. create a reviewable commit and pull request without adding generated artifacts;
2. require all CI jobs to pass on `.nvmrc` Node.js 24.20.0 and npm 11.19.0;
3. record the reviewed commit SHA, named reviewer, deployment environment, and previous known-good
   deployment ID;
4. confirm that public wording remains Stage 1 cross-section resistance Preview and does not imply
   member/code compliance or released engineering results;
5. obtain the independent engineering acceptance required by the owning V&V documents for any use
   beyond development Preview.

## Rollback

If post-deployment checks fail, redeploy the recorded previous known-good Vercel deployment. Revert
the release merge commit through a reviewed pull request; do not rewrite `main` history. Rerun the
production smoke checks and record the incident, affected version, observed evidence, and rollback
deployment ID.
