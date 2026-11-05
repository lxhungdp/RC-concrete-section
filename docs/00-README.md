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
Section -> Materials -> Capacity -> Demand Check -> Report -> Options
```

Current UI note:

- `Capacity` owns the resistance surface: its sidebar carries the section-capacity summary,
  the sampling evidence, and every chart parameter, so the plot headers hold no controls.
- `Demand Check` owns loadcase entry and the governing check for the current simple `Pu/Mux/Muy`
  workflow. Capacity displays resistance geometry and its slices only; loadcase markers, load paths
  and utilization evidence belong to Demand Check.
- `Demand Check` also owns Load reference. Centroid-relative X/Y offset drafts preview only the
  LOAD axes. Apply commits them, with an unchecked Convert existing loadcases option.
  Only load input is translated; all numerical checks and Direct/Fixed-P/3D plots remain centroidal.
- A separate `Loadings` workspace is intentionally avoided until source-load management becomes
  large enough to justify it.
- `Options` is the last menu and separates its controls into `Points`, `Mesh`/`Block`, and
  `Resistance` tabs, plus a presentation-only `Units` tab. Points also owns direction sampling; Resistance applies valid
  edits immediately without a separate action button. These settings are not edited in either
  result workspace — the Capacity sidebar carries presentation state only. Demand Check additionally owns the explicit
  applied load-reference input described above.
- `Report` exports the preview PDF design report and the demand-check calculation
  workbook. One loadcase selection drives both — every combination is checked and plotted, and the
  selected ones are worked through in full. An accepted-result report workflow has not been
  implemented, so every PDF carries a `PREVIEW` watermark and states on every page that it is not an
  accepted design result.
- For stress-strain integration, the `Section mesh` toolbar exports the exact prepared analysis mesh as either an Excel audit
  workbook or a DXF drawing. Excel includes Summary, Triangles, Quadrature, Boundaries, and Rebars
  sheets; DXF uses broadly compatible R12 ASCII records and separates the same geometry into named
  verification layers.
- The selected-result Excel calculation workbook exists for both mechanics: a fibre ledger for
  stress-strain integration, and a block ledger (`Block_Clip` + `Block` in place of `Mesh` +
  `Concrete`) for the equivalent block. Equivalent-block projects show exact clipping in place of
  the Section-mesh view because they do not use a concrete integration mesh.

## 3. Current Implementation Status

Implementation map as of 2026-11-04 (Preview; no release approval):

- Geometry editor, material editor, rebar input, project JSON round trip, Results preview plots, and
  loadcase entry are implemented as **preview** capability.
- The material editor uses hierarchical `Code -> calculation method -> concrete model` selection.
  KDS offers both implemented mechanics, ACI offers its implemented block route, EN offers an
  explicitly limited stress-strain preview, and AS offers an equivalent-block preview.
  Legacy custom project IDs remain readable but `Custom` is not a design Code. A user-defined KDS
  concrete curve is recorded as a modified profile with an audit reason.
- The current Results charts use Plotly for interactive visualization, but the underlying
  calculation is still a preview kernel.
- Two independent calculation kernels are implemented: stress-strain integration and the
  code-equivalent rectangular stress block. Their formulas, defaults, fields, and forward/inverse
  workflows are defined in
  [`12-calculation-models-defaults-and-workflows.md`](12-calculation-models-defaults-and-workflows.md).
- Every stress-strain and equivalent-block profile uses the shared `unified-27-v2` schedule: two
  exact poles, six outside/on-section `c/D` states, and nineteen inside-section `εₛ/εy` states.
  Fixed uses 36 directions and no midpoint refinement. Independent Adaptive uses its own seed
  schedule and per-meridian station/direction refinement. The fibre route adds one explicit
  pure-tension midpoint with steel hardening On or Off; clipped geometry can
  add geometric vertices without adding physical strain stations.
- Nominal/reference and design-resistance surfaces are separated. Factored ULS loadcases use a
  default governing 3D proportional check. A project can select the fixed neutral-axis
  `direct2D` preview or the `constantAxial` query.
- The KDS 2024 current-set profiles (with resistance clauses explicitly traced to KDS 14 20 10:2021
  and KDS 14 20 20:2022) and ACI 318-19(22) block profile are implemented as `draft` design
  previews; no profile is approved for released engineering use. EN 1992-1-1:2004 is selectable only
  as a preview with no National Annex and an explicit strain-domain warning. AS 3600:2018 Amendments
  1 and 2 is also `draft`: it produces auditable results but is not verified for released design.
  Legacy `Custom` profiles are `user-defined`: they invent no normative value and claim none.
- The stress-strain Excel preview result export includes an explicit `Design_Check` audit sheet. The separate
  Section-mesh Excel export includes formula-based area and first-moment recomputation so the
  integration mesh can be independently inspected.
- Accepted engineering analysis, verified design-code profiles, certified result DTOs, and
  released PDF reports are not complete.
- Preview data cannot be promoted to accepted design output.
- The former cross-model `My` discrepancy is closed: both mechanics now use
  `My = +sum(F*(x-xc))`, matching the DTO, plots, reports, and workbook formulas. This correction
  does not promote preview calculations to accepted design output; the remaining release gates are
  tracked in
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
