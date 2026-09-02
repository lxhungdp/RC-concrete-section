---
name: pm-engineering-change
description: Implement a P-M change that can alter engineering meaning or numerical results, including geometry, materials, standards, mechanics, solvers, sampling, utilization, or reports. Use for result-affecting code or contract work, not presentation-only edits.
---

# P-M Engineering Change

Produce the smallest complete, traceable change without inventing engineering inputs or overstating
its verification status.

## Establish the controlled basis

1. Read [`AGENTS.md`](../../../AGENTS.md), [`docs/00-README.md`](../../../docs/00-README.md), and
   [`docs/01-control-map.md`](../../../docs/01-control-map.md) completely.
2. Follow the control map and read every owning engineering, development, numerical, and package
   document for the affected symbols and contracts. Inspect current APIs, callers, tests, status,
   and uncommitted work.
3. Write the task packet required by
   [`development/05`](../../../docs/development/05-coding-quality-and-ai-workflow.md), including
   objective, requirement IDs, owners, contracts, blocking failures, independent oracles, impact,
   and exclusions. Assign the change class using
   [`engineering/06`](../../../docs/engineering/06-verification-acceptance-and-change-control.md).
4. If the change introduces or interprets normative data, establish the exact official source,
   edition, amendment, jurisdiction or National Annex, clause or table, units, and applicability
   before editing. If these are missing or conflict, leave a typed blocking gap and stop that path.
5. For design-code profile work, also read and follow
   [`pm-code-profile`](../pm-code-profile/SKILL.md).

## Implement through the owning pipeline

1. Change the owner named by the control map first. Propagate the same requirement through runtime
   validation, normalized and compiled models, scenarios, results, view/report models, provenance,
   documentation, and tests as applicable.
2. Preserve package direction and a standard-neutral numerical kernel. Keep exact geometry distinct
   from integration discretization, and keep stress-strain and equivalent-block routes independent.
3. Keep units, axes, signs, resistance state, applicability, uncertainty, and provenance explicit at
   boundaries. Reject unsupported, ambiguous, non-finite, non-converged, or exhausted cases with
   discriminated typed evidence; do not add hidden defaults, fallbacks, or numeric sentinels.
4. Add success, transition, boundary, invalid-input, and fail-closed tests in the owning package.
   Compare against an authority-derived or analytically independent oracle where engineering meaning
   changes. Never tune the implementation, tolerance, fixture, or baseline merely to obtain a pass.

## Verify and hand off

1. Run the gates required by `AGENTS.md`, the assigned change class, and every changed pipeline.
   Treat an unavailable or skipped independent oracle as an incomplete verification gate.
2. Review the final diff for duplicated formulas, double resistance reduction, unit/sign drift,
   accidental scope expansion, stale reports, and unsupported capability claims.
3. Report authorities and requirements used, changed owners/contracts, numeric/schema/report impact,
   tests and independent oracles run, verification state, blockers, and remaining limitations.
