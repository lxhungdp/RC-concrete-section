# Capacity fingerprint references

These are software regression references, not independent capacity or design-code certificates.
The `capacity-fingerprint-v2` exact/portable comparison policy and its tolerances are unchanged.

- `capacity-unified-30-baseline.json` is the active reference for the current default fibre schedule:
  `unified-27-v2` plus the three Fixed edge-strain transition states of root 05 §2.3. It contains
  30 states per direction for each of the eight benchmark geometries. It is recorded with the
  pinned CI runtime, Node 24.20.0/npm 11.19.0 (V8 13.6.233.17-node.53) on Windows x64: the first
  recording used Node 24.22.1/npm 11.19.1, which the provenance check rejects in CI, and the
  2026-11-19 re-recording under the pinned runtime is bit-identical in every fingerprint quantity.
  Before it was selected, a same-environment A/B against a
  fingerprint of the previous schedule showed the following, for all eight geometries:
  - every base-station resultant and strain state was bit-identical;
  - mesh hashes, warnings and every inverse state, utilization and flag were unchanged;
  - only the new transition rows and the queries crossing the tension band changed: the moment
    planes and the Fixed-P contours at reference level 3, thin-box levels 1–2 and l-shape level 2.

  The record is in
  [the Fixed transition-station task](../../../../docs/task-packets/2026-11-18-fixed-tension-transition-stations.md).
- `capacity-unified-28-baseline.json` is the historical reference for `unified-27-v2` plus the
  explicit `Pure tens 50%` station. It contains 36 directions × 28 states
  for each of the eight benchmark geometries. It was recorded with Node 24.20.0/npm 11.19.0 on
  Windows x64. CI uses the existing portable gate; exact replay requires the recorded environment.
- `capacity-baseline.json` is the unmodified historical 27-station reference recorded on macOS
  arm64. It remains evidence for that schedule and must not be compared directly with a different
  point-array shape or silently overwritten.

The current reference follows the user-selected sampling change documented in
[the pure-tension task](../../../../docs/task-packets/2026-11-05-pure-tension-midpoint.md).
Before selecting it, the CI synchronization review removed only `pure-tension-transition-50`
from each current surface and reran the original fixed-P and moment-plane queries. All eight
historical fingerprints were recovered under the existing policy, including all retained strain
states, mesh hashes, resultants, contour sample counts, inverse states, utilization and flags.
Seven geometries matched exactly; the dense rectangle retained the existing 17 allowed resultant
roundoffs, worst 4.95731e-17 of section scale. No unreviewed deviation was excluded.

The additional midpoint intentionally changes the final tension-band triangulation and its derived
queries. Independent state/domain tests and the documented analytical strip comparison retain
their original acceptance limits. This reference does not assert that the compact schedule improves
accuracy or qualify the unresolved Fixed hardening uncertainty.

The review and gate evidence is recorded in
[the fixture/CI task](../../../../docs/task-packets/2026-11-05-complex-fixture-ci.md).
`npm run bench:record` writes only the current reference and still requires review of a deliberate
result-affecting change. A passing regression gate confers no accepted-result or release status.
