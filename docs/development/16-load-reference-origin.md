# Load reference origin

Status: implemented and regression-checked; Preview only. User-authorized on 2026-10-29.

## Task packet

- Objective: edit a project-wide load reference at the net-concrete centroid plus X/Y offsets,
  with explicit Apply and an unchecked-by-default Convert existing loadcases option.
- Change class: 3, loading normalization, persistence and result-view pipeline. No mechanics,
  resistance profile, surface, solver tolerance, classification or acceptance rule changes.
- Requirements: ENG-LOAD-001, ENG-AN-003, ENG-RES-001/002 and ENG-REP-002. Engineering/02 section 2
  owns signs and reference translation; engineering/05 owns compatible demand/result frames.
- Owners: @pm/project reference definitions and pure action translation; web draft/Apply and input
  adapters; existing analysis/result queries; @pm/report reference evidence. Workspace controls
  compose the existing standard roles.
- Input: canonical centroidal load combinations in N/N.mm, applied reference offsets in mm, a
  separate finite draft offset and a transient conversion choice. X/Y directions are unchanged.
- Output: one atomic applied-reference/loading update; centroidal worker/check inputs; explicit
  input-reference copies. All Direct, Fixed-P, demand-plane and 3D curves remain centroidal.
  Convert retains the original canonical combinations exactly. Without Convert, the previous displayed numbers are reinterpreted at the new origin.
- Blocking failures: non-finite/overflowing actions or offsets, missing/unknown persisted frame,
  double translation, stale mixed frames, inappropriate code-demand correction at the user origin,
  or a changed canonical load/UR during Convert.
- Oracles: direct force-times-lever-arm sums, both signs and pure axial/bending cases, inverse
  reference transformations, both mechanics' unchanged proportional checks and qualified fields,
  file round trips and production browser draft/Apply/Convert transitions.
- Schema impact: canonical project v3 adds an explicit load reference; v1/v2 remain explicit
  centroidal readers. All stored combinations remain about the centroid. New canonical snapshots
  write the reference; no result artifacts or checkbox/draft/history are persisted.
- Reports: identify the applied input reference and retain centroidal calculation/audit ledgers;
  show corresponding input-reference demands as separate evidence. Never silently relabel a
  centroidal audit as a calculation about the offset origin.
- Exclusions: axis rotation, per-loadcase origins/history, geometry movement, new material/domain
  models, sampling changes, new dependencies and accepted-result/released-report promotion.

## Decision

Let O=C+(dx,dy). The engineering owner specifies Mx_O=Mx_C-P*dy and My_O=My_C-P*dx.
The application stores only centroidal actions plus the applied offset. This makes Convert an
exact no-op on engineering inputs and avoids accumulated C/O round trips. Editing a displayed
input converts that authored vector once to C. Applying without Convert adds P times the offset
increment to the canonical moments. A zero increment is an exact no-op.

Only Apply changes the applied reference. Native spinner/text draft edits preview only the load
axes on the section drawing, with an explicit preview label; they never change a calculation.
The Convert checkbox is an ordinary borderless checkbox and Apply follows the fields/checkbox.
The draft and checkbox are local editing state. Apply changes
the reference and all existing loads together; new loads thereafter are authored at that reference.
Draft edits and checkbox changes alone cannot invalidate or mutate a calculation. The surface
remains centroidal and reusable; code-specific demand rules still operate there. Proportional UR
is the existing 3D check. The centroidal fixed-P diagnostic retains its declared basis. Geometry-only load-axis preview
remains available before any loadcase is added. Opening a project resets the draft and checkbox; unapplied
preview state is never reused with a newly imported model.

## Verification

- `npm test` passes: repository structure, strict type checks, 414 unit tests, five AdSec tests,
  11 CAD tests, canonical/legacy project round trips, independently recalculated Excel workbooks,
  demand exports and reproducible preview PDFs.
- Independent force/lever-arm sums verify the reference signs, with positive/negative forces.
  Pure bending, axial load, zero-offset identity, new/edited input vectors, invalid frames and
  overflow are covered. Convert preserves the canonical array exactly; unchanged Apply is also
  an exact identity.
- Both-mechanics application tests independently re-run inside/NG demands (UR=0.5, 2 and 5) and
  require identical governing checks, qualified field evidence and centroidal Fixed-P/demand-plane
  paths after Convert. No surface, code rule or numerical tolerance is changed.
- V3 JSON persists the reference and centroidal actions; explicit v1/v2 inputs retain their
  centroidal contracts. Metric/US project and standalone loadcase workbook round trips pass;
  missing new-format reference evidence fails closed. Nonzero-origin spreadsheet arithmetic is
  checked within ordinary binary64 roundoff, without display rounding or altered tolerances.
- Report tests prove that adding input-origin evidence cannot change any centroidal report
  curves, fields or decisions. PDF identity and Excel reference evidence distinguish C/O actions.
- Production browser checks pass for both mechanics in Metric and US units: native mouse spinner
  targets (including the first click from a rounded inch value), live draft axes, checkbox off by
  default and borderless, trailing Apply, no draft persistence or calculation, exact Convert UR/
  input invariance, unchanged Direct/Fixed-P traces, unchecked reinterpretation, new rows at the
  applied origin, unit round trips, project import reset, empty-loadcase preview and Escape cancel.
  Light/dark and 360px screenshots pass; the reference group has no horizontal overflow. No browser
  or worker errors are recorded. The permanent harness is tools/verification/load-reference/browser.mjs.
- `npm run build` and `npm run check:web-bundle` pass against the unchanged limits: initial 338.0/
  375 KiB, worker 79.2/120 KiB, Plotly 1325.4/1400 KiB and Excel 248.1/300 KiB (gzip).
- `bench:verify:portable`, `bench:strain-sampling`, `bench:equivalent-block` and `bench:pipelines`
  pass on the existing checksum-verified Node 24.20.0/npm 11.19.0 reference runtime. Test/build use
  Node 24.22.1/npm 11.19.1. Portable Windows replay is not an exact macOS-provenance claim. No
  baseline or numerical oracle was overwritten.

Evidence and screenshots are in ignored outputs/load-reference/. The production browser uses an
isolated copy of a completed build, avoiding shared .next rebuilds without changing the development
server or production configuration. Earlier diagnostic failures remain historical outputs; the
latest browser-final.log, browser-evidence.json and npm-test-complete.log are the final gate evidence.
These are scoped Preview implementation checks, not accepted-result or released-report approval.
No skill definition or adapter was changed; no new cross-agent CLI verification is claimed.
