# Loadcase modal opening flash

Date: 2026-11-05. Status: implemented; scoped UI and aggregate application checks pass.
Engineering outputs remain Preview.

## Objective and scope

Remove the visible flash between loading and the populated Gridcraft sheet when Open XLSX opens
the modal. The user clarified that the issue is the opening transition, rather than grid editing
speed. Change class 2: presentation/coordination expected to be result-identical.

Owners: development/04 loading workflow, development/01 web-only spreadsheet boundary, and the
workspace design standard. No units, project schema, loading values, formula evaluation, resistance,
acceptance state or workbook persistence contract changes. No dependency or Rust source change.

## Reproduction and cause

The isolated production browser screencast reproduced the sequence under
`outputs/gridcraft/opening-before/`: loading text, a full black GPU-canvas frame, an empty default
sheet, then the populated Loadcases sheet. The frame index and message timeline are in evidence.json.

The iframe was visible throughout initialization. Gridcraft removes its own loading element after
the renderer starts, before the parent has opened the loadcase workbook. The host processes open
after its UI pass; that acknowledgment therefore precedes the next populated drawing. The parent
also sent the initial theme without awaiting it. Runtime readiness and a completed first drawing
were treated as the same event.

## Required behavior

Keep one parent-owned loading surface covering the mounted iframe until workbook open and theme
acknowledgments complete, then wait for the iframe's rendering frames before revealing it. Preserve
its size while hidden so renderer initialization and resizing use the final viewport. Reveal the grid
and enable actions together. Close must cancel outstanding frame callbacks; failures must remain
visible without exposing a partial sheet. No arbitrary timeout or decorative fade is needed.

## Verification

`tools/verification/loadcase-spreadsheet/opening.mjs` records compositor frames, bridge timestamps
and per-frame visibility samples. With `PM_ASSERT_PRESENTED=1`, it verifies masked startup, reveal
after the theme acknowledgment, cancellation before reveal, failure coverage and successful reopening.
`PM_TEST_THEME=dark` and `PM_OPENING_NARROW=1` select dark and 390px cases. The first visible
populated frames were also inspected manually. This is browser/UI evidence, not engineering certification.

## Implemented change and current evidence

`LoadcaseSpreadsheetDialog.tsx` now owns one loading surface above a mounted, transparent iframe.
It awaits workbook open and the initial theme, then crosses two child animation-frame boundaries
before revealing the iframe and enabling its actions together. The iframe keeps its final layout
size during initialization. Unmount cancels the pending callback; failure leaves the renderer
covered and exposes the existing error message. No additional timing constant or fade was added.

`workspace-chrome.css` owns the viewport/cover layout using inherited dialog surfaces and existing
muted text. Its narrow-layout rule hides header feedback only, retaining the loading text. The
development/04 workflow records the readiness/presentation distinction.

- Light/dark compositor captures in `opening-after-light/` and `opening-after-dark/` show loading
  followed directly by the populated sheet. There are no exposed black/default-sheet frames.
  All visible-iframe samples follow the theme acknowledgment. These local runs observed roughly
  two rendering frames between the theme acknowledgment and reveal; no speed guarantee is claimed.
- Extended runs in `opening-final-light/` and `opening-final-dark/` pass cancellation during the
  presentation phase, an intentionally failed Wasm load, and successful fresh reopening. No
  unhandled page error occurred. `opening-final-narrow/` also passes at 390px, retaining a visible
  loading surface and readable header.
- Existing real-canvas formula, relative/absolute fill, paste/undo, values-only Update,
  formula-preserving Save as, literal reopen, error/budget boundaries, move/resize and narrow-theme
  checks pass in `opening-feature-regression.log`. Seventeen focused spreadsheet/bridge/XLSX tests
  pass in `opening-owner-tests.log`.
- Production build, artifact-integrity and existing bundle budgets pass. Initial JavaScript is
  353.4/375 KiB gzip; Plotly 1325.4/1400, worker 69.3/120, Excel 248.1/300. Gridcraft remains
  8.83/10 MiB gzip; its Rust source, dependency lock and generated assets are unchanged.
- The final `npm test` passes with exit 0: structure, documentation, traceability, TypeScript,
  680 unit tests, ADSEC/CAD, project round trips, independently recalculated workbooks for both
  mechanics, demand checks and reproducible preview PDF. Evidence: `opening-npm-test-final.log`.
  The earlier run's 30 P-M chart assertion failures are retained in `opening-npm-test.log`; their
  owning test file changed concurrently before this successful rerun. This opening fix does not
  edit that chart implementation or its tests.
