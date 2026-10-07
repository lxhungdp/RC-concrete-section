---
name: workspace-style-design
description: Design, implement or review P-M workspace UI, toolbar menus, side panels, typography, controls, icons and light/dark themes using the Frame jscad design language. Use for presentation changes; not for structural calculations or changes to the CAD drawing palette.
---

# Workspace Style Design

Use the Frame jscad language with the approved P-M adaptation: blue/teal primary
actions in both themes, existing drawing colours, text toolbar navigation and
no engineering icon rail. The Section mesh canvas is the approved transparent
background exception; mesh drawing colours remain unchanged.

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

## Verify

Inspect populated Section/Rebar, Materials, Capacity, Demand Check, Options,
project menus/dialogs and calculation dialogs in both themes. Measure actual
actions/fields/tabs/expanded options; inspect hover/focus/disabled/selection,
long text and signed decimal values. Exercise narrow layouts, whole-group
wrapping, sidebar pointer/keyboard resizing, cancellation/reset and a theme
round trip. Compare CAD colours with the populated baseline and confirm the
mesh has one panel background. Exercise fixture imports/exports.

Run AGENTS.md's structure/typecheck, focused owner tests, application tests,
production build and bundle gate. Validate canonical/adapter parity and skill
schema; report unexecuted CLI invocation gates separately. Record visual
evidence, failures and limitations in the task packet. Do not claim runtime
skill discovery from schema validation or engineering verification from UI QA.

A natural trigger is “make the Material labels match our workspace”. A solver
equation change uses the engineering workflow instead.
