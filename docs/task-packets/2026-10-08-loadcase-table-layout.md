# Loadcase table layout and Excel actions

Objective: label both Loadcase file actions with Excel, keep units beside the
table title, and reuse the terminal table layout that grows to the remaining
sidebar height before scrolling its rows. Keep Add visible below the table.

Class 1, presentation only. Authorities: docs/00; development/01 and /04;
docs/08; workspace-style-design and its canonical design standard. Owners:
LoadingsPanel role assignment, shared table layout in workspace-chrome.css,
feature header arrangement in side-panel.css. Remove obsolete table-region
and icon-only file sizing rules in globals.css rather than overriding them.
Preserve existing uncommitted drawing, table and toolbar changes on dev/newUI.

Use existing standard actions, transfer icons, terminal-table rows and tokens.
The stable update slot remains mounted outside table scrolling. No new Add,
delete, selection, workbook, unit conversion, demand, calculation, schema,
material, palette, dependency or report behaviour is introduced. Add's existing
handler moves to the shared following footer; a sole footer action aligns right.
The canonical standard, skill and thin Claude adapter record this composition.

The initial 60-row rendered check found a second cause: the Report loadcase
picker was not assigned the existing bounded-list layout and grew to 428px,
pushing the table/footer past the sidebar. Move the old 148px bounded-list
limit into the shared `ws-scroll-list` role and token, and apply it to that
picker. Preserve its short-list fit, checkbox handlers, All/None and selection.

Verification, 2026-10-08:

- At 1280 x 720, three imported rows use a 112px table with 110px client/content
  height and no row scrolling. Add follows at y=431..457, rather than the pane
  bottom. Adding two rows grows the table and following footer normally.
- With 60, 62, 200 and 201 rows, the table viewport remains 244px, while row
  content grows from 1706px to 5654px. Add stays at y=675..701; sidebar body
  client/scroll height stays 668/668px. Focusing the last row scrolls the table
  to 1520px without scrolling the sidebar or moving the footer. The Report
  picker stops at 148px and scrolls its own choices. All/None checks still select
  all 201 combinations and then none.
- Both file actions display Excel with standard 26px height and 13px text.
  Units stay beside Loadcases in light/dark themes. At the 260px minimum sidebar
  width, only the complete Excel group wraps; title and units stay together.
  At 520 x 800, the documented short-screen fallback permits a 124px sidebar
  scroll to reach headers/footer while the table retains its two-field minimum.
  Adding a row does not increase that outer scroll extent. Viewport overrides
  and sidebar preference were reset; theme round trip preserves geometry.
- Signed decimal editing commits the exact entered value (-155.625). Numeric
  editors retain the technical face and 4px corners. No warning/error console
  entries or export alert were recorded. UI imports for 3/60/200 rows succeed.
- The unchanged workbook owner round-trips independent fixture definitions at
  3/60/200 rows. Passed all 13 focused selection, trace, workbook and workspace
  layout tests. UI Export was invoked, but the in-app browser's download-event
  capture timed out, so that downloaded file's bytes were not inspected.
  The workbook builder/importer tests, rather than this capture, establish the
  unchanged format/ID/unit round trip.
- Passed final `check:structure`, `typecheck`, all 360 unit tests, production
  `build`, `check:web-bundle` and `git diff --check`. Initial JavaScript is
  374.3 KiB gzip within the 375 KiB budget. The first parallel aggregate-test
  attempt raced a temporary Next build file; a serialized rerun passed structure
  and typecheck. The final aggregate run fails only the same four existing ADSEC
  source-hash checks. No source fixture, manifest or tolerance was changed.
  Later integration gates had passed in the preceding DXF-only change and were
  not repeated for this presentation slice.
- Canonical and Claude adapter passed the platform skill validator using existing
  isolated local YAML dependencies. The structure gate validates parity.

Evidence in the task's `workspace-style-qa` directory:
`loadcase-table-layout-2026-10-08.json`, `loadcase-table-few-light-2026-10-08.png`,
`loadcase-table-many-light-2026-10-08.png`, `loadcase-table-many-dark-2026-10-08.png`,
`loadcase-table-test-final-2026-10-08.log` and the disposable workbook fixtures.
Development/04's obsolete CSV description now identifies the existing Excel
route; the codec itself is unchanged.

Status: requested presentation and focused evidence pass. The aggregate ADSEC,
UI download capture and cross-agent runtime gates remain limited as stated here.
No numerical benchmark applies to this presentation-only change. No engineering
verification state is promoted. No follow-up commit or push was requested.

Cross-agent CLI invocation gates remain unexecuted: the earlier Codex probe was
rejected by automatic approval review because it would transmit private skill
text, and that transmission has not been authorized; Claude CLI is unavailable.
Local schema/parity checks do not establish runtime discovery.
