# Concrete ring table and footer actions

Objective: apply the shared Rebar terminal-table composition to the Concrete
Point editor for every selected Outer/Hole. Fit a short table to its rows, grow
to the available sidebar height, then scroll only the table. Keep Remove all
at the left and labelled Add at the right immediately below the table.

Change class: Class 1 presentation, with a bounded Class 3 draft/apply pipeline
change for clearing and rebuilding a ring. Requirements: ENG-GEO-001 and
ENG-GEO-002; the existing draft/applied separation in development/03.

Authorities: docs/00 and /01; engineering/02 and /03; development/01, /03, /04
and /05; docs/02, /06, /08 and /09; engineering/06; workspace-style-design.

Owners and allowed files: canonical workspace-style-design and its thin Claude
adapter; shared table layout in workspace-chrome.css; ring editor composition
and commands in SectionDrawingClient.tsx; a web draft-validation adapter and
focused tests; development/03 for the draft/apply contract. Geometry validation
continues to belong to @pm/geometry. Preserve all existing uncommitted work.

Input contract: Remove all clears points in the selected unlocked draft ring
only. Preserve the ring's position, other outers/holes, reinforcement and applied
geometry. Add remains a midpoint insertion for an existing ring and can seed an
empty draft ring at the editor origin for subsequent coordinate editing. Use the
existing point-ID allocator and snapping rule; introduce no analysis default.

Output contract: draft editing never changes the applied input until Apply.
Before the existing geometry-input adapter, validate the complete unfiltered
draft through @pm/geometry, including its bars. An incomplete outer must not be
silently omitted by the adapter. Invalid drafts return existing typed geometry
issues and cannot replace the applied input.

Blocking cases: locked edits, empty/short/degenerate/self-intersecting rings,
invalid holes or reinforcement. Keep row deletion's existing three-point guard.

Oracles: independent fixture coordinates and untouched-ring equality for clear
operations; canonical validator issue codes for incomplete and invalid rings;
valid rectangle-with-hole fixture; existing geometry/kernel, round-trip and
pipeline checks. Browser measurements cover short/many rows, Outer/Hole,
post-Add scroll ownership, footer position, lock state, both themes and a short
viewport. Validation is input integrity, not engineering certification.

Impact: no calculation formula, tolerance, material/profile, schema, report,
dependency or CAD palette changes. Valid applied geometry keeps the existing
conversion and full-precision data. Out of scope: accepted-result/release gates,
DWG decoding, unrelated geometry or numerical refactors, commits and pushes.

## Rendered evidence

Production preview on 2026-10-08, disposable fixture edits only:

- At 1280 x 720, the 32-point circle's table viewport is 277.7 px; its row
  content is 954 px. Adding a point increases content to 983 px without moving
  the footer at y=675..701. The sidebar remains 668/668 px client/scroll height.
- A four-point rectangle fits a 143.5 px table with no row scrollbar. Its
  footer follows at y=573.8..599.8 rather than staying at the panel bottom.
- Outer/Hole navigation uses the same table. The independent DXF fixture has
  two eight-point holes and 18 bars. Clearing Hole 1 retains Hole 2's eight
  points, its ring slot and all 18 applied bars. Add seeds Point 9 at (0,0) in
  the cleared draft hole, with finite coordinates and no identity collision.
- Applied/locked rings disable both footer actions. After unlocking and
  clearing an outer, Apply displays `RING_TOO_SHORT`'s existing explanation
  inline and the Rebar list still consumes the previous applied section.
  Rebuilding three vertices at (-100,-100), (100,-100), (0,100) and applying
  succeeds, clears the warning and restores the Final state.
- Add and Remove all both measure 26 px / 13 px in light/dark themes.
  The Rebar regression still has 18 rows, 345/548 px table client/scroll
  height and footer bottom y=701 inside sidebar bottom y=713.
- At 520 x 800, the sidebar body has 335.5 px. The documented short-screen
  fallback scrolls the sidebar to reach its header/footer while reserving a
  48 px table. Adding the 33rd point increases only row content; sidebar scroll
  height and the footer position remain unchanged. The Add action is reachable
  and was exercised. The temporary viewport override was reset.
- No browser warning/error entries were captured. CAD colours and applied
  geometry remain controlled by their existing owners.

Evidence lives outside the repository under
`C:/Users/USER/.codex/visualizations/2026/10/07/01a11417-ba2d-7102-86e7-ac5f59085602/workspace-style-qa/`:
`concrete-table-layout-2026-10-08.json`, `concrete-table-final-light-2026-10-08.png`,
`concrete-table-final-dark-2026-10-08.png`, `concrete-table-few-dark-2026-10-08.png`,
`concrete-table-hole-dark-2026-10-08.png`, and
`concrete-table-short-dark-2026-10-08.png`.

## Verification status

- Passed `npm run check:structure`, `npm run typecheck`, 21 focused geometry/
  workspace tests, production `npm run build`, `npm run check:web-bundle`, and
  `git diff --check`. Initial JavaScript is 374.2 KiB gzip against 375.0 KiB.
- `npm test` passed 357/357 unit tests, then stopped at the same four existing
  ADSEC source-hash mismatches: KDS/P16 `9c08ebf4...` vs `6d952aaf...`, ACI
  `be988e18...` vs `922c722e...`. No source, manifest or tolerance was changed.
  The aggregate gate remains non-green. Its log is
  `concrete-point-table-tests-2026-10-08.log` in the evidence directory.
- Ran the remaining integration gates separately: `test:cad` (11 tests),
  `test:roundtrip`, `test:excel-export`, `test:excel-block`, `test:demand-check`
  and `test:pdf-report`; all passed. Local sandbox write restrictions on .next
  and existing report-selftest artifacts were resolved through approved local
  build/test execution. The AVA notifier permission warning did not fail CAD
  tests.
- `npm run bench:pipelines` passed its cross-mechanics/144-direction reference
  comparisons with no failures. Its log is
  `concrete-point-table-pipelines-2026-10-08.log`. No mechanics, meshing,
  stations, convergence or code-profile implementation changed; no numerical
  baseline was updated.
- Canonical and Claude adapter passed `quick_validate.py` in UTF-8 mode;
  structure validation passed their discovery parity. CLI invocation gates
  remain unexecuted: the prior Codex probe's external transmission of private
  skill text was rejected by automatic approval review and is not authorized;
  Claude CLI is unavailable. No runtime-discovery claim is made.

Status: implemented preview editor/input-integrity change with recorded visual
and regression evidence; aggregate and cross-agent runtime gates remain open.
This does not promote any engineering result or report. Existing uncommitted
work was preserved on dev/newUI; no commit or push was requested here.
