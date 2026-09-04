# AdSec Comparison Reports

Status: **raw external comparison evidence; not a normative or accepted oracle**.

This directory preserves twelve user-provided AdSec text reports without editing their report
content. They cover three section geometries and four reported route variants. Machine-readable
fixtures and comparison outputs belong in `../../projects/` and `../../expected/`; verification code
belongs under `tools/verification/`.

| Section family | Reported geometry | Reinforcement | Report groups |
|---|---:|---:|---|
| `P16` | 8 nodes: one exterior and one void | 408 bars | EC2-based KDS approximation, EC2, ACI, ACI adjusted-load variant |
| `P16-Asym-H2` | 12 nodes: one exterior and two voids | 408 bars | EC2-based KDS approximation, EC2, ACI, ACI adjusted-load variant |
| `Pylon1` / report section `CJ16` | 33 node records: 17 exterior nodes, one separator record, and 15 void nodes | 232 bars | EC2-based KDS approximation, EC2, ACI, ACI adjusted-load variant |

## Interpretation controls

- The report frame is `(y,z)` with `N`, `Myy`, and `Mzz`. The existing P16 verifier establishes the
  candidate relabelling `y -> x`, `z -> y`, `Myy -> Mx`, and `Mzz -> My`; every new parser and
  fixture must verify that mapping rather than infer it from symmetric results.
- P16-family moments are reported in `kNm`; Pylon1 moments are reported in `kNmm`. Importers must
  read the declared unit row and convert once at the boundary.
- The files named `KDS근사byEC2` are not results from the repository's verified KDS profile. The
  reports themselves select EN 1992-1-1:2004 and use modified material parameters. They must remain
  labelled as an external EC2-based approximation.
- The ACI reports select ACI 318M-08. The repository implements a draft ACI 318-19(22) profile; the
  two editions must not be compared as if they were one design-code oracle.
- The `ACI-2` reports are not duplicates. Some loads were rotated or added, while the corresponding
  `ACI` reports retain `No Solution` rows. A parser must preserve those distinct load identities and
  represent `No Solution` as typed external evidence, never as zero capacity.
- The reports do not embed a detectable AdSec software version. Exact program version, source-file
  identity, export procedure, ownership, and redistribution approval remain provenance gaps.
- The calculation-value audit intentionally ignores every utilization/ratio column. It compares
  `P/Mnx/Mny` only when the printed strain plane, local stress/strain rows, axes, resistance level,
  geometry, and replay state are mutually consistent.

The implementation plan and acceptance boundaries are recorded in
[`../../../../task-packets/2026-09-04-adsec-comparison-benchmark-plan.md`](../../../../task-packets/2026-09-04-adsec-comparison-benchmark-plan.md).
