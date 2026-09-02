---
name: pm-verify
description: Verify or audit P-M engineering and numerical changes, regression drift, or release readiness using requirements, independent oracles, benchmarks, and fail-closed evidence. Use for V&V, engineering review, numerical audit, or test-gate requests, not ordinary feature implementation.
---

# P-M Verification and Audit

Determine what the available evidence proves, what it does not prove, and which release paths must
remain blocked. Verification is read-only unless the user explicitly requests corrective changes.

## Define the claims under review

1. Read [`AGENTS.md`](../../../AGENTS.md), [`docs/00-README.md`](../../../docs/00-README.md),
   [`engineering/06`](../../../docs/engineering/06-verification-acceptance-and-change-control.md),
   [`docs/09`](../../../docs/09-verification-validation-and-release.md), and
   [`development/05`](../../../docs/development/05-coding-quality-and-ai-workflow.md) completely.
   Follow the control map to every affected owner, implementation, test, benchmark, and report.
2. Fix the review scope to an explicit working tree, diff, commit, artifact, or release candidate.
   Record uncommitted changes and distinguish current evidence from historical audit material.
3. List each engineering or software claim, its requirement ID and authority, symbols and units,
   implementation owner, applicability domain, expected failure behavior, and required evidence.
   Assign the documented change class and review independence.

## Build independent evidence

1. Trace authority -> requirement -> symbol -> contract -> implementation -> test -> report. Mark
   every missing or contradictory link; do not infer coverage from a green aggregate command.
2. Separate software verification, numerical-method verification, solution verification, design-code
   verification, and validation against physical or experimental evidence. State which layers were
   and were not performed.
3. Use analytical solutions, authority-derived calculations, convergence studies, differential
   implementations, approved external data, and property or metamorphic checks as appropriate.
   Existing snapshots, workbooks, examples, and commercial results are not normative oracles.
4. Exercise success cases plus topology, units, signs, discontinuities, limits, non-finite input,
   non-convergence, exhaustion, unsupported scope, provenance, and state-transition failures.
5. Run the exact gates required by the affected pipeline and change class. Never regenerate a
   baseline, weaken a tolerance, suppress a failure, or change production code during a read-only
   audit merely to make a gate pass.

## Report conservatively

For each finding, provide a stable ID, claim and requirement, evidence and reproduction command,
expected versus observed result, engineering impact, affected release gate, severity, and required
disposition. Conclude with tests/oracles run, skipped or unavailable gates, verification status, and
remaining limitations. Solver convergence, visual plausibility, or a green test suite alone never
establishes code compliance, acceptance, or release readiness.
