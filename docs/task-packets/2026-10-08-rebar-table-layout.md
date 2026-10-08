# Rebar table height and footer actions

Objective: fit the Rebar table to its rows up to the available sidebar height,
then scroll rows. Place labelled Add at the right and Remove all at the left of
a footer that follows the table. Do not pin the footer to the panel bottom.
Once the table reaches the available height, adding rows must scroll only the
table and must not push the footer below the sidebar's usable bottom.

Class 1, presentation only. Authorities: docs/00; development/01 and /04;
docs/08; workspace-style-design and its canonical design standard. Shared table
layout is owned by workspace-chrome.css; feature markup assigns roles. Remove
the duplicated legacy 42vh/360px cap in globals.css and side-panel.css. Footer
buttons use the existing standard action role, matching Generate; handlers and validation remain
unchanged. Document the table composition in the skill and its thin adapter.

No calculation, input default, schema, palette, dependency or report changes.
The working tree was clean at the start on dev/newUI, commit 484f07e.

The grid uses automatic header/footer rows, a shrinkable table row and
`min-height: 0` on the editor. An editor minimum based on all table content would
push the footer outside the panel; the rendered Add check caught that failure
and the final shared layout removes it.

Rendered evidence, production preview, 2026-10-08:

- At 1280 x 720, loading the 18-bar KDS complex fixture gives a table viewport
  of 345 px with 548 px of row content. Adding three bars raises content to
  635 px while the viewport stays 345 px. The footer stays at y=675..701;
  the sidebar bottom is y=713. The sidebar itself remains 668/668 px
  client/scroll height. Scrolling the table to its last row does not move the
  footer.
- At 1280 x 900, 19 rows use a 525 px table viewport. Generating four rows
  shrinks it to 142 px with no scrollbar, and the footer follows at y=471.5..497.5
  instead of remaining at the panel bottom. Remove all and Add preserve the
  empty/one-row states and their existing handlers.
- Add, Remove all and Generate use the standard 26 px action height and
  13 px text in light/dark themes.
- At 520 x 800, stacked panels have only 336 px for the sidebar body. The
  standard two-field minimum permits a short outer scroll (349 px content)
  so the footer remains reachable. This is the documented short-screen
  fallback; it does not increase with the number of table rows.
- No warning/error entries were captured by the preview browser.

Visual evidence is stored outside the repository under
`C:/Users/USER/.codex/visualizations/2026/10/07/01a11417-ba2d-7102-86e7-ac5f59085602/workspace-style-qa/`:
`rebar-2026-10-08-many-dark.png`, `rebar-2026-10-08-few-light.png`,
`rebar-2026-10-08-after-add-light.png`, `rebar-2026-10-08-scrolled-light.png`
and `rebar-2026-10-08-layout.json`. Only the agent-owned preview tab/server
were used for these disposable fixture edits.

Verification:

- Passed `npm run check:structure`, `npm run typecheck`, the 12 focused
  workspace-layout/section-xlsx tests, production `npm run build`,
  `npm run check:web-bundle` and `git diff --check`.
- `npm test` passed its unit phase, then stopped at four existing ADSEC
  source-hash mismatches (KDS/P16: source `9c08ebf4...` vs manifest
  `6d952aaf...`; ACI: source `be988e18...` vs manifest `922c722e...`).
  Sources, manifests and tolerances were not changed. The aggregate gate
  remains non-green.
- Ran the remaining integration gates separately: `test:cad` (11 tests),
  `test:roundtrip`, `test:excel-export`, `test:excel-block`,
  `test:demand-check` and `test:pdf-report`; all passed. AVA's update-notifier
  config permission warning did not fail its tests.
- Canonical and Claude adapter passed the platform `quick_validate.py`
  validator; Python UTF-8 mode was used for the canonical English/Unicode
  source. Structure validation confirms skill parity.
- Cross-agent CLI invocation gates remain unexecuted. The earlier Codex
  CLI probe required external transmission of private repository skill text
  and was rejected by automatic approval review; the user has not authorized
  that transmission. Claude CLI is unavailable. Schema/parity validation
  does not establish runtime skill discovery.

No numerical benchmark applies to this presentation-only change. UI review
and the passed integration checks do not promote any engineering result or
report status. No commit or push was requested for this follow-up.
