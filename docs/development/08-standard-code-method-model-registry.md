# Standard Code, Method, and Concrete-Model Registry

Status: implemented UI/domain architecture; engineering profiles remain subject to the verification
status recorded by their `DesignBasis`.

## 1. Decision

The user workflow separates three decisions that were previously presented as one flat calculation
profile:

```text
Design Code -> calculation method permitted by that Code -> concrete model permitted by that method
```

The persisted `calculationProfileId` remains the atomic, version-1 compatibility key. The registry
in `packages/pm-project/src/calculation-profiles.ts` is the single source that resolves that key to
Code family, exact standard identity, mechanics, concrete-model capabilities, material family,
resistance format, and DesignBasis profile. UI labels never determine engineering behavior.

The public Code list is `KDS`, `ACI`, `EN`, and `AS`. Legacy `custom-*` profile IDs remain readable,
but `Custom` is not presented as a design standard. User input belongs to a concrete-model option
and is recorded as a modified Code profile.

## 2. Capability and release rules

| Code | Available methods | Current state |
|---|---|---|
| KDS | stress-strain integration; equivalent rectangular block | available calculation routes; KDS remains the default and highest regression priority |
| ACI | equivalent rectangular block | available calculation route |
| EN | EN 1992-1-1:2004 stress-strain preview | design-material reevaluation is implemented; no National Annex is selected and the full EC2 strain-domain boundary is not verified |
| AS | AS 3600:2018 Amendments 1 and 2 equivalent-block preview | executable and reportable; independent clause verification, shape classification and member-level checks remain open |

`implementationStatus` describes route availability only. `DesignBasis.verificationStatus` remains
the engineering review/release state. The two must never be collapsed.

AS remains fail-closed for certification but is executable as a watermarked preview. The adapter is
explicitly named for AS 3600:2018 incorporating Amendments 1 and 2. A draft AS 3600:2026 also exists
as of August 2026 and is not used or described as the governing edition.

## 3. Concrete-model customization

A Code profile exposes only models in its `concreteModels` capability list. KDS stress-strain
currently permits its code-default parabolic law and a user-defined stress-strain curve. Selecting
the latter:

- keeps `KDS` as the standard context;
- sets `DesignBasis.materialModelModified` and `modified`;
- demotes the basis to `draft`;
- requires and reports an override reason;
- never promotes the curve to a verified code-default model.

EN does not yet expose a user curve. Its resistance format reevaluates characteristic material laws
with design strengths; a generic tabulated curve needs an explicit characteristic-to-design
transformation contract before it can be offered safely. A naive scalar reduction would also reduce
the elastic modulus and is prohibited.

Equivalent blocks are resistance models, not material stress-strain curves. Schema v1 still carries
legacy material discriminants for compatibility, while the registry model ID states the actual
method. A future schema version may move block definitions out of `ConcreteMaterial.stressStrain`;
that migration must preserve KDS/ACI result fingerprints.

## 4. EN partial-factor ownership

`DesignBasis.factors` is the canonical source for `alphaCc`, `gammaC`, and `gammaS`. The no-National-
Annex preview starts from the EN 1992-1-1:2004 recommended values `1.0`, `1.5`, and `1.15`;
`alphaCc` is an NDP and must change only through an explicitly selected National Annex or a recorded
project override. Materials shows
and edits those fields next to `fck/fcd` and `fyk/fyd`. Material factor fields are a derived runtime
snapshot used by compilers and exports, not an independent user-owned source.

The Design Resistance tab shows EN factors read-only. This prevents two editors from drifting. The
runtime sequence is:

```text
characteristic MaterialStore
  -> buildResistanceMaterialSets(DesignBasis)
  -> reference material laws + design material laws
  -> evaluate the same stored strain state twice
```

No global ACI/KDS-style factor is applied to the EN resultant.

## 5. Code-neutral pipeline

The numerical kernels remain independent of standard names:

```text
project definitions
  -> profile/capability registry
  -> code adapter resolves laws, limits, state events and resistance policy
  -> stress-strain or equivalent-block mechanics kernel
  -> nominal/reference ledger
  -> resistance pipeline
  -> caps, demand check and reports
```

`@pm/equivalent-block` contains no Code imports. The project bridge uses an exhaustive
`BLOCK_MODEL_RESOLVERS` registry to obtain a resolved KDS, ACI, or legacy user model; there is no
default branch that substitutes KDS. The stress-strain route similarly consumes compiled material
laws and a serialized DesignBasis, while its remaining EC2 strain-domain mismatch is explicit.

## 6. Compatibility and verification

Project schema version remains 1. Existing calculation profile IDs and custom projects remain
readable. The added EN profile is a new explicit ID and uses the existing design-basis version.
`materialModelModified` is optional and omitted when false so historical canonical JSON and
fingerprints remain byte/structure compatible after parsing.

Required regression evidence:

- shared 27-station schedule and workbook oracle;
- KDS and ACI equivalent-block surface/inverse/field integration tests;
- project round trip for old profiles and EN design-material profile;
- registry capability/fail-closed tests;
- EN canonical-factor ownership test;
- typecheck, workbook formula reconciliation, PDF checks, and production build.
