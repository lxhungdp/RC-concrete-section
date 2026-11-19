# Workspace Design System

Status: approved presentation contract, adapted from Frame jscad on 2026-10-07.
Engineering scope, numerical owners and preview/release states remain governed
by the control map.

The single visual authority is the canonical skill's
[design standard](../../.agents/skills/workspace-style-design/references/design-standard.md).
Read it completely before changing UI. The complete specification lives inside
the skill so later design work has the same rules; this document only maps the
implementation. Do not maintain a second copy of visual values here.

For compact engineering forms and reduced input burden, use the standard's
[engineering input composition](../../.agents/skills/workspace-style-design/references/design-standard.md#engineering-input-composition).
It owns input classification, dependency review and the minimal sufficient input-set criteria.

| Concern | Owner |
|---|---|
| Visual decisions, roles, states and exceptions | Skill `references/design-standard.md` |
| Scalar tokens and light/dark palettes | `apps/web/app/workspace-tokens.css` |
| Action/field/check/choice primitives and density | `apps/web/app/workspace-primitives.css` |
| Concrete/Rebar σ–ε chart frame, display coordinates and tick values | `materials/MaterialCurveFrame.tsx`; shared `pm-material-curve` CSS role; concrete law and block view in `materials/ConcreteCurves.tsx`; Demand Check operating points in `results/FieldOperatingPoints.tsx` |
| Material parameter pairs and mathematical notation | `materials/MaterialSymbol.tsx`; `pm-material-parameters` / `pm-material-param` layout in `side-panel.css` |
| Options scalar label/control rows | `analysis/AnalysisOptionsPanel.tsx`, `shared/DisplayUnits.tsx`, `design/DesignBasisPanel.tsx`; feature row grids in `side-panel.css` |
| Demand Check offset label/control rows | `loadings/LoadReferencePanel.tsx`; existing inline wide rows in `side-panel.css` |
| Demand Check 2 × 2 chart grid (Field, σ–ε, P–M, Mx–My) and right detail pane | `results/ResultsWorkspace.tsx` (`detailPane`, compact demand headers), `results/FieldOperatingPoints.tsx` (σ–ε pane: one chart role for fibre, block and rebar laws, with a side value table), `results/DemandGridSplitHandle.tsx` with the `gridSplit` helpers in `results/results-view.ts` (centre resize handle); `pm-demand-layout` / `pm-demand-info` in `workspace-chrome.css`; its Data action (right of the Check heading) writes the whole pane with `detailPaneText` and the point tables with `plottedPointsText` in `results/demand-chart-text.ts`, shown in `DemandChartDataDialog` |
| Section canvas zoom/pan, true-size bars and overlay lines (Options mesh and block views, Demand Check Field) | `results/section-camera.ts` and `results/SectionCanvasCamera.tsx` (camera and toolbar), `results/section-overlay-line.ts` (N.A./⊥Rm segment and stroke); used by `results/SectionFieldChart.tsx` and `analysis/EquivalentBlockGeometryWorkspace.tsx`; `results/SectionMeshChart.tsx` keeps its own equivalent camera |
| Loadcase UR cell (ratio only, verdict colour, hidden verdict text) | `loadings/LoadingsPanel.tsx`; `pm-loadcase-ur` in `globals.css` and `side-panel.css`; `pm-visually-hidden` in `workspace-chrome.css` |
| Shell, panes, menus, page tabs, surfaces and content roles | `apps/web/app/workspace-chrome.css` |
| Base content and feature layouts | `apps/web/app/globals.css` (`pm-foundation`), `side-panel.css` (`pm-feature`) |
| Drawing palette | `apps/web/app/drawing-palette.css`, existing SVG/renderer owners |
| Geometry-only drawing and layout | `apps/web/app/geometry/geometry.css` |
| Sidebar sizing/resize | `shared/workspace-layout.ts`, `shared/WorkspaceFrame.tsx` |
| Movable dialogs and modeless app controls | `shared/MovableDialog.tsx`; `project/ProjectSpreadsheetWindow.tsx` selects controls integrated into the native filename row; `tools/gridcraft/patch.mjs` reserves that row's right slot |
| Add/transfer vectors | `shared/WorkspaceIcons.tsx` |
| Native select popup and navigation | `shared/WorkspaceComboboxes.tsx`, `shared/combobox-navigation.ts` |

`shared/`, `materials/`, `analysis/`, `design/` and `loadings/` are relative to `apps/web/features/section-editor/`. The shared material
frame owns SVG aspect ratio, plot margins, axes and tick marks; each material renderer supplies its own
evaluated curve, annotations and tick positions with formatted values (2026-11-09 review item 1).
Concrete draws the Design law solid and the characteristic reference dashed where they differ. An
equivalent-block profile shows its block over the strains (1 − β1)·εcu … εcu of a linear profile,
with the stress, β1 and εcu resolved by `resolveEquivalentBlockLaws`, which is loaded on demand. Steel uses tensile magnitudes only. Its Stress–strain heading and yield-strain
field precede the fixed chart position. Steel always displays the Design material curve, without a
curve-stage selector; the plain hardening checkbox and its conditional input group follow the
figure. Both material tabs place short mathematical labels
beside their fields in two-column parameter rows. A shared width derived from the material section's
inline size keeps native and unit-bearing field frames equal across rows, including yield strain
and hardening inputs; an unpaired final field retains that width. Heights, padding, type and states remain
with the shared field primitives. The strength field reuses one compound frame with two equal native
editors and a centred separator; it shows values only. Radio selection makes one editor writable and
the other read-only; read-only compound-field values use the shared muted foreground. MaterialSymbol
supplies native HTML/SVG mathematical notation. Name stays beside its input. The hardening checkbox
and strength radios share a row; the radios align with the second-column strength-input frame.
Feature markup
selects shared roles while retaining handlers and semantics. Imports load base
and feature layers first, followed by tokens, drawing palette, chrome and
primitives. Feature selector specificity cannot change shared primitives.
Dependencies remain unchanged. No font CDN or additional styling runtime is
required. Numerical validation, DTOs, report content and engineering diagrams
retain their owners.

Use the skill's verification procedure and AGENTS.md gates. Record the observed
design evidence and any failed/unexecuted gates in a task packet; UI QA does not
certify engineering results.
