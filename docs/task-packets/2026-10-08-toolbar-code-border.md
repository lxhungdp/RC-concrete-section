# Toolbar Code border

Objective: give the toolbar calculation-basis summary the same visible accent
border at rest as its existing hover state, in both themes.

Class 1, presentation only. Authorities: docs/00, development/01 and /04,
docs/08 and the canonical workspace-style-design standard. Shared owner:
`apps/web/app/workspace-chrome.css`. The existing `--accent` token determines
the theme colour; no new palette, control size or feature override is added.
The canonical reference records the resting/hover/expanded frame contract,
and its entrypoint and thin Claude adapter route verification to those states.

No calculation selection, keyboard handler, CAD palette, numerical value,
material, project schema, dependency or report status changes. Preserve the
earlier uncommitted drawing and table work on dev/newUI.

Verification, 2026-10-08:

- Production-browser resting, hover, expanded and keyboard-focus checks passed
  in light/dark themes. The border remains 1px accent: light rgb(25, 115, 129),
  dark rgb(56, 189, 248). Height remains 28px and corners remain 6px.
  Opening the popup and Escape dismissal retain their existing behaviour.
- At 850px viewport width the summary retains the accent border and its existing
  130px code-only layout. The temporary viewport was reset; the light/dark/light
  round trip restores the 330px summary and resting surface. No console warnings
  or errors were recorded. CAD colours were visually unchanged in both themes.
- Passed `check:structure`, `typecheck`, all 360 unit tests, production `build`,
  `check:web-bundle` and `git diff --check`. Initial gzip JavaScript remains
  374.2 KiB within the 375 KiB budget. The focused owner check is the rendered
  state/geometry comparison; no CSS-mirroring test was added.
- `npm test` subsequently failed the same four pre-existing ADSEC source-hash
  checks recorded in the prior drawing packet. No source fixture, manifest or
  tolerance was changed. The remaining integration gates passed in the preceding
  DXF-only change and were not rerun for this CSS-only change.
- Canonical and Claude adapter passed the platform `quick_validate.py` validator
  using existing isolated local YAML dependencies. The initial sandboxed attempt
  lacked YAML; the local dependency retry passed without an app dependency.

Evidence in the task's `workspace-style-qa` directory:
`toolbar-code-light-2026-10-08.png`, `toolbar-code-dark-full-2026-10-08.png`,
`toolbar-code-states-2026-10-08.json` and `toolbar-code-test-2026-10-08.log`.

Cross-agent CLI invocation gates remain unexecuted: the earlier Codex probe was
rejected by automatic approval review because it would transmit private skill
text, and that transmission has not been authorized; Claude CLI is unavailable.
Local skill schema/parity checks do not establish runtime discovery.

Status: requested visual behaviour and focused evidence pass. The aggregate
ADSEC and cross-agent runtime gates remain unresolved as stated above. No
numerical benchmark applies to this presentation-only change. No engineering
verification state is promoted, and no follow-up commit or push was requested.
