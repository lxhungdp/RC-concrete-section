# Production dependency security patches

Objective: restore the GitHub production dependency audit with the unchanged
high/critical threshold, using patched compatible packages and a reproducible
npm lockfile. Baseline: clean dev/newUI at 516216d, Node 24 / npm 11.

Authorities: docs/00, development/01 dependency governance, development/04 report
presentation boundary, development/05 security exception, docs/08 dependency
governance and docs/09 change impact. Non-numerical application/tooling security
update; no geometry, material, solver, engineering result, schema or workbook
contract changes. No numerical or geometry dependency is upgraded.

Owners: root and web package manifests, package-lock.json, the existing
TechnicalEquation presentation adapter and its regression tests. Exact Next.js
16.3.8 and KaTeX 0.18.2 pins; resolve patched brace-expansion, sharp and
source-map-js within the existing upstream semver ranges. No force audit fix,
security threshold change, numerical baseline rewrite or dependency override.

Dependencies retain their bounded roles: Next.js (MIT), application/build;
KaTeX (MIT), authored formula rendering behind TechnicalEquation; brace-expansion
(MIT), archive path matching; sharp (Apache-2.0), Next.js image support;
source-map-js (BSD-3-Clause), PostCSS source maps. None owns structural mechanics.
Lockfile integrity records identify exact transitive packages. Node 24 remains
compatible with the patched packages' declared engines.

Official advisory sources, accessed 2026-10-08:

- Next.js: [ImageResponse](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j),
  [image optimization](https://github.com/advisories/GHSA-cjq9-62q9-8jv4), and
  the remaining Next.js entries captured in the baseline npm audit. The latter
  require 16.3.8; upgrading only to 16.3.6 does not close the whole audit.
- KaTeX: [inherited trust settings](https://github.com/advisories/GHSA-238p-pmpm-9mq7),
  patched in 0.18.2. Preserve trust=false and strict error handling in the adapter.
- brace-expansion: [quadratic rewrite](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
  patched in 1.1.21 / 2.1.7, plus the nested/parse recursion entries in the audit.
- sharp: [librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), patched 0.35.5.
- source-map-js: [indexed offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q),
  patched 1.2.2.

The previously documented moderate uuid/ExcelJS exception remains in force:
ExcelJS 4.4.0 uses UUID v4; the affected buffer-based v3/v5/v6 APIs are not used.
Do not apply npm's proposed ExcelJS downgrade or an unreviewed major UUID override.

Acceptance: npm ci, unchanged check:security exits zero (no high/critical),
structure and typecheck, focused authored-equation/security regression,
npm test, workbook/PDF integration gates, production build and web bundle
budgets. Record any unrelated pre-existing failure separately. No push or commit
is requested in this task.

Evidence, 2026-10-08, Node 24.20.0 / npm 11.19.0:

- npm ci completed from the updated lockfile. The running project dev server
  held the old native SWC file on Windows; it was temporarily stopped to permit
  installation. No unrelated process was stopped. The project dev server was
  restored on port 3001 after the production checks and reported Ready.
- The patched Next.js dev server enables agent instruction generation by default.
  Set the documented agentRules=false in next.config.mjs so the repository's
  existing AGENTS.md and canonical skills remain the sole owned instruction
  contract. Removed only the two new generated web-level files from this run.
  Configuration source: installed Next.js 16.3.8 schema and
  [agentRules documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/agentRules).
- check:security exited 0 using the unchanged omit=dev / audit-level=high
  policy. Before: 1 low, 2 moderate, 3 high, 1 critical. After: 2 moderate,
  zero low/high/critical. Remaining entries are the documented uuid/ExcelJS
  exception. The workflow and audit threshold are unchanged.
- Installed dependency tree is valid: Next.js 16.3.8, KaTeX 0.18.2,
  brace-expansion 1.1.21 / 2.1.7, sharp 0.35.5, source-map-js 1.2.2.
  ExcelJS remains 4.4.0. The lockfile changes only those packages and their
  platform companions (SWC, sharp/libvips); numerical dependencies are unchanged.
- Three focused KaTeX contract tests passed: authored calculation-trace HTML
  and MathML; untrusted link/image rejection and invalid TeX errors; inherited
  trust regression without global prototype mutation. The JSX adapter is
  unchanged; these tests exercise its underlying renderer policy.
- Structure, TypeScript and all 363 unit tests passed. npm test then stopped at
  the same four pre-existing ADSEC source/manifest hash failures. No report source,
  oracle, manifest or tolerance was rewritten to pass that gate.
- The remaining npm test scripts were run separately: 11 CAD tests, project
  round trip, stress-strain Excel, equivalent-block Excel, demand-check workbook
  agreement and preview PDF verification all passed. Existing output artifacts
  required an unsandboxed local rerun of the writing selftests; no test was skipped.
- Production build passed. All gzip budgets passed: initial JavaScript
  374.8/375.0 KiB, Plotly 1325.7/1400.0 KiB, analysis worker 116.9/120.0 KiB,
  Excel chunk 248.1/300.0 KiB. No budget was increased.
- Audit JSON before/after and test logs are retained under workspace-style-qa
  in the current local visualization workspace. git diff --check passed.

Security regression is verified locally. GitHub has not been rerun and this
patch is uncommitted. Full repository verification remains incomplete because
of the independent ADSEC fixture/hash failure. These security patches do not
promote draft engineering outputs or change any calculation/reporting contract.
