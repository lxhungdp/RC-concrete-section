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
Geometry -> Materials -> Results -> Analysis Options
```

Current UI note:

- `Results` owns loadcase entry in its sidebar for the current simple `Pu/Mux/Muy` workflow.
- A separate `Loadings` workspace is intentionally avoided until source-load management becomes
  large enough to justify it.
- `Analysis Options` is the fourth menu and separates its controls into `Points`, `Mesh`, and
  `Design Resistance` tabs. Points also owns direction sampling; Design Resistance applies valid
  edits immediately without a separate action button. These settings are not edited in `Results`.
- There is no top-level `Report` menu. Export commands are actions in the relevant preview
  workspace; an accepted-result report workflow has not been implemented.
- For stress-strain integration, the `Section mesh` toolbar exports the exact prepared analysis mesh as either an Excel audit
  workbook or a DXF drawing. Excel includes Summary, Triangles, Quadrature, Boundaries, and Rebars
  sheets; DXF uses broadly compatible R12 ASCII records and separates the same geometry into named
  verification layers.
- The selected-result Excel calculation workbook is available only for stress-strain integration.
  Equivalent-block export is blocked with an explicit message until a dedicated block-ledger
  workbook is implemented. Equivalent-block projects also show exact clipping in place of the
  Section-mesh view because they do not use a concrete integration mesh.

## 3. Current Implementation Status

As of 2026-08-04:

- Geometry editor, material editor, rebar input, project JSON round trip, Results preview plots, and
  loadcase entry are implemented as **preview** capability.
- The material editor uses one calculation-profile selector for KDS stress-strain integration, KDS
  equivalent block, or ACI 318-19(22) equivalent block. It atomically updates mechanics, material
  defaults, resistance basis, and model-specific analysis options.
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
  previews; no profile is approved for released engineering use. EN material/design helpers remain
  lower-level preview capability and are not exposed as a complete calculation profile.
- The stress-strain Excel preview result export includes an explicit `Design_Check` audit sheet. The separate
  Section-mesh Excel export includes formula-based area and first-moment recomputation so the
  integration mesh can be independently inspected.
- Accepted engineering analysis, verified design-code profiles, certified result DTOs, and
  released PDF reports are not complete.
- Preview data cannot be promoted to accepted design output.
- Two implementation/documentation discrepancies remain explicit release blockers: the standalone
  block kernel uses the opposite local `My` sign from the project convention and its bridge has no
  sign map yet; the schema-v1 parser has limited omitted-field/default repair behavior even though
  no version migration is allowed. See
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
