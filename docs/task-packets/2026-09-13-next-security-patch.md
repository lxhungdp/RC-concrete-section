# Next.js Security Patch

Date: 2026-09-13  
Change class: **Class 3 — production web dependency; engineering-result-identical**  
Status: local security, build, bundle, unit, report, and numerical gates pass; the full aggregate
test command remains blocked by pre-existing AdSec source/manifest hash mismatches; independent
review and green CI remain required

Objective:
Remove the high/critical production advisories that make the main-branch security gate fail by
updating the existing pinned Next.js dependency to a patched release.

Engineering requirement IDs:
`DEV-ARCH-007` and release Gate F from
`engineering/06-verification-acceptance-and-change-control.md`.

Allowed packages/files:
Root and web package manifests, `package-lock.json`, installed dependency tree, and this task packet.

Input contract:
Both manifests pin the same exact Next.js version. The production audit rejects high and critical
advisories. The documented ExcelJS 4.4 `uuid` moderate advisory remains a reviewed exception until
ExcelJS provides a compatible upgrade; npm's proposed forced downgrade is not allowed.

Output contract:
Both manifests and the lockfile select Next.js 16.3.5. The resolved production tree contains patched
Next.js and Sharp releases, and `npm run check:security` exits successfully without lowering the
audit threshold or suppressing findings.

Blocking failure cases:
Manifest/lockfile version drift, any remaining high or critical production advisory, an unsafe
ExcelJS downgrade, application build failure, bundle-budget failure, or unexplained engineering
regression.

Acceptance tests/oracles:
`npm ls`, `npm run check:security`, `npm run check:structure`, `npm run typecheck`, `npm test`,
`npm run build`, `npm run check:web-bundle`, and the result-identical numerical benchmark gates
required for a Class 3 dependency change.

Schema/provenance/report impact:
None. No project schema, formula, coefficient, resistance option, numerical kernel, report contract,
or verification status changes.

Out of scope:
Changing audit policy, forcing incompatible transitive versions, downgrading ExcelJS, changing UI
behavior, committing, pushing, merging, deploying, or promoting preview engineering output.

Verification record (2026-09-13):

- both manifests and the lockfile resolve Next.js 16.3.5, Sharp 0.35.4, and
  `baseline-browser-mapping` 2.11.23;
- `npm run check:security` passes with zero high/critical production advisories; the two reported
  moderate findings are the documented ExcelJS 4.4 `uuid` exception;
- the compatible transitive patch from `js-yaml` 3.15.1 to 3.15.2 removes the remaining dev-only
  high advisory; the complete dependency audit now contains seven moderate findings and zero
  high/critical findings, without a major AVA change;
- repository structure, typecheck, the 326-test unit suite, production build, and web bundle budget
  pass on Node.js 24.20.0/npm 11.19.0;
- CAD, project round-trip, both Excel paths, Demand Check, and PDF report integration gates pass;
- capacity fingerprints are bit-identical for 8 sections x 24 quantities, and strain-sampling,
  equivalent-block, and cross-model pipeline matrices pass;
- the portable capacity fingerprint is also bit-identical, the P16 external comparison passes, and
  regenerating the complex-section fixture produces no tracked diff;
- the aggregate `npm test` reaches `test:adsec` and then fails closed because the checked-in source
  hashes for `p16-ec2-kds-approximation` and `p16-aci` do not match their manifests. This dependency
  patch does not alter those source files or hashes, and no oracle was rewritten.
