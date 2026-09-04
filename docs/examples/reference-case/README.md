# Example and Regression Cases

Files in this directory are evidence fixtures, not declarations of current defaults:

- `source/` contains distributable provenance notes from external/reference material. The
  [`source/adsec/`](source/adsec/README.md) folder preserves the user-provided AdSec comparison
  reports; those raw reports are evidence, not machine-readable acceptance oracles;
- `projects/` contains project snapshots derived from those sources;
- `expected/` contains machine-readable comparison oracles;
- report self-tests write reproducible Excel/PDF artifacts under ignored `outputs/report-selftest/`
  so generated binaries do not pollute the public source tree.

- `projects/P16_Column_ULS.pm-project.json` is the importable schema-v1 input for the UMD comparison.
  It selects the EN 1992 stress-strain preview profile, records the UMD explicit design-level concrete
  curve as a documented model modification, and uses the report factors `gammaC,ULS = 1.000` and
  `gammaS,ULS = 1.111`. Regenerate and validate it together with the comparison oracle by running
  `npm run verify:p16`. The default command is read-only and fails on regression or external-
  comparison tolerance drift. Regenerating either committed fixture is an explicit reviewed action:
  `npm run verify:p16:update`.
- The machine-readable UMD comparison JSON records external comparison data and the assumptions of
  that run. Its pure-compression entry decomposes the compatible engine pole and the UMD
  saturated-steel endpoint separately; ad hoc spreadsheet renderings are disposable outputs and
  are not tracked.
- The twelve-report AdSec calculation-value audit is recorded in
  [`expected/adsec/calculation-value-audit.md`](expected/adsec/calculation-value-audit.md) with the
  full machine-readable evidence beside it. Run `npm run verify:adsec` to check the committed
  evidence or `npm run verify:adsec:update` for an explicit reviewed regeneration. It intentionally
  excludes UR and compares `P/Mnx/Mny` only when the printed deformation state is preserved.
- Generated Excel workbooks are disposable audit artifacts and are not source or regression oracles.

Both mechanics share the `unified-27-v2` criteria and the same 36-direction fixed default. Projects
may instead select the independent Adaptive mode, whose refined meridians and directions are stored
as their own authoritative surface rather than overlaid on a hidden fixed calculation. See
[`../../12-calculation-models-defaults-and-workflows.md`](../../12-calculation-models-defaults-and-workflows.md).
