# Steel curve position and tensile presentation

Objective: remove the Steel strain-view selector, retain tensile magnitude presentation, and keep
the curve above the conditional hardening inputs. Place yield strain (epsilon_y, clarified by the
user) beside the Stress–strain heading. The checkbox reveals the existing initialized inputs and
their edits update the same compiled material-law preview.

Class 1 presentation change. Owners: MaterialPanel, SteelHardeningFields, shared material layout
CSS, and the workspace implementation map. Authorities: docs/00-README.md, docs/01-control-map.md,
docs/development/09-workspace-design-system.md and the canonical workspace-style-design skill.

Keep fy/Es in a fixed two-column row. Place optional physical-strain input, legacy-law inputs,
resistance factors and imported-curve editing below the chart so hardening expansion cannot move
the chart. Retain Reference/Design material selection after the figure. Preserve the raw yield-strain
field's existing read-only rule and imported-user-curve edit behavior. Preserve all material-law,
validation, physical-bound, factor, persistence, export and numerical-analysis contracts.

Verification plan: extend the existing browser checks to require no Strain view option, positive
tensile projection coordinates, yield strain beside the heading, unchanged chart position/dimensions
across Off/On, and hardening inputs beneath the chart. Retain both-theme style parity with Concrete,
minimum-sidebar, stage, valid/invalid input, initialization, precision, saved-data, physical-bound
and independent worker-capacity checks. Run full npm test, production build, bundle gate and diff
whitespace check. No numerical model change or new engineering authority/default is introduced.

## Delivered evidence — 2026-11-03

The Steel figure now has one tensile-magnitude view. Yield strain appears beside the heading with
sufficient field width at the 260 px minimum sidebar. The chart precedes all conditional inputs;
Reference/Design material selection follows it, then the borderless checkbox and its existing
hardening fields. The previous automatic initialization, linked values, notation, physical-bound
controls and invalid-input diagnostic remain available.

Passed:

- Full `npm test`: structure, TypeScript, 460 unit tests, 5 AdSec tests, 11 CAD tests, project and
  metric/US workbook round trips, independent Excel recalculation, demand and PDF integrations.
- Final Edge browser checks for KDS stress-strain, KDS equivalent block and EN stress-strain:
  no Strain view selector; positive tensile-axis projections; yield strain in the heading and
  readable at minimum width; identical chart position and dimensions across Off/On at normal and
  minimum widths; checkbox and fields beneath the chart. Both-theme Concrete style parity,
  default initialization, edited input updates, precise no-op edits, actual JSON export/reload,
  invalid drafts, physical bounds and Reference/Design material views passed.
- Independent interpolation and bar-force sums still match the actual worker tensile poles:
  KDS fibre/block imported hardening -5311654.06224225 N; EN imported hardening
  -5486651.656026218 N. Existing plateau, auto-initialized, edited and physical-bound oracle
  comparisons also passed. No unexpected worker errors or page errors occurred.
- Visual inspection of normal light/dark and minimum-width captures confirmed layout and readable
  yield strain. Production build and all bundle gates passed; initial JavaScript is 344.1/375 KiB
  gzip. Diff whitespace check passed.

Evidence: ignored `outputs/steel-hardening/curve-layout-*.log`, `browser-evidence.json`, current
`*-unified-*`, `*-auto-on.png`, `*-design-tension-*` and `*-sidebar-minimum.png` captures. Browser
coverage was repeated after correcting the narrow yield field; no oracle or tolerance was changed.
The structure check validates canonical skill/adapter parity. Skill sources were not changed;
agent-CLI skill invocation testing was not performed in this presentation-only slice.

Verification status: presentation and regression gates passed. There is no material/schema,
resistance-factor, report/export, dependency or numerical-result change. No numerical benchmark
was required for this Class 1 change. All calculation routes remain development/draft previews;
independent engineering acceptance and release status are unchanged. No commit or deployment.
