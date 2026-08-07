# Example and Regression Cases

Files in this directory are evidence fixtures, not declarations of current defaults:

- `source/` contains external/reference workbooks and source reports;
- `projects/` contains project snapshots derived from those sources;
- `expected/` contains machine-readable comparison oracles;
- `generated/` contains reproducible Excel/PDF outputs owned by report self-tests.

- `source/PM-advanced (7) 2D.xlsx` is retained only as an external geometry/material/result oracle.
  The matching schema-v1 project migrates to and every repository-generated calculation uses `unified-27-v2`;
  regression checks compare only source-independent anchors when the external sheet's sampling does
  not match the canonical schedule.
- `projects/P16_Column_ULS.pm-project.json` is an archived pre-profile EC2/UMD comparison snapshot. EC2 is
  not a complete current calculation profile, so this file is evidence data and is not expected to
  pass the current schema-v1 profile-consistency checks. It is not an import template. The current
  parser is version-locked to v1 but still performs the limited defaults/repairs listed in
  [`../../development/02-data-contracts-persistence-and-versioning.md`](../../development/02-data-contracts-persistence-and-versioning.md).
- UMD comparison JSON/XLSX files record external comparison data and the assumptions of that run.
- Generated Excel workbooks are audit artifacts and may be overwritten only by the explicit fixture
  update workflow after test review. Their station sheets export and verify the canonical 27 points.

All new stress-strain and equivalent-block projects use the shared 27 fixed stations and 36 fixed
directions without production adaptive refinement. See
[`../../12-calculation-models-defaults-and-workflows.md`](../../12-calculation-models-defaults-and-workflows.md).
