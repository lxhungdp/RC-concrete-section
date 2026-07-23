# P-M Column Designer — Documentation Control Center

Status: **documentation baseline for development**. It is not a design-code certification and it
does not make the current application suitable for production design.

This repository has two independent instruction sets. They deliberately answer different
questions and must not be merged into one document.

| Instruction set | Primary reader | Governing question |
|---|---|---|
| [`engineering/`](engineering/00-README.md) | Structural engineer, checker, approver | What does P-M calculate, under which assumptions, standards, conventions, limits, and acceptance rules? |
| [`development/`](development/00-README.md) | Software engineer and coding AI | How is that intent implemented as versioned packages, pipelines, APIs, tests, UI modules, results, and reports? |

A structural engineer can control the engineering behavior by reading only the first group. A
software engineer must read the engineering group first, then the development group. Programming
instructions may explain implementation, but may not create or alter engineering truth.

## 1. Product workflow

```text
Geometry -> Materials -> Loadings -> Analysis -> Results -> Report
```

The application menu is organized as:

1. **Geometry** — concrete regions, holes, reinforcement, coordinate system, and section
   properties.
2. **Materials** — serializable concrete and reinforcement definitions plus their source and
   verification status.
3. **Loadings** — load cases/combinations and design-action basis.
4. **Results** — capacity domain, per-combination checks, convergence, diagnostics, and plots.
5. **Report** — controlled Excel or PDF output built only from an accepted result package.

`Analysis` is a pipeline between menus, not necessarily a top-level menu. `Results` and `Report`
remain disabled until their prerequisites and quality gates pass.

## 2. Current implementation status

As of 2026-07-23:

- `Geometry` has an interactive editor, boolean composition, an applied-section boundary, rebar
  input, and project JSON round-trip.
- `Materials` has concrete/steel editors, serializable definitions, preview stress-strain curves,
  compilation helpers, and project JSON round-trip.
- `Loadings` has a persisted data contract but the UI is still a placeholder.
- the engineering analysis kernel, accepted Results workflow, and Excel/PDF Report workflow are not
  implemented.
- the repository therefore produces **input/previews only**, not verified design results.

The evidence and known gaps are maintained in
[`development/06-current-state-and-roadmap.md`](development/06-current-state-and-roadmap.md).

## 3. Status vocabulary

Use these words consistently in code, UI, issues, results, and documentation:

| Status | Meaning |
|---|---|
| `implemented` | Code exists and can be exercised; engineering correctness is not implied. |
| `preview` | Useful for editing or visualization but prohibited from design acceptance/report release. |
| `reviewed` | Requirements and implementation have received the named discipline review. |
| `verified` | Requirement traceability and prescribed verification evidence pass for the declared scope/version. |
| `acceptedResult` | One run passed input, adapter, convergence, topology, and uncertainty gates. |
| `releasedReport` | A report was generated from an immutable accepted result and carries its provenance/hash. |

Do not use `certified`, `code compliant`, `exact`, or `validated` unless the corresponding approval
process and evidence are explicitly defined and complete.

## 4. Authority and conflict resolution

From highest to lowest authority:

1. governing law, adopted design standard, project design basis, and approved interpretations;
2. verified design-code profile with clause-level traceability;
3. the [`engineering/`](engineering/00-README.md) instruction set;
4. the [`development/`](development/00-README.md) instruction set;
5. detailed numbered technical references in this directory;
6. architecture decision records, tests, examples, spreadsheets, and current source code;
7. UI labels and screenshots.

Existing code and Excel workbooks are evidence or regression oracles, not automatic engineering
authority. If implementation and engineering instructions conflict, stop the affected result path,
record the conflict, and resolve it at the higher level. Never edit an engineering rule only to make
an existing snapshot pass.

## 5. Detailed technical references

The numbered files retain the detailed mathematical and quality specification. They are supporting
references, not a third instruction group:

1. [`01-data-model-and-materials.md`](01-data-model-and-materials.md)
2. [`02-meshing-2d.md`](02-meshing-2d.md)
3. [`03-forward-analysis-and-jacobian.md`](03-forward-analysis-and-jacobian.md)
4. [`04-initial-guess-feasibility-newton.md`](04-initial-guess-feasibility-newton.md)
5. [`05-pm-diagram-19points-angles-plotting.md`](05-pm-diagram-19points-angles-plotting.md)
6. [`06-mesh-sizing-and-convergence.md`](06-mesh-sizing-and-convergence.md)
7. [`07-integration-edge-cases-and-qa.md`](07-integration-edge-cases-and-qa.md)
8. [`08-software-architecture-and-api.md`](08-software-architecture-and-api.md)
9. [`09-verification-validation-and-release.md`](09-verification-validation-and-release.md)
10. [`10-normative-references-and-change-control.md`](10-normative-references-and-change-control.md)
11. [`11-design-standards-and-resistance-formats.md`](11-design-standards-and-resistance-formats.md)

Files `01` and `02` describe the **normalized analysis model**. The currently persisted editor model
is `GeometryInput` with `outers[]`; the development instructions define the mandatory adapter
between them. File `11` remains the detailed authority for nominal-to-design resistance sequencing,
subject to a verified governing-code profile.

## 6. Documentation change rule

Every change that can affect calculated results must update, in the same change set:

- the applicable engineering requirement;
- the development/package contract;
- verification tests and evidence owner;
- schema, migration, provenance, and report impact;
- an architecture/engineering decision record when the decision is not already closed.

Documentation links and examples must be checked before merge. A broken or contradictory
instruction blocks the affected implementation just as a failing test does.
