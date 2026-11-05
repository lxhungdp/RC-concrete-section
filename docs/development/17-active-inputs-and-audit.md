# Active Input Inventory

Reviewed: 2026-11-05. Scope: current Stage 1 cross-section application, all seven calculation
profiles, both mechanics, Fixed/Adaptive modes, supported material models and input workbooks.
This is a consumer inventory, not new formula, standard, default or acceptance authority.
The [workspace input-composition contract](../../.agents/skills/workspace-style-design/references/design-standard.md#engineering-input-composition)
owns the current-consumer rule. AGENTS.md makes this review mandatory for subsequent input changes.

## Reviewed field groups

| Surface / owner | Inputs retained and current consumer | Activation / disposition |
|---|---|---|
| CalculationBasisToolbar | Code, method, concrete model and KDS resistance route resolve the project profile/DesignBasis | Registry-supported choices only; source/model is not an independent unchecked code identity |
| SectionDrawingClient | Boundary type/dimensions, coordinates, position/rotation, selection/locks and snapping configure or edit exact geometry | Shape-specific dimensions and Point/Basic modes; draft/Apply remains explicit |
| RebarPanel / RebarCatalogDialog | Diameter, As, material, coordinates; generator cover, spacing/count, outer, pattern and replacement; catalog filters and one-time fills | Diameter supports geometry/cover/drawing even with independent stored As; spacing/count and outer selectors are conditional |
| MaterialPanel concrete | fck identifies profile strength, applicability and code resistance/cap inputs; law strains, n, user-block factors and curve points feed material/domain compilation | Fibre law inputs only in fibre; published block parameters read-only; user block has one ultimate-strain editor |
| MaterialPanel concrete tension | User-curve zeroTension policy feeds the compiled tabulated law | Editable only for a user curve, using its effective policy; built-in parabolic laws always evaluate zero tensile stress |
| MaterialPanel concrete mc / Ec | No current resistance-law, domain, solver or UR consumer; mc only derives the unused KDS Ec property | Removed from panel and active report parameter lists; preserved in JSON and readonly workbook properties |
| MaterialPanel steel | fy, Es, model, yield evidence, signed physical bound, hardening endpoint/cutoff or curve points feed compiled laws, station domains and resistance classification | EN/AS panel Es is profile-supplied/read-only; yield is derived except the declared user-curve limit; hardening fields conditional |
| MaterialPanel resistance | Material coefficients, reinforcement class and axial-cap settings feed the selected DesignBasis | Material factors only for material-reevaluation routes; cap factor only while the cap is enabled; class remains active in phi classification |
| DesignBasisPanel | Active phi values, transition rule/grade policy, AS class or minimum-eccentricity parameters feed resistance/demand adjustment | Mutually exclusive resistance routes; AS omits inactive generic transition controls; a policy branch remains relevant across its supported grade/state domain |
| AnalysisOptionsPanel | Station criteria, seed directions/angles, refinement tolerances and resource budgets control sampling/convergence | Separate fibre/block owners; refinement fields only for Adaptive; explicit/uniform seeds conditional |
| AnalysisOptionsPanel mesh | Cell sizing, divisions, maxCells and maxSubdivision feed the integration mesh and typed exhaustion checks | Fibre only; automatic divisions vs fixed cell size are exclusive; no mesh inputs for block |
| LoadingsPanel / spreadsheet | Names and centroidal or declared-reference P/Mx/My feed demand checks and report identification | Only factored ULS actions; formulas remain transient authoring, Update commits validated numeric values |
| LoadReferencePanel | Offset, conversion choice and Apply feed explicit action translation | Draft preview vs committed reference preserved; offsets are not resistance geometry changes |
| DemandCheckPanel | Check basis selects the 3D Load Ray, fixed-neutral-axis 2D Load Ray or Constant P query | Worker, result presentation and exports consume the same declared choice |
| ResultsWorkspace / SectionResultsPanel | Angles, branches, slices, stages, visibility, field selections and primary chart configure actual drawings/data | Presentation consumers count as used; demand-fixed P is read-only; inactive opposite branch is disabled |
| AnalysisMeshWorkspace / EquivalentBlockGeometryWorkspace | Cell/triangle, quadrature, mesh/block visibility and selected state configure diagnostic drawings | Mechanics-specific; these controls do not create engineering inputs |
| Calculation/Data dialogs | Selected loadcase, point/row, stage, trace view and save choice select actual evidence | Data text is read-only; diagnostic choices do not change governing UR |
| ProjectInformationDialog | Project/client/company/designer/checker/address/date feed document identity and reports | Useful report metadata remains optional and separate from numerical inputs |
| ReportPanel | Selected combinations control worked pages and export | Unselected combinations remain checked under the report contract |
| DisplayUnitsPanel | Preset and length/force/moment/stress units configure presentation and declared workbook source units | Unused density selector removed; existing stored/source density-unit declaration remains for compatibility; canonical stored numbers do not change |
| Project XLSX / Project menu Open | Visible project, geometry, rebar, material, loading, Options, Resistance and source-unit fields have the same consumers above | Generated v1 uses dark-blue input text without fills/bold; native Save preserves authored formatting/formulas/helper sheets; identity/inactive compatibility data stay in readonly properties; derived yield uses the material compiler; integrated title-row Update consumes the nine project sheets' evaluated values atomically; no previous Excel reader |

## Dispositions from this review

- Remove mc/Ec authoring and active result-parameter presentation. Preserve stored JSON values in
  readonly workbook properties without a migration or replacement with defaults.
- Remove the ineffective tension checkbox from built-in parabolic laws. User-curve edits write the
  effective model policy and matching limit, so an existing explicit zeroTension cannot mask the edit.
- Remove the generic block ultimate-strain editor. Published blocks show resolved code values;
  the custom block retains its model-owned editor and synchronizes its limit.
- ACI has no KDS eta readout; its read-only ultimate strain comes from the existing ACI adapter
  constant, rather than a legacy material-limit property the block adapter ignores.
- Bind EC2 peak/ultimate strain editors to epsC2/epsCu2 and the matching limits together. Editing
  an unused limits.eps0 snapshot alone cannot control the EC2 stress curve.
- Show EN/AS steel Es read-only in the panel, where the existing authoring adapter immediately
  restores that profile value. Es remains a real solver/law/transition input and is not deleted.
- Hide the axial-cap factor editor when the cap is off; retain its saved factor for explicit
  reactivation. Reinforcement class remains applicable to resistance classification.
- Keep material ultimate bounds, stored As, code/grade policy fields, convergence budgets and
  required provenance. Zero sensitivity at a single load is not evidence that these are unused.
- Routine helper text follows the workspace standard: omit static instructions and already filled
  audit-reason editors. Missing required reasons remain editable; existing reasons are accessible
  through Options > Resistance > Details. Provenance is retained without showing generated prose
  as another routine input. See [the follow-up](../task-packets/2026-11-05-routine-form-text.md).

The [task packet](../task-packets/2026-11-05-active-inputs.md) records tests, numerical impact and
runtime evidence. Future feature changes must update this inventory with their actual consumer and
activation; a new persisted property alone does not justify a new editable control.
