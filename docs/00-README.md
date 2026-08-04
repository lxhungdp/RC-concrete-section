# P-M Column Designer - Instruction Index

Status: **development baseline, not design certification**.

This folder has one entry point and one authority map. Start here, then go only to the section that
matches your role.

## 1. Read This First

| Reader | Read | Purpose |
|---|---|---|
| Structural engineer | [`engineering/00-README.md`](engineering/00-README.md) | Engineering meaning, assumptions, formulas, standards, acceptance gates. |
| Software engineer | [`development/00-README.md`](development/00-README.md) | Packages, APIs, persistence, UI, tests, release workflow. |
| Any person changing formulas, mesh, standards, or result behavior | [`01-control-map.md`](01-control-map.md) | Single source of truth for where a rule or parameter is allowed to live. |

Do not treat the numbered root files as a third instruction set. They are detailed references
linked from the control map.

## 2. Product Workflow

```text
Geometry -> Materials -> Section Results -> Demand Check -> Analysis Options
```

Current UI note:

- `Section Results` owns the resistance surface: its sidebar carries the section-capacity summary,
  the sampling evidence, and every chart parameter, so the plot headers hold no controls.
- `Demand Check` owns loadcase entry and the governing check for the current simple `Pu/Mux/Muy`
  workflow. Selecting a combination anywhere — including a click on a demand marker in the Section
  Results 3D plot — moves to this menu.
- A separate `Loadings` workspace is intentionally avoided until source-load management becomes
  large enough to justify it.
- `Analysis Options` is the last menu and separates its controls into `Points`, `Mesh`, and
  `Design Resistance` tabs. Points also owns direction sampling; Design Resistance applies valid
  edits immediately without a separate action button. These settings are not edited in either
  results menu — the results sidebars carry presentation state only, never a value that changes a
  resultant.
- There is no top-level `Report` menu. Export commands are actions in the relevant preview
  workspace: `Demand Check` exports the PDF design report and the selected-result workbook. An
  accepted-result report workflow has not been implemented, so every PDF carries a `PREVIEW`
  watermark and states on every page that it is not an accepted design result.
- For stress-strain integration, the `Section mesh` toolbar exports the exact prepared analysis mesh as either an Excel audit
  workbook or a DXF drawing. Excel includes Summary, Triangles, Quadrature, Boundaries, and Rebars
  sheets; DXF uses broadly compatible R12 ASCII records and separates the same geometry into named
  verification layers.
- The selected-result Excel calculation workbook exists for both mechanics: a fibre ledger for
  stress-strain integration, and a block ledger (`Block_Clip` + `Block` in place of `Mesh` +
  `Concrete`) for the equivalent block. Equivalent-block projects show exact clipping in place of
  the Section-mesh view because they do not use a concrete integration mesh.

## 3. Current Implementation Status

As of 2026-08-04:

- Geometry editor, material editor, rebar input, project JSON round trip, Results preview plots, and
  loadcase entry are implemented as **preview** capability.
- The material editor uses one calculation-profile selector for KDS stress-strain integration, KDS
  equivalent block, ACI 318-19(22) equivalent block, or one of the two `Custom` profiles. It
  atomically updates mechanics, material defaults, resistance basis, and model-specific analysis
  options. A `Custom` profile additionally exposes the constitutive model itself: concrete law and
  its parameters, steel law, block `beta1`/`alpha`/`epsCu`, and the tension-controlled limit rule.
- The current Results charts use Plotly for interactive visualization, but the underlying
  calculation is still a preview kernel.
- Two independent calculation kernels are implemented: stress-strain integration and the
  code-equivalent rectangular stress block. Their formulas, defaults, fields, and forward/inverse
  workflows are defined in
  [`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md).
- Stress-strain production sampling uses 25 stations, including nine code-aware transition nodes,
  with 36 seed directions and adaptive angular refinement to a 0.5% target. Equivalent-block
  sampling retains its independent 37-state/24-seed-direction defaults, adds bar-controlled event
  stations, and adaptively refines both coordinates to a 0.75% target.
- Nominal/reference and design-resistance surfaces are separated. Factored ULS loadcases use a
  governing 3D proportional check; Fixed-P utilization is a secondary diagnostic.
- The KDS 2024 current-set profiles (with resistance clauses explicitly traced to KDS 14 20 10:2021
  and KDS 14 20 20:2022) and ACI 318-19(22) block profile are implemented as `draft` design
  previews; no profile is approved for released engineering use. The two `Custom` profiles are
  `user-defined`: they invent no normative value, and they claim none. EN material/design helpers remain
  lower-level preview capability and are not exposed as a complete calculation profile.
- The stress-strain Excel preview result export includes an explicit `Design_Check` audit sheet. The separate
  Section-mesh Excel export includes formula-based area and first-moment recomputation so the
  integration mesh can be independently inspected.
- Accepted engineering analysis, verified design-code profiles, certified result DTOs, and
  released PDF reports are not complete.
- Preview data cannot be promoted to accepted design output.
- One cross-model implementation discrepancy remains an explicit release blocker: stress-strain
  uses `My = +sum(F*x)`, equivalent-block uses `My = -sum(F*x)`, and the v1 project DTO/bridge/UI do
  not define or apply a conversion. All current persisted calculation contracts are v1; parser
  defaults are v1 behavior, not migration or backward compatibility. See
  [`development/06-current-state-and-roadmap.md`](development/06-current-state-and-roadmap.md).

The detailed status and roadmap live in
[`development/06-current-state-and-roadmap.md`](development/06-current-state-and-roadmap.md).
The implemented resistance pipeline is documented in
[`development/07-design-resistance-implementation.md`](development/07-design-resistance-implementation.md).

## 4. Status Vocabulary

| Status | Meaning |
|---|---|
| `implemented` | Code exists and can be exercised; engineering correctness is not implied. |
| `preview` | Useful for editing or visualization; prohibited from design acceptance/report release. |
| `reviewed` | Requirements or implementation have received named discipline review. |
| `verified` | Requirement traceability and prescribed verification evidence pass for a declared scope/version. |
| `user-defined` | Values were declared by the project, not derived from a published clause. It is outside the review ladder, not a step on it, and can never be promoted by editing. |
| `acceptedResult` | One run passed input, adapter, convergence, topology, and uncertainty gates. |
| `releasedReport` | A report was generated from an immutable accepted result and carries provenance/hash. |

Do not use `certified`, `code compliant`, `exact`, or `validated` unless the corresponding approval
process and evidence are complete.

## 5. Authority Order

When two documents conflict, resolve in this order:

1. governing law, adopted design standard, project design basis, and approved interpretation;
2. verified design-code profile with clause traceability;
3. [`01-control-map.md`](01-control-map.md);
4. [`engineering/`](engineering/00-README.md);
5. [`development/`](development/00-README.md);
6. numbered detailed references in this folder;
7. tests, examples, spreadsheets, and source code;
8. UI labels and screenshots.

Existing Excel workbooks are regression oracles and examples, not automatic authority. If code and
engineering instructions conflict, stop the affected result path and resolve the rule at the higher
authority level.

## 6. Change Rule

Any result-affecting change must update the same authority path in one change set:

- engineering rule or formula authority;
- development/package/API contract;
- options/defaults or parameter registry;
- tests and verification evidence;
- schema/provenance/report impact when applicable.

Do not duplicate a formula, tolerance, mesh size, standard factor, or UI workflow in a second place.
If a topic appears to need two owners, update [`01-control-map.md`](01-control-map.md) first.
