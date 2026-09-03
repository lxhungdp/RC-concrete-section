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
- Owner-document synchronization and a supported Node.js 24.20.0/npm 11.19.0 CI contract.

## Engineering impact

This candidate does not change project persistence, geometry/material equations, design-code
coefficients, stations, resistance surfaces, utilization definitions, or calculation precision.
The new quick-check evidence is explanatory Preview provenance for values already owned by the
analysis pipeline. Accepted-result and released-report contracts remain unimplemented.

## Local evidence

- structure/type/focused tests: pass;
- full test suite: pass (281 unit tests, 11 CAD tests, project round-trip, station, both Excel paths,
  Demand Check workbook, and PDF report);
- capacity fingerprint: bit-identical for 8 sections x 24 quantities;
- package-owned material-law ordinate tests and the read-only P16 external comparison pass;
- stress-strain, equivalent-block, and cross-model pipeline matrices: pass;
- production build and web-bundle budgets: pass;
- production dependency audit: zero high/critical vulnerabilities; two documented moderate findings;
- production browser smoke: Demand Check edit/switch/modal behavior passes with no console warning or
  error.

The local host provides Node.js 22.22.2. The exact pinned Node.js 24.20.0/npm 11.19.0 run is therefore
an unexecuted pull-request CI gate, not locally inferred evidence.

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
