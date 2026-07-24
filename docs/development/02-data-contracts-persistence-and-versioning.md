# Data Contracts, Persistence, and Versioning

## 1. Contract layers

Keep these types separate even when their fields initially look similar:

| Layer | Example | Mutability/persistence |
|---|---|---|
| editor draft | boundaries, selection, material form text | mutable, not canonical, not analyzed |
| persisted definition | `GeometryInput`, `MaterialStore`, `LoadingsInput` | serializable project truth |
| normalized definition | oriented geometry, resolved material IDs, declared frame | immutable transient/cacheable |
| compiled runtime | stress/tangent evaluators, quadrature, acceleration structures | immutable, never serialized |
| result artifact | surfaces, checks, evidence, provenance | immutable and separately versioned |
| report artifact | report model and rendered file | derived from accepted result only |

Do not cast between layers. Use named adapters that can return typed issues.

## 2. Current project schema v2

The implemented project contract is:

```ts
type PmProjectDocument = {
  schema: 'pm-column-project'
  version: 2
  meta: { id: number; name: string; createdAt: string; updatedAt: string }
  inputs: {
    geometry: GeometryInput
    materials: MaterialStore
    loadings: LoadingsInput
  }
}
```

Canonical units are fixed by this schema: mm, N, MPa, and N·mm. Editor-only draft boundaries,
camera, visibility, locks, selections, and compiled material functions are intentionally excluded.

Current `GeometryInput` stores multiple `outers`, holes, and outer-owned rebars. Current
`MaterialStore` stores one concrete definition and multiple steel definitions. Current
`LoadingsInput` stores combinations. These are facts about v2, not universal future engineering
limits.

## 3. Required project evolution

The next analysis-ready additive contract needs, at minimum:

- design basis/profile identity and method;
- analysis mode and expanded option profile reference;
- loading action basis and reference frame;
- optional project presentation preferences that do not affect results.

If these can be introduced as optional fields with deterministic defaults that preserve old
meaning, they may be an additive v2 extension. If units, material assignment, geometry meaning, or
existing field semantics change, bump the project version and supply an explicit migration.

Results are not inserted into `inputs`. Save them as versioned result artifacts referencing the
project input hash. The project may keep a list of result artifact references, but an old result
never becomes current merely because it is stored beside edited inputs.

## 4. Parsing and validation

Public JSON is untrusted. Parsing performs:

1. safe JSON and record/array checks;
2. schema/version dispatch;
3. migration from supported historical versions;
4. strict structural validation and resource limits;
5. semantic cross-reference validation;
6. engineering normalization in its owning package.

The parser does not convert invalid numbers to zero, silently select the first material, or mutate
the opened document to repair it. A repair workflow returns a proposed repaired document plus
issues; the user accepts it as a new snapshot.

Unexpected keys are rejected or preserved only under an explicit extension namespace. Timestamps
are validated ISO values, not arbitrary strings.

## 5. Typed issues and results

Use a shared structure such as:

```ts
type EngineeringIssue = {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  path?: string
  entity?: { kind: string; id: number }
  context?: Readonly<Record<string, string | number | boolean>>
}

type EngineeringResult<T> =
  | { ok: true; value: T; issues: readonly EngineeringIssue[]; provenance: Provenance }
  | { ok: false; errors: readonly EngineeringIssue[]; preview?: PreviewOnlyData; provenance: Provenance }
```

Errors are stable machine-readable codes; messages can be localized later. Exceptions are reserved
for programmer/invariant defects and are converted once at the application boundary.

Strings such as the current project warning list are migration-stage compatibility only.

## 6. Geometry adapter contract

`GeometryInput` is the applied editor/persistence shape. A named adapter produces an analysis input:

```text
GeometryInput
  -> validateGeometryDefinition
  -> normalizeSectionGeometry
  -> NormalizedSectionGeometry + ReferenceFrame
```

The adapter maps `outers[]` to concrete regions, resolves parent ownership, checks IDs and topology,
normalizes orientation/origin, and retains source IDs. `SectionGeometry` summaries are not proof that
this pipeline has passed.

## 7. Material adapter contract

`MaterialStore` is definition data. Compilation is:

```text
MaterialStore
  -> validateMaterialDefinitions(profile context)
  -> NormalizedMaterialSet
  -> compileMaterialRegistry
  -> immutable evaluators
```

No standard/model switch has a default fallback. An unknown discriminant is a typed error. Compiled
evaluators expose stress, tangent, breakpoints, admissibility, and contribution components required
by the selected analysis mode.

Current v2 project JSON must preserve the complete material store:

- `strainSign`, concrete definition, steel definitions, and `defaults.steelMaterialId`;
- concrete `standard`, `fck`, `mc`, optional `elasticModulus`, complete `stressStrain`, `limits`,
  and optional `factors.alpha` / `factors.gammaC`;
- steel `id`, `name`, `standard`, `fy`, `elasticModulus`, complete `stressStrain`, optional
  `limits`, and optional `factors.gammaS`;
- every user-curve point in order after validation, including interpolation mode and concrete
  `zeroTension` when present.

The parser must never preserve only `standard` and re-derive the rest on open. Re-derivation is a
user action in the material editor or a versioned migration with explicit warnings; otherwise import
and export must be a lossless engineering snapshot.

## 8. Identity and references

- IDs are positive integers and unique per declared namespace.
- ID allocation strategy is not engineering order.
- foreign keys are checked after all definitions parse.
- deleting a material referenced by a bar is blocked or handled by an explicit reassignment command;
  it never leaves a hidden fallback.
- import/migration preserves IDs where valid and returns a mapping when remapping is necessary.

The current UI can remove a steel definition while bars still reference it; this is a known gap that
must be closed before input validation can pass.

## 9. Version and hash rules

Maintain separate versions for:

- project schema and each migration;
- material model/compiler behavior;
- geometry normalization and numerical integration behavior;
- design-code profile/adapter;
- analysis/result schema;
- report schema/template.

Use canonical deterministic serialization for hashes. Include every result-affecting definition and
expanded option; exclude display theme, camera, selection, and report-only formatting. Store the hash
algorithm/version with the hash.

## 10. Round-trip requirements

For every supported project version:

- parse -> serialize -> parse preserves engineering meaning and stable identities;
- unknown/invalid versions fail with a clear migration message;
- canonical units and signs do not drift;
- imported definitions compile to tolerance-equivalent runtime behavior;
- material round trips cover KDS, ACI318, EC2 partial-factor fields, and Custom user curves;
- load ordering and entity ordering remain deterministic;
- fixtures cover empty, ordinary, complex, boundary-limit, and malicious/resource-exhaustion data.

One hand-written round-trip self-test is a starting fixture, not a sufficient schema test suite.
