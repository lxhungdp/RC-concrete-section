# Engineering Instructions — Structural Control Baseline

This group defines what the P-M application is allowed to mean. It is written for structural
engineers, engineering reviewers, and release approvers. It intentionally avoids prescribing UI
frameworks, file layout, or coding style.

## Read order

1. [`01-product-scope-and-workflow.md`](01-product-scope-and-workflow.md)
2. [`02-data-conventions-and-terminology.md`](02-data-conventions-and-terminology.md)
3. [`03-geometry-and-reinforcement.md`](03-geometry-and-reinforcement.md)
4. [`04-materials-and-design-standards.md`](04-materials-and-design-standards.md)
5. [`05-loadings-analysis-results-and-reports.md`](05-loadings-analysis-results-and-reports.md)
6. [`06-verification-acceptance-and-change-control.md`](06-verification-acceptance-and-change-control.md)

The numbered technical files in the parent directory contain supporting mathematics and numerical
detail. This group controls their intended use and resolves product-level ambiguity.

## Engineering control points

Before approving a supported analysis scope, the structural engineer shall control all of the
following:

- section/member boundary and exclusions;
- axes, origin, signs, units, and action basis;
- geometry topology and reinforcement interpretation;
- material law, property source, strain limits, and applicability range;
- exact standard, edition, amendment, jurisdiction/annex, and resistance method;
- nominal/reference versus design-resistance sequencing;
- load case/combination meaning;
- demand adequacy and utilization definition;
- numerical convergence and uncertainty acceptance;
- result wording, plot meaning, report content, and known limitations;
- independent review, validation evidence, and change classification.

No software default may substitute for a missing engineering decision that changes resistance.

## Non-negotiable engineering rules

| ID | Rule |
|---|---|
| `CORE-001` | One declared coordinate/reference frame and one declared unit/sign convention govern an analysis and its report. |
| `CORE-002` | ULS resistance, physical/service response, and verification/reference analysis are separate modes. |
| `CORE-003` | Geometry used for extreme-fiber decisions is the normalized exact boundary, never the integration fiber cloud. |
| `CORE-004` | Material definitions and design-code resistance rules are separate engineering concepts. |
| `CORE-005` | Every ULS state retains a nominal/reference evaluation before exactly one declared design-resistance method is applied. |
| `CORE-006` | Demand adequacy comes from a verified design resistance domain, not from inverse-solver convergence. |
| `CORE-007` | Numerical non-convergence, invalid topology, unknown standards, and unresolved boundary ambiguity fail closed. |
| `CORE-008` | Preview data cannot be promoted to an accepted result or released report. |
| `CORE-009` | A cross-section resistance result is never presented as a complete member stability/design check. |
| `CORE-010` | Every accepted result is reproducible from an immutable input snapshot, method/profile identity, options, software version, and evidence record. |

## Approval checklist

An engineering baseline is ready for implementation only when:

- all required decisions above are explicit;
- no contradictory instruction remains;
- every enabled design-code profile has an owner and verification state;
- equations and examples use the authoritative convention;
- acceptance criteria and uncertainty policy are approved;
- unsupported behavior is visible and blocked in the product.
