---
name: workspace-style-design
description: Design, implement or review P-M workspace UI, including compact engineering parameter forms, concise workflows, controls and light/dark themes using the Frame jscad design language. Use for presentation and form simplification; not for structural calculations or changes to the CAD drawing palette.
---

# Workspace Style Design

Use the Frame jscad language with the approved P-M adaptation: blue/teal primary
actions in both themes, existing drawing colours, text toolbar navigation and
no engineering icon rail. The Section mesh canvas is the approved transparent
background exception; mesh drawing colours remain unchanged.

Keep the interface simple, complete and technical: a flat, clear hierarchy, ordinary controls and
only task-relevant information. Minimise both input burden and visual/interaction clutter; do not
trade essential engineering context or readable values for a smaller-looking form.

## Read the standard

Read [design-standard.md](references/design-standard.md) completely before UI
work. It is the single maintained visual authority: composition rules, role
matrix, token scales, themes, typography, every control/state, panes, menus,
tables, charts, icons, responsive behaviour and functional exceptions live
inside this skill. [The implementation map](../../../docs/development/09-workspace-design-system.md)
routes to the current owners without duplicating the standard.

Read [measurements.md](references/measurements.md) only when comparing the source
screenshots or discussing fidelity. Those copied measurements are evidence,
not P-M defaults. Follow repository architecture and the owning pipeline;
presentation does not change validation, units, engineering states or data.

## Compose before customising

Start with the standard's [engineering input composition](references/design-standard.md#engineering-input-composition):
identify independent inputs, derived values and active choices before arranging controls. Make the
routine engineering task short to scan and complete; correct styling alone is insufficient.

1. Inspect the current shared primitive and its callers. Choose an existing role
   from the standard before editing feature CSS or markup.
2. Implement tokens -> shared primitive -> role assignment -> feature layout.
   Standard/compact/chart densities, priorities and selection compose. Keep page
   tabs, joined choices, independent actions and content rows distinct.
3. Keep geometry, typography and state colours in their shared owner. Feature
   CSS may arrange content and set functional widths/overflow; it must not
   restyle controls, introduce a palette or repeat a shared definition. No
   repeated-class specificity, late override, per-feature size or text offset.
4. If a new reusable role is necessary, update the standard first, implement it
   once and apply it to all matching existing cases. Document functional
   exceptions with an owner. Update the thin Claude adapter in the same change.
5. Preserve native events, input/commit/cancel behaviour, focus, accessible
   names/states, persistence, numerical results and drawing-role colours.

Review the input burden before delivery: remove redundant entry and repeated explanation, use
inline mathematical labels, align related fields and show derived values as read-only. Apply the
standard's dependency review to select a minimal sufficient set of independent inputs; layout follows
the relationships and available space, rather than a fixed form template.
Reducing controls must preserve explicit units, governing limits, validation and engineering status;
a change to those meanings belongs to the engineering workflow.
Use the standard's current-consumer rule and linked active-input inventory for every editable
panel, dialog and workbook field; update the inventory when adding or changing an input.
Apply its routine-form text rule as well: completed audit text and generic instructions do not
belong in the normal input flow.

## Verify

The standard also covers the Project spreadsheet and plain XLSX presentation.
Place text-only Open in the same Project menu row as Import and Export. The Project editor has one title row: native Open, Save, Undo and
Redo icons only on the left, filename centred, Update to Project / Minimize / Maximize / Close on the right in
place of Search/Share/Comments/theme. Keep the native ribbon below and add no extra header row.
Native Open/Save own file actions. Check drag and minimize/restore preserve the draft.

Inspect populated Section/Rebar, Materials, Capacity, Demand Check, Options,
project menus/dialogs and calculation dialogs in both themes. Measure actual
actions/fields/tabs/expanded options; inspect the toolbar basis frame in resting,
hover and expanded states, plus hover/focus/disabled/selection,
terminal Rebar, Outer/Hole and Loadcase table sizing and footer actions that
follow the table, including inline table units, labelled file actions and bounded
option lists that precede the table,
long text and signed decimal values, including the fixed single-row Detail
header and its truncated section name. Exercise narrow layouts, whole-group
wrapping, sidebar pointer/keyboard resizing, cancellation/reset and a theme
round trip. Check separate extrema rows in chart metric summaries. Compare CAD
colours with the populated baseline and confirm the
mesh has one panel background. Exercise fixture imports/exports and distinguish
the shared quarter-turn Import vector from the upward Export vector.

Run AGENTS.md's structure/typecheck, focused owner tests, application tests,
production build and bundle gate. Validate canonical/adapter parity and skill
schema; report unexecuted CLI invocation gates separately. Record visual
evidence, failures and limitations in the task packet. Do not claim runtime
skill discovery from schema validation or engineering verification from UI QA.

A natural trigger is “make the Material labels match our workspace” or “simplify this engineering
form so it asks only for necessary inputs”. A solver
equation change uses the engineering workflow instead.
