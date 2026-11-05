# Capacity fingerprint references

These are software regression references, not independent capacity or design-code certificates.
The `capacity-fingerprint-v2` exact/portable comparison policy and its tolerances are unchanged.

- `capacity-unified-28-baseline.json` is the active reference for the current default fibre schedule:
  `unified-27-v2` plus the explicit `Pure tens 50%` station. It contains 36 directions × 28 states
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
