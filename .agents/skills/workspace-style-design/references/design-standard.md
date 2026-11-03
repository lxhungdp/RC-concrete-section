# P-M Workspace Design Standard

Status: approved presentation contract, adapted from Frame jscad on 2026-10-07.
Engineering scope, numerical owners and preview/release states remain governed
by the control map. This reference is the single visual authority shipped with the canonical skill.

## Source and P-M exceptions

Source: `jscad/.agents/skills/workspace-style-design/SKILL.md`,
`jscad/docs/development/frontend/UI_THEME.md`, and the source project's shared
chrome/token/icon implementation. The copied
[measurement ledger](measurements.md)
retains raster evidence and its limitations. The
[P-M skill](../SKILL.md) applies this contract.

The user retains P-M's light teal `#197381` and dark blue `#38bdf8` primary
actions, with their existing hover and foreground colours. The entire CAD
palette stays unchanged. The user's latest contrast request replaces the
border-matches-frame trial with neutral pane depth: a darker frame, lighter
panels, restrained 1px outlines and one shared small shadow. Light frame/panel/border
are `#ececec` / `#ffffff` / `#dedede`; dark are `#1d1d1d` / `#282828` / `#3a3a3a`.
The shell uses a uniform frame colour. These shared
decisions supersede copied source border colours; controls, typography and
layout continue to follow jscad. P-M uses its existing text module toolbar and has no
engineering icon rail or native desktop caption controls. No jscad model,
SI convention, solver, camera policy or project codec is imported.

## Owners

| Concern | Owner |
|---|---|
| Shared chrome colours, typography, spacing and dimensions | `apps/web/app/workspace-tokens.css` |
| Shell, menus, typography, surfaces and result layout | `apps/web/app/workspace-chrome.css` |
| Shared actions, fields, checkable controls and joined choices | `apps/web/app/workspace-primitives.css`; feature markup chooses the role and retains semantics/handlers |
| Dense custom chart controls (`ws-chart-controls`) | `workspace-tokens.css`, `workspace-primitives.css`; layout and metric text in `workspace-chrome.css` |
| Sidebar feature layout and content | `apps/web/app/side-panel.css` |
| Existing SVG palette isolated from chrome | `apps/web/app/drawing-palette.css` |
| Pure sidebar sizing and mounted resize interaction | `shared/workspace-layout.ts`, `shared/WorkspaceFrame.tsx` |
| Shared Add / transfer React SVGs | `shared/WorkspaceIcons.tsx` |
| Native-select presentation and React popup / keyboard navigation | `shared/WorkspaceComboboxes.tsx`, `shared/combobox-navigation.ts` |
| Geometry-only drawing presentation | `apps/web/app/geometry/geometry.css` |

Paths starting with `shared/` are relative to `apps/web/features/section-editor/`.
Feature geometry, report content, numerical validation and project DTOs retain
their current owners. Do not add panel-specific palettes for existing roles.


## Composition contract

A design starts with a shared role, never with the name of a feature. Implement
in this order: tokens -> primitive -> role assignment -> feature layout.
Use one definition of geometry, typography and each interaction state. A new
feature composes those definitions; it must not copy them into its own CSS.

- `workspace-tokens.css` owns scalar visual values and light/dark palettes.
  Shared radii are 4/6/8/12px; chrome type is 11/12/13/15px, normal 400, menu 500,
  emphasis 600. Route-level message headings use the shared 24px display role.
  Gaps/padding use the shared 2/4/6/8/10/12/16/24/32px spacing scale; 2px is
  the micro-inset for dense content, not the pane gutter.
- `workspace-primitives.css` owns control dimensions, typography and states.
  `workspace-chrome.css` owns pane/menu/tab/surface roles and arrangement.
  Both are unlayered. Base CSS is in `pm-foundation`; sidebar layout is in
  `pm-feature`. Feature selector specificity cannot override a shared primitive.
  Declare layer order before feature rules. Never use `!important`, repeated
  classes, negative text offsets or a late override to change a shared role.
  Existing print-isolation `!important` rules are confined to the print content
  owner; they do not define workspace controls. Print rules remain outside the
  workspace layers so theme/chrome priority cannot override paper formatting.
- Feature CSS owns widths required by content, grid/flex placement, overflow,
  scroll ownership and drawing/report content. Reference shared tokens for
  chrome text, spacing, radii and colours. Do not redefine button/field height,
  radius, type, padding or state colours in a feature. A layout width is not a
  reason to invent a new control size.
- Reuse standard, compact and chart densities. They set common control variables;
  actions, checkable labels, fields and joined choices consume those variables.
  Priority (primary/secondary/destructive), density, icon-only shape and selected
  state are independent. No new density per panel, theme or action name.
- Keep page tabs, joined choices, independent actions and interactive entity/menu
  rows distinct. A content row can wrap and have intrinsic height; it is not a
  fourth button density. Keep semantic statuses noninteractive.
- If a genuinely new reusable role is needed, define its purpose and all states
  here first, implement it once and apply it to every matching existing case.
  A one-off exception needs a functional reason and a named owner, not visual
  preference. Existing functional exceptions are listed below.

| Shared role | Choose it for | Geometry / composition |
|---|---|---|
| `ws-action` | Independent actions | Standard 26px / 13px / 6px corners |
| `ws-action--primary` | Main action | Blue/teal palette; same geometry |
| `ws-action--quiet` | Subordinate icon/disclosure action | Transparent neutral resting surface |
| `ws-action--danger`, `ws-action--danger-quiet` | Destructive action / row icon | Separate muted red palette; quiet variant changes on hover |
| `ws-action--compact` | Table/entity actions, removable quantity chips | 22px / 11px; 6px corners |
| `ws-action--icon` | Named icon-only action | Square at its density height, no horizontal padding |
| `ws-chart-controls` | Custom chart header/tool/field/mesh navigation | Inherited 20px / 11px / 4px corners density |
| `ws-joined-buttons` | Exclusive choices | Uses current density, one seam, only outer corners |
| `ws-check` | Checkable option | Same density and selected palette, visible native marker |
| `ws-check--wrap` | Sentence-length checkable option | Intrinsic wrapped height, standard minimum; no new density |
| `ws-page-tabs` | Sidebar page navigation | 28px transparent strip with hairline and active underline |
| Native input/select/textarea | Editable field | Shared field primitive; table/chart contexts select density |
| `ws-field-group` | Field with an inline icon or unit | Same field geometry/states; one outer frame, transparent inner editor |
| `ws-row-action` | Menu/entity/document navigation row | Intrinsic content layout; shared type/focus; selection persists |
| `ws-compact-status` | Noninteractive Final status | Compact geometry; preserved status palette |
| `ws-action-content` | SVG + text within an action | Centres the combined content |
| `ws-num` | Quantities, counts, ratios, numeric summaries | Technical face, 400, tabular figures |
| `ws-table-editor` | Terminal sidebar table with a footer | Content-sized table up to available height, following footer |
| `ws-scroll-list` | Bounded sidebar option/selection list | Content-sized up to the shared 148px limit, then internal scrolling |

### Interaction rules

Hover, selected, focus, disabled and expanded are states of the shared role,
not separate feature styles. Selected wins over hover. Editing focus uses one
accent border without a shadow; keyboard action/check/radio focus uses the
shared visible ring. Disabled actions keep their geometry with shared 0.45
opacity; disabled fields use muted foreground/surface. Disabled/readonly
semantics and all commit/cancel/confirmation handlers stay with the owner.
The default control line height is 1.4; body copy is 1.5. Theme changes affect
colours only. Respect reduced motion.
Native checkbox/radio markers use the shared 12px role (10px in chart chrome);
joined radios retain the accessible hidden 1px element. Plain checkbox labels
use the ordinary label typography without acquiring a button frame.

### Functional exceptions

- Main menu, PM logo, basis summary and page tabs use the documented 28px
  navigation scale, independently of action density.
- CAD toolbar targets use that same 28px navigation height with 4px corners
  (`ws-action--cad`); their overlay location/surface remains a CAD chrome role.
- Multiline textareas and long checkable sentence rows use intrinsic height with
  the standard minimum. Table cell editing uses 24px; this is a field role, not
  another action density.
- A compound field uses `ws-field-group`, the ordinary field dimensions and
  state palette. Only its shared wrapper owns the border; the native inner
  editor fills the available width and inner height without another frame.
  Feature layout may set its content width, not editor geometry. Inline icons
  use the shared 14px action role. Disabled and focus-within affect the wrapper.
- Plotly modebars/axes/legends, SVG/canvas annotations, engineering diagrams,
  KaTeX equations and printable report content have their own renderer/content
  owner. Do not restyle them through control selectors or infer new numerical
  meaning from their appearance. Workspace dialogs still use shared controls.
- Application-level failure pages have a prominent message heading; action
  controls and semantic error colours still use shared tokens.

These are the complete current workspace roles. Shared rules below specify
their approved surfaces, layout, typography, icons and behaviour.

## Shell and navigation

Use the uniform neutral frame colour and 44px toolbar. The workspace's left,
right and bottom insets are 6px, equal to the pane gutter. Both use the single
`WORKSPACE_PANE_GAP` layout constant, exposed to CSS by the shell and frame.
Sidebar and CAD/results each own a one-pixel border and 12px rounded corners,
separated by a 6px gutter. The containing grid is transparent and borderless.
Header navigation uses 28px text menus with 6px corners and 13px/500 text.
The selected menu has 600 weight, an accent tint and accent border; it retains
that selection while hovered and exposes `aria-pressed`. P-M's module names
and handlers remain unchanged. Keep only the clickable 28px PM logo on the left
to open the existing application information popup, anchored below the logo and
capped to the viewport. Omit the toolbar application title and the separate
right-side information icon. The logo retains a named keyboard-focusable button,
expanded state, and outside/Escape dismissal. File tools retain explicit text
and accessible names. The project-tools trigger is labelled `Project`, with
the simple 16px outline-file icon and accessible name `Project menu`. Its text
uses the same 13px/500 typography as ordinary module menus. It opens project
information, import/export, recent files and examples; do not label this menu
`Open` or use an open-folder icon.
Inside the menu, `Project information` is a text-only action with no icon or
chevron; it retains the existing hover/focus style and dialog-opening handler.

The calculation-basis summary uses an emphasized field frame: 28px height,
1px `--accent` border in resting, hover and expanded states, `--input-bg` resting
surface and 6px corners. Hover/expanded states use `--card-hover` without changing
the border or geometry. Keep the shared keyboard focus ring. Use 330px width
when room permits so code, mechanics and
resistance format are visible; reduce to 286px below 1200px and use the 130px
code-only layout below 900px. Keep the existing narrow-screen toolbar omission.
Keep all labels, tooltips, popup controls and calculation-selection handlers.
Sidebar Concrete/Rebar, Concrete/Steel and Points/Mesh/Resistance page tabs
retain their 28px transparent hairline strip and active 2px accent underline,
13px ordinary text/600 selected weight; they are not joined switch buttons.

The sidebar defaults to 378px, using the same restrained shadow as other panes. It has no repeated
active-module heading: navigation and the sidebar's accessible label identify
the module, while functional group captions remain. The scrolling body has
8px top and 12px side/bottom padding. Resize has an 8px hit target in the gutter: pointer drag,
Left/Right by 10px, Shift by 40px, Home/End, double-click reset and Escape cancel.
Normal bounds are 260–720px while reserving the 6px gutter and 280px for CAD where possible. Below
560px workspace width, the sidebar occupies at most half the available width.
Window clamping retains the preferred width. Width is transient UI state and
survives module/theme changes, not reloads or project export.

At phone widths the panel and drawing stack with the same gap, borders and
corners to keep fields readable; the toolbar
continues to expose text menus through horizontal scrolling. A keyboard user
can reach all modules and file tools. Resizing is omitted for the stacked layout.

## Type, fields and actions

Use the offline system font stack. Group headings are sentence-case 13px/600;
labels and action text are 13px/400; explanations are 12px/400 and muted.
Table headers/units are 11px and compact values are 12px. Numeric editors and
numeric value cells use `ui-monospace, SFMono-Regular, Menlo, monospace`, weight
400 and tabular figures in both themes. Preserve engineering symbol casing.

Fields and standard actions share a 26px height and 6px radius. Fields use 8px
horizontal padding and one border; actions use 10px and a 6px icon gap. Textareas
retain multiline height. Table editors use 24px height, a shared 4px radius and small
gutters. Focus uses the one-pixel accent field border with no ring/shadow and
wins over hover. Keyboard button/checkbox/radio focus remains visible.
Resistance factors use one label/value row with a 96px editor, so strain limits
and longer labels remain readable at the default sidebar width.

Single-select fields retain their native elements, values, events, labels and
validation. A shared React portal renders the jscad popup language rather than
the OS popup. Its browser-only implementation loads as a separate chunk after
hydration; the native field is available throughout. It preserves focus on the
field and exposes listbox/options with
selection and active-descendant state. Arrow/Home/End/Page/typeahead exploration
does not change the value. Enter/pointer commit dispatches native input/change
events once; Escape, Tab, outside press, external scroll or field changes dismiss
without selecting. Disabled options cannot commit; unrelated result rerenders
retain the menu. Existing multiple-select/listbox fields retain native semantics.

Trigger/popup/border/highlight colours match jscad: light `#f2f3f3` / `#fffeff`
with borders `#e1e2e2` / `#e5e5e5`, highlight `#f2f2f3`; dark `#343434` / `#2c2c2c`
with borders `#454545` / `#3b3b3b`, highlight `#3c3c3c`. Popup has 4px inset,
28px minimum rows, 6px corners, the copied selected-check path and 12px SVG
chevron. Every expanded option copies its own trigger's computed font size,
family, weight, line height and letter spacing before layout. Closed triggers
use 13px/400 text, or 12px in dense tables; their options use exactly the same
size. A global popup font must never enlarge dense-table options.
It matches the trigger until intrinsic content requires more
width, stops at 8px viewport gutters, aligns right with a 4px gap, flips above
when needed and scrolls within 320px. Field focus remains the accent border.

Primary Add/Apply/Run actions are filled blue/teal. Secondary file/disclosure
actions use neutral outlines. Destructive actions use pale red/light and muted
red/dark surfaces without altering failure-status colours. All standard actions
have ordinary label text and identical dimensions. Navigation, entity rows,
chart tools and icon-only targets have their own documented compact role.
Table and entity-row actions, including Section Apply, use one 22px compact
variant with 11px/400 labels, 6px radius, 6px horizontal padding and 4px icon gap.
Icon-only table targets are 22px square. Priority and theme change only colours.
Section Apply and the noninteractive Final label share that geometry/type and
a 44px minimum width. Keep Final's existing foreground/background and status
meaning. Icon/text actions centre the combined content using `ws-action-content`,
with one shared line-height and fixed nonshrinking SVG rather than anonymous
text alignment or panel-specific offsets.
Capacity and Demand Check share the same chart-visibility strip and standard
26px action buttons: 13px/400 text, 6px corners, 10px horizontal padding and 6px
icon gap. The compact table/entity-row role does not apply to sidebar chart
visibility buttons. Use existing standard action tokens, not panel-specific sizes.
Visible charts use the accent tint/border and `aria-pressed`; hidden charts use
neutral colours. Hover retains selected appearance. Plot-header Hide and layout
icons use the dense chart role below. Every editable table cell,
including criteria selects, keeps the shared `--table-field-radius` on focus.
Numeric displays in Capacity, Demand Check and Options use `ws-num`, the same
technical font/400/tabular figures as Section inputs. Verbal statuses and names
stay sans; quantities and their formatted value groups keep their full text.
Icons inherit the whole action's colour in every state. Shared Add is 12px/1.2
stroke; transfer is 14px/1.5 stroke. Import uses the original downward arrow
and open-tray vector rotated exactly 90 degrees counterclockwise as one group,
so the arrow enters from the left toward the right. Preserve its paths, rounded
stroke ends, joins and tray dimensions. Export retains the upward arrow and
open tray. Visible format/action labels
and accessible Import/Export names retain the command's meaning.
Ordinary action SVGs use the shared 14px icon role; compact/table and dense
chart action SVGs use 12px; CAD navigation targets use 16px. Shared Add/transfer
vectors retain their named 12px/14px roles outside dense chart chrome.

Section headers retain their intrinsic height and do not shrink when trailing
control groups wrap. Constrained content scrolls below them without overlapping
header text or actions. This is a shared section-header layout rule.

The Concrete Detail header is a fixed single-row layout: title/name on the left,
then Basic/Point, then Excel/DXF on the right. Long section names use ellipsis
within the remaining title width and expose their full text through a title
attribute; they never move the actions onto another row. The name contributes
no intrinsic inline size, so the title determines the minimum copy width.
Keep all four actions at their shared standard size with no wrapping or
shrinking. If the sidebar is narrower than that minimum row, the header scrolls
horizontally. This functional layout exception is owned by `side-panel.css`;
other section headers retain their whole-group wrapping behaviour.

Related file formats share one action group, with visible format labels and
named Import/Export semantics using the shared transfer icons. Use the density
of the surrounding actions: Concrete drawing import is compact beside Create
boundary, separated with a shared spacing token; drawing export is standard
beside Excel export. Wrap complete choice/file groups on narrow sidebars rather
than shrinking controls or cropping actions, except for the fixed Detail header
above. Feature CSS owns placement only.

Table headings keep their unit note beside the title on the same row rather
than spending a separate line on units. Keep that title/unit group together;
file-action groups may wrap as a whole on narrow sidebars. The two Loadcase Excel actions use
text-only `Import XLSX` and `Export XLSX` buttons so both the command and file format are visible.

Exclusive choice switches use `ws-joined-buttons`: the same 26px height,
13px/400 type, 10px horizontal padding and 6px icon gap as standard actions.
The group has no enclosing border, surface, padding or gap, so it adds no
height. Each button owns its 1px border; adjacent borders overlap into one seam.
Only the outer left/right ends have 6px corners; every joined edge is square.
Use the existing neutral secondary-button tokens and accent tint/border for
selection. Hover preserves selection and size/weight never change. Focus is
visible above the shared seam; native radio labels retain checked/arrow-key
semantics. Keep existing button/tab roles, disabled states and input handlers.
This role covers Basic/Point, rebar patterns, Outer/Hole navigation,
chart source/resistance stage, 3D resistance surface,
strain/stress field mode and calculation-dialog view switches. Wrap complete
groups when space is short; buttons within a group stay joined. An unusually
wide Outer/Hole group scrolls within its navigation row. Highlight the edited
ring only and expose its pressed state. Main toolbar
navigation and independent actions retain their documented roles.

Custom chart chrome uses one smaller `ws-chart-controls` role in Capacity,
Demand Check and Options mesh/block panels. Its actions, numeric/text/select
fields and joined choices use shared tokens: 20px height, 11px/400 text, 4px
corners, 6px horizontal padding and 4px icon/control gaps. Icon-only targets are
20px square with 12px SVGs; native checkbox/radio markers remain 10px. Native
joined radios stay visually hidden and accessible. Numeric fields retain the
technical font/tabular figures and accent focus border; expanded combobox text
still matches its own trigger. Numeric field width is `12ch` plus horizontal
padding and borders, leaving room for signed values, decimals and native
steppers instead of cropping them into a two-digit slot. Selected/disabled
states retain dimensions.
Chart titles use 12px/600; metric captions use 11px/600, ordinary labels/values
11px/400 with the existing technical face on quantities. Show strain and stress
extrema as separate maximum and minimum label/value rows in the shared metric
layout; do not combine those distinct values into one slash-separated row.
Preserve each value's existing precision and unavailable marker. Apply this to custom
headers/toolbars/metric and mesh-overlay text, including mesh-navigation buttons,
not Plotly modebars, plotted axes, legends or SVG
drawing annotations. Narrow charts wrap whole controls without changing this
scale or splitting joined choices. Metric cards auto-fit with a 120px preferred
minimum width, capped by their container. At viewport widths up to 560px, the
chart grid stacks its visible panels into one scrollable column with a shared
420px minimum panel height. Every stacked chart reserves a shared 240px minimum
plot area; rows grow to their content when metric cards wrap, rather than
shrinking the drawing to a thumbnail. This applies to every chart through the
same responsive role. Keep all chart-selection/visibility handlers.
Sidebar visibility remains standard 26px.

## Surfaces, tables and themes

Light frame/panel/border use `#ececec` / `#ffffff` / `#dedede`;
dark uses `#1d1d1d` / `#282828` / `#3a3a3a`. The frame is darker than the panels
in both themes. Sidebar, CAD frame, chart panels and
Options mesh/block panels share one visible 1px border and 12px corners, with
`--ws-pane-shadow`: `0 1px 3px rgba(0, 0, 0, 0.08)` in light and the same geometry
at `0.24` opacity in dark. Neutral metric/status cards remain flat and use the
same border colour with their compact corners. Hover surfaces retain jscad's
`#eeefef` / `#343434`. Normal text is neutral, helpers muted.
Inner layout-only grids and wrappers are transparent, borderless and shadowless.
Workspace/results layout wrappers allow the short pane shadow to extend into
the existing 6px gutter; individual panels still clip their contents.
The two workspace panes own their outer borders and corners.
Capacity and Demand Check use a transparent results layout, without an extra
outer frame around the chart grid. Each chart panel owns one 1px
`--ws-shell-border` and 12px `--ws-pane-radius`, matching the sidebar's border
and corners. Chart panels use the sidebar's `--menu-surface` background;
bodies and neutral field-metric cards are transparent to that panel surface.
Horizontal and vertical chart gaps use `--ws-pane-gap` (6px), the same variable
as the sidebar/results gutter and shell insets. Plotly paper,
2D plot and 3D scene backgrounds are transparent. The Options Section mesh
canvas also uses an alpha-enabled context and clears to transparency on every
redraw; it must not paint a separate canvas background. Its wrappers remain
transparent so the panel owns the single background in both themes. Preserve
mesh strokes, section fill, rebars, quadrature points and inspection tools.
Empty result workspaces retain
their single pane border and shared panel background. Options mesh/block grids
also omit a redundant enclosing border around their framed card. Primary-chart selection
does not add an inset border or extra shadow; all chart panes use the same depth.
Keep trace colours, field ramps, axes,
selection tools, engineering status colours and result data unchanged; the
Section CAD and Options mesh/block drawing palettes remain independent.
One hairline separates groups. Semantic status cards, entity selections,
tables and floating dialogs may own an intentional surface. Tables use one
outer boundary and row separators, without boxed cell grids. Selected rows keep
their surface while hovered; Final boundaries keep their explicit status cue.

A terminal editable table with footer actions uses `ws-table-editor`: its header
and `ws-table-actions` footer retain their content height; `ws-table-scroll`
fits its rows until the editor reaches the remaining sidebar height. The footer
follows immediately below the table, not at a fixed panel-bottom position.
The editor must allow shrinking (`min-height: 0`); adding rows cannot move the
footer past the sidebar's usable bottom. Only the table scrolls at that limit.
Do not cap the table by viewport fraction or a fixed pixel height. Reserve at
least two table-field heights for the scroll area; on short screens the sidebar
can scroll so header/footer actions remain
reachable. The table owns row scrolling once its contents exceed that area.
The footer uses shared spacing and standard actions, matching Generate:
bulk removal on the left, Add with its shared icon and visible label on the
right; a sole Add action also stays on the right. Rebar, Concrete Outer/Hole
Point and Loadcase tables use this same role, without a duplicate Add action
in the table header. A compound heading uses
`ws-table-editor-heading` to keep the Detail actions, ring navigation and
point-count caption or a stable update-status slot above row scrolling. Changing the selected ring fits the
table to that ring's rows. Bulk actions affect only the displayed entity; locks
and validation retain their meaning. Incomplete geometry stays in the draft
editor and cannot bypass the owning Apply validation. The outer editor must not
introduce a second scrollbar; short-screen reachability belongs to the sidebar.

A sidebar option/selection list uses `ws-scroll-list` so its content cannot
consume the whole sidebar ahead of a terminal table. It fits short lists and
scrolls internally at `--ws-list-max-height` (148px), retaining the existing
bounded-list scale. The Report loadcase picker uses this role; its
checkboxes, All/None actions and selected state retain their existing semantics.
Feature layout still owns wrapping and placement; list scrolling adds no
control density, surface palette or selection behaviour.

Light/dark share sizes, weights, spacing, radii, icons and interactions. Only
colour tokens change. Existing PASS/FAIL/indeterminate/preview text and colours
retain their engineering meaning. Except for the explicitly transparent
Section mesh canvas background above, the drawing's canvas, grid, boundaries,
reinforcement, dimensions, annotations, selections, meshes and result ramps
remain independent of these chrome surfaces. `/geometry` adopts shared chrome
while retaining its own existing drawing palette.

## Verification

Use actual rendered fields/actions in both themes, including long labels,
hover/focus/disabled/selected states, menus, dialogs, expanded groups and narrow
layouts. Verify resizing by pointer and keyboard, cancellation/reset, window
clamping and theme round trip. Compare CAD role colours against a populated
pre-change baseline. Exercise file exports/imports with fixtures. Record gates
and limitations in the task packet; visual checks do not certify engineering.
