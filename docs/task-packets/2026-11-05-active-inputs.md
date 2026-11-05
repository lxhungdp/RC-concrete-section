# Active input audit and material authoring cleanup

Status: implemented; local software gates pass. Class 2 presentation cleanup plus Class 3 correction of material
authoring bindings; existing stored definitions and numerical evaluators remain unchanged.

Objective: remove mc/Ec entry and audit every current input surface; retain only fields with a
current calculation, geometry-authoring, presentation/export or required identity consumer.
Record the rule in AGENTS.md and the canonical workspace standard for subsequent work.

Requirements: ENG-MAT-001/002/003 (valid coherent definitions and evaluated law), ENG-AN-003
(unchanged stored-input resistance/query results), canonical/legacy persistence in development/02,
and the workspace standard's input dependency review. The full consumer inventory is in
[development/17](../development/17-active-inputs-and-audit.md).

Allowed owners: workspace authoring policy, MaterialPanel and DisplayUnitsPanel, project workbook visibility, active
report material summaries, focused tests, AGENTS.md, canonical workspace skill/Claude adapter and
owning development docs. No kernel, standard formula/coefficient, parser/schema, tolerance,
regression baseline, dependency or accepted-result/released-report policy changes.

Contracts: no input mutation on opening/hiding a control; mc/Ec survive existing project/workbook
round trips as compatibility data. No tension toggle for built-in zero-tension laws. User-curve
policy edits must reach the compiled law. Peak/ultimate strain edits must update the actual law
and declared boundary together. Published blocks are read-only; user block has one editor.
EN/AS panel Es is read-only. Necessary names/report identity and independent bounds remain editable.

Blocking failures: lost saved fields, changed default surface/UR/ledger values, unsupported model
mixing, silently ignored edits, orphan controls, altered numerical limits or failed validation.
Do not update an oracle or loosen an acceptance threshold to make this task pass.

Oracles: rendered-control matrix for all profiles/models and Fixed/Adaptive; analytical parabolic
stress/tangent and explicit tabulated interpolation after authoring edits; exact canonical XLSX
round trips including retained hidden properties; existing numerical fingerprints/structural
matrices. Review is code/solution/presentation verification, not design-code certification.

Gates: structure, docs, traceability, typecheck, focused material/workbook tests, npm test, build,
bundle, reference-runtime fingerprint, relevant strain/block/pipeline matrices, both-theme browser
inspection and skill parity/validator checks. Record any unavailable skill CLI/browser gate rather
than claim it ran. Implementation author is Codex; independent engineering/release approval is open.

## Implemented dispositions

The inventory covers 21 field groups across the current application and input workbook surfaces.
Concrete mc/Ec editors are removed, including their unused density-unit selector and active report/
calculation-workbook parameter rows. Original JSON properties and hidden input-workbook rows remain
exact; no migration or canonical reserialization change is introduced.

Built-in parabolic tension toggles are removed. A tabulated law edits its actual zeroTension flag
and matching limit. EC2 peak/ultimate edits now write epsC2/epsCu2 and their matching limits together;
the chart immediately changes through the existing compiler. KDS and user-block strain bindings
retain their existing meaning through that same authoring helper. Published block profiles have no
generic editable strain snapshot; ACI shows its existing adapter strain and no KDS eta readout.
EN/AS panel Es is read-only; disabled caps hide the unused factor editor without deleting its value.
No material definition is rewritten merely by opening or rendering a form.

AGENTS.md and the canonical workspace standard require a traced current consumer for every future
editable field. The skill and thin Claude adapter both point to that rule/inventory. The owning
geometry/material, persistence and units docs reflect the current authoring surface; ENG-MAT-002
traceability includes the new authoring tests. Report identity, independent limits, stored As,
active resistance policies, sampling/resource budgets and actual view/export choices are retained.

## Verification evidence

- Focused material authoring and project XLSX tests: 16 pass. Independent oracles include the
  quadratic half-peak stress/tangent, declared compression cutoff and signed linear interpolation.
  Invalid drafts remain rejected. Deliberately non-default mc/Ec survive metric and US round trips
  exactly while their rows stay hidden; steel Es remains visible and usable.
- `npm test`: pass on the final application code: structure/docs/traceability/typecheck, 712 unit
  tests, five ADSEC parser tests, 11 CAD tests, canonical/legacy project round trips, independently
  recalculated stress-strain/block/demand workbooks and PDF report checks.
- Separate server rendering of the actual panels: all seven profiles, KDS/EN user curves, both
  mechanics in Fixed/Adaptive and the four visible unit groups pass. Checks cover absence of mc/Ec,
  correct tension/strain/cap activation, one user-block strain editor and no mutation on render.
  This is component rendering, not browser interaction coverage for the legacy-only Custom profiles.
- `npm run bench:verify`: pass with Node 24.20.0/npm 11.19.0 on Windows x64; eight sections × 24
  capacity quantities bit-identical to the unmodified reference. `bench:strain-sampling`,
  `bench:equivalent-block` and `bench:pipelines` pass with their original limits. No numerical
  reference, comparison policy, tolerance, solver or code adapter is changed.
- `npm run build`: pass with isolated `PM_NEXT_DIST_DIR=dist/active-inputs-next`.
  `npm run check:web-bundle`: pass; initial/Plotly/worker/Excel gzip sizes are
  352.8/1325.4/69.2/248.1 KiB, inside unchanged budgets.
- Chrome localhost:3001: populated KDS concrete/user curve/block, EN strain edits and read-only Es,
  ACI block readouts, AS block/read-only Es, cap off/on, Fixed/Adaptive and Units checked. An EN
  peak/ultimate edit changes the evaluated SVG path. Section/Rebar, Materials, Capacity, Demand
  Check, Report, Options and project information are inspected across light/dark themes. A 520×820
  viewport checks narrow material layout; the override is reset. Existing CAD colours are unchanged.
  Transient dev compilation/CDP timing failures are resolved using fresh UI state; no browser
  calculation result is claimed as an independent engineering oracle.
- Canonical and Claude-adapter platform validation: pass with Python UTF-8 mode; repository parity
  check passes. Installed Codex CLI explicit `$workspace-style-design` and description-triggered
  read-only discovery both read the standard/inventory and identify the current-consumer rule.
  Claude CLI is not installed, so its runtime invocation is unavailable; adapter schema/parity
  checks do not claim Claude runtime verification.

This change corrects future authoring and presentation, with identical numerical results for
unchanged stored definitions. No dependency, schema, factor, strain-domain algorithm, UR or
uncertainty policy changes. Existing Preview/draft status, compact Fixed hardening uncertainty and
independent structural/software/release gates remain unchanged. No commit/push is performed.
