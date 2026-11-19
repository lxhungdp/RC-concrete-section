# @pm/code-custom

User-owned equivalent rectangular stress-block adapter.

`@pm/code-kds142020` and `@pm/code-aci318` derive their block parameters from a published table.
This adapter derives nothing: every value — block stress factor, `β1`, `εcu`, `φ` factors, the
tension-controlled transition rule, and the axial cap — is supplied by the project's own materials
and DesignBasis. That keeps the "no normative values invented in code" rule intact: a Custom profile
carries no clause traceability, so it is reported as user-defined rather than as a code check.

The adapter exposes the same surface as the standard adapters (`blockLaw`, `steelLaws`,
`bindNominalEvaluator`, `bindDesignEvaluator`, `nominalEndpoints`, `designEndpoints`, `axialCap`,
`buildNominalSurface`, `buildDesignSurface`), so `@pm/analysis-equivalent-block` routes it without a
second code path.

## Differences from the standard adapters

| Item | KDS / ACI | Custom |
|---|---|---|
| `β1`, block stress, `εcu` | code table for `fck` | user input, validated for range only |
| Concentric reference stress | `0.85 fck` (KDS) / `0.85 f'c` (ACI) | `compressionReferenceStressFactor · fck`, defaults to the block stress factor |
| Transition rule | fixed per code | either rule shape, user-selected |
| Steel law | elastic-perfectly-plastic only | elastic-perfectly-plastic, bilinear, or a user table |
| Verification status | `draft`, clause-tested | `user-defined`; never promoted by this package |
