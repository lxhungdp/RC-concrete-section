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
Geometry -> Materials -> Results -> Report
```

Current UI note:

- `Results` owns loadcase entry in its sidebar for the current simple `Pu/Mux/Muy` workflow.
- A separate `Loadings` workspace is intentionally avoided until source-load management becomes
  large enough to justify it.
- `Analysis` is a pipeline behind Results, not a top-level menu.
- `Report` remains downstream of an accepted result and is not implemented in the current preview.

## 3. Current Implementation Status

As of 2026-07-24:

- Geometry editor, material editor, rebar input, project JSON round trip, Results preview plots, and
  loadcase entry are implemented as **preview** capability.
- The material editor now uses one source/standard selector for KDS, ACI 318, EN 1992-1-1 (EC2),
  and Custom. The project file preserves the full material law, limits, and partial-factor fields;
  the selector is not a complete design-code resistance profile.
- The current Results charts use Plotly for interactive visualization, but the underlying
  calculation is still a preview kernel.
- Accepted engineering analysis, verified design-code profiles, certified result DTOs, and
  Excel/PDF report release are not complete.
- Preview data cannot be promoted to accepted design output.

The detailed status and roadmap live in
[`development/06-current-state-and-roadmap.md`](development/06-current-state-and-roadmap.md).

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
