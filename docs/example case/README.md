# Example and Regression Cases

Files in this directory are evidence fixtures, not declarations of current defaults.

- `PM-advanced (7) 2D.xlsx` preserves the historical P0-P18/24-direction workbook schedule. The
  matching schema-v1 project JSON carries the same geometry, materials, and loads but uses the
  current 25-station/36-seed production default. The station self-test selects the historical
  schedule explicitly when comparing against the source workbook, so the oracle is not confused
  with the application default.
- `P16_Column_ULS.pm-project.json` is an archived pre-profile EC2/UMD comparison snapshot. EC2 is
  not a complete current calculation profile, so this file is evidence data and is not expected to
  pass the strict current schema-v1 profile-consistency parser. It is not an import template.
- UMD comparison JSON/XLSX files record external comparison data and the assumptions of that run.
- Generated Excel workbooks are audit artifacts and may be overwritten only by the explicit fixture
  update workflow after test review. Their main sheets reproduce the historical oracle; a separate
  assertion verifies export of the current 25-station schedule and all nine transition nodes.

New stress-strain projects use 25 stations, nine code-aware transition nodes, 36 seed directions,
and adaptive angular refinement. Equivalent-block projects use their independent 37-state,
24-seed-direction adaptive default. See `../12-calculation-models-defaults-and-workflows.md`.
