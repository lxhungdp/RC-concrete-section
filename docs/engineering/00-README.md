# Engineering Instructions - Structural Control Baseline

This group is for structural engineers, engineering reviewers, and release approvers. It defines
what the P-M application is allowed to mean. It does not define React components, packages, or code
style.

Before changing any formula, design-code rule, mesh/convergence criterion, result meaning, or
acceptance gate, open [`../01-control-map.md`](../01-control-map.md) and use the mapped authority.

## 1. Read Order

| Step | Document | Use it for |
|---|---|---|
| 1 | [`01-product-scope-and-workflow.md`](01-product-scope-and-workflow.md) | Scope, exclusions, workflow, lifecycle, stale/accepted/released meaning. |
| 2 | [`02-data-conventions-and-terminology.md`](02-data-conventions-and-terminology.md) | Units, axes, signs, origin, action basis, naming. |
| 3 | [`03-geometry-and-reinforcement.md`](03-geometry-and-reinforcement.md) | Section topology, holes, exact boundary, cover, bars, unsupported geometry. |
| 4 | [`04-materials-and-design-standards.md`](04-materials-and-design-standards.md) | Material definitions, sources, admissibility, standard/profile separation. |
| 5 | [`05-loadings-analysis-results-and-reports.md`](05-loadings-analysis-results-and-reports.md) | Loadcase meaning, checks, plots, result states, report eligibility. |
| 6 | [`06-verification-acceptance-and-change-control.md`](06-verification-acceptance-and-change-control.md) | Verification gates, review evidence, change classification. |

The numbered files in the parent folder hold the detailed mathematics and numerical specifications.
This engineering group states how those details are used in the product.

## 2. Engineering Control Points

An engineering baseline is not ready until these decisions are explicit:

- section/member boundary and excluded checks;
- axes, origin, signs, units, and action basis;
- geometry topology and reinforcement interpretation;
- material law, source, strain limits, and applicability range;
- exact standard, edition, amendment, jurisdiction/annex, and resistance method;
- nominal/reference versus design-resistance sequencing;
- loadcase/combination meaning and demand adequacy definition;
- convergence, uncertainty, result wording, plot meaning, and report limits;
- independent review, validation evidence, and change classification.

No software default may substitute for a missing engineering decision that changes resistance.

## 3. Non-Negotiable Rules

| ID | Rule |
|---|---|
| `CORE-001` | One declared coordinate/reference frame and one declared unit/sign convention govern an analysis and its report. |
| `CORE-002` | ULS resistance, physical/service response, and verification/reference analysis are separate modes. |
| `CORE-003` | Geometry used for extreme-fiber decisions is the normalized exact boundary, never the integration fiber cloud. |
| `CORE-004` | Material definitions and design-code resistance rules are separate engineering concepts. |
| `CORE-005` | Every ULS state retains a nominal/reference evaluation before exactly one declared design-resistance method is applied. |
| `CORE-006` | Demand adequacy comes from a verified design resistance domain, not from inverse-solver convergence. |
| `CORE-007` | Non-convergence, invalid topology, unknown standards, and unresolved boundary ambiguity fail closed. |
| `CORE-008` | Preview data cannot be promoted to an accepted result or released report. |
| `CORE-009` | A cross-section resistance result is never presented as a complete member stability/design check. |
| `CORE-010` | Every accepted result is reproducible from an immutable input snapshot, method/profile identity, options, software version, and evidence record. |
