---
name: pm-code-profile
description: Add, change, or audit an edition-specific structural design-code, material, or resistance profile. Use when code coefficients, domains, caps, factors, applicability, resistance format, jurisdiction, National Annex, edition, amendment, or clause provenance changes.
---

# P-M Design-Code Profile

Create an edition-specific, auditable profile whose applicability and resistance route fail closed.
Do not reconstruct normative values from memory, another code, a secondary summary, or a passing
regression fixture.

## Qualify the source before implementation

1. Read [`AGENTS.md`](../../../AGENTS.md),
   [`engineering/04`](../../../docs/engineering/04-materials-and-design-standards.md),
   [`docs/10`](../../../docs/10-normative-references-and-change-control.md),
   [`docs/11`](../../../docs/11-design-standards-and-resistance-formats.md), and
   [`docs/12`](../../../docs/12-calculation-models-defaults-and-workflows.md) completely. Then read the
   relevant adapter README, source, tests, and mapped owners.
2. Identify publisher or issuing body, document number and title, exact edition and amendment,
   adoption or jurisdiction, National Annex where applicable, calculation method, units, clause or
   table, access date, and lawful source location. Record project interpretations separately from
   normative facts.
3. Build a trace table from each requirement and applicability condition to the project symbol,
   owner, implementation site, and verification evidence. Do not implement a missing, ambiguous,
   inaccessible, superseded, or conflicting value; record a typed blocking gap.
4. Create a distinct profile identity when edition, annex, jurisdiction, resistance format, or
   method changes engineering meaning. Never silently select "latest," alias an unsupported edition,
   or fall back to another profile.

## Preserve the engineering boundaries

1. Keep code-specific applicability, materials, strain limits, factors, caps, and resistance-format
   policy inside the adapter or owning contract. Do not embed them in the standard-neutral kernel,
   UI, report, example, or conversion layer.
2. Preserve nominal/reference evaluation followed by exactly one declared resistance route. Add
   explicit guards against double reduction and nominal/design demand-capacity mismatches.
3. Represent excluded domains, unsupported combinations, unresolved interpretations, and provenance
   deficiencies as typed failures with evidence. A plausible numeric result is not a fallback.
4. Update normative references, parameter provenance, contracts/schema, adapter documentation,
   reports, and capability wording in the same controlled slice when they are affected.

## Verify the profile

1. Test every table node, branch, transition, cap, boundary, excluded range, and applicability guard,
   including unit and serialization round trips where relevant.
2. Use independent authority-derived hand calculations, analytical cases, approved examples, or
   reviewed differential evidence. Existing baselines and commercial software are corroborating
   evidence only; do not overwrite or loosen them to pass.
3. Run the change-class and numerical gates required by
   [`engineering/06`](../../../docs/engineering/06-verification-acceptance-and-change-control.md) and
   [`docs/09`](../../../docs/09-verification-validation-and-release.md).
4. Keep a new or changed profile at draft/preview status until the documented independent review,
   provenance, acceptance, and release gates are actually complete.
