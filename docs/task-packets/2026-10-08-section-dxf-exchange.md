# Editable section DXF exchange

Objective: add Concrete drawing import beside Create boundary and drawing export
beside Excel, including actual-size circular rebars and entity-based recognition
on one pm layer.

Class 3: new external input pipeline; no mechanics, tolerance, code coefficient,
project schema, analysis defaults or drawing palette changes. Existing uncommitted
Rebar layout/skill changes are preserved on dev/newUI (base 484f07e).

Requirements: ENG-GEO-001/002/005 (input, topology, full bar disks and references),
ENG-MAT-001 (material definition validation), DEV-ARCH-002/004 (public APIs and
separate geometry/material ownership); DXF-001 layer recognition, DXF-002 exact
coordinates/diameters, DXF-003 draft import, DXF-004 explicit units,
DXF-005 first material/default creation, DXF-006 typed bounded rejection.

Owners: development/03 exchange contract; web geometry/section-dxf.ts pure
interchange adapter; geometry/section-drawing-import.ts material assembly;
SectionDrawingClient.tsx file handling/draft state and role assignment. Existing
pm-geometry validators and pm-materials/pm-project default factories remain owners.

Input: ASCII mm DXF on the single pm layer; straight closed 2D
POLYLINE/LWPOLYLINE boundaries classified by strict nesting and CIRCLE bars
regardless of diameter. Unitless requires explicit mm
choice. Output: typed geometry draft/material snapshot or a blocking issue.
Export: active boundary and its bars, mm, full precision, geometry only.

Blocking failures: malformed or binary file, unsupported entities/curves/frame/
units, non-finite coordinates, open/degenerate/intersecting rings, ambiguous nesting,
invalid disks/overlap, invalid materials or resource exhaustion. No partial state
mutation. Unsupported drawing curves are not approximated.

Oracles: hand-authored Autodesk-code fixtures independent of the writer; analytic
rectangle/hole area and bar diameter; translated/asymmetric/disconnected section
round trips; fail-closed cases; current-profile default/first-material tests;
actual browser download, import draft, Apply and empty-material assembly.

Impact: a user may deliberately change geometry through a new draft. Project v1
and report contracts remain unchanged; no acceptance status is promoted.
Out of scope: DWG decoding/conversion, arbitrary CAD entities/blocks/curves,
material definitions in drawings, mesh export, solver/model/default changes.

Verification, 2026-10-08:

- Passed `check:structure`, `typecheck`, all 12 focused DXF tests (including
  analytical area/centroid, mixed circle diameters, nesting, full disk validity,
  explicit units, malformed/unsupported inputs, limits and all-profile material
  defaults). The aggregate `npm test` unit phase passed, including existing
  section Excel, geometry, materials, project and analysis coverage.
- `npm test` then stopped at four existing ADSEC source-hash failures:
  KDS/P16 source `9c08ebf4...` vs manifest `6d952aaf...`, ACI source
  `be988e18...` vs manifest `922c722e...`. No source, manifest or tolerance
  was updated. The aggregate gate remains non-green.
- Ran the remaining gates separately: `test:cad` (11 tests), `test:roundtrip`,
  `test:excel-export`, `test:excel-block`, `test:demand-check`, `test:pdf-report`,
  production `build`, `check:web-bundle` and `git diff --check`; passed.
  Initial gzip JavaScript is 373.5 KiB within the 375 KiB budget. The DXF codec
  and material assembly are loaded on file action. Local build/report outputs
  required sandbox escalation; their retries passed.
- `bench:pipelines` passed with no failures. Exact `bench:verify` stopped at its
  declared provenance gate (baseline darwin/arm64, current win32/x64).
  The existing `bench:verify:portable` passed, with 17 roundoff deviations;
  worst section-normalized difference 4.957e-17. Baseline and comparison
  criteria were unchanged. Additional station/block-sampling benchmarks were
  not selected because this adapter changes no kernel, sampler or code profile.
- The browser exported the populated KDS fixture: 24 points, two holes, 18 bars.
  Independent ezdxf 1.4.3 read/audit found three closed LWPOLYLINE entities,
  18 CIRCLE entities, all pm, mm, zero errors and zero repairs. A file edited
  and rewritten by ezdxf imported successfully through both the adapter and UI
  with its first bar diameter changed to 100 mm. Apply retained all bars,
  full section area 1,120,000 mm2 and first steel SD400. Unitless import cancel
  left the boundary list and applied geometry unchanged. Unsupported pm ARC
  import showed a blocking alert and likewise preserved both boundaries and
  the applied section. Browser console clean.
- Inspected import/export grouping in light/dark themes and at 390 x 844.
  Import uses the surrounding compact role (22px/11px), Export the existing
  Excel action role (26px/13px). Fixed a reproduced narrow-panel overlap via
  shared section-header `flex-shrink: 0`; wrapped headers retain intrinsic
  height and content scrolls below. The common rule is recorded in the skill.
- Canonical skill and thin Claude adapter pass platform `quick_validate.py`;
  structure validation confirms parity. Cross-agent CLI invocation gates remain
  unexecuted: an earlier Codex CLI probe was rejected by automatic approval
  review because it would send private repository skill text externally, and
  that transmission has not been authorized. Claude CLI is unavailable.
  Schema/parity checks do not establish runtime skill discovery.

Evidence is saved under the current task's `workspace-style-qa` directory in
`C:/Users/USER/.codex/visualizations/2026/10/07/01a11417-ba2d-7102-86e7-ac5f59085602/`:
`section-exchange-2026-10-08.dxf`, `section-dxf-audit-2026-10-08.json`,
`section-external-2026-10-08.dxf`, and `section-dxf-2026-10-08-{concrete,dark,
rebar-dark,narrow-dark}.png`. The read/audit tool was installed only in that
task's isolated `dxf-validation-packages` directory from PyPI: ezdxf 1.4.3 (MIT),
pyparsing 3.2.3, fonttools 4.60.1 and PyYAML 6.0.3. No application dependency
was added and no project content was transmitted. This is file interoperability
evidence, not an AutoCAD application-open test or an independent capacity oracle.

Status: implementation and focused interchange evidence pass; the full aggregate
and cross-agent runtime gates remain unresolved as above. No schema version,
engineering verification/acceptance/report status, code profile or numeric
baseline changed. No commit or push was requested for this follow-up.

Follow-up, 2026-10-08: ZWCAD rejected the original export as invalid/incomplete.
The earlier ezdxf audit accepted an incomplete raw R2000 container because the
reader synthesizes absent defaults. That audit did not verify CAD application
opening. The container ordering/completeness repair, 13-test regression and
updated independent evidence are recorded in
[the ZWCAD container repair packet](2026-10-08-zwcad-dxf-container.md).
