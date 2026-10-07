# Workspace design standard refactor

Objective: audit current presentation, compose every control from shared rules
and ship the complete maintained standard inside the canonical skill.

Change class: 1, presentation only. Authorities: docs/00, docs/01 control map,
development/01 and /04, docs/08, workspace-style-design and skill-creator.
The control map now names the skill's `references/design-standard.md` as the
single visual authority; development/09 is its implementation map. Canonical
skill and Claude adapter retain the same name/description and trigger boundary.

## Scope and contracts

- Tokens -> primitives -> semantic role assignments -> feature layout. Features
  cannot change a primitive through CSS specificity: base and sidebar content
  live in ordered foundation/feature layers; shared chrome/primitives are
  unlayered. No repeated-class specificity or new styling dependency.
- One action/check/field/choice geometry and state owner. Standard/compact/chart
  densities compose with priority, icon-only shape and selection. Page tabs,
  content rows, CAD navigation and multiline fields have documented functional
  roles, rather than feature-specific button sizes.
- Compound icon/unit fields use the same shared field frame and a transparent
  inner editor. Rotate retains only its functional 96px width/alignment; remove
  its obsolete 32px minimum and duplicated frame/focus declarations.
- Remove 749 obsolete field/action declarations in the initial pass, then
  remove obsolete choice-track/pill declarations. Normalize legacy chrome type,
  spacing and radii to the shared scales. Do not force uppercase on unit symbols.
- Assign shared roles to 81 existing action/row targets in the initial pass,
  plus geometry Fit, recovery actions and disclosure navigation. Keep native
  events and every commit/cancel/validation/confirmation handler.
- One outer-pane surface/border/depth rule; preserve the approved neutral frame,
  blue/teal primary palette, tab underlines, transparent chart/mesh backgrounds
  and independent drawing/renderer colours. Final remains noninteractive.
- The skill contains the complete role matrix, scales, states, theme palettes,
  typography, icons, menus, tables, charts, layout, responsive rules, ownership
  and exceptions. Later UI work reads that standard completely and changes the
  shared owner first. There is no second copy of visual values in development/09.

No formulas, defaults, solver/sampling routes, data/schema, input validation,
engineering status/eligibility, report data, oracle, tolerance or dependency
changes. Existing uncommitted work is preserved. Generated selftest outputs are
ignored local evidence, not deliverables or committed artifacts.

## Verification

Passed: `check:structure`, `typecheck`, six focused combobox/sidebar/mesh-view
tests, platform validators for the canonical skill and Claude adapter,
production build and `git diff --check`. All 340 unit tests passed within the
aggregate application command. The remaining CAD (11 tests), JSON roundtrip,
stress-strain Excel, equivalent-block Excel, Demand Check workbook and PDF
integration gates passed separately after aggregate testing stopped at ADSEC.
Sandbox output-file EPERM for the integration scripts was resolved by authorized
test escalation. No baseline, source manifest or tolerance was changed.

The production bundle gate passes: initial JavaScript 372.9/375 KiB gzip,
Plotly 1325.7/1400 KiB, analysis worker 116.9/120 KiB and Excel 248.1/300 KiB.
The final compound-field cleanup was followed by a production rebuild and
rendered field review; no dependency or calculation code changed.

Rendered evidence in light and dark themes:

- Section, Rebar, Materials, Capacity, Demand Check, Options, project menus,
  Project information and calculation dialogs use their assigned shared roles.
  Standard actions are 26px/13px/400; compact actions 22px/11px/400; custom chart
  controls 20px/11px/400. Geometry Fit is 26px/13px/400 with 6px corners.
- Apply and passive Final both measure 44x22px, 11px/400, 6px corners. Joined
  choices retain one seam and outer corners; page tabs retain their underline.
  Table editing focus uses 4px corners, the accent border and technical figures.
- The final compound Rotate field measures 26px with 6px corners in both themes.
  Its native editor is 24px, borderless and transparent; focus adds exactly the
  wrapper's accent border without a shadow. Disabled state uses the shared muted
  surface. No browser error/warning was observed in the final production review.
- Expanded Material options match their 13px trigger; Options criteria match
  their 12px table trigger. Escape preserves the value. Numeric fields use the
  technical family and weight 400. The sentence-length axial-cap check retains
  its documented intrinsic-height exception instead of a new density.
- All 135 drawing-role palette signatures in the populated pre-change baseline
  are represented unchanged in both themes. Additional existing annotations
  explain the larger current role count. Mesh wrappers/canvas are transparent
  and the outer panel owns the background; drawing colours remain unchanged.
- Selected Demand rows retain the accent surface under pointer hover. Hide/Show
  charts transitions from three panes to two and back; controls keep their
  density. Pointer resize changes 378 to 418px and double-click resets to 378;
  keyboard resize was also exercised. Theme round trip preserves dimensions.
- At 520x800 there is no horizontal document overflow. Charts stack into one
  scrollable column with the same pane gap. The field drawing retains 240px
  minimum height while metric cards wrap; all three panes remain at least 420px.
  Project dialog cancellation preserves its original fixture values.

Local evidence is in
`C:/Users/USER/.codex/visualizations/2026/10/07/01a11417-ba2d-7102-86e7-ac5f59085602/workspace-style-qa/`:
`standard-*.png`, `standard-evidence.json`, the earlier CAD palette comparison
JSON and gate logs. These are visual/behavioural checks, not numerical oracles.

### Failed and unexecuted gates

Aggregate `npm test` remains non-green because the same four pre-existing ADSEC
source-hash failures recur. KDS/P16 starts `9c08ebf4` versus manifest `6d952aaf`;
ACI starts `be988e18` versus `922c722e`. The source files, manifests and oracle
tolerances are unchanged. This task does not resolve or suppress that conflict.

Cross-agent CLI invocation checks for this revised skill remain unexecuted.
Automatic approval review previously rejected Codex CLI external access because
it could transmit private skill/design-contract contents without permission for
that destination. The user requested an explanation, not authorization; the
probe was not retried. Claude CLI is not installed. Earlier revision probes,
schema validation and adapter parity do not verify this revised runtime workflow.

The browser's atomic drag API cannot test held-pointer Escape/lost-capture
cancellation. Those paths retain the existing owner tests/code review. Above-field
combobox placement and physical Excel/PDF application rendering remain manual QA
limitations; workbook/PDF owner integrations passed. Numerical benches are not
applicable to this presentation-only change.

Status: the requested design implementation and canonical standard are available
for review. Aggregate ADSEC and CLI runtime gates remain incomplete. Engineering
verification, acceptance and release eligibility are not promoted by this work.
