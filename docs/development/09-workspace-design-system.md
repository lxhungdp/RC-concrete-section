# Workspace Design System

Status: approved presentation contract, adapted from Frame jscad on 2026-10-07.
Engineering scope, numerical owners and preview/release states remain governed
by the control map.

The single visual authority is the canonical skill's
[design standard](../../.agents/skills/workspace-style-design/references/design-standard.md).
Read it completely before changing UI. The complete specification lives inside
the skill so later design work has the same rules; this document only maps the
implementation. Do not maintain a second copy of visual values here.

| Concern | Owner |
|---|---|
| Visual decisions, roles, states and exceptions | Skill `references/design-standard.md` |
| Scalar tokens and light/dark palettes | `apps/web/app/workspace-tokens.css` |
| Action/field/check/choice primitives and density | `apps/web/app/workspace-primitives.css` |
| Shell, panes, menus, page tabs, surfaces and content roles | `apps/web/app/workspace-chrome.css` |
| Base content and feature layouts | `apps/web/app/globals.css` (`pm-foundation`), `side-panel.css` (`pm-feature`) |
| Drawing palette | `apps/web/app/drawing-palette.css`, existing SVG/renderer owners |
| Geometry-only drawing and layout | `apps/web/app/geometry/geometry.css` |
| Sidebar sizing/resize | `shared/workspace-layout.ts`, `shared/WorkspaceFrame.tsx` |
| Add/transfer vectors | `shared/WorkspaceIcons.tsx` |
| Native select popup and navigation | `shared/WorkspaceComboboxes.tsx`, `shared/combobox-navigation.ts` |

`shared/` is relative to `apps/web/features/section-editor/`. Feature markup
selects shared roles while retaining handlers and semantics. Imports load base
and feature layers first, followed by tokens, drawing palette, chrome and
primitives. Feature selector specificity cannot change shared primitives.
Dependencies remain unchanged. No font CDN or additional styling runtime is
required. Numerical validation, DTOs, report content and engineering diagrams
retain their owners.

Use the skill's verification procedure and AGENTS.md gates. Record the observed
design evidence and any failed/unexecuted gates in a task packet; UI QA does not
certify engineering results.
