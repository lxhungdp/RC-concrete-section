# Public Preview Release Cleanup

Date: 2026-09-03
Change class: **Class 3 — supported runtime/CI and report-provenance cleanup; result-identical**
Status: implementation and local verification complete; no commit, merge, or deployment authorized

Objective:
Prepare one reviewable public-preview release candidate by removing non-portable private artifacts,
aligning owner documentation with the implemented workflow, pinning a supported build runtime, and
moving all result-relevant verification matrices into pull-request CI.

Engineering requirement IDs:
`DEV-ARCH-006`, `DEV-ARCH-007`, `ENG-REP-002`, and release Gates A, B, F, and G from
`engineering/06-verification-acceptance-and-change-control.md`.

Allowed packages/files:

- workflow, architecture, report-pipeline, example-provenance, and release documentation;
- root runtime manifests and `.github/workflows/ci.yml`;
- historical external-reference labels in analysis/report source comments and preview provenance;
- the existing Demand Check task packet and focused web helper/test needed to reject stale evidence;
- deletion of generated, private, obsolete, externally linked, or non-portable public-tree artifacts.

Input contract:
The complete uncommitted working tree on `dev/27stations`, including all Calculation Trace and
Demand Check changes, is one release-candidate candidate. Historical workbooks and audit outputs are
evidence only and cannot override source-controlled requirements or machine-readable fixtures.

Output contract:

- `Section Results` and `Demand Check` ownership is consistent across engineering, development, and
  control-map documents;
- obsolete workbook-derived audit claims and numeric anchors are removed; the useful complex
  section input remains only as a neutral software-regression fixture with no external-oracle claim;
- Node.js `24.20.0` LTS/npm `11.19.0` is identified consistently by `.nvmrc`, package metadata, and
  CI;
- pull-request CI runs the full test/build/security/bundle gates plus capacity fingerprint,
  stress-strain sampling, equivalent-block, and cross-model pipeline verification;
- current-demand matching is checked before a Demand Check table row may display utilization;
- the final index contains the complete verified release-candidate diff, with no commit or merge.

Blocking failure cases:
Unresolved owner-document contradiction, distributed personal/machine-local metadata, broken public
workbook links, runtime metadata/CI disagreement, numerical fingerprint drift, benchmark failure,
stale demand evidence displayed as current, test/build/security/bundle failure, or an incomplete
staged release candidate.

Acceptance tests/oracles:

- repository text/path/secret scans and Markdown-link verification;
- byte-stable neutral fixture generation and bit-identical capacity fingerprint;
- `npm test`, all three numerical verification matrices, production build, bundle budget, and
  production-dependency audit;
- focused stale-evidence unit tests and browser smoke checks for Demand Check switching/editing;
- repository-wide scans proving the obsolete workbook/audit identity is absent while the neutral
  machine-readable fixture remains reproducible and parseable.

Schema/provenance/report impact:
No project schema, formula, design coefficient, station, resistance surface, utilization, or
rounding rule changes. The unused surface-level workbook-comparison field and its obsolete claims are
removed instead of pointing at an absent artifact. Accepted-result and released-report eligibility
remain unimplemented and blocked.

Out of scope:
Creating an accepted-result contract, verifying a design-code profile, changing mechanics or
resistance rules, promoting Preview output, committing, merging, tagging, deploying, or recording a
named independent approval that has not occurred.

Verification record (2026-09-03):

- owner-document terminology and workflow scans report no stale `Results sidebar` ownership;
- the obsolete root audit, workbook-derived station self-test, public audit metadata, and named
  workbook fixture are removed; a repository-wide scan finds no remaining legacy identity;
- the neutral complex-section project regenerates without content drift and the capacity
  fingerprint is bit-identical for 8 sections x 24 quantities;
- `npm test`, `npm run build`, `npm run check:web-bundle`, `npm run bench:verify`,
  `npm run bench:strain-sampling`, `npm run bench:equivalent-block`, and
  `npm run bench:pipelines` pass on the available local Node.js 22.22.2 runtime;
- the production dependency audit reports zero high/critical vulnerabilities and the two existing
  moderate `exceljs -> uuid` findings remain within the documented exception boundary;
- a production browser smoke test confirms immediate pending state after a loadcase edit, current
  utilization after worker completion, correct modal loadcase switching, and a clean console;
- exact Node.js 24.20.0/npm 11.19.0 execution remains a pull-request CI gate because this task does
  not authorize a commit, push, or pull request.

Release and rollback ownership is recorded in
[`../releases/2026-09-03-public-preview-rc.md`](../releases/2026-09-03-public-preview-rc.md).
