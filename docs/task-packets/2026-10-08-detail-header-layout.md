# Fixed Detail header layout

Objective: keep Detail, its section name and Basic/Point + Excel/DXF on one
row, including long section names. Preserve the user's button order and the
shared standard action dimensions.

Class 1, presentation only. Authorities: docs/00, development/01 and /04,
docs/08 and the canonical workspace-style-design standard. Layout owner:
`apps/web/app/side-panel.css`. Existing markup already provides the requested
order, name ellipsis/title attribute and accessible tab/export handlers.

The Detail header and its action cluster no longer wrap. Inline-size containment
prevents the long subtitle from setting the copy's intrinsic width; Detail sets
its minimum width instead. At irreducibly narrow sidebar widths only the header
scrolls horizontally. No control size, state colour, CAD palette, engineering
value, material, codec, project schema or report status changed. Preserve all
earlier uncommitted Rebar and DXF work on dev/newUI.

The functional exception is recorded in the canonical design standard;
the skill entrypoint and thin Claude adapter route verification to it.

Verification, 2026-10-08:

- Production browser: imported the populated DXF fixture with a long filename.
  At the normal sidebar width the 349 px header is 34.3 px tall. The name has
  99 px available versus 574 px intrinsic text, uses ellipsis and retains the
  complete title attribute. All four controls share the same y coordinate,
  26 px height and 13 px text, in the requested order.
- At the minimum 260 px sidebar width, Detail remains visible and the header
  scroll area is 234 px wide with 285 px of content. Horizontal scrolling moves
  51 px and reveals the complete DXF action. No action wraps or shrinks.
- At a 390 x 844 viewport, the stacked sidebar has a 337 px header. All four
  controls fit on the same row with a truncated section name. Light/dark themes
  and a theme round trip preserve geometry. Basic/Point selection still switches
  the editor; the preview browser recorded no warning/error entries. Temporary
  viewport changes were reset, and only the agent's disposable tab was edited.
- Passed `check:structure`, `typecheck`, 12 focused workspace-layout/section-xlsx
  tests, production `build`, `check:web-bundle` and `git diff --check`.
  Initial gzip JavaScript remains 373.5 KiB within the 375 KiB budget.
- `npm test` passed all 353 unit tests, then failed the same four existing ADSEC
  source-hash checks documented in the earlier DXF container packet. No fixture,
  manifest or tolerance was changed. Remaining integration gates passed in the
  preceding container repair; they were not rerun for this CSS-only change.
- Canonical and Claude adapter passed the platform skill validator. Its first
  sandboxed attempt lacked YAML; retry using the existing isolated local QA
  dependencies passed without adding an application dependency.
- Cross-agent CLI invocation gates remain unexecuted: the earlier Codex probe
  was rejected by automatic approval review because it would transmit private
  skill text, and that transmission has not been authorized; Claude CLI is
  unavailable. Schema/parity validation does not prove runtime skill discovery.

Evidence under the current task's `workspace-style-qa` directory at
`C:/Users/USER/.codex/visualizations/2026/10/07/01a11417-ba2d-7102-86e7-ac5f59085602/`:
`detail-header-{long-light,minimum-dark,phone-dark,final-light}-2026-10-08.png`,
`detail-header-layout-2026-10-08.json` and `detail-header-test-2026-10-08.log`.

Status: requested layout and focused UI evidence pass. The aggregate ADSEC and
cross-agent runtime gates remain unresolved as stated above. No numerical
benchmark applies to this presentation-only change; no engineering state is
promoted. No commit or push was requested for this follow-up.
