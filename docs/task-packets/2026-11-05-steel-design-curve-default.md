# Fixed Design steel curve preview

Status: implemented and presentation/regression checks passed; Preview.

- Objective: remove the Steel Curve stage combobox and always display the existing Design material
  curve, reducing one presentation-only choice.
- Change class: 1, presentation only. Material definitions, design basis, stage preparation,
  numerical results, project schema and reports retain their existing owners and behavior.
- Owners: development/09 workspace mapping; MaterialPanel supplies the explicit Design stage to
  SteelStressStrainCurve. @pm/design continues to prepare the material sets.
- Contract: there is no local curve-stage state or user-selectable Reference view in the Steel
  form. Existing curve evaluation, hardening edits, limits, units and invalid-input messages remain.
- Verification: existing material/hardening owner tests, structure/typecheck, full application tests,
  production build/bundle and the existing browser layout/hardening harnesses. UI checks confirm
  the selector is absent, the displayed yield strain comes from the Design material set, both
  themes and narrow layouts remain usable, and navigation preserves canonical inputs/surface.
- Exclusions: numerical laws/factors, parameter defaults, persistence changes, new styling roles,
  commits and pushes.

Evidence is stored under ignored `outputs/steel-design-curve/`:

- `npm-test.log`: structure, documentation/traceability, strict typecheck, 703 unit tests, 5 ADSEC
  cases, 11 CAD cases, project round-trip, independently recalculated workbooks and PDF checks pass.
- `build.log` / `bundle.log`: isolated production build and all existing bundle budgets pass;
  initial/Plotly/worker/Excel remain 352.7/1325.4/69.3/248.1 KiB gzip respectively.
- `layout.log` / `layout/`: 18 browser snapshots pass for KDS fibre, KDS block and EN at desktop,
  minimum sidebar and mobile widths in both themes. The selector is absent, the yield-strain
  readout matches the existing Design material compiler, and canonical inputs/surface are retained.
- `hardening.log` / `hardening/`: the existing hardening browser regression passes for both KDS
  mechanics and EN, including editable endpoints, invalid-input frames, physical bounds, theme/
  resize behavior and the unchanged independent tension-pole checks. The additional ACI/AS/Custom
  inline material-layout cases pass. There are no browser page errors.

The EN desktop light and mobile dark screenshots were inspected. No shared style, skill contract,
numerical coefficient/law, tolerance or baseline changed. This presentation change does not alter
project/report contracts or promote the engineering Preview status.
