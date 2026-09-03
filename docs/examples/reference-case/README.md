# Example and Regression Cases

Files in this directory are evidence fixtures, not declarations of current defaults:

- `source/` contains distributable provenance notes from external/reference material;
- `projects/` contains project snapshots derived from those sources;
- `expected/` contains machine-readable comparison oracles;
- report self-tests write reproducible Excel/PDF artifacts under ignored `outputs/report-selftest/`
  so generated binaries do not pollute the public source tree.

- `projects/P16_Column_ULS.pm-project.json` is the importable schema-v1 input for the UMD comparison.
  It selects the EN 1992 stress-strain preview profile, records the UMD explicit design-level concrete
  curve as a documented model modification, and uses the report factors `gammaC,ULS = 1.000` and
  `gammaS,ULS = 1.111`. Regenerate and validate it together with the comparison oracle by running
  `node --import tsx tools/verification/p16/verify.ts`.
- The machine-readable UMD comparison JSON records external comparison data and the assumptions of
  that run; ad hoc spreadsheet renderings are disposable outputs and are not tracked.
- Generated Excel workbooks are disposable audit artifacts and are not source or regression oracles.

Both mechanics share the `unified-27-v2` criteria and the same 36-direction fixed default. Projects
may instead select the independent Adaptive mode, whose refined meridians and directions are stored
as their own authoritative surface rather than overlaid on a hidden fixed calculation. See
[`../../12-calculation-models-defaults-and-workflows.md`](../../12-calculation-models-defaults-and-workflows.md).
