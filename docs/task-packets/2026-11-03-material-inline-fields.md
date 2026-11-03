# Inline material parameters and mathematical notation

Objective: place each short material symbol beside its data input in both Concrete and Steel tabs,
with two parameter values per row and consistent input frame dimensions. The user explicitly
confirmed two values per row, including narrow layouts. Apply existing Steel-style typesetting to
Concrete, factors, block parameters and curve annotations without changing the underlying values.

Class 1 presentation change. Owners: MaterialPanel, SteelHardeningFields, MaterialSymbol, material
feature layout in side-panel.css, label-role assignment in workspace-chrome.css and compound-field
read-only colour in workspace-primitives.css.
Authorities: docs/00-README.md, docs/01-control-map.md, the workspace-style-design skill and its
complete design standard, docs/development/09-workspace-design-system.md. Standard-specific symbol
spellings follow the existing material/design models and engineering/04 conventions; no normative
coefficient, formula or applicability change is introduced.

Use a two-column grid of intact label/field pairs. A shared functional field width is derived from
the material section's inline size, with space reserved for each short label. Unit-bearing fields
retain the existing shared frame and explicit units. Place the percent sign inside the cutoff
field's shared unit frame. Keep strength-mode radios and their separator, automatic initialization,
curve position, positive tensile display, full-precision editing and all existing event handlers.
Long text names, selections and reasons retain their appropriate existing field roles. Imported
tabulated curves retain their table-field density. No numerical, persistence, schema, export,
dependency, verification-status or engineering-release change is intended.

Additional user direction: keep Name and its input on one row, and the strength-mode radios on the
same row as the Post-yield hardening checkbox. Reuse the existing plain labels and radio separator;
keep the header on one line with bounded horizontal overflow at the minimum width. The input
group still displays two values per row. Align the strength radios with the left edge of the
second-column k/fuk input using the same label-space contract as the parameter grid. These are
layout slots, not new material definitions.

Verification plan: measure native and unit-bearing frames for equality, check symbol/input vertical
alignment without overlap, and require two values on each populated parameter row. Exercise Concrete
and Steel, KDS fibre/block, EN, ACI, AS and legacy custom imports; both themes and minimum/normal
sidebar widths. Retain the hardening precision, valid/invalid input, JSON, physical-bound and
independent worker-capacity checks. Run structure/typecheck, full npm test, build, bundle gate and
diff whitespace check. No new numerical benchmark is required for presentation-only work.

Further user direction: split the strength-input frame into equal halves showing only k and fuk
values, with a separator exactly at the frame midpoint. Put notation and the stress unit in the radio
row. The selected strength quantity is editable; the companion is read-only, derived through the
existing project helper and visually muted using the shared compound-field read-only state. The
frame still matches the other parameter inputs. Five displayed values represent three independent
hardening inputs; there is no additional saved strength value or formula in the UI. Ratio entry uses
the shared decimal-text field convention; invalid/non-finite drafts still fail the existing compiler.

## Delivered evidence — 2026-11-03

Passed:

- Full `npm test`: repository structure, TypeScript, 460 unit tests, 5 AdSec tests, 11 CAD tests,
  JSON and metric/US workbook round trips, independent Excel recalculation, demand and PDF checks.
- Final Edge checks cover Concrete and Steel for KDS fibre/block, EN, ACI, AS and both legacy custom
  profiles. Frames match in width/height; populated parameter rows retain two columns; mathematical
  labels stay beside their fields without overlap. Normal/minimum widths and both themes passed.
- Strength radios align with the second-column field. Name stays inline. The compound frame has
  equal editor widths, a midpoint separator and no internal notation/unit labels. Exactly one
  editor is read-only, with a muted computed colour; selecting the opposite radio switches roles.
- Direct fuk entry updates k, direct k entry updates fuk, and restoring either input restores the
  original curve. Invalid k = 1 removes the curve through existing fail-closed validation. Radio
  conversion, initialized defaults, exact no-op precision, saved strength/cutoff discriminants,
  JSON export/reload, physical bounds, off/on chart position and Reference/Design views passed.
- Independent interpolation and bar-force sums still match actual worker poles. Imported KDS fibre
  and block hardening remain -5311654.06224225 N; EN remains -5486651.656026218 N. Plateau,
  auto-initialized, edited and physical-bound comparisons also passed, with no unexpected worker
  or page errors. No oracle or numerical tolerance was changed.
- Visual inspection confirmed Concrete notation, split-field states, both themes and minimum-width
  readability. Production build and bundle gates passed: initial JavaScript 344.1/375 KiB gzip.
  Diff whitespace check passed.

During development, the layout check caught a collision with an existing editor-grid class; the
material section now uses its own container class. The direct-strength browser edit initially raced
the shared precision draft on focus; explicitly awaiting focus and committed values resolved the
automation race. These failures were corrected before the final passing run.

At minimum sidebar width, the checkbox/radio header retains one line and supports bounded horizontal
scrolling. Both strength values remain visible in the input frame. Long names/reasons and tabulated
curve cells retain their existing text/table roles. No new skill role or dependency was introduced;
canonical/adapter checks passed through structure verification, and agent-CLI skill invocation
testing was not performed for this presentation-only slice.

Evidence: ignored `outputs/steel-hardening/material-inline-*.log`, `browser-evidence.json`, current
`*-concrete-inline.png`, `*-direct-inputs.png`, `*-unified-*`, `*-inline-minimum.png` and
`*-sidebar-minimum.png` captures. Source changes are limited to the material UI, shared field state,
workspace owner map and browser verification; no material schema, numerical kernel, resistance
factor, report/export format or engineering release state changed. Numerical benchmarks were not
required for Class 1. Calculations remain development/draft previews. No commit or deployment.

Verification status: presentation and regression gates passed.
