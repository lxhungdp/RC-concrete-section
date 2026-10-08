# ZWCAD section DXF container repair

Objective: repair the editable section DXF writer after ZWCAD reports
`Invalid or incomplete DXF input -- drawing discarded`.

Class 2: container serialization repair with identical mm geometry, radii,
polyline closure, layer pm, importer policy, materials and project schema.
Requirements: DXF-001/002/004/006; ENG-GEO-001/002/005 remain unchanged.
Owner: development/03 exchange contract, then web geometry/section-dxf.ts
and apps/web/test/geometry/section-dxf.test.ts. Preserve all existing uncommitted
Rebar, design-skill, UI and DXF feature work on dev/newUI.

The old writer emitted TABLE handles before group-2 names, omitted CLASSES and
six system tables, lacked BYBLOCK/BYLAYER and standard styles/application entries,
and emitted an empty root dictionary without ACAD_GROUP. A forgiving ezdxf
read/audit passed previously, but that was not evidence of a complete raw
R2000 container or a successful ZWCAD application-open test.

Input/output: validated SectionDrawing -> complete R2000 ASCII DXF; exact
coordinates/diameters, closed LWPOLYLINE boundaries, CIRCLE bars on pm.
Blocking failures and existing input/resource validation remain unchanged.
No numerical, material, schema, resistance, report-status or dependency changes.

Oracles: Autodesk symbol-table ordering/common codes and published ezdxf minimum
R13-and-later container; independent raw-tag assertions for complete tables,
entries, unique handles/resolved references and dictionary ownership; analytical
and full-precision geometry round trips; independent ezdxf read/audit/rewrite.
Attempt the actual ZWCAD open if native Computer Use is available.

Out of scope: CAD palette/UI redesign, arbitrary curves/blocks, DWG support,
kernel/default/tolerance changes and changes to unrelated verification fixtures.

Verification, 2026-10-08:

- Passed all 13 focused DXF tests, including the new independent raw-tag
  container assertions; `check:structure`, `typecheck`, production `build`,
  `check:web-bundle` and `git diff --check` passed. Initial gzip JavaScript
  remains 373.5 KiB within the 375 KiB budget.
- Independent ezdxf 1.4.3 read/audit of the corrected populated sample reports
  AC1015, mm, three closed LWPOLYLINE boundaries, 18 CIRCLE bars, zero errors
  and zero repairs. Entity coordinates, radii, types and layers are identical
  to the prior browser-exported sample. Independent rewrite and application
  reimport preserve the exact coordinates and radii as well.
- `npm test` passed all 353 unit tests, then stopped at the same four ADSEC
  source-hash failures recorded in the original exchange packet. KDS/P16
  source `9c08ebf4...` differs from manifest `6d952aaf...`; ACI source
  `be988e18...` differs from manifest `922c722e...`. No fixture, manifest or
  tolerance was changed; the aggregate gate remains non-green.
- Ran remaining gates separately: `test:cad` (11 tests), `test:roundtrip`,
  `test:excel-export`, `test:excel-block`, `test:demand-check` and
  `test:pdf-report`; all passed. Existing local output permissions required
  sandbox escalation for production build and report-output checks.
- Direct ZWCAD application-open verification remains unexecuted. Installed
  ZWCAD 2025 was confirmed read-only, but the Computer Use runtime failed
  before executing its initialization with `failed to write kernel assets:
  The system cannot find the path specified. (os error 3)`. One documented
  kernel reset and initialization retry produced the same failure. No
  alternate UI automation, machine setting change or software installation
  was attempted. Library read/audit does not establish ZWCAD-open success.
- No numerical kernel, code-profile, material-default or schema change was
  made. This container-only repair uses exact geometry identity as its oracle;
  numerical benchmarks were not rerun. The original feature's benchmark
  evidence and limitations remain recorded in its own task packet.

Evidence is saved in the task's `workspace-style-qa` directory under
`C:/Users/USER/.codex/visualizations/2026/10/07/01a11417-ba2d-7102-86e7-ac5f59085602/`:
`section-zwcad-fixed-2026-10-08.dxf`,
`section-zwcad-independent-rewrite-2026-10-08.dxf`,
`zwcad-dxf-audit-2026-10-08.json` and `zwcad-dxf-test-2026-10-08.log`.
No application dependency was added or private project content transmitted.

Status: identified raw-container defects repaired; focused, independent-file
and application/report regression evidence pass. Direct ZWCAD application-open
and the pre-existing aggregate ADSEC gate remain unresolved. No engineering
verification, acceptance or report status was promoted; no commit or push was
requested for this follow-up.
